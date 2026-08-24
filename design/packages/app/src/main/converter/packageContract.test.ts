import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("converter packaging contract", () => {
    it("proves built-in adapters through main code and stages a real manifest instead of fake adapter files", () => {
        const registry = readFileSync(resolve(here, "registry.ts"), "utf8");
        const staging = readFileSync(resolve(here, "../../../scripts/stage-bundled-runtimes.mjs"), "utf8");
        const builder = readFileSync(resolve(here, "../../../electron-builder.config.cjs"), "utf8");
        for (const id of ["data-json", "text-markdown", "binary-base64"]) expect(registry).toMatch(new RegExp(`id: "${id}"[^\\n]*builtIn: true`));
        expect(staging).toContain("stageBuiltinConverterManifest");
        expect(staging).toContain('join(outRoot, "converter", "manifest.json")');
        expect(builder).toContain('from: "dist/bundled"');
        expect(builder).toContain('to: "bundled"');
    });

    it("keeps the isolated converter worker offline and process-bounded", () => {
        const worker = readFileSync(resolve(here, "isolatedWorker.ts"), "utf8");
        expect(worker).not.toMatch(/from ["']node:(?:http|https|net|tls|child_process)["']/);
        expect(worker).not.toContain("fetch(");
        expect(readFileSync(resolve(here, "isolated.ts"), "utf8")).toContain("ELECTRON_RUN_AS_NODE");
    });
});
