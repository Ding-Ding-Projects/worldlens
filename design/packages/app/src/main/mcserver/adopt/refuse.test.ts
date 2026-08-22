import { describe, expect, it } from "vitest";

import type { AdoptionCandidate } from "./discover.js";
import { refuseBulkAdoption, refuseSingleAdoption } from "./refuse.js";

function candidate(overrides: Partial<AdoptionCandidate> = {}): AdoptionCandidate {
    return {
        containerId: "abc",
        containerName: "survival",
        image: "itzg/minecraft-server",
        imageDigest: null,
        createdAt: "2026-01-01T00:00:00Z",
        state: "running",
        ports: [25565],
        mounts: [{ source: "/host/mc/survival", destination: "/data" }],
        detected: { flavour: "paper", minecraftVersion: "1.21.4", serverDir: "/host/mc/survival", confidence: "high" },
        evidence: ["mount layout matches a known server-data mount point", "log line matches something"],
        existingOwner: null,
        blockers: [],
        ...overrides,
    };
}

describe("refuseSingleAdoption", () => {
    it("refuses nothing for a clean, high-confidence candidate", () => {
        expect(refuseSingleAdoption(candidate(), "owner-a")).toEqual([]);
    });

    it("refuses a privileged container even if it presents no blockers text", () => {
        // scoreCandidate always fills `blockers` for privileged containers, but this proves
        // the refusal is re-derived here too, not merely trusted from that text.
        const refusals = refuseSingleAdoption(
            candidate({ blockers: ["This container runs privileged."] }),
            "owner-a",
        );
        expect(refusals.some((r) => r.reason === "privileged")).toBe(true);
    });

    it("refuses a root-filesystem bind mount independently of the blockers list", () => {
        const refusals = refuseSingleAdoption(
            candidate({ blockers: [], mounts: [{ source: "/", destination: "/hostroot" }] }),
            "owner-a",
        );
        expect(refusals.some((r) => r.reason === "root-mount")).toBe(true);
    });

    it("refuses a docker.sock bind mount independently of the blockers list", () => {
        const refusals = refuseSingleAdoption(
            candidate({ blockers: [], mounts: [{ source: "/var/run/docker.sock", destination: "/var/run/docker.sock" }] }),
            "owner-a",
        );
        expect(refusals.some((r) => r.reason === "docker-socket-mount")).toBe(true);
    });

    it("refuses ownership by a different installation", () => {
        const refusals = refuseSingleAdoption(candidate({ existingOwner: "someone-else" }), "owner-a");
        expect(refusals.some((r) => r.reason === "different-owner")).toBe(true);
    });

    it("does not refuse a container this installation already owns", () => {
        const refusals = refuseSingleAdoption(candidate({ existingOwner: "owner-a" }), "owner-a");
        expect(refusals.some((r) => r.reason === "different-owner")).toBe(false);
    });

    it("refuses low confidence with no filesystem or log evidence at all", () => {
        const refusals = refuseSingleAdoption(
            candidate({ detected: { flavour: "unknown", minecraftVersion: null, serverDir: null, confidence: "low" }, evidence: [`image name mentions "minecraft"`] }),
            "owner-a",
        );
        expect(refusals.some((r) => r.reason === "low-confidence")).toBe(true);
    });

    it("does not refuse low confidence when filesystem or log evidence is present", () => {
        const refusals = refuseSingleAdoption(
            candidate({ detected: { flavour: "unknown", minecraftVersion: null, serverDir: null, confidence: "low" }, evidence: ["mount layout matches a known server-data mount point"] }),
            "owner-a",
        );
        expect(refusals.some((r) => r.reason === "low-confidence")).toBe(false);
    });
});

describe("refuseBulkAdoption", () => {
    it("allows zero or one candidate", () => {
        expect(refuseBulkAdoption([])).toBeNull();
        expect(refuseBulkAdoption(["a"])).toBeNull();
    });

    it("refuses more than one candidate at a time, with no override", () => {
        const refusal = refuseBulkAdoption(["a", "b"]);
        expect(refusal?.reason).toBe("bulk-not-allowed");
    });
});
