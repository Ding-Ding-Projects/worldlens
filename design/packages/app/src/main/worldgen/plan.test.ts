import { describe, expect, it } from "vitest";

import { defaultWorldGenerationSettings, type WorldGenerationSettings } from "./settings.js";
import { buildGenerationPlan } from "./plan.js";
import type { RunnerChoice } from "./runner.js";

const LOCAL_RUNNER: RunnerChoice = { kind: "transport", transport: { kind: "local-process", serverDir: "/srv/x" } };

function validSettings(overrides: Partial<WorldGenerationSettings> = {}): WorldGenerationSettings {
    return {
        ...defaultWorldGenerationSettings(),
        version: "1.21.4",
        output: { kind: "folder", destination: "/tmp/out" },
        ...overrides,
    };
}

describe("buildGenerationPlan", () => {
    it("refuses an invalid settings object and surfaces every error", () => {
        const result = buildGenerationPlan(validSettings({ worldName: "" }), LOCAL_RUNNER);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.some((e) => e.field === "worldName")).toBe(true);
    });

    it("builds server.properties for a default world with a chosen numeric seed", () => {
        const result = buildGenerationPlan(validSettings({ seed: { mode: "chosen", text: "42" } }), LOCAL_RUNNER);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.plan.serverProperties["level-seed"]).toBe("42");
        expect(result.plan.serverProperties["level-type"]).toBe("minecraft:normal");
        expect(result.plan.serverProperties["generator-settings"]).toBeUndefined();
    });

    it("carries the encoded superflat preset for a flat world", () => {
        const result = buildGenerationPlan(validSettings({ worldType: "flat" }), LOCAL_RUNNER);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.plan.serverProperties["generator-settings"]).toBe(
            "minecraft:bedrock;minecraft:dirt*2;minecraft:grass_block",
        );
        expect(result.plan.serverProperties["level-type"]).toBe("minecraft:flat");
    });

    it("omits level-seed when the seed is random", () => {
        const result = buildGenerationPlan(validSettings({ seed: { mode: "random", text: "" } }), LOCAL_RUNNER);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.plan.serverProperties["level-seed"]).toBeUndefined();
    });

    it("lists only the enabled dimensions", () => {
        const result = buildGenerationPlan(
            validSettings({ dimensions: { overworld: true, nether: false, end: true } }),
            LOCAL_RUNNER,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.plan.dimensionsToKeep).toEqual(["overworld", "the_end"]);
    });

    it("scales the estimate by how many dimensions are enabled", () => {
        const one = buildGenerationPlan(validSettings({ dimensions: { overworld: true, nether: false, end: false } }), LOCAL_RUNNER);
        const three = buildGenerationPlan(validSettings({ dimensions: { overworld: true, nether: true, end: true } }), LOCAL_RUNNER);
        expect(one.ok && three.ok).toBe(true);
        if (!one.ok || !three.ok) return;
        expect(three.plan.estimate.chunkCount).toBe(one.plan.estimate.chunkCount * 3);
    });

    it("carries a bonus chest and world border into server.properties when enabled", () => {
        const result = buildGenerationPlan(
            validSettings({ bonusChest: true, worldBorder: { enabled: true, diameterBlocks: 2000 } }),
            LOCAL_RUNNER,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.plan.serverProperties["bonus-chest"]).toBe("true");
        expect(result.plan.serverProperties["max-world-size"]).toBe("1000");
    });

    it("labels a GitHub Actions runner correctly", () => {
        const runner: RunnerChoice = { kind: "github-actions", owner: "acme", repo: "worlds", workflowFile: "generate-world.yml" };
        const result = buildGenerationPlan(validSettings(), runner);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.plan.runnerLabel).toBe("GitHub Actions (acme/worlds)");
        expect(result.plan.runnerKey).toBe("github-actions:acme/worlds");
    });
});
