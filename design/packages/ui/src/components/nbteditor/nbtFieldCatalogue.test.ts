import { describe, expect, it } from "vitest";
import type { NodeView, TagKind } from "./nbtEditorBridge.js";
import {
    clockFor,
    durationFor,
    fieldInfo,
    hexForRgb,
    humanizeKey,
    normalizeKey,
    readableResource,
    readableValue,
    rgbForHex,
} from "./nbtFieldCatalogue.js";

function node(kind: TagKind, name: string | null, text: string, isBool = false): NodeView {
    return {
        id: 1,
        kind,
        name,
        text,
        summary: `${kind} summary`,
        childCount: 0,
        listKind: null,
        isBool,
        valueLength: text.length,
    };
}

describe("readable names", () => {
    it("splits game keys into words", () => {
        expect(humanizeKey("SpawnX")).toBe("Spawn X");
        expect(humanizeKey("keep_inventory")).toBe("Keep inventory");
        expect(humanizeKey("xPos")).toBe("X pos");
        expect(humanizeKey("UUID")).toBe("UUID");
        expect(humanizeKey("minecraft:custom_name")).toBe("Custom name");
    });

    it("matches keys across the 1.21.11 and 26.1 renames", () => {
        expect(normalizeKey("keepInventory")).toBe(normalizeKey("keep_inventory"));
        expect(normalizeKey("rainTime")).toBe(normalizeKey("rain_time"));
        expect(fieldInfo(node("byte", "keep_inventory", "1", true), ["game_rules"]).label).toBe(
            "Keep inventory on death",
        );
    });

    it("names resource ids the way the game shows them", () => {
        expect(readableResource("minecraft:diamond_pickaxe")).toBe("Diamond Pickaxe");
        expect(readableResource("create:brass_ingot")).toBe("Brass Ingot (create)");
        expect(readableResource("not an id")).toBe("not an id");
    });
});

describe("tailored controls", () => {
    it("gives game mode and both difficulty eras a choice by name", () => {
        const gm = fieldInfo(node("int", "GameType", "1"), ["Data"]);
        expect(gm.control.type).toBe("choice");
        expect(readableValue(node("int", "GameType", "1"), gm)).toBe("Creative");
        const oldDiff = fieldInfo(node("byte", "Difficulty", "2"), ["Data"]);
        expect(readableValue(node("byte", "Difficulty", "2"), oldDiff)).toBe("Normal");
        const newDiff = fieldInfo(node("string", "difficulty", "hard"), ["difficulty_settings"]);
        expect(newDiff.control.type).toBe("choice");
        expect(readableValue(node("string", "difficulty", "hard"), newDiff)).toBe("Hard");
    });

    it("uses a switch for yes-or-no bytes and for true/false strings", () => {
        expect(fieldInfo(node("byte", "hardcore", "0", true), ["Data"]).control).toEqual({
            type: "switch",
        });
        const rule = fieldInfo(node("string", "keepInventory", "true"), ["GameRules"]);
        expect(rule.control).toEqual({ type: "switch", stringBool: true });
        expect(readableValue(node("string", "keepInventory", "true"), rule)).toBe("Yes");
    });

    it("shows time of day as a clock and durations as minutes", () => {
        const day = fieldInfo(node("long", "DayTime", "30000"), ["Data"]);
        expect(day.control.type).toBe("timeOfDay");
        expect(readableValue(node("long", "DayTime", "30000"), day)).toBe("12:00, day 2");
        const rain = fieldInfo(node("int", "rain_time", "7250"), []);
        expect(rain.control.type).toBe("duration");
        expect(readableValue(node("int", "rain_time", "7250"), rain)).toBe("6 min 2 s");
    });

    it("gives dye colours a colour picker in every item layout", () => {
        expect(fieldInfo(node("int", "color", "16711680"), ["tag", "display"]).control.type).toBe(
            "color",
        );
        expect(
            fieldInfo(node("int", "rgb", "16711680"), ["components", "minecraft:dyed_color"])
                .control.type,
        ).toBe("color");
        expect(
            fieldInfo(node("int", "minecraft:dyed_color", "16711680"), ["components"]).control.type,
        ).toBe("color");
        // A tropical fish's Color is a variant number, not a colour: no picker there.
        expect(fieldInfo(node("int", "Color", "3"), ["Entities"]).control.type).toBe("stepper");
    });

    it("bounds steppers and sliders to what the game accepts", () => {
        expect(fieldInfo(node("byte", "Count", "64"), ["Item"]).control).toMatchObject({
            type: "stepper",
            min: 1,
            max: 99,
        });
        expect(fieldInfo(node("int", "foodLevel", "18"), []).control).toMatchObject({
            type: "slider",
            min: 0,
            max: 20,
        });
        expect(
            fieldInfo(node("int", "playersSleepingPercentage", "100"), []).control,
        ).toMatchObject({ type: "slider", max: 100, unit: "%" });
    });

    it("falls back to a typed control with the type's own range", () => {
        expect(fieldInfo(node("short", "SomethingNew", "5"), []).control).toMatchObject({
            type: "stepper",
            min: -32768,
            max: 32767,
        });
        expect(fieldInfo(node("string", "CustomField", "hello"), []).control).toEqual({
            type: "text",
        });
        expect(fieldInfo(node("string", "Dimension", "minecraft:the_nether"), []).control).toEqual({
            type: "resource",
        });
    });
});

describe("value helpers", () => {
    it("converts colours both ways, including negative ints", () => {
        expect(hexForRgb(16711680)).toBe("#FF0000");
        expect(hexForRgb(-1)).toBe("#FFFFFF");
        expect(rgbForHex("#00ff00")).toBe(65280);
        expect(rgbForHex("green")).toBeNull();
    });

    it("reads the clock the way the game does", () => {
        expect(clockFor(0)).toBe("06:00");
        expect(clockFor(18000)).toBe("00:00");
        expect(durationFor(0)).toBe("0 s");
        expect(durationFor(20 * 3600)).toBe("1 h");
    });
});
