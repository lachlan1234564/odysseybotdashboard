import test from "node:test";
import assert from "node:assert/strict";
import { resolveGuildSelection } from "../src/dashboard/guild-selection.js";

const guilds = [
  { id: "100", name: "Alpha" },
  { id: "200", name: "Beta" }
];

test("one manageable guild is selected automatically", () => {
  assert.deepEqual(resolveGuildSelection([guilds[0]!]), {
    selectedGuildId: "100",
    autoSelected: true,
    selectionRequired: false
  });
});

test("multiple guilds require a selection after login", () => {
  assert.deepEqual(resolveGuildSelection(guilds), {
    selectedGuildId: null,
    autoSelected: false,
    selectionRequired: true
  });
});

test("a valid existing guild selection is retained", () => {
  assert.deepEqual(resolveGuildSelection(guilds, "200"), {
    selectedGuildId: "200",
    autoSelected: false,
    selectionRequired: false
  });
});

test("a stale guild selection is rejected", () => {
  assert.deepEqual(resolveGuildSelection(guilds, "999"), {
    selectedGuildId: null,
    autoSelected: false,
    selectionRequired: true
  });
});
