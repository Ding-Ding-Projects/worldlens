import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitRunner } from "../history/git.js";
import { makeTemporaryFolder } from "./gitTestSupport.js";
import { DATA_FOLDERS_CHANNELS, registerDataFoldersHandlers } from "./ipc.js";
import { isHistoryRelevantPath } from "./profileEntries.js";
import { EMPTY_POINTER, pointerFilePath, resolveProfileFolder } from "./pointer.js";
import { DataFoldersService } from "./service.js";

type Handler = (event: IpcMainInvokeEvent, request?: unknown) => Promise<unknown> | unknown;

let base = "";
let dispose: () => Promise<void> = async () => undefined;
beforeEach(async () => {
    const made = await makeTemporaryFolder("ipc");
    base = made.root;
    dispose = made.dispose;
});
afterEach(async () => {
    await dispose();
});

const noGit: GitRunner = async () => ({ ok: false, code: null, stdout: "", stderr: "", spawnError: "ENOENT" });

async function harness(allowed: boolean) {
    const profile = join(base, "profile");
    await mkdir(profile, { recursive: true });
    await writeFile(join(profile, "settings.json"), "{}");
    const handlers = new Map<string, Handler>();
    const removed: string[] = [];
    let restarted = 0;
    const progress: unknown[] = [];
    const service = new DataFoldersService({
        pointerFile: pointerFilePath(base, "Worldlens"),
        profileFolder: profile,
        startup: resolveProfileFolder({
            defaultFolder: profile,
            readout: { pointer: EMPTY_POINTER, invalid: false, problem: null },
            isDirectory: () => true,
        }),
        saveFolder: () => join(base, "saves"),
        defaultSaveFolder: () => join(base, "saves"),
        installFolders: [join(base, "install")],
        systemFolders: [],
        run: noGit,
        pushRunner: async () => null,
    });
    const ipc = registerDataFoldersHandlers({
        ipcMain: {
            handle: (channel: string, handler: Handler) => void handlers.set(channel, handler),
            removeHandler: (channel: string) => void removed.push(channel),
        },
        service,
        authorizeSender: () => allowed,
        sendProgress: (_event, value) => void progress.push(value),
        restart: async () => void (restarted += 1),
    });
    const call = (channel: (typeof DATA_FOLDERS_CHANNELS)[number], request?: unknown) =>
        Promise.resolve(handlers.get(channel)?.({} as IpcMainInvokeEvent, request));
    return { call, handlers, removed, ipc, progress, restarted: () => restarted, profile };
}

describe("the data folder channels", () => {
    it("registers every channel it names", async () => {
        const h = await harness(true);
        expect([...h.handlers.keys()].sort()).toEqual([...DATA_FOLDERS_CHANNELS].sort());
    });

    it("refuses every channel for a sender that is not the application's own window", async () => {
        const h = await harness(false);
        for (const channel of DATA_FOLDERS_CHANNELS) {
            expect(await h.call(channel, { kind: "profile", folder: join(base, "x"), mode: "move", confirm: true })).toMatchObject({
                ok: false,
                code: "not-allowed",
            });
        }
        expect(h.restarted()).toBe(0);
    });

    it("answers a malformed request with a message, never a throw", async () => {
        const h = await harness(true);
        expect(await h.call("dataFolders:move", { kind: "nonsense", folder: 5, mode: "move" })).toMatchObject({ ok: false, code: "bad-request" });
        expect(await h.call("dataFolders:validate", null)).toMatchObject({ ok: false, code: "bad-request" });
        expect(await h.call("dataFolders:removeOld", { kind: "profile" })).toMatchObject({ ok: false });
        // Fields of the wrong type are ignored rather than trusted, so nothing gets switched on.
        expect(await h.call("dataFolders:changeRemote", { enabled: "yes", url: 42 })).toMatchObject({
            ok: true,
            settings: { enabled: false, url: null },
        });
    });

    it("reports status, a refusal for an invalid folder, and cancel with nothing running", async () => {
        const h = await harness(true);
        const status = (await h.call("dataFolders:status")) as { profile: { current: string } };
        expect(status.profile.current).toBe(h.profile);
        expect(await h.call("dataFolders:validate", { kind: "profile", folder: "relative", mode: "move" })).toMatchObject({
            ok: false,
            code: "not-absolute",
        });
        expect(await h.call("dataFolders:cancel")).toEqual({ cancelled: false });
    });

    it("restarts only when asked, and removes its handlers when disposed", async () => {
        const h = await harness(true);
        await h.call("dataFolders:restart");
        expect(h.restarted()).toBe(1);
        h.ipc.dispose();
        expect(h.removed.sort()).toEqual([...DATA_FOLDERS_CHANNELS].sort());
    });
});

describe("which profile changes are worth recording", () => {
    it.each([
        ["settings.json", true],
        ["Local Storage/leveldb/000005.ldb", true],
        [".git/index", false],
        ["Cache/data_0", false],
        ["logs/cli.log", false],
        ["maps/tiles/0.png", false],
        ["java/bin/java.exe", false],
        ["Local Storage/leveldb/LOCK", false],
    ])("%s: %s", (path, expected) => {
        expect(isHistoryRelevantPath(path)).toBe(expected);
    });
});
