import { ChannelType } from "discord.js";
import type { VerificationSettings } from "./types.js";

type VerificationPlanOverwrite = {
  id: string;
  type: 0 | 1;
  allow: string;
  deny: string;
};

export type VerificationPlanChannel = {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
  permission_overwrites?: VerificationPlanOverwrite[];
};

export type PlannedVerificationChannel = {
  channel: VerificationPlanChannel;
  visibility: "public" | "hidden" | "unchanged";
  inherited: boolean;
};

export type VerificationAutoKickInput = {
  enabled: boolean;
  autoKickUnverified: boolean;
  autoKickAfterHours: number;
  verifiedRoleId: string | null;
  joinedAt: string | null;
  memberRoleIds: string[];
  trustedRoleIds: string[];
  isBot: boolean;
  hasAdminPermission: boolean;
  nowMs?: number;
};

const verificationChannelTypes = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildCategory,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia
]);

export function buildStableVerificationUrl(publicBaseUrl: string, guildId: string): string {
  const base = publicBaseUrl.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+/i.test(base)) {
    throw new Error("VERIFY_PUBLIC_BASE_URL must be a public HTTPS URL before verification setup can run.");
  }
  if (!/^\d{17,20}$/.test(guildId)) {
    throw new Error("The Discord server ID is invalid.");
  }
  return `${base}/verify/server/${guildId}`;
}

export function sanitizeVerificationChannelName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return normalized || "verify";
}

export function shouldAutoKickUnverified(input: VerificationAutoKickInput): {
  kick: boolean;
  reason: string;
  pendingHours: number;
} {
  if (!input.enabled) return { kick: false, reason: "verification_disabled", pendingHours: 0 };
  if (!input.autoKickUnverified) return { kick: false, reason: "auto_kick_disabled", pendingHours: 0 };
  if (!input.verifiedRoleId) return { kick: false, reason: "verified_role_missing", pendingHours: 0 };
  if (input.isBot) return { kick: false, reason: "bot_user", pendingHours: 0 };
  if (input.hasAdminPermission) return { kick: false, reason: "admin_or_manage_server", pendingHours: 0 };
  const memberRoles = new Set(input.memberRoleIds);
  if (memberRoles.has(input.verifiedRoleId)) return { kick: false, reason: "already_verified", pendingHours: 0 };
  if (input.trustedRoleIds.some((roleId) => memberRoles.has(roleId))) {
    return { kick: false, reason: "trusted_role", pendingHours: 0 };
  }
  if (!input.joinedAt) return { kick: false, reason: "joined_at_unknown", pendingHours: 0 };
  const joinedMs = new Date(input.joinedAt).getTime();
  if (!Number.isFinite(joinedMs)) return { kick: false, reason: "joined_at_invalid", pendingHours: 0 };
  const pendingHours = Math.max(0, (input.nowMs ?? Date.now()) - joinedMs) / 3_600_000;
  if (pendingHours < input.autoKickAfterHours) {
    return { kick: false, reason: "within_pending_window", pendingHours };
  }
  return { kick: true, reason: "auto_kick_unverified", pendingHours };
}

function overwriteSignature(overwrites: VerificationPlanOverwrite[] | undefined): string {
  return [...(overwrites ?? [])]
    .map((overwrite) => `${overwrite.id}:${overwrite.type}:${overwrite.allow}:${overwrite.deny}`)
    .sort()
    .join("|");
}

function isSyncedToParent(
  channel: VerificationPlanChannel,
  channelMap: Map<string, VerificationPlanChannel>
): boolean {
  if (!channel.parent_id) return false;
  const parent = channelMap.get(channel.parent_id);
  return Boolean(
    parent
    && overwriteSignature(channel.permission_overwrites) === overwriteSignature(parent.permission_overwrites)
  );
}

export function planVerificationVisibility(
  channels: VerificationPlanChannel[],
  settings: Pick<
    VerificationSettings,
    | "verificationChannelId"
    | "publicChannelIds"
    | "publicCategoryIds"
    | "hiddenChannelIds"
    | "hiddenCategoryIds"
    | "lockAllChannels"
  >
): PlannedVerificationChannel[] {
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const publicChannels = new Set(settings.publicChannelIds);
  const publicCategories = new Set(settings.publicCategoryIds);
  const hiddenChannels = new Set(settings.hiddenChannelIds);
  const hiddenCategories = new Set(settings.hiddenCategoryIds);

  return channels
    .filter((channel) => verificationChannelTypes.has(channel.type))
    .map((channel) => {
      const parentId = channel.parent_id ?? null;
      let visibility: PlannedVerificationChannel["visibility"] = settings.lockAllChannels
        ? "hidden"
        : "unchanged";
      if (channel.id === settings.verificationChannelId) visibility = "public";
      if (publicCategories.has(channel.id) || publicChannels.has(channel.id)) visibility = "public";
      if (parentId && publicCategories.has(parentId)) visibility = "public";
      if (hiddenCategories.has(channel.id) || hiddenChannels.has(channel.id)) visibility = "hidden";
      if (parentId && hiddenCategories.has(parentId)) visibility = "hidden";
      if (channel.id === settings.verificationChannelId) visibility = "public";

      const explicitlySelected = channel.id === settings.verificationChannelId
        || publicChannels.has(channel.id)
        || hiddenChannels.has(channel.id);
      const inherited = channel.type !== ChannelType.GuildCategory
        && isSyncedToParent(channel, channelMap)
        && !explicitlySelected;
      return { channel, visibility, inherited };
    });
}
