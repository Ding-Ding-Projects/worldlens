import { describe, expect, it } from "vitest";
import { serverPropertiesFields, SERVER_PROPERTIES_GROUPS } from "./serverPropertiesFields.js";

describe("serverPropertiesFields", () => {
    it("has no duplicate keys", () => {
        const keys = serverPropertiesFields.map((f) => f.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("every field belongs to a declared group", () => {
        for (const field of serverPropertiesFields) {
            expect(SERVER_PROPERTIES_GROUPS).toContain(field.group);
        }
    });

    it("never uses a bare text control for a value that is really a boolean or bounded number", () => {
        const knownBooleans = new Set(["online-mode", "pvp", "hardcore", "allow-flight", "allow-nether", "white-list", "enable-rcon"]);
        for (const field of serverPropertiesFields) {
            if (knownBooleans.has(field.key)) {
                expect(field.control.kind).toBe("switch");
            }
        }
    });

    it("difficulty and gamemode are closed selects, not free text", () => {
        const difficulty = serverPropertiesFields.find((f) => f.key === "difficulty");
        const gamemode = serverPropertiesFields.find((f) => f.key === "gamemode");
        expect(difficulty?.control.kind).toBe("select");
        expect(gamemode?.control.kind).toBe("select");
    });

    it("view-distance and ports carry real numeric bounds", () => {
        const viewDistance = serverPropertiesFields.find((f) => f.key === "view-distance");
        const port = serverPropertiesFields.find((f) => f.key === "server-port");
        expect(viewDistance?.control).toMatchObject({ kind: "number", min: 2, max: 32 });
        expect(port?.control).toMatchObject({ kind: "number", min: 1, max: 65535 });
    });

    it("marks the RCON password secret", () => {
        const password = serverPropertiesFields.find((f) => f.key === "rcon.password");
        expect(password?.secret).toBe(true);
    });
});
