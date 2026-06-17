import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Guild,
  GuildTextBasedChannel,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import { getAnnouncement, getBranding, getGuildSettings } from "../database/index.js";
import { emptyEmbedConfig } from "../shared/types.js";
import { replacePlaceholders } from "../shared/placeholders.js";
import { renderEmbedMessage, type RenderedMessage } from "./messages.js";
import { buildDiscordPlaceholders } from "./placeholders.js";
import { isBotAdmin, requireBotAdmin } from "./utils.js";
import { deferCommandReply, replyEphemeral, replyToCommand } from "./interactions.js";

export async function buildAnnouncementMessage(
  guild: Guild,
  templateId: number,
  channel?: GuildTextBasedChannel | null
): Promise<{ message: RenderedMessage; pingType: "none" | "everyone" | "here" } | null> {
  const [template, branding] = await Promise.all([
    getAnnouncement(templateId, guild.id),
    getBranding(guild.id)
  ]);
  if (!template) return null;
  const variables = buildDiscordPlaceholders({
    guild,
    channel,
    createdAt: template.createdAt
  });
  const message = template.outputMode === "plain"
    ? {
      content: replacePlaceholders(
        [template.title.trim(), template.body.trim(), template.footer.trim()]
          .filter(Boolean)
          .join("\n\n"),
        variables
      )
    }
    : renderEmbedMessage({
    ...emptyEmbedConfig(),
    title: template.title,
    description: template.body,
    color: template.color || branding.announcementDefaultColor,
    imageUrl: template.imageUrl || branding.announcementDefaultImageUrl,
    thumbnailUrl: template.thumbnailUrl || branding.announcementDefaultThumbnailUrl,
    footerText: template.footer || branding.footerText,
    footerIconUrl: branding.embedIconUrl
  }, variables);
  return { message, pingType: template.pingType };
}

export function getMissingAnnouncementPermission(
  guild: Guild,
  channel: GuildTextBasedChannel,
  message: RenderedMessage,
  pingType: "none" | "everyone" | "here"
): string | null {
  const botMember = guild.members.me;
  const permissions = botMember && "permissionsFor" in channel ? channel.permissionsFor(botMember) : null;
  if (!permissions?.has(PermissionFlagsBits.ViewChannel)) return "View Channel";
  if (!permissions.has(PermissionFlagsBits.SendMessages)) return "Send Messages";
  if (message.embeds?.length && !permissions.has(PermissionFlagsBits.EmbedLinks)) return "Embed Links";
  if (message.files?.length && !permissions.has(PermissionFlagsBits.AttachFiles)) return "Attach Files";
  if (pingType !== "none" && !permissions.has(PermissionFlagsBits.MentionEveryone)) {
    return "Mention @everyone, @here, and All Roles";
  }
  return null;
}

export async function handleAnnounce(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await replyEphemeral(interaction, "This command can only be used in a server.");
    return;
  }
  await deferCommandReply(interaction);
  if (!(await requireBotAdmin(interaction))) return;

  const templateId = Number(interaction.options.getString("template", true));
  const [template, settings] = await Promise.all([
    getAnnouncement(templateId, interaction.guildId),
    getGuildSettings(interaction.guildId)
  ]);
  if (!template) {
    await replyToCommand(interaction, "That announcement template no longer exists.");
    return;
  }

  const channelId = interaction.options.getChannel("channel")?.id
    ?? template.targetChannelId
    ?? settings.announcementChannelId;
  if (!channelId) {
    await replyToCommand(interaction, "Choose a channel or configure an announcement channel in the dashboard.");
    return;
  }
  const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  const built = await buildAnnouncementMessage(
    interaction.guild,
    templateId,
    targetChannel?.isTextBased() && !targetChannel.isDMBased() ? targetChannel : null
  );
  if (!built) {
    await replyToCommand(interaction, "That announcement template no longer exists.");
    return;
  }
  const { message } = built;

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`announce:confirm:${templateId}:${channelId}`)
      .setLabel("Post announcement")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("announce:cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );

  await replyToCommand(interaction, {
    content: [`Preview for <#${channelId}>`, message.content].filter(Boolean).join("\n\n"),
    embeds: message.embeds,
    files: message.files,
    components: [buttons]
  });
}

export async function handleAnnouncementButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;
  if (interaction.customId === "announce:cancel") {
    await interaction.update({ content: "Announcement cancelled.", embeds: [], components: [] });
    return;
  }

  const [, , templateValue, channelId] = interaction.customId.split(":");
  const templateId = Number(templateValue);
  if (!channelId) {
    await interaction.update({ content: "The template or target channel is no longer available.", embeds: [], components: [] });
    return;
  }

  if (!(await isBotAdmin(interaction))) {
    await interaction.reply({ content: "You are not allowed to post announcements.", flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || !("send" in channel)) {
    await interaction.update({ content: "The configured announcement channel is unavailable.", embeds: [], components: [] });
    return;
  }
  const built = await buildAnnouncementMessage(interaction.guild, templateId, channel);
  if (!built) {
    await interaction.update({ content: "The template is no longer available.", embeds: [], components: [] });
    return;
  }
  const { message, pingType } = built;

  const sendPayload: Record<string, unknown> = { ...message };
  const ping = pingType === "everyone" ? "@everyone" : pingType === "here" ? "@here" : "";
  const missingPermission = getMissingAnnouncementPermission(interaction.guild, channel, message, pingType);
  if (missingPermission) {
    await interaction.update({
      content: `I need the **${missingPermission}** permission in that channel before I can post this announcement.`,
      embeds: [],
      components: []
    });
    return;
  }
  sendPayload.content = [ping, message.content].filter(Boolean).join("\n") || undefined;
  sendPayload.allowedMentions = ping ? { parse: ["everyone"] } : { parse: [] };
  await channel.send(sendPayload);
  await interaction.update({ content: `Announcement posted in ${channel}.`, embeds: [], components: [] });
}
