import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(resolve(ROOT, relativePath), "utf8");

const REQUIRED_SURFACES = [
    "CLI command and help/version output",
    "CLI flags and exit codes",
    "Config schemas",
    "Project schema",
    "Local history",
    "HTTP static map server",
    "HTTP render/update API",
    "Live data and SSE",
    "Remote/proxy HTTP boundary",
    "JavaScript/UI and add-on API",
    "Workflow inputs",
    "Workflow outputs",
    "Environment variables",
    "Windows file layout and identity",
    "Update feed and installer outputs",
    "Backup pointers and restore manifests",
    "Exported formats",
    "Accessibility-visible commands",
];

const REQUIRED_MIGRATION_HEADINGS = [
    "## Compatibility promise",
    "## Upgrade sequencing",
    "## Schema migration rules",
    "## Rollback",
    "## Deprecation handling",
    "## Failure modes and operator response",
];

const localLinks = (markdown) =>
    [...markdown.matchAll(/\]\(([^)]+)\)/g)]
        .map((match) => match[1].split("#", 1)[0].split("?", 1)[0])
        .filter((target) => target && !target.startsWith("http") && !target.startsWith("mailto:"));

test("public 1.0 inventory keeps its exact rows, evidence paths, and linked docs", () => {
    const inventory = read("docs/compatibility/public-surface-inventory.md");
    const matrix = read("docs/compatibility/public-surface-matrix.md");
    const api = read("docs/compatibility/api-reference.md");
    const migration = read("docs/compatibility/migration-guide.md");

    for (const surface of REQUIRED_SURFACES) {
        const escaped = surface.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
        assert.match(inventory, new RegExp(`^\\| ${escaped} \\|`, "m"), `inventory row disappeared: ${surface}`);
    }

    const rows = inventory
        .split(/\r?\n/)
        .filter((line) => line.startsWith("| ") && !line.startsWith("| ---"));
    assert.equal(rows.length, REQUIRED_SURFACES.length + 1, "the inventory must retain one header plus every required surface row");
    for (const row of rows.slice(1)) {
        const cells = row.split("|").map((cell) => cell.trim());
        assert.ok(cells[2], `surface row has no stability class: ${row}`);
        assert.ok(cells[4], `surface row has no compatibility rule: ${row}`);
        assert.ok(cells[5], `surface row has no primary evidence: ${row}`);
    }

    for (const relativePath of [
        "docs/compatibility/README.md",
        "docs/compatibility/public-surface-matrix.md",
        "docs/compatibility/api-reference.md",
        "docs/compatibility/schemas-and-migrations.md",
        "docs/compatibility/migration-guide.md",
    ]) {
        assert.ok(existsSync(resolve(ROOT, relativePath)), `required contract document is missing: ${relativePath}`);
    }

    for (const relativeLink of [...localLinks(inventory), ...localLinks(matrix)]) {
        assert.ok(existsSync(resolve(ROOT, "docs/compatibility", relativeLink)), `contract link target is missing: ${relativeLink}`);
    }

    for (const heading of REQUIRED_MIGRATION_HEADINGS) assert.match(migration, new RegExp(`^${heading}$`, "m"));
    assert.match(api, /^## Standalone CLI$/m);
    assert.match(api, /^```(?:text|console|sh)$/m);
    assert.match(api, /`bluemap-cli`/);
    assert.match(api, /EXIT\.OK|Exit code `0`/);
    assert.match(matrix, /^\| CLI commands and exit codes \|/m);
    assert.match(matrix, /^\| Accessibility-visible commands \|/m);
});
