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
 * this suite does not attempt to reproduce that path with the real list, because doing so
 * would require holding the private terms somewhere this repository's tests can read them,
 * which is exactly the leak the guard exists to prevent.
 *
 * The matching path itself is still exercised, with a synthetic two-word term of this test's
 * own invention. That matters because most of the real terms are multi-word phrases and this
 * repository hard-wraps prose comments: a scan that reads one line at a time cannot see a
 * phrase whose words land on opposite sides of a wrap, so its clean verdict would not be
 * evidence of absence. The scan therefore runs over the whole file with whitespace collapsed,
 * and the wrapped case below is what holds it to that.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

// Six levels: cirender -> main -> src -> app -> packages -> design -> repo root.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");
const script = join(repoRoot, "scripts", "check-private-terms.mjs");

function runGuard(env: Record<string, string | undefined>): { ok: boolean; output: string } {
    try {
        const output = execFileSync(process.execPath, [script], {
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

/**
 * A probe that imports the guard in a child Node process and runs its exported scanner over
 * files this test wrote, with terms this test invented. The guard is located through an
 * environment variable rather than through argv, so its own "am I being run as a script"
 * check at the bottom of the file stays false and importing it does not start a full
 * repository scan.
 */
const SCAN_PROBE = [
    'import { pathToFileURL } from "node:url";',
    "const guard = await import(pathToFileURL(process.env.PRIVATE_TERMS_SCRIPT).href);",
    "const terms = JSON.parse(process.env.PRIVATE_TERMS_PROBE_TERMS);",
    "const files = process.argv.slice(1);",
    "process.stdout.write(JSON.stringify(guard.scanFiles(files, guard.matcher(terms))));",
].join("\n");

function scanFor(terms: string[], files: string[]): { file: string; line: number }[] {
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", SCAN_PROBE, ...files], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
            ...process.env,
            PRIVATE_TERMS_SCRIPT: script,
            PRIVATE_TERMS_PROBE_TERMS: JSON.stringify(terms),
        },
    });
    return JSON.parse(output) as { file: string; line: number }[];
}

const probeDirectory = mkdtempSync(join(tmpdir(), "worldlens-private-terms-"));

function probeFile(name: string, lines: string[]): string {
    const path = join(probeDirectory, name);
    writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
    return path;
}

afterAll(() => {
    rmSync(probeDirectory, { recursive: true, force: true });
});

describe("the private-terms guard's matching", () => {
    // "quokka lantern" is this test's own invention and appears in no term list; it stands in
    // for the multi-word phrases the real list is mostly made of.
    const phrase = ["quokka lantern"];

    it("finds a phrase that a comment wrap has split across two lines", () => {
        const path = probeFile("wrapped.txt", [
            "/**",
            " * A comment that hard-wraps in the middle of the probe phrase quokka",
            " * lantern, exactly as this repository's own prose comments do.",
            " */",
        ]);
        expect(scanFor(phrase, [path])).toEqual([{ file: path, line: 2 }]);
    });

    it("finds the same phrase on a single line, and reports that line", () => {
        const path = probeFile("inline.txt", [
            "A first line with nothing in it.",
            "The probe phrase quokka lantern sits whole on this line.",
        ]);
        expect(scanFor(phrase, [path])).toEqual([{ file: path, line: 2 }]);
    });

    it("does not match a longer word or two words that are merely nearby", () => {
        const path = probeFile("absent.txt", [
            "Nothing here: quokkas lanterns is a different pair of words,",
            "and quokka on its own, with lantern arriving later in the sentence, is not it.",
        ]);
        expect(scanFor(phrase, [path])).toEqual([]);
    });
});

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
});
