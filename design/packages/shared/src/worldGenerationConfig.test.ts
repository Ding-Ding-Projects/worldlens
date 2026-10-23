import { describe, expect, it } from "vitest";
import {
    WORLDGEN_CONFIG_INPUT,
    WORLDGEN_WORKFLOW_FILE,
    WORLD_GENERATION_CONFIG_VERSION,
    buildWorldGenerationConfig,
    parseWorldGenerationConfig,
    parseWorldGenerationConfigText,
    worldGenerationFormatFor,
    worldGenerationSize,
    worldgenCliArgumentsFor,
    worldgenDispatchInputs,
    type WorldGenerationChoices,
} from "./worldGenerationConfig.js";

const choices: WorldGenerationChoices = {
    engine: "synthetic",
    seed: 20261023,
    worldName: " gui-test-world ",
    pregenerationRadius: 500,
    version: "1.21.4",
    outputMode: "folder",
    flavour: "vanilla",
    worldType: "default",
    generateStructures: true,
    dimensions: { overworld: true, nether: false, end: false },
};

describe("buildWorldGenerationConfig", () => {
    it("builds the document the dialog defaults produce", () => {
        const config = buildWorldGenerationConfig(choices);
        expect(config).toEqual({
            version: WORLD_GENERATION_CONFIG_VERSION,
            engine: "synthetic",
            seed: 20261023,
            size: 1000,
            worldName: "gui-test-world",
            format: "1.20.4",
            outputMode: "folder",
            source: {
                flavour: "vanilla",
                version: "1.21.4",
                pregenerationRadius: 500,
                worldType: "default",
                generateStructures: true,
                dimensions: { overworld: true, nether: false, end: false },
            },
        });
        // The document it builds is the document it accepts: the GUI and the runner agree.
        expect(parseWorldGenerationConfig(JSON.parse(JSON.stringify(config)))).toEqual({
            ok: true,
            config,
        });
    });

    it("computes the square exactly as the dialog does", () => {
        expect(worldGenerationSize(500)).toBe(1000);
        expect(worldGenerationSize(3)).toBe(16);
        expect(worldGenerationSize(-10)).toBe(16);
        expect(worldGenerationSize(Number.NaN)).toBe(16);
        expect(worldGenerationSize(7.9)).toBe(16);
    });

    it("selects the legacy format only for 1.12 versions", () => {
        expect(worldGenerationFormatFor("1.12.2")).toBe("1.12.2");
        expect(worldGenerationFormatFor("1.12")).toBe("1.12.2");
        expect(worldGenerationFormatFor("1.21.4")).toBe("1.20.4");
        expect(worldGenerationFormatFor("1.120")).toBe("1.20.4");
        expect(worldGenerationFormatFor("")).toBe("1.20.4");
    });
});

describe("parseWorldGenerationConfig", () => {
    const valid = buildWorldGenerationConfig(choices);

    it.each([
        [{ ...valid, extra: 1 }, "Unknown field 'extra'"],
        [{ ...valid, version: 2 }, "'version' must be 1"],
        [{ ...valid, engine: "paper" }, "'engine' must be one of"],
        [{ ...valid, seed: 1.5 }, "'seed' must be a whole number"],
        [{ ...valid, size: 15 }, "'size' must be a whole number from 16 to 40000"],
        [{ ...valid, size: 40_001 }, "'size' must be a whole number from 16 to 40000"],
        [{ ...valid, worldName: "../escape" }, "'worldName' may use"],
        [{ ...valid, worldName: "" }, "'worldName' may use"],
        [{ ...valid, format: "1.21.4" }, "'format' must be one of"],
        [{ ...valid, outputMode: "tar" }, "'outputMode' must be one of"],
        [{ ...valid, source: null }, "'source' must be an object"],
        [
            { ...valid, source: { ...valid.source, generateStructures: "yes" } },
            "'source.generateStructures'",
        ],
        [
            {
                ...valid,
                source: {
                    ...valid.source,
                    dimensions: { overworld: false, nether: false, end: false },
                },
            },
            "'source.dimensions'",
        ],
        ["not an object", "must be a JSON object"],
        [[valid], "must be a JSON object"],
    ])("refuses %j", (value, message) => {
        const result = parseWorldGenerationConfig(value);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.message).toContain(message);
    });

    it("parses text and names bad JSON as such", () => {
        expect(parseWorldGenerationConfigText(JSON.stringify(valid))).toEqual({
            ok: true,
            config: valid,
        });
        expect(parseWorldGenerationConfigText("{")).toEqual({
            ok: false,
            message: "The generation configuration is not valid JSON.",
        });
    });

    it("accepts a vanilla-server document but offers it no CLI arguments", () => {
        const vanilla = buildWorldGenerationConfig({ ...choices, engine: "vanilla-server" });
        expect(parseWorldGenerationConfig(vanilla).ok).toBe(true);
        expect(worldgenCliArgumentsFor(vanilla)).toBeNull();
    });
});

describe("worldgen dispatch", () => {
    it("names the workflow file and turns the document into the CLI's exact flags", () => {
        expect(WORLDGEN_WORKFLOW_FILE).toBe("worldgen.yml");
        const config = buildWorldGenerationConfig({
            ...choices,
            version: "1.12.2",
            pregenerationRadius: 64,
        });
        expect(worldgenCliArgumentsFor(config)).toEqual([
            "--seed",
            "20261023",
            "--size",
            "128",
            "--format",
            "1.12.2",
            "--name",
            "gui-test-world",
        ]);
    });

    it("produces string-only workflow_dispatch inputs", () => {
        const config = buildWorldGenerationConfig(choices);
        const inputs = worldgenDispatchInputs(config, {
            render: true,
            publish: "release-asset",
            dispatchRender: true,
        });
        expect(Object.keys(inputs).sort()).toEqual(
            [WORLDGEN_CONFIG_INPUT, "dispatch-render", "publish", "render"].sort(),
        );
        expect(inputs.render).toBe("true");
        expect(inputs.publish).toBe("release-asset");
        expect(inputs["dispatch-render"]).toBe("true");
        expect(JSON.parse(inputs[WORLDGEN_CONFIG_INPUT]!)).toEqual(config);
        for (const value of Object.values(inputs)) expect(typeof value).toBe("string");
    });
});
