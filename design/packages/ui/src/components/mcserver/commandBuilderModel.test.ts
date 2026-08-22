import { describe, expect, it } from "vitest";
import {
    axisToken,
    buildCommand,
    buildExecuteCommand,
    coord3Tokens,
    formById,
    makeAxis,
    makeCoord3,
    makeTwoCornerSelection,
    resetTwoCornerSelection,
    selectTwoCorner,
    toggleCoordinatePickMode,
    makeExecuteClause,
    makeTargetSelector,
    selectorError,
    selectorToken,
    COMMAND_FORMS,
    type ExecuteClause,
    type TargetSelector,
} from "./commandBuilderModel.js";

describe("two-corner map picking", () => {
    it("assigns clicks to corner 1 then corner 2, restarting on a third click", () => {
        const a = makeCoord3(1, 64, 2);
        const b = makeCoord3(5, 70, 8);
        const c = makeCoord3(9, 72, 13);
        let selected = makeTwoCornerSelection();
        selected = selectTwoCorner(selected, a);
        expect(selected).toEqual({ corner1: a, corner2: null });
        selected = selectTwoCorner(selected, b);
        expect(selected).toEqual({ corner1: a, corner2: b });
        expect(selectTwoCorner(selected, c)).toEqual({ corner1: c, corner2: null });
    });

    it("resets both corners", () => {
        const selected = selectTwoCorner(selectTwoCorner(makeTwoCornerSelection(), makeCoord3(1, 2, 3)), makeCoord3(4, 5, 6));
        expect(resetTwoCornerSelection()).toEqual({ corner1: null, corner2: null });
        expect(selected.corner1).not.toBeNull();
    });

    it("switches between map and manual modes without changing the selected corners", () => {
        expect(toggleCoordinatePickMode("manual")).toBe("map");
        expect(toggleCoordinatePickMode("map")).toBe("manual");
    });
});

describe("axisToken / coord3Tokens", () => {
    it("renders an absolute coordinate as a plain number", () => {
        expect(axisToken(makeAxis("abs", 12))).toBe("12");
        expect(axisToken(makeAxis("abs", -3.5))).toBe("-3.5");
    });
    it("renders a relative coordinate with a bare tilde at zero", () => {
        expect(axisToken(makeAxis("rel", 0))).toBe("~");
        expect(axisToken(makeAxis("rel", 4))).toBe("~4");
        expect(axisToken(makeAxis("rel", -2))).toBe("~-2");
    });
    it("renders a local coordinate with a caret", () => {
        expect(axisToken(makeAxis("local", 0))).toBe("^");
        expect(axisToken(makeAxis("local", 1.25))).toBe("^1.25");
    });
    it("joins three axes with spaces, independently moded", () => {
        const c = makeCoord3(1, 2, 3);
        expect(coord3Tokens(c)).toBe("1 2 3");
        expect(coord3Tokens({ x: makeAxis("rel", 1), y: makeAxis("abs", 64), z: makeAxis("local", -1) })).toBe("~1 64 ^-1");
    });
});

describe("selectorToken", () => {
    it("renders a bare selector with no arguments", () => {
        expect(selectorToken(makeTargetSelector("p"))).toBe("@p");
        expect(selectorToken(makeTargetSelector("a"))).toBe("@a");
        expect(selectorToken(makeTargetSelector("r"))).toBe("@r");
        expect(selectorToken(makeTargetSelector("e"))).toBe("@e");
        expect(selectorToken(makeTargetSelector("s"))).toBe("@s");
    });
    it("renders a plain player name for the name kind", () => {
        const sel: TargetSelector = { kind: "name", playerName: "Notch", args: {} };
        expect(selectorToken(sel)).toBe("Notch");
    });
    it("renders every selector argument in the bracketed form", () => {
        const sel: TargetSelector = {
            kind: "e",
            args: {
                type: "minecraft:zombie",
                distance: "..10",
                limit: 5,
                sort: "nearest",
                gamemode: "survival",
                team: "red",
                tags: ["boss", "arena"],
                scores: [{ objective: "kills", range: "1.." }],
                name: "Bob",
                x: 1,
                y: 2,
                z: 3,
                dx: 4,
                dy: 5,
                dz: 6,
                nbt: "{Health:20f}",
            },
        };
        const token = selectorToken(sel);
        expect(token).toContain("@e[");
        expect(token).toContain("type=minecraft:zombie");
        expect(token).toContain("distance=..10");
        expect(token).toContain("limit=5");
        expect(token).toContain("sort=nearest");
        expect(token).toContain("gamemode=survival");
        expect(token).toContain("team=red");
        expect(token).toContain("tag=boss");
        expect(token).toContain("tag=arena");
        expect(token).toContain("score_kills=1..");
        expect(token).toContain("name=Bob");
        expect(token).toContain("x=1");
        expect(token).toContain("dx=4");
        expect(token).toContain("nbt={Health:20f}");
    });
    it("negates type, gamemode and team when the exclude flags are set", () => {
        const sel: TargetSelector = { kind: "e", args: { type: "minecraft:pig", typeExclude: true, gamemode: "creative", gamemodeExclude: true, team: "blue", teamExclude: true } };
        const token = selectorToken(sel);
        expect(token).toContain("type=!minecraft:pig");
        expect(token).toContain("gamemode=!creative");
        expect(token).toContain("team=!blue");
    });
    it("drops blank tags rather than emitting tag=", () => {
        const sel: TargetSelector = { kind: "e", args: { tags: ["", "  ", "real"] } };
        expect(selectorToken(sel)).toBe("@e[tag=real]");
    });
});

describe("selectorError", () => {
    it("requires a name for the name kind", () => {
        expect(selectorError({ kind: "name", playerName: "", args: {} })).toBeTruthy();
        expect(selectorError({ kind: "name", playerName: "  ", args: {} })).toBeTruthy();
    });
    it("rejects an invalid Minecraft name", () => {
        expect(selectorError({ kind: "name", playerName: "not a name!", args: {} })).toBeTruthy();
    });
    it("accepts a valid name and any selector kind with no name", () => {
        expect(selectorError({ kind: "name", playerName: "Steve_1", args: {} })).toBeNull();
        expect(selectorError(makeTargetSelector("p"))).toBeNull();
    });
});

describe("buildCommand: give", () => {
    it("builds the full /give command", () => {
        const target = makeTargetSelector("p");
        const result = buildCommand("give", { target, item: "minecraft:diamond", count: 4 });
        expect(result.errors).toEqual([]);
        expect(result.text).toBe("/give @p minecraft:diamond 4");
    });
    it("reports a missing item as an error, naming the exact field", () => {
        const result = buildCommand("give", { target: makeTargetSelector("p"), item: "", count: 1 });
        expect(result.errors).toContain("Item is required.");
    });
    it("reports a missing target as an error", () => {
        const result = buildCommand("give", { item: "minecraft:diamond", count: 1 });
        expect(result.errors.some((e) => e.includes("Target is required"))).toBe(true);
    });
});

describe("buildCommand: summon", () => {
    it("builds with a position and no NBT", () => {
        const result = buildCommand("summon", { entity: "minecraft:zombie", position: makeCoord3(10, 64, -5) });
        expect(result.text).toBe("/summon minecraft:zombie 10 64 -5");
        expect(result.errors).toEqual([]);
    });
    it("appends NBT data when provided", () => {
        const result = buildCommand("summon", { entity: "minecraft:zombie", position: makeCoord3(0, 0, 0), nbt: "{CustomName:'\"Boss\"'}" });
        expect(result.text).toBe("/summon minecraft:zombie 0 0 0 {CustomName:'\"Boss\"'}");
    });
});

describe("buildCommand: tp variants", () => {
    it("teleports a target to another entity", () => {
        const result = buildCommand("tp", { target: makeTargetSelector("p"), destination: makeTargetSelector("r") });
        expect(result.text).toBe("/teleport @p @r");
    });
    it("teleports a target to coordinates with relative axes", () => {
        const pos = { x: makeAxis("rel", 0), y: makeAxis("abs", 100), z: makeAxis("rel", 5) };
        const result = buildCommand("tp_coords", { target: makeTargetSelector("p"), position: pos });
        expect(result.text).toBe("/teleport @p ~ 100 ~5");
    });
});

describe("buildCommand: effect", () => {
    it("builds effect give with amplifier and hidden particles", () => {
        const result = buildCommand("effect_give", {
            target: makeTargetSelector("p"),
            effect: "minecraft:speed",
            seconds: 60,
            amplifier: 2,
            hideParticles: true,
        });
        expect(result.text).toBe("/effect give @p minecraft:speed 60 2 true");
    });
    it("builds effect clear with no effect specified (clears all)", () => {
        const result = buildCommand("effect_clear", { target: makeTargetSelector("a"), effect: "" });
        expect(result.text).toBe("/effect clear @a");
    });
    it("builds effect clear for one effect", () => {
        const result = buildCommand("effect_clear", { target: makeTargetSelector("a"), effect: "minecraft:poison" });
        expect(result.text).toBe("/effect clear @a minecraft:poison");
    });
});

describe("buildCommand: gamemode / kill / clear optional targets", () => {
    it("omits the optional target when none is set", () => {
        expect(buildCommand("gamemode", { mode: "creative" }).text).toBe("/gamemode creative");
        expect(buildCommand("kill", {}).text).toBe("/kill");
        expect(buildCommand("clear", {}).text).toBe("/clear");
    });
    it("includes the optional target when set", () => {
        expect(buildCommand("gamemode", { mode: "creative", target: makeTargetSelector("p") }).text).toBe("/gamemode creative @p");
        expect(buildCommand("kill", { target: makeTargetSelector("e") }).text).toBe("/kill @e");
    });
    it("clear includes item and max count only when the item is set", () => {
        expect(buildCommand("clear", { target: makeTargetSelector("p"), item: "minecraft:dirt", maxCount: 5 }).text).toBe("/clear @p minecraft:dirt 5");
        expect(buildCommand("clear", { target: makeTargetSelector("p"), maxCount: 5 }).text).toBe("/clear @p");
    });
});

describe("buildCommand: time / weather / difficulty / gamerule", () => {
    it("builds /time set and /time add", () => {
        expect(buildCommand("time_set", { value: "day" }).text).toBe("/time set day");
        expect(buildCommand("time_add", { ticks: 1000 }).text).toBe("/time add 1000");
    });
    it("builds /weather with and without duration", () => {
        expect(buildCommand("weather", { type: "rain" }).text).toBe("/weather rain");
        expect(buildCommand("weather", { type: "rain", seconds: 30 }).text).toBe("/weather rain 30");
    });
    it("builds /difficulty", () => {
        expect(buildCommand("difficulty", { level: "hard" }).text).toBe("/difficulty hard");
    });
    it("builds /gamerule as a read (no value) and a write", () => {
        expect(buildCommand("gamerule", { rule: "keepInventory" }).text).toBe("/gamerule keepInventory");
        expect(buildCommand("gamerule", { rule: "keepInventory", value: "true" }).text).toBe("/gamerule keepInventory true");
    });
});

describe("buildCommand: enchant / xp", () => {
    it("builds /enchant", () => {
        expect(buildCommand("enchant", { target: makeTargetSelector("p"), enchantment: "minecraft:sharpness", level: 5 }).text).toBe("/enchant @p minecraft:sharpness 5");
    });
    it("builds xp add/set/query with units", () => {
        expect(buildCommand("xp_add", { target: makeTargetSelector("p"), amount: 10, unit: "levels" }).text).toBe("/xp add @p 10 levels");
        expect(buildCommand("xp_set", { target: makeTargetSelector("p"), amount: 100, unit: "points" }).text).toBe("/xp set @p 100 points");
        expect(buildCommand("xp_query", { target: makeTargetSelector("p"), unit: "levels" }).text).toBe("/xp query @p levels");
    });
});

describe("buildCommand: title", () => {
    it("builds a plain slot with text", () => {
        const result = buildCommand("title", { target: makeTargetSelector("a"), slot: "title", text: '"Hello"' });
        expect(result.text).toBe('/title @a title "Hello"');
    });
    it("requires text for a text slot", () => {
        const result = buildCommand("title", { target: makeTargetSelector("a"), slot: "subtitle", text: "" });
        expect(result.errors.length).toBeGreaterThan(0);
    });
    it("builds the times slot from three tick fields, ignoring text", () => {
        const result = buildCommand("title", { target: makeTargetSelector("a"), slot: "times", fadeIn: 5, stay: 40, fadeOut: 10 });
        expect(result.text).toBe("/title @a times 5 40 10");
    });
    it("builds clear/reset with no further arguments", () => {
        expect(buildCommand("title", { target: makeTargetSelector("a"), slot: "clear" }).text).toBe("/title @a clear");
        expect(buildCommand("title", { target: makeTargetSelector("a"), slot: "reset" }).text).toBe("/title @a reset");
    });
});

describe("buildCommand: playsound / particle", () => {
    it("builds a minimal playsound command", () => {
        const result = buildCommand("playsound", { sound: "minecraft:entity.player.levelup", source: "master", target: makeTargetSelector("p") });
        expect(result.text).toBe("/playsound minecraft:entity.player.levelup master @p");
    });
    it("adds position and volume/pitch only when supplied", () => {
        const result = buildCommand("playsound", {
            sound: "minecraft:entity.player.levelup",
            source: "master",
            target: makeTargetSelector("p"),
            position: makeCoord3(1, 2, 3),
            volume: 1,
            pitch: 1,
        });
        expect(result.text).toBe("/playsound minecraft:entity.player.levelup master @p 1 2 3 1 1");
    });
    it("builds particle with force and a viewer", () => {
        const result = buildCommand("particle", {
            particle: "minecraft:flame",
            position: makeCoord3(0, 64, 0),
            dx: 1,
            dy: 1,
            dz: 1,
            speed: 0.1,
            count: 20,
            force: true,
            viewer: makeTargetSelector("a"),
        });
        expect(result.text).toBe("/particle minecraft:flame 0 64 0 1 1 1 0.1 20 force @a");
    });
});

describe("buildCommand: setblock / fill / clone", () => {
    it("builds /setblock", () => {
        expect(buildCommand("setblock", { position: makeCoord3(1, 2, 3), block: "minecraft:stone", mode: "replace" }).text).toBe("/setblock 1 2 3 minecraft:stone replace");
    });
    it("builds /fill from two corners", () => {
        expect(buildCommand("fill", { from: makeCoord3(0, 0, 0), to: makeCoord3(5, 5, 5), block: "minecraft:glass", mode: "hollow" }).text).toBe("/fill 0 0 0 5 5 5 minecraft:glass hollow");
    });
    it("builds /clone with source, destination and both modes", () => {
        const result = buildCommand("clone", {
            from: makeCoord3(0, 0, 0),
            to: makeCoord3(2, 2, 2),
            dest: makeCoord3(10, 0, 0),
            maskMode: "masked",
            cloneMode: "force",
        });
        expect(result.text).toBe("/clone 0 0 0 2 2 2 10 0 0 masked force");
    });
});

describe("buildCommand: scoreboard / team / tag", () => {
    it("builds objectives add with a display name", () => {
        const result = buildCommand("scoreboard_objectives_add", { objective: "kills", criteria: "playerKillCount", displayName: '"Kills"' });
        expect(result.text).toBe('/scoreboard objectives add kills playerKillCount "Kills"');
    });
    it("builds players set/add", () => {
        expect(buildCommand("scoreboard_players_set", { target: makeTargetSelector("p"), objective: "kills", score: 5 }).text).toBe("/scoreboard players set @p kills 5");
        expect(buildCommand("scoreboard_players_add", { target: makeTargetSelector("p"), objective: "kills", score: 1 }).text).toBe("/scoreboard players add @p kills 1");
    });
    it("builds team add/join and tag add/remove", () => {
        expect(buildCommand("team_add", { team: "red" }).text).toBe("/team add red");
        expect(buildCommand("team_join", { team: "red", target: makeTargetSelector("p") }).text).toBe("/team join red @p");
        expect(buildCommand("tag_add", { target: makeTargetSelector("p"), tag: "vip" }).text).toBe("/tag @p add vip");
        expect(buildCommand("tag_remove", { target: makeTargetSelector("p"), tag: "vip" }).text).toBe("/tag @p remove vip");
    });
});

describe("buildCommand: advancement", () => {
    it("omits the id for scope 'everything'", () => {
        expect(buildCommand("advancement_grant", { target: makeTargetSelector("p"), scope: "everything" }).text).toBe("/advancement grant @p everything");
    });
    it("requires and includes the id for a narrower scope", () => {
        const missing = buildCommand("advancement_grant", { target: makeTargetSelector("p"), scope: "only", advancement: "" });
        expect(missing.errors.length).toBeGreaterThan(0);
        const ok = buildCommand("advancement_revoke", { target: makeTargetSelector("p"), scope: "only", advancement: "minecraft:story/root" });
        expect(ok.text).toBe("/advancement revoke @p only minecraft:story/root");
    });
});

describe("buildCommand: attribute", () => {
    it("builds get and base set", () => {
        expect(buildCommand("attribute_get", { target: makeTargetSelector("p"), attribute: "minecraft:generic.max_health" }).text).toBe("/attribute @p minecraft:generic.max_health get");
        expect(buildCommand("attribute_base_set", { target: makeTargetSelector("p"), attribute: "minecraft:generic.max_health", value: 40 }).text).toBe(
            "/attribute @p minecraft:generic.max_health base set 40",
        );
    });
});

describe("buildCommand: moderation and access commands", () => {
    it("builds ban/kick with optional reasons", () => {
        expect(buildCommand("ban", { player: "Griefer" }).text).toBe("/ban Griefer");
        expect(buildCommand("ban", { player: "Griefer", reason: "griefing spawn" }).text).toBe("/ban Griefer griefing spawn");
        expect(buildCommand("kick", { player: "Lagger" }).text).toBe("/kick Lagger");
    });
    it("builds op/deop", () => {
        expect(buildCommand("op", { player: "Admin" }).text).toBe("/op Admin");
        expect(buildCommand("deop", { player: "Admin" }).text).toBe("/deop Admin");
    });
    it("builds whitelist add/remove/toggle", () => {
        expect(buildCommand("whitelist_add", { player: "Steve" }).text).toBe("/whitelist add Steve");
        expect(buildCommand("whitelist_remove", { player: "Steve" }).text).toBe("/whitelist remove Steve");
        expect(buildCommand("whitelist_toggle", { action: "reload" }).text).toBe("/whitelist reload");
    });
});

describe("buildCommand: worldborder / spawnpoint / setworldspawn / locate / loot / data", () => {
    it("builds worldborder set with and without a transition time", () => {
        expect(buildCommand("worldborder_set", { diameter: 200 }).text).toBe("/worldborder set 200");
        expect(buildCommand("worldborder_set", { diameter: 200, seconds: 60 }).text).toBe("/worldborder set 200 60");
        expect(buildCommand("worldborder_set", { diameter: 0 }).errors.length).toBeGreaterThan(0);
    });
    it("builds worldborder center", () => {
        expect(buildCommand("worldborder_center", { x: 100, z: -200 }).text).toBe("/worldborder center 100 -200");
    });
    it("builds spawnpoint with a fallback to @s when only a position is given", () => {
        expect(buildCommand("spawnpoint", {}).text).toBe("/spawnpoint");
        expect(buildCommand("spawnpoint", { position: makeCoord3(1, 2, 3) }).text).toBe("/spawnpoint @s 1 2 3");
        expect(buildCommand("spawnpoint", { target: makeTargetSelector("p"), position: makeCoord3(1, 2, 3) }).text).toBe("/spawnpoint @p 1 2 3");
    });
    it("builds setworldspawn with and without a position", () => {
        expect(buildCommand("setworldspawn", {}).text).toBe("/setworldspawn");
        expect(buildCommand("setworldspawn", { position: makeCoord3(0, 80, 0) }).text).toBe("/setworldspawn 0 80 0");
    });
    it("builds locate", () => {
        expect(buildCommand("locate", { kind: "structure", id: "minecraft:village" }).text).toBe("/locate structure minecraft:village");
    });
    it("builds loot give", () => {
        expect(buildCommand("loot_give", { target: makeTargetSelector("p"), source: "loot minecraft:chests/simple_dungeon" }).text).toBe("/loot give @p loot minecraft:chests/simple_dungeon");
    });
    it("builds data get with and without a path", () => {
        expect(buildCommand("data_get", { targetKind: "entity", targetRef: "@p" }).text).toBe("/data get entity @p");
        expect(buildCommand("data_get", { targetKind: "entity", targetRef: "@p", path: "Health" }).text).toBe("/data get entity @p Health");
    });
});

describe("buildCommand: unknown form", () => {
    it("reports an error rather than throwing", () => {
        const result = buildCommand("not-a-real-form", {});
        expect(result.text).toBe("");
        expect(result.errors.length).toBe(1);
    });
});

describe("execute chain", () => {
    function clause(kind: ExecuteClause["kind"], overrides: Partial<ExecuteClause> = {}): ExecuteClause {
        return { ...makeExecuteClause(kind), ...overrides };
    }

    it("builds a simple as/at/run chain", () => {
        const chain = [clause("as", { target: makeTargetSelector("a") }), clause("at", { target: makeTargetSelector("s") })];
        const result = buildExecuteCommand(chain, "say hi");
        expect(result.errors).toEqual([]);
        expect(result.text).toBe("/execute as @a at @s run say hi");
    });
    it("strips a leading slash from the run command", () => {
        const result = buildExecuteCommand([], "/say hi");
        expect(result.text).toBe("/execute run say hi");
    });
    it("requires a run command", () => {
        const result = buildExecuteCommand([], "");
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.text).toContain("/execute");
    });
    it("builds positioned, rotated, facing, align, anchored and in clauses", () => {
        const chain = [
            clause("positioned", { coord: makeCoord3(1, 2, 3) }),
            clause("rotated", { rotationYaw: 90, rotationPitch: 0 }),
            clause("facing", { facingCoord: makeCoord3(0, 64, 0) }),
            clause("align", { axes: "xz" }),
            clause("anchored", { anchor: "eyes" }),
            clause("in", { dimension: "minecraft:the_nether" }),
        ];
        const result = buildExecuteCommand(chain, "say hi");
        expect(result.errors).toEqual([]);
        expect(result.text).toBe("/execute positioned 1 2 3 rotated 90 0 facing 0 64 0 align xz anchored eyes in minecraft:the_nether run say hi");
    });
    it("requires a dimension id for the in clause", () => {
        const result = buildExecuteCommand([clause("in", { dimension: "" })], "say hi");
        expect(result.errors.length).toBeGreaterThan(0);
    });
    it("builds an if entity condition, and its unless negation", () => {
        const ifChain = [clause("if", { conditionKind: "entity", target: makeTargetSelector("e") })];
        expect(buildExecuteCommand(ifChain, "say hi").text).toBe("/execute if entity @e run say hi");
        const negated = [clause("if", { conditionKind: "entity", target: makeTargetSelector("e"), negate: true })];
        expect(buildExecuteCommand(negated, "say hi").text).toBe("/execute unless entity @e run say hi");
    });
    it("builds an if block condition", () => {
        const chain = [clause("if", { conditionKind: "block", coord: makeCoord3(1, 2, 3), blockId: "minecraft:chest" })];
        expect(buildExecuteCommand(chain, "say hi").text).toBe("/execute if block 1 2 3 minecraft:chest run say hi");
    });
    it("builds an if score condition", () => {
        const chain = [clause("if", { conditionKind: "score", target: makeTargetSelector("p"), scoreObjective: "kills", scoreRange: "1.." })];
        expect(buildExecuteCommand(chain, "say hi").text).toBe("/execute if score @p kills matches 1.. run say hi");
    });
    it("requires the fields a score condition needs", () => {
        const chain = [clause("if", { conditionKind: "score", target: undefined, scoreObjective: "", scoreRange: "" })];
        expect(buildExecuteCommand(chain, "say hi").errors.length).toBeGreaterThan(0);
    });
    it("builds a store clause", () => {
        const chain = [clause("store", { target: makeTargetSelector("p"), scoreObjective: "result", storeTarget: "success" })];
        expect(buildExecuteCommand(chain, "say hi").text).toBe("/execute store success score @p result run say hi");
    });
    it("chains multiple clauses in the order given, and reorder changes the output", () => {
        const a = [clause("as", { target: makeTargetSelector("a") }), clause("at", { target: makeTargetSelector("s") })];
        const b = [clause("at", { target: makeTargetSelector("s") }), clause("as", { target: makeTargetSelector("a") })];
        expect(buildExecuteCommand(a, "say hi").text).toBe("/execute as @a at @s run say hi");
        expect(buildExecuteCommand(b, "say hi").text).toBe("/execute at @s as @a run say hi");
    });
});

describe("COMMAND_FORMS catalogue", () => {
    it("has a unique id per form", () => {
        const ids = COMMAND_FORMS.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
    it("every form has at least one field and a non-empty label", () => {
        for (const form of COMMAND_FORMS) {
            expect(form.fields.length).toBeGreaterThan(0);
            expect(form.label.trim()).not.toBe("");
        }
    });
    it("formById finds a real form and returns undefined for a bogus id", () => {
        expect(formById("give")?.id).toBe("give");
        expect(formById("nope")).toBeUndefined();
    });
    it("every form id used by a describe block above actually exists in the catalogue", () => {
        const ids = new Set(COMMAND_FORMS.map((f) => f.id));
        for (const id of [
            "give",
            "summon",
            "tp",
            "tp_coords",
            "effect_give",
            "effect_clear",
            "gamemode",
            "time_set",
            "time_add",
            "weather",
            "difficulty",
            "gamerule",
            "kill",
            "clear",
            "enchant",
            "xp_add",
            "xp_set",
            "xp_query",
            "title",
            "playsound",
            "particle",
            "setblock",
            "fill",
            "clone",
            "scoreboard_objectives_add",
            "scoreboard_players_set",
            "scoreboard_players_add",
            "team_add",
            "team_join",
            "tag_add",
            "tag_remove",
            "advancement_grant",
            "advancement_revoke",
            "attribute_get",
            "attribute_base_set",
            "ban",
            "kick",
            "op",
            "deop",
            "whitelist_add",
            "whitelist_remove",
            "whitelist_toggle",
            "worldborder_set",
            "worldborder_center",
            "spawnpoint",
            "setworldspawn",
            "locate",
            "loot_give",
            "data_get",
        ]) {
            expect(ids.has(id)).toBe(true);
        }
    });
});
