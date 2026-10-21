#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Independently maintained required inventory. Do not derive this from the document being checked.
export const REQUIRED_IDS = Object.freeze([
  "language",
  "funny-emoji",
  "personal-vocabulary",
  "vocabulary-drop-apply",
  "private-documentation-package",
  "school-mode",
  "narration",
  "scheduled-settings",
  "dim-sum",
  "material-design",
  "workflow-navigation",
  "motion",
  "appearance-editor",
  "color-picker",
  "logo-customization",
  "file-converter",
  "minecraft-server-manager",
  "ollama-suite",
  "tabs",
  "element-locks",
  "support-tickets",
  "unlock-ladder",
  "authenticator",
  "adhd-modes",
  "local-history",
  "notifications",
  "guided-forms",
  "onboarding-wizard",
  "info-icon-guidance",
  "rich-controls",
  "regex-search",
  "command-palette",
  "offline-docs",
  "changelog",
  "external-editor",
  "exports",
  "bulk-actions",
  "super-confirmation",
  "overlay-panels",
  "progress-recovery",
  "download-handoff",
  "forge-publishing",
  "blank-editors",
  "collapse-filters",
  "front-provenance",
  "product-evidence",
  "completeness-parity",
  "display-name",
  "dim-sum-photo-source",
  "dim-sum-code-names",
  "accessibility-sizing",
  "functional-ui",
  "context-menus",
  "menu-shortcuts",
  "settings-explanations",
  "qr-pairing",
  "honest-monetization",
  "rendered-provider-text",
  "screen-recording",
  "design-reference-parity",
  "landing-site",
  "mobile-site",
  "installer-download-button",
  "feature-articles",
  "vendored-fonts",
  "shared-link-embed",
  "homepage-link",
  "release-line-counts",
  "tabbed-readme",
  "human-time-estimate",
  "sanitized-instruction-copy",
  "status-hub",
  "discord-status-bridge",
  "panic-webhooks",
  "tidbyt-displays",
  "build-entrypoints",
  "fresh-build-run-command",
  "dependency-fetcher",
  "bundled-dependencies",
  "squirrel-installer",
  "self-signing",
  "auto-updates",
  "release-workflow",
  "release-timing",
  "release-dim-sum-photo",
  "ci-bootstrap",
  "runner-selection",
  "encrypted-public-builder",
  "app-icon",
  "design-folder",
  "clipping-matrix",
  "public-screenshot-gallery",
  "vocabulary-unlock-boundary",
  "agents-md-vocabulary-block",
  "vocabulary-hash-lock",
  "roadmap-checklist",
  "feature-docs",
  "postman-collections",
  "wiki-pages-sync",
  "handoff-record",
  "closeout-prompt",
  "discussion-records",
  "project-board",
  "operational-skill",
  "readme-prompt-banner",
  "instruction-single-file-editions",
  "project-profile",
  "roblox-model-catalogue",
  "roblox-visual-realism",
]);
// Required delivery contracts also exist outside the feature catalogue. Keep this
// independent list so omission of an entire companion cannot pass the checker.
export const REQUIRED_DELIVERY_IDS = Object.freeze([
  "documentation-companion",
  "build-gui-companion",
  "hosted-deployment-tools",
]);
const ALL_REQUIRED_IDS = Object.freeze([...REQUIRED_IDS, ...REQUIRED_DELIVERY_IDS]);
export const SURFACES = Object.freeze([
  "desktop",
  "hosted-workspace",
  "documentation-site",
  "embedded-bluemap-viewer",
  "repository-deliverables",
]);

export function renderMarkdownInventory(document) {
  const cell = (value) => String(value).replaceAll("|", "\\|").replace(/[\r\n]+/gu, " ");
  const rows = [...document.features, ...(document.deliveryObligations ?? [])].map((feature) => {
    const mapped = SURFACES.filter((surface) => feature.surfaces[surface].sourceMapping);
    const paths = [...new Set([
      ...(feature.sourceEvidence ?? []).map((evidence) => evidence.path),
      ...mapped.flatMap((surface) => feature.surfaces[surface].sourceMapping.paths ?? []),
    ])];
    return `| \`${cell(feature.id)}\` | ${cell(feature.title)} | ${mapped.join(", ") || "None recorded"} | ${paths.map((path) => `\`${cell(path)}\``).join(", ") || "Not yet mapped"} | ${cell(feature.reviewState ?? "pending-review")} |`;
  });
  return [
    "# Feature delivery inventory draft", "",
    "Generated from `feature-delivery-inventory.json`. Run `node scripts/check-feature-delivery-inventory.mjs --write-markdown` after changing that ledger. The independent required-ID list remains in the checker.", "",
    `Baseline: \`${document.baseline}\`. ${cell(document.status)}.`, "",
    `${document.features.length} feature requirements and ${(document.deliveryObligations ?? []).length} additional delivery obligations are tracked across ${SURFACES.length} separately assessed scopes. Public identifiers retain ordinary technical wording. Source mappings identify code presence only. They do not establish implementation completeness, runtime acceptance or capture acceptance. Per-surface reasons, limitations and evidence remain in the JSON.`, "",
    "| Identifier | Requirement | Scopes with recorded source mapping | Source paths | Review state |",
    "| --- | --- | --- | --- | --- |", ...rows, "",
    "## Exclusions", "",
    ...document.exclusions.map((entry) => `- \`${cell(entry.id)}\`: ${cell(entry.reason)}`), "",
    "## Verification", "",
    "The checker compares this complete companion with the JSON and separately validates all required IDs and surface assessments. A valid inventory may still be incomplete. Use `--require-complete` to reject pending acceptance; never convert missing proof into a verified label.", "",
  ].join("\n");
}

export function validateMarkdownInventory(document, markdown) {
  return markdown.replaceAll("\r\n", "\n") === renderMarkdownInventory(document)
    ? [] : ["Markdown feature companion differs from the JSON inventory; regenerate it before delivery"];
}

export function validateInventory(document, options = {}) {
  const failures = [];
  const pending = [];
  const checkPath = (path) => {
    if (
      typeof path !== "string" ||
      !path ||
      isAbsolute(path) ||
      relative(root, resolve(root, path)).startsWith("..")
    ) {
      failures.push(`Invalid repository evidence path: ${String(path)}`);
    } else if (
      !(options.pathExists ?? ((value) => existsSync(resolve(root, value))))(
        path,
      )
    ) {
      failures.push(`Missing evidence path: ${path}`);
    }
  };
  if (document?.schemaVersion !== 1 || !Array.isArray(document?.features)) {
    return { failures: ["Unsupported or missing inventory schema"], pending };
  }
  const seen = new Set();
  if (!Array.isArray(document.deliveryObligations))
    failures.push("Missing additional delivery obligations");
  for (const feature of [...document.features, ...(document.deliveryObligations ?? [])]) {
    if (!ALL_REQUIRED_IDS.includes(feature.id) || seen.has(feature.id))
      failures.push(`Unknown or duplicate feature: ${feature.id}`);
    seen.add(feature.id);
    if (!feature.title?.trim() || !feature.requirement?.trim())
      failures.push(`Missing requirement: ${feature.id}`);
    if (!Array.isArray(feature.sourceEvidence))
      failures.push(`Missing evidence inventory: ${feature.id}`);
    for (const evidence of feature.sourceEvidence ?? [])
      checkPath(evidence.path);
    if (feature.focusedInventory) checkPath(feature.focusedInventory);
    if (
      Object.keys(feature.surfaces ?? {})
        .sort()
        .join() !== [...SURFACES].sort().join()
    )
      failures.push(`Surface inventory mismatch: ${feature.id}`);
    for (const surface of SURFACES) {
      const state = feature.surfaces?.[surface];
      const label = `${feature.id}/${surface}`;
      if (
        !state ||
        ![
          "applicable",
          "not-applicable",
          "pending-review",
          "supporting-deliverable",
          "not-directly-rendered",
        ].includes(state.applicability) ||
        !state.reason?.trim()
      ) {
        failures.push(`Missing applicability decision: ${label}`);
        continue;
      }
      if (state.applicability === "not-applicable") {
        if (
          ![
            state.implementation,
            state.runtimeAcceptance,
            state.captureAcceptance,
          ].every((value) => value === "not-applicable")
        )
          failures.push(`Contradictory exclusion: ${label}`);
        continue;
      }
      if (
        state.implementation !== "verified" ||
        state.runtimeAcceptance !== "verified" ||
        state.captureAcceptance !== "verified"
      )
        pending.push(label);
      if (
        [
          state.implementation,
          state.runtimeAcceptance,
          state.captureAcceptance,
        ].includes("verified")
      ) {
        // A status string alone cannot serve as proof of implementation or interaction.
        if (
          !Array.isArray(state.acceptanceEvidence) ||
          state.acceptanceEvidence.length === 0
        )
          failures.push(`Unsubstantiated verification: ${label}`);
        for (const evidence of state.acceptanceEvidence ?? []) {
          checkPath(evidence.path);
          if (
            !/^[a-f0-9]{40}$/u.test(evidence.sourceCommit ?? "") ||
            !/^[a-f0-9]{64}$/u.test(evidence.sha256 ?? "")
          )
            failures.push(`Unbound acceptance evidence: ${label}`);
        }
      }
    }
  }
  for (const id of ALL_REQUIRED_IDS)
    if (!seen.has(id)) failures.push(`Missing required feature: ${id}`);
  if (document.status === "complete" && pending.length)
    failures.push("Complete status contradicts pending acceptance");
  if (options.requireComplete && pending.length)
    failures.push(`${pending.length} surface requirements remain incomplete`);
  return { failures, pending };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const document = JSON.parse(
      readFileSync(
        resolve(root, "docs/contracts/feature-delivery-inventory.json"),
        "utf8",
      ),
    );
  const markdownPath = resolve(root, "docs/contracts/feature-delivery-inventory.md");
  if (process.argv.includes("--write-markdown")) writeFileSync(markdownPath, renderMarkdownInventory(document));
  const result = validateInventory(document, {
      requireComplete: process.argv.includes("--require-complete"),
    });
  result.failures.push(...validateMarkdownInventory(document, readFileSync(markdownPath, "utf8")));
  for (const failure of result.failures) process.stderr.write(`${failure}\n`);
  process.stdout.write(
    `Feature inventory: ${REQUIRED_IDS.length} required IDs, ${REQUIRED_DELIVERY_IDS.length} additional delivery obligations, ${SURFACES.length} scopes, ${result.pending.length} pending surface requirements, ${result.failures.length} validation failures\n`,
  );
  process.exitCode = result.failures.length ? 1 : 0;
}
