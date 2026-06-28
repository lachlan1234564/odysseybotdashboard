import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits,
  REST
} from "discord.js";
import {
  createVerificationRecord,
  getGuildSettings,
  getRuntimeAppConfig,
  getVerificationSettings
} from "../database/index.js";
import { safeErrorSummary } from "../shared/logging.js";
import { shouldAutoKickUnverified } from "../shared/verification-plan.js";
import { runVerificationSetup, sendVerificationEventLog } from "../shared/verification-gate.js";
import { asColor } from "./utils.js";
import {
  deferCommandReply,
  replyEphemeral,
  replyToCommand
} from "./interactions.js";

function hasSetupPermission(interaction: ChatInputCommandInteraction): boolean {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

function memberHasTrustedAccess(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator)
    || member.permissions.has(PermissionFlagsBits.ManageGuild);
}

export async function processVerificationAutoKicks(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    const [settings, guildSettings] = await Promise.all([
      getVerificationSettings(guild.id),
      getGuildSettings(guild.id)
    ]);
    if (!settings.enabled || !settings.autoKickUnverified || !settings.verifiedRoleId) continue;

    const botMember = await guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions.has(PermissionFlagsBits.KickMembers)) {
      await sendVerificationEventLog(
        client.rest as unknown as REST,
        settings,
        "Verification auto-kick skipped",
        "Auto-kick is enabled, but CorePanel is missing Kick Members."
      );
      continue;
    }

    const members = await guild.members.fetch().catch((error) => {
      console.warn(`[verification] Could not fetch members for auto-kick in guild ${guild.id}: ${safeErrorSummary(error)}`);
      return null;
    });
    if (!members) continue;

    const trustedRoleIds = [...guildSettings.adminRoleIds, ...guildSettings.staffRoleIds];
    for (const member of members.values()) {
      const decision = shouldAutoKickUnverified({
        enabled: settings.enabled,
        autoKickUnverified: settings.autoKickUnverified,
        autoKickAfterHours: settings.autoKickAfterHours,
        verifiedRoleId: settings.verifiedRoleId,
        joinedAt: member.joinedAt?.toISOString() ?? null,
        memberRoleIds: member.roles.cache.map((role) => role.id),
        trustedRoleIds,
        isBot: member.user.bot,
        hasAdminPermission: memberHasTrustedAccess(member)
      });
      if (!decision.kick) continue;

      const expiresAt = new Date(Date.now() + settings.recordRetentionHours * 3_600_000).toISOString();
      await createVerificationRecord({
        guildId: guild.id,
        userId: member.id,
        status: "denied",
        reasonCodes: ["auto_kick_unverified"],
        riskScore: 100,
        accountCreatedAt: member.user.createdAt.toISOString(),
        serverJoinedAt: member.joinedAt?.toISOString() ?? null,
        vpnDetected: null,
        expiresAt,
        reviewedBy: "auto-kick",
        reviewedAt: new Date().toISOString(),
        staffNote: `Auto-kicked after ${Math.round(decision.pendingHours)} hours without verification.`
      });
      try {
        await member.kick(`Verification auto-kick: not verified within ${settings.autoKickAfterHours} hour(s).`);
        await sendVerificationEventLog(
          client.rest as unknown as REST,
          settings,
          "Verification auto-kick triggered",
          `<@${member.id}> was removed after ${Math.round(decision.pendingHours)} hours without verification.`,
          [
            { name: "Configured window", value: `${settings.autoKickAfterHours} hour(s)`, inline: true },
            { name: "User ID", value: member.id, inline: true }
          ]
        );
      } catch (error) {
        console.warn(`[verification] Auto-kick failed in guild ${guild.id} for user ${member.id}: ${safeErrorSummary(error)}`);
        await sendVerificationEventLog(
          client.rest as unknown as REST,
          settings,
          "Verification auto-kick failed",
          `<@${member.id}> should have been removed, but Discord rejected the kick.`,
          [{ name: "Action required", value: "Check Kick Members and bot role hierarchy." }]
        );
      }
    }
  }
}

export async function handleVerificationCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild) {
    await replyEphemeral(interaction, "This command only works in a Discord server.");
    return;
  }
  await deferCommandReply(interaction);
  if (!hasSetupPermission(interaction)) {
    await replyToCommand(
      interaction,
      "You need Administrator or Manage Server to configure verification."
    );
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const settings = await getVerificationSettings(interaction.guild.id);
  if (subcommand === "status") {
    const embed = new EmbedBuilder()
      .setColor(asColor(settings.embedColor))
      .setTitle("Verification gate status")
      .addFields(
        { name: "Enabled", value: settings.enabled ? "Yes" : "No", inline: true },
        {
          name: "Verified role",
          value: settings.verifiedRoleId ? `<@&${settings.verifiedRoleId}>` : "Not configured",
          inline: true
        },
        {
          name: "Verification channel",
          value: settings.verificationChannelId
            ? `<#${settings.verificationChannelId}>`
            : `Will create #${settings.verificationChannelName}`,
          inline: true
        },
        {
          name: "Permissions applied",
          value: settings.permissionsApplied ? "Yes" : "No",
          inline: true
        },
        {
          name: "Last setup",
          value: settings.lastSetupAt
            ? `<t:${Math.floor(new Date(settings.lastSetupAt).getTime() / 1000)}:R>`
            : "Never",
          inline: true
        },
        {
          name: "Public areas",
          value: `${settings.publicCategoryIds.length} categories, ${settings.publicChannelIds.length} channels`,
          inline: true
        }
      )
      .setFooter({ text: "Use Security → Verification in the dashboard to edit these settings." })
      .setTimestamp();
    await replyToCommand(interaction, { embeds: [embed] });
    return;
  }

  const runtimeConfig = await getRuntimeAppConfig();
  if (!runtimeConfig.verifyPublicBaseUrl) {
    await replyToCommand(
      interaction,
      "Verification setup needs a public verification URL. Configure it in the dashboard setup flow or Railway variables first."
    );
    return;
  }

  try {
    const guildSettings = await getGuildSettings(interaction.guild.id);
    const result = await runVerificationSetup({
      rest: interaction.client.rest as unknown as REST,
      guildId: interaction.guild.id,
      botUserId: interaction.client.user.id,
      settings,
      trustedRoleIds: [...guildSettings.adminRoleIds, ...guildSettings.staffRoleIds],
      publicBaseUrl: runtimeConfig.verifyPublicBaseUrl,
      updatedBy: interaction.user.id
    });
    const embed = new EmbedBuilder()
      .setColor(result.permissionsFailed ? 0xD2A35F : 0x65B888)
      .setTitle("Verification setup complete")
      .setDescription(
        result.permissionsFailed
          ? "The verification gate was updated, but some channel overwrites failed."
          : "The verification gate is ready for members."
      )
      .addFields(
        {
          name: "Verification channel",
          value: result.verificationChannelId
            ? `<#${result.verificationChannelId}>`
            : "Unavailable",
          inline: true
        },
        {
          name: "Channel",
          value: result.channelCreated ? "Created" : "Reused",
          inline: true
        },
        {
          name: "Embed",
          value: result.embedPosted ? "Posted" : result.embedUpdated ? "Updated" : "Unchanged",
          inline: true
        },
        {
          name: "Permission overwrites",
          value: `${result.permissionsApplied} applied\n${result.permissionsFailed} failed`,
          inline: true
        },
        {
          name: "Unverified visibility",
          value: `${result.visibleChannelIds.length} public\n${result.hiddenChannelIds.length} hidden`,
          inline: true
        },
        {
          name: "Public verification URL",
          value: `[Open verification page](${result.verificationUrl})`,
          inline: false
        }
      )
      .setFooter({ text: `Setup requested by ${interaction.user.username}` })
      .setTimestamp();
    if (result.failures.length) {
      embed.addFields({
        name: "Needs attention",
        value: result.failures
          .slice(0, 5)
          .map((failure) => `<#${failure.channelId}>: ${failure.message}`)
          .join("\n")
          .slice(0, 1024)
      });
    }
    await replyToCommand(interaction, {
      embeds: [embed],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    await replyToCommand(
      interaction,
      error instanceof Error
        ? error.message
        : `Verification setup failed: ${safeErrorSummary(error)}`
    );
  }
}
