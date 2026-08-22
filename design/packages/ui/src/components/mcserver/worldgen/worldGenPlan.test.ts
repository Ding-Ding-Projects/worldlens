import { describe, expect, it } from "vitest";
import { defaultWorldGenSettings, type WorldGenSettings } from "./worldGenSettings.js";
import {
    UNWIRED_STEP_KINDS,
    buildGenerationPlan,
    buildPostGenerationCommands,
    buildServerProperties,
    estimatePregeneration,
    type WorldGenRunner,
} from "./worldGenPlan.js";

function withVersion(overrides: Partial<WorldGenSettings> = {}): WorldGenSettings {
    return { ...defaultWorldGenSettings(), version: "1.21.4", outputDestination: "C:/out/world.zip", ...overrides };
}

describe("estimatePregeneration", () => {
    it("computes chunk radius, chunk count, and positive estimates for a normal radius", () => {
        const estimate = estimatePregeneration(160); // 10 chunks
        expect(estimate.chunkRadius).toBe(10);
        expect(estimate.chunkCount).toBe(21 * 21);
        expect(estimate.estimatedBytes).toBeGreaterThan(0);
        expect(estimate.estimatedSeconds).toBeGreaterThan(0);
    });

    it("is 1 chunk for radius 0", () => {
        expect(estimatePregeneration(0).chunkCount).toBe(1);
    });

    it("never returns a negative chunk radius for a negative input", () => {
        expect(estimatePregeneration(-100).chunkRadius).toBe(0);
    });

    it("scales monotonically with radius", () => {
        expect(estimatePregeneration(320).chunkCount).toBeGreaterThan(estimatePregeneration(160).chunkCount);
    });
});

describe("buildServerProperties", () => {
    it("includes the level name, generate-structures, and level-type", () => {
        const properties = buildServerProperties(withVersion());
        expect(properties["level-name"]).toBe("generated-world");
        expect(properties["generate-structures"]).toBe("true");
        expect(properties["level-type"]).toBe("minecraft:normal");
    });

    it("omits level-seed when the seed field is blank", () => {
        const properties = buildServerProperties(withVersion({ seedInput: "" }));
        expect(properties["level-seed"]).toBeUndefined();
    });

    it("includes level-seed verbatim when supplied", () => {
        const properties = buildServerProperties(withVersion({ seedInput: "4242424242" }));
        expect(properties["level-seed"]).toBe("4242424242");
    });

    it("encodes the superflat layer string for a flat world", () => {
        const properties = buildServerProperties(
            withVersion({ worldType: "flat", superflatLayers: [{ block: "minecraft:bedrock", depth: 3 }] }),
        );
        expect(properties["generator-settings"]).toBe("3*minecraft:bedrock");
        expect(properties["level-type"]).toBe("minecraft:flat");
    });

    it("encodes the chosen biome for a single-biome world", () => {
        const properties = buildServerProperties(
            withVersion({ worldType: "single_biome_surface", singleBiome: "minecraft:desert" }),
        );
        expect(properties["generator-settings"]).toBe(JSON.stringify({ biome: "minecraft:desert" }));
        expect(properties["level-type"]).toBe("minecraft:single_biome_surface");
    });
});

describe("buildPostGenerationCommands", () => {
    it("always sends the six gamerule commands", () => {
        const commands = buildPostGenerationCommands(withVersion());
        const gameruleCommands = commands.filter((c) => c.startsWith("/gamerule"));
        expect(gameruleCommands).toHaveLength(6);
    });

    it("adds a bonus-chest command only when requested", () => {
        expect(buildPostGenerationCommands(withVersion({ bonusChest: false })).some((c) => c.includes("chest"))).toBe(
            false,
        );
        expect(buildPostGenerationCommands(withVersion({ bonusChest: true })).some((c) => c.includes("chest"))).toBe(
            true,
        );
    });

    it("adds a worldborder command only when the border is enabled", () => {
        const off = buildPostGenerationCommands(withVersion({ worldBorderEnabled: false }));
        expect(off.some((c) => c.startsWith("/worldborder"))).toBe(false);

        const on = buildPostGenerationCommands(withVersion({ worldBorderEnabled: true, worldBorderDiameter: 5000 }));
        expect(on).toContain("/worldborder set 5000");
    });
});

describe("buildGenerationPlan", () => {
    const local: WorldGenRunner = { kind: "local" };
    const github: WorldGenRunner = { kind: "github-actions", repoSlug: "owner/repo", workflowFile: "worldgen.yml" };

    it("includes create-server and package-output for every runner", () => {
        for (const runner of [local, github]) {
            const plan = buildGenerationPlan(withVersion(), runner);
            const kinds = plan.steps.map((s) => s.kind);
            expect(kinds).toContain("create-server");
            expect(kinds).toContain("package-output");
        }
    });

    it("uses launch-server and stop-server for the local runner, not the GitHub Actions steps", () => {
        const plan = buildGenerationPlan(withVersion(), local);
        const kinds = plan.steps.map((s) => s.kind);
        expect(kinds).toContain("launch-server");
        expect(kinds).toContain("stop-server");
        expect(kinds).not.toContain("dispatch-github-workflow");
        expect(kinds).not.toContain("await-workflow-completion");
    });

    it("uses dispatch-github-workflow and await-workflow-completion for the GitHub Actions runner, not the local steps", () => {
        const plan = buildGenerationPlan(withVersion(), github);
        const kinds = plan.steps.map((s) => s.kind);
        expect(kinds).toContain("dispatch-github-workflow");
        expect(kinds).toContain("download-artifact");
        expect(kinds).not.toContain("launch-server");
        expect(kinds).not.toContain("stop-server");
    });

    it("names the exact existing module each reused step calls", () => {
        const plan = buildGenerationPlan(withVersion(), local);
        const createStep = plan.steps.find((s) => s.kind === "create-server");
        expect(createStep?.reuses).toBe("mcserver/create.ts");
        const planGithub = buildGenerationPlan(withVersion(), github);
        const dispatchStep = planGithub.steps.find((s) => s.kind === "dispatch-github-workflow");
        expect(dispatchStep?.reuses).toContain("cirender/gh.ts");
    });

    it("includes run-console-commands only when there is something to send", () => {
        // The default settings always send gamerule commands, so this step is always present.
        const plan = buildGenerationPlan(withVersion(), local);
        expect(plan.steps.map((s) => s.kind)).toContain("run-console-commands");
    });

    it("lists overworld plus only the enabled extra dimensions", () => {
        const plan = buildGenerationPlan(
            withVersion({ dimensions: { overworld: true, nether: true, end: false } }),
            local,
        );
        expect(plan.dimensionsToPackage).toEqual(["overworld", "nether"]);
    });

    it("carries the output destination through unchanged", () => {
        const plan = buildGenerationPlan(withVersion({ outputDestination: "D:/worlds/out.zip" }), local);
        expect(plan.outputPath).toBe("D:/worlds/out.zip");
    });

    it("every step kind that actually executes something is in UNWIRED_STEP_KINDS", () => {
        // This is the honesty guard: every step whose description implies real action
        // (launching a process, dispatching a workflow, writing bytes to disk) must be
        // named in UNWIRED_STEP_KINDS so the UI can render the boundary truthfully.
        const executionKinds: readonly string[] = [
            "launch-server",
            "dispatch-github-workflow",
            "await-world-ready",
            "run-console-commands",
            "pregenerate-chunks",
            "stop-server",
            "await-workflow-completion",
            "download-artifact",
            "package-output",
        ];
        for (const kind of executionKinds) {
            expect(UNWIRED_STEP_KINDS).toContain(kind);
        }
    });

    it("does NOT list create-server or write-server-properties as unwired (those genuinely exist)", () => {
        expect(UNWIRED_STEP_KINDS).not.toContain("create-server");
        expect(UNWIRED_STEP_KINDS).not.toContain("write-server-properties");
        expect(UNWIRED_STEP_KINDS).not.toContain("resolve-catalogue-version");
    });
});
