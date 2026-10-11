import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateInventory } from "./check-feature-delivery-inventory.mjs";

const read = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../docs/contracts/feature-delivery-inventory.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
test("the current inventory is structurally valid but not complete", () => {
  assert.deepEqual(validateInventory(read()).failures, []);
  assert.ok(
    validateInventory(read(), { requireComplete: true }).failures.some(
      (value) => value.includes("remain incomplete"),
    ),
  );
});
test("a missing required feature is rejected", () => {
  const document = read();
  document.features.pop();
  assert.ok(
    validateInventory(document).failures.some((value) =>
      value.includes("Missing required feature"),
    ),
  );
});
test("duplicate IDs and missing surface scopes are rejected", () => {
  const document = read();
  document.features[1].id = document.features[0].id;
  delete document.features[0].surfaces.desktop;
  const result = validateInventory(document);
  assert.ok(result.failures.some((value) => value.includes("duplicate")));
  assert.ok(
    result.failures.some((value) =>
      value.includes("Surface inventory mismatch"),
    ),
  );
});
test("a completion label cannot conceal pending acceptance", () => {
  const document = read();
  document.status = "complete";
  assert.ok(
    validateInventory(document).failures.includes(
      "Complete status contradicts pending acceptance",
    ),
  );
});
test("verified claims require source-bound evidence and safe existing paths", () => {
  const document = read();
  const state = document.features[0].surfaces.desktop;
  state.implementation = "verified";
  assert.ok(
    validateInventory(document).failures.some((value) =>
      value.includes("Unsubstantiated verification"),
    ),
  );
  state.acceptanceEvidence = [
    { path: "../outside", sourceCommit: "stale", sha256: "unknown" },
  ];
  const result = validateInventory(document);
  assert.ok(
    result.failures.some((value) =>
      value.includes("Invalid repository evidence path"),
    ),
  );
  assert.ok(
    result.failures.some((value) =>
      value.includes("Unbound acceptance evidence"),
    ),
  );
});
