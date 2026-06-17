import test from "node:test";
import assert from "node:assert/strict";
import {
  ChatInputCommandInteraction,
  MessageFlags
} from "discord.js";
import {
  deferCommandReply,
  replyEphemeral,
  replyToCommand
} from "../src/bot/interactions.js";

function fakeInteraction(state: { deferred?: boolean; replied?: boolean } = {}) {
  const calls: Array<{ method: string; payload: unknown }> = [];
  const interaction = {
    deferred: Boolean(state.deferred),
    replied: Boolean(state.replied),
    deferReply: async (payload: unknown) => {
      calls.push({ method: "deferReply", payload });
      interaction.deferred = true;
    },
    reply: async (payload: unknown) => {
      calls.push({ method: "reply", payload });
      interaction.replied = true;
    },
    editReply: async (payload: unknown) => {
      calls.push({ method: "editReply", payload });
    },
    followUp: async (payload: unknown) => {
      calls.push({ method: "followUp", payload });
    }
  };
  return {
    calls,
    interaction: interaction as unknown as ChatInputCommandInteraction
  };
}

test("defers an unacknowledged command once with the flags API", async () => {
  const { interaction, calls } = fakeInteraction();
  await deferCommandReply(interaction);
  await deferCommandReply(interaction);
  assert.deepEqual(calls, [{
    method: "deferReply",
    payload: { flags: MessageFlags.Ephemeral }
  }]);
});

test("edits the original response after a command was deferred", async () => {
  const { interaction, calls } = fakeInteraction({ deferred: true });
  await replyEphemeral(interaction, "Finished");
  assert.deepEqual(calls, [{
    method: "editReply",
    payload: { content: "Finished" }
  }]);
});

test("uses a follow-up only after an existing command reply", async () => {
  const { interaction, calls } = fakeInteraction({ replied: true });
  await replyToCommand(interaction, { content: "More detail" });
  assert.deepEqual(calls, [{
    method: "followUp",
    payload: { content: "More detail" }
  }]);
});

test("uses a normal reply for an unacknowledged command", async () => {
  const { interaction, calls } = fakeInteraction();
  await replyEphemeral(interaction, "Private response");
  assert.deepEqual(calls, [{
    method: "reply",
    payload: {
      content: "Private response",
      flags: MessageFlags.Ephemeral
    }
  }]);
});
