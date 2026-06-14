import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits
} from "discord.js";
import {
  getAutoModSettings,
  getGuildSettings,
  getSocialPromotionSettings,
  getWelcomeSettings,
  getAntiRaidSettings,
  getAntiNukeSettings,
  listCustomCommands,
  listWarnings
} from "../database/index.js";
import type { AutoModSettings } from "../shared/types.js";
import { renderEmbedMessage } from "./messages.js";
import { emptyEmbedConfig } from "../shared/types.js";
import { buildDiscordPlaceholders } from "./placeholders.js";
import { requireBotAdmin } from "./utils.js";
import { friendlyDiscordError, logDiscordError } from "../shared/logging.js";

export async function handleServerInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
    return;
  }

  const guild = interaction.guild;
  await guild.members.fetchMe();

  const [settings, welcome, antiRaid, antiNuke] = await Promise.all([
    getGuildSettings(guild.id),
    getWelcomeSettings(guild.id),
    getAntiRaidSettings(guild.id),
    getAntiNukeSettings(guild.id)
  ]);

  const memberCount = guild.memberCount;
  const owner = await guild.fetchOwner();
  const customCommands = await listCustomCommands(guild.id);

  const features: string[] = [];
  if (welcome.enabled) features.push("Welcome messages");
  if (welcome.goodbyeEnabled) features.push("Goodbye messages");
  if (antiRaid.enabled) features.push("Anti-raid");
  if (antiNuke.enabled) features.push("Anti-nuke");
  if (customCommands.length > 0) features.push(`${customCommands.length} custom commands`);
  if (settings.modLogChannelId) features.push("Mod log configured");

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${guild.name}`)
    .setThumbnail(guild.iconURL() ?? null)
    .addFields(
      { name: "Server ID", value: guild.id, inline: true },
      { name: "Owner", value: `${owner.user.username}`, inline: true },
      { name: "Member count", value: String(memberCount), inline: true },
      { name: "Created", value: guild.createdAt.toLocaleDateString(), inline: true },
      { name: "Boosts", value: `${guild.premiumSubscriptionCount ?? 0} (Level ${guild.premiumTier})`, inline: true },
      { name: "Active features", value: features.length ? features.join(", ") : "No features configured yet. Use the dashboard to set up tickets, automod, and more.", inline: false }
    )
    .setFooter({ text: "Odyssey Bot server overview" });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handleUserInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.options.getMember("member") as GuildMember | null;
  if (!member || !("user" in member)) {
    await interaction.reply({ content: "That member could not be found in this server.", ephemeral: true });
    return;
  }

  const user = member.user;
  const warnings = await listWarnings(interaction.guildId!, user.id);

  const roleNames = [...member.roles.cache.values()]
    .filter((role) => role.id !== interaction.guildId)
    .sort((a, b) => b.position - a.position)
    .map((role) => role.name)
    .join(", ") || "No roles";

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: "User ID", value: user.id, inline: true },
      { name: "Account created", value: user.createdAt.toLocaleDateString(), inline: true },
      { name: "Joined server", value: member.joinedAt ? member.joinedAt.toLocaleDateString() : "Unknown", inline: true },
      { name: "Account age", value: `${Math.floor((Date.now() - user.createdTimestamp) / 86_400_000)} days`, inline: true },
      { name: "Warnings", value: warnings.length ? `${warnings.length} warning(s)` : "No warnings", inline: true },
      { name: "Roles", value: roleNames, inline: false }
    )
    .setFooter({ text: "Odyssey Bot user info" });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handleAutomodStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
    return;
  }
  if (!(await requireBotAdmin(interaction))) return;

  const settings = await getAutoModSettings(interaction.guildId);
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("Auto Mod status")
    .setDescription(settings.enabled ? "Auto Mod is **enabled**." : "Auto Mod is **disabled**.");

  if (!settings.enabled) {
    embed.setFooter({ text: "Enable Auto Mod in the dashboard to see rules here." });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const rules: string[] = [];
  if (settings.blockInvites) rules.push("Discord invites blocked");
  if (settings.blockSuspiciousLinks) rules.push("Suspicious links blocked");
  if (settings.blockCaps) rules.push(`Excessive caps blocked (${settings.capsPercentage}% threshold)`);
  if (settings.blockSpam) rules.push(`Repeated spam blocked (${settings.spamThreshold} messages)`);
  if (settings.blockMassMentions) rules.push(`Mass mentions blocked (${settings.mentionThreshold}+ mentions)`);
  if (settings.alwaysBlockDiscordInvites) rules.push("Discord invites always blocked");

  const actionLabels: Record<AutoModSettings["action"], string> = {
    delete: "Delete message",
    warn: "Delete + store warning",
    timeout: `Delete + timeout (${settings.timeoutMinutes} min)`,
    log: "Log only"
  };

  embed.addFields({ name: "Active rules", value: rules.join("\n") || "None", inline: false });
  embed.addFields({ name: "Action", value: actionLabels[settings.action], inline: true });

  if (settings.linkChannelRules.length > 0) {
    const linkRules = settings.linkChannelRules
      .map((rule) => {
        const allowed = rule.allowedDomains.length ? `Allow: ${rule.allowedDomains.join(", ")}` : "";
        const blocked = rule.blockedDomains.length ? `Block: ${rule.blockedDomains.join(", ")}` : "";
        return `<#${rule.channelId}>: ${[allowed, blocked].filter(Boolean).join(" | ") || "No rules set"}`;
      })
      .join("\n");
    embed.addFields({ name: "Channel link rules", value: linkRules, inline: false });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handleSocialsPost(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
    return;
  }
  if (!(await requireBotAdmin(interaction))) return;

  const socials = await getSocialPromotionSettings(interaction.guildId);
  const channelOption = interaction.options.getChannel("channel");

  if (!socials.title && !socials.links.length && !socials.memberEntries.length) {
    await interaction.reply({
      content: "No social promotion has been configured yet. Set it up in the dashboard under **Social Promotion**.",
      ephemeral: true
    });
    return;
  }

  const targetChannel = channelOption ?? (socials.targetChannelId
    ? await interaction.guild!.channels.fetch(socials.targetChannelId).catch(() => null)
    : interaction.channel);

  if (!targetChannel || !("send" in targetChannel)) {
    await interaction.reply({
      content: "Could not find a valid text channel. Save a target channel in the dashboard or provide one with the `channel` option.",
      ephemeral: true
    });
    return;
  }

  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  const permissions = "permissionsFor" in targetChannel
    ? targetChannel.permissionsFor(botMember)
    : null;
  const requiredPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    ...(socials.outputMode === "embed" ? [PermissionFlagsBits.EmbedLinks] : [])
  ];
  const missingPermissions = requiredPermissions.filter((permission) => !permissions?.has(permission));
  if (missingPermissions.length > 0) {
    await interaction.reply({
      content: "Odyssey Bot cannot post there. Check View Channel, Send Messages, and Embed Links permissions.",
      ephemeral: true
    });
    return;
  }

  const linkLines = socials.links.map((link) => `[${link.label}](${link.url})`).join("\n");
  const memberLines = socials.memberEntries.map((link) => `[${link.label}](${link.url})`).join("\n");

  try {
    if (socials.outputMode === "plain") {
      const plain = [
        socials.title,
        socials.description,
        ...socials.links.map((link) => `${link.label}: ${link.url}`),
        ...socials.memberEntries.map((link) => `${link.label}: ${link.url}`)
      ].filter(Boolean).join("\n\n");
      await targetChannel.send(plain);
    } else {
      const rendered = renderEmbedMessage({
        ...emptyEmbedConfig(),
        title: socials.title,
        description: socials.description,
        color: socials.color,
        imageUrl: socials.imageUrl,
        thumbnailUrl: socials.thumbnailUrl,
        fields: [
          ...(linkLines ? [{ name: "Official socials", value: linkLines, inline: false }] : []),
          ...(memberLines ? [{ name: "Community and members", value: memberLines, inline: false }] : [])
        ]
      }, buildDiscordPlaceholders({
        guild: interaction.guild,
        user: interaction.user,
        target: interaction.user
      }));
      await targetChannel.send({
        ...rendered,
        files: rendered.files ?? undefined
      });
    }
  } catch (error) {
    logDiscordError("Social promotion post failed", error);
    await interaction.reply({
      content: friendlyDiscordError(error, "Could not post the social promotion"),
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: `Social promotion posted in ${targetChannel.toString()}.`,
    ephemeral: true
  });
}
