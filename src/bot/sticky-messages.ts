import { Message, TextChannel } from "discord.js";
import {
  getStickyMessageByChannel,
  updateStickyMessageLastMessage
} from "../database/index.js";

const pending = new Map<string, NodeJS.Timeout>();
const lastPostedAt = new Map<string, number>();

export async function handleStickyActivity(message: Message): Promise<void> {
  if (!message.guildId || message.author.bot || !(message.channel instanceof TextChannel)) return;
  const channel = message.channel;
  const sticky = await getStickyMessageByChannel(message.guildId, message.channelId);
  if (!sticky?.enabled) return;

  const key = `${message.guildId}:${message.channelId}`;
  const elapsed = Date.now() - (lastPostedAt.get(key) ?? 0);
  const delay = Math.max(1_500, sticky.minIntervalSeconds * 1000 - elapsed);
  const existing = pending.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    pending.delete(key);
    if (sticky.lastMessageId) {
      const previous = await channel.messages.fetch(sticky.lastMessageId).catch(() => null);
      if (previous?.author.id === message.client.user.id) {
        await previous.delete().catch(() => undefined);
      }
    }
    const sent = await channel.send(sticky.content).catch(() => null);
    if (sent) {
      lastPostedAt.set(key, Date.now());
      await updateStickyMessageLastMessage(sticky.id, sticky.guildId, sent.id);
    }
  }, delay);
  timer.unref();
  pending.set(key, timer);
}
