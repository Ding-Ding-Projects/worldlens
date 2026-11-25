import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runGit, type GitRunner } from "../history/git.js";
import { gitAvailable, git, makeTemporaryFolder, realGit } from "./gitTestSupport.js";
import { EMPTY_POINTER, pointerFilePath, readPointer, readPointerSync, resolveProfileFolder, writePointer } from "./pointer.js";
import { DataFoldersService, type DataFoldersOptions, type HistoryEvent } from "./service.js";

let base = "";
let dispose: () => Promise<void> = async () => undefined;

beforeEach(async () => {
    const made = await makeTemporaryFolder("service");
    base = made.root;
    dispose = made.dispose;
});
afterEach(async () => {
    await dispose();
});

const exists = (path: string) => stat(path).then(() => true, () => false);

interface Fixture {
    readonly appData: string;
    readonly defaultProfile: string;
    readonly install: string;
    readonly system: string;
    readonly pointerFile: string;
    readonly events: HistoryEvent[];
    service(profile?: string, overrides?: Partial<DataFoldersOptions>): DataFoldersService;
    saveFolder: string;
}

async function fixture(run: GitRunner = realGit): Promise<Fixture> {
    const appData = join(base, "appdata");
    const defaultProfile = join(appData, "Worldlens");
    const install = join(base, "install");
    const system = join(base, "system");
    const saveFolder = join(base, "saves");
    await mkdir(defaultProfile, { recursive: true });
    await mkdir(install, { recursive: true });
    await mkdir(saveFolder, { recursive: true });
    await writeFile(join(defaultProfile, "settings.json"), '{"theme":"dark"}');
    await mkdir(join(defaultProfile, "Local Storage", "leveldb"), { recursive: true });
    await writeFile(join(defaultProfile, "Local Storage", "leveldb", "000005.ldb"), "prefs");
    await mkdir(join(defaultProfile, "Cache"), { recursive: true });
    await writeFile(join(defaultProfile, "Cache", "junk"), "volatile");
    await writeFile(join(defaultProfile, "github-credential.json"), "opaque");

    const pointerFile = pointerFilePath(appData, "Worldlens");
    const events: HistoryEvent[] = [];
    const cache = new Map<string, DataFoldersService>();
    return {
        appData,
        defaultProfile,
        install,
        system,
        pointerFile,
        events,
        saveFolder,
        service: (profile = defaultProfile, overrides = {}) => {
            const key = `${profile}|${Object.keys(overrides).join(",")}`;
            const cached = cache.get(key);
            if (cached !== undefined) return cached;
            const service = new DataFoldersService({
                pointerFile,
                profileFolder: profile,
                // The same synchronous read the real start-up makes before the app is ready.
                startup: resolveProfileFolder({
                    defaultFolder: defaultProfile,
                    readout: readPointerSync(pointerFile),
                    isDirectory: () => true,
                }),
                saveFolder: () => saveFolder,
                defaultSaveFolder: () => join(defaultProfile, "maps"),
                installFolders: [install],
                systemFolders: [system],
                run,
                pushRunner: async () => async (args, cwd) => await runGit(args, { cwd, env: { GIT_TERMINAL_PROMPT: "0" } }),
                commitDelayMs: 25,
                onHistoryEvent: (event) => events.push(event),
                ...overrides,
            });
            cache.set(key, service);
            return service;
        },
    };
}

const noGit: GitRunner = async () => ({ ok: false, code: null, stdout: "", stderr: "", spawnError: "ENOENT" });

describe.skipIf(!gitAvailable)("moving the profile folder", () => {
    it("copies it, verifies it, carries the history across intact, switches the pointer and keeps the old folder", async () => {
        const f = await fixture();
        const service = f.service();
        await service.startHistory();
        await service.commitNow();
        const target = join(base, "chosen", "profile");

        const result = await service.move({ kind: "profile", folder: target, mode: "move" });

        expect(result).toMatchObject({ ok: true, needsRestart: true, historyIntact: true, oldFolderRemovable: f.defaultProfile });
        expect(await readFile(join(target, "settings.json"), "utf8")).toBe('{"theme":"dark"}');
        expect(await exists(join(target, "Local Storage", "leveldb", "000005.ldb"))).toBe(true);
        expect(await exists(join(target, "Cache"))).toBe(false);
        // The Lo Mo directory moved with it, with the same latest version.
        const [a, b] = await Promise.all([git(f.defaultProfile, "rev-parse", "HEAD"), git(target, "rev-parse", "HEAD")]);
        expect(a.stdout.trim()).toBe(b.stdout.trim());
        // Nothing was lost from the old folder, and the pointer now names the new one.
        expect(await readFile(join(f.defaultProfile, "settings.json"), "utf8")).toBe('{"theme":"dark"}');
        const pointer = (await readPointer(f.pointerFile)).pointer;
        expect(pointer).toMatchObject({ profileFolder: target, previousProfileFolder: f.defaultProfile });
        // The running app is still on the old folder until it restarts.
        expect(service.profileFolder).toBe(f.defaultProfile);
        const status = await service.status();
        expect(status.profile).toMatchObject({ current: f.defaultProfile, pendingFolder: target });
    });

    it("finds the profile at the new location on the next start, then removes the old folder only after proving the copy", async () => {
        const f = await fixture();
        const first = f.service();
        await first.startHistory();
        const target = join(base, "chosen", "profile");
        await first.move({ kind: "profile", folder: target, mode: "move" });

        // The next launch reads the pointer and the profile is simply at the new folder.
        const next = f.service(target);
        await next.startHistory();
        const status = await next.status();
        expect(status.profile).toMatchObject({ current: target, removableOldFolder: f.defaultProfile });
        expect(status.history.last).not.toBeNull();

        expect((await next.removeOld("profile", false)).ok).toBe(false);
        expect(await exists(f.defaultProfile)).toBe(true);

        const removal = await next.removeOld("profile", true);
        expect(removal.ok).toBe(true);
        expect(await exists(f.defaultProfile)).toBe(false);
        expect(await exists(join(target, "settings.json"))).toBe(true);
        expect((await readPointer(f.pointerFile)).pointer.previousProfileFolder).toBeNull();
    });

    it("will not remove the old folder if the new one does not match it", async () => {
        const f = await fixture();
        const first = f.service();
        const target = join(base, "chosen", "profile");
        await first.move({ kind: "profile", folder: target, mode: "move" });
        const next = f.service(target);
        await writeFile(join(target, "settings.json"), '{"theme":"tampered"}');

        const removal = await next.removeOld("profile", true);

        expect(removal.ok).toBe(false);
        expect(removal.message).toContain("settings.json");
        expect(await readFile(join(f.defaultProfile, "settings.json"), "utf8")).toBe('{"theme":"dark"}');
    });

    it("will not remove an old profile folder while the save folder still lives inside it", async () => {
        const f = await fixture();
        const insideOld = join(f.defaultProfile, "maps");
        await mkdir(insideOld, { recursive: true });
        await writeFile(join(insideOld, "tile.png"), "tile");
        const target = join(base, "chosen", "profile");
        await f.service().move({ kind: "profile", folder: target, mode: "move" });
        const next = f.service(target, { saveFolder: () => insideOld });
        const removal = await next.removeOld("profile", true);
        expect(removal.ok).toBe(false);
        expect(removal.message).toContain("save folder");
        expect(await exists(join(insideOld, "tile.png"))).toBe(true);
    });

    it("never overwrites a folder that already has files, and changes nothing", async () => {
        const f = await fixture();
        const target = join(base, "occupied");
        await mkdir(target);
        await writeFile(join(target, "settings.json"), "PRECIOUS");

        const result = await f.service().move({ kind: "profile", folder: target, mode: "move" });

        expect(result).toMatchObject({ ok: false, code: "not-empty" });
        expect(await readFile(join(target, "settings.json"), "utf8")).toBe("PRECIOUS");
        expect(await exists(f.pointerFile)).toBe(false);
    });

    it.each([
        ["inside the install folder", (f: Fixture) => join(f.install, "data"), "inside-install-folder"],
        ["a system folder", (f: Fixture) => join(f.system, "data"), "system-folder"],
        ["the folder already in use", (f: Fixture) => f.defaultProfile, "same-as-current"],
        ["a relative path", () => "relative/profile", "not-absolute"],
    ])("refuses %s and changes nothing", async (_name, pick, code) => {
        const f = await fixture();
        const target = pick(f);
        const before = await readdir(base);
        const result = await f.service().move({ kind: "profile", folder: target, mode: "move" });
        expect(result).toMatchObject({ ok: false, code });
        expect(await exists(f.pointerFile)).toBe(false);
        expect(await readdir(base)).toEqual(before);
    });

    it("leaves everything as it was when cancelled part-way", async () => {
        const f = await fixture();
        const service = f.service();
        const target = join(base, "chosen", "profile");
        const result = await service.move({ kind: "profile", folder: target, mode: "move" }, (progress) => {
            if (progress.phase === "copying" && progress.filesDone >= 1) service.cancelMove();
        });
        expect(result).toMatchObject({ ok: false, cancelled: true });
        expect(await exists(join(base, "chosen"))).toBe(false);
        expect(await exists(f.pointerFile)).toBe(false);
        expect(await readFile(join(f.defaultProfile, "settings.json"), "utf8")).toBe('{"theme":"dark"}');
    });

    it("keeps the old folder live and cleans up when the copy fails part-way", async () => {
        const f = await fixture();
        const service = f.service();
        const target = join(base, "chosen", "profile");
        let sabotaged = false;
        const result = await service.move({ kind: "profile", folder: target, mode: "move" }, (progress) => {
            if (!sabotaged && progress.phase === "copying" && progress.current !== null) {
                sabotaged = true;
                writeFileSync(join(target, progress.current), "someone else's file");
            }
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe("copy-failed");
        expect(await exists(f.pointerFile)).toBe(false);
        expect(service.profileFolder).toBe(f.defaultProfile);
        expect(await readFile(join(f.defaultProfile, "settings.json"), "utf8")).toBe('{"theme":"dark"}');
    });

    it("returns to the default folder, clearing the pointer", async () => {
        const f = await fixture();
        const target = join(base, "chosen", "profile");
        await f.service().move({ kind: "profile", folder: target, mode: "move" });
        const atTarget = f.service(target);
        // The default location was removed after the first move; moving back needs it free.
        await atTarget.removeOld("profile", true);
        const back = await atTarget.move({ kind: "profile", folder: f.defaultProfile, mode: "move" });
        expect(back.ok).toBe(true);
        expect((await readPointer(f.pointerFile)).pointer.profileFolder).toBeNull();
    });

    it("can start fresh in a new folder without copying, and says nothing was copied", async () => {
        const f = await fixture();
        const target = join(base, "fresh");
        const result = await f.service().move({ kind: "profile", folder: target, mode: "fresh" });
        expect(result).toMatchObject({ ok: true, copiedFiles: 0, oldFolderRemovable: null });
        expect(await exists(join(target, "settings.json"))).toBe(false);
    });

    it("still works with no Git on the machine, and the status says why there is no history", async () => {
        const f = await fixture(noGit);
        const service = f.service();
        await service.startHistory();
        const target = join(base, "chosen", "profile");
        const result = await service.move({ kind: "profile", folder: target, mode: "copy" });
        expect(result).toMatchObject({ ok: true, historyIntact: null, oldFolderRemovable: null });
        const status = await service.status();
        expect(status.history.available).toBe(false);
        expect(status.history.unavailableReason).toMatch(/Git is not installed/);
    });

    it("refuses two moves at once", async () => {
        const f = await fixture();
        const service = f.service();
        const first = service.move({ kind: "profile", folder: join(base, "a", "p"), mode: "copy" });
        const second = await service.move({ kind: "profile", folder: join(base, "b", "p"), mode: "copy" });
        expect(second).toMatchObject({ ok: false, code: "busy" });
        await first;
    });
});

describe.skipIf(!gitAvailable)("moving the save folder", () => {
    it("moves it, keeps the old one, then removes the old one on request after proving the copy", async () => {
        const f = await fixture();
        await mkdir(join(f.saveFolder, "world"), { recursive: true });
        await writeFile(join(f.saveFolder, "world", "map.json"), "{}");
        let live = f.saveFolder;
        const service = f.service(f.defaultProfile, { saveFolder: () => live });
        const target = join(base, "new-saves");

        const moved = await service.move({ kind: "save", folder: target, mode: "move" });

        expect(moved).toMatchObject({ ok: true, needsRestart: false, copiedFiles: 1, oldFolderRemovable: f.saveFolder });
        expect(await readFile(join(target, "world", "map.json"), "utf8")).toBe("{}");
        expect(await exists(join(f.saveFolder, "world", "map.json"))).toBe(true);

        // The interface switches over once the move is done; only then can the old one go.
        live = target;
        expect((await service.status()).save.removableOldFolder).toBe(f.saveFolder);
        expect((await service.removeOld("save", false)).ok).toBe(false);
        await writeFile(join(target, "world", "map.json"), "changed");
        expect((await service.removeOld("save", true)).ok).toBe(false);
        expect(await exists(join(f.saveFolder, "world", "map.json"))).toBe(true);
        await writeFile(join(target, "world", "map.json"), "{}");
        expect((await service.removeOld("save", true)).ok).toBe(true);
        expect(await exists(f.saveFolder)).toBe(false);
        expect(await exists(join(target, "world", "map.json"))).toBe(true);
    });

    it("will not nest the save folder inside a profile folder that was chosen separately", async () => {
        const f = await fixture();
        const target = join(base, "chosen", "profile");
        await f.service().move({ kind: "profile", folder: target, mode: "move" });
        const atTarget = f.service(target);
        const result = await atTarget.move({ kind: "save", folder: join(target, "saves"), mode: "move" });
        expect(result).toMatchObject({ ok: false, code: "inside-other-folder" });
    });
});

describe.skipIf(!gitAvailable)("recording changes and sending them", () => {
    it("records a settled change after a quiet moment, and not again when nothing changed", async () => {
        const f = await fixture();
        const service = f.service();
        await service.startHistory();
        await service.commitNow();
        f.events.length = 0;

        await writeFile(join(f.defaultProfile, "settings.json"), '{"theme":"light"}');
        service.scheduleCommit();
        service.scheduleCommit();
        await new Promise((resolve) => setTimeout(resolve, 600));
        expect(f.events.filter((event) => event.kind === "committed")).toHaveLength(1);

        service.scheduleCommit();
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(f.events.filter((event) => event.kind === "committed")).toHaveLength(1);
    });

    it("tells the interface when a history write fails, without throwing", async () => {
        const breaking: GitRunner = async (args, options) =>
            args.includes("commit")
                ? { ok: false, code: 1, stdout: "", stderr: "fatal: disk full", spawnError: null }
                : await realGit(args, options);
        const f = await fixture(breaking);
        const service = f.service();
        await service.startHistory();
        const outcome = await service.commitNow();
        expect(outcome.failed).toBe(true);
        expect(f.events.some((event) => event.kind === "failed")).toBe(true);
        expect((await service.status()).history.lastFailure).not.toBeNull();
    });

    it("keeps sending off by default and refuses to push until it is turned on", async () => {
        const f = await fixture();
        const service = f.service();
        const status = await service.status();
        expect(status.remote).toMatchObject({ enabled: false, includeCredentials: false, url: null });
        expect(await service.pushNow()).toMatchObject({ status: "refused" });
    });

    it("recommends a local server by reporting credential files and what a push leaves out", async () => {
        const f = await fixture();
        const status = await f.service().status();
        expect(status.remote.credentialFilesPresent).toBe(true);
        expect(status.remote.excluded.join(" ")).toContain("github-credential.json");
    });

    it("sends the filtered history to a remote, records the verified result, and leaves credential files out", async () => {
        const f = await fixture();
        const service = f.service();
        await service.startHistory();
        const remote = join(base, "remote.git");
        await mkdir(remote);
        await git(remote, "init", "--bare", "--quiet");

        expect((await service.changeRemote({ url: remote, enabled: true })).ok).toBe(true);
        const outcome = await service.pushNow();

        expect(outcome).toMatchObject({ status: "pushed", verified: true });
        const files = (await git(remote, "ls-tree", "-r", "--name-only", "worldlens-profile")).stdout;
        expect(files).toContain("settings.json");
        expect(files).not.toContain("github-credential.json");
        const status = await service.status();
        expect(status.remote.lastPush).toMatchObject({ verified: true });
        expect(status.remote.lastError).toBeNull();
    });

    it("refuses to include credential files for a host that is not on the local network", async () => {
        const f = await fixture();
        const service = f.service();
        await service.changeRemote({ url: "https://github.com/a/b.git", enabled: true });
        const refused = await service.changeRemote({ includeCredentials: true });
        expect(refused.ok).toBe(false);
        expect((await service.status()).remote.includeCredentials).toBe(false);
    });

    it("reports a missing sign-in instead of pretending to push", async () => {
        const f = await fixture();
        const service = f.service(f.defaultProfile, { pushRunner: async () => null });
        await service.changeRemote({ url: "https://github.com/a/b.git", enabled: true });
        const outcome = await service.pushNow();
        expect(outcome).toMatchObject({ status: "refused", verified: false });
        expect((await service.status()).remote.lastError).toMatch(/Sign in/);
    });
});

describe("a chosen profile folder that cannot be reached", () => {
    it("is reported once, not as a pending change, and can be given up on request", async () => {
        const f = await fixture(noGit);
        const gone = join(base, "unplugged", "profile");
        await writePointer(f.pointerFile, { ...EMPTY_POINTER, profileFolder: gone });
        const service = f.service(f.defaultProfile, {
            startup: resolveProfileFolder({
                defaultFolder: f.defaultProfile,
                readout: readPointerSync(f.pointerFile),
                isDirectory: () => false,
            }),
        });

        const status = await service.status();
        expect(status.profile).toMatchObject({ current: f.defaultProfile, unreachable: gone, pendingFolder: null });

        const forgotten = await service.forgetUnreachable();
        expect(forgotten.ok).toBe(true);
        expect((await readPointer(f.pointerFile)).pointer.profileFolder).toBeNull();
        // Nothing on disk was touched by giving up on the choice.
        expect(await exists(join(f.defaultProfile, "settings.json"))).toBe(true);
    });

    it("refuses to forget a folder that is reachable", async () => {
        const f = await fixture(noGit);
        const result = await f.service().forgetUnreachable();
        expect(result.ok).toBe(false);
    });
});
