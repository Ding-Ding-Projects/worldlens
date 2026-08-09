/**
 * The channel, against a fake `ipcMain`.
 *
 * The module takes `IpcMain` as a parameter and imports Electron only as a type, so every
 * channel can be reached exactly as the renderer would reach it with no Electron runtime
 * anywhere near the test.
 *
 * Two assertions matter more than the rest, and both are negative. **Authorization never
 * crosses**: a renderer that could ask for it would make every other
 * precaution in this feature decorative. And **an acknowledgement is only ever `true`**: a
 * renderer sending the string `"yes"` must not have that read as consent to publish
 * somebody's world.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GhCredentialError, type GhCliAccountProvider } from "../ghcli/credentialBroker.js";
import { fakeGhAccountLease } from "../ghcli/testLease.js";
import { RecordingGitHub, repositoryJson } from "./recordingGitHub.js";
import { ciSyncWorkspace, newCiSyncState, syncIdFor, writeCiSyncState } from "./state.js";
import { CIRENDER_CHANNELS, CIRENDER_EVENT_CHANNEL, installCiRenderIpc } from "./ipc.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function fakeIpcMain(): IpcMain & { readonly handlers: Map<string, Handler> } {
    const handlers = new Map<string, Handler>();
    return {
        handlers,
        handle(channel: string, handler: Handler): void {
            if (handlers.has(channel)) throw new Error(`second handler for '${channel}'`);
            handlers.set(channel, handler);
        },
        removeHandler(channel: string): void {
            handlers.delete(channel);
        },
    } as unknown as IpcMain & { readonly handlers: Map<string, Handler> };
}

const noEvent = {} as IpcMainInvokeEvent;
const FORBIDDEN_RENDERER_VALUE = "synthetic-authorization-must-never-cross";
const OWNER = "o";
const REPO = "r";

let workDir = "";
let world = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-cirender-ipc-"));
    world = join(workDir, "world");
    await mkdir(join(world, "region"), { recursive: true });
    await writeFile(join(world, "level.dat"), "level");
    await writeFile(join(world, "region", "r.0.0.mca"), "region");
    await writeFile(
        join(world, "worldlens.project.json"),
        JSON.stringify({
            version: 1,
            id: "p",
            name: "Overworld",
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-01T00:00:00Z",
            maps: [
                {
                    id: "world",
                    name: "World",
                    dimension: "minecraft:overworld",
                    config: "",
                    storage: "file",
                    sorting: 0,
                    enabled: true,
                },
            ],
        }),
        "utf8",
    );
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

function accountProvider(
    calls?: (string | undefined)[],
    accepted: string | null = null,
    github: RecordingGitHub = new RecordingGitHub(),
): GhCliAccountProvider {
    return async (accountId) => {
        calls?.push(accountId);
        if (accepted !== null && accountId !== accepted) return null;
        const login = accountId === "acct-2" ? "monalisa" : OWNER;
        return fakeGhAccountLease({
            accountId: accountId ?? "active-account",
            login,
            api: github.fetch,
            run: async (args) => {
                if (args.at(-1) === "user") {
                    return { started: true, code: 0, stdout: JSON.stringify({ login }), stderr: "" };
                }
                if (args.includes("graphql")) {
                    return {
                        started: true,
                        code: 0,
                        stdout: '[{"data":{"viewer":{"organizations":{"nodes":[]}}}}]',
                        stderr: "",
                    };
                }
                if (args.some((arg) => arg.includes("user/repos"))) {
                    return { started: true, code: 0, stdout: "[]", stderr: "" };
                }
                return {
                    started: true,
                    code: 1,
                    stdout: "",
                    stderr: "GraphQL: Could not resolve to a Repository with that name. (repository)",
                };
            },
        });
    };
}

function install(
    options: {
        signedIn?: boolean;
        isPrivate?: boolean;
        github?: RecordingGitHub;
        account?: GhCliAccountProvider;
    } = {},
) {
    const ipcMain = fakeIpcMain();
    const broadcast: unknown[] = [];
    const github =
        options.github ??
        new RecordingGitHub()
            .on("POST", "/dispatches", { status: 204 })
            .on("GET", /\/actions\/workflows\/render-world\.yml$/, {
                status: 200,
                json: { id: 1, name: "Render world", state: "active", path: "x" },
            })
            .on("GET", /\/repos\/o\/r$/, {
                status: 200,
                json: repositoryJson({ owner: OWNER, repo: REPO, isPrivate: options.isPrivate ?? true }),
            });
    const ipc = installCiRenderIpc({
        ipcMain,
        storageDir: () => join(workDir, "maps"),
        account:
            options.account ??
            (options.signedIn === false ? async () => null : accountProvider(undefined, null, github)),
        eulaAccepted: () => true,
        broadcast: (event) => broadcast.push(event),
        sleep: () => Promise.resolve(),
        runLookupAttempts: 1,
    });
    return { ipcMain, ipc, broadcast, github };
}

describe("registration", () => {
    it("registers exactly the channels it names, and removes exactly those", () => {
        const { ipcMain, ipc } = install();
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...CIRENDER_CHANNELS].sort());
        ipc.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("names the event channel once, so a listener and a sender cannot drift", () => {
        expect(CIRENDER_EVENT_CHANNEL).toBe("cirender:event");
    });

    it("has no channel that could accept Mojang's licence", () => {
        expect([...CIRENDER_CHANNELS].some((channel) => /eula|consent|accept/i.test(channel))).toBe(false);
    });
});

describe("what crosses", () => {
    it("never puts the token in any answer", async () => {
        const { ipcMain } = install();
        const answers: unknown[] = [
            await (ipcMain.handlers.get("cirender:preflight") as Handler)(noEvent, {
                worldFolder: world,
                owner: OWNER,
                repo: REPO,
            }),
            await (ipcMain.handlers.get("cirender:list") as Handler)(noEvent),
            await (ipcMain.handlers.get("cirender:active") as Handler)(noEvent),
        ];
        for (const answer of answers) {
            expect(JSON.stringify(answer)).not.toContain(FORBIDDEN_RENDERER_VALUE);
        }
    });

    it("reports the public-repository warning through preflight", async () => {
        const { ipcMain } = install({ isPrivate: false });
        const answer = (await (ipcMain.handlers.get("cirender:preflight") as Handler)(noEvent, {
            worldFolder: world,
            owner: OWNER,
            repo: REPO,
        })) as { ok: true; value: { repository: { private: boolean; warning: { message: string } } } };

        expect(answer.ok).toBe(true);
        expect(answer.value.repository.private).toBe(false);
        expect(answer.value.repository.warning.message).toContain("PUBLIC");
    });

    it("reads an acknowledgement as consent only when it is exactly true", async () => {
        const { ipcMain, github } = install({ isPrivate: false });
        const result = (await (ipcMain.handlers.get("cirender:start") as Handler)(noEvent, {
            worldFolder: world,
            owner: OWNER,
            repo: REPO,
            // A renderer sending a truthy string must not publish somebody's world.
            acknowledgePublic: "yes",
            acknowledgeUpload: 1,
        })) as { ok: false; failure: { code: string } };

        expect(result.ok).toBe(false);
        expect(result.failure.code).toBe("public-not-acknowledged");
        // Nothing was published and nothing was started: a release is the first write an
        // upload makes, so its absence is the proof that no world left the machine.
        expect(github.never("/releases")).toBe(true);
        expect(github.never("/dispatches")).toBe(true);
    });
});

/**
 * The setup card's account picker names a stored account by id, additively, over these
 * three channels: `cirender:owners`, `cirender:preflight` and `cirender:start`. Each test
 * here proves the id in the request payload actually reaches the broker, not merely that
 * the channel still answers something.
 */
describe("the account id a request names reaches the gh credential broker", () => {
    it("cirender:owners resolves for the account id the request names, and for nobody without one", async () => {
        const ipcMain = fakeIpcMain();
        const accountCalls: (string | undefined)[] = [];
        installCiRenderIpc({
            ipcMain,
            storageDir: () => join(workDir, "maps"),
            account: accountProvider(accountCalls, "acct-2"),
            eulaAccepted: () => true,
            broadcast: () => {},
            sleep: () => Promise.resolve(),
        });

        const withoutAccount = (await (ipcMain.handlers.get("cirender:owners") as Handler)(
            noEvent,
            undefined,
        )) as { ok: boolean; signedIn?: boolean };
        expect(withoutAccount.ok).toBe(false);
        expect(withoutAccount.signedIn).toBe(false);

        const withAccount = (await (ipcMain.handlers.get("cirender:owners") as Handler)(noEvent, {
            accountId: "acct-2",
        })) as { ok: boolean; login?: string };
        expect(withAccount.ok).toBe(true);
        expect(withAccount.login).toBe("monalisa");

        expect(accountCalls).toEqual([undefined, "acct-2"]);
    });

    it("cirender:preflight carries the account id from the request body to the account broker", async () => {
        const ipcMain = fakeIpcMain();
        const accountCalls: (string | undefined)[] = [];
        const github = new RecordingGitHub()
            .on("GET", /\/actions\/workflows\/render-world\.yml$/, {
                status: 200,
                json: { id: 1, name: "Render world", state: "active", path: "x" },
            })
            .on("GET", /\/repos\/o\/r$/, {
                status: 200,
                json: repositoryJson({ owner: OWNER, repo: REPO, isPrivate: true }),
            });
        installCiRenderIpc({
            ipcMain,
            storageDir: () => join(workDir, "maps"),
            account: accountProvider(accountCalls, null, github),
            eulaAccepted: () => true,
            broadcast: () => {},
            sleep: () => Promise.resolve(),
        });

        await (ipcMain.handlers.get("cirender:preflight") as Handler)(noEvent, {
            worldFolder: world,
            owner: OWNER,
            repo: REPO,
            accountId: "acct-9",
        });

        expect(accountCalls).toContain("acct-9");
    });

    it("cirender:start carries the account id from the request body to the account broker, refused or not", async () => {
        const ipcMain = fakeIpcMain();
        const accountCalls: (string | undefined)[] = [];
        const github = new RecordingGitHub();
        installCiRenderIpc({
            ipcMain,
            storageDir: () => join(workDir, "maps"),
            account: accountProvider(accountCalls, null, github),
            eulaAccepted: () => true,
            broadcast: () => {},
            sleep: () => Promise.resolve(),
        });

        // Refused for want of a repository read, well before any network call - but the
        // credential is still resolved for the named account on the way there.
        await (ipcMain.handlers.get("cirender:start") as Handler)(noEvent, {
            worldFolder: world,
            owner: OWNER,
            repo: REPO,
            accountId: "acct-9",
        });

        expect(accountCalls).toContain("acct-9");
    });
});

describe("being signed out is an answer, not a crash", () => {
    it("reports that neither credential can drive a render, without calling GitHub", async () => {
        // Preflight answers rather than refusing: its whole job is to say what would
        // happen, and "neither of your two GitHub sign-ins can do this, here is why for
        // each" is exactly that. With no in-app token there is nothing to probe with, and
        // `gh` is stubbed as absent, so not a single request goes out.
        const { ipcMain, github } = install({ signedIn: false });
        const answer = (await (ipcMain.handlers.get("cirender:preflight") as Handler)(noEvent, {
            worldFolder: world,
            owner: OWNER,
            repo: REPO,
        })) as { ok: true; value: { routeReport: { ready: boolean; route: string | null; describe: string } } };

        expect(answer.ok).toBe(true);
        expect(answer.value.routeReport.ready).toBe(false);
        expect(answer.value.routeReport.route).toBeNull();
        expect(answer.value.routeReport.describe).toContain("Settings");
        expect(answer.value.routeReport.describe).toContain("gh");
        expect(github.calls).toHaveLength(0);
    });

    it("still answers cirender:active and cirender:cancel, which need nothing", async () => {
        const { ipcMain } = install({ signedIn: false });
        expect(await (ipcMain.handlers.get("cirender:active") as Handler)(noEvent)).toEqual([]);
        expect(await (ipcMain.handlers.get("cirender:cancel") as Handler)(noEvent, "nope")).toBe(false);
    });
});

describe("a malformed request is refused, never guessed at", () => {
    it("refuses a start with no world folder", async () => {
        const { ipcMain } = install();
        const result = (await (ipcMain.handlers.get("cirender:start") as Handler)(noEvent, {
            owner: OWNER,
            repo: REPO,
        })) as { ok: false; failure: { code: string } };
        expect(result.ok).toBe(false);
        expect(result.failure.code).toBe("invalid-request");
    });

    it("refuses a check with no id", async () => {
        const { ipcMain } = install();
        const result = (await (ipcMain.handlers.get("cirender:check") as Handler)(noEvent, "  ")) as {
            ok: false;
            failure: { code: string };
        };
        expect(result.ok).toBe(false);
        expect(result.failure.code).toBe("invalid-request");
    });

    it("refuses preflight for a request that is not an object at all", async () => {
        const { ipcMain } = install();
        const answer = (await (ipcMain.handlers.get("cirender:preflight") as Handler)(noEvent, 7)) as {
            ok: boolean;
        };
        expect(answer.ok).toBe(false);
    });
});

describe("listing what this computer remembers", () => {
    it("answers with every readable record and leaves out the ones it cannot read", async () => {
        const storage = join(workDir, "maps");
        const syncId = syncIdFor(OWNER, REPO, world, "world");
        await writeCiSyncState(
            ciSyncWorkspace(storage, syncId).stateFile,
            newCiSyncState({
                syncId,
                owner: OWNER,
                repo: REPO,
                worldFolder: world,
                mapId: "world",
                mapName: "World",
                dimension: "minecraft:overworld",
                at: "2026-08-04T10:00:00Z",
            }),
        );
        // A record from a format this build does not know is skipped rather than shown
        // as a half-filled row.
        const stranger = ciSyncWorkspace(storage, "from-the-future");
        await mkdir(stranger.root, { recursive: true });
        await writeFile(stranger.stateFile, JSON.stringify({ version: 99 }), "utf8");

        const { ipcMain } = install();
        const answer = (await (ipcMain.handlers.get("cirender:list") as Handler)(noEvent)) as {
            ok: true;
            value: { syncId: string }[];
        };

        expect(answer.ok).toBe(true);
        expect(answer.value.map((state) => state.syncId)).toEqual([syncId]);
    });

    it("answers an empty list on a computer that has never synced anything", async () => {
        const { ipcMain } = install();
        const answer = (await (ipcMain.handlers.get("cirender:list") as Handler)(noEvent)) as {
            ok: true;
            value: unknown[];
        };
        expect(answer.value).toEqual([]);
    });
});

describe("the setup card's own three channels", () => {
    it("cirender:owners answers the login and orgs when signed in", async () => {
        const account: GhCliAccountProvider = async () => fakeGhAccountLease({
            accountId: "active-account",
            login: OWNER,
            run: async (args) => {
                if (args.at(-1) === "user") {
                    return {
                        started: true,
                        code: 0,
                        stdout: JSON.stringify({ login: OWNER }),
                        stderr: "",
                    };
                }
                return {
                    started: true,
                    code: 0,
                    stdout: JSON.stringify([
                        {
                            data: {
                                viewer: {
                                    organizations: {
                                        nodes: [
                                            {
                                                login: "the-nether-guild",
                                                viewerCanCreateRepositories: true,
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                    ]),
                    stderr: "",
                };
            },
        });
        const { ipcMain } = install({ account });

        const answer = (await (ipcMain.handlers.get("cirender:owners") as Handler)(noEvent)) as {
            ok: true;
            login: string;
            owners: { login: string; kind: string }[];
        };

        expect(answer).toEqual({
            ok: true,
            login: OWNER,
            owners: [
                { login: OWNER, kind: "user" },
                { login: "the-nether-guild", kind: "organization" },
            ],
        });
    });

    it("cirender:owners answers signedIn: false without calling GitHub, not a throw", async () => {
        const github = new RecordingGitHub();
        const { ipcMain } = install({ signedIn: false, github });

        const answer = (await (ipcMain.handlers.get("cirender:owners") as Handler)(noEvent)) as {
            ok: false;
            signedIn: boolean;
        };

        expect(answer.ok).toBe(false);
        expect(answer.signedIn).toBe(false);
        expect(github.calls).toHaveLength(0);
    });

    it("cirender:suggestRepoName sanitizes without touching the network", async () => {
        const github = new RecordingGitHub();
        const { ipcMain } = install({ github });

        const answer = await (ipcMain.handlers.get("cirender:suggestRepoName") as Handler)(
            noEvent,
            "My Overworld!!",
        );

        expect(answer).toBe("My-Overworld");
        expect(github.calls).toHaveLength(0);
    });

    it("cirender:checkRepoName reports taken, available and unknown honestly", async () => {
        const account: GhCliAccountProvider = async () => fakeGhAccountLease({
            accountId: "active-account",
            login: OWNER,
            run: async (args) => {
                const target = args.at(2);
                if (target?.endsWith("/taken")) {
                    return {
                        started: true,
                        code: 0,
                        stdout: JSON.stringify({
                            name: "taken",
                            nameWithOwner: `${OWNER}/taken`,
                            owner: { login: OWNER },
                            isPrivate: false,
                            url: `https://github.com/${OWNER}/taken`,
                        }),
                        stderr: "",
                    };
                }
                if (target?.endsWith("/free")) {
                    return {
                        started: true,
                        code: 1,
                        stdout: "",
                        stderr:
                            "GraphQL: Could not resolve to a Repository with that name. (repository)",
                    };
                }
                return {
                    started: true,
                    code: 1,
                    stdout: "",
                    stderr: "HTTP 503: service unavailable",
                };
            },
        });
        const { ipcMain } = install({ account });
        const handler = ipcMain.handlers.get("cirender:checkRepoName") as Handler;

        const taken = (await handler(noEvent, { owner: OWNER, repo: "taken" })) as { status: string };
        const free = (await handler(noEvent, { owner: OWNER, repo: "free" })) as { status: string };
        const unknown = (await handler(noEvent, { owner: OWNER, repo: "rate-limited" })) as {
            status: string;
        };

        expect(taken.status).toBe("taken");
        expect(free.status).toBe("available");
        expect(unknown.status).toBe("unknown");
    });

    it("cirender:checkRepoName never guesses available for a blank name", async () => {
        const github = new RecordingGitHub();
        const { ipcMain } = install({ github });

        const answer = (await (ipcMain.handlers.get("cirender:checkRepoName") as Handler)(noEvent, {
            owner: "",
            repo: "",
        })) as { status: string };

        expect(answer.status).toBe("unknown");
        expect(github.calls).toHaveLength(0);
    });

    it("preserves direct reauthentication recovery when repository creation cannot acquire its write lease", async () => {
        const { ipcMain } = install({
            account: async () => {
                throw new GhCredentialError(
                    "account-unhealthy",
                    "The selected GitHub CLI account needs reauthentication.",
                );
            },
        });
        const answer = (await (ipcMain.handlers.get("cirender:createRepository") as Handler)(noEvent, {
            ownerLogin: OWNER,
            ownerKind: "user",
            name: "fresh",
            private: true,
        })) as { ok: false; code: string; needsSignIn?: boolean };

        expect(answer).toMatchObject({ ok: false, code: "cli-failed", needsSignIn: true });
    });
});

describe("cirender:scheduleRead and cirender:scheduleWrite", () => {
    it("scheduleRead answers a disabled, never-configured status when nothing is set", async () => {
        const github = new RecordingGitHub()
            .on("GET", /\/actions\/workflows\/render-world\.yml$/, {
                status: 200,
                json: { id: 1, name: "Render world", state: "active", path: "x" },
            })
            .on("GET", /\/actions\/variables\//, { status: 404, json: { message: "Not Found" } });
        const { ipcMain } = install({ github, isPrivate: true });

        const answer = (await (ipcMain.handlers.get("cirender:scheduleRead") as Handler)(noEvent, {
            owner: OWNER,
            repo: REPO,
        })) as { ok: true; value: { enabled: boolean; cadence: string | null } };

        expect(answer.ok).toBe(true);
        expect(answer.value.enabled).toBe(false);
        expect(answer.value.cadence).toBeNull();
    });

    it("scheduleRead refuses with a repository owner and name required, when neither is given", async () => {
        const { ipcMain } = install();
        const answer = (await (ipcMain.handlers.get("cirender:scheduleRead") as Handler)(noEvent, {})) as {
            ok: boolean;
            message: string;
        };
        expect(answer.ok).toBe(false);
        expect(answer.message).toContain("repository owner and name");
    });

    it("scheduleWrite refuses an unrecognised cadence rather than writing a cron string through", async () => {
        const { ipcMain } = install();
        const answer = (await (ipcMain.handlers.get("cirender:scheduleWrite") as Handler)(noEvent, {
            syncId: "whatever",
            enabled: true,
            cadence: "0 * * * *",
        })) as { ok: boolean; message: string };
        expect(answer.ok).toBe(false);
        expect(answer.message).toContain("cadence");
    });

    it("scheduleWrite refuses for a sync id with no recorded state", async () => {
        const { ipcMain } = install();
        const answer = (await (ipcMain.handlers.get("cirender:scheduleWrite") as Handler)(noEvent, {
            syncId: "no-such-sync",
            enabled: true,
            cadence: "daily",
        })) as { ok: boolean; message: string };
        expect(answer.ok).toBe(false);
        expect(answer.message).toContain("no-such-sync");
    });

    it("scheduleWrite turns scheduling on and writes the derived release-asset world, for a synced world", async () => {
        const github = new RecordingGitHub()
            .on("GET", /\/actions\/workflows\/render-world\.yml$/, {
                status: 200,
                json: { id: 1, name: "Render world", state: "active", path: "x" },
            })
            .on("PATCH", /\/actions\/variables\//, { status: 404, json: { message: "Not Found" } })
            .on("POST", /\/actions\/variables$/, { status: 201 });
        const { ipcMain } = install({ github, isPrivate: true });

        const syncId = syncIdFor(OWNER, REPO, world, "world");
        const workspace = ciSyncWorkspace(join(workDir, "maps"), syncId);
        const state = {
            ...newCiSyncState({
                syncId,
                owner: OWNER,
                repo: REPO,
                worldFolder: world,
                mapId: "world",
                mapName: "World",
                dimension: "minecraft:overworld",
                at: "2026-08-01T00:00:00Z",
            }),
            releaseTag: "mbm-ci-world-2026-08-01T00-00-00Z",
            assetName: "world.zip",
        };
        await writeCiSyncState(workspace.stateFile, state);

        const answer = (await (ipcMain.handlers.get("cirender:scheduleWrite") as Handler)(noEvent, {
            syncId,
            enabled: true,
            cadence: "daily",
        })) as { ok: true; value: { ok: boolean } };

        expect(answer.ok).toBe(true);
        expect(answer.value.ok).toBe(true);

        const worldWrite = github.calls.find(
            (call) => call.method === "POST" && call.url.includes("/actions/variables") && call.body?.includes("CIRENDER_SCHEDULE_WORLD\""),
        );
        expect(worldWrite).toBeDefined();
        expect(JSON.parse(worldWrite?.body ?? "{}")).toEqual({
            name: "CIRENDER_SCHEDULE_WORLD",
            value: "mbm-ci-world-2026-08-01T00-00-00Z/world.zip",
        });
    });

    it("scheduleWrite uses the durable sync account instead of a newer renderer selection", async () => {
        const github = new RecordingGitHub()
            .on("GET", /\/actions\/workflows\/render-world\.yml$/, {
                status: 200,
                json: { id: 1, name: "Render world", state: "active", path: "x" },
            })
            .on("PATCH", /\/actions\/variables\//, { status: 404, json: { message: "Not Found" } })
            .on("POST", /\/actions\/variables$/, { status: 201 });
        const accountCalls: (string | undefined)[] = [];
        const { ipcMain } = install({
            github,
            account: accountProvider(accountCalls, null, github),
            isPrivate: true,
        });

        const syncId = syncIdFor(OWNER, REPO, world, "world");
        const workspace = ciSyncWorkspace(join(workDir, "maps"), syncId);
        await writeCiSyncState(workspace.stateFile, {
            ...newCiSyncState({
                syncId,
                owner: OWNER,
                repo: REPO,
                accountId: "acct-a",
                worldFolder: world,
                mapId: "world",
                mapName: "World",
                dimension: "minecraft:overworld",
                at: "2026-08-01T00:00:00Z",
            }),
            releaseTag: "mbm-ci-world-2026-08-01T00-00-00Z",
            assetName: "world.zip",
        });

        const answer = (await (ipcMain.handlers.get("cirender:scheduleWrite") as Handler)(noEvent, {
            syncId,
            accountId: "acct-b",
            enabled: true,
            cadence: "daily",
        })) as { ok: true; value: { ok: boolean } };

        expect(answer.ok).toBe(true);
        expect(answer.value.ok).toBe(true);
        expect(accountCalls).toContain("acct-a");
        expect(accountCalls).not.toContain("acct-b");
    });

    it("scheduleWrite refuses to enable scheduling for a world that has never been uploaded", async () => {
        const github = new RecordingGitHub().on("GET", /\/actions\/workflows\/render-world\.yml$/, {
            status: 200,
            json: { id: 1, name: "Render world", state: "active", path: "x" },
        });
        const { ipcMain } = install({ github, isPrivate: true });

        const syncId = syncIdFor(OWNER, REPO, world, "world");
        const workspace = ciSyncWorkspace(join(workDir, "maps"), syncId);
        const state = newCiSyncState({
            syncId,
            owner: OWNER,
            repo: REPO,
            worldFolder: world,
            mapId: "world",
            mapName: "World",
            dimension: "minecraft:overworld",
            at: "2026-08-01T00:00:00Z",
        });
        await writeCiSyncState(workspace.stateFile, state);

        const answer = (await (ipcMain.handlers.get("cirender:scheduleWrite") as Handler)(noEvent, {
            syncId,
            enabled: true,
            cadence: "daily",
        })) as { ok: true; value: { ok: boolean; failure?: { code: string } } };

        expect(answer.ok).toBe(true);
        expect(answer.value.ok).toBe(false);
        expect(answer.value.failure?.code).toBe("not-uploaded-yet");
        expect(github.never("/actions/variables")).toBe(true);
    });
});
