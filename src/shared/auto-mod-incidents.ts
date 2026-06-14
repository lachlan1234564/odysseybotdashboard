import type { AutoModIncidentMessage } from "./auto-mod-rules.js";

export interface IncidentDeletionResult {
  deleted: number;
  failed: number;
  channels: string[];
}

export async function deleteIncidentMessages(
  entries: AutoModIncidentMessage[],
  removeMessage: (entry: AutoModIncidentMessage) => Promise<"deleted" | "missing" | "failed">
): Promise<IncidentDeletionResult> {
  let deleted = 0;
  let failed = 0;
  const channels = new Set<string>();
  const uniqueEntries = [...new Map(entries.map((entry) => [entry.messageId, entry])).values()];

  for (const entry of uniqueEntries) {
    const result = await removeMessage(entry);
    if (result === "deleted") {
      deleted += 1;
      channels.add(entry.channelId);
    } else if (result === "failed") {
      failed += 1;
    }
  }

  return { deleted, failed, channels: [...channels] };
}

export function claimIncidentCooldown(
  cooldowns: Map<string, number>,
  key: string,
  now: number,
  cooldownMs: number
): boolean {
  if ((cooldowns.get(key) ?? 0) > now) return false;
  cooldowns.set(key, now + Math.max(1_000, cooldownMs));
  return true;
}
