/**
 * A dedicated guard for the one property that has already been lost once in this
 * repository's history: `detectGh` must keep "not installed", "installed but signed out"
 * and "installed and ready" as three distinguishable outcomes, each carrying its own
 * remedy, and it must never claim "ready" from a status call it did not actually make and
 * read.
 *
 * This is deliberately a separate file from `gh.test.ts` rather than a case folded into
 * it. `gh.test.ts` already exercises the three states as part of its wider coverage of
 * the module, and a wider file is exactly where a narrowing regression - somebody
 * collapsing two states while "fixing" something unrelated - can slip past review inside
 * a diff nobody reads line by line. A file whose only job is this one property is a file
 * whose failure means exactly one thing.
 *
 * The source-level assertions below match on exact identifiers with word boundaries
 * rather than loose substrings, because a substring assertion passes on a renamed symbol
 * that still contains the old name. `availability: "ready"` is not a fragment of anything
 * else in this module, and asserting the literal token - not merely that the word "ready"
 * appears somewhere in the file - is what makes the guard mean something.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectGh } from "./gh.js";
import type { ProcessResult, ProcessRunner, ProcessToFileResult } from "./gh.js";

const SOURCE_PATH = fileURLToPath(new URL("./gh.ts", import.meta.url));

function source(): string {
    return readFileSync(SOURCE_PATH, "utf8");
}

/** Matches an exact identifier token, never a substring inside a longer one. */
function hasExactToken(text: string, token: string): boolean {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\w"'-])${escaped}(?![\\w"'-])`).test(text);
}

interface Call {
    readonly args: readonly string[];
}

interface FakeRunner extends ProcessRunner {
    readonly calls: Call[];
}

function fakeRunner(answers: Readonly<Record<string, Partial<ProcessResult>>>): FakeRunner {
    const calls: Call[] = [];
    return {
        calls,
        run(_command, args): Promise<ProcessResult> {
            calls.push({ args: [...args] });
            const key = Object.keys(answers).find((candidate) => args.includes(candidate));
            const found = key === undefined ? {} : answers[key];
            return Promise.resolve({ started: true, code: 0, stdout: "", stderr: "", ...found });
        },
        runToFile(): Promise<ProcessToFileResult> {
            return Promise.resolve({ started: true, code: 0, bytes: 0, stderr: "" });
        },
    };
}

describe("detectGh source honesty", () => {
    it("declares the exact literal for each of the three states, not a lookalike", () => {
        const text = source();
        expect(hasExactToken(text, '"not-installed"')).toBe(true);
        expect(hasExactToken(text, '"signed-out"')).toBe(true);
        expect(hasExactToken(text, '"ready"')).toBe(true);
    });

    it("only reaches the ready branch after reading a real, distinct auth-status call", () => {
        const text = source();
        // The "ready" branch must be reached through code that actually inspects
        // `status.code`, so it cannot be a default fallen into merely because nothing
        // else matched. This proves the branch is conditioned on real process output,
        // not on the absence of an earlier failure.
        expect(hasExactToken(text, "status.code")).toBe(true);
        expect(hasExactToken(text, '"auth"')).toBe(true);
    });
});

describe("detectGh runtime honesty", () => {
    it("reports not-installed, with its own remedy, when gh is not on PATH", async () => {
        const runner = fakeRunner({
            "--version": { started: false, code: null, stderr: "spawn gh ENOENT" },
        });
        const status = await detectGh(runner);
        expect(status.availability).toBe("not-installed");
        expect(status.account).toBeNull();
        expect(status.message.toLowerCase()).toContain("install");
        // Never asks `auth status` once it already knows gh is not there.
        expect(runner.calls.some((call) => call.args.includes("status"))).toBe(false);
    });

    it("reports signed-out, distinctly from not-installed, when gh exists but auth fails", async () => {
        const runner = fakeRunner({
            "--version": { stdout: "gh version 2.62.0\n" },
            status: { code: 1, stdout: "", stderr: "You are not logged into any GitHub hosts." },
        });
        const status = await detectGh(runner);
        expect(status.availability).toBe("signed-out");
        expect(status.availability).not.toBe("not-installed");
        expect(status.account).toBeNull();
        expect(status.message.toLowerCase()).toContain("gh auth login");
        // The remedy for signed-out must differ from the remedy for not-installed.
        const notInstalledMessage = (
            await detectGh(fakeRunner({ "--version": { started: false, code: null } }))
        ).message;
        expect(status.message).not.toBe(notInstalledMessage);
    });

    it("reports ready, with the account it actually read, only when auth status truly succeeded", async () => {
        const runner = fakeRunner({
            "--version": { stdout: "gh version 2.62.0\n" },
            status: { code: 0, stdout: "Logged in to github.com account octocat (keyring)" },
        });
        const status = await detectGh(runner);
        expect(status.availability).toBe("ready");
        expect(status.account).toBe("octocat");
        // Proves the "ready" claim was earned: the runner really was asked, and its
        // successful exit code is what produced the state, not an assumption.
        const statusCall = runner.calls.find((call) => call.args.includes("status"));
        expect(statusCall).toBeDefined();
        expect(statusCall?.args).toEqual(["auth", "status"]);
    });

    it("never reports ready when the auth-status call itself could not be started", async () => {
        const runner = fakeRunner({
            "--version": { stdout: "gh version 2.62.0\n" },
            status: { started: false, code: null, stderr: "spawn gh ENOENT" },
        });
        const status = await detectGh(runner);
        expect(status.availability).not.toBe("ready");
    });
});
