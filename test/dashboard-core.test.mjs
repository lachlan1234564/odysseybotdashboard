import test from "node:test";
import assert from "node:assert/strict";
import {
  hasFormStateChanged,
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
