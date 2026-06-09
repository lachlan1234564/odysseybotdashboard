import {
  AuditLogEvent,
  Guild,
  GuildMember,
  PermissionFlagsBits,
  PermissionsBitField,
  Role
} from "discord.js";
import {
  getAntiRoleSettings,
  getGuildSettings,
  recordModerationAction
} from "../database/index.js";
import type { AntiRoleSettings } from "../shared/types.js";
import { buildActionLogEmbed, sendGuildLog } from "./utils.js";

const dangerousPermissions = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.MentionEveryone
];

const dangerousPermissionBits = dangerousPermissions.reduce((bits, permission) => bits | permission, 0n);
const eventLog = new Map<string, number[]>();

function hasDangerousPermissions(role: Role): boolean {
  return dangerousPermissions.some((permission) => role.permissions.has(permission));
}

function recordMassChange(guildId: string, executorId: string, windowSeconds: number): number {
  const key = `${guildId}:${executorId}`;
  const cutoff = Date.now() - windowSeconds * 1000;
  const entries = (eventLog.get(key) ?? []).filter((timestamp) => timestamp >= cutoff);
  entries.push(Date.now());
  eventLog.set(key, entries);
  return entries.length;
}

async function getExecutor(
  guild: Guild,
  type: AuditLogEvent,
  targetId: string
): Promise<GuildMember | null> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  const logs = await guild.fetchAuditLogs({ limit: 5, type }).catch(() => null);
  const entry = logs?.entries.find((candidate) =>
    candidate.targetId === targetId
    && Boolean(candidate.executorId)
    && Date.now() - candidate.createdTimestamp < 10_000
  );
  return entry?.executorId ? guild.members.fetch(entry.executorId).catch(() => null) : null;
}

function isTrusted(executor: GuildMember, settings: AntiRoleSettings): boolean {
  if (executor.id === executor.guild.ownerId || executor.id === executor.guild.members.me?.id) return true;
  if (settings.trustedUserIds.includes(executor.id)) return true;
  return executor.roles.cache.some((role) => settings.trustedRoleIds.includes(role.id));
}

async function takeAction(input: {
  settings: AntiRoleSettings;
  executor: GuildMember;
  role: Role;
  affectedMember?: GuildMember | null;
  reason: string;
}): Promise<string> {
  const { settings, executor, role, affectedMember, reason } = input;
  const botMember = executor.guild.members.me;

  if (settings.action === "log") return "Logged only";
  if (executor.id === executor.guild.ownerId) return "Skipped: executor is the server owner";
  if (executor.id === botMember?.id) return "Skipped: executor is this bot";

  if (settings.action === "remove_permission") {
    if (!role.editable || !botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return "Failed: bot cannot edit this role because of permissions or role hierarchy";
    }
    const permissions = new PermissionsBitField(role.permissions.bitfield & ~dangerousPermissionBits);
    return role.edit({ permissions, reason: `Role Protection: ${reason}` })
      .then(() => "Removed dangerous permissions")
      .catch((error: Error) => `Failed: ${error.message}`);
  }

  if (settings.action === "remove_role") {
    if (!affectedMember || !affectedMember.roles.cache.has(role.id)) {
      return "Skipped: no protected role assignment to remove";
    }
    if (!role.editable || !botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return "Failed: bot cannot remove this role because of permissions or role hierarchy";
    }
    return affectedMember.roles.remove(role, `Role Protection: ${reason}`)
      .then(() => "Removed assigned role")
      .catch((error: Error) => `Failed: ${error.message}`);
  }

  if (settings.action === "timeout") {
    if (!executor.moderatable) return "Failed: executor is above the bot or cannot be timed out";
    return executor.timeout(60 * 60_000, `Role Protection: ${reason}`)
      .then(() => "Timed out executor for 1 hour")
      .catch((error: Error) => `Failed: ${error.message}`);
  }

  if (settings.action === "kick") {
    if (!executor.kickable) return "Failed: executor is above the bot or cannot be kicked";
    return executor.kick(`Role Protection: ${reason}`)
      .then(() => "Kicked executor")
      .catch((error: Error) => `Failed: ${error.message}`);
  }

  if (!executor.bannable) return "Failed: executor is above the bot or cannot be banned";
  return executor.ban({ deleteMessageSeconds: 0, reason: `Role Protection: ${reason}` })
    .then(() => "Banned executor")
    .catch((error: Error) => `Failed: ${error.message}`);
}

async function processRoleEvent(input: {
  guild: Guild;
  executor: GuildMember | null;
  role: Role;
  event: string;
  reason: string;
  affectedMember?: GuildMember | null;
  forceTrigger?: boolean;
}): Promise<void> {
  const { guild, executor, role, event, affectedMember } = input;
  const settings = await getAntiRoleSettings(guild.id);
  if (!settings.enabled || !executor || isTrusted(executor, settings)) return;

  const massCount = recordMassChange(guild.id, executor.id, settings.timeWindowSeconds);
  const massTriggered = massCount >= settings.massChangeThreshold;
  if (!input.forceTrigger && !massTriggered) return;

  const reason = massTriggered
    ? `${input.reason}; ${massCount} role changes within ${settings.timeWindowSeconds} seconds`
    : input.reason;
  const status = await takeAction({ settings, executor, role, affectedMember, reason });
  const guildSettings = await getGuildSettings(guild.id);
  const embed = buildActionLogEmbed({
    title: "Role Protection event",
    action: event,
    status,
    reason,
    affectedUserId: affectedMember?.id,
    executorId: executor.id,
    roleId: role.id,
    details: `Role: ${role.name}\nMass-change count: ${massCount}\nConfigured action: ${settings.action}`
  });

  await sendGuildLog(
    guild.id,
    settings.logChannelId ?? guildSettings.modLogChannelId,
    (id) => guild.channels.fetch(id),
    embed
  );
  await recordModerationAction({
    guildId: guild.id,
    action: `anti_role_${event}`,
    targetUserId: affectedMember?.id ?? executor.id,
    moderatorId: guild.members.me?.id ?? "system",
    reason,
    metadata: {
      executorId: executor.id,
      roleId: role.id,
      affectedUserId: affectedMember?.id ?? null,
      configuredAction: settings.action,
      result: status
    }
  });
}

export async function handleRoleCreate(role: Role): Promise<void> {
  const executor = await getExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
  await processRoleEvent({
    guild: role.guild,
    executor,
    role,
    event: "role_create",
    reason: hasDangerousPermissions(role)
      ? "A role was created with dangerous permissions"
      : "A role was created",
    forceTrigger: hasDangerousPermissions(role)
  });
}

export async function handleRoleDelete(role: Role): Promise<void> {
  const executor = await getExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
  const settings = await getAntiRoleSettings(role.guild.id);
  await processRoleEvent({
    guild: role.guild,
    executor,
    role,
    event: "role_delete",
    reason: settings.protectedRoleIds.includes(role.id)
      ? "A protected role was deleted"
      : "A role was deleted",
    forceTrigger: true
  });
}

export async function handleRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
  const executor = await getExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
  const settings = await getAntiRoleSettings(newRole.guild.id);
  const renamed = oldRole.name !== newRole.name;
  const dangerousPermissionAdded = !hasDangerousPermissions(oldRole) && hasDangerousPermissions(newRole);
  const permissionChanged = oldRole.permissions.bitfield !== newRole.permissions.bitfield;
  const protectedRoleChanged = settings.protectedRoleIds.includes(newRole.id) && (renamed || permissionChanged);
  const changes = [
    renamed ? `renamed from "${oldRole.name}" to "${newRole.name}"` : "",
    dangerousPermissionAdded ? "dangerous permissions were added" : permissionChanged ? "permissions changed" : ""
  ].filter(Boolean).join("; ");

  await processRoleEvent({
    guild: newRole.guild,
    executor,
    role: newRole,
    event: "role_update",
    reason: changes || "A role was updated",
    forceTrigger: renamed || permissionChanged || protectedRoleChanged
  });
}

export async function handleMemberRoleUpdate(oldMember: GuildMember, newMember: GuildMember): Promise<void> {
  const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
  if (!addedRoles.size) return;
  const settings = await getAntiRoleSettings(newMember.guild.id);
  if (!settings.enabled) return;
  const executor = await getExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);

  for (const role of addedRoles.values()) {
    const protectedAssignment = settings.protectedRoleIds.includes(role.id);
    await processRoleEvent({
      guild: newMember.guild,
      executor,
      role,
      affectedMember: newMember,
      event: "protected_role_assignment",
      reason: protectedAssignment
        ? "A protected role was assigned to a member"
        : "A role was assigned to a member",
      forceTrigger: protectedAssignment
    });
  }
}
