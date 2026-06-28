import test from "node:test";
import assert from "node:assert/strict";
import {
  hasFormStateChanged,
  nextSearchIndex,
  searchDashboardItems,
  shouldBlockNavigation,
  toggleState
} from "../src/dashboard/public/dashboard-core.js";

test("dashboard search resolves common Auto Roles aliases", () => {
  for (const query of ["auto role", "autorole", "automatic roles"]) {
    const [result] = searchDashboardItems(query);
    assert.equal(result?.label, "Auto Roles");
    assert.equal(result?.page, "welcome");
  }
});

test("dashboard search finds the server logging settings", () => {
  assert.equal(searchDashboardItems("audit logs")[0]?.page, "logging");
  assert.equal(searchDashboardItems("voice logs")[0]?.label, "Server Logs");
});

test("dashboard search finds direct message settings", () => {
  assert.ok(searchDashboardItems("staff dm").some((item) => item.label === "Staff /dm command"));
  assert.equal(searchDashboardItems("moderation dm")[0]?.page, "dms");
  assert.ok(searchDashboardItems("winner dm").some((item) => item.label === "Giveaway winner DMs"));
});

test("dashboard search surfaces categorized role and verification destinations", () => {
  const roleResults = searchDashboardItems("roles");
  assert.ok(roleResults.some((item) => item.label === "Role Panels" && item.category === "Page"));
  assert.ok(roleResults.some((item) => item.label === "Staff and admin roles" && item.category === "Setting"));
  assert.ok(roleResults.some((item) => item.label === "Role event logging" && item.category === "Setting"));

  const verificationResults = searchDashboardItems("verification");
  assert.ok(verificationResults.some((item) => item.label === "Verification" && item.page === "security"));
  assert.ok(verificationResults.some((item) => item.label === "Verification setup guide" && item.docTopic === "verification-process"));
  assert.ok(verificationResults.some((item) => item.label === "Verification channel" && item.targetId === "verification-form"));
  assert.equal(searchDashboardItems("kick unverified")[0]?.label, "Verification auto-kick");
  assert.equal(searchDashboardItems("pending verification")[0]?.label, "Verification");
});

test("dashboard search resolves Role Panels 2.0 aliases", () => {
  for (const query of ["reaction roles", "button roles", "dropdown roles", "self roles", "role hierarchy"]) {
    const result = searchDashboardItems(query)[0];
    assert.equal(result?.label, "Role Panels", query);
    assert.equal(result?.page, "automation", query);
    assert.equal(result?.automationView, "role-panels", query);
  }
});

test("dashboard search resolves moderation case aliases", () => {
  for (const query of ["cases", "case system", "moderation cases", "untimeout", "unban"]) {
    const result = searchDashboardItems(query)[0];
    assert.equal(result?.label, "Moderation", query);
    assert.equal(result?.page, "moderation", query);
  }
});

test("dashboard search covers major feature areas and direct settings", () => {
  for (const query of ["automod", "tickets", "logging", "moderation", "commands", "socials"]) {
    assert.ok(searchDashboardItems(query).length > 0, `${query} should have search results`);
  }
  assert.equal(searchDashboardItems("allowed domains")[0]?.targetId, "automod-link-rules-section");
});

test("dashboard search keyboard navigation wraps through results", () => {
  assert.equal(nextSearchIndex(-1, 3, "ArrowDown"), 0);
  assert.equal(nextSearchIndex(2, 3, "ArrowDown"), 0);
  assert.equal(nextSearchIndex(0, 3, "ArrowUp"), 2);
  assert.equal(nextSearchIndex(0, 0, "ArrowDown"), -1);
});

test("toggle state labels agree with enabled and active values", () => {
  assert.deepEqual(toggleState(true), { enabled: true, label: "Enabled" });
  assert.deepEqual(toggleState(false), { enabled: false, label: "Disabled" });
  assert.deepEqual(toggleState(true, true), { enabled: true, label: "Active" });
  assert.deepEqual(toggleState(false, true), { enabled: false, label: "Inactive" });
});

test("navigation is blocked only when at least one form is dirty", () => {
  assert.equal(shouldBlockNavigation(0), false);
  assert.equal(shouldBlockNavigation(1), true);
  assert.equal(shouldBlockNavigation(3), true);
});

test("unsaved state comparison only reports changed fingerprints", () => {
  const baseline = JSON.stringify([["serverName", "text", "Odyssey Bot"]]);
  assert.equal(hasFormStateChanged(baseline, baseline), false);
  assert.equal(
    hasFormStateChanged(
      baseline,
      JSON.stringify([["serverName", "text", "Odyssey Support"]])
    ),
    true
  );
});
