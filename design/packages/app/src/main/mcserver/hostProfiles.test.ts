import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    HOST_PROFILES_FILE,
    createHostProfileStore,
    parseHostProfile,
} from "./hostProfiles.js";

const dirs: string[] = [];
afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function target(overrides: Record<string, unknown> = {}) {
    return {
        host: "fowshan",
        user: "docker",
        port: 22,
        workDir: "/home/docker/WorldLens",
        identityFile: "C:/Users/test/.ssh/id_ed25519",
        ...overrides,
    };
}

async function store() {
    const dir = await mkdtemp(join(tmpdir(), "wl-host-profile-"));
    dirs.push(dir);
    return { dir, value: createHostProfileStore({ dataFolder: dir, knownHostsFile: join(dir, "known_hosts") }) };
}

describe("host profile validation", () => {
    it("keeps only validated metadata and drops secret-looking fields", () => {
        const parsed = parseHostProfile({
            hostId: "andyville",
            target: { ...target(), password: "do-not-copy", privateKeyBytes: "do-not-copy" },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        });
        expect(parsed?.target.host).toBe("fowshan");
        expect(parsed?.target.identityFile).toContain("id_ed25519");
        expect(JSON.stringify(parsed)).not.toMatch(/password|privateKeyBytes|do-not-copy/i);
    });

    it("drops traversal and invalid host records", () => {
        expect(parseHostProfile({ hostId: "../escape", target: target(), createdAt: "a", updatedAt: "b" })).toBeNull();
        expect(parseHostProfile({ hostId: "andyville", target: target({ host: "-oProxyCommand=bad" }), createdAt: "a", updatedAt: "b" })).toBeNull();
    });
});

describe("createHostProfileStore", () => {
    it("saves, lists, updates and returns SshOptionsInput without key bytes", async () => {
        const { value: profileStore, dir } = await store();
        const saved = await profileStore.save({ hostId: "andyville", target: target() });
        expect(saved.ok).toBe(true);
        const listed = await profileStore.list();
        expect(listed.ok && listed.value[0]?.hostId).toBe("andyville");
        const ssh = profileStore.sshHost("andyville");
        expect(ssh?.target.identityFile).toContain("id_ed25519");
        expect(ssh).toMatchObject({ knownHostsFile: join(dir, "known_hosts") });
        const text = await readFile(join(dir, HOST_PROFILES_FILE), "utf8");
        expect(text).not.toMatch(/password|secret|privateKeyBytes/i);
    });

    it("refuses changed identity and host-key options are owned by the store", async () => {
        const { value: profileStore, dir } = await store();
        const saved = await profileStore.save({ hostId: "andyville", target: target({ knownHostsFile: "C:/user/.ssh/known_hosts" }) });
        expect(saved.ok).toBe(true);
        const ssh = profileStore.sshHost("andyville");
        expect(ssh?.knownHostsFile).toBe(join(dir, "known_hosts"));
        expect(ssh?.userKnownHostsFile).toBeUndefined();
    });

    it("reports malformed saved data instead of starting from an empty profile list", async () => {
        const { value: profileStore, dir } = await store();
        await writeFile(join(dir, HOST_PROFILES_FILE), "{not-json");
        const result = await profileStore.list();
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("invalid-request");
    });
});
