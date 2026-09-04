import { describe, expect, it } from "vitest";
import type { ProcessResult, ProcessRunner } from "../cirender/gh.js";
import {
    ghAccountId,
    listGhCliAccounts,
    logoutGhCliAccount,
    parseGhAuthStatusJson,
    switchGhCliAccount,
} from "./accounts.js";

const EXECUTABLE = "C:\\Program Files\\GitHub CLI\\gh.exe";

function result(stdout = "", code = 0): ProcessResult {
    return { started: true, code, stdout, stderr: "" };
}

function runner(answer: (args: readonly string[]) => ProcessResult): {
    readonly runner: ProcessRunner;
    readonly calls: { command: string; args: readonly string[]; omitted: readonly string[] }[];
} {
    const calls: { command: string; args: readonly string[]; omitted: readonly string[] }[] = [];
    return {
        calls,
        runner: {
            run: (command, args, options) => {
                calls.push({ command, args, omitted: options?.omitEnvironmentVariables ?? [] });
                return Promise.resolve(answer(args));
            },
            runToFile: () => Promise.resolve({ started: true, code: 0, bytes: 0, stderr: "" }),
        },
    };
}

const STATUS = JSON.stringify({
    hosts: {
        "github.com": [
            {
                host: "github.com",
                login: "OctoCat",
                active: true,
                scopes: "repo, workflow",
                tokenSource: "keyring",
                gitProtocol: "https",
                state: "success",
            },
        ],
    },
});

describe("structured gh account discovery", () => {
    it("derives a stable secret-free id and rejects malformed JSON shapes", () => {
        const accounts = parseGhAuthStatusJson(STATUS);
        expect(accounts).toHaveLength(1);
        expect(accounts?.[0]).toMatchObject({
            id: ghAccountId("github.com", "OctoCat"),
            login: "OctoCat",
            healthy: true,
        });
        expect(parseGhAuthStatusJson("not json")).toBeNull();
        expect(parseGhAuthStatusJson('{"hosts":{"github.com":{}}}')).toBeNull();
    });

    it("uses only the pinned absolute executable, structured status, and per-user capability", async () => {
        const scripted = runner((args) => {
            if (args[0] === "--version") return result("gh version 2.97.0\n");
            if (args.join(" ") === "auth status --json hosts") return result(STATUS);
            return result("", 1);
        });
        const status = await listGhCliAccounts({
            runner: scripted.runner,
            executable: EXECUTABLE,
        });

        expect(status.availability).toBe("ready");
        expect(status.source).toBe("json");
        expect(status.capabilities).toEqual({ structuredStatus: true });
        expect(scripted.calls.every((call) => call.command === EXECUTABLE)).toBe(true);
        expect(scripted.calls.some((call) => call.args.join(" ") === "auth status")).toBe(false);
        expect(scripted.calls.every((call) => call.omitted.includes("GH_TOKEN"))).toBe(true);
    });

    it("fails closed as incompatible instead of scraping plain-text status", async () => {
        const scripted = runner((args) => {
            if (args[0] === "--version") return result("gh version old\n");
            return result("plain prose");
        });
        const status = await listGhCliAccounts({
            runner: scripted.runner,
            executable: EXECUTABLE,
        });
        expect(status.availability).toBe("incompatible");
        expect(status.accounts).toEqual([]);
        expect(scripted.calls.some((call) => call.args.join(" ") === "auth status")).toBe(false);
    });

    it("switches only through the explicit action and proves the resulting active row", async () => {
        const scripted = runner((args) => {
            if (args[0] === "--version") return result("gh version 2.97.0\n");
            if (args[0] === "auth" && args[1] === "status") return result(STATUS);
            if (args[0] === "auth" && args[1] === "switch") return result();
            return result("", 1);
        });
        const switched = await switchGhCliAccount(
            { runner: scripted.runner, executable: EXECUTABLE },
            "github.com",
            "OctoCat",
        );
        expect(switched.ok).toBe(true);
        expect(scripted.calls.find((call) => call.args[1] === "switch")?.args).toEqual([
            "auth",
            "switch",
            "--hostname",
            "github.com",
            "--user",
            "OctoCat",
        ]);
    });

    it("signs out one exact host/login and proves the account disappeared", async () => {
        let loggedOut = false;
        const scripted = runner((args) => {
            if (args[0] === "--version") return result("gh version 2.97.0\n");
            if (args[0] === "auth" && args[1] === "logout") {
                loggedOut = true;
                return result();
            }
            if (args[0] === "auth" && args[1] === "status") {
                return result(loggedOut ? JSON.stringify({ hosts: { "github.com": [] } }) : STATUS);
            }
            return result("", 1);
        });

        await expect(
            logoutGhCliAccount(
                { runner: scripted.runner, executable: EXECUTABLE },
                "github.com",
                "OctoCat",
            ),
        ).resolves.toMatchObject({ ok: true });
        expect(scripted.calls.find((call) => call.args[1] === "logout")?.args).toEqual([
            "auth",
            "logout",
            "--hostname",
            "github.com",
            "--user",
            "OctoCat",
        ]);
        expect(scripted.calls.every((call) => call.omitted.includes("GH_TOKEN"))).toBe(true);
    });
    it("verifies the sign-out of the very last account, which leaves no accounts behind", async () => {
        // The status read afterwards reports "no-accounts", which is a successful structured
        // answer and exactly what signing out the last account produces. Demanding "ready"
        // made this one case say "could not verify removal" about a removal that had worked.
        let loggedOut = false;
        const scripted = runner((args) => {
            if (args[0] === "--version") return result("gh version 2.97.0" + String.fromCharCode(10));
            if (args[0] === "auth" && args[1] === "logout") {
                loggedOut = true;
                return result();
            }
            if (args[0] === "auth" && args[1] === "status") {
                return result(loggedOut ? JSON.stringify({ hosts: {} }) : STATUS);
            }
            return result("", 1);
        });

        await expect(
            logoutGhCliAccount(
                { runner: scripted.runner, executable: EXECUTABLE },
                "github.com",
                "OctoCat",
            ),
        ).resolves.toMatchObject({ ok: true, localCredential: "removed" });
    });
});
