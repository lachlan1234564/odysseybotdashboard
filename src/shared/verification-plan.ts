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
