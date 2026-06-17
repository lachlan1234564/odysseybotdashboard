import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  REST
} from "discord.js";
import {
  getGuildSettings,
  getVerificationSettings
} from "../database/index.js";
import { loadDiscordConfig } from "../shared/config.js";
import { safeErrorSummary } from "../shared/logging.js";
import { runVerificationSetup } from "../shared/verification-gate.js";
import { asColor } from "./utils.js";
import {
  deferCommandReply,
  replyEphemeral,
  replyToCommand
} from "./interactions.js";

const config = loadDiscordConfig();

function hasSetupPermission(interaction: ChatInputCommandInteraction): boolean {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
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

  if (!config.VERIFY_PUBLIC_BASE_URL) {
    await replyToCommand(
      interaction,
      "Verification setup needs VERIFY_PUBLIC_BASE_URL. Configure the public Cloudflare verification hostname first."
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
      publicBaseUrl: config.VERIFY_PUBLIC_BASE_URL,
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
