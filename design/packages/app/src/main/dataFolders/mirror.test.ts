import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runGit } from "../history/git.js";
import { gitAvailable, git, makeTemporaryFolder, realGit, trackedFiles } from "./gitTestSupport.js";
import {
    MIRROR_BRANCH,
    REMOTE_BRANCH,
    assertNoForce,
    isLanRemote,
    pushProfile,
    remoteHost,
    remoteUrlProblem,
    updateMirrorBranch,
    type PushRunner,
} from "./mirror.js";
import { commitSettledChanges } from "./profileRepo.js";
import {
    DEFAULT_REMOTE_SETTINGS,
    applyRemoteChange,
    readRemoteSettings,
    writeRemoteSettings,
} from "./remoteSettings.js";

let root = "";
let remote = "";
let dispose: () => Promise<void> = async () => undefined;

beforeEach(async () => {
    const made = await makeTemporaryFolder("mirror");
    dispose = made.dispose;
    root = join(made.root, "profile");
    remote = join(made.root, "remote.git");
    await mkdir(root);
});
afterEach(async () => {
    await dispose();
});

const CREDENTIAL_FILES = ["github-credential.json", "github-accounts/a.json", "lock-secrets/x.bin", "deep/api-token.txt"];

async function seedProfile(): Promise<void> {
    await writeFile(join(root, "settings.json"), '{"a":1}');
    for (const path of CREDENTIAL_FILES) {
        await mkdir(join(root, path, ".."), { recursive: true });
        await writeFile(join(root, path), "secret-bytes");
    }
    await commitSettledChanges(realGit, root);
}

/** Records every push-runner call, so a test can see exactly what Git was asked to do. */
function recordingPush(calls: string[][]): PushRunner {
    return async (args, cwd) => {
        calls.push([...args]);
        return await runGit(args, { cwd, env: { GIT_TERMINAL_PROMPT: "0" } });
    };
}

describe("remote addresses", () => {
    it.each([
        ["https://github.com/a/b.git", "github.com", false],
        ["git@github.com:a/b.git", "github.com", false],
        ["ssh://git@192.168.1.20/a/b.git", "192.168.1.20", true],
        ["https://gitlab.lan/a/b.git", "gitlab.lan", true],
        ["https://nas.local/a/b.git", "nas.local", true],
        ["http://10.0.0.5:8080/a.git", "10.0.0.5", true],
        ["https://172.20.1.1/a.git", "172.20.1.1", true],
        ["https://172.32.1.1/a.git", "172.32.1.1", false],
        ["https://8.8.8.8/a.git", "8.8.8.8", false],
        ["file:///srv/repo.git", null, true],
        ["/srv/repo.git", null, true],
        ["C:\\repos\\p.git", null, true],
    ])("reads %s as host %s (local network: %s)", (url, host, lan) => {
        expect(remoteHost(url)).toBe(host);
        expect(isLanRemote(url)).toBe(lan);
    });

    it("never treats an address it cannot read as a local one", () => {
        expect(isLanRemote("https://[bad")).toBe(false);
    });

    it.each([
        ["", "empty"],
        ["https://user:pw@example.com/a.git", "embedded-credentials"],
        ["ftp://example.com/a.git", "unsupported-scheme"],
        ["http://example.com/a.git", "http-needs-local-network"],
    ])("refuses %j as %s", (url, problem) => {
        expect(remoteUrlProblem(url)).toBe(problem);
    });

    it("accepts https, ssh, scp-like, local-network http, and local paths", () => {
        for (const url of ["https://github.com/a/b.git", "ssh://h/a.git", "git@h:a/b.git", "http://192.168.1.2/a.git", "/srv/a.git"]) {
            expect(remoteUrlProblem(url)).toBeNull();
        }
    });
});

describe("the no-force guard", () => {
    it.each([["--force"], ["-f"], ["--force-with-lease=x:y"], ["+refs/heads/a:refs/heads/b"], ["refs/heads/a:+refs/heads/b"]])(
        "throws for %s",
        (argument) => {
            expect(() => assertNoForce(["push", argument])).toThrow(/forced push/);
        },
    );

    it("allows an ordinary push", () => {
        expect(() => assertNoForce(["push", "--porcelain", "url", "refs/heads/a:refs/heads/b"])).not.toThrow();
    });
});

describe("remote settings", () => {
    it("starts off, with nothing included, and survives a damaged file as those safe defaults", async () => {
        expect(await readRemoteSettings(root)).toEqual(DEFAULT_REMOTE_SETTINGS);
        await writeFile(join(root, "data-folders-remote.json"), "garbage");
        expect(await readRemoteSettings(root)).toEqual(DEFAULT_REMOTE_SETTINGS);
    });

    it("round-trips, and switches itself off if its saved address stops passing the checks", async () => {
        await writeRemoteSettings(root, { ...DEFAULT_REMOTE_SETTINGS, enabled: true, url: "https://github.com/a/b.git" });
        expect((await readRemoteSettings(root)).enabled).toBe(true);
        await writeFile(
            join(root, "data-folders-remote.json"),
            JSON.stringify({ version: 1, enabled: true, url: "https://u:p@github.com/a/b.git" }),
        );
        expect(await readRemoteSettings(root)).toMatchObject({ enabled: false, url: null });
    });

    it("refuses to turn on with no address, and refuses credentials for a host that is not on the local network", () => {
        expect(applyRemoteChange(DEFAULT_REMOTE_SETTINGS, { enabled: true }, isLanRemote)).toMatchObject({ ok: false });
        const withUrl = applyRemoteChange(DEFAULT_REMOTE_SETTINGS, { url: "https://github.com/a/b.git" }, isLanRemote);
        expect(withUrl.ok).toBe(true);
        if (withUrl.ok) {
            expect(applyRemoteChange(withUrl.settings, { includeCredentials: true }, isLanRemote)).toMatchObject({ ok: false });
        }
        const lan = applyRemoteChange(DEFAULT_REMOTE_SETTINGS, { url: "https://gitlab.lan/a.git" }, isLanRemote);
        expect(lan.ok).toBe(true);
        if (lan.ok) {
            expect(applyRemoteChange(lan.settings, { includeCredentials: true }, isLanRemote)).toMatchObject({ ok: true });
        }
    });
});

describe.skipIf(!gitAvailable)("the filtered mirror", () => {
    it("leaves credential files out of the mirror and keeps them in the local history", async () => {
        await seedProfile();
        const mirror = await updateMirrorBranch(realGit, root, { includeCredentials: false });
        expect(mirror.ok).toBe(true);
        expect([...mirror.excluded].sort()).toEqual([...CREDENTIAL_FILES].sort());
        const mirrored = await trackedFiles(root, `refs/heads/${MIRROR_BRANCH}`);
        for (const path of CREDENTIAL_FILES) expect(mirrored).not.toContain(path);
        expect(mirrored).toContain("settings.json");
        // The local history is untouched, and so is the working folder.
        const local = await trackedFiles(root, "HEAD");
        for (const path of CREDENTIAL_FILES) expect(local).toContain(path);
    });

    it("includes credential files only when the choice says so", async () => {
        await seedProfile();
        await updateMirrorBranch(realGit, root, { includeCredentials: true });
        const mirrored = await trackedFiles(root, `refs/heads/${MIRROR_BRANCH}`);
        for (const path of CREDENTIAL_FILES) expect(mirrored).toContain(path);
    });

    it("adds a commit only when something changed, each one on top of the last", async () => {
        await seedProfile();
        const first = await updateMirrorBranch(realGit, root, { includeCredentials: false });
        const same = await updateMirrorBranch(realGit, root, { includeCredentials: false });
        expect(same).toMatchObject({ unchanged: true, sha: first.sha });
        // A change to a credential file alone does not change what is sent.
        await writeFile(join(root, "github-credential.json"), "rotated");
        await commitSettledChanges(realGit, root);
        expect((await updateMirrorBranch(realGit, root, { includeCredentials: false })).unchanged).toBe(true);
        await writeFile(join(root, "settings.json"), '{"a":2}');
        await commitSettledChanges(realGit, root);
        const next = await updateMirrorBranch(realGit, root, { includeCredentials: false });
        expect(next.unchanged).toBe(false);
        const parent = await git(root, "rev-parse", `${next.sha}^`);
        expect(parent.stdout.trim()).toBe(first.sha);
    });

    it("says there is nothing to send before the first saved version", async () => {
        await git(root, "init", "--quiet");
        expect(await updateMirrorBranch(realGit, root, { includeCredentials: false })).toMatchObject({ ok: false });
    });
});

describe.skipIf(!gitAvailable)("sending the history to a remote", () => {
    async function makeRemote(): Promise<void> {
        await mkdir(remote);
        await git(remote, "init", "--bare", "--quiet");
    }

    it("sends the filtered history, reads it back to prove it, and never sends a credential file", async () => {
        await seedProfile();
        await makeRemote();
        const calls: string[][] = [];
        const outcome = await pushProfile({
            run: realGit,
            push: recordingPush(calls),
            root,
            remoteUrl: remote,
            includeCredentials: false,
        });
        expect(outcome).toMatchObject({ status: "pushed", verified: true });
        const remoteFiles = await trackedFiles(remote, `refs/heads/${REMOTE_BRANCH}`);
        expect(remoteFiles).toContain("settings.json");
        for (const path of CREDENTIAL_FILES) expect(remoteFiles).not.toContain(path);
        // The raw content of a credential file is not anywhere in the remote's objects either.
        const everything = await git(remote, "grep", "-l", "secret-bytes", REMOTE_BRANCH).catch(() => ({ stdout: "" }));
        expect(everything.stdout).toBe("");
        // Nothing the remote was sent could force it.
        for (const call of calls) expect(() => assertNoForce(call)).not.toThrow();
        expect(calls.some((call) => call[0] === "push")).toBe(true);
    });

    it("says it is up to date, then sends only the new commit as a fast-forward", async () => {
        await seedProfile();
        await makeRemote();
        const options = { run: realGit, root, remoteUrl: remote, includeCredentials: false } as const;
        const first = await pushProfile({ ...options, push: recordingPush([]) });
        expect((await pushProfile({ ...options, push: recordingPush([]) })).status).toBe("up-to-date");
        await writeFile(join(root, "settings.json"), '{"a":3}');
        await commitSettledChanges(realGit, root);
        const second = await pushProfile({ ...options, push: recordingPush([]) });
        expect(second).toMatchObject({ status: "pushed", verified: true });
        const ancestor = await git(remote, "merge-base", "--is-ancestor", first.sha ?? "", REMOTE_BRANCH);
        expect(ancestor.ok).toBe(true);
    });

    it("reports a remote that moved on as rejected, leaves it alone, and does not force", async () => {
        await seedProfile();
        await makeRemote();
        const options = { run: realGit, root, remoteUrl: remote, includeCredentials: false } as const;
        await pushProfile({ ...options, push: recordingPush([]) });

        // Somebody else puts an unrelated commit on the same remote branch.
        const other = join(root, "..", "other");
        await mkdir(other);
        await git(other, "init", "--quiet");
        await writeFile(join(other, "theirs.txt"), "theirs");
        await git(other, "add", "-A");
        await git(other, "-c", "user.name=Them", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "theirs");
        await git(other, "push", "--force", remote, `HEAD:refs/heads/${REMOTE_BRANCH}`);
        const theirTip = (await git(remote, "rev-parse", REMOTE_BRANCH)).stdout.trim();

        await writeFile(join(root, "settings.json"), '{"a":4}');
        await commitSettledChanges(realGit, root);
        const calls: string[][] = [];
        const outcome = await pushProfile({ ...options, push: recordingPush(calls) });
        expect(outcome).toMatchObject({ status: "rejected", verified: false });
        expect((await git(remote, "rev-parse", REMOTE_BRANCH)).stdout.trim()).toBe(theirTip);
        for (const call of calls) expect(() => assertNoForce(call)).not.toThrow();
    });

    it("refuses to send credential files to a host that is not on the local network, without calling Git to push", async () => {
        await seedProfile();
        const calls: string[][] = [];
        const outcome = await pushProfile({
            run: realGit,
            push: recordingPush(calls),
            root,
            remoteUrl: "https://github.com/a/b.git",
            includeCredentials: true,
        });
        expect(outcome.status).toBe("refused");
        expect(calls).toEqual([]);
    });

    it("refuses an address that carries a user name and password", async () => {
        await seedProfile();
        const calls: string[][] = [];
        const outcome = await pushProfile({
            run: realGit,
            push: recordingPush(calls),
            root,
            remoteUrl: "https://me:hunter2@github.com/a/b.git",
            includeCredentials: false,
        });
        expect(outcome.status).toBe("refused");
        expect(calls).toEqual([]);
    });

    it("reports a failed push honestly instead of claiming it was sent", async () => {
        await seedProfile();
        const outcome = await pushProfile({
            run: realGit,
            push: recordingPush([]),
            root,
            remoteUrl: join(root, "..", "does-not-exist.git"),
            includeCredentials: false,
        });
        expect(outcome.status).toBe("failed");
        expect(outcome.verified).toBe(false);
    });
});
