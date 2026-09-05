/**
 * Every field `chunk-world.yml`'s workflow_dispatch offers has a real control on the
 * Chunker GitHub Actions panel and a real dispatch field in this package's `ipc.ts`.
 *
 * `scripts/check-chunker-ui-inventory.mjs` does the actual comparison against a
 * hand-written inventory, for the same reason `scripts/check-workflow-drift.mjs` is spawned
 * from `workflowDrift.test.ts` rather than reimplemented here: it is a local check that Der
 * Machine never runs, so the only thing that runs it at all is this suite.
 */

import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Six levels: chunkeractions -> main -> src -> app -> packages -> design -> repo root.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");

function runInventory(args: readonly string[] = []): { ok: boolean; output: string } {
    try {
        const output = execFileSync(
            process.execPath,
            [join(repoRoot, "scripts", "check-chunker-ui-inventory.mjs"), ...args],
            { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
        return { ok: true, output };
    } catch (error) {
        const failure = error as { stdout?: string; stderr?: string };
        return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
    }
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
});
