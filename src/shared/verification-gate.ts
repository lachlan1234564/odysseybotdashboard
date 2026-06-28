import {
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  REST,
  Routes
} from "discord.js";
import {
  clearVerificationPermissionBackups,
  deleteVerificationPermissionBackup,
  getVerificationPermissionBackup,
  listVerificationPermissionBackups,
  saveVerificationPermissionBackup,
  saveVerificationSetupState
} from "../database/index.js";
import { logDiscordError, safeErrorSummary } from "./logging.js";
import {
  buildStableVerificationUrl,
  planVerificationVisibility,
  sanitizeVerificationChannelName
} from "./verification-plan.js";
import type { PlannedVerificationChannel } from "./verification-plan.js";
import type {
  VerificationPermissionBackup,
  VerificationSettings,
  VerificationSetupResult
} from "./types.js";

type RawOverwrite = {
  id: string;
  type: 0 | 1;
  allow: string;
  deny: string;
};

type RawChannel = {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
  permission_overwrites?: RawOverwrite[];
};

type RawRole = {
  id: string;
  name: string;
  permissions: string;
  position: number;
  managed?: boolean;
};

type RawMember = {
  roles: string[];
};

type SetupOptions = {
  rest: REST;
  guildId: string;
  botUserId: string;
  settings: VerificationSettings;
  trustedRoleIds?: string[];
  publicBaseUrl: string;
  dryRun?: boolean;
  applyPermissions?: boolean;
  postEmbed?: boolean;
  forceEmbedUpdate?: boolean;
  updatedBy?: string | null;
};

type PermissionDecision = {
  bit: bigint;
  value: boolean | null;
};

export class VerificationSetupError extends Error {
  readonly expose = true;
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "VerificationSetupError";
  }
}

export {
  buildStableVerificationUrl,
  planVerificationVisibility,
  sanitizeVerificationChannelName
};

function memberGuildPermissions(
  guildId: string,
  member: RawMember,
  roles: RawRole[]
): bigint {
  const roleMap = new Map(roles.map((role) => [role.id, role]));
  let permissions = BigInt(roleMap.get(guildId)?.permissions ?? "0");
  for (const roleId of member.roles) {
    permissions |= BigInt(roleMap.get(roleId)?.permissions ?? "0");
  }
  return permissions;
}

function hasPermission(permissions: bigint, permission: bigint): boolean {
  return (permissions & PermissionFlagsBits.Administrator) !== 0n
    || (permissions & permission) !== 0n;
}

function overwriteFromChannel(channel: RawChannel, targetId: string): RawOverwrite | null {
  return channel.permission_overwrites?.find((overwrite) => overwrite.id === targetId) ?? null;
}

async function originalBackup(
  guildId: string,
  channel: RawChannel,
  targetId: string,
  targetType: 0 | 1
): Promise<VerificationPermissionBackup> {
  const existingBackup = await getVerificationPermissionBackup(guildId, channel.id, targetId);
  if (existingBackup) return existingBackup;
  const overwrite = overwriteFromChannel(channel, targetId);
  const backup: VerificationPermissionBackup = {
    guildId,
    channelId: channel.id,
    targetId,
    targetType,
    allow: overwrite?.allow ?? "0",
    deny: overwrite?.deny ?? "0",
    existed: Boolean(overwrite)
  };
  await saveVerificationPermissionBackup(backup);
  return backup;
}

function applyDecisions(
  allowValue: string,
  denyValue: string,
  decisions: PermissionDecision[]
): { allow: string; deny: string } {
  let allow = BigInt(allowValue || "0");
  let deny = BigInt(denyValue || "0");
  for (const decision of decisions) {
    allow &= ~decision.bit;
    deny &= ~decision.bit;
    if (decision.value === true) allow |= decision.bit;
    if (decision.value === false) deny |= decision.bit;
  }
  return { allow: allow.toString(), deny: deny.toString() };
}

async function writeOverwrite(
  rest: REST,
  guildId: string,
  channel: RawChannel,
  targetId: string,
  targetType: 0 | 1,
  decisions: PermissionDecision[]
): Promise<void> {
  const backup = await originalBackup(guildId, channel, targetId, targetType);
  const next = applyDecisions(backup.allow, backup.deny, decisions);
  if (!backup.existed && next.allow === "0" && next.deny === "0") {
    await rest.delete(Routes.channelPermission(channel.id, targetId)).catch(() => undefined);
    return;
  }
  await rest.put(Routes.channelPermission(channel.id, targetId), {
    body: {
      allow: next.allow,
      deny: next.deny,
      type: targetType
    }
  });
}

function permissionPlanCount(
  planned: PlannedVerificationChannel[],
  trustedRoleCount: number
): number {
  return planned
    .filter((item) => !item.inherited)
    .length * (3 + trustedRoleCount);
}

async function restoreObsoleteManagedOverwrites(input: {
  rest: REST;
  guildId: string;
  managedTargetIds: Set<string>;
}): Promise<Array<{ channelId: string; message: string }>> {
  const backups = await listVerificationPermissionBackups(input.guildId);
  const obsolete = backups.filter((backup) => !input.managedTargetIds.has(backup.targetId));
  const failures: Array<{ channelId: string; message: string }> = [];
  for (const backup of obsolete) {
    try {
      if (backup.existed) {
        await input.rest.put(Routes.channelPermission(backup.channelId, backup.targetId), {
          body: {
            allow: backup.allow,
            deny: backup.deny,
            type: backup.targetType
          }
        });
      } else {
        await input.rest.delete(Routes.channelPermission(backup.channelId, backup.targetId));
      }
      await deleteVerificationPermissionBackup(
        backup.guildId,
        backup.channelId,
        backup.targetId
      );
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? Number((error as { code?: unknown }).code)
        : null;
      if (code === 10003 || code === 10009 || code === 10011) {
        await deleteVerificationPermissionBackup(
          backup.guildId,
          backup.channelId,
          backup.targetId
        );
        continue;
      }
      failures.push({
        channelId: backup.channelId,
        message: `Could not restore obsolete role overwrite: ${safeErrorSummary(error)}`
      });
    }
  }
  return failures;
}

function verificationMessageBody(settings: VerificationSettings, verificationUrl: string) {
  return {
    embeds: [{
      color: Number.parseInt(settings.embedColor.slice(1), 16),
      title: settings.embedTitle,
      description: settings.embedDescription,
      footer: { text: "Discord OAuth verification • Bot Dashboard" },
      timestamp: new Date().toISOString()
    }],
    components: [{
      type: 1,
      components: [{
        type: 2,
        style: ButtonStyle.Link,
        label: settings.buttonText,
        url: verificationUrl
      }]
    }],
    allowed_mentions: { parse: [] }
  };
}

export async function sendVerificationEventLog(
  rest: REST,
  settings: VerificationSettings,
  title: string,
  description: string,
  fields: Array<{ name: string; value: string; inline?: boolean }> = []
): Promise<void> {
  if (!settings.logChannelId) return;
  await rest.post(Routes.channelMessages(settings.logChannelId), {
    body: {
      embeds: [{
        color: 0xC58B4B,
        author: { name: "Bot Dashboard • Verification" },
        title,
        description,
        fields: fields.slice(0, 25),
        footer: { text: `Guild ID: ${settings.guildId}` },
        timestamp: new Date().toISOString()
      }],
      allowed_mentions: { parse: [] }
    }
  }).catch((error) => {
    logDiscordError(`Verification log delivery failed (${title})`, error);
  });
}

async function createOrResolveVerificationChannel(
  rest: REST,
  guildId: string,
  settings: VerificationSettings,
  channels: RawChannel[]
): Promise<{ channelId: string; created: boolean }> {
  const configured = settings.verificationChannelId
    ? channels.find((channel) => channel.id === settings.verificationChannelId)
    : null;
  if (configured && configured.type === ChannelType.GuildText) {
    return { channelId: configured.id, created: false };
  }
  if (!settings.autoCreateChannel) {
    throw new VerificationSetupError(
      "Choose an existing text channel or enable automatic verification channel creation."
    );
  }
  const created = await rest.post(Routes.guildChannels(guildId), {
    body: {
      name: sanitizeVerificationChannelName(settings.verificationChannelName),
      type: ChannelType.GuildText,
      topic: "Complete Discord OAuth verification to unlock the server."
    }
  }) as RawChannel;
  return { channelId: created.id, created: true };
}

async function postOrUpdateVerificationEmbed(
  rest: REST,
  channelId: string,
  settings: VerificationSettings,
  verificationUrl: string,
  forceUpdate: boolean
): Promise<{ messageId: string; posted: boolean; updated: boolean }> {
  const body = verificationMessageBody(settings, verificationUrl);
  if (settings.verificationEmbedMessageId && (settings.updateEmbedOnSetup || forceUpdate)) {
    try {
      const message = await rest.patch(
        Routes.channelMessage(channelId, settings.verificationEmbedMessageId),
        { body }
      ) as { id: string };
      return { messageId: message.id, posted: false, updated: true };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? Number((error as { code?: unknown }).code)
        : null;
      if (code !== 10008 && code !== 10003) throw error;
    }
  } else if (settings.verificationEmbedMessageId && !forceUpdate) {
    return {
      messageId: settings.verificationEmbedMessageId,
      posted: false,
      updated: false
    };
  }
  const message = await rest.post(Routes.channelMessages(channelId), { body }) as { id: string };
  return { messageId: message.id, posted: true, updated: false };
}

function ensureValidSetup(
  settings: VerificationSettings,
  roles: RawRole[],
  botMember: RawMember,
  guildId: string,
  requireGatePermissions: boolean
): void {
  if (!settings.enabled) throw new VerificationSetupError("Enable verification in the dashboard before running setup.");
  if (!settings.verifiedRoleId) throw new VerificationSetupError("Choose a verified/community role before running setup.");
  const verifiedRole = roles.find((role) => role.id === settings.verifiedRoleId);
  if (!verifiedRole || verifiedRole.managed || verifiedRole.id === guildId) {
    throw new VerificationSetupError("The configured verified role is missing or cannot be managed.");
  }
  const botPermissions = memberGuildPermissions(guildId, botMember, roles);
  const missing = [
    [PermissionFlagsBits.ManageChannels, "Manage Channels"],
    [PermissionFlagsBits.ManageRoles, "Manage Roles"]
  ].filter(([permission]) => requireGatePermissions && !hasPermission(botPermissions, permission as bigint))
    .map(([, label]) => label);
  if (missing.length) {
    throw new VerificationSetupError(`Bot Dashboard is missing: ${missing.join(", ")}.`);
  }
  const roleMap = new Map(roles.map((role) => [role.id, role]));
  const botHighestPosition = Math.max(0, ...botMember.roles.map((roleId) => roleMap.get(roleId)?.position ?? 0));
  if (verifiedRole.position >= botHighestPosition) {
    throw new VerificationSetupError(
      "Move the Bot Dashboard role above the verified/community role before running setup."
    );
  }
}

export async function runVerificationSetup(options: SetupOptions): Promise<VerificationSetupResult> {
  const applyPermissions = options.applyPermissions !== false;
  const postEmbed = options.postEmbed !== false;
  let verificationUrl: string;
  try {
    verificationUrl = buildStableVerificationUrl(options.publicBaseUrl, options.guildId);
  } catch (error) {
    throw new VerificationSetupError(
      error instanceof Error ? error.message : "The public verification URL is invalid."
    );
  }
  const [channelsValue, rolesValue, botMemberValue] = await Promise.all([
    options.rest.get(Routes.guildChannels(options.guildId)),
    options.rest.get(Routes.guildRoles(options.guildId)),
    options.rest.get(Routes.guildMember(options.guildId, options.botUserId))
  ]);
  let channels = channelsValue as RawChannel[];
  const roles = rolesValue as RawRole[];
  const botMember = botMemberValue as RawMember;
  ensureValidSetup(options.settings, roles, botMember, options.guildId, applyPermissions);

  let verificationChannelId = options.settings.verificationChannelId;
  let channelCreated = false;
  const warnings: string[] = [];
  if (!verificationChannelId || !channels.some((channel) => channel.id === verificationChannelId)) {
    if (options.dryRun) {
      if (!options.settings.autoCreateChannel) {
        throw new VerificationSetupError(
          "The configured verification channel is missing and automatic creation is disabled."
        );
      }
      warnings.push(`A new #${sanitizeVerificationChannelName(options.settings.verificationChannelName)} channel will be created.`);
      verificationChannelId = null;
    } else {
      const resolved = await createOrResolveVerificationChannel(
        options.rest,
        options.guildId,
        options.settings,
        channels
      );
      verificationChannelId = resolved.channelId;
      channelCreated = resolved.created;
      channels = await options.rest.get(Routes.guildChannels(options.guildId)) as RawChannel[];
    }
  }

  const effectiveSettings: VerificationSettings = {
    ...options.settings,
    verificationChannelId
  };
  const planned = planVerificationVisibility(channels, effectiveSettings);
  const visibleChannelIds = planned.filter((item) => item.visibility === "public").map((item) => item.channel.id);
  const hiddenChannelIds = planned.filter((item) => item.visibility === "hidden").map((item) => item.channel.id);
  const skippedChannelIds = planned.filter((item) => item.inherited).map((item) => item.channel.id);
  const trustedRoleIds = [...new Set(options.trustedRoleIds ?? [])]
    .filter((roleId) => roleId !== options.settings.verifiedRoleId && roles.some((role) => role.id === roleId));

  const result: VerificationSetupResult = {
    dryRun: Boolean(options.dryRun),
    verificationChannelId,
    verificationMessageId: options.settings.verificationEmbedMessageId,
    verificationUrl,
    channelCreated,
    embedPosted: false,
    embedUpdated: false,
    permissionChangesPlanned: permissionPlanCount(planned, trustedRoleIds.length),
    permissionsApplied: 0,
    permissionsFailed: 0,
    visibleChannelIds,
    hiddenChannelIds,
    skippedChannelIds,
    warnings,
    failures: []
  };

  if (options.dryRun) return result;
  if (!verificationChannelId) {
    throw new VerificationSetupError("The verification channel could not be resolved.");
  }

  if (applyPermissions) {
    const obsoleteFailures = await restoreObsoleteManagedOverwrites({
      rest: options.rest,
      guildId: options.guildId,
      managedTargetIds: new Set([
        options.guildId,
        options.settings.verifiedRoleId!,
        options.botUserId,
        ...trustedRoleIds
      ])
    });
    result.permissionsFailed += obsoleteFailures.length;
    result.failures.push(...obsoleteFailures);
    for (const item of planned) {
      if (item.inherited) continue;
      const isVerificationChannel = item.channel.id === verificationChannelId;
      const everyoneView = item.visibility === "public"
        ? true
        : item.visibility === "hidden" ? false : null;
      const writes: Array<Promise<void>> = [];
      writes.push(writeOverwrite(
        options.rest,
        options.guildId,
        item.channel,
        options.guildId,
        0,
        [
          { bit: PermissionFlagsBits.ViewChannel, value: everyoneView },
          {
            bit: PermissionFlagsBits.SendMessages,
            value: isVerificationChannel && options.settings.lockVerificationChannel ? false : null
          }
        ]
      ));
      writes.push(writeOverwrite(
        options.rest,
        options.guildId,
        item.channel,
        options.settings.verifiedRoleId!,
        0,
        [
          { bit: PermissionFlagsBits.ViewChannel, value: true },
          {
            bit: PermissionFlagsBits.SendMessages,
            value: isVerificationChannel && options.settings.lockVerificationChannel ? false : null
          }
        ]
      ));
      writes.push(writeOverwrite(
        options.rest,
        options.guildId,
        item.channel,
        options.botUserId,
        1,
        [
          { bit: PermissionFlagsBits.ViewChannel, value: true },
          { bit: PermissionFlagsBits.SendMessages, value: true },
          { bit: PermissionFlagsBits.EmbedLinks, value: true },
          { bit: PermissionFlagsBits.ReadMessageHistory, value: true }
        ]
      ));
      for (const roleId of trustedRoleIds) {
        writes.push(writeOverwrite(
          options.rest,
          options.guildId,
          item.channel,
          roleId,
          0,
          [
            { bit: PermissionFlagsBits.ViewChannel, value: true },
            {
              bit: PermissionFlagsBits.SendMessages,
              value: isVerificationChannel && options.settings.lockVerificationChannel ? true : null
            }
          ]
        ));
      }
      const settled = await Promise.allSettled(writes);
      const failures = settled.filter((entry) => entry.status === "rejected");
      result.permissionsApplied += settled.length - failures.length;
      result.permissionsFailed += failures.length;
      if (failures.length) {
        result.failures.push({
          channelId: item.channel.id,
          message: failures
            .map((entry) => entry.status === "rejected" ? safeErrorSummary(entry.reason) : "")
            .filter(Boolean)
            .join("; ")
            .slice(0, 500)
        });
      }
    }
  }

  if (postEmbed) {
    try {
      const message = await postOrUpdateVerificationEmbed(
        options.rest,
        verificationChannelId,
        effectiveSettings,
        verificationUrl,
        Boolean(
          options.forceEmbedUpdate
          || channelCreated
          || options.settings.verificationChannelId !== verificationChannelId
        )
      );
      result.verificationMessageId = message.messageId;
      result.embedPosted = message.posted;
      result.embedUpdated = message.updated;
    } catch (error) {
      logDiscordError("Verification embed post/update failed", error);
      throw new VerificationSetupError(
        "The verification channel was configured, but Discord rejected the verification message. Check View Channel, Send Messages, and Embed Links."
      );
    }
  }

  await saveVerificationSetupState({
    guildId: options.guildId,
    verificationChannelId,
    verificationEmbedMessageId: result.verificationMessageId,
    permissionsApplied: applyPermissions && result.permissionsFailed === 0,
    lastSetupAt: new Date().toISOString(),
    updatedBy: options.updatedBy ?? null
  });
  await sendVerificationEventLog(
    options.rest,
    { ...effectiveSettings, verificationEmbedMessageId: result.verificationMessageId },
    "Verification setup completed",
    "The server verification gate was created or updated.",
    [
      { name: "Verification channel", value: `<#${verificationChannelId}>`, inline: true },
      { name: "Verified role", value: `<@&${options.settings.verifiedRoleId}>`, inline: true },
      {
        name: "Permissions",
        value: `${result.permissionsApplied} applied, ${result.permissionsFailed} failed`,
        inline: true
      },
      {
        name: "Embed",
        value: result.embedPosted ? "Posted" : result.embedUpdated ? "Updated" : "Unchanged",
        inline: true
      }
    ]
  );
  return result;
}

export async function restoreVerificationPermissions(input: {
  rest: REST;
  guildId: string;
  settings: VerificationSettings;
  updatedBy?: string | null;
}): Promise<{ restored: number; failed: number; failures: Array<{ channelId: string; message: string }> }> {
  const backups = await listVerificationPermissionBackups(input.guildId);
  let restored = 0;
  let failed = 0;
  const failures: Array<{ channelId: string; message: string }> = [];
  for (const backup of backups) {
    try {
      if (backup.existed) {
        await input.rest.put(Routes.channelPermission(backup.channelId, backup.targetId), {
          body: {
            allow: backup.allow,
            deny: backup.deny,
            type: backup.targetType
          }
        });
      } else {
        await input.rest.delete(Routes.channelPermission(backup.channelId, backup.targetId));
      }
      restored++;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? Number((error as { code?: unknown }).code)
        : null;
      if (code === 10003) {
        restored++;
        continue;
      }
      failed++;
      failures.push({ channelId: backup.channelId, message: safeErrorSummary(error) });
    }
  }
  if (failed === 0) await clearVerificationPermissionBackups(input.guildId);
  await saveVerificationSetupState({
    guildId: input.guildId,
    verificationChannelId: input.settings.verificationChannelId,
    verificationEmbedMessageId: input.settings.verificationEmbedMessageId,
    permissionsApplied: false,
    lastSetupAt: input.settings.lastSetupAt,
    updatedBy: input.updatedBy ?? null
  });
  await sendVerificationEventLog(
    input.rest,
    input.settings,
    "Verification permissions restored",
    "Verification mode was disabled without deleting the verification channel or removing roles from verified members.",
    [
      { name: "Restored overwrites", value: String(restored), inline: true },
      { name: "Failed overwrites", value: String(failed), inline: true }
    ]
  );
  return { restored, failed, failures };
}

export async function assignVerifiedRole(input: {
  rest: REST;
  settings: VerificationSettings;
  userId: string;
}): Promise<{ assigned: boolean; reason?: string }> {
  if (!input.settings.verifiedRoleId) return { assigned: false, reason: "No verified role is configured." };
  try {
    await input.rest.put(
      Routes.guildMemberRole(input.settings.guildId, input.userId, input.settings.verifiedRoleId)
    );
    await sendVerificationEventLog(
      input.rest,
      input.settings,
      "Member verification passed",
      `<@${input.userId}> passed verification and received the configured role.`,
      [{ name: "Role", value: `<@&${input.settings.verifiedRoleId}>`, inline: true }]
    );
    return { assigned: true };
  } catch (error) {
    logDiscordError("Verification role assignment failed", error);
    await sendVerificationEventLog(
      input.rest,
      input.settings,
      "Verification role assignment failed",
      `<@${input.userId}> passed verification, but Bot Dashboard could not assign the configured role.`,
      [{ name: "Action required", value: "Check Manage Roles and move the bot role above the verified role." }]
    );
    return {
      assigned: false,
      reason: "Verification passed, but the community role could not be assigned. Contact server staff."
    };
  }
}

export async function logVerificationFailure(input: {
  rest: REST;
  settings: VerificationSettings;
  userId: string;
  status: "flagged" | "denied";
  reasonCodes: string[];
}): Promise<void> {
  await sendVerificationEventLog(
    input.rest,
    input.settings,
    input.status === "denied" ? "Member verification denied" : "Member verification needs review",
    `<@${input.userId}> did not receive the verified role.`,
    [{
      name: "Reasons",
      value: input.reasonCodes.join(", ") || "No reason codes were recorded."
    }]
  );
}
