import test from "node:test";
import assert from "node:assert/strict";
import {
  assertUniqueCommandNames,
  commandData,
  slashCommandNames
} from "../src/bot/commands.js";

test("every registered slash command has an exhaustive routing name", () => {
  const registered = commandData.map((command) => command.name).sort();
  const routed = [...slashCommandNames].sort();
  assert.deepEqual(registered, routed);
  assert.equal(new Set(registered).size, registered.length);
});

test("server info is registered only as the preferred subcommand", () => {
  const server = commandData.find((command) => command.name === "server");
  const legacy = commandData.find((command) => command.name === "server-info");
  assert.ok(server);
  assert.equal(legacy, undefined);
  assert.equal(server.options?.[0]?.name, "info");
});

test("duplicate slash command names are rejected before deployment", () => {
  assert.doesNotThrow(() => assertUniqueCommandNames(commandData));
  assert.throws(
    () => assertUniqueCommandNames([{ name: "ping" }, { name: "ping" }]),
    /Duplicate top-level slash commands: ping/
  );
});
