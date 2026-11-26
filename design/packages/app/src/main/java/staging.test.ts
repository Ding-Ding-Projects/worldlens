import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(
    new URL("../../../../app/scripts/stage-render-engines.mjs", import.meta.url),
);
const localJavaPath = fileURLToPath(
    new URL("../../../../app/scripts/stage-local-java-engine.mjs", import.meta.url),
);
const script = await readFile(scriptPath, "utf8");
const localJava = await readFile(localJavaPath, "utf8");

describe("render-engine staging contract", () => {
    it("names both the Gradle output and the staged release-style jar", () => {
        expect(script).toContain("const gradleJarDirectory = join(");
        expect(script).toContain('"vendor",');
        expect(script).toContain('"BlueMap-Material",');
        expect(script).toContain('"implementations",');
        expect(script).toContain('"build",');
        expect(script).toContain('"libs",');
        expect(script).toContain("validateStagedJavaEngine(jarDirectory");
        expect(localJava).toMatch(/cli-\$\{.+\}-shadow\.jar/u);
    });

    it("fails closed instead of advertising unavailable Java when Java is required", () => {
        expect(script).toContain("if (!requireJava) return { version: null, artifact: null };");
        expect(script).toContain("No source-bound BlueMap CLI is available");
        expect(script).not.toContain("The Java engine remains an honest unavailable capability");
    });

    it("records the source beside the staged jar", () => {
        expect(script).toContain('source: "gradle"');
        expect(script).toContain('source: "staged"');
    });

    it("proves the TypeScript engine before describing it as available", () => {
        const inspect = script.indexOf("await inspectTypeScriptEngineTree(outputDirectory)");
        const probe = script.indexOf("await probeTypeScriptEngineTree(outputDirectory)");
        const archive = script.indexOf("await writeDeterministicZip(");
        expect(inspect).toBeGreaterThan(-1);
        expect(probe).toBeGreaterThan(inspect);
        expect(archive).toBeGreaterThan(probe);
    });
});
