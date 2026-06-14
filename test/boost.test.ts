import test from "node:test";
import assert from "node:assert/strict";
import { renderBoostTemplate } from "../src/shared/boost.js";

test("renders all supported boost message variables", () => {
  assert.equal(
    renderBoostTemplate(
      "Thanks {user} for boosting {server}. Boosts: {boostCount}; level: {tier}.",
      {
        user: "<@123>",
        server: "Odyssey",
        boostCount: 14,
        tier: "Tier 2"
      }
    ),
    "Thanks <@123> for boosting Odyssey. Boosts: 14; level: Tier 2."
  );
});
