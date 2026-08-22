import { describe, expect, it } from "vitest";
import { REGISTRY, resolveSchema } from "./schemas/index.js";

describe("issue 158 typed loader and record-file schemas", () => {
    it("registers Fabric, Forge and NeoForge server.properties schemas", () => {
        for (const flavour of ["fabric", "forge", "neoforge"]) {
            const fields = resolveSchema("server.properties", flavour, "*");
            expect(fields, flavour).toBeDefined();
            expect(fields?.length, flavour).toBeGreaterThan(0);
            expect(fields?.every((field) => field.control.kind !== "text" || field.advanced)).toBe(true);
        }
    });

    it("registers JSON player files as typed record tables", () => {
        for (const fileKind of ["ops.json", "whitelist.json", "banned-players.json", "banned-ips.json"]) {
            const fields = resolveSchema(fileKind, "paper", "*");
            expect(fields, fileKind).toHaveLength(1);
            const control = fields?.[0]?.control;
            expect(control?.kind, fileKind).toBe("record-table");
            if (control?.kind !== "record-table") continue;
            expect(control.columns.length, fileKind).toBeGreaterThan(1);
            expect(control.columns.every((column) => column.control.kind !== "text" || column.key === "name" || column.key === "uuid" || column.key === "ip" || column.key === "created" || column.key === "source" || column.key === "expires" || column.key === "reason")).toBe(true);
        }
    });

    it("keeps every new registry entry unique by file kind and flavour", () => {
        const keys = REGISTRY.map((entry) => `${entry.fileKind}\0${entry.flavour}`);
        expect(new Set(keys).size).toBe(keys.length);
    });
});
