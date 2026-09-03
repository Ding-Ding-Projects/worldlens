#!/usr/bin/env node

/**
 * Static selector audit for the smoke matrix.
 *
 * A selector is evidence only when the current UI source contains the exact stable
 * hook, or when the row uses an explicit semantic locator contract. This catches a
 * matrix that is full of invented test ids before a built-artifact run wastes time.
 * The audit is intentionally red on the current pre-integration tree because the
 * server and render lanes have not yet supplied their final stable hooks.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = resolve(root, "docs/ui-smoke/smoke-matrix.json");
const sourceRoots = [resolve(root, "design/packages/ui/src"), resolve(root, "design/packages/app/src")];
const sourceExtensions = new Set([".vue", ".ts", ".tsx", ".js", ".jsx"]);

function sourceText() {
  const chunks = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (sourceExtensions.has(extname(file))) chunks.push(readFileSync(file, "utf8"));
    }
  };
  for (const directory of sourceRoots) visit(directory);
  return chunks.join("\n");
}

export function missingSelectors(matrix, source) {
  return matrix.rows
    .filter((row) => typeof row.selector === "string")
    .filter((row) => {
      const testId = row.selector.match(/^\[data-testid=([^\]]+)\]$/u)?.[1];
      if (testId) return !new RegExp(`data-testid\\s*=\\s*["']${testId}["']`, "u").test(source);
      if (row.selector.startsWith("role=")) return false;
      return !source.includes(row.selector);
    })
    .map((row) => ({ id: row.id, selector: row.selector }));
}

function main() {
  const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
  const missing = missingSelectors(matrix, sourceText());
  if (missing.length > 0) {
    throw new Error(`ui-smoke-selector-audit: ${missing.length} selectors are not proven by current UI source:\n${missing.map((entry) => `  - ${entry.id}: ${entry.selector}`).join("\n")}`);
  }
  console.log(`ui-smoke-selector-audit: ${matrix.rows.length} selectors proven`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
