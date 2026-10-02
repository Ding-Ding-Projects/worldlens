/**
 * Every surface stays pure Material Design 3, and this is what actually notices.
 *
 * `scripts/check-webapp-parity.mjs` reads the map webapp, the documentation site, the
 * desktop interface and the render page, and refuses a colour that is neither a palette role
 * nor an explicitly declared exemption.
 *
 * It runs from the suite for the same reason the workflow-drift check does: GitHub Actions runs
 * no tests and gates nothing, so a check living only in CI would never run at all, and one
 * living only in an npm script would run only when somebody remembered. A guard nobody runs
 * is decoration, and this one exists precisely because the drift it catches is invisible -
 * a hardcoded colour renders perfectly, it is simply the one thing on the page ignoring the
 * reader's theme.
 *
 * Spawned rather than imported. `scripts/` sits outside `design/`, and Vite's
 * `server.fs.allow` refuses the import in a way that reads as a mysterious resolution
 * failure rather than as a boundary.
 */

import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Six levels: cirender -> main -> src -> app -> packages -> design -> repo root.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");
const script = join(repoRoot, "scripts", "check-webapp-parity.mjs");

function runPurity(): { ok: boolean; output: string } {
    try {
        const output = execFileSync(process.execPath, [script], {
            cwd: repoRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        return { ok: true, output };
    } catch (error) {
        const failure = error as { stdout?: string; stderr?: string };
        return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
    }
}

describe("pure Material Design 3, on every surface", () => {
    it("passes on the repository as it stands", () => {
        const result = runPurity();
        expect(result.output).not.toMatch(/pure-material-design/);
        expect(result.ok).toBe(true);
    });

    it("covers every surface, not only the map", () => {
        // The rule applies to each surface individually rather than to the project as an
        // aggregate, and that aggregate reading is exactly what lets one corner sit outside
        // it. For a while the map had a guard and the other three did not, which is why the
        // other three were where the undeclared colour actually was.
        const source = execFileSync(process.execPath, ["-e", `process.stdout.write(require("fs").readFileSync(${JSON.stringify(script)}, "utf8"))`], {
            encoding: "utf8",
        });
        for (const surface of ["map webapp", "documentation site", "desktop interface", "render page"]) {
            expect(source).toContain(surface);
        }
    });

    it("catches a colour that is neither a role nor a declared exemption", () => {
        // Proved by putting one where the guard actually looks, rather than by trusting that
        // it would. The probe file is removed in a finally, so a failure here cannot leave
        // the repository dirty - and it is named distinctively so a stray one is obvious.
        const probe = join(repoRoot, "design/packages/site/src/theme/material-purity-probe.css");
        try {
            writeFileSync(probe, ".material-purity-probe { background: #ff00aa; }\n", "utf8");
            const result = runPurity();
            expect(result.ok).toBe(false);
            expect(result.output).toMatch(/pure-material-design/);
            expect(result.output).toContain("material-purity-probe.css");
        } finally {
            rmSync(probe, { force: true });
        }
    });

    it("accepts that same colour once it is declared", () => {
        // The other half. A guard that refused everything would also pass the test above, and
        // an exemption route that did not work would make the guard unusable rather than
        // strict.
        const probe = join(repoRoot, "design/packages/site/src/theme/material-purity-probe.css");
        try {
            writeFileSync(
                probe,
                "/* material-exempt: a probe, and not a real surface. */\n" +
                    ".material-purity-probe { background: #ff00aa; }\n",
                "utf8",
            );
            expect(runPurity().ok).toBe(true);
        } finally {
            rmSync(probe, { force: true });
        }
    });
});
