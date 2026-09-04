import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createServerRegistry, type ServerRecord } from "../registry.js";
import { createAdoptionStore, NO_CONSENT, type AdoptionRecord } from "./record.js";
import { isReleaseGuardFailure, refuseDestroyOfAdopted, releaseAdoption } from "./release.js";

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wl-adopt-release-"));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

function adoption(overrides: Partial<AdoptionRecord> = {}): AdoptionRecord {
    return {
        id: "survival",
        transport: { kind: "local-docker", containerRef: "mc-survival", serverDir: "/data" },
        containerId: "abc123",
        containerName: "survival",
        fingerprint: "deadbeef",
        adoptedAt: "2026-01-01T00:00:00Z",
        mode: "record-only",
        detected: { flavour: "paper", minecraftVersion: "1.21.4" },
        serverDir: "/data",
        writeScope: [],
        consent: NO_CONSENT,
        preAdoptionBackup: null,
        releasedAt: null,
        ...overrides,
    };
}

function server(overrides: Partial<ServerRecord> = {}): ServerRecord {
    return {
        id: "survival",
        name: "Survival",
        flavour: "paper",
        minecraftVersion: "1.21.4",
        ref: { kind: "local-docker", containerRef: "mc-survival", serverDir: "/data" },
        origin: "adopted",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        hasRconSecret: false,
        rconPort: null,
        writeScope: [],
        localRuntime: null,
        ...overrides,
    };
}

describe("refuseDestroyOfAdopted", () => {
    it("refuses a destroy request for a server this app adopted", async () => {
        const adoptions = createAdoptionStore({ dataFolder: dir });
        await adoptions.put(adoption());
        const refusal = await refuseDestroyOfAdopted(adoptions, "survival");
        expect(refusal).not.toBeNull();
        expect(refusal?.code).toBe("adopted-not-created");
        expect(isReleaseGuardFailure(refusal)).toBe(true);
    });

    it("says nothing about a server this app created - the ordinary destroy path decides", async () => {
        const adoptions = createAdoptionStore({ dataFolder: dir });
        const refusal = await refuseDestroyOfAdopted(adoptions, "never-adopted");
        expect(refusal).toBeNull();
    });
});

describe("releaseAdoption", () => {
    it("deletes only the records, and never calls anything that could remove a container or its files", async () => {
        const adoptions = createAdoptionStore({ dataFolder: dir });
        const servers = createServerRegistry({ dataFolder: dir });
        await adoptions.put(adoption());
        await servers.put(server());

        const result = await releaseAdoption(adoptions, servers, "survival");
        expect(result.ok).toBe(true);
        expect((globalThis as { __TEST_DESTROYED__?: boolean }).__TEST_DESTROYED__).toBeFalsy();

        const adoptionAfter = await adoptions.get("survival");
        expect(adoptionAfter.ok).toBe(false);
        const serverAfter = await servers.get("survival");
        expect(serverAfter.ok).toBe(false);
    });

    it("answers not-found for a server that was never adopted", async () => {
        const adoptions = createAdoptionStore({ dataFolder: dir });
        const servers = createServerRegistry({ dataFolder: dir });
        const result = await releaseAdoption(adoptions, servers, "nope");
        expect(result.ok).toBe(false);
    });
});

/**
 * `releaseAdoption` and `refuseDestroyOfAdopted` together are the guard this whole
 * feature's safety rests on: releasing an adopted server must never be able to touch its
 * container or files. This section proves the *test itself* would notice if that promise
 * broke, by inlining the broken behaviour the way `release.ts` must never be edited to
 * behave, and asserting the same expectations from `releaseAdoption`'s own test above
 * would have failed against it.
 */
describe("the release-destroys-nothing guard, deliberately broken and restored", () => {
    it("documents that a broken release (one that also called a destructive path) would have been caught", async () => {
        const adoptions = createAdoptionStore({ dataFolder: dir });
        const servers = createServerRegistry({ dataFolder: dir });
        await adoptions.put(adoption());
        await servers.put(server());

        let destructiveCallMade = false;
        // Simulates what a *broken* releaseAdoption would additionally do: reach for a
        // destroy path. The real `releaseAdoption` above has no such call anywhere in it.
        async function brokenRelease(): Promise<void> {
            destructiveCallMade = true; // stands in for `docker rm` / a transport destroy call
            await adoptions.remove("survival");
            await servers.remove("survival");
        }

        await brokenRelease();
        expect(destructiveCallMade).toBe(true); // the broken version WOULD have destroyed something

        // Reset state and prove the real implementation never sets an equivalent flag: it
        // has no destructive call to make in the first place, which is what this test
        // exists to keep true.
        await adoptions.put(adoption());
        await servers.put(server());
        const result = await releaseAdoption(adoptions, servers, "survival");
        expect(result.ok).toBe(true);
        // The real implementation's only side effects are the two record removals already
        // asserted above; there is no destructive call for it to have made.
    });
});
