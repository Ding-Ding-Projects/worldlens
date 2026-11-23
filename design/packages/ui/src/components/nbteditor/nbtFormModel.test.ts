import { describe, expect, it } from "vitest";
import type { NodeView, TagKind } from "./nbtEditorBridge.js";
import { buildSections, filterSections, pickBase } from "./nbtFormModel.js";

let next = 1;
function n(kind: TagKind, name: string, text = "", isBool = false): NodeView {
    return {
        id: next++,
        kind,
        name,
        text,
        summary: "",
        childCount: 0,
        listKind: null,
        isBool,
        valueLength: text.length,
    };
}

describe("settings form layout", () => {
    it("starts from Data in a classic level.dat and from the root otherwise", () => {
        const data = n("compound", "Data");
        expect(pickBase([data])).toBe(data);
        expect(pickBase([n("int", "DataVersion", "1"), data])).toBe(data);
        expect(pickBase([n("byte", "keep_inventory", "1", true)])).toBeNull();
    });

    it("groups values into named sections in reading order, groups after", () => {
        const members = [
            n("int", "SpawnX", "1"),
            n("string", "LevelName", "w"),
            n("long", "DayTime", "0"),
            n("double", "BorderSize", "1"),
            n("int", "DataVersion", "4189"),
            n("list", "ServerBrands"),
            n("int", "Mystery", "3"),
        ];
        const rules = n("compound", "GameRules");
        const sections = buildSections(
            members,
            ["Data"],
            [
                {
                    node: rules,
                    children: [n("string", "keepInventory", "true"), n("compound", "Deeper")],
                },
            ],
        );
        expect(sections.map((s) => s.title)).toEqual([
            "World",
            "Spawn",
            "Time and weather",
            "World border",
            "Other values",
            "Game rules",
            "About this file",
        ]);
        expect(sections.find((s) => s.id === "other")?.elsewhere).toBe(1);
        const ruleSection = sections.find((s) => s.title === "Game rules")!;
        expect(ruleSection.fields.map((f) => f.info.label)).toEqual(["Keep inventory on death"]);
        expect(ruleSection.elsewhere).toBe(1);
        expect(ruleSection.fields[0]!.info.control).toEqual({ type: "switch", stringBool: true });
    });

    it("lays out a 26.1 game_rules.dat from its root", () => {
        const sections = buildSections(
            [n("byte", "keep_inventory", "0", true), n("int", "random_tick_speed", "3")],
            [],
            [],
        );
        expect(sections).toHaveLength(1);
        expect(sections[0]!.fields.map((f) => f.info.label)).toEqual([
            "Keep inventory on death",
            "Random tick speed",
        ]);
    });

    it("filters by readable label, game key or readable value", () => {
        const sections = buildSections(
            [n("int", "GameType", "1"), n("int", "SpawnX", "5")],
            ["Data"],
            [],
        );
        const by = (q: string) => filterSections(sections, (t) => t.toLowerCase().includes(q));
        expect(by("creative").flatMap((s) => s.fields.map((f) => f.node.name))).toEqual([
            "GameType",
        ]);
        expect(by("spawnx").flatMap((s) => s.fields.map((f) => f.node.name))).toEqual(["SpawnX"]);
        expect(by("nothing-like-this")).toEqual([]);
        expect(filterSections(sections, null)).toHaveLength(sections.length);
    });
});
