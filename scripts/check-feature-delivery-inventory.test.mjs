import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderMarkdownInventory, validateInventory, validateMarkdownInventory } from "./check-feature-delivery-inventory.mjs";

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
test("the checked-in Markdown companion exactly corresponds to the JSON", () => {
  const markdown = readFileSync(new URL("../docs/contracts/feature-delivery-inventory.md", import.meta.url), "utf8");
  assert.deepEqual(validateMarkdownInventory(read(), markdown), []);
});
test("missing rows, obsolete IDs and stale mapping summaries fail correspondence", () => {
  const document = read();
  const markdown = renderMarkdownInventory(document);
  const frontRow = markdown.split("\n").find((line) => line.startsWith("| `front-provenance` |"));
  assert.ok(frontRow?.includes("FrontBuildProvenance.vue"));
  for (const mutation of [
    markdown.replace(/^\| `language` \|.*\n/mu, ""),
    markdown.replace("`mobile-site`", "`obsolete-inventory-id`"),
    markdown.replace(frontRow, "| `front-provenance` | Front provenance | None recorded | Not yet mapped | pending-review |"),
    markdown.replace("- `instruction-single-file-editions`:", "- `obsolete-exclusion`:") ,
  ]) {
    assert.notEqual(mutation, markdown);
    assert.equal(validateMarkdownInventory(document, mutation).length, 1);
  }
  assert.deepEqual(validateMarkdownInventory(document, markdown), []);
});
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
test("new import and private packaging obligations cannot disappear from the ledger", () => {
  for (const id of ["vocabulary-drop-apply", "private-documentation-package"]) {
    const document = read();
    document.features = document.features.filter((feature) => feature.id !== id);
    assert.ok(validateInventory(document).failures.includes(`Missing required feature: ${id}`));
  }
});
test("delivery obligations outside the catalogue are independently required", () => {
  for (const id of ["documentation-companion", "build-gui-companion", "hosted-deployment-tools"]) {
    const document = read();
    document.deliveryObligations = document.deliveryObligations.filter((feature) => feature.id !== id);
    assert.ok(validateInventory(document).failures.includes(`Missing required feature: ${id}`));
  }
  const document = read();
  delete document.deliveryObligations;
  assert.ok(validateInventory(document).failures.includes("Missing additional delivery obligations"));
});
test("a verified catalogue cannot conceal pending delivery companions", () => {
  const document = read();
  for (const feature of document.features) {
    for (const state of Object.values(feature.surfaces)) {
      if (state.applicability === "not-applicable") continue;
      state.implementation = state.runtimeAcceptance = state.captureAcceptance = "verified";
      state.acceptanceEvidence = [{
        path: "README.md", sourceCommit: "a".repeat(40), sha256: "b".repeat(64),
      }];
    }
  }
  const result = validateInventory(document, { requireComplete: true });
  assert.deepEqual(result.pending.map((label) => label.split("/")[0]).filter((id, index, all) => all.indexOf(id) === index), ["documentation-companion", "build-gui-companion", "hosted-deployment-tools"]);
  assert.ok(result.failures.some((value) => value.includes("remain incomplete")));
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
