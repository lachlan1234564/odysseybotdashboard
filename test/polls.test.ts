import test from "node:test";
import assert from "node:assert/strict";
import {
  nextPollSelection,
  pollPublicDescription,
  tallyPollVotes
} from "../src/shared/polls.js";
import type { Poll, PollVote } from "../src/shared/types.js";

const poll: Pick<Poll, "options" | "question" | "resultsVisibility" | "status" | "multipleChoice"> = {
  question: "Pick one",
  resultsVisibility: "public",
  status: "active",
  multipleChoice: false,
  options: [
    { id: "1", label: "Alpha", text: "Alpha", description: "", emoji: "" },
    { id: "2", label: "Bravo", text: "Bravo", description: "", emoji: "" },
    { id: "3", label: "Charlie", text: "Charlie", description: "", emoji: "" }
  ]
};

function vote(userId: string, optionIds: string[]): PollVote {
  return {
    pollId: 1,
    guildId: "123",
    userId,
    optionIds,
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z"
  };
}

test("tallies single-choice poll votes", () => {
  const results = tallyPollVotes(poll, [
    vote("1", ["1"]),
    vote("2", ["2"]),
    vote("3", ["2"])
  ]);

  assert.equal(results.totalVotes, 3);
  assert.deepEqual(results.options.map((option) => option.votes), [1, 2, 0]);
  assert.deepEqual(results.options.map((option) => option.percent), [33, 67, 0]);
});

test("tallies multiple-choice votes and ignores duplicate options in one ballot", () => {
  const results = tallyPollVotes(poll, [
    vote("1", ["1", "2", "2"]),
    vote("2", ["2", "3"])
  ]);

  assert.equal(results.totalVotes, 4);
  assert.deepEqual(results.options.map((option) => option.votes), [1, 2, 1]);
  assert.deepEqual(results.options.map((option) => option.percent), [25, 50, 25]);
});

test("ignores invalid option IDs", () => {
  const results = tallyPollVotes(poll, [
    vote("1", ["not-real"]),
    vote("2", ["3"])
  ]);

  assert.equal(results.totalVotes, 1);
  assert.deepEqual(results.options.map((option) => option.votes), [0, 0, 1]);
});

test("single-choice button vote replaces the previous option", () => {
  assert.deepEqual(nextPollSelection(poll, ["1"], "2"), ["2"]);
});

test("multiple-choice button vote toggles options without duplicates", () => {
  const multiple = { ...poll, multipleChoice: true };

  assert.deepEqual(nextPollSelection(multiple, ["1"], "2"), ["1", "2"]);
  assert.deepEqual(nextPollSelection(multiple, ["1", "2", "2"], "2"), ["1"]);
});

test("public poll description stays focused on the question and options", () => {
  const description = pollPublicDescription(poll, [
    vote("1", ["1"]),
    vote("2", ["2"])
  ]);

  assert.match(description, /\*\*Pick one\*\*/);
  assert.match(description, /\*\*1\.\*\* \*\*Alpha\*\*/);
  assert.match(description, /1 vote · 50%/);
  assert.doesNotMatch(description, /Status/);
  assert.doesNotMatch(description, /Manual close/);
  assert.doesNotMatch(description, /Access/);
});
