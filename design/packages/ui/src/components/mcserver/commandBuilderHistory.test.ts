import { describe, expect, it } from "vitest";
import { addPreset, pushHistory, removePreset } from "./commandBuilderHistory.js";

describe("pushHistory", () => {
    it("prepends the newest entry", () => {
        const h = pushHistory([], "/give @p minecraft:diamond 1", 1);
        expect(h).toEqual([{ text: "/give @p minecraft:diamond 1", at: 1 }]);
    });
    it("ignores a blank command", () => {
        expect(pushHistory([{ text: "/kill", at: 1 }], "   ", 2)).toEqual([{ text: "/kill", at: 1 }]);
    });
    it("collapses an immediate repeat rather than listing it twice", () => {
        const h = pushHistory([{ text: "/kill", at: 1 }], "/kill", 2);
        expect(h).toEqual([{ text: "/kill", at: 2 }]);
    });
    it("caps history at 100 entries", () => {
        let h: readonly { text: string; at: number }[] = [];
        for (let i = 0; i < 150; i++) h = pushHistory(h, `/say ${i}`, i);
        expect(h.length).toBe(100);
        expect(h[0]?.text).toBe("/say 149");
    });
});

describe("presets", () => {
    it("adds a preset with a generated id", () => {
        const presets = addPreset([], "Heal me", "/effect give @s minecraft:regeneration 5 5");
        expect(presets.length).toBe(1);
        expect(presets[0]?.name).toBe("Heal me");
        expect(presets[0]?.id).toBeTruthy();
    });
    it("refuses a blank name or text", () => {
        expect(addPreset([], "", "/kill")).toEqual([]);
        expect(addPreset([], "Kill", "  ")).toEqual([]);
    });
    it("removes a preset by id", () => {
        const withOne = addPreset([], "Kill", "/kill");
        const id = withOne[0]!.id;
        expect(removePreset(withOne, id)).toEqual([]);
        expect(removePreset(withOne, "nonexistent")).toEqual(withOne);
    });
});
