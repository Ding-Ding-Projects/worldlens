import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from "../cirender/gh.js";
import { ghAccountId } from "./accounts.js";
import { GhCredentialBroker, GhCredentialError } from "./credentialBroker.js";
import { GIT_CREDENTIAL_DIAGNOSTIC_ENVIRONMENT } from "./environment.js";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function executable(withSpaces = false): Promise<string> {
    const root = await mkdtemp(
        join(tmpdir(), withSpaces ? "worldlens gh broker " : "worldlens-gh-broker-"),
    );
    roots.push(root);
    const path = join(root, process.platform === "win32" ? "gh.exe" : "gh");
    await writeFile(path, "test executable placeholder", "utf8");
    if (process.platform !== "win32") await chmod(path, 0o700);
    return path;
}

function processResult(stdout = "", code = 0, stderr = ""): ProcessResult {
    return { started: true, code, stdout, stderr };
}

function mainRunner(
    accounts: readonly { host: string; login: string; active: boolean }[],
    identityOverride?: string,
) {
    const current = accounts.map((account) => ({ ...account }));
    const calls: {
        readonly command: string;
        readonly args: readonly string[];
        readonly options: ProcessRunOptions | undefined;
    }[] = [];
    const runner: ProcessRunner = {
        run: (command, args, options) => {
            calls.push({ command, args, options });
            if (args[0] === "--version")
                return Promise.resolve(processResult("gh version 2.97.0\n"));
            if (args.join(" ") === "auth status --json hosts") {
                const hosts = Object.fromEntries(
                    [...new Set(current.map((account) => account.host))].map((host) => [
                        host,
                        current
                            .filter((account) => account.host === host)
                            .map((account) => ({
                                ...account,
                                scopes: "repo, workflow",
                                state: "success",
                            })),
                    ]),
                );
                return Promise.resolve(
                    processResult(
                        JSON.stringify({
                            hosts,
                        }),
                    ),
                );
            }
            if (args[0] === "auth" && args[1] === "switch") {
                const host = args[args.indexOf("--hostname") + 1];
                const login = args[args.indexOf("--user") + 1];
                if (
                    host === undefined ||
                    login === undefined ||
                    !current.some((account) => account.host === host && account.login === login)
                ) {
                    return Promise.resolve(processResult("", 1));
                }
                for (const account of current) {
                    if (account.host === host) account.active = account.login === login;
                }
                return Promise.resolve(processResult());
            }
            if (args[0] === "auth" && args[1] === "logout") {
                const host = args[args.indexOf("--hostname") + 1];
                const login = args[args.indexOf("--user") + 1];
                const index = current.findIndex(
                    (account) => account.host === host && account.login === login,
                );
                if (index < 0) return Promise.resolve(processResult("", 1));
                current.splice(index, 1);
                return Promise.resolve(processResult());
            }
            if (args[0] === "api" && args.at(-1) === "user") {
                const active = current.find((account) => account.active);
                const login = identityOverride ?? active?.login;
                return Promise.resolve(
                    login === undefined ? processResult("", 1) : processResult(`${login}\n`),
                );
            }
            if (args[0] === "api")
                return Promise.resolve(processResult(JSON.stringify({ ok: true })));
            if (args[0] === "repo" && args[1] === "view") {
                return Promise.resolve(
                    processResult(JSON.stringify({ nameWithOwner: args[2], isPrivate: true })),
                );
            }
            return Promise.resolve(processResult("", 1));
        },
        runToFile: (command, args, _destination, options) => {
            calls.push({ command, args, options });
            return Promise.resolve({ started: true, code: 0, bytes: 12, stderr: "" });
        },
    };
    return { runner, calls };
}

describe("GhCredentialBroker", () => {
    it("runs selected-account commands and API calls without requesting a credential", async () => {
        const path = await executable();
        const main = mainRunner([
            { host: "github.com", login: "octocat", active: true },
            { host: "github.com", login: "monalisa", active: false },
        ]);
        const broker = new GhCredentialBroker({ runner: main.runner, candidates: [path] });
        const selected = ghAccountId("github.com", "monalisa");
        const lease = await broker.account(selected, "write");
        expect(lease).not.toBeNull();

        const response = await lease!.api("https://api.github.com/repos/monalisa/maps", {
            headers: { authorization: "Bearer must-not-reach-gh", accept: "application/json" },
        });

        expect(response.ok).toBe(true);
        expect(main.calls.some((call) => call.args[0] === "auth" && call.args[1] === "token")).toBe(
            false,
        );
        expect(main.calls.flatMap((call) => call.args).join(" ")).not.toContain(
            "must-not-reach-gh",
        );
        expect(lease).toMatchObject({
            accountId: selected,
            login: "monalisa",
            scopes: ["repo", "workflow"],
            scopesReported: true,
        });
    });

    it("downloads an Actions artifact through gh's normal JSON API redirect without the refused binary Accept header", async () => {
        const path = await executable();
        const main = mainRunner([{ host: "github.com", login: "octocat", active: true }]);
        const broker = new GhCredentialBroker({ runner: main.runner, candidates: [path] });
        const lease = await broker.account(undefined, "read");

        await lease!.downloadApi(
            "https://api.github.com/repos/o/r/actions/artifacts/9/zip",
            join(tmpdir(), "worldlens-artifact-test.zip"),
        );

        const call = main.calls.find(
            (candidate) =>
                candidate.args[0] === "api" &&
                candidate.args.includes("repos/o/r/actions/artifacts/9/zip"),
        );
        expect(call?.args).toEqual([
            "api",
            "--hostname",
            "github.com",
            "repos/o/r/actions/artifacts/9/zip",
        ]);
        expect(call?.args.join(" ")).not.toContain("application/octet-stream");
    });

    it("revalidates the selected identity through gh api before a write", async () => {
        const path = await executable();
        const main = mainRunner([{ host: "github.com", login: "octocat", active: true }]);
        const broker = new GhCredentialBroker({ runner: main.runner, candidates: [path] });
        await expect(broker.account(undefined, "write")).resolves.toMatchObject({
            login: "octocat",
        });
        expect(
            main.calls.some((call) =>
                call.args.join(" ").includes("api --hostname github.com --jq .login user"),
            ),
        ).toBe(true);
    });

    it("fails a write closed on identity mismatch", async () => {
        const path = await executable();
        const main = mainRunner(
            [{ host: "github.com", login: "octocat", active: true }],
            "someone-else",
        );
        const broker = new GhCredentialBroker({ runner: main.runner, candidates: [path] });
        await expect(broker.account(undefined, "write")).rejects.toMatchObject({
            code: "identity-unverified",
        } satisfies Partial<GhCredentialError>);
    });

    it("does not guess among multiple non-active accounts", async () => {
        const path = await executable();
        const main = mainRunner([
            { host: "github.com", login: "octocat", active: false },
            { host: "github.com", login: "monalisa", active: false },
        ]);
        const broker = new GhCredentialBroker({ runner: main.runner, candidates: [path] });
        await expect(broker.account()).rejects.toMatchObject({ code: "account-ambiguous" });
    });

    it("strips the enterprise REST prefix before routing through gh api", async () => {
        const path = await executable();
        const main = mainRunner([{ host: "ghe.example", login: "octocat", active: true }]);
        const broker = new GhCredentialBroker({ runner: main.runner, candidates: [path] });
        const lease = await broker.account(ghAccountId("ghe.example", "octocat"));

        const response = await lease!.api(
            "https://ghe.example/api/v3/repos/octocat/maps/actions/workflows/render.yml?ref=main",
        );

        expect(response.ok).toBe(true);
        expect(main.calls).toContainEqual(
            expect.objectContaining({
                args: [
                    "api",
                    "--hostname",
                    "ghe.example",
                    "-X",
                    "GET",
                    "-H",
                    "accept: application/vnd.github+json",
                    "repos/octocat/maps/actions/workflows/render.yml?ref=main",
                ],
            }),
        );
        expect(main.calls.flatMap((call) => call.args).join(" ")).not.toContain("api/v3/api/v3");
    });

    it("pins nested git credential helpers to the trusted gh executable, including a spaced path", async () => {
        const path = await executable(true);
        const main = mainRunner([{ host: "ghe.example", login: "octocat", active: true }]);
        const broker = new GhCredentialBroker({ runner: main.runner, candidates: [path] });
        const lease = await broker.account(ghAccountId("ghe.example", "octocat"));
        const trustedExecutable = await broker.executable();
        expect(trustedExecutable).not.toBeNull();

        await lease!.withAccount(
            async (runner) =>
                await runner.run("git", [
                    "-c",
                    "credential.helper=!gh auth git-credential",
                    "push",
                    "https://github.com/octocat/maps.git",
                ]),
        );

        const push = main.calls.find((call) => call.command === "git");
        expect(push?.args).toContain(
            `credential.helper=!'${trustedExecutable!.replaceAll("\\", "/")}' auth git-credential`,
        );
        expect(push?.args).toContain("https://ghe.example/octocat/maps.git");
        expect(push?.args.join(" ")).not.toContain("=!gh auth git-credential");
        expect(push?.args).toContain("credential.interactive=false");
        expect(push?.options?.input).toBe("");
        expect(push?.options?.omitEnvironmentVariables).toEqual(
            expect.arrayContaining([...GIT_CREDENTIAL_DIAGNOSTIC_ENVIRONMENT]),
        );
    });

    it("surfaces a failed account restore and preserves the operation failure as its cause", async () => {
        const path = await executable();
        const main = mainRunner([
            { host: "github.com", login: "octocat", active: true },
            { host: "github.com", login: "monalisa", active: false },
        ]);
        const operationFailure = new Error("repository command failed");
        const runner: ProcessRunner = {
            ...main.runner,
            run: async (command, args, options) => {
                if (
                    args[0] === "auth" &&
                    args[1] === "switch" &&
                    args[args.indexOf("--user") + 1] === "octocat"
                ) {
                    return processResult("", 1);
                }
                if (args[0] === "repo") throw operationFailure;
                return await main.runner.run(command, args, options);
            },
        };
        const broker = new GhCredentialBroker({ runner, candidates: [path] });
        const lease = await broker.account(ghAccountId("github.com", "monalisa"));

        const error = await lease!
            .run(["repo", "view", "monalisa/maps"])
            .catch((reason: unknown) => reason);

        expect(error).toMatchObject({
            code: "account-restore-failed",
            needsSignIn: true,
            cause: operationFailure,
        } satisfies Partial<GhCredentialError>);
    });

    it("serializes an explicit account switch behind an in-flight selected-account lease", async () => {
        const path = await executable();
        const main = mainRunner([
            { host: "github.com", login: "octocat", active: true },
            { host: "github.com", login: "monalisa", active: false },
        ]);
        const broker = new GhCredentialBroker({ runner: main.runner, candidates: [path] });
        const lease = await broker.account(ghAccountId("github.com", "monalisa"));
        let enter!: () => void;
        let release!: () => void;
        const entered = new Promise<void>((resolve) => {
            enter = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const operation = lease!.withAccount(async () => {
            enter();
            await gate;
        });
        await entered;

        let switchSettled = false;
        const switching = broker.switchAccount("github.com", "octocat").then((result) => {
            switchSettled = true;
            return result;
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(switchSettled).toBe(false);

        release();
        await operation;
        await expect(switching).resolves.toMatchObject({ ok: true });
        expect(switchSettled).toBe(true);
    });

    it("serializes the post-approval credential-store mutation behind an in-flight lease", async () => {
        const path = await executable();
        const main = mainRunner([{ host: "github.com", login: "octocat", active: true }]);
        const broker = new GhCredentialBroker({ runner: main.runner, candidates: [path] });
        const lease = await broker.account();
        let enter!: () => void;
        let release!: () => void;
        const entered = new Promise<void>((resolve) => {
            enter = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const operation = lease!.withAccount(async () => {
            enter();
            await gate;
        });
        await entered;

        let mutationSettled = false;
        const mutation = broker.withCredentialStoreMutation(async () => {
            mutationSettled = true;
            return "stored";
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(mutationSettled).toBe(false);

        release();
        await operation;
        await expect(mutation).resolves.toBe("stored");
    });

    it("serializes per-account logout behind an in-flight selected-account lease", async () => {
        const path = await executable();
        const main = mainRunner([
            { host: "github.com", login: "octocat", active: true },
            { host: "github.com", login: "monalisa", active: false },
        ]);
        const broker = new GhCredentialBroker({ runner: main.runner, candidates: [path] });
        const lease = await broker.account(ghAccountId("github.com", "monalisa"));
        let enter!: () => void;
        let release!: () => void;
        const entered = new Promise<void>((resolve) => {
            enter = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const operation = lease!.withAccount(async () => {
            enter();
            await gate;
        });
        await entered;

        let logoutSettled = false;
        const logout = broker.logoutAccount("github.com", "monalisa").then((result) => {
            logoutSettled = true;
            return result;
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(logoutSettled).toBe(false);

        release();
        await operation;
        await expect(logout).resolves.toMatchObject({ ok: true });
    });
});
