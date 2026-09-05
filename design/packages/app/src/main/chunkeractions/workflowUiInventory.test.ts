/**
 * Every field `chunk-world.yml`'s workflow_dispatch offers has a real control on the
 * Chunker GitHub Actions panel and a real dispatch field in this package's `ipc.ts`.
 *
 * `scripts/check-chunker-ui-inventory.mjs` does the actual comparison against a
 * hand-written inventory, for the same reason `scripts/check-workflow-drift.mjs` is spawned
 * from `workflowDrift.test.ts` rather than reimplemented here: it is a local check that GitHub
 * Actions never runs, so the only thing that runs it at all is this suite.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Six levels: chunkeractions -> main -> src -> app -> packages -> design -> repo root.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");

// Everything the script reads, relative to the repository root. Copying exactly these into a
// temporary tree lets a break test prove the guard goes red without editing a tracked file.
const READ_BY_SCRIPT = [
    "scripts/check-chunker-ui-inventory.mjs",
    ".github/workflows/chunk-world.yml",
    "design/packages/ui/src/components/chunker/ChunkerActionsPanel.vue",
    "design/packages/ui/src/components/chunker/ChunkerScreen.vue",
    "design/packages/app/src/main/chunkeractions/ipc.ts",
];

function runInventoryIn(root: string, args: readonly string[] = []): { ok: boolean; output: string } {
    try {
        const output = execFileSync(
            process.execPath,
            [join(root, "scripts", "check-chunker-ui-inventory.mjs"), ...args],
            { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
        return { ok: true, output };
    } catch (error) {
        const failure = error as { stdout?: string; stderr?: string };
        return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
    }
}

function runInventory(args: readonly string[] = []): { ok: boolean; output: string } {
    return runInventoryIn(repoRoot, args);
}

/** A throwaway copy of just the files the script reads, so a probe cannot dirty the tree. */
function copyReadableTree(): string {
    const root = mkdtempSync(join(tmpdir(), "chunker-ui-inventory-"));
    for (const relative of READ_BY_SCRIPT) {
        const destination = join(root, relative);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(join(repoRoot, relative), destination);
    }
    return root;
}

describe("the Chunker GitHub Actions UI covers every workflow_dispatch input", () => {
    it("reports no gap on the committed tree", () => {
        const { ok, output } = runInventory();
        expect(output, output).not.toMatch(/disagrees/);
        expect(ok, output).toBe(true);
    });

    it("covers all ten inputs chunk-world.yml currently declares", () => {
        // A hand-written inventory that quietly stopped growing would still report "no
        // gap" against a workflow that had grown a new field, so the count is asserted
        // rather than trusted to the pass/fail alone.
        const { output } = runInventory(["--list"]);
        const declared = /declares (\d+) workflow_dispatch inputs/.exec(output);
        expect(declared, output).not.toBeNull();
        expect(Number(declared?.[1] ?? 0)).toBe(10);
        const covered = /inventory covers (\d+) of them/.exec(output);
        expect(covered, output).not.toBeNull();
        expect(Number(covered?.[1] ?? 0)).toBe(10);
    });

    it("names each of the ten inputs, so a renamed or removed one is visible", () => {
        const { output } = runInventory(["--list"]);
        for (const input of [
            "chunker-config",
            "world-source",
            "world",
            "world-repository",
            "target-format",
            "prune-bounds",
            "output-name",
            "output",
            "max-jobs",
            "regions-per-shard",
        ]) {
            expect(output, output).toContain(`  - ${input}`);
        }
    });

    it("goes red when the config binding leaves the actions panel, though the container panel keeps an identical one", () => {
        // The Chunker screen renders one panel per conversion route, and two of them take a
        // `:config="cliConfig"` prop from the same variable: the GitHub Actions panel this row
        // is about, and the docker/ssh container panel beside it. A guard that searched the
        // whole file for that text would be satisfied by the container panel's copy and could
        // never notice the Actions binding disappearing - which would let the dispatch stop
        // carrying the user's composed converter options with nothing reporting it. Proved by
        // removing the binding from a throwaway copy of the files the script reads, so the
        // check is watched failing rather than trusted to fail.
        const fixture = copyReadableTree();
        try {
            expect(runInventoryIn(fixture).ok, "the copied tree must pass before it is broken").toBe(true);

            const screenPath = join(fixture, "design/packages/ui/src/components/chunker/ChunkerScreen.vue");
            const before = readFileSync(screenPath, "utf8");
            const after = before.replace(/(<ChunkerActionsPanel\b[^>]*?)\s:config="cliConfig"/, "$1");
            expect(after, "the probe must actually remove the binding").not.toBe(before);
            expect(after, "the container panel's identical binding must survive").toContain(':config="cliConfig"');
            writeFileSync(screenPath, after, "utf8");

            const { ok, output } = runInventoryIn(fixture);
            expect(ok, output).toBe(false);
            expect(output, output).toContain("chunker-config");
            expect(output, output).toContain("<ChunkerActionsPanel> element");
        } finally {
            rmSync(fixture, { recursive: true, force: true });
        }
    });
});
