import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    REGISTRY_FILE,
    REGISTRY_MAX_RECORDS,
    createServerRegistry,
    parseRecord,
    type ServerRecord,
    type ServerRegistry,
} from "./registry.js";

function record(overrides: Partial<ServerRecord> = {}): ServerRecord {
    return {
        id: "survival",
        name: "Survival",
        flavour: "paper",
        minecraftVersion: "1.21.4",
        ref: { kind: "local-process", serverDir: "/servers/survival" },
        origin: "created",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        hasRconSecret: false,
        rconPort: null,
        writeScope: [],
        ...overrides,
    };
}

describe("parseRecord", () => {
    it("accepts a well-formed record", () => {
        expect(parseRecord(record())?.id).toBe("survival");
    });

    it("drops a record with no usable transport reference", () => {
        expect(parseRecord({ ...record(), ref: { kind: "telepathy" } })).toBeNull();
    });

    it("drops a docker record with no container", () => {
        expect(parseRecord({ ...record(), ref: { kind: "local-docker", serverDir: "/data" } })).toBeNull();
    });

    it("drops an ssh record with no host", () => {
        expect(
            parseRecord({ ...record(), ref: { kind: "ssh-docker", serverDir: "/data", containerRef: "mc" } }),
        ).toBeNull();
    });

    it("drops a record whose id would not be safe on a command line", () => {
        expect(parseRecord({ ...record(), id: "../../etc" })).toBeNull();
        expect(parseRecord({ ...record(), id: "mc; rm -rf /" })).toBeNull();
        expect(parseRecord({ ...record(), id: "Survival" })).toBeNull();
    });

    it("falls back to unknown rather than inventing a flavour", () => {
        expect(parseRecord({ ...record(), flavour: "definitely-paper" })?.flavour).toBe("unknown");
    });

    it("keeps an unknown version as null rather than guessing one", () => {
        expect(parseRecord({ ...record(), minecraftVersion: 1.21 })?.minecraftVersion).toBeNull();
    });

    it("refuses a nonsense rcon port", () => {
        expect(parseRecord({ ...record(), rconPort: 0 })?.rconPort).toBeNull();
        expect(parseRecord({ ...record(), rconPort: 99_999 })?.rconPort).toBeNull();
        expect(parseRecord({ ...record(), rconPort: 25_575 })?.rconPort).toBe(25_575);
    });

    it("treats origin as adopted only when it says so", () => {
        expect(parseRecord({ ...record(), origin: "adopted" })?.origin).toBe("adopted");
        expect(parseRecord({ ...record(), origin: undefined })?.origin).toBe("created");
        // Anything unrecognised must not become "adopted" by accident, because adopted is
        // the value that unlocks the gentler destructive paths.
        expect(parseRecord({ ...record(), origin: "borrowed" })?.origin).toBe("created");
    });
});

describe("createServerRegistry", () => {
    let dir: string;
    let registry: ServerRegistry;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "wl-registry-"));
        registry = createServerRegistry({ dataFolder: dir, now: () => "2026-06-01T12:00:00.000Z" });
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("starts empty rather than failing when nothing has been saved", async () => {
        const answer = await registry.list();
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value).toEqual([]);
    });

    it("saves and reads a server back", async () => {
        expect((await registry.put(record())).ok).toBe(true);
        const listed = await registry.list();
        expect(listed.ok).toBe(true);
        if (!listed.ok) return;
        expect(listed.value).toHaveLength(1);
        expect(listed.value[0]?.name).toBe("Survival");
    });

    it("keeps the original creation time when a record is edited", async () => {
        await registry.put(record({ createdAt: "2020-01-01T00:00:00.000Z" }));
        const updated = await registry.put(record({ name: "Renamed", createdAt: "2099-01-01T00:00:00.000Z" }));
        expect(updated.ok).toBe(true);
        if (!updated.ok) return;
        // An edit must not rewrite history.
        expect(updated.value.createdAt).toBe("2020-01-01T00:00:00.000Z");
        expect(updated.value.updatedAt).toBe("2026-06-01T12:00:00.000Z");
        expect(updated.value.name).toBe("Renamed");
    });

    it("does not duplicate a server when it is saved twice", async () => {
        await registry.put(record());
        await registry.put(record({ name: "Survival again" }));
        const listed = await registry.list();
        expect(listed.ok && listed.value).toHaveLength(1);
    });

    it("refuses an id that is not safe to put in a path or a command", async () => {
        const answer = await registry.put(record({ id: "../escape" }));
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("invalid-request");
    });

    it("reports a missing server rather than returning an empty one", async () => {
        const answer = await registry.get("nope");
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("not-found");
    });

    it("forgets a server without claiming to have deleted anything else", async () => {
        await registry.put(record());
        expect((await registry.remove("survival")).ok).toBe(true);
        const listed = await registry.list();
        expect(listed.ok && listed.value).toEqual([]);
    });

    it("reports removing something that was never there", async () => {
        const answer = await registry.remove("ghost");
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("not-found");
    });

    it("drops an unreadable record instead of repairing it", async () => {
        // A half-understood record points at a container or folder we are no longer sure
        // about, and starting or deleting it on a guess is the thing to avoid.
        await writeFile(
            join(dir, REGISTRY_FILE),
            JSON.stringify({ version: 1, servers: [record(), { id: "broken" }, record({ id: "second" })] }),
        );
        const listed = await registry.list();
        expect(listed.ok).toBe(true);
        if (!listed.ok) return;
        expect(listed.value.map((entry) => entry.id)).toEqual(["survival", "second"]);
    });

    it("reports a corrupt file rather than silently starting over", async () => {
        await writeFile(join(dir, REGISTRY_FILE), "{ not json");
        const answer = await registry.list();
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("invalid-request");
    });

    it("refuses to grow past its own bound", async () => {
        const many = Array.from({ length: REGISTRY_MAX_RECORDS }, (_unused, index) =>
            record({ id: `server-${index}` }),
        );
        await writeFile(join(dir, REGISTRY_FILE), JSON.stringify({ version: 1, servers: many }));
        const answer = await registry.put(record({ id: "one-too-many" }));
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("invalid-request");
    });

    it("never writes a secret into the file", async () => {
        await registry.put(record({ hasRconSecret: true, rconPort: 25_575 }));
        const text = await readFile(join(dir, REGISTRY_FILE), "utf8");
        // The fact that a password exists, never the password itself.
        expect(text).toContain("hasRconSecret");
        expect(text).toContain("true");
        expect(text).not.toMatch(/password|secret"\s*:\s*"/i);
    });
});
