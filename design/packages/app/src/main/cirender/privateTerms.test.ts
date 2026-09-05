/**
 * `scripts/check-private-terms.mjs` reads its term list from a file outside this repository,
 * named by the `WORLDLENS_PRIVATE_TERMS_FILE` environment variable. Most machines running
 * this suite - including every public CI runner - will never have that file, and the guard
 * is written to skip cleanly rather than fail when it is absent, so this test only asserts
 * that skip behaviour: exit 0, with a message saying it skipped.
 *
 * It is run from the suite for the same reason the workflow-drift and Material Design 3
 * purity checks are: GitHub Actions runs no tests and gates nothing here, so a check living
 * only in an npm script would run only when somebody remembered to invoke it by hand.
 *
 * A maintainer who actually has the private terms file can still run the script directly
 * with the environment variable set, and it will report every hit, fail closed, and exit 1 -
 * this suite does not attempt to reproduce that path, because doing so would require holding
 * the private terms somewhere this repository's tests can read them, which is exactly the
 * leak the guard exists to prevent.
 *
 * What the matching itself does is still provable here, against terms invented for the test:
 * `scripts/check-private-terms.test.mjs` drives the scan directly over throwaway files, and
 * is spawned below so that it runs as part of this suite rather than only when somebody
 * remembers the npm script.
 */

import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Six levels: cirender -> main -> src -> app -> packages -> design -> repo root.
const repoRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "..",
    "..",
    "..",
);
const script = join(repoRoot, "scripts", "check-private-terms.mjs");
const unitTests = join(repoRoot, "scripts", "check-private-terms.test.mjs");

function runGuard(
    env: Record<string, string | undefined>,
    args: string[] = [script],
): { ok: boolean; output: string } {
    try {
        const output = execFileSync(process.execPath, args, {
            cwd: repoRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, ...env },
        });
        return { ok: true, output };
    } catch (error) {
        const failure = error as { stdout?: string; stderr?: string };
        return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
    }
}

describe("the private-terms guard", () => {
    if (!process.env.WORLDLENS_PRIVATE_TERMS_FILE) {
        it.skip("WORLDLENS_PRIVATE_TERMS_FILE is not set in this environment - only the skip path is exercised", () => {});
    }

    it("skips cleanly with no term file, and exits 0", () => {
        // Explicitly unset, so a value inherited from the outer environment (a developer
        // machine that happens to have it exported) cannot turn this into the fail-closed
        // path by accident.
        const result = runGuard({ WORLDLENS_PRIVATE_TERMS_FILE: undefined });
        expect(result.ok).toBe(true);
        expect(result.output).toContain("private-terms check skipped: no term file");
    });

    it("skips cleanly when the named file does not exist, and exits 0", () => {
        const result = runGuard({
            WORLDLENS_PRIVATE_TERMS_FILE: join(repoRoot, "does-not-exist-private-terms.txt"),
        });
        expect(result.ok).toBe(true);
        expect(result.output).toContain("private-terms check skipped: no term file");
    });

    it("passes its own scan tests, which cover a term wrapped across a line break", () => {
        // Those tests use terms invented for them, so they exercise the matching without
        // holding anything private. The wrapped case is the one that matters: nearly every
        // real term is two or three words, and this repository's prose is wrapped, so a scan
        // that read each line on its own would report clean over a genuine occurrence.
        const result = runGuard({ WORLDLENS_PRIVATE_TERMS_FILE: undefined }, ["--test", unitTests]);
        expect(result.output).toContain("fail 0");
        expect(result.ok).toBe(true);
    });
});
