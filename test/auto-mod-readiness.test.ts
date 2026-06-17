import test from "node:test";
import assert from "node:assert/strict";
import {
  AutoModReadinessCache,
  buildUnavailableReadiness,
  retryReadinessRequest,
  type AutoModReadinessResult
} from "../src/dashboard/auto-mod-readiness.js";

const readyResult: AutoModReadinessResult = {
  ok: true,
  status: "ready",
  summary: "Discord is ready.",
  warnings: [],
  checks: [{ label: "Message Content Intent", ok: true }],
  exemptions: {
    ignoredChannels: [],
    ignoredRoles: [],
    ignoredUserIds: []
  },
  checkedAt: "2026-06-15T10:00:00.000Z"
};

test("AutoMod readiness cache is isolated by guild and retains the last successful result", () => {
  const cache = new AutoModReadinessCache(1_000);
  cache.set("guild-a", readyResult, 1_000);

  assert.equal(cache.getFresh("guild-a", 1_500)?.status, "ready");
  assert.equal(cache.getFresh("guild-b", 1_500), null);
  assert.equal(cache.getFresh("guild-a", 2_100), null);
  assert.equal(cache.getLast("guild-a")?.checkedAt, readyResult.checkedAt);
});

test("readiness retry succeeds after one transient failure", async () => {
  let attempts = 0;
  const result = await retryReadinessRequest(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary timeout");
    return "ready";
  }, 2, 0);

  assert.equal(result, "ready");
  assert.equal(attempts, 2);
});

test("unavailable readiness uses a degraded cached result when possible", () => {
  const degraded = buildUnavailableReadiness(readyResult, "2026-06-15T10:05:00.000Z");
  assert.equal(degraded.status, "degraded");
  assert.equal(degraded.stale, true);
  assert.equal(degraded.lastSuccessfulAt, readyResult.checkedAt);
  assert.equal(degraded.checks.length, 1);
});

test("unavailable readiness stays contained when no cached result exists", () => {
  const offline = buildUnavailableReadiness(null, "2026-06-15T10:05:00.000Z");
  assert.equal(offline.status, "offline");
  assert.equal(offline.retryable, true);
  assert.deepEqual(offline.checks, []);
  assert.equal(offline.exemptions, null);
});
