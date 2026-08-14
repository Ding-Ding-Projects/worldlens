/**
 * A dedicated guard that the assisted sign-in flow never persists, returns, or logs the
 * approved GitHub access token.
 *
 * This is separate from `login.test.ts`, which already exercises the flow end to end and
 * happens to assert the token is absent from several individual outputs along the way.
 * That coverage is real, but it is scattered across tests whose primary purpose is
 * something else, which is exactly the shape that lets a new leak slip in beside an
 * unrelated change: a reviewer skimming a diff to `login.ts` has no single place that
 * says "this file's whole job is proving the token never leaks". This file is that place,
 * and it asserts on the real module's exports and on what `loginGhCli` actually writes to
 * its runner and emits through `onState` - never on a comment claiming good behaviour.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    GH_CLI_LOGIN_SCOPES,
    loginGhCli,
    type GhCliLoginState,
} from "./login.js";
import type {
    ProcessResult,
    ProcessRunOptions,
    ProcessRunner,
    ProcessToFileResult,
} from "../cirender/gh.js";

const SOURCE_PATH = fileURLToPath(new URL("./login.ts", import.meta.url));

function source(): string {
    return readFileSync(SOURCE_PATH, "utf8");
}

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

interface Call {
    readonly args: readonly string[];
    readonly input: string | undefined;
}

function fakeRunner(overrides: Readonly<Record<string, Partial<ProcessResult>>>): ProcessRunner & {
    readonly calls: Call[];
} {
    const calls: Call[] = [];
    return {
        calls,
        run(_command, args, options?: ProcessRunOptions): Promise<ProcessResult> {
            calls.push({ args: [...args], input: options?.input });
            return Promise.resolve({
                started: true,
                code: 0,
                stdout: "",
                stderr: "",
                ...overrides[args.join(" ")],
            });
        },
        runToFile(): Promise<ProcessToFileResult> {
            return Promise.resolve({ started: true, code: 0, bytes: 0, stderr: "" });
        },
    };
}

const STATUS_JSON = JSON.stringify({
    hosts: {
        "github.com": [
            {
                state: "success",
                active: true,
                host: "github.com",
                login: "octocat",
                tokenSource: "keyring",
                scopes: GH_CLI_LOGIN_SCOPES.join(", "),
                gitProtocol: "https",
            },
        ],
    },
});

describe("loginGhCli source honesty", () => {
    it("never spawns gh with --show-token, and the module carries no console/log call", () => {
        const text = source();
        expect(text.includes("--show-token")).toBe(false);
        // A logging call would be the other route a token could escape by: printed for
        // debugging and then shipped. This module must contain none, on any object that
        // could hold the token.
        expect(/\bconsole\.\w+\s*\(/.test(text)).toBe(false);
    });

    it("declares the public state shape with no field capable of naming a token", () => {
        const text = source();
        const interfaceMatch = /export interface GhCliLoginState \{[\s\S]*?\n\}/.exec(text);
        expect(interfaceMatch).not.toBeNull();
        const body = interfaceMatch?.[0] ?? "";
        // Checked against actual field declarations, not the whole interface body: the
        // interface's own doc comment says in prose that the token is absent, and that
        // sentence would otherwise defeat the very check meant to prove it.
        const fieldNames = [...body.matchAll(/readonly\s+(\w+)\s*:/g)].map((match) => match[1] ?? "");
        for (const name of fieldNames) {
            expect(/token|credential|secret/i.test(name)).toBe(false);
        }
    });
});

describe("loginGhCli runtime secrecy", () => {
    it("writes the approved token to gh only over stdin, never in argv, and returns/emits none of it", async () => {
        const accessToken = "gho_guard_token_should_never_leak_0000000000";
        const deviceCode = "guard-device-code-should-never-leak";
        const bodies: readonly unknown[] = [
            {
                device_code: deviceCode,
                user_code: "WXYZ-1234",
                verification_uri: "https://github.com/login/device",
                verification_uri_complete: "https://github.com/login/device?user_code=WXYZ-1234",
                expires_in: 900,
                interval: 1,
            },
            { access_token: accessToken, token_type: "bearer", scope: GH_CLI_LOGIN_SCOPES.join(" ") },
        ];
        const queue = [...bodies];
        const process = fakeRunner({
            "auth status --hostname github.com --json hosts": { stdout: STATUS_JSON },
            "api --hostname github.com user --jq .login": { stdout: "octocat\n" },
        });
        const states: GhCliLoginState[] = [];

        const result = await loginGhCli({
            runner: process,
            executable: "C:\\Program Files\\GitHub CLI\\gh.exe",
            fetch: () => {
                const next = queue.shift();
                if (next === undefined) return Promise.reject(new Error("unexpected fetch"));
                return Promise.resolve(response(next));
            },
            sleep: () => Promise.resolve(),
            now: () => 1_000,
            onState: (state) => states.push(state),
            withCredentialStoreLock: async (operation) => operation(),
        });

        expect(result.ok).toBe(true);

        // Exactly one call carries the token, and it is delivered as stdin to
        // `gh auth login --with-token`, never as part of the argument vector.
        const loginCall = process.calls.find((call) => call.args.includes("--with-token"));
        expect(loginCall).toBeDefined();
        expect(loginCall?.input).toBe(accessToken);
        expect(loginCall?.args).not.toContain(accessToken);
        for (const call of process.calls) {
            expect(call.args.join(" ")).not.toContain(accessToken);
        }

        // Every single state this run ever emitted, and the final result returned to the
        // caller, are checked as a whole rather than field by field: whichever field a
        // future edit might add is covered, because the assertion is against the entire
        // serialized shape rather than a named property that a rename could dodge.
        expect(JSON.stringify(states)).not.toContain(accessToken);
        expect(JSON.stringify(states)).not.toContain(deviceCode);
        expect(JSON.stringify(result)).not.toContain(accessToken);
        expect(JSON.stringify(result)).not.toContain(deviceCode);

        // The state actually returned to the renderer carries the requested scopes in
        // the clear (they are public, not secret) but nothing that could be the token.
        expect(result.state.requestedScopes).toEqual(GH_CLI_LOGIN_SCOPES);
    });
});
