import { describe, expect, it } from "vitest";
import { dockerServerProfile, SERVER_CREATION_FLAVOURS } from "./dockerServerProfile.js";
import { readFileSync } from "node:fs";
import { FLAVOUR_IDS } from "./flavours/catalogue.js";

describe("Docker server image contracts", () => {
    it("keeps year-based Forge game versions intact", () => {
        const result = dockerServerProfile({ flavour: "forge", version: "26.1-62.0.0" });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.env.VERSION).toBe("26.1");
    });
    it("requires an explicit game version for year-based NeoForge releases", () => {
        expect(dockerServerProfile({ flavour: "neoforge", version: "26.1.1" }).ok).toBe(false);
        const result = dockerServerProfile({
            flavour: "neoforge",
            version: "26.1.1",
            gameVersion: "26.1",
        });
        expect(result.ok).toBe(true);
        if (result.ok)
            expect(result.value.env).toEqual({
                TYPE: "NEOFORGE",
                NEOFORGE_VERSION: "26.1.1",
                VERSION: "26.1",
            });
    });
    it("pins the complete eight-type wizard and creation roster", () => {
        const expected = [
            "vanilla",
            "paper",
            "purpur",
            "spigot",
            "fabric",
            "forge",
            "neoforge",
            "velocity",
        ];
        expect([...SERVER_CREATION_FLAVOURS]).toEqual(expected);
        expect([...FLAVOUR_IDS].sort()).toEqual([...expected].sort());
        const source = readFileSync(
            new URL("../../../../ui/src/components/mcserver/wizardModel.ts", import.meta.url),
            "utf8",
        );
        const roster =
            source
                .split("export const FLAVOUR_CARDS: readonly FlavourCard[] = [")[1]
                ?.split("export function flavourCard(")[0] ?? "";
        expect([...roster.matchAll(/^\s+id: "([a-z]+)",/gm)].map((match) => match[1])).toEqual(
            expected,
        );
    });
    it("builds Spigot from its source instead of an unavailable third-party download", () => {
        const result = dockerServerProfile({ flavour: "spigot", version: "1.21.4" });
        expect(result.ok).toBe(true);
        if (result.ok)
            expect(result.value.env).toEqual({
                TYPE: "SPIGOT",
                VERSION: "1.21.4",
                BUILD_FROM_SOURCE: "true",
            });
    });
    it.each([
        ["vanilla", "1.21.4", undefined, { TYPE: "VANILLA", VERSION: "1.21.4" }],
        ["paper", "1.21.4#11", undefined, { TYPE: "PAPER", VERSION: "1.21.4", PAPER_BUILD: "11" }],
        [
            "purpur",
            "1.21.4#2390",
            undefined,
            { TYPE: "PURPUR", VERSION: "1.21.4", PURPUR_BUILD: "2390" },
        ],
        [
            "forge",
            "1.20.1-47.3.0",
            undefined,
            { TYPE: "FORGE", VERSION: "1.20.1", FORGE_VERSION: "47.3.0" },
        ],
        [
            "neoforge",
            "21.1.42",
            undefined,
            { TYPE: "NEOFORGE", VERSION: "1.21.1", NEOFORGE_VERSION: "21.1.42" },
        ],
        [
            "fabric",
            "0.16.9",
            "1.21.4",
            { TYPE: "FABRIC", VERSION: "1.21.4", FABRIC_LOADER_VERSION: "0.16.9" },
        ],
        [
            "velocity",
            "3.4.0-SNAPSHOT#477",
            undefined,
            { TYPE: "VELOCITY", VELOCITY_VERSION: "3.4.0-SNAPSHOT", VELOCITY_BUILD_ID: "477" },
        ],
    ] as const)(
        "maps %s catalogue versions without mixing game and loader identities",
        (flavour, version, gameVersion, env) => {
            const result = dockerServerProfile({
                flavour,
                version,
                ...(gameVersion ? { gameVersion } : {}),
            });
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.env).toEqual(env);
            expect(result.value.imageRepository).toBe(
                flavour === "velocity" ? "itzg/mc-proxy" : "itzg/minecraft-server",
            );
            expect(result.value.serverDir).toBe(flavour === "velocity" ? "/server" : "/data");
        },
    );
    it("refuses a Fabric loader without a separate game version", () => {
        expect(dockerServerProfile({ flavour: "fabric", version: "0.16.9" }).ok).toBe(false);
    });
    it("refuses a loader override contradicting the selected Forge build", () => {
        expect(
            dockerServerProfile({
                flavour: "forge",
                version: "1.20.1-47.3.0",
                loaderVersion: "48.0.0",
            }).ok,
        ).toBe(false);
    });
});
