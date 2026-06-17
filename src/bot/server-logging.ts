import {
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits
} from "discord.js";
import type {
  AnyThreadChannel,
  GuildBasedChannel,
  GuildEmoji,
  GuildMember,
  Invite,
  Message,
  PartialGuildMember,
  PartialMessage,
  Role,
  Sticker,
  VoiceState
} from "discord.js";
import { getLoggingSettings } from "../database/index.js";
import type { LoggingSettings } from "../shared/types.js";
import { logDiscordError } from "../shared/logging.js";

export type LoggingCategory =
  | "members"
  | "messages"
  | "voice"
  | "channels"
  | "roles"
  | "server"
  | "invites"
  | "threads"
  | "moderation"
  | "dashboard";

type LogField = { name: string; value: string; inline?: boolean };
type AuditActor = { id: string; label: string } | null;

const categoryColors: Record<LoggingCategory, number> = {
  members: 0x6FAF88,
  messages: 0xC29A62,
  voice: 0x5D9E96,
  channels: 0x879C68,
  roles: 0xB78562,
  server: 0xD0A65A,
  invites: 0x6D9C78,
  threads: 0x8B8F70,
  moderation: 0xC96B62,
  dashboard: 0xA17A58
};

const settingsCache = new Map<string, { expiresAt: number; value: LoggingSettings }>();
const sendQueues = new Map<string, Promise<void>>();
const queueDepth = new Map<string, number>();
const settingsTtlMs = 10_000;
const maxQueueDepth = 50;

export function invalidateLoggingSettingsCache(guildId?: string): void {
  if (guildId) settingsCache.delete(guildId);
  else settingsCache.clear();
}

async function loggingSettings(guildId: string): Promise<LoggingSettings> {
  const cached = settingsCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await getLoggingSettings(guildId);
  settingsCache.set(guildId, { expiresAt: Date.now() + settingsTtlMs, value });
  return value;
}

export function cleanLogText(value: unknown, maxLength = 1000): string {
  const text = String(value ?? "")
    .replace(/```/g, "'''")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (!text) return "*Unavailable*";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function beforeAfter(before: unknown, after: unknown): string {
  return `**Before**\n${cleanLogText(before, 450)}\n**After**\n${cleanLogText(after, 450)}`;
}

function valuesDiffer(left: unknown, right: unknown): boolean {
  return String(left ?? "") !== String(right ?? "");
}

async function auditActor(
  guild: Guild,
  types: AuditLogEvent | AuditLogEvent[],
  targetId?: string | null
): Promise<AuditActor> {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
  const allowedTypes = Array.isArray(types) ? types : [types];
  for (const type of allowedTypes) {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 }).catch(() => null);
    const entry = logs?.entries.find((candidate) =>
      Date.now() - candidate.createdTimestamp < 12_000
      && (!targetId || candidate.targetId === targetId)
    );
    if (entry?.executorId) {
      return {
        id: entry.executorId,
        label: entry.executor?.username ?? "Unknown user"
      };
    }
  }
  return null;
}

async function sendLog(
  guild: Guild,
  category: LoggingCategory,
  input: {
    title: string;
    description?: string;
    fields?: LogField[];
    targetId?: string | null;
    actor?: AuditActor;
    footer?: string;
    thumbnail?: string | null;
  }
): Promise<void> {
  const settings = await loggingSettings(guild.id);
  if (!settings.enabled || !settings.channelId || !settings[category]) return;

  const currentDepth = queueDepth.get(guild.id) ?? 0;
  if (currentDepth >= maxQueueDepth) {
    console.warn(`[ServerLog] guild=${guild.id} category=${category} result=dropped queueDepth=${currentDepth}`);
    return;
  }
  queueDepth.set(guild.id, currentDepth + 1);

  const previous = sendQueues.get(guild.id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const channel = await guild.channels.fetch(settings.channelId!).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased() || !("send" in channel)) {
      console.warn(`[ServerLog] guild=${guild.id} category=${category} result=channel-unavailable`);
      return;
    }
    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    const permissions = me && "permissionsFor" in channel ? channel.permissionsFor(me) : null;
    if (
      !permissions?.has(PermissionFlagsBits.ViewChannel)
      || !permissions.has(PermissionFlagsBits.SendMessages)
      || !permissions.has(PermissionFlagsBits.EmbedLinks)
    ) {
      console.warn(`[ServerLog] guild=${guild.id} category=${category} result=missing-permissions`);
      return;
    }

    const fields = [...(input.fields ?? [])];
    if (input.actor) {
      fields.push({
        name: "Performed by",
        value: `${input.actor.label} (<@${input.actor.id}>)`,
        inline: true
      });
    } else if (["moderation", "channels", "roles", "server", "invites", "threads"].includes(category)) {
      fields.push({ name: "Performed by", value: "Unknown or audit log unavailable", inline: true });
    }
    const embed = new EmbedBuilder()
      .setColor(categoryColors[category])
      .setAuthor({ name: `${guild.name} • ${category.charAt(0).toUpperCase()}${category.slice(1)}` })
      .setTitle(cleanLogText(input.title, 256))
      .setFooter({
        text: cleanLogText(
          [
            input.footer,
            input.targetId ? `Target ID: ${input.targetId}` : "",
            `Guild ID: ${guild.id}`
          ].filter(Boolean).join(" • "),
          2048
        )
      })
      .setTimestamp();
    if (input.description) embed.setDescription(cleanLogText(input.description, 4096));
    if (fields.length) {
      embed.addFields(fields.slice(0, 25).map((field) => ({
        ...field,
        name: cleanLogText(field.name, 256),
        value: cleanLogText(field.value, 1024)
      })));
    }
    if (input.thumbnail) embed.setThumbnail(input.thumbnail);

    await channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] }
    }).catch((error) => {
      logDiscordError(`Server logging failed (${category})`, error);
    });
  }).finally(() => {
    queueDepth.set(guild.id, Math.max(0, (queueDepth.get(guild.id) ?? 1) - 1));
  });
  sendQueues.set(guild.id, next);
  await next;
}

function channelLabel(channel: GuildBasedChannel | AnyThreadChannel): string {
  return `${channel.name} (<#${channel.id}>)`;
}

function roleLabel(role: Role): string {
  return `${role.name} (\`${role.id}\`)`;
}

export async function logMemberJoin(member: GuildMember): Promise<void> {
  await sendLog(member.guild, "members", {
    title: "Member joined",
    description: `${member.user.username} joined the server.`,
    fields: [
      { name: "Member", value: `<@${member.id}>`, inline: true },
      { name: "Account created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "Member count", value: member.guild.memberCount.toLocaleString(), inline: true }
    ],
    targetId: member.id,
    thumbnail: member.user.displayAvatarURL()
  });
}

export async function logMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
  const actor = await auditActor(member.guild, AuditLogEvent.MemberKick, member.id);
  await sendLog(member.guild, actor ? "moderation" : "members", {
    title: actor ? "Member kicked" : "Member left",
    description: `${member.user.username} is no longer in the server.`,
    fields: [
      { name: "Member", value: `${member.user.username} (\`${member.id}\`)`, inline: true },
      { name: "Member count", value: member.guild.memberCount.toLocaleString(), inline: true }
    ],
    actor,
    targetId: member.id,
    thumbnail: member.user.displayAvatarURL()
  });
}

export async function logMemberUpdate(oldMember: GuildMember, newMember: GuildMember): Promise<void> {
  const fields: LogField[] = [];
  if (valuesDiffer(oldMember.nickname, newMember.nickname)) {
    fields.push({ name: "Nickname changed", value: beforeAfter(oldMember.nickname ?? "None", newMember.nickname ?? "None") });
  }
  if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
    fields.push({
      name: "Timeout changed",
      value: beforeAfter(
        oldMember.communicationDisabledUntilTimestamp
          ? `<t:${Math.floor(oldMember.communicationDisabledUntilTimestamp / 1000)}:F>`
          : "Not timed out",
        newMember.communicationDisabledUntilTimestamp
          ? `<t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>`
          : "Not timed out"
      )
    });
  }
  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(newMember.roles.cache.keys());
  const added = newMember.roles.cache.filter((role) => !oldRoles.has(role.id) && role.id !== newMember.guild.id);
  const removed = oldMember.roles.cache.filter((role) => !newRoles.has(role.id) && role.id !== newMember.guild.id);
  const roleActor = added.size || removed.size
    ? await auditActor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id)
    : null;
  for (const role of added.values()) {
    await sendLog(newMember.guild, "roles", {
      title: "Role Given",
      description: `The <@&${role.id}> role was given to <@${newMember.id}>.`,
      fields: [
        { name: "Member", value: `<@${newMember.id}>\n\`${newMember.id}\``, inline: true },
        { name: "Role", value: `<@&${role.id}>\n\`${role.id}\``, inline: true },
        { name: "Given by", value: roleActor ? `<@${roleActor.id}>\n\`${roleActor.id}\`` : "Unknown or audit log unavailable", inline: true }
      ],
      actor: roleActor,
      targetId: newMember.id,
      footer: `Role ID: ${role.id}`,
      thumbnail: newMember.user.displayAvatarURL()
    });
  }
  for (const role of removed.values()) {
    await sendLog(newMember.guild, "roles", {
      title: "Role Taken",
      description: `The <@&${role.id}> role was removed from <@${newMember.id}>.`,
      fields: [
        { name: "Member", value: `<@${newMember.id}>\n\`${newMember.id}\``, inline: true },
        { name: "Role", value: `<@&${role.id}>\n\`${role.id}\``, inline: true },
        { name: "Removed by", value: roleActor ? `<@${roleActor.id}>\n\`${roleActor.id}\`` : "Unknown or audit log unavailable", inline: true }
      ],
      actor: roleActor,
      targetId: newMember.id,
      footer: `Role ID: ${role.id}`,
      thumbnail: newMember.user.displayAvatarURL()
    });
  }
  if (oldMember.pending !== newMember.pending) {
    fields.push({ name: "Membership screening", value: beforeAfter(oldMember.pending, newMember.pending), inline: true });
  }
  if (!fields.length) return;
  const moderationChange = fields.some((field) => field.name === "Timeout changed");
  const actor = await auditActor(
    newMember.guild,
    moderationChange ? AuditLogEvent.MemberUpdate : AuditLogEvent.MemberRoleUpdate,
    newMember.id
  );
  await sendLog(newMember.guild, moderationChange ? "moderation" : "members", {
    title: moderationChange ? "Member timeout updated" : "Server member updated",
    description: `Server-specific member changes were detected for <@${newMember.id}>.`,
    fields,
    actor,
    targetId: newMember.id,
    thumbnail: newMember.user.displayAvatarURL()
  });
}

export async function logBanAdd(guild: Guild, userId: string, username: string, avatar?: string): Promise<void> {
  const actor = await auditActor(guild, AuditLogEvent.MemberBanAdd, userId);
  await sendLog(guild, "moderation", {
    title: "Member banned",
    description: `${username} was banned from the server.`,
    fields: [{ name: "Member", value: `${username} (\`${userId}\`)`, inline: true }],
    actor,
    targetId: userId,
    thumbnail: avatar
  });
}

export async function logBanRemove(guild: Guild, userId: string, username: string, avatar?: string): Promise<void> {
  const actor = await auditActor(guild, AuditLogEvent.MemberBanRemove, userId);
  await sendLog(guild, "moderation", {
    title: "Member unbanned",
    description: `${username} can join the server again.`,
    fields: [{ name: "Member", value: `${username} (\`${userId}\`)`, inline: true }],
    actor,
    targetId: userId,
    thumbnail: avatar
  });
}

export async function logMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage
): Promise<void> {
  if (!newMessage.guild || oldMessage.content === newMessage.content) return;
  const author = newMessage.author ?? oldMessage.author;
  await sendLog(newMessage.guild, "messages", {
    title: "Message edited",
    description: `A message was edited in <#${newMessage.channelId}>.`,
    fields: [
      { name: "Author", value: author ? `${author.username} (\`${author.id}\`)` : "Unknown", inline: true },
      { name: "Before", value: cleanLogText(oldMessage.content, 1000) },
      { name: "After", value: cleanLogText(newMessage.content, 1000) },
      { name: "Jump to message", value: newMessage.url ? `[Open message](${newMessage.url})` : "Unavailable", inline: true }
    ],
    targetId: newMessage.id,
    footer: `Channel ID: ${newMessage.channelId}`
  });
}

export async function logMessageDelete(message: Message | PartialMessage): Promise<void> {
  if (!message.guild) return;
  const actor = await auditActor(
    message.guild,
    AuditLogEvent.MessageDelete,
    message.author?.id
  );
  await sendLog(message.guild, "messages", {
    title: "Message deleted",
    description: `A message was deleted from <#${message.channelId}>.`,
    fields: [
      {
        name: "Author",
        value: message.author ? `${message.author.username} (\`${message.author.id}\`)` : "Unknown or uncached",
        inline: true
      },
      { name: "Content", value: cleanLogText(message.content, 1000) },
      {
        name: "Attachments",
        value: message.attachments?.size
          ? `${message.attachments.size} attachment(s) were present. URLs are not retained.`
          : "None",
        inline: true
      }
    ],
    actor,
    targetId: message.id,
    footer: `Channel ID: ${message.channelId}`
  });
}

export async function logMessageBulkDelete(
  guild: Guild,
  channelId: string,
  messages: Iterable<Message | PartialMessage>
): Promise<void> {
  const items = [...messages];
  const actor = await auditActor(guild, AuditLogEvent.MessageBulkDelete);
  await sendLog(guild, "messages", {
    title: "Messages bulk deleted",
    description: `${items.length} messages were removed from <#${channelId}>.`,
    fields: [
      {
        name: "Cached authors",
        value: [...new Set(items.map((message) => message.author?.username).filter(Boolean))]
          .slice(0, 15)
          .join(", ") || "Unavailable"
      }
    ],
    actor,
    footer: `Channel ID: ${channelId}`
  });
}

export async function logVoiceUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const fields: LogField[] = [];
  let title = "Voice state updated";
  if (!oldState.channelId && newState.channelId) {
    title = "Member joined voice";
    fields.push({ name: "Channel", value: `<#${newState.channelId}>`, inline: true });
  } else if (oldState.channelId && !newState.channelId) {
    title = "Member left voice";
    fields.push({ name: "Channel", value: `<#${oldState.channelId}>`, inline: true });
  } else if (oldState.channelId !== newState.channelId) {
    title = "Member moved voice channels";
    fields.push({ name: "From", value: `<#${oldState.channelId}>`, inline: true });
    fields.push({ name: "To", value: `<#${newState.channelId}>`, inline: true });
  }
  const toggles: Array<[string, boolean | null, boolean | null]> = [
    ["Server mute", oldState.serverMute, newState.serverMute],
    ["Server deaf", oldState.serverDeaf, newState.serverDeaf],
    ["Self mute", oldState.selfMute, newState.selfMute],
    ["Self deaf", oldState.selfDeaf, newState.selfDeaf],
    ["Streaming", oldState.streaming, newState.streaming],
    ["Camera", oldState.selfVideo, newState.selfVideo]
  ];
  for (const [label, before, after] of toggles) {
    if (before !== after) fields.push({ name: label, value: after ? "Enabled" : "Disabled", inline: true });
  }
  if (!fields.length) return;
  await sendLog(newState.guild, "voice", {
    title,
    description: `<@${newState.id}> changed voice state.`,
    fields,
    targetId: newState.id,
    thumbnail: newState.member?.user.displayAvatarURL()
  });
}

export async function logChannelCreate(channel: GuildBasedChannel): Promise<void> {
  const actor = await auditActor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
  await sendLog(channel.guild, "channels", {
    title: "Channel created",
    description: channelLabel(channel),
    fields: [{ name: "Type", value: ChannelType[channel.type] ?? String(channel.type), inline: true }],
    actor,
    targetId: channel.id
  });
}

export async function logChannelDelete(channel: GuildBasedChannel): Promise<void> {
  const actor = await auditActor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  await sendLog(channel.guild, "channels", {
    title: "Channel deleted",
    description: `${channel.name} was deleted.`,
    fields: [{ name: "Type", value: ChannelType[channel.type] ?? String(channel.type), inline: true }],
    actor,
    targetId: channel.id
  });
}

export async function logChannelUpdate(oldChannel: GuildBasedChannel, newChannel: GuildBasedChannel): Promise<void> {
  const fields: LogField[] = [];
  if (oldChannel.name !== newChannel.name) fields.push({ name: "Name changed", value: beforeAfter(oldChannel.name, newChannel.name) });
  const pairs: Array<[string, unknown, unknown]> = [
    ["Category changed", oldChannel.parentId, newChannel.parentId],
    ["Topic changed", "topic" in oldChannel ? oldChannel.topic : null, "topic" in newChannel ? newChannel.topic : null],
    ["Slowmode changed", "rateLimitPerUser" in oldChannel ? oldChannel.rateLimitPerUser : null, "rateLimitPerUser" in newChannel ? newChannel.rateLimitPerUser : null],
    ["NSFW changed", "nsfw" in oldChannel ? oldChannel.nsfw : null, "nsfw" in newChannel ? newChannel.nsfw : null],
    ["Position changed", "rawPosition" in oldChannel ? oldChannel.rawPosition : null, "rawPosition" in newChannel ? newChannel.rawPosition : null],
    ["Bitrate changed", "bitrate" in oldChannel ? oldChannel.bitrate : null, "bitrate" in newChannel ? newChannel.bitrate : null],
    ["User limit changed", "userLimit" in oldChannel ? oldChannel.userLimit : null, "userLimit" in newChannel ? newChannel.userLimit : null],
    ["Voice region changed", "rtcRegion" in oldChannel ? oldChannel.rtcRegion : null, "rtcRegion" in newChannel ? newChannel.rtcRegion : null]
  ];
  for (const [name, before, after] of pairs) {
    if (valuesDiffer(before, after)) fields.push({ name, value: beforeAfter(before ?? "None", after ?? "None") });
  }
  const oldOverwrites = "permissionOverwrites" in oldChannel
    ? oldChannel.permissionOverwrites.cache.map((item) => `${item.id}:${item.allow.bitfield}:${item.deny.bitfield}`).sort().join("|")
    : "";
  const newOverwrites = "permissionOverwrites" in newChannel
    ? newChannel.permissionOverwrites.cache.map((item) => `${item.id}:${item.allow.bitfield}:${item.deny.bitfield}`).sort().join("|")
    : "";
  if (oldOverwrites !== newOverwrites) {
    fields.push({ name: "Permissions changed", value: "One or more channel permission overwrites changed." });
  }
  if (!fields.length) return;
  const actor = await auditActor(
    newChannel.guild,
    [AuditLogEvent.ChannelUpdate, AuditLogEvent.ChannelOverwriteCreate, AuditLogEvent.ChannelOverwriteUpdate, AuditLogEvent.ChannelOverwriteDelete],
    newChannel.id
  );
  await sendLog(newChannel.guild, "channels", {
    title: "Channel updated",
    description: channelLabel(newChannel),
    fields,
    actor,
    targetId: newChannel.id
  });
}

export async function logRoleCreate(role: Role): Promise<void> {
  const actor = await auditActor(role.guild, AuditLogEvent.RoleCreate, role.id);
  await sendLog(role.guild, "roles", {
    title: "Role created",
    description: roleLabel(role),
    fields: [
      { name: "Color", value: role.hexColor, inline: true },
      { name: "Position", value: String(role.position), inline: true },
      { name: "Permissions", value: role.permissions.bitfield.toString(), inline: false }
    ],
    actor,
    targetId: role.id
  });
}

export async function logRoleDelete(role: Role): Promise<void> {
  const actor = await auditActor(role.guild, AuditLogEvent.RoleDelete, role.id);
  await sendLog(role.guild, "roles", {
    title: "Role deleted",
    description: `${role.name} was deleted.`,
    fields: [
      { name: "Color", value: role.hexColor, inline: true },
      { name: "Permissions", value: role.permissions.bitfield.toString() }
    ],
    actor,
    targetId: role.id
  });
}

export async function logRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
  const fields: LogField[] = [];
  const pairs: Array<[string, unknown, unknown]> = [
    ["Name changed", oldRole.name, newRole.name],
    ["Color changed", oldRole.hexColor, newRole.hexColor],
    ["Permissions changed", oldRole.permissions.bitfield, newRole.permissions.bitfield],
    ["Position changed", oldRole.position, newRole.position],
    ["Mentionable changed", oldRole.mentionable, newRole.mentionable],
    ["Displayed separately changed", oldRole.hoist, newRole.hoist]
  ];
  for (const [name, before, after] of pairs) {
    if (valuesDiffer(before, after)) fields.push({ name, value: beforeAfter(before, after) });
  }
  if (!fields.length) return;
  const actor = await auditActor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
  await sendLog(newRole.guild, "roles", {
    title: "Role updated",
    description: roleLabel(newRole),
    fields,
    actor,
    targetId: newRole.id
  });
}

export async function logGuildUpdate(oldGuild: Guild, newGuild: Guild): Promise<void> {
  const fields: LogField[] = [];
  const pairs: Array<[string, unknown, unknown]> = [
    ["Server name changed", oldGuild.name, newGuild.name],
    ["Icon changed", oldGuild.icon, newGuild.icon],
    ["Banner changed", oldGuild.banner, newGuild.banner],
    ["Verification level changed", oldGuild.verificationLevel, newGuild.verificationLevel],
    ["Boost count changed", oldGuild.premiumSubscriptionCount, newGuild.premiumSubscriptionCount],
    ["Boost tier changed", oldGuild.premiumTier, newGuild.premiumTier],
    ["System channel changed", oldGuild.systemChannelId, newGuild.systemChannelId],
    ["Rules channel changed", oldGuild.rulesChannelId, newGuild.rulesChannelId],
    ["Safety alerts channel changed", oldGuild.safetyAlertsChannelId, newGuild.safetyAlertsChannelId]
  ];
  for (const [name, before, after] of pairs) {
    if (valuesDiffer(before, after)) fields.push({ name, value: beforeAfter(before ?? "None", after ?? "None") });
  }
  if (!fields.length) return;
  const actor = await auditActor(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
  await sendLog(newGuild, "server", {
    title: "Server settings updated",
    fields,
    actor,
    targetId: newGuild.id,
    thumbnail: newGuild.iconURL()
  });
}

export async function logEmojiChange(
  action: "created" | "deleted" | "updated",
  emoji: GuildEmoji,
  oldEmoji?: GuildEmoji
): Promise<void> {
  const auditType = action === "created"
    ? AuditLogEvent.EmojiCreate
    : action === "deleted" ? AuditLogEvent.EmojiDelete : AuditLogEvent.EmojiUpdate;
  const actor = await auditActor(emoji.guild, auditType, emoji.id);
  const fields = oldEmoji && oldEmoji.name !== emoji.name
    ? [{ name: "Name changed", value: beforeAfter(oldEmoji.name, emoji.name) }]
    : [];
  await sendLog(emoji.guild, "server", {
    title: `Emoji ${action}`,
    description: `${emoji.name ?? "Unnamed emoji"} (\`${emoji.id}\`)`,
    fields,
    actor,
    targetId: emoji.id,
    thumbnail: emoji.imageURL()
  });
}

export async function logStickerChange(
  action: "created" | "deleted" | "updated",
  sticker: Sticker,
  oldSticker?: Sticker
): Promise<void> {
  if (!sticker.guild) return;
  const guild = sticker.guild;
  const auditType = action === "created"
    ? AuditLogEvent.StickerCreate
    : action === "deleted" ? AuditLogEvent.StickerDelete : AuditLogEvent.StickerUpdate;
  const actor = await auditActor(guild, auditType, sticker.id);
  const fields: LogField[] = [];
  if (oldSticker?.name !== sticker.name) fields.push({ name: "Name changed", value: beforeAfter(oldSticker?.name, sticker.name) });
  if (oldSticker?.description !== sticker.description) fields.push({ name: "Description changed", value: beforeAfter(oldSticker?.description, sticker.description) });
  await sendLog(guild, "server", {
    title: `Sticker ${action}`,
    description: `${sticker.name} (\`${sticker.id}\`)`,
    fields,
    actor,
    targetId: sticker.id
  });
}

export async function logInviteChange(action: "created" | "deleted", invite: Invite): Promise<void> {
  if (!invite.guild || !("channels" in invite.guild)) return;
  const guild = invite.guild as Guild;
  const auditType = action === "created" ? AuditLogEvent.InviteCreate : AuditLogEvent.InviteDelete;
  const actor = invite.inviter
    ? { id: invite.inviter.id, label: invite.inviter.username }
    : await auditActor(guild, auditType);
  await sendLog(guild, "invites", {
    title: `Invite ${action}`,
    description: `Invite \`${invite.code}\` was ${action}.`,
    fields: [
      { name: "Channel", value: invite.channelId ? `<#${invite.channelId}>` : "Unknown", inline: true },
      { name: "Max uses", value: invite.maxUses ? String(invite.maxUses) : "Unlimited", inline: true },
      { name: "Expires", value: invite.expiresTimestamp ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : "Never", inline: true }
    ],
    actor,
    targetId: invite.code
  });
}

export async function logThreadCreate(thread: AnyThreadChannel): Promise<void> {
  const actor = await auditActor(thread.guild, AuditLogEvent.ThreadCreate, thread.id);
  await sendLog(thread.guild, "threads", {
    title: "Thread created",
    description: channelLabel(thread),
    fields: [{ name: "Parent channel", value: thread.parentId ? `<#${thread.parentId}>` : "None", inline: true }],
    actor,
    targetId: thread.id
  });
}

export async function logThreadDelete(thread: AnyThreadChannel): Promise<void> {
  const actor = await auditActor(thread.guild, AuditLogEvent.ThreadDelete, thread.id);
  await sendLog(thread.guild, "threads", {
    title: "Thread deleted",
    description: `${thread.name} was deleted.`,
    actor,
    targetId: thread.id
  });
}

export async function logThreadUpdate(oldThread: AnyThreadChannel, newThread: AnyThreadChannel): Promise<void> {
  const fields: LogField[] = [];
  const pairs: Array<[string, unknown, unknown]> = [
    ["Name changed", oldThread.name, newThread.name],
    ["Archived changed", oldThread.archived, newThread.archived],
    ["Locked changed", oldThread.locked, newThread.locked],
    ["Auto archive duration changed", oldThread.autoArchiveDuration, newThread.autoArchiveDuration],
    ["Slowmode changed", oldThread.rateLimitPerUser, newThread.rateLimitPerUser]
  ];
  for (const [name, before, after] of pairs) {
    if (valuesDiffer(before, after)) fields.push({ name, value: beforeAfter(before, after) });
  }
  if (!fields.length) return;
  const actor = await auditActor(newThread.guild, AuditLogEvent.ThreadUpdate, newThread.id);
  await sendLog(newThread.guild, "threads", {
    title: "Thread updated",
    description: channelLabel(newThread),
    fields,
    actor,
    targetId: newThread.id
  });
}

export async function logWebhookUpdate(guild: Guild, channelId: string): Promise<void> {
  const actor = await auditActor(guild, [
    AuditLogEvent.WebhookCreate,
    AuditLogEvent.WebhookUpdate,
    AuditLogEvent.WebhookDelete
  ]);
  await sendLog(guild, "server", {
    title: "Webhooks updated",
    description: `A webhook changed in <#${channelId}>.`,
    actor,
    footer: `Channel ID: ${channelId}`
  });
}
