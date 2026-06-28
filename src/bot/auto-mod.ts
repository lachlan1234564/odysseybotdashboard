import { Message, PermissionFlagsBits } from "discord.js";
import {
  addWarning,
  createModerationCase,
  getAutoModSettings,
  getGuildSettings,
  recordModerationAction
} from "../database/index.js";
import { getCachedAutoModSettings } from "../shared/auto-mod-cache.js";
import { claimIncidentCooldown, deleteIncidentMessages } from "../shared/auto-mod-incidents.js";
import {
  createAutoModRuleState,
  enabledAutoModRules,
  evaluateAutoModMessage,
  type AutoModIncidentMessage,
  type AutoModMessageSnapshot
} from "../shared/auto-mod-rules.js";
import { buildActionLogEmbed, sendGuildLog } from "./utils.js";

const ruleState = createAutoModRuleState();
const dmCooldowns = new Map<string, number>();

function snapshot(message: Message): AutoModMessageSnapshot {
  return {
    messageId: message.id,
    guildId: message.guildId!,
    channelId: message.channelId,
    authorId: message.author.id,
    roleIds: [...message.member!.roles.cache.keys()],
    isAdministrator: message.member!.permissions.has(PermissionFlagsBits.Administrator),
    content: message.content,
    mentionedUserIds: [...message.mentions.users.keys()],
    mentionedRoleIds: [...message.mentions.roles.keys()],
    timestamp: message.createdTimestamp
  };
}

function debugDecision(input: {
  message: AutoModMessageSnapshot;
  enabledRules: string[];
  skippedReason?: string | null;
  matchedRule?: string | null;
  action?: string;
  actionResult?: string;
  logResult?: string;
  latencyMs?: number;
}): void {
  console.info([
    "[AutoMod]",
    `guild=${input.message.guildId}`,
    `channel=${input.message.channelId}`,
    `author=${input.message.authorId}`,
    `enabledRules=${input.enabledRules.join(",") || "none"}`,
    `skipped=${input.skippedReason || "none"}`,
    `matched=${input.matchedRule || "none"}`,
    `action=${input.action || "none"}`,
    `result=${input.actionResult || "none"}`,
    `log=${input.logResult || "not-attempted"}`,
    input.latencyMs === undefined ? "" : `latencyMs=${input.latencyMs.toFixed(1)}`
  ].filter(Boolean).join(" "));
}

async function deleteMessage(message: Message): Promise<string> {
  if (!message.deletable) {
    return "delete failed: missing Manage Messages or channel access";
  }
  return message.delete()
    .then(() => "message deleted")
    .catch((error: Error) => `delete failed: ${error.name}`);
}

async function deleteRepeatedPingMessages(
  message: Message,
  entries: AutoModIncidentMessage[]
): Promise<{ deleted: number; channels: string[]; failed: number }> {
  return deleteIncidentMessages(entries, async (entry) => {
    const channel = message.guild!.channels.cache.get(entry.channelId)
      ?? await message.guild!.channels.fetch(entry.channelId).catch(() => null);
    if (
      !channel
      || !channel.isTextBased()
      || channel.isDMBased()
      || !("messages" in channel)
    ) {
      return "failed";
    }
    const offendingMessage = entry.messageId === message.id
      ? message
      : await channel.messages.fetch(entry.messageId).catch(() => null);
    if (!offendingMessage) return "missing";
    if (!offendingMessage.deletable) {
      return "failed";
    }
    return offendingMessage.delete()
      .then(() => "deleted" as const)
      .catch(() => "failed" as const);
  });
}

async function sendIncidentDmOnce(
  message: Message,
  ruleKey: string,
  content: string,
  cooldownSeconds: number
): Promise<void> {
  const key = `${message.guildId}:${message.author.id}:${ruleKey}`;
  const now = Date.now();
  if (!claimIncidentCooldown(dmCooldowns, key, now, Math.max(10, cooldownSeconds) * 1_000)) return;
  await message.author.send(content).catch(() => {
    console.info(`[AutoMod] guild=${message.guildId} author=${message.author.id} dm=failed-or-closed rule=${ruleKey}`);
  });
}

export async function handleAutoModMessage(message: Message): Promise<void> {
  if (!message.guild || !message.guildId || message.author.bot || !message.member) return;
  const handlerStartedAt = performance.now();
  const settings = await getCachedAutoModSettings(message.guildId, getAutoModSettings);
  const messageSnapshot = snapshot(message);
  const enabledRules = enabledAutoModRules(settings);
  const decision = evaluateAutoModMessage(messageSnapshot, settings, ruleState);

  if (!decision.matchedRule) {
    debugDecision({
      message: messageSnapshot,
      enabledRules,
      skippedReason: decision.skippedReason,
      latencyMs: performance.now() - handlerStartedAt
    });
    return;
  }

  let incidentDeleted = 0;
  let incidentFailed = 0;
  let incidentChannels: string[] = [];
  let actionResult = "logged only";
  let caseNumber: number | null = null;
  if (settings.action !== "log" && decision.incident?.kind === "repeated-ping") {
    const removableMessages = decision.incident.messages.filter(
      (entry) => !settings.ignoredChannelIds.includes(entry.channelId)
    );
    const removal = await deleteRepeatedPingMessages(message, removableMessages);
    incidentDeleted = removal.deleted;
    incidentFailed = removal.failed;
    incidentChannels = removal.channels;
    actionResult = `${incidentDeleted} incident message(s) deleted`;
    if (incidentFailed) actionResult += `; ${incidentFailed} could not be deleted`;
  } else if (settings.action !== "log") {
    actionResult = await deleteMessage(message);
  }

  if (settings.action === "warn") {
    const warningId = await addWarning({
      guildId: message.guildId,
      userId: message.author.id,
      moderatorId: message.guild.members.me?.id ?? "automod",
      reason: `Auto Mod: ${decision.matchedRule}`
    });
    const moderationCase = await createModerationCase({
      guildId: message.guildId,
      targetUserId: message.author.id,
      targetTag: message.author.tag || message.author.username,
      moderatorId: message.guild.members.me?.id ?? "automod",
      moderatorTag: message.guild.members.me?.user.tag ?? "AutoMod",
      auditLogExecutorId: message.guild.members.me?.id ?? null,
      auditLogExecutorTag: message.guild.members.me?.user.tag ?? "AutoMod",
      actionType: "warn",
      reason: `Auto Mod: ${decision.matchedRule}`,
      evidenceUrl: `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`,
      notes: `AutoMod warning #${warningId}`
    });
    caseNumber = moderationCase.caseNumber;
    actionResult += "; warning stored";
  }

  if (settings.action === "timeout") {
    if (message.member.moderatable) {
      actionResult += await message.member.timeout(
        settings.timeoutMinutes * 60_000,
        `Auto Mod: ${decision.matchedRule}`
      ).then(() => `; timed out for ${settings.timeoutMinutes} minute(s)`)
        .catch((error: Error) => `; timeout failed: ${error.name}`);
      if (!actionResult.includes("timeout failed")) {
        const moderationCase = await createModerationCase({
          guildId: message.guildId,
          targetUserId: message.author.id,
          targetTag: message.author.tag || message.author.username,
          moderatorId: message.guild.members.me?.id ?? "automod",
          moderatorTag: message.guild.members.me?.user.tag ?? "AutoMod",
          auditLogExecutorId: message.guild.members.me?.id ?? null,
          auditLogExecutorTag: message.guild.members.me?.user.tag ?? "AutoMod",
          actionType: "timeout",
          reason: `Auto Mod: ${decision.matchedRule}`,
          durationSeconds: settings.timeoutMinutes * 60,
          expiresAt: new Date(Date.now() + settings.timeoutMinutes * 60_000).toISOString(),
          evidenceUrl: `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`
        });
        caseNumber = moderationCase.caseNumber;
      }
    } else {
      actionResult += "; timeout failed: missing Moderate Members or role hierarchy";
    }
  }

  const guildSettings = await getGuildSettings(message.guildId);
  const incidentDetails = decision.incident?.kind === "repeated-ping"
    ? [
      `Threshold: ${decision.incident.threshold} ping messages`,
      `Window: ${decision.incident.windowSeconds} seconds`,
      `Messages deleted: ${incidentDeleted}`,
      `Channels affected: ${incidentChannels.map((id) => `<#${id}>`).join(", ") || "None"}`,
      `Action: ${settings.action}`,
      incidentFailed ? `Messages not deleted: ${incidentFailed}` : ""
    ].filter(Boolean).join("\n")
    : "Message content omitted from logs for privacy.";
  const embed = buildActionLogEmbed({
    title: `Auto Mod rule triggered${caseNumber ? ` — Case #${caseNumber}` : ""}`,
    action: settings.action,
    status: actionResult,
    reason: decision.matchedRule,
    affectedUserId: message.author.id,
    executorId: message.guild.members.me?.id,
    channelId: message.channelId,
    details: incidentDetails
  });
  const logged = await sendGuildLog(
    message.guildId,
    settings.logChannelId ?? guildSettings.modLogChannelId,
    (id) => message.guild!.channels.fetch(id),
    embed
  );
  const logResult = logged ? "sent" : "not sent: channel missing or bot lacks access";

  await recordModerationAction({
    guildId: message.guildId,
    action: `automod_${settings.action}`,
    targetUserId: message.author.id,
    moderatorId: message.guild.members.me?.id ?? "automod",
    reason: decision.matchedRule,
    metadata: {
      channelId: message.channelId,
      result: actionResult,
      logResult,
      caseNumber,
      incident: decision.incident?.kind ?? null,
      incidentMessagesDeleted: incidentDeleted,
      incidentChannels
    }
  });

  debugDecision({
    message: messageSnapshot,
    enabledRules,
    matchedRule: decision.matchedRule,
    action: settings.action,
    actionResult,
    logResult,
    latencyMs: performance.now() - handlerStartedAt
  });

  if (settings.action !== "log" && decision.incident?.kind === "repeated-ping") {
    await sendIncidentDmOnce(
      message,
      "repeated-ping",
      `Your messages were removed in **${message.guild.name}** for repeated ping abuse within ${decision.incident.windowSeconds} seconds.`,
      decision.incident.windowSeconds
    );
  } else if (settings.action !== "log") {
    await message.author.send(
      `Your message in **${message.guild.name}** was handled by Auto Mod. Rule: ${decision.matchedRule}.`
    ).catch(() => undefined);
  }
}
