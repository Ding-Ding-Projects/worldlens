import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(
    new URL("../../../../app/scripts/stage-render-engines.mjs", import.meta.url),
);
const script = await readFile(scriptPath, "utf8");

describe("render-engine staging contract", () => {
    it("names both the Gradle output and the CI release-style asset", () => {
        expect(script).toContain("const gradleJarDirectory = join(");
        expect(script).toContain('"vendor",');
        expect(script).toContain('"BlueMap",');
        expect(script).toContain('"implementations",');
        expect(script).toContain('"build",');
        expect(script).toContain('"libs",');
        expect(script).toMatch(/bluemap-\(.+\)-cli\\\.jar/);
        expect(script).toMatch(/cli-\(.+\)-shadow\\\.jar/);
    });

    it("fails closed instead of advertising unavailable Java", () => {
        expect(script).toContain("No verified BlueMap CLI jar is available for packaging");
        expect(script).not.toContain("The Java engine remains an honest unavailable capability");
    });

    it("records the source beside the staged jar", () => {
        expect(script).toContain('source: "gradle"');
        expect(script).toContain('source: "staged"');
        expect(script).toContain("writeCliManifest");
    });
});
