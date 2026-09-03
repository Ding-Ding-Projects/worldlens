import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runBuiltInTransform } from "./transforms.js";

describe("bounded built-in converter transforms", () => {
    it("writes parser-validated YAML and refuses lossy nested CSV", async () => {
        const dir = await mkdtemp(join(tmpdir(), "worldlens-transforms-"));
        try {
            const source = join(dir, "source.json");
            await writeFile(source, JSON.stringify({ name: "oak", rows: [1, 2] }), "utf8");
            const yaml = join(dir, "result.yaml");
            await runBuiltInTransform(source, yaml, "data-json");
            expect((await readFile(yaml, "utf8"))).toContain("rows:");
            const nested = join(dir, "nested.json");
            await writeFile(nested, JSON.stringify([{ name: "oak", details: { size: 2 } }]), "utf8");
            await expect(runBuiltInTransform(nested, join(dir, "nested.csv"), "data-json")).rejects.toThrow("nested objects or arrays");
        } finally { await rm(dir, { recursive: true, force: true }); }
    });

    it("rejects non-canonical Base64 input", async () => {
        const dir = await mkdtemp(join(tmpdir(), "worldlens-base64-"));
        try {
            const source = join(dir, "source.b64");
            await writeFile(source, "YQ", "ascii");
            await expect(runBuiltInTransform(source, join(dir, "out.bin"), "binary-base64")).rejects.toThrow("canonical");
        } finally { await rm(dir, { recursive: true, force: true }); }
    });
});
