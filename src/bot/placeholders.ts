import type { Guild, User } from "discord.js";
import type { TicketRecord } from "../database/index.js";
import type { TicketType } from "../shared/types.js";
import type { PlaceholderValues } from "../shared/placeholders.js";

function discordDate(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === "number" ? value : new Date(value).getTime();
  return Number.isFinite(timestamp) ? `<t:${Math.floor(timestamp / 1000)}:F>` : "";
}

export function buildDiscordPlaceholders(input: {
  guild: Guild;
  channel?: { id: string; name?: string | null } | null;
  user?: User | null;
  target?: User | null;
  text?: string;
  reason?: string;
  ticket?: TicketRecord | null;
  ticketType?: TicketType | null;
  createdAt?: Date | string | number | null;
  closedAt?: Date | string | number | null;
  boostCount?: number | string;
  tier?: string;
}): PlaceholderValues {
  const { guild, channel, user, target, ticket, ticketType } = input;
  const channelName = channel && "name" in channel ? String(channel.name ?? "") : "";
  const createdAt = input.createdAt ?? ticket?.openedAt ?? null;
  const closedAt = input.closedAt ?? ticket?.closedAt ?? null;

  return {
    user: user ? `<@${user.id}>` : "@user",
    username: user?.username ?? "user",
    server: guild.name,
    channel: channel ? `<#${channel.id}>` : "#channel",
    text: input.text ?? "",
    reason: input.reason ?? "",
    target: target ? `<@${target.id}>` : user ? `<@${user.id}>` : "@target",
    memberCount: String(guild.memberCount ?? 0),
    createdAt: discordDate(user?.createdTimestamp),
    server_name: guild.name,
    server_id: guild.id,
    server_member_count: String(guild.memberCount ?? 0),
    server_created_at: discordDate(guild.createdTimestamp),
    server_icon: guild.iconURL({ size: 1024 }) ?? "",
    channel_name: channelName,
    channel_id: channel?.id ?? "",
    user_name: user?.username ?? "",
    user_id: user?.id ?? "",
    user_avatar: user?.displayAvatarURL({ size: 1024 }) ?? "",
    ticket_id: ticket ? String(ticket.id) : "",
    ticket_category: ticketType?.label ?? "",
    created_at: discordDate(createdAt),
    closed_at: discordDate(closedAt),
    boostCount: input.boostCount === undefined ? "" : String(input.boostCount),
    tier: input.tier ?? ""
  };
}
