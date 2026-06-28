import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStableVerificationUrl,
  planVerificationVisibility,
  sanitizeVerificationChannelName,
  shouldAutoKickUnverified
} from "../src/shared/verification-plan.js";

test("builds a stable server-specific verification URL", () => {
  assert.equal(
    buildStableVerificationUrl("https://verify.example.com/", "123456789012345678"),
    "https://verify.example.com/verify/server/123456789012345678"
  );
  assert.throws(
    () => buildStableVerificationUrl("http://localhost:3210", "123456789012345678"),
    /public HTTPS URL/
  );
});

test("normalizes verification channel names", () => {
  assert.equal(sanitizeVerificationChannelName("  Community Verify!  "), "community-verify");
  assert.equal(sanitizeVerificationChannelName("!!!"), "verify");
});

test("verification visibility gives hidden selections precedence", () => {
  const channels = [
    { id: "100", name: "public", type: 4, permission_overwrites: [] },
    { id: "101", name: "welcome", type: 0, parent_id: "100", permission_overwrites: [] },
    { id: "200", name: "private", type: 4, permission_overwrites: [] },
    { id: "201", name: "staff", type: 0, parent_id: "200", permission_overwrites: [] },
    { id: "300", name: "verify", type: 0, permission_overwrites: [] }
  ];
  const plan = planVerificationVisibility(channels, {
    verificationChannelId: "300",
    publicChannelIds: ["201"],
    publicCategoryIds: ["100"],
    hiddenChannelIds: ["201"],
    hiddenCategoryIds: [],
    lockAllChannels: true
  });
  const byId = new Map(plan.map((item) => [item.channel.id, item]));
  assert.equal(byId.get("101")?.visibility, "public");
  assert.equal(byId.get("201")?.visibility, "hidden");
  assert.equal(byId.get("300")?.visibility, "public");
  assert.equal(byId.get("300")?.inherited, false);
});

test("synced child channels inherit category gate changes", () => {
  const overwrites = [{ id: "999", type: 0 as const, allow: "0", deny: "1024" }];
  const plan = planVerificationVisibility([
    { id: "400", name: "members", type: 4, permission_overwrites: overwrites },
    { id: "401", name: "general", type: 0, parent_id: "400", permission_overwrites: overwrites }
  ], {
    verificationChannelId: null,
    publicChannelIds: [],
    publicCategoryIds: [],
    hiddenChannelIds: [],
    hiddenCategoryIds: [],
    lockAllChannels: true
  });
  assert.equal(plan.find((item) => item.channel.id === "401")?.inherited, true);
});

test("auto-kick eligibility protects trusted and recently joined members", () => {
  const base = {
    enabled: true,
    autoKickUnverified: true,
    autoKickAfterHours: 24,
    verifiedRoleId: "verified",
    joinedAt: "2026-06-18T00:00:00.000Z",
    memberRoleIds: ["member"],
    trustedRoleIds: ["staff"],
    isBot: false,
    hasAdminPermission: false,
    nowMs: Date.parse("2026-06-20T01:00:00.000Z")
  };

  assert.equal(shouldAutoKickUnverified(base).kick, true);
  assert.equal(
    shouldAutoKickUnverified({ ...base, memberRoleIds: ["staff"] }).reason,
    "trusted_role"
  );
  assert.equal(
    shouldAutoKickUnverified({ ...base, joinedAt: "2026-06-19T12:00:00.000Z" }).reason,
    "within_pending_window"
  );
  assert.equal(
    shouldAutoKickUnverified({ ...base, memberRoleIds: ["verified"] }).reason,
    "already_verified"
  );
});
