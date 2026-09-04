import { describe, expect, it } from "vitest";
import { appMessage } from "./appVoice.js";
import { APP_FIXED, APP_VOICED } from "./appCopy.js";
import { MEASUREDWORLDGEN_FIXED, MEASUREDWORLDGEN_VOICED, MEASUREDWORLDGEN_FACTS } from "./surfaces/measuredWorldgen.js";

const fixedKeys = ["target", "preset1", "preset10", "targets", "resume", "stop", "generate", "generating"] as const;
const voicedKeys = ["notice", "paused", "progress", "result", "failed"] as const;
const levels = [1, 2, 3, 4, 5] as const;

describe("measured generation copy", () => {
    it("registers every required control and message in the shared catalogue", () => {
        expect(Object.keys(MEASUREDWORLDGEN_FIXED)).toEqual(["world.screen.generateTestWorld", ...fixedKeys.map((key) => "worldgen.measured." + key)]);
        expect(Object.keys(MEASUREDWORLDGEN_VOICED)).toEqual(["world.screen.generator", ...voicedKeys.map((key) => "worldgen.measured." + key)]);
        expect(APP_FIXED["world.screen.generateTestWorld"]).toEqual(MEASUREDWORLDGEN_FIXED["world.screen.generateTestWorld"]);
        expect(APP_VOICED["world.screen.generator"]).toEqual(MEASUREDWORLDGEN_VOICED["world.screen.generator"]);
        for (const key of fixedKeys) expect(APP_FIXED[`worldgen.measured.${key}`]).toEqual(MEASUREDWORLDGEN_FIXED[`worldgen.measured.${key}`]);
        for (const key of voicedKeys) expect(APP_VOICED[`worldgen.measured.${key}`]).toEqual(MEASUREDWORLDGEN_VOICED[`worldgen.measured.${key}`]);
    });

    it("honours all three modes and both independent five-level settings without losing facts", () => {
        for (const funnyEn of levels) for (const funnyYue of levels) for (const mode of ["en", "yue", "bilingual"] as const) {
            const entry = MEASUREDWORLDGEN_VOICED["world.screen.generator"];
            expect(appMessage("world.screen.generator", { mode, funnyEn, funnyYue })).toBe(mode === "bilingual" ? `${entry.en[funnyEn - 1]}\n${entry.yue[funnyYue - 1]}` : mode === "en" ? entry.en[funnyEn - 1] : entry.yue[funnyYue - 1]);
            const button = MEASUREDWORLDGEN_FIXED["world.screen.generateTestWorld"];
            expect(appMessage("world.screen.generateTestWorld", { mode, funnyEn, funnyYue })).toBe(mode === "bilingual" ? `${button.en}\n${button.yue}` : button[mode]);
            for (const key of voicedKeys) {
                const id = `worldgen.measured.${key}` as const;
                const entry = MEASUREDWORLDGEN_VOICED[id];
                const text = appMessage(id, { mode, funnyEn, funnyYue });
                const expected = mode === "en" ? entry.en[funnyEn - 1] : mode === "yue" ? entry.yue[funnyYue - 1] : `${entry.en[funnyEn - 1]}\n${entry.yue[funnyYue - 1]}`;
                expect(text).toBe(expected);
                for (const language of mode === "bilingual" ? ["en", "yue"] as const : [mode]) {
                    for (const fact of MEASUREDWORLDGEN_FACTS[id][language]) expect(text).toContain(fact);
                }
            }
            for (const key of fixedKeys) {
                const id = `worldgen.measured.${key}` as const;
                const entry = MEASUREDWORLDGEN_FIXED[id];
                expect(appMessage(id, { mode, funnyEn, funnyYue })).toBe(mode === "bilingual" ? `${entry.en}\n${entry.yue}` : entry[mode]);
            }
        }
    });

    it("gives each language five real voice levels and retains exact decimal presets", () => {
        for (const entry of Object.values(MEASUREDWORLDGEN_VOICED)) {
            expect(new Set(entry.en).size).toBe(5);
            expect(new Set(entry.yue).size).toBe(5);
        }
        for (const language of ["en", "yue"] as const) {
            expect(MEASUREDWORLDGEN_FIXED["worldgen.measured.preset1"][language]).toContain("1,000,000,000");
            expect(MEASUREDWORLDGEN_FIXED["worldgen.measured.preset10"][language]).toContain("10,000,000,000");
        }
    });
});
