export type AutoModReadinessStatus = "ready" | "warning" | "degraded" | "offline";

export type AutoModReadinessCheck = {
  label: string;
  ok: boolean;
};

export type AutoModReadinessExemptions = {
  ignoredChannels: Array<{ id: string; name: string }>;
  ignoredRoles: Array<{ id: string; name: string }>;
  ignoredUserIds: string[];
};

export type AutoModReadinessResult = {
  ok: boolean;
  status: AutoModReadinessStatus;
  summary: string;
  warnings: string[];
  checks: AutoModReadinessCheck[];
  exemptions: AutoModReadinessExemptions | null;
  checkedAt: string;
  lastSuccessfulAt?: string;
  stale?: boolean;
  unavailable?: boolean;
  retryable?: boolean;
};

type CacheEntry = {
  expiresAt: number;
  value: AutoModReadinessResult;
};

export class AutoModReadinessCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number) {}

  getFresh(guildId: string, now = Date.now()): AutoModReadinessResult | null {
    const entry = this.entries.get(guildId);
    return entry && entry.expiresAt > now ? entry.value : null;
  }

  getLast(guildId: string): AutoModReadinessResult | null {
    return this.entries.get(guildId)?.value ?? null;
  }

  set(guildId: string, value: AutoModReadinessResult, now = Date.now()): void {
    this.entries.set(guildId, {
      expiresAt: now + this.ttlMs,
      value
    });
  }

  delete(guildId: string): void {
    this.entries.delete(guildId);
  }
}

export async function retryReadinessRequest<T>(
  request: () => Promise<T>,
  attempts = 2,
  delayMs = 175
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (attempt < attempts && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

export function buildUnavailableReadiness(
  cached: AutoModReadinessResult | null,
  checkedAt = new Date().toISOString(),
  copy?: { summary?: string; warning?: string }
): AutoModReadinessResult {
  if (cached) {
    return {
      ...cached,
      ok: false,
      status: "degraded",
      summary: copy?.summary
        ? `${copy.summary} Showing the last successful readiness result.`
        : "Discord did not answer the latest check. Showing the last successful readiness result.",
      warnings: [
        copy?.warning
          || "Live Discord permissions and intents could not be refreshed. Saved AutoMod settings are still editable and the last successful check is shown below."
      ],
      checkedAt,
      lastSuccessfulAt: cached.checkedAt,
      stale: true,
      unavailable: true,
      retryable: true
    };
  }

  return {
    ok: false,
    status: "offline",
    summary: copy?.summary || "Live Discord readiness is temporarily unavailable.",
    warnings: [
      copy?.warning
        || "The dashboard could not refresh Discord permissions and intents. Saved AutoMod settings can still be edited and saved."
    ],
    checks: [],
    exemptions: null,
    checkedAt,
    unavailable: true,
    retryable: true
  };
}
