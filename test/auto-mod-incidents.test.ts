import test from "node:test";
import assert from "node:assert/strict";
import {
  claimIncidentCooldown,
  deleteIncidentMessages
} from "../src/shared/auto-mod-incidents.js";

test("deletes every unique repeated-ping message and summarizes channels once", async () => {
  const removed: string[] = [];
  const result = await deleteIncidentMessages([
    { messageId: "one", channelId: "10", timestamp: 1 },
    { messageId: "two", channelId: "11", timestamp: 2 },
    { messageId: "one", channelId: "10", timestamp: 1 },
    { messageId: "gone", channelId: "12", timestamp: 3 },
    { messageId: "blocked", channelId: "13", timestamp: 4 }
  ], async (entry) => {
    removed.push(entry.messageId);
    if (entry.messageId === "gone") return "missing";
    if (entry.messageId === "blocked") return "failed";
    return "deleted";
  });

  assert.deepEqual(removed, ["one", "two", "gone", "blocked"]);
  assert.deepEqual(result, {
    deleted: 2,
    failed: 1,
    channels: ["10", "11"]
  });
});

test("incident cooldown allows one notification during the configured window", () => {
  const cooldowns = new Map<string, number>();
  assert.equal(claimIncidentCooldown(cooldowns, "guild:user:rule", 1_000, 30_000), true);
  assert.equal(claimIncidentCooldown(cooldowns, "guild:user:rule", 5_000, 30_000), false);
  assert.equal(claimIncidentCooldown(cooldowns, "guild:user:rule", 31_001, 30_000), true);
});
