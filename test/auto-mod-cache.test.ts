import test from "node:test";
import assert from "node:assert/strict";
import {
  getCachedAutoModSettings,
  invalidateAutoModSettingsCache,
  updateAutoModSettingsCache
} from "../src/shared/auto-mod-cache.js";
import type { AutoModSettings } from "../src/shared/types.js";

function settings(guildId: string, enabled: boolean): AutoModSettings {
  return { guildId, enabled } as AutoModSettings;
}

test("Auto Mod settings are reused and can be updated or invalidated", async () => {
  invalidateAutoModSettingsCache();
  let loads = 0;
  const loader = async (guildId: string) => {
    loads += 1;
    return settings(guildId, true);
  };

  assert.equal((await getCachedAutoModSettings("100", loader)).enabled, true);
  assert.equal((await getCachedAutoModSettings("100", loader)).enabled, true);
  assert.equal(loads, 1);

  updateAutoModSettingsCache(settings("100", false));
  assert.equal((await getCachedAutoModSettings("100", loader)).enabled, false);
  assert.equal(loads, 1);

  invalidateAutoModSettingsCache("100");
  assert.equal((await getCachedAutoModSettings("100", loader)).enabled, true);
  assert.equal(loads, 2);
});
