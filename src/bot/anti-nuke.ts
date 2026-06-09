import {
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  Guild,
  GuildMember,
  PermissionFlagsBits,
  TextChannel
} from "discord.js";
import { getAntiNukeSettings, listAntiNukeTrusted, recordModerationAction } from "../database/index.js";
import { asColor, buildActionLogEmbed, sendGuildLog } from "./utils.js";

interface ActionEntry {
  executorId: string;
  targetId?: string;
  timestamp: number;
}

const actionLog = new Map<string, ActionEntry[]>();

function getLog(guildId: string): ActionEntry[] {
  if (!actionLog.has(guildId)) actionLog.set(guildId, []);
  return actionLog.get(guildId)!;
}

function pruneLog(guildId: string, windowMs: number): void {
  const now = Date.now();
  const entries = getLog(guildId);
  const cutoff = now - windowMs;
  while (entries.length && entries[0]!.timestamp < cutoff) entries.shift();
}

function countByExecutor(guildId: string, executorId: string, eventFilter?: (e: ActionEntry) => boolean): number {
  return getLog(guildId).filter((e) => e.executorId === executorId && (!eventFilter || eventFilter(e))).length;
}

function addEntry(guildId: string, executorId: string, targetId?: string): void {
  getLog(guildId).push({ executorId, targetId, timestamp: Date.now() });
}

async function isTrusted(guildId: string, executorId: string, member?: GuildMember | null): Promise<boolean> {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  const trusted = await listAntiNukeTrusted(guildId);
  if (trusted.some((t) => t.userId === executorId)) return true;
  if (member.roles.cache.some((r) => trusted.some((t) => t.roleId === r.id))) return true;
  return false;
}

async function sendAlert(guild: Guild, channelId: string | null, embed: EmbedBuilder): Promise<void> {
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel && channel.isTextBased() && !channel.isDMBased() && "send" in channel) {
    await (channel as TextChannel).send({ embeds: [embed] }).catch(() => undefined);
  }
}

async function takeAction(
  guild: Guild,
  executor: GuildMember,
  settings: ReturnType<typeof getAntiNukeSettings> extends Promise<infer T> ? T : never,
  reason: string,
  eventType: string,
  targetId?: string
): Promise<void> {
  const action = settings.action;
  let status = action === "alert" ? "Alerted" : "Completed";

  if (action === "remove_roles") {
    if (executor.id === executor.guild.ownerId) status = "Skipped: server owner";
    const me = executor.guild.members.me;
    const manageable = executor.roles.cache.filter((r) => r.id !== r.guild.id && me && me.roles.highest.comparePositionTo(r) > 0);
    if (status === "Completed" && manageable.size > 0) {
      status = await executor.roles.remove(manageable, `Anti-nuke: ${reason}`).then(() => "Completed").catch(() => "Failed");
    } else if (status === "Completed") {
      status = "Failed: no manageable roles";
    }
  }

  if (action === "timeout_executor") {
    if (executor.moderatable) {
      status = await executor.timeout(60 * 60_000, `Anti-nuke: ${reason}`).then(() => "Completed").catch(() => "Failed");
    } else {
      status = "Failed: executor is not moderatable";
    }
  }

  if (action === "kick_executor") {
    if (executor.kickable) {
      status = await executor.kick(`Anti-nuke: ${reason}`).then(() => "Completed").catch(() => "Failed");
    } else {
      status = "Failed: executor is not kickable";
    }
  }

  if (action === "ban_executor") {
    if (executor.bannable) {
      status = await executor.ban({ deleteMessageSeconds: 0, reason: `Anti-nuke: ${reason}` }).then(() => "Completed").catch(() => "Failed");
    } else {
      status = "Failed: executor is not bannable";
    }
  }

  const embed = buildActionLogEmbed({
    title: `Anti-nuke: ${action}`,
    action: eventType,
    status,
    reason,
    affectedUserId: executor.id,
    executorId: executor.id,
    details: targetId ? `Affected Discord object ID: \`${targetId}\`` : undefined
  });
  await sendAlert(guild, settings.alertChannelId ?? settings.logChannelId, embed);
  if (settings.logChannelId && settings.logChannelId !== settings.alertChannelId) {
    await sendGuildLog(guild.id, settings.logChannelId, (id) => guild.channels.fetch(id), embed);
  }

  await recordModerationAction({
    guildId: guild.id,
    action: `anti_nuke_${action}`,
    targetUserId: executor.id,
    moderatorId: guild.members.me?.id ?? "system",
    reason,
    metadata: { action }
  });
}

export async function checkEvent(guild: Guild, executorId: string, eventType: string, targetId?: string): Promise<void> {
  const settings = await getAntiNukeSettings(guild.id);
  if (!settings.enabled) return;

  const member = await guild.members.fetch(executorId).catch(() => null);
  if (await isTrusted(guild.id, executorId, member)) return;

  addEntry(guild.id, executorId, targetId);
  pruneLog(guild.id, settings.timeWindowSeconds * 1000);

  let threshold = 0;
  let reason = "";

  switch (eventType) {
    case "channelDelete": threshold = settings.channelDeleteThreshold; reason = "Mass channel deletion"; break;
    case "channelCreate": threshold = settings.channelCreateThreshold; reason = "Mass channel creation"; break;
    case "roleDelete": threshold = settings.roleDeleteThreshold; reason = "Mass role deletion"; break;
    case "roleCreate": threshold = settings.roleCreateThreshold; reason = "Mass role creation"; break;
    case "ban": threshold = settings.banThreshold; reason = "Mass banning"; break;
    case "kick": threshold = settings.kickThreshold; reason = "Mass kicking"; break;
    case "webhookCreate": threshold = settings.webhookThreshold; reason = "Mass webhook creation"; break;
    case "webhookDelete": threshold = settings.webhookThreshold; reason = "Mass webhook deletion"; break;
    case "permissionOverwrite": threshold = settings.permissionThreshold; reason = "Mass permission changes"; break;
    case "botAdd": threshold = settings.botAddThreshold; reason = "Suspicious bot additions"; break;
    case "adminRoleChange": threshold = settings.adminRoleThreshold; reason = "Administrator role changes"; break;
  }

  if (threshold <= 0) return;

  const count = countByExecutor(guild.id, executorId, (e) => {
    // For simplicity, we count all actions by executor. In production you might separate by event.
    return true;
  });

  if (count >= threshold) {
    if (member) await takeAction(guild, member, settings, reason, eventType, targetId);
    else {
      await sendAlert(guild, settings.alertChannelId ?? settings.logChannelId, new EmbedBuilder()
        .setColor(asColor("#ED4245")).setTitle("Anti-nuke: Threshold reached")
        .setDescription(`Executor <@${executorId}> \`${executorId}\` triggered ${reason} (${count} actions). Bot could not resolve member to take action.`).setTimestamp());
    }
  }
}

export async function auditHandler(guild: Guild, event: AuditLogEvent, targetType?: string): Promise<void> {
  try {
    const fetched = await guild.fetchAuditLogs({ limit: 1, type: event });
    const entry = fetched.entries.first();
    if (!entry || !entry.executorId || Date.now() - entry.createdTimestamp > 5000) return;
    await checkEvent(guild, entry.executorId, mapAuditEvent(event, targetType), entry.targetId ?? undefined);
  } catch {
    // ignore
  }
}

function mapAuditEvent(event: AuditLogEvent, targetType?: string): string {
  switch (event) {
    case AuditLogEvent.ChannelCreate: return "channelCreate";
    case AuditLogEvent.ChannelDelete: return "channelDelete";
    case AuditLogEvent.ChannelOverwriteCreate:
    case AuditLogEvent.ChannelOverwriteUpdate:
    case AuditLogEvent.ChannelOverwriteDelete: return "permissionOverwrite";
    case AuditLogEvent.RoleCreate: return "roleCreate";
    case AuditLogEvent.RoleDelete: return "roleDelete";
    case AuditLogEvent.MemberKick: return "kick";
    case AuditLogEvent.MemberBanAdd: return "ban";
    case AuditLogEvent.WebhookCreate: return "webhookCreate";
    case AuditLogEvent.WebhookDelete: return "webhookDelete";
    case AuditLogEvent.BotAdd: return "botAdd";
    case AuditLogEvent.MemberRoleUpdate: return targetType === "admin" ? "adminRoleChange" : "roleCreate";
    default: return "unknown";
  }
}
