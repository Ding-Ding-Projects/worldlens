import { describe, expect, it } from "vitest";
import {
    destroyBlockReason,
    filterServers,
    flavourName,
    lifecycleBlockReason,
    matchesSearch,
    sortServers,
    stateLabel,
    transportSummary,
    validateMemoryMb,
    validatePort,
    validateServerId,
    validateServerName,
    writeBlockReason,
    type ServerRecord,
} from "./serverModel.js";

function record(overrides: Partial<ServerRecord> = {}): ServerRecord {
    return {
        id: "survival",
        name: "Survival",
        flavour: "paper",
        minecraftVersion: "1.21",
        ref: { kind: "local-process", serverDir: "/srv/survival" },
        origin: "created",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        hasRconSecret: false,
        rconPort: null,
        writeScope: [],
        ...overrides,
    };
}

describe("stateLabel", () => {
    it("names every transport state", () => {
        expect(stateLabel("running").color).toBe("success");
        expect(stateLabel("exited").color).toBe("surface");
        expect(stateLabel("unknown").color).toBe("warning");
        expect(stateLabel(null).text).toBe("Not checked yet");
    });
});

describe("transportSummary", () => {
    it("describes each transport kind in plain words", () => {
        expect(transportSummary(record())).toBe("This computer");
        expect(
            transportSummary(record({ ref: { kind: "local-docker", containerRef: "c1", serverDir: "/s" } })),
        ).toBe("This computer, in a container");
        expect(
            transportSummary(
                record({ ref: { kind: "ssh-docker", hostId: "h1", containerRef: "c1", serverDir: "/s" } }),
            ),
        ).toBe("A remote host, in a container");
    });
});

describe("flavourName", () => {
    it("has a name for every flavour", () => {
        expect(flavourName("paper")).toBe("Paper");
        expect(flavourName("unknown")).toBe("Unknown");
    });
});

describe("lifecycleBlockReason", () => {
    it("blocks with no capabilities", () => {
        expect(lifecycleBlockReason(record(), null, "start", null)).not.toBeNull();
    });
    it("names adoption when a transport cannot start/stop and origin is adopted", () => {
        const reason = lifecycleBlockReason(
            record({ origin: "adopted" }),
            { canLifecycle: false },
            "start",
            "exited",
        );
        expect(reason).toMatch(/adopted/);
    });
    it("names the transport when created here", () => {
        const reason = lifecycleBlockReason(record(), { canLifecycle: false }, "start", "exited");
        expect(reason).toMatch(/cannot start or stop/);
    });
    it("blocks starting an already-running server", () => {
        expect(lifecycleBlockReason(record(), { canLifecycle: true }, "start", "running")).toMatch(
            /already running/,
        );
    });
    it("blocks stopping a server that is not running", () => {
        expect(lifecycleBlockReason(record(), { canLifecycle: true }, "stop", "exited")).toMatch(
            /not running/,
        );
    });
    it("allows starting a stopped server", () => {
        expect(lifecycleBlockReason(record(), { canLifecycle: true }, "start", "exited")).toBeNull();
    });
});

describe("writeBlockReason / destroyBlockReason", () => {
    it("blocks writes on an adopted read-only transport with the adoption reason", () => {
        expect(
            writeBlockReason(record({ origin: "adopted" }), { canWriteFiles: false }),
        ).toMatch(/adopted/);
    });
    it("allows writes when capable", () => {
        expect(writeBlockReason(record(), { canWriteFiles: true })).toBeNull();
    });
    it("blocks destroy for an adopted server, always", () => {
        expect(destroyBlockReason(record({ origin: "adopted" }), { canDestroy: true })).toBeNull();
        expect(destroyBlockReason(record({ origin: "adopted" }), { canDestroy: false })).toMatch(
            /never delete something it did not make/,
        );
    });
});

describe("sortServers", () => {
    const a = record({ id: "alpha", name: "Alpha", updatedAt: "2026-01-01T00:00:00.000Z" });
    const b = record({ id: "beta", name: "Beta", updatedAt: "2026-02-01T00:00:00.000Z" });

    it("sorts by name", () => {
        expect(sortServers([b, a], "name").map((r) => r.id)).toEqual(["alpha", "beta"]);
    });
    it("sorts by most recently updated", () => {
        expect(sortServers([a, b], "recent").map((r) => r.id)).toEqual(["beta", "alpha"]);
    });
    it("sorts running servers first by state", () => {
        const state = (id: string) => (id === "beta" ? "running" : "exited");
        expect(sortServers([a, b], "state", state as never).map((r) => r.id)).toEqual(["beta", "alpha"]);
    });
});

describe("search and filter", () => {
    const survival = record();
    const creative = record({ id: "creative", name: "Creative", flavour: "vanilla", minecraftVersion: "1.20" });

    it("matches on name, flavour, version, id (case-insensitive)", () => {
        expect(matchesSearch(survival, "PAPER")).toBe(true);
        expect(matchesSearch(survival, "1.21")).toBe(true);
        expect(matchesSearch(survival, "nope")).toBe(false);
    });

    it("plain-text filter returns matches only", () => {
        expect(filterServers([survival, creative], "vanilla", false).map((r) => r.id)).toEqual(["creative"]);
    });

    it("empty query returns everything", () => {
        expect(filterServers([survival, creative], "", false)).toHaveLength(2);
    });

    it("regex mode matches by pattern", () => {
        expect(filterServers([survival, creative], "^c", true).map((r) => r.id)).toEqual(["creative"]);
    });

    it("an invalid regex matches nothing rather than throwing", () => {
        expect(() => filterServers([survival], "(", true)).not.toThrow();
        expect(filterServers([survival], "(", true)).toEqual([]);
    });
});

describe("wizard validation", () => {
    it("rejects an empty id", () => {
        expect(validateServerId("", [])).toMatch(/id/);
    });
    it("rejects an id with illegal characters", () => {
        expect(validateServerId("Not Ok!", [])).not.toBeNull();
    });
    it("rejects a duplicate id", () => {
        expect(validateServerId("survival", ["survival"])).toMatch(/already exists/);
    });
    it("accepts a good id", () => {
        expect(validateServerId("survival-2", ["survival"])).toBeNull();
    });
    it("rejects a blank name", () => {
        expect(validateServerName("  ")).not.toBeNull();
    });
    it("validates ports", () => {
        expect(validatePort(0)).not.toBeNull();
        expect(validatePort(70000)).not.toBeNull();
        expect(validatePort(25565)).toBeNull();
    });
    it("validates memory", () => {
        expect(validateMemoryMb(256)).not.toBeNull();
        expect(validateMemoryMb(999999)).not.toBeNull();
        expect(validateMemoryMb(2048)).toBeNull();
    });
});
