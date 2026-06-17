import test from "node:test";
import assert from "node:assert/strict";
import { ChannelType } from "discord.js";
import {
  countServerChannels,
  formatRoleSummary
} from "../src/bot/server-info.js";

test("server info groups category, text, and voice channel types", () => {
  const counts = countServerChannels([
    { type: ChannelType.GuildCategory },
    { type: ChannelType.GuildText },
    { type: ChannelType.GuildAnnouncement },
    { type: ChannelType.GuildForum },
    { type: ChannelType.GuildMedia },
    { type: ChannelType.GuildVoice },
    { type: ChannelType.GuildStageVoice }
  ]);
  assert.deepEqual(counts, { categories: 1, text: 4, voice: 2 });
});

test("server info role summaries stay readable on large servers", () => {
  const roles = Array.from({ length: 30 }, (_, index) => ({
    id: String(index + 1),
    name: `Role ${index + 1}`,
    position: index + 1
  }));
  roles.push({ id: "guild", name: "@everyone", position: 0 });

  const summary = formatRoleSummary(roles, "guild", 5);
  assert.equal(summary.count, 30);
  assert.match(summary.text, /Role 30/);
  assert.match(summary.text, /\+25 more roles/);
  assert.ok(summary.text.length <= 900);
});

test("server info safely handles a server with no extra roles", () => {
  const summary = formatRoleSummary(
    [{ id: "guild", name: "@everyone", position: 0 }],
    "guild"
  );
  assert.deepEqual(summary, {
    count: 0,
    text: "No roles beyond @everyone."
  });
});
