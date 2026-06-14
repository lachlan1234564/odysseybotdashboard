import test from "node:test";
import assert from "node:assert/strict";
import {
  createAutoModRuleState,
  evaluateAutoModMessage,
  type AutoModMessageSnapshot
} from "../src/shared/auto-mod-rules.js";
import type { AutoModSettings } from "../src/shared/types.js";

function settings(overrides: Partial<AutoModSettings> = {}): AutoModSettings {
  return {
    messageId: "message-1",
    guildId: "100",
    enabled: true,
    blockInvites: true,
    blockSuspiciousLinks: true,
    blockCaps: true,
    blockSpam: true,
    blockMassMentions: true,
    capsPercentage: 75,
    spamThreshold: 3,
    mentionThreshold: 4,
    mentionSpamThreshold: 3,
    mentionWindowSeconds: 30,
    action: "delete",
    timeoutMinutes: 10,
    alwaysBlockDiscordInvites: true,
    linkChannelRules: [],
    ignoredChannelIds: [],
    ignoredRoleIds: [],
    ignoredUserIds: [],
    logChannelId: null,
    ...overrides
  };
}

function message(overrides: Partial<AutoModMessageSnapshot> = {}): AutoModMessageSnapshot {
  return {
    guildId: "100",
    channelId: "200",
    authorId: "300",
    roleIds: [],
    isAdministrator: false,
    content: "ordinary message",
    mentionedUserIds: [],
    mentionedRoleIds: [],
    timestamp: 1_000_000,
    ...overrides
  };
}

test("matches each configured single-message AutoMod rule", () => {
  const cases: Array<[Partial<AutoModMessageSnapshot>, string]> = [
    [{ content: "join discord.gg/odyssey" }, "Discord invite link"],
    [{ content: "visit https://bit.ly/example" }, "Suspicious or disguised link"],
    [{ content: "THIS MESSAGE IS DEFINITELY ALL CAPS" }, "Excessive capital letters"],
    [{
      mentionedUserIds: ["1", "2", "3"],
      mentionedRoleIds: ["4"]
    }, "Mass mentions in one message"]
  ];
  for (const [input, expected] of cases) {
    assert.equal(
      evaluateAutoModMessage(message(input), settings(), createAutoModRuleState()).matchedRule,
      expected
    );
  }
});

test("matches repeated messages across channels in one guild", () => {
  const state = createAutoModRuleState();
  const config = settings({ spamThreshold: 3 });
  const first = evaluateAutoModMessage(message({ content: "same", channelId: "201" }), config, state);
  const second = evaluateAutoModMessage(message({ content: "same", channelId: "202", timestamp: 1_001_000 }), config, state);
  const third = evaluateAutoModMessage(message({ content: "same", channelId: "203", timestamp: 1_002_000 }), config, state);
  assert.equal(first.matchedRule, null);
  assert.equal(second.matchedRule, null);
  assert.equal(third.matchedRule, "Repeated message spam");
});

test("matches repeated pings to the same user across channels", () => {
  const state = createAutoModRuleState();
  const config = settings({ mentionSpamThreshold: 3, mentionWindowSeconds: 20 });
  for (let index = 0; index < 2; index += 1) {
    const result = evaluateAutoModMessage(message({
      messageId: `message-${index + 1}`,
      channelId: String(201 + index),
      mentionedUserIds: ["target"],
      timestamp: 1_000_000 + index * 2_000
    }), config, state);
    assert.equal(result.matchedRule, null);
  }
  const result = evaluateAutoModMessage(message({
    messageId: "message-3",
    channelId: "203",
    mentionedUserIds: ["target"],
    timestamp: 1_004_000
  }), config, state);
  assert.match(result.matchedRule ?? "", /Repeated ping abuse/);
  assert.deepEqual(
    result.incident?.messages.map(({ messageId, channelId }) => ({ messageId, channelId })),
    [
      { messageId: "message-1", channelId: "201" },
      { messageId: "message-2", channelId: "202" },
      { messageId: "message-3", channelId: "203" }
    ]
  );
});

test("does not track repeated-ping messages from exempt channels", () => {
  const state = createAutoModRuleState();
  const config = settings({
    mentionSpamThreshold: 2,
    ignoredChannelIds: ["exempt"]
  });
  const exempt = evaluateAutoModMessage(message({
    messageId: "exempt-message",
    channelId: "exempt",
    mentionedUserIds: ["target"]
  }), config, state);
  const allowed = evaluateAutoModMessage(message({
    messageId: "allowed-message",
    channelId: "allowed",
    mentionedUserIds: ["target"],
    timestamp: 1_001_000
  }), config, state);

  assert.match(exempt.skippedReason ?? "", /channel is exempt/);
  assert.equal(allowed.matchedRule, null);
  assert.equal(allowed.incident, null);
});

test("disabled, ignored, and exempt contexts provide an explicit skip reason", () => {
  assert.equal(
    evaluateAutoModMessage(message(), settings({ enabled: false }), createAutoModRuleState()).skippedReason,
    "feature disabled"
  );
  assert.equal(
    evaluateAutoModMessage(message({ isAdministrator: true }), settings(), createAutoModRuleState()).skippedReason,
    "administrator bypass"
  );
  assert.equal(
    evaluateAutoModMessage(
      message({ channelId: "200", content: "THIS MESSAGE IS DEFINITELY ALL CAPS" }),
      settings({ ignoredChannelIds: ["200"] }),
      createAutoModRuleState()
    ).skippedReason,
    "channel is exempt from non-link rules (200)"
  );
});
