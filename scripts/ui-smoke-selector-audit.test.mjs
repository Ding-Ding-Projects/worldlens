import assert from "node:assert/strict";
import test from "node:test";
import { missingSelectors } from "./ui-smoke-selector-audit.mjs";

test("selector audit catches an invented stable hook", () => {
  const matrix = { rows: [{ id: "x", selector: "[data-testid=not-real]" }] };
  assert.deepEqual(missingSelectors(matrix, "<button data-testid=real>"), [{ id: "x", selector: "[data-testid=not-real]" }]);
});

test("selector audit accepts an exact source hook", () => {
  const matrix = { rows: [{ id: "x", selector: "[data-testid=real]" }] };
  assert.deepEqual(missingSelectors(matrix, '<button data-testid="real">'), []);
});

test("selector audit keeps explicit semantic contracts for runtime proof", () => {
  const matrix = { rows: [{ id: "x", selector: "role=button" }] };
  assert.deepEqual(missingSelectors(matrix, ""), []);
});
