import { describe, expect, it, vi } from "vitest";
import { cloneUrlFor, type DataFoldersBridge, type DataFoldersStatusReadout } from "./dataFoldersBridge.js";
import { createDataFoldersStore } from "./dataFoldersStore.js";

function status(overrides: Partial<DataFoldersStatusReadout> = {}): DataFoldersStatusReadout {
    return {
        profile: {
            current: "C:\\Users\\me\\AppData\\Roaming\\Worldlens",
            default: "C:\\Users\\me\\AppData\\Roaming\\Worldlens",
            pendingFolder: null,
            unreachable: null,
            removableOldFolder: null,
        },
        save: {
            current: "C:\\Users\\me\\AppData\\Roaming\\Worldlens\\maps",
            default: "C:\\Users\\me\\AppData\\Roaming\\Worldlens\\maps",
            pendingFolder: null,
            unreachable: null,
            removableOldFolder: null,
        },
        pointerProblem: null,
        history: { available: true, gitVersion: "2.45", unavailableReason: null, initialised: true, last: null, lastFailure: null },
        remote: {
            enabled: false,
            url: null,
            includeCredentials: false,
            accountId: null,
            lastPush: null,
            lastError: null,
            isLocalNetwork: false,
            credentialFilesPresent: false,
            excluded: [],
        },
        ...overrides,
    };
}

/** A bridge whose calls are recorded, so a test can see exactly what the interface asked for. */
function fakeBridge(overrides: Partial<DataFoldersBridge> = {}) {
    const calls: { name: string; request?: unknown }[] = [];
    const record = <T>(name: string, answer: T) =>
        vi.fn(async (request?: unknown) => {
            calls.push({ name, request });
            return answer;
        });
    const bridge: DataFoldersBridge = {
        dataFoldersStatus: record("status", status()) as NonNullable<DataFoldersBridge["dataFoldersStatus"]>,
        dataFoldersValidate: vi.fn(async (request) => {
            calls.push({ name: "validate", request });
            return { ok: true as const, folder: request.folder, exists: false, freeBytes: 5_000_000_000 };
        }),
        dataFoldersMove: vi.fn(async (request) => {
            calls.push({ name: "move", request });
            return {
                ok: true as const,
                kind: request.kind,
                mode: request.mode,
                folder: request.folder,
                needsRestart: request.kind === "profile",
                copiedFiles: 3,
                copiedBytes: 300,
                skipped: [],
                historyIntact: true,
                oldFolderRemovable: null,
                message: "Done.",
            };
        }),
        dataFoldersCancel: record("cancel", { cancelled: true }) as NonNullable<DataFoldersBridge["dataFoldersCancel"]>,
    };
    return { bridge: Object.assign(bridge, overrides), calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the data folders store", () => {
    it("reports that there is no bridge, and refuses to apply, in a browser", async () => {
        const store = createDataFoldersStore({ bridge: null });
        expect(store.available).toBe(false);
        store.setFolder("profile", "D:\\x");
        expect(store.applyBlockedReason("profile").value?.code).toBe("no-bridge");
        await store.apply("profile");
        expect(store.drafts.profile.result.value).toBeNull();
    });

    it("fills the drafts from the status, and validates a changed folder before Apply is allowed", async () => {
        const { bridge, calls } = fakeBridge();
        const store = createDataFoldersStore({ bridge });
        await store.start();
        expect(store.drafts.profile.folder.value).toBe(status().profile.current);
        expect(store.applyBlockedReason("profile").value?.code).toBe("same-as-current");

        store.setFolder("profile", "D:\\Data\\Worldlens");
        expect(store.applyBlockedReason("profile").value?.code).toBe("checking");
        await flush();
        expect(store.applyBlockedReason("profile").value).toBeNull();
        expect(calls.find((call) => call.name === "validate")?.request).toEqual({
            kind: "profile",
            folder: "D:\\Data\\Worldlens",
            mode: "move",
        });
    });

    it("keeps a refusal's code and reason, and does not move when asked to apply anyway", async () => {
        const { bridge, calls } = fakeBridge({
            dataFoldersValidate: vi.fn(async () => ({
                ok: false as const,
                code: "inside-install-folder",
                message: "That folder is inside the install folder.",
            })),
        });
        const store = createDataFoldersStore({ bridge });
        await store.start();
        store.setFolder("profile", "C:\\Program Files\\Worldlens\\data");
        await flush();
        expect(store.applyBlockedReason("profile").value).toEqual({
            code: "inside-install-folder",
            message: "That folder is inside the install folder.",
        });
        // A keyboard submit walks past a disabled button, so the action refuses by itself.
        await store.apply("profile");
        expect(calls.some((call) => call.name === "move")).toBe(false);
    });

    it("revalidates when the way of treating the data changes", async () => {
        const { bridge, calls } = fakeBridge();
        const store = createDataFoldersStore({ bridge });
        await store.start();
        store.setFolder("save", "E:\\maps");
        await flush();
        store.setMode("save", "fresh");
        await flush();
        const validations = calls.filter((call) => call.name === "validate");
        expect(validations.at(-1)?.request).toEqual({ kind: "save", folder: "E:\\maps", mode: "fresh" });
    });

    it("applies a profile change, shows the result, and goes back to showing the folder in use", async () => {
        const { bridge, calls } = fakeBridge();
        const store = createDataFoldersStore({ bridge });
        await store.start();
        store.setFolder("profile", "D:\\Data\\Worldlens");
        await flush();
        store.setMode("profile", "copy");
        await flush();
        await store.apply("profile");

        expect(calls.find((call) => call.name === "move")?.request).toEqual({
            kind: "profile",
            folder: "D:\\Data\\Worldlens",
            mode: "copy",
        });
        expect(store.drafts.profile.result.value).toMatchObject({ ok: true, needsRestart: true });
        expect(store.drafts.profile.folder.value).toBe(status().profile.current);
        expect(store.busyKind.value).toBeNull();
    });

    it("points the running app at a moved save folder, and says so plainly if that fails", async () => {
        const { bridge } = fakeBridge();
        const applied: string[] = [];
        const store = createDataFoldersStore({
            bridge,
            applySaveFolder: async (folder) => {
                applied.push(folder);
                return { ok: true, message: "" };
            },
        });
        await store.start();
        store.setFolder("save", "E:\\maps");
        await flush();
        await store.apply("save");
        expect(applied).toEqual(["E:\\maps"]);
        expect(store.drafts.save.result.value).toMatchObject({ ok: true });

        const failing = createDataFoldersStore({
            bridge,
            applySaveFolder: async () => ({ ok: false, message: "The app could not switch." }),
        });
        await failing.start();
        failing.setFolder("save", "F:\\maps");
        await flush();
        await failing.apply("save");
        const result = failing.drafts.save.result.value;
        expect(result).toMatchObject({ ok: false, code: "switch-failed" });
        expect(result?.message).toContain("old folder is still in use");
    });

    it("shows a failed move without throwing, and is not left busy", async () => {
        const { bridge } = fakeBridge({
            dataFoldersMove: vi.fn(async () => {
                throw new Error("disk exploded");
            }),
        });
        const store = createDataFoldersStore({ bridge });
        await store.start();
        store.setFolder("profile", "D:\\x");
        await flush();
        await store.apply("profile");
        expect(store.drafts.profile.result.value).toMatchObject({ ok: false, message: "disk exploded" });
        expect(store.busyKind.value).toBeNull();
    });

    it("uses the default folder as the next draft when asked to reset", async () => {
        const moved = status({
            profile: { ...status().profile, current: "D:\\Data\\Worldlens" },
        });
        const { bridge } = fakeBridge({ dataFoldersStatus: async () => moved });
        const store = createDataFoldersStore({ bridge });
        await store.start();
        store.useDefault("profile");
        expect(store.drafts.profile.folder.value).toBe(moved.profile.default);
    });

    it("tells the person about a failed history write, and refreshes", async () => {
        const holder: {
            listener: ((event: { kind: "committed" | "failed"; message: string; sha: string | null }) => void) | null;
        } = { listener: null };
        const { bridge } = fakeBridge({
            onDataFoldersHistory: (next) => {
                holder.listener = next;
                return () => undefined;
            },
        });
        const failures: string[] = [];
        const store = createDataFoldersStore({ bridge, onHistoryFailure: (message) => failures.push(message) });
        await store.start();
        holder.listener?.({ kind: "committed", message: "ok", sha: "abc" });
        holder.listener?.({ kind: "failed", message: "disk full", sha: null });
        expect(failures).toEqual(["disk full"]);
        store.stop();
    });

    it("follows progress events", async () => {
        let listener: ((progress: never) => void) | null = null;
        const { bridge } = fakeBridge({
            onDataFoldersProgress: (next) => {
                listener = next as never;
                return () => undefined;
            },
        });
        const store = createDataFoldersStore({ bridge });
        await store.start();
        (listener as unknown as (progress: unknown) => void)({
            kind: "profile",
            phase: "copying",
            filesDone: 2,
            filesTotal: 4,
            bytesDone: 1,
            bytesTotal: 2,
            current: "a",
        });
        expect(store.progress.value).toMatchObject({ filesDone: 2, filesTotal: 4 });
    });

    it("removes an old folder only when asked, and shows the answer", async () => {
        const remove = vi.fn(async () => ({ ok: true, message: "The old folder was removed." }));
        const { bridge } = fakeBridge({ dataFoldersRemoveOld: remove });
        const store = createDataFoldersStore({ bridge });
        await store.start();
        await store.removeOld("profile");
        expect(remove).toHaveBeenCalledWith({ kind: "profile", confirm: true });
        expect(store.drafts.profile.removalMessage.value).toBe("The old folder was removed.");
    });

    it("surfaces a refused remote change instead of pretending it saved", async () => {
        const { bridge } = fakeBridge({
            dataFoldersChangeRemote: vi.fn(async () => ({ ok: false, message: "Credential files can only go to your own network." })),
        });
        const store = createDataFoldersStore({ bridge });
        await store.start();
        expect(await store.changeRemote({ includeCredentials: true })).toBe(false);
        expect(store.remoteMessage.value).toContain("own network");
    });

    it("creates only a private repository, then saves its address as the remote", async () => {
        const create = vi.fn(async () => ({
            ok: true as const,
            value: { fullName: "me/worldlens-profile", htmlUrl: "https://github.com/me/worldlens-profile", private: true },
        }));
        const change = vi.fn(async () => ({ ok: true, message: "Saved." }));
        const { bridge } = fakeBridge({ createBackupRepository: create, dataFoldersChangeRemote: change });
        const store = createDataFoldersStore({ bridge });
        await store.start();
        const ok = await store.createPrivateRepository({
            accountId: "acct-1",
            owner: { login: "me", kind: "user" },
            name: " worldlens-profile ",
        });
        expect(ok).toBe(true);
        expect(create).toHaveBeenCalledWith({
            accountId: "acct-1",
            ownerLogin: "me",
            ownerKind: "user",
            name: "worldlens-profile",
            private: true,
        });
        expect(change).toHaveBeenCalledWith({ url: "https://github.com/me/worldlens-profile.git", accountId: "acct-1" });
    });

    it("shows a failed repository creation and saves nothing", async () => {
        const change = vi.fn(async () => ({ ok: true, message: "Saved." }));
        const { bridge } = fakeBridge({
            createBackupRepository: vi.fn(async () => ({ ok: false as const, message: "A repository named me/x already exists." })),
            dataFoldersChangeRemote: change,
        });
        const store = createDataFoldersStore({ bridge });
        await store.start();
        expect(
            await store.createPrivateRepository({ accountId: null, owner: { login: "me", kind: "user" }, name: "x" }),
        ).toBe(false);
        expect(store.remoteMessage.value).toContain("already exists");
        expect(change).not.toHaveBeenCalled();
    });

    it("keeps the push result and clears the busy flag", async () => {
        const { bridge } = fakeBridge({
            dataFoldersPushNow: vi.fn(async () => ({ status: "rejected" as const, message: "The remote has changes.", sha: null, verified: false, excluded: [] })),
        });
        const store = createDataFoldersStore({ bridge });
        await store.start();
        await store.pushNow();
        expect(store.pushResult.value).toMatchObject({ status: "rejected" });
        expect(store.pushing.value).toBe(false);
    });

    it("lists only github.com accounts for the remote", async () => {
        const { bridge } = fakeBridge({
            ghCliListAccounts: async () => ({
                accounts: [
                    { id: "a", login: "me", host: "github.com" },
                    { id: "b", login: "corp", host: "ghe.example.com" },
                ],
            }),
        });
        const store = createDataFoldersStore({ bridge });
        await store.start();
        expect(store.accounts.value.map((account) => account.login)).toEqual(["me"]);
    });
});

describe("repository addresses", () => {
    it("builds a clone address from what GitHub reports", () => {
        expect(cloneUrlFor("https://github.com/me/x", "me/x")).toBe("https://github.com/me/x.git");
        expect(cloneUrlFor("https://github.com/me/x.git", "me/x")).toBe("https://github.com/me/x.git");
        expect(cloneUrlFor("", "me/x")).toBe("https://github.com/me/x.git");
    });
});
