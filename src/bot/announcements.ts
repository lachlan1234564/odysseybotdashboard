import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  PermissionFlagsBits
} from "discord.js";
import { getAnnouncement, getBranding, getGuildSettings } from "../database/index.js";
import { emptyEmbedConfig } from "../shared/types.js";
import { renderEmbedMessage, type RenderedMessage } from "./messages.js";
import { requireBotAdmin } from "./utils.js";

export async function buildAnnouncementMessage(guildId: string, templateId: number): Promise<{ message: RenderedMessage; pingType: "none" | "everyone" | "here" } | null> {
  const [template, branding] = await Promise.all([
    getAnnouncement(templateId, guildId),
    getBranding(guildId)
  ]);
  if (!template) return null;
  const message = renderEmbedMessage({
    ...emptyEmbedConfig(),
    title: template.title,
    description: template.body,
    color: template.color || branding.announcementDefaultColor,
    imageUrl: template.imageUrl || branding.announcementDefaultImageUrl,
    thumbnailUrl: template.thumbnailUrl || branding.announcementDefaultThumbnailUrl,
    footerText: template.footer || branding.footerText,
    footerIconUrl: branding.embedIconUrl
  }, {
    user: "@user",
    username: "user",
    server: branding.serverName,
    channel: "#channel",
    text: "",
    reason: "",
    target: "@target"
  });
  return { message, pingType: template.pingType };
}

export async function handleAnnounce(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }
  if (!(await requireBotAdmin(interaction))) return;

  const templateId = Number(interaction.options.getString("template", true));
  const [template, built, settings] = await Promise.all([
    getAnnouncement(templateId, interaction.guildId),
    buildAnnouncementMessage(interaction.guildId, templateId),
    getGuildSettings(interaction.guildId)
  ]);
  if (!template || !built) {
    await interaction.reply({ content: "That announcement template no longer exists.", ephemeral: true });
    return;
  }
  const { message } = built;

  const channelId = interaction.options.getChannel("channel")?.id
    ?? template.targetChannelId
    ?? settings.announcementChannelId;
  if (!channelId) {
    await interaction.reply({ content: "Choose a channel or configure an announcement channel in the dashboard.", ephemeral: true });
    return;
  }

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

  await interaction.reply({
    content: `Preview for <#${channelId}>`,
    embeds: message.embeds,
    files: message.files,
    components: [buttons],
    ephemeral: true
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
  const built = await buildAnnouncementMessage(interaction.guildId, templateId);
  if (!built || !channelId) {
    await interaction.update({ content: "The template or target channel is no longer available.", embeds: [], components: [] });
    return;
  }
  const { message, pingType } = built;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const settings = await getGuildSettings(interaction.guildId);
  const allowed = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    || settings.adminRoleIds.some((roleId) => member.roles.cache.has(roleId));
  if (!allowed) {
    await interaction.reply({ content: "You are not allowed to post announcements.", ephemeral: true });
    return;
  }

  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || !("send" in channel)) {
    await interaction.update({ content: "The configured announcement channel is unavailable.", embeds: [], components: [] });
    return;
  }

  const sendPayload: Record<string, unknown> = { ...message };
  if (pingType === "everyone") {
    sendPayload.content = "@everyone";
    sendPayload.allowedMentions = { parse: ["everyone"] };
  } else if (pingType === "here") {
    sendPayload.content = "@here";
    sendPayload.allowedMentions = { parse: ["everyone"] };
  }
  await channel.send(sendPayload);
  await interaction.update({ content: `Announcement posted in ${channel}.`, embeds: [], components: [] });
}
