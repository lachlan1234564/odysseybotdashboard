import { ChannelType } from "discord.js";

export interface ServerChannelCounts {
  categories: number;
  text: number;
  voice: number;
}

export interface ServerRoleSummary {
  count: number;
  text: string;
}

type ChannelLike = { type: ChannelType };
type RoleLike = { id: string; name: string; position: number };

export function countServerChannels(channels: Iterable<ChannelLike | null>): ServerChannelCounts {
  const counts: ServerChannelCounts = { categories: 0, text: 0, voice: 0 };
  const textTypes = new Set<ChannelType>([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia
  ]);
  const voiceTypes = new Set<ChannelType>([
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice
  ]);

  for (const channel of channels) {
    if (!channel) continue;
    if (channel.type === ChannelType.GuildCategory) counts.categories += 1;
    else if (textTypes.has(channel.type)) counts.text += 1;
    else if (voiceTypes.has(channel.type)) counts.voice += 1;
  }
  return counts;
}

function escapeRoleName(value: string): string {
  return value.replace(/([\\`*_{}[\]()<>#+\-.!|])/g, "\\$1");
}

export function formatRoleSummary(
  roles: Iterable<RoleLike>,
  everyoneRoleId: string,
  maxRoles = 14,
  maxLength = 900
): ServerRoleSummary {
  const sorted = [...roles]
    .filter((role) => role.id !== everyoneRoleId)
    .sort((left, right) => right.position - left.position);
  const visible: string[] = [];

  for (const role of sorted.slice(0, maxRoles)) {
    const candidate = `\`${escapeRoleName(role.name)}\``;
    const next = [...visible, candidate].join("  ");
    if (next.length > maxLength) break;
    visible.push(candidate);
  }

  const hiddenCount = sorted.length - visible.length;
  const suffix = hiddenCount > 0 ? `\n*+${hiddenCount} more role${hiddenCount === 1 ? "" : "s"}*` : "";
  return {
    count: sorted.length,
    text: visible.length > 0 ? `${visible.join("  ")}${suffix}` : "No roles beyond @everyone."
  };
}
