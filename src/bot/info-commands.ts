import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits
} from "discord.js";
import {
  getAutoModSettings,
  getBranding,
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
import { asColor, requireBotAdmin } from "./utils.js";
import { friendlyDiscordError, logDiscordError } from "../shared/logging.js";
import {
  deferCommandReply,
  replyEphemeral,
  replyToCommand
} from "./interactions.js";
import { countServerChannels, formatRoleSummary } from "./server-info.js";

export async function handleServerInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await replyEphemeral(interaction, "This command only works in a server.");
    return;
  }

  const guild = interaction.guild;
  await deferCommandReply(interaction);
  const [
    settings,
    branding,
    welcome,
    antiRaid,
    antiNuke,
    owner,
    customCommands,
    channels,
    roles
  ] = await Promise.all([
    getGuildSettings(guild.id),
    getBranding(guild.id),
    getWelcomeSettings(guild.id),
    getAntiRaidSettings(guild.id),
    getAntiNukeSettings(guild.id),
    guild.fetchOwner().catch(() => null),
    listCustomCommands(guild.id),
    guild.channels.fetch().catch(() => guild.channels.cache),
    guild.roles.fetch().catch(() => guild.roles.cache)
  ]);

  const features: string[] = [];
  if (welcome.enabled) features.push("Welcome messages");
  if (welcome.goodbyeEnabled) features.push("Goodbye messages");
  if (antiRaid.enabled) features.push("Anti-raid");
  if (antiNuke.enabled) features.push("Anti-nuke");
  if (customCommands.length > 0) features.push(`${customCommands.length} custom commands`);
  if (settings.modLogChannelId) features.push("Mod log configured");

  const channelCounts = countServerChannels(channels.values());
  const roleSummary = formatRoleSummary(roles.values(), guild.id);
  const iconUrl = guild.iconURL({ size: 256 });
  const bannerUrl = guild.bannerURL({ size: 1024 });
  const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);
  const ownerName = owner?.user.username ?? "Unavailable";
  const boostCount = guild.premiumSubscriptionCount ?? 0;

  const embed = new EmbedBuilder()
    .setColor(asColor(branding.accentColor))
    .setTitle(guild.name)
    .setDescription("A live overview of this Discord server and its CorePanel setup.")
    .addFields(
      {
        name: "Owner",
        value: `${ownerName}\n<@${guild.ownerId}>`,
        inline: true
      },
      {
        name: "Members",
        value: `**${guild.memberCount.toLocaleString()}** total`,
        inline: true
      },
      {
        name: "Server boosts",
        value: `**${boostCount.toLocaleString()}** boosts\nLevel ${guild.premiumTier}`,
        inline: true
      },
      {
        name: "Channel overview",
        value: [
          `Categories  **${channelCounts.categories.toLocaleString()}**`,
          `Text  **${channelCounts.text.toLocaleString()}**`,
          `Voice  **${channelCounts.voice.toLocaleString()}**`
        ].join("\n"),
        inline: true
      },
      {
        name: `Roles (${roleSummary.count.toLocaleString()})`,
        value: roleSummary.text,
        inline: false
      },
      {
        name: "Server details",
        value: [
          `ID  \`${guild.id}\``,
          `Created  <t:${createdTimestamp}:F>`,
          `Age  <t:${createdTimestamp}:R>`
        ].join("\n"),
        inline: false
      },
      {
        name: "CorePanel setup",
        value: features.length
          ? features.map((feature) => `- ${feature}`).join("\n")
          : "No optional features are configured yet. Open the dashboard to set up tickets, Auto Mod, and more.",
        inline: false
      }
    )
    .setFooter({
      text: branding.footerText || "CorePanel • Server overview",
      iconURL: interaction.client.user?.displayAvatarURL()
    })
    .setTimestamp();

  if (iconUrl) embed.setThumbnail(iconUrl);
  if (bannerUrl) embed.setImage(bannerUrl);

  await replyToCommand(interaction, {
    embeds: [embed],
    allowedMentions: { users: [], roles: [] }
  });
}

export async function handleUserInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.options.getMember("member") as GuildMember | null;
  if (!member || !("user" in member)) {
    await replyEphemeral(interaction, "That member could not be found in this server.");
    return;
  }

  await deferCommandReply(interaction);
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
    .setFooter({ text: "CorePanel user info" });

  await replyToCommand(interaction, { embeds: [embed] });
}

export async function handleAutomodStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await replyEphemeral(interaction, "This command only works in a server.");
    return;
  }
  await deferCommandReply(interaction);
  if (!(await requireBotAdmin(interaction))) return;

  const settings = await getAutoModSettings(interaction.guildId);
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("Auto Mod status")
    .setDescription(settings.enabled ? "Auto Mod is **enabled**." : "Auto Mod is **disabled**.");

  if (!settings.enabled) {
    embed.setFooter({ text: "Enable Auto Mod in the dashboard to see rules here." });
    await replyToCommand(interaction, { embeds: [embed] });
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

  await replyToCommand(interaction, { embeds: [embed] });
}

export async function handleSocialsPost(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await replyEphemeral(interaction, "This command only works in a server.");
    return;
  }
  await deferCommandReply(interaction);
  if (!(await requireBotAdmin(interaction))) return;

  const socials = await getSocialPromotionSettings(interaction.guildId);
  const channelOption = interaction.options.getChannel("channel");

  if (!socials.title && !socials.links.length && !socials.memberEntries.length) {
    await replyToCommand(interaction, {
      content: "No social promotion has been configured yet. Set it up in the dashboard under **Social Promotion**."
    });
    return;
  }

  const targetChannel = channelOption ?? (socials.targetChannelId
    ? await interaction.guild!.channels.fetch(socials.targetChannelId).catch(() => null)
    : interaction.channel);

  if (!targetChannel || !("send" in targetChannel)) {
    await replyToCommand(interaction, {
      content: "Could not find a valid text channel. Save a target channel in the dashboard or provide one with the `channel` option."
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
    await replyToCommand(interaction, {
      content: "CorePanel cannot post there. Check View Channel, Send Messages, and Embed Links permissions."
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
    await replyToCommand(interaction, {
      content: friendlyDiscordError(error, "Could not post the social promotion")
    });
    return;
  }

  await replyToCommand(interaction, {
    content: `Social promotion posted in ${targetChannel.toString()}.`
  });
}
