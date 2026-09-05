/**
 * The workflows have to agree with the repository they are checked into.
 *
 * `scripts/check-workflow-drift.mjs` compares what every workflow *states* about
 * this project - the app package's path, the Node major, the workspace root pnpm
 * reads - against what `scripts/workflow-manifest.mjs` *discovers*. This runs it
 * from the suite, because GitHub Actions runs no tests and gates nothing here, so a
 * check that lived only in CI would never run at all, and one that lived only in a
 * npm script would run only when somebody remembered.
 *
 * It is spawned rather than imported. `scripts/` sits outside `design/`, and
 * Vite's `server.fs.allow` refuses the import - which reads as a mysterious
 * resolution failure rather than as a boundary, so it is worth saying out loud.
 */

import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Six levels: cirender -> main -> src -> app -> packages -> design -> repo root.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");

function runDrift(args: readonly string[] = []): { ok: boolean; output: string } {
    try {
        const output = execFileSync(
            process.execPath,
            [join(repoRoot, "scripts", "check-workflow-drift.mjs"), ...args],
            { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
        return { ok: true, output };
    } catch (error) {
        const failure = error as { stdout?: string; stderr?: string };
        return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
    }
}

describe("the workflows agree with the repository", () => {
    it("reports no drift on the committed tree", () => {
        const { ok, output } = runDrift();
        expect(output, output).not.toMatch(/disagree/);
        expect(ok, output).toBe(true);
    });

    it("checks every workflow file, not a sample of them", () => {
        // A drift check that quietly stopped reading half the workflows would pass
        // exactly as cleanly as one that read all of them, so the count is asserted
        // rather than assumed.
        const { output } = runDrift(["--list"]);
        const across = /across (\d+) workflow files/.exec(output);
        expect(across, output).not.toBeNull();
        expect(Number(across?.[1] ?? 0)).toBeGreaterThanOrEqual(8);
    });

    it("states which facts it is checking, so a missing one is visible", () => {
        // The inventory is hand-written on purpose: a rule that only checked the
        // paths it happened to find would pass on a workflow that had stopped
        // mentioning the app entirely, which is the failure a completeness list
        // exists to catch.
        const { output } = runDrift(["--list"]);
        for (const claim of ["app-dir", "site-dir", "cli-dir", "worldgen-dir", "node-version"]) {
            expect(output, output).toContain(claim);
        }
    });
});
