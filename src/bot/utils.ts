import {
  ChatInputCommandInteraction,
  ColorResolvable,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits
} from "discord.js";
import {
  getBranding,
  getGuildSettings,
  recordModerationAction
} from "../database/index.js";

export function asColor(value: string, fallback = "#5865F2"): ColorResolvable {
  return /^#[0-9a-f]{6}$/i.test(value) ? value as ColorResolvable : fallback as ColorResolvable;
}

export async function isBotAdmin(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guildId || !interaction.guild) return false;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;

  const settings = await getGuildSettings(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  return settings.adminRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

export async function requireBotAdmin(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (await isBotAdmin(interaction)) return true;
  await interaction.reply({ content: "You are not allowed to use this bot admin command.", ephemeral: true });
  return false;
}

export async function getTargetMember(interaction: ChatInputCommandInteraction, option = "member"): Promise<GuildMember | null> {
  if (!interaction.guild) return null;
  const user = interaction.options.getUser(option, true);
  return interaction.guild.members.fetch(user.id).catch(() => null);
}

export async function sendGuildLog(
  guildId: string,
  channelId: string | null,
  channelResolver: (id: string) => Promise<unknown>,
  embed: EmbedBuilder
): Promise<void> {
  if (!channelId) return;
  const channel = await channelResolver(channelId).catch(() => null);
  if (channel && typeof channel === "object" && "send" in channel && typeof channel.send === "function") {
    const sendable = channel as { send: (options: { embeds: EmbedBuilder[] }) => Promise<unknown> };
    await sendable.send({ embeds: [embed] }).catch(() => undefined);
  }
}

export async function logModeration(input: {
  interaction: ChatInputCommandInteraction;
  action: string;
  targetUserId?: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
  channelId?: string | null;
}): Promise<void> {
  const { interaction, action, targetUserId, reason = "", metadata, channelId } = input;
  if (!interaction.guildId || !interaction.guild) return;

  await recordModerationAction({
    guildId: interaction.guildId,
    action,
    targetUserId,
    moderatorId: interaction.user.id,
    reason,
    metadata
  });

  const [settings, branding] = await Promise.all([
    getGuildSettings(interaction.guildId),
    getBranding(interaction.guildId)
  ]);
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Moderator", value: `<@${interaction.user.id}> \`${interaction.user.id}\``, inline: true }
  ];
  if (targetUserId) {
    fields.push({ name: "Target", value: `<@${targetUserId}> \`${targetUserId}\``, inline: true });
  }
  if (channelId) {
    fields.push({ name: "Channel", value: `<#${channelId}> \`${channelId}\``, inline: true });
  }
  fields.push({ name: "Reason", value: reason || "No reason provided" });

  const embed = new EmbedBuilder()
    .setColor(asColor(branding.ticketPanelColor))
    .setTitle(`Moderation: ${action}`)
    .addFields(fields)
    .setTimestamp();

  await sendGuildLog(
    interaction.guildId,
    settings.modLogChannelId,
    (id) => interaction.guild!.channels.fetch(id),
    embed
  );
}
