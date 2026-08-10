import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    SCHOOL_MODE_NAME_MAX_LENGTH,
    SCHOOL_MODE_RECORD_MAX_BYTES,
    SCHOOL_MODE_RECORD_VERSION,
    SHARED_SCHOOL_MODE_DIRECTORY,
    SchoolModeStore,
    schoolModeRecordPath,
} from "./record.js";

let applicationDataDirectory: string;
let store: SchoolModeStore;

beforeEach(async () => {
    applicationDataDirectory = await mkdtemp(join(tmpdir(), "worldlens-school-mode-"));
    store = new SchoolModeStore(applicationDataDirectory);
});

afterEach(async () => {
    await rm(applicationDataDirectory, { recursive: true, force: true });
});

function stateOf(result: Awaited<ReturnType<SchoolModeStore["read"]>>) {
    if (!result.ok) throw new Error(`Expected a safe snapshot, received ${result.code}.`);
    return result.state;
}

describe("the shared School-mode record", () => {
    it("uses a fixed application-data sibling, not this app's renderer storage", () => {
        expect(schoolModeRecordPath(applicationDataDirectory)).toBe(
            join(applicationDataDirectory, SHARED_SCHOOL_MODE_DIRECTORY, "school-mode.v1.json"),
        );
    });

    it("persists only a versioned safe verifier and returns only a safe snapshot", async () => {
        const credential = "test-only-unlock";
        const enabled = await store.enable({ name: "Quiet study", credential });
        expect(enabled).toEqual({
            ok: true,
            state: {
                version: SCHOOL_MODE_RECORD_VERSION,
                enabled: true,
                name: "Quiet study",
                credentialConfigured: true,
            },
        });

        const raw = await readFile(store.recordPath, "utf8");
        expect(raw).not.toContain(credential);
        const stored = JSON.parse(raw) as Record<string, unknown>;
        expect(stored).toMatchObject({ version: SCHOOL_MODE_RECORD_VERSION, enabled: true, name: "Quiet study" });
        expect(stored.credential).toMatchObject({ scheme: "scrypt-v1" });

        const snapshot = stateOf(await store.read());
        expect(Object.keys(snapshot).sort()).toEqual(["credentialConfigured", "enabled", "name", "version"]);
        expect(JSON.stringify(snapshot)).not.toContain("hash");
        expect(JSON.stringify(snapshot)).not.toContain("salt");
        expect(JSON.stringify(snapshot)).not.toContain(credential);
    });

    it("uses a locally checked constant-time verifier before disabling and preserves the shared name", async () => {
        await store.enable({ name: "Focused room", credential: "test-only-unlock" });

        const refused = await store.disable("not-the-unlock");
        expect(refused).toMatchObject({ ok: false, code: "credential-invalid" });
        expect(stateOf(await store.read())).toMatchObject({ enabled: true, name: "Focused room" });

        const disabled = await store.disable("test-only-unlock");
        expect(disabled).toEqual({
            ok: true,
            state: {
                version: SCHOOL_MODE_RECORD_VERSION,
                enabled: false,
                name: "Focused room",
                credentialConfigured: true,
            },
        });
    });

    it("requires a first credential, bounds it, and rejects control characters in a user-visible name", async () => {
        await expect(store.enable({ name: "Focus", credential: "" })).resolves.toMatchObject({
            ok: false,
            code: "credential-required",
        });
        await expect(store.enable({ name: "Focus", credential: "x".repeat(257) })).resolves.toMatchObject({
            ok: false,
            code: "credential-too-long",
        });
        await expect(store.rename(`Focus\nroom`)).resolves.toMatchObject({ ok: false, code: "invalid-name" });
        await expect(store.rename("x".repeat(SCHOOL_MODE_NAME_MAX_LENGTH + 1))).resolves.toMatchObject({
            ok: false,
            code: "invalid-name",
        });
    });

    it("treats malformed or unknown-version data as invalid instead of inventing a disabled shared state", async () => {
        await mkdir(dirname(store.recordPath), { recursive: true });
        await writeFile(
            store.recordPath,
            JSON.stringify({ version: 99, enabled: false, name: "Old record", credential: null }),
            "utf8",
        );

        await expect(store.read()).resolves.toMatchObject({ ok: false, code: "record-invalid", state: null });
    });

    it("bounds record reads before parsing a malformed oversized file", async () => {
        await mkdir(dirname(store.recordPath), { recursive: true });
        await writeFile(store.recordPath, "x".repeat(SCHOOL_MODE_RECORD_MAX_BYTES + 1), "utf8");

        await expect(store.read()).resolves.toMatchObject({ ok: false, code: "record-invalid", state: null });
    });

    it("intentionally reset deletes the shared record and its verifier", async () => {
        await store.enable({ name: "Resettable", credential: "test-only-unlock" });
        await expect(store.reset()).resolves.toEqual({
            ok: true,
            state: {
                version: SCHOOL_MODE_RECORD_VERSION,
                enabled: false,
                name: null,
                credentialConfigured: false,
            },
        });
        await expect(store.read()).resolves.toEqual({
            ok: true,
            state: {
                version: SCHOOL_MODE_RECORD_VERSION,
                enabled: false,
                name: null,
                credentialConfigured: false,
            },
        });
    });
});
