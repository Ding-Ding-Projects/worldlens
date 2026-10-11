#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Independently maintained required inventory. Do not derive this from the document being checked.
export const REQUIRED_IDS = Object.freeze([
  "language",
  "funny-emoji",
  "personal-vocabulary",
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
  "deen-wah-site",
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
  "cheap-jor-matrix",
  "public-huishot-gallery",
  "vocabulary-unlock-boundary",
  "agents-md-vocabulary-block",
  "vocabulary-hash-lock",
  "roadmap-checklist",
  "feature-docs",
  "postman-collections",
  "wiki-day-teet-hui-sync",
  "handoff-record",
  "closeout-prompt",
  "discussion-records",
  "project-board",
  "operational-skill",
  "readme-prompt-banner",
  "uh-single-file-editions",
  "project-profile",
  "roblox-model-catalogue",
  "roblox-visual-realism",
]);
export const SURFACES = Object.freeze([
  "desktop",
  "hosted-workspace",
  "documentation-site",
  "embedded-bluemap-viewer",
  "repository-deliverables",
]);

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
  for (const feature of document.features) {
    if (!REQUIRED_IDS.includes(feature.id) || seen.has(feature.id))
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
  for (const id of REQUIRED_IDS)
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
  const result = validateInventory(
    JSON.parse(
      readFileSync(
        resolve(root, "docs/contracts/feature-delivery-inventory.json"),
        "utf8",
      ),
    ),
    {
      requireComplete: process.argv.includes("--require-complete"),
    },
  );
  for (const failure of result.failures) process.stderr.write(`${failure}\n`);
  process.stdout.write(
    `Feature inventory: ${REQUIRED_IDS.length} required IDs, ${SURFACES.length} scopes, ${result.pending.length} pending surface requirements, ${result.failures.length} validation failures\n`,
  );
  process.exitCode = result.failures.length ? 1 : 0;
}
