import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { ProcessRunner } from "../cirender/gh.js";
import type { GhCredentialBroker } from "./credentialBroker.js";
import { GH_CLI_CHANNELS, registerGhCliHandlers } from "./ipc.js";
import type { GhCliLoginOptions } from "./login.js";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function harness() {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
        removeHandler: (channel: string) => handlers.delete(channel),
    } as unknown as IpcMain;
    const sender = {
        id: 7,
        once: vi.fn(),
        removeListener: vi.fn(),
        isDestroyed: () => false,
        send: vi.fn(),
    };
    const event = { sender } as unknown as IpcMainInvokeEvent;
    return { ipcMain, handlers, event, sender };
}

const status = {
    availability: "ready" as const,
    version: "gh version 2.97.0",
    accounts: [],
    source: "json" as const,
    capabilities: { structuredStatus: true },
    message: "ready",
};

function broker(): GhCredentialBroker {
    return {
        listAccounts: () => Promise.resolve(status),
        switchAccount: () => Promise.resolve({ ok: false, account: null, message: "not switched" }),
        logoutAccount: () => Promise.resolve({ ok: true, message: "signed out" }),
        withCredentialStoreMutation: <T>(work: () => Promise<T>) => work(),
        executable: () => Promise.resolve("C:\\Program Files\\GitHub CLI\\gh.exe"),
    } as unknown as GhCredentialBroker;
}

const runner: ProcessRunner = {
    run: () => Promise.resolve({ started: true, code: 0, stdout: "", stderr: "" }),
    runToFile: () => Promise.resolve({ started: true, code: 0, bytes: 0, stderr: "" }),
};

describe("gh CLI IPC boundary", () => {
    it("registers only secret-free gh and legacy-cleanup channels, then disposes all of them", async () => {
        const root = await mkdtemp(join(tmpdir(), "worldlens-gh-ipc-"));
        roots.push(root);
        const h = harness();
        const installed = registerGhCliHandlers(h.ipcMain, {
            broker: broker(),
            runner,
            userDataDirectory: root,
        });
        expect([...h.handlers.keys()].sort()).toEqual([...GH_CLI_CHANNELS].sort());
        expect(await h.handlers.get("ghCli:listAccounts")!(h.event)).toEqual(status);
        installed.dispose();
        expect(h.handlers.size).toBe(0);
    });

    it("never reads a retired credential and removes it only through the dedicated call", async () => {
        const root = await mkdtemp(join(tmpdir(), "worldlens-gh-ipc-"));
        roots.push(root);
        await writeFile(join(root, "github-credential.json"), "opaque legacy bytes", "utf8");
        const h = harness();
        registerGhCliHandlers(h.ipcMain, {
            broker: broker(),
            runner,
            userDataDirectory: root,
        });
        const before = await h.handlers.get("ghCli:legacyCredentialStatus")!(h.event);
        expect(before).toMatchObject({ present: true, locations: 1 });
        expect(JSON.stringify(before)).not.toContain("opaque legacy bytes");
        const removed = await h.handlers.get("ghCli:removeLegacyCredentials")!(h.event);
        expect(removed).toMatchObject({ removed: true, locations: 1 });
        expect(JSON.stringify(removed)).not.toContain("opaque legacy bytes");
    });

    it("cancels a sender-owned login and exposes only secret-free progress", async () => {
        const root = await mkdtemp(join(tmpdir(), "worldlens-gh-ipc-"));
        roots.push(root);
        const h = harness();
        let finish: ((value: ReturnType<typeof failedLogin>) => void) | null = null;
        const login = vi.fn(
            (options: GhCliLoginOptions) =>
                new Promise<ReturnType<typeof failedLogin>>((resolve) => {
                    finish = resolve;
                    options.onState?.(failedLogin().state);
                }),
        );
        registerGhCliHandlers(h.ipcMain, {
            broker: broker(),
            runner,
            userDataDirectory: root,
            login,
        });
        const pending = h.handlers.get("ghCli:startLogin")!(h.event, {});
        await Promise.resolve();
        expect(h.sender.send).toHaveBeenCalledWith("ghCli:loginState", failedLogin().state);
        expect(await h.handlers.get("ghCli:cancelLogin")!(h.event)).toMatchObject({ cancelled: true });
        const complete = finish as ((value: ReturnType<typeof failedLogin>) => void) | null;
        if (complete !== null) complete(failedLogin());
        expect(await pending).toEqual(failedLogin());
        expect(JSON.stringify(h.sender.send.mock.calls)).not.toMatch(/gh[pousr]_|github_pat_/);
    });

    it("hands login's post-approval store phase to the broker serialization lane", async () => {
        const root = await mkdtemp(join(tmpdir(), "worldlens-gh-ipc-"));
        roots.push(root);
        const h = harness();
        const selectedBroker = broker();
        const lock = vi.spyOn(selectedBroker, "withCredentialStoreMutation");
        const login = vi.fn(async (options: GhCliLoginOptions) => {
            expect(options.withCredentialStoreLock).toBeTypeOf("function");
            await options.withCredentialStoreLock!(async () => Promise.resolve());
            return failedLogin();
        });
        registerGhCliHandlers(h.ipcMain, {
            broker: selectedBroker,
            runner,
            userDataDirectory: root,
            login,
        });

        await expect(h.handlers.get("ghCli:startLogin")!(h.event, {})).resolves.toEqual(failedLogin());
        expect(lock).toHaveBeenCalledTimes(1);
    });
});

function failedLogin() {
    return {
        ok: false as const,
        state: {
            stage: "cancelled" as const,
            host: "github.com" as const,
            expectedLogin: null,
            userCode: null,
            verificationUri: null,
            verificationUriComplete: null,
            expiresAt: null,
            secondsRemaining: null,
            attempt: 0,
            account: null,
            failureCode: "cancelled",
            requestedScopes: [],
            message: "Sign-in was cancelled.",
        },
    };
}
