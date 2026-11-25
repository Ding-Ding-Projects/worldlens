import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitRunner } from "../history/git.js";
import { gitAvailable, git, makeTemporaryFolder, realGit, trackedFiles } from "./gitTestSupport.js";
import {
    GITIGNORE_BEGIN,
    GITIGNORE_END,
    isCredentialPath,
    isVolatilePath,
    mergeManagedIgnore,
} from "./profileEntries.js";
import {
    PROFILE_AUTHOR_EMAIL,
    PROFILE_AUTHOR_NAME,
    commitSettledChanges,
    describeStagedChanges,
    ensureProfileRepository,
    lastProfileVersion,
    profileHeadSha,
} from "./profileRepo.js";

let root = "";
let dispose: () => Promise<void> = async () => undefined;
beforeEach(async () => {
    const made = await makeTemporaryFolder("repo");
    root = made.root;
    dispose = made.dispose;
});
afterEach(async () => {
    await dispose();
});

describe("which profile paths are volatile or hold credentials", () => {
    it.each([
        ["Cache/data_0", true],
        ["Network/Cache/x", true],
        ["Code Cache/js/a", true],
        ["GPUCache/index", true],
        ["blob_storage/x", true],
        ["Session Storage/000003.log", true],
        ["Local Storage/leveldb/LOCK", true],
        ["Crashpad/reports/x.dmp", true],
        ["logs/cli.log", true],
        ["SingletonLock", true],
        ["notes.tmp", true],
        ["settings.json", false],
        ["Local Storage/leveldb/000005.ldb", false],
        ["consent.json", false],
    ])("treats %s as volatile: %s", (path, expected) => {
        expect(isVolatilePath(path)).toBe(expected);
    });

    it.each([
        ["github-credential.json", true],
        ["github-accounts/a.json", true],
        ["runtime-settings-credentials.json", true],
        ["runtime-settings-history-credential.json", true],
        ["world-downloader-credential.json", true],
        ["lock-secrets/abc.bin", true],
        ["rcon-secrets/s.bin", true],
        ["protected-bot-accounts/x.bin", true],
        ["toy-locks.v1.json", true],
        ["mcserver/webconsole/admin-password.json", true],
        ["keys/server.pem", true],
        ["deep/api-token.txt", true],
        ["settings.json", false],
        ["consent.json", false],
        ["extensions/readme.txt", false],
    ])("treats %s as credential material: %s", (path, expected) => {
        expect(isCredentialPath(path)).toBe(expected);
    });
});

describe("the managed ignore block", () => {
    it("rewrites only its own block and keeps every other line", () => {
        const first = mergeManagedIgnore("my-own-rule\n", []);
        expect(first.startsWith("my-own-rule\n")).toBe(true);
        expect(first).toContain(GITIGNORE_BEGIN);
        const second = mergeManagedIgnore(`before\n${first}after\n`, ["config-history"]);
        expect(second).toContain("before\n");
        expect(second).toContain("my-own-rule");
        expect(second).toContain("/config-history/");
        expect(second.split(GITIGNORE_BEGIN).length).toBe(2);
        expect(second.split(GITIGNORE_END).length).toBe(2);
        expect(second).toContain("after");
    });
});

describe("describing staged changes", () => {
    it("says what changed, with the first names and a count of the rest", () => {
        expect(describeStagedChanges("A\ta.json\nM\tb.json")).toBe("Update profile files: a.json, b.json");
        expect(describeStagedChanges("A\ta.json")).toBe("Add profile files: a.json");
        expect(describeStagedChanges("D\ta.json")).toBe("Remove profile files: a.json");
        expect(describeStagedChanges(["a", "b", "c", "d", "e", "f"].map((name) => `M\t${name}`).join("\n"))).toBe(
            "Update profile files: a, b, c, d and 2 more",
        );
    });
});

describe.skipIf(!gitAvailable)("the profile folder as a Git repository", () => {
    it("starts a repository, sets the per-repository identity, and writes the ignore rules", async () => {
        const result = await ensureProfileRepository(realGit, root);
        expect(result.ready).toBe(true);
        if (result.ready) expect(result.initialised).toBe(true);
        expect((await git(root, "config", "--local", "user.name")).stdout.trim()).toBe(PROFILE_AUTHOR_NAME);
        expect((await git(root, "config", "--local", "user.email")).stdout.trim()).toBe(PROFILE_AUTHOR_EMAIL);
        const ignore = await readFile(join(root, ".gitignore"), "utf8");
        for (const rule of ["Cache/", "Code Cache/", "GPUCache/", "blob_storage/", "Session Storage/", "Crashpad/", "logs/", "LOCK", "*.tmp", "/maps/"]) {
            expect(ignore).toContain(rule);
        }
    });

    it("records a settled change, says what changed, and records nothing when nothing changed", async () => {
        await writeFile(join(root, "settings.json"), '{"theme":"dark"}');
        const first = await commitSettledChanges(realGit, root);
        expect(first.committed).toBe(true);
        expect(first.subject).toContain("settings.json");
        const again = await commitSettledChanges(realGit, root);
        expect(again).toMatchObject({ committed: false, failed: false });
        const head = await profileHeadSha(realGit, root);

        await writeFile(join(root, "settings.json"), '{"theme":"light"}');
        const second = await commitSettledChanges(realGit, root);
        expect(second.committed).toBe(true);
        expect(await profileHeadSha(realGit, root)).not.toBe(head);
        const last = await lastProfileVersion(realGit, root);
        expect(last?.subject).toBe(second.subject);
        const author = await git(root, "log", "-1", "--format=%an <%ae>");
        expect(author.stdout.trim()).toBe(`${PROFILE_AUTHOR_NAME} <${PROFILE_AUTHOR_EMAIL}>`);
    });

    it("keeps caches, locks, logs, temporary files and rebuildable data out of history", async () => {
        const files: Record<string, string> = {
            "settings.json": "{}",
            "Cache/data_0": "x",
            "GPUCache/index": "x",
            "Code Cache/js/a": "x",
            "blob_storage/b": "x",
            "Session Storage/000003.log": "x",
            "Local Storage/leveldb/LOCK": "x",
            "Local Storage/leveldb/000005.ldb": "x",
            "Crashpad/reports/r.dmp": "x",
            "logs/cli.log": "x",
            "scratch.tmp": "x",
            "maps/tiles/0.png": "x",
            "java/bin/java.exe": "x",
        };
        for (const [path, content] of Object.entries(files)) {
            await mkdir(join(root, path, ".."), { recursive: true });
            await writeFile(join(root, path), content);
        }
        await commitSettledChanges(realGit, root);
        expect(await trackedFiles(root)).toEqual([".gitignore", "Local Storage/leveldb/000005.ldb", "settings.json"]);
    });

    it("records credential files exactly as they sit on disk", async () => {
        const bytes = Buffer.from([0, 1, 2, 250, 251]);
        await writeFile(join(root, "github-credential.json"), bytes);
        await mkdir(join(root, "lock-secrets"));
        await writeFile(join(root, "lock-secrets", "a.bin"), bytes);
        await commitSettledChanges(realGit, root);
        expect(await trackedFiles(root)).toEqual(
            expect.arrayContaining(["github-credential.json", "lock-secrets/a.bin"]),
        );
        const stored = await git(root, "show", "HEAD:github-credential.json");
        expect(Buffer.from(stored.stdout, "binary").length).toBeGreaterThan(0);
    });

    it("leaves a folder that is a repository of its own to keep its own history", async () => {
        await mkdir(join(root, "config-history", "p1"), { recursive: true });
        await git(join(root, "config-history", "p1"), "init", "--quiet");
        await writeFile(join(root, "config-history", "p1", "a.json"), "{}");
        await writeFile(join(root, "settings.json"), "{}");
        await commitSettledChanges(realGit, root);
        expect(await readFile(join(root, ".gitignore"), "utf8")).toContain("/config-history/p1/");
        const tracked = await trackedFiles(root);
        expect(tracked.some((path) => path.startsWith("config-history"))).toBe(false);
    });

    it("keeps files over the size limit out of history", async () => {
        await writeFile(join(root, "settings.json"), "{}");
        await writeFile(join(root, "big.dat"), Buffer.alloc(26 * 1024 * 1024));
        await commitSettledChanges(realGit, root);
        expect(await trackedFiles(root)).not.toContain("big.dat");
    });

    it("reuses a repository that is already there without touching its history", async () => {
        await git(root, "init", "--quiet");
        await writeFile(join(root, "old.txt"), "old");
        await git(root, "add", "-A");
        await git(root, "-c", "user.name=Someone", "-c", "user.email=s@example.invalid", "commit", "-q", "-m", "earlier work");
        const before = await profileHeadSha(realGit, root);
        const result = await ensureProfileRepository(realGit, root);
        expect(result.ready && !result.initialised).toBe(true);
        expect(await profileHeadSha(realGit, root)).toBe(before);
        expect((await git(root, "log", "--format=%an")).stdout.trim()).toBe("Someone");
    });

    it("keeps the lines already in a .gitignore", async () => {
        await writeFile(join(root, ".gitignore"), "my-private-rule\n");
        await ensureProfileRepository(realGit, root);
        const text = await readFile(join(root, ".gitignore"), "utf8");
        expect(text).toContain("my-private-rule");
        expect(text).toContain(GITIGNORE_BEGIN);
    });

    it("reports a failed history write as a value and never throws, so the user's write stands", async () => {
        await writeFile(join(root, "settings.json"), "{}");
        const failingCommit: GitRunner = async (args, options) => {
            if (args.includes("commit")) {
                return { ok: false, code: 1, stdout: "", stderr: "fatal: could not write the commit", spawnError: null };
            }
            return await realGit(args, options);
        };
        const outcome = await commitSettledChanges(failingCommit, root);
        expect(outcome).toMatchObject({ committed: false, failed: true });
        expect(outcome.reason).toContain("did not save");
        expect(await readFile(join(root, "settings.json"), "utf8")).toBe("{}");
    });
});

describe("a machine with no Git", () => {
    const noGit: GitRunner = async () => ({ ok: false, code: null, stdout: "", stderr: "", spawnError: "ENOENT" });

    it("says so plainly and does not throw or create anything", async () => {
        const ensured = await ensureProfileRepository(noGit, root);
        expect(ensured.ready).toBe(false);
        if (!ensured.ready) expect(ensured.reason).toMatch(/Git is not installed/);
        const outcome = await commitSettledChanges(noGit, root);
        expect(outcome).toMatchObject({ committed: false, failed: true });
        const { readdir } = await import("node:fs/promises");
        expect(await readdir(root)).toEqual([]);
    });
});
