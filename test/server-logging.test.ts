import test from "node:test";
import assert from "node:assert/strict";
import { beforeAfter, cleanLogText } from "../src/bot/server-logging.js";
import * as serverLogging from "../src/bot/server-logging.js";

test("server log text is bounded and neutralizes code fences", () => {
  const value = cleanLogText(`\`\`\`secret\`\`\`${"x".repeat(1200)}`, 100);
  assert.equal(value.length, 100);
  assert.equal(value.includes("```"), false);
  assert.equal(value.endsWith("…"), true);
});

test("server log before-and-after values stay readable when data is missing", () => {
  const value = beforeAfter(null, "new value");
  assert.match(value, /\*\*Before\*\*/);
  assert.match(value, /\*Unavailable\*/);
  assert.match(value, /\*\*After\*\*/);
  assert.match(value, /new value/);
});

test("server logging does not expose a global Discord profile update logger", () => {
  assert.equal("logUserUpdate" in serverLogging, false);
});
