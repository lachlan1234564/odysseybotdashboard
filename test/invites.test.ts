import test from "node:test";
import assert from "node:assert/strict";
import { containsDiscordInvite } from "../src/shared/invites.js";

test("matches common Discord invite URL formats", () => {
  const invites = [
    "discord.gg/odyssey",
    "https://discord.gg/odyssey",
    "https://www.discord.com/invite/odyssey",
    "discord.com/invite/odyssey",
    "https://discordapp.com/invite/odyssey?event=1"
  ];
  for (const invite of invites) assert.equal(containsDiscordInvite(invite), true, invite);
});

test("does not match ordinary Discord links or unrelated text", () => {
  assert.equal(containsDiscordInvite("https://discord.com/channels/1/2"), false);
  assert.equal(containsDiscordInvite("Follow us at https://example.com"), false);
});
