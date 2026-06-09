import { Client, TextChannel } from "discord.js";
import {
  listDueScheduledAnnouncements,
  markScheduledAnnouncementRun
} from "../database/index.js";
import { buildAnnouncementMessage, getMissingAnnouncementPermission } from "./announcements.js";
import { logError } from "../shared/logging.js";

function nextRun(schedule: { scheduleType: string; intervalMinutes: number | null }): string | null {
  if (schedule.scheduleType !== "repeat" || !schedule.intervalMinutes) return null;
  return new Date(Date.now() + schedule.intervalMinutes * 60_000).toISOString();
}

export async function processScheduledAnnouncements(client: Client): Promise<void> {
  for (const schedule of await listDueScheduledAnnouncements()) {
    const guild = client.guilds.cache.get(schedule.guildId);
    const channel = guild
      ? await guild.channels.fetch(schedule.channelId).catch(() => null)
      : null;
    const built = guild
      ? await buildAnnouncementMessage(
        guild,
        schedule.announcementTemplateId,
        channel instanceof TextChannel ? channel : null
      )
      : null;

    if (!guild || !(channel instanceof TextChannel) || !built) {
      await markScheduledAnnouncementRun(schedule, nextRun(schedule));
      continue;
    }

    const { message } = built;
    const missingPermission = getMissingAnnouncementPermission(guild, channel, message, schedule.pingType);
    if (missingPermission) {
      await markScheduledAnnouncementRun(schedule, new Date(Date.now() + 5 * 60_000).toISOString());
      continue;
    }
    const ping = schedule.pingType === "none" ? "" : `@${schedule.pingType}`;
    const sent = await channel.send({
      ...message,
      content: [ping, message.content].filter(Boolean).join("\n") || undefined,
      allowedMentions: ping ? { parse: ["everyone"] as const } : { parse: [] }
    }).then(() => true).catch((error) => {
      logError("Scheduled announcement failed", error);
      return false;
    });
    const next = sent
      ? nextRun(schedule)
      : new Date(Date.now() + 5 * 60_000).toISOString();
    await markScheduledAnnouncementRun(schedule, next);
  }
}
