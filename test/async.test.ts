import test from "node:test";
import assert from "node:assert/strict";
import { withTimeout } from "../src/shared/async.js";

test("returns a completed request before its timeout", async () => {
  assert.equal(await withTimeout(Promise.resolve("ready"), 50, "Fast request"), "ready");
});

test("returns a clear timeout error instead of waiting forever", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => undefined), 10, "Ticket type database query"),
    /Ticket type database query timed out after 10ms/
  );
});
