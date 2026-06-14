import type { AutoModSettings } from "./types.js";

interface CacheEntry {
  expiresAt: number;
  settings: AutoModSettings;
}

const cache = new Map<string, CacheEntry>();
const cacheTtlMs = 2_000;

export async function getCachedAutoModSettings(
  guildId: string,
  loader: (id: string) => Promise<AutoModSettings>
): Promise<AutoModSettings> {
  const cached = cache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.settings;
  const settings = await loader(guildId);
  cache.set(guildId, { settings, expiresAt: Date.now() + cacheTtlMs });
  return settings;
}

export function updateAutoModSettingsCache(settings: AutoModSettings): void {
  cache.set(settings.guildId, { settings, expiresAt: Date.now() + cacheTtlMs });
}

export function invalidateAutoModSettingsCache(guildId?: string): void {
  if (guildId) cache.delete(guildId);
  else cache.clear();
}
