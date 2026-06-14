import type { AutoModSettings } from "./types.js";
import { domainMatches, extractMessageDomains } from "./domains.js";
import { containsDiscordInvite } from "./invites.js";

export interface AutoModMessageSnapshot {
  messageId: string;
  guildId: string;
  channelId: string;
  authorId: string;
  roleIds: string[];
  isAdministrator: boolean;
  content: string;
  mentionedUserIds: string[];
  mentionedRoleIds: string[];
  timestamp: number;
}

export interface AutoModRuleState {
  recentMessages: Map<string, Array<{ content: string; timestamp: number }>>;
  recentMentions: Map<string, AutoModIncidentMessage[]>;
}

export interface AutoModIncidentMessage {
  messageId: string;
  channelId: string;
  timestamp: number;
}

export interface RepeatedPingIncident {
  kind: "repeated-ping";
  targetUserId: string;
  threshold: number;
  windowSeconds: number;
  messages: AutoModIncidentMessage[];
}

export interface AutoModDecision {
  matchedRule: string | null;
  skippedReason: string | null;
  incident: RepeatedPingIncident | null;
}

const suspiciousLinkPattern =
  /https?:\/\/(?:(?:\d{1,3}\.){3}\d{1,3}|[^/\s]*xn--|(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|is\.gd)\/)/i;

export function createAutoModRuleState(): AutoModRuleState {
  return {
    recentMessages: new Map(),
    recentMentions: new Map()
  };
}

export function enabledAutoModRules(settings: AutoModSettings): string[] {
  return [
    settings.blockInvites ? "invites" : "",
    settings.blockSuspiciousLinks ? "suspicious-links" : "",
    settings.blockCaps ? "caps" : "",
    settings.blockSpam ? "repeated-messages" : "",
    settings.blockMassMentions ? "mentions" : ""
  ].filter(Boolean);
}

function globalSkipReason(
  message: AutoModMessageSnapshot,
  settings: AutoModSettings
): string | null {
  if (!settings.enabled) return "feature disabled";
  if (settings.ignoredUserIds.includes(message.authorId)) {
    return `author is ignored (${message.authorId})`;
  }
  if (message.isAdministrator) return "administrator bypass";
  const ignoredRoleId = message.roleIds.find((roleId) => settings.ignoredRoleIds.includes(roleId));
  if (ignoredRoleId) {
    return `author has an ignored role (${ignoredRoleId})`;
  }
  return null;
}

function isExcessiveCaps(content: string, threshold: number): boolean {
  const letters = content.match(/[a-z]/gi) ?? [];
  if (letters.length < 12) return false;
  const uppercase = content.match(/[A-Z]/g)?.length ?? 0;
  return (uppercase / letters.length) * 100 >= threshold;
}

function isRepeatedMessage(
  message: AutoModMessageSnapshot,
  settings: AutoModSettings,
  state: AutoModRuleState
): boolean {
  const key = `${message.guildId}:${message.authorId}`;
  const cutoff = message.timestamp - 12_000;
  const normalized = message.content.trim().toLowerCase().replace(/\s+/g, " ");
  const entries = (state.recentMessages.get(key) ?? [])
    .filter((entry) => entry.timestamp >= cutoff);
  entries.push({ content: normalized, timestamp: message.timestamp });
  state.recentMessages.set(key, entries);
  return normalized.length > 0
    && entries.filter((entry) => entry.content === normalized).length >= settings.spamThreshold;
}

function repeatedMentionIncident(
  message: AutoModMessageSnapshot,
  settings: AutoModSettings,
  state: AutoModRuleState
): RepeatedPingIncident | null {
  const cutoff = message.timestamp - settings.mentionWindowSeconds * 1_000;
  for (const targetId of new Set(message.mentionedUserIds)) {
    const key = `${message.guildId}:${message.authorId}:${targetId}`;
    const messages = (state.recentMentions.get(key) ?? [])
      .filter((entry) => entry.timestamp >= cutoff);
    if (!messages.some((entry) => entry.messageId === message.messageId)) {
      messages.push({
        messageId: message.messageId,
        channelId: message.channelId,
        timestamp: message.timestamp
      });
    }
    if (messages.length >= settings.mentionSpamThreshold) {
      state.recentMentions.delete(key);
      return {
        kind: "repeated-ping",
        targetUserId: targetId,
        threshold: settings.mentionSpamThreshold,
        windowSeconds: settings.mentionWindowSeconds,
        messages
      };
    }
    state.recentMentions.set(key, messages);
  }
  return null;
}

export function evaluateAutoModMessage(
  message: AutoModMessageSnapshot,
  settings: AutoModSettings,
  state: AutoModRuleState
): AutoModDecision {
  const skippedReason = globalSkipReason(message, settings);
  if (skippedReason) return { matchedRule: null, skippedReason, incident: null };

  const channelRule = settings.linkChannelRules.find((rule) => rule.channelId === message.channelId);
  const domains = extractMessageDomains(message.content);
  const isAllowed = (domain: string) =>
    channelRule?.allowedDomains.some((rule) => domainMatches(domain, rule)) ?? false;
  const hasInvite = settings.blockInvites && containsDiscordInvite(message.content);

  if (hasInvite && settings.alwaysBlockDiscordInvites) {
    return { matchedRule: "Discord invite link", skippedReason: null, incident: null };
  }
  if (hasInvite && !domains.some((domain) => isAllowed(domain))) {
    return { matchedRule: "Discord invite link", skippedReason: null, incident: null };
  }

  const blockedDomain = domains.find((domain) =>
    channelRule?.blockedDomains.some((rule) => domainMatches(domain, rule))
  );
  if (blockedDomain) {
    return { matchedRule: `Blocked link domain: ${blockedDomain}`, skippedReason: null, incident: null };
  }
  if (
    settings.blockSuspiciousLinks
    && suspiciousLinkPattern.test(message.content)
    && !domains.some((domain) => isAllowed(domain))
  ) {
    return { matchedRule: "Suspicious or disguised link", skippedReason: null, incident: null };
  }

  if (settings.ignoredChannelIds.includes(message.channelId)) {
    return {
      matchedRule: null,
      skippedReason: `channel is exempt from non-link rules (${message.channelId})`,
      incident: null
    };
  }
  if (settings.blockCaps && isExcessiveCaps(message.content, settings.capsPercentage)) {
    return { matchedRule: "Excessive capital letters", skippedReason: null, incident: null };
  }
  if (
    settings.blockMassMentions
    && message.mentionedUserIds.length + message.mentionedRoleIds.length >= settings.mentionThreshold
  ) {
    return { matchedRule: "Mass mentions in one message", skippedReason: null, incident: null };
  }
  const incident = settings.blockMassMentions
    ? repeatedMentionIncident(message, settings, state)
    : null;
  if (incident) {
    return {
      matchedRule: `Repeated ping abuse within ${settings.mentionWindowSeconds} seconds`,
      skippedReason: null,
      incident
    };
  }
  if (settings.blockSpam && isRepeatedMessage(message, settings, state)) {
    return { matchedRule: "Repeated message spam", skippedReason: null, incident: null };
  }
  return { matchedRule: null, skippedReason: "no enabled rule matched", incident: null };
}
