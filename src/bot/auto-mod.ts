import { Message, PermissionFlagsBits } from "discord.js";
import {
  addWarning,
  getAutoModSettings,
  getGuildSettings,
  recordModerationAction
} from "../database/index.js";
import type { AutoModSettings } from "../shared/types.js";
import { domainMatches, extractMessageDomains } from "../shared/domains.js";
import { buildActionLogEmbed, sendGuildLog } from "./utils.js";

const recentMessages = new Map<string, Array<{ content: string; timestamp: number }>>();
const invitePattern = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;
const suspiciousLinkPattern = /https?:\/\/(?:(?:\d{1,3}\.){3}\d{1,3}|[^/\s]*xn--|(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|is\.gd)\/)/i;

function ignored(message: Message, settings: AutoModSettings): boolean {
  if (!message.guild || !message.member) return true;
  if (settings.ignoredUserIds.includes(message.author.id)) return true;
  if (message.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return message.member.roles.cache.some((role) => settings.ignoredRoleIds.includes(role.id));
}

function isExcessiveCaps(content: string, threshold: number): boolean {
  const letters = content.match(/[a-z]/gi) ?? [];
  if (letters.length < 12) return false;
  const uppercase = content.match(/[A-Z]/g)?.length ?? 0;
  return (uppercase / letters.length) * 100 >= threshold;
}

function isRepeatedSpam(message: Message, threshold: number): boolean {
  const key = `${message.guildId}:${message.author.id}`;
  const cutoff = Date.now() - 12_000;
  const normalized = message.content.trim().toLowerCase().replace(/\s+/g, " ");
  const entries = (recentMessages.get(key) ?? []).filter((entry) => entry.timestamp >= cutoff);
  entries.push({ content: normalized, timestamp: Date.now() });
  recentMessages.set(key, entries);
  return normalized.length > 0 && entries.filter((entry) => entry.content === normalized).length >= threshold;
}

export function detectAutoModRule(message: Message, settings: AutoModSettings): string | null {
  const content = message.content;
  const channelRule = settings.linkChannelRules.find((rule) => rule.channelId === message.channelId);
  const domains = extractMessageDomains(content);
  const isAllowed = (domain: string) => channelRule?.allowedDomains.some((rule) => domainMatches(domain, rule)) ?? false;
  const blockedDomain = domains.find((domain) =>
    channelRule?.blockedDomains.some((rule) => domainMatches(domain, rule))
  );
  const hasInvite = invitePattern.test(content);

  if (settings.blockInvites && hasInvite) {
    const inviteAllowed = !settings.alwaysBlockDiscordInvites
      && domains.some((domain) => isAllowed(domain));
    if (!inviteAllowed) return "Discord invite link";
  }
  if (blockedDomain) return `Blocked link domain: ${blockedDomain}`;
  if (settings.blockSuspiciousLinks && suspiciousLinkPattern.test(content)
    && !domains.some((domain) => isAllowed(domain))) {
    return "Suspicious or disguised link";
  }

  if (settings.ignoredChannelIds.includes(message.channelId)) return null;
  if (settings.blockCaps && isExcessiveCaps(content, settings.capsPercentage)) return "Excessive capital letters";
  if (settings.blockMassMentions
    && message.mentions.users.size + message.mentions.roles.size >= settings.mentionThreshold) {
    return "Mass mentions";
  }
  if (settings.blockSpam && isRepeatedSpam(message, settings.spamThreshold)) return "Repeated message spam";
  return null;
}

export async function handleAutoModMessage(message: Message): Promise<void> {
  if (!message.guild || !message.guildId || message.author.bot || !message.member) return;
  const settings = await getAutoModSettings(message.guildId);
  if (!settings.enabled || ignored(message, settings)) return;

  const rule = detectAutoModRule(message, settings);
  if (!rule) return;

  let result = "Logged only";
  if (settings.action !== "log") {
    result = await message.delete()
      .then(() => "Deleted message")
      .catch((error: Error) => `Could not delete message: ${error.message}`);
  }

  if (settings.action === "warn") {
    await addWarning({
      guildId: message.guildId,
      userId: message.author.id,
      moderatorId: message.guild.members.me?.id ?? "automod",
      reason: `Auto Mod: ${rule}`
    });
    result += "; warning stored";
  }

  if (settings.action === "timeout") {
    if (message.member.moderatable) {
      result += await message.member.timeout(
        settings.timeoutMinutes * 60_000,
        `Auto Mod: ${rule}`
      ).then(() => `; timed out for ${settings.timeoutMinutes} minute(s)`)
        .catch((error: Error) => `; timeout failed: ${error.message}`);
    } else {
      result += "; timeout failed because the member is above the bot";
    }
  }

  const guildSettings = await getGuildSettings(message.guildId);
  const embed = buildActionLogEmbed({
    title: "Auto Mod rule triggered",
    action: settings.action,
    status: result,
    reason: rule,
    affectedUserId: message.author.id,
    executorId: message.guild.members.me?.id,
    channelId: message.channelId,
    details: `Message: ${message.content.slice(0, 700) || "(no text content)"}`
  });
  await sendGuildLog(
    message.guildId,
    settings.logChannelId ?? guildSettings.modLogChannelId,
    (id) => message.guild!.channels.fetch(id),
    embed
  );
  await recordModerationAction({
    guildId: message.guildId,
    action: `automod_${settings.action}`,
    targetUserId: message.author.id,
    moderatorId: message.guild.members.me?.id ?? "automod",
    reason: rule,
    metadata: { channelId: message.channelId, result }
  });

  if (settings.action !== "log") {
    await message.author.send(
      `Your message in **${message.guild.name}** was handled by Auto Mod. Rule: ${rule}.`
    ).catch(() => undefined);
  }
}
