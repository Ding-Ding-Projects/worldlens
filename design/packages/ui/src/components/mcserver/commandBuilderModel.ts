import {
    ATTRIBUTE_IDS,
    BLOCK_IDS,
    CLONE_MASK_MODES,
    CLONE_MODES,
    DATA_TARGET_KINDS,
    DIFFICULTIES,
    EFFECT_IDS,
    ENCHANTMENT_IDS,
    ENTITY_TYPE_IDS,
    EXECUTE_CLAUSE_KINDS,
    FILL_MODES,
    GAMEMODES,
    GAMERULE_IDS,
    ITEM_IDS,
    LOCATE_KINDS,
    PARTICLE_IDS,
    SCOREBOARD_CRITERIA,
    SELECTOR_SORTS,
    SOUND_IDS,
    TITLE_SLOTS,
    WEATHER_TYPES,
} from "./commandBuilderData.js";

/**
 * The pure model behind the Minecraft command builder: no Vue, no bridge calls, nothing that
 * cannot be exercised with a plain function call. `CommandBuilder.vue` renders controls driven
 * by `FIELD_SPECS` on each `FORM`, holds the field values in a reactive object, and calls
 * `buildCommand` to turn that object into the exact command text plus a list of unmet
 * conditions - never a bare disabled button with no explanation.
 */

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

export type CoordMode = "abs" | "rel" | "local";

export interface CoordAxis {
    readonly mode: CoordMode;
    readonly value: number;
}

export interface Coord3 {
    readonly x: CoordAxis;
    readonly y: CoordAxis;
    readonly z: CoordAxis;
}

export function makeAxis(mode: CoordMode = "abs", value = 0): CoordAxis {
    return { mode, value };
}

export function makeCoord3(x = 0, y = 0, z = 0, mode: CoordMode = "abs"): Coord3 {
    return { x: makeAxis(mode, x), y: makeAxis(mode, y), z: makeAxis(mode, z) };
}

/** One coordinate axis token: `~`, `~3`, `^-1.5`, or a plain absolute number. */
export function axisToken(axis: CoordAxis): string {
    const prefix = axis.mode === "rel" ? "~" : axis.mode === "local" ? "^" : "";
    if ((axis.mode === "rel" || axis.mode === "local") && axis.value === 0) return prefix;
    return `${prefix}${formatNumber(axis.value)}`;
}

export function coord3Tokens(c: Coord3): string {
    return `${axisToken(c.x)} ${axisToken(c.y)} ${axisToken(c.z)}`;
}

function formatNumber(n: number): string {
    if (!Number.isFinite(n)) return "0";
    // Minecraft accepts decimals; trim floating noise without forcing integers.
    return Number(n.toFixed(4)).toString();
}

// ---------------------------------------------------------------------------
// Target selectors
// ---------------------------------------------------------------------------

export type SelectorKind = "p" | "a" | "r" | "e" | "s" | "name";

export interface ScoreRange {
    readonly objective: string;
    readonly range: string;
}

export interface SelectorArgs {
    readonly type?: string | undefined;
    readonly typeExclude?: boolean | undefined;
    readonly distance?: string | undefined;
    readonly limit?: number | null | undefined;
    readonly sort?: (typeof SELECTOR_SORTS)[number] | "" | undefined;
    readonly gamemode?: string | undefined;
    readonly gamemodeExclude?: boolean | undefined;
    readonly team?: string | undefined;
    readonly teamExclude?: boolean | undefined;
    readonly tags?: readonly string[] | undefined;
    readonly scores?: readonly ScoreRange[] | undefined;
    readonly nbt?: string | undefined;
    readonly name?: string | undefined;
    readonly x?: number | null | undefined;
    readonly y?: number | null | undefined;
    readonly z?: number | null | undefined;
    readonly dx?: number | null | undefined;
    readonly dy?: number | null | undefined;
    readonly dz?: number | null | undefined;
}

export interface TargetSelector {
    readonly kind: SelectorKind;
    /** Only meaningful when `kind === "name"`. */
    readonly playerName?: string;
    readonly args: SelectorArgs;
}

export function makeTargetSelector(kind: SelectorKind = "p"): TargetSelector {
    return { kind, playerName: "", args: {} };
}

/** True when the selector's own arguments are non-empty and worth rendering `[...]`. */
function hasSelectorArgs(args: SelectorArgs): boolean {
    return (
        !!args.type ||
        !!args.distance ||
        args.limit != null ||
        !!args.sort ||
        !!args.gamemode ||
        !!args.team ||
        (args.tags?.length ?? 0) > 0 ||
        (args.scores?.length ?? 0) > 0 ||
        !!args.nbt ||
        !!args.name ||
        args.x != null ||
        args.y != null ||
        args.z != null ||
        args.dx != null ||
        args.dy != null ||
        args.dz != null
    );
}

/** Renders one target as command text - a player name, or a selector with `[key=value,...]`. */
export function selectorToken(sel: TargetSelector): string {
    if (sel.kind === "name") return (sel.playerName ?? "").trim();
    const a = sel.args ?? {};
    const parts: string[] = [];
    if (a.type) parts.push(`type=${a.typeExclude ? "!" : ""}${a.type}`);
    if (a.distance) parts.push(`distance=${a.distance}`);
    if (a.limit != null) parts.push(`limit=${a.limit}`);
    if (a.sort) parts.push(`sort=${a.sort}`);
    if (a.gamemode) parts.push(`gamemode=${a.gamemodeExclude ? "!" : ""}${a.gamemode}`);
    if (a.team) parts.push(`team=${a.teamExclude ? "!" : ""}${a.team}`);
    for (const tag of a.tags ?? []) {
        const trimmed = tag.trim();
        if (trimmed) parts.push(`tag=${trimmed}`);
    }

    for (const score of a.scores ?? []) {
        if (score.objective.trim() && score.range.trim()) parts.push(`score_${score.objective.trim()}=${score.range.trim()}`);
    }
    if (a.name) parts.push(`name=${a.name}`);
    if (a.x != null) parts.push(`x=${formatNumber(a.x)}`);
    if (a.y != null) parts.push(`y=${formatNumber(a.y)}`);
    if (a.z != null) parts.push(`z=${formatNumber(a.z)}`);
    if (a.dx != null) parts.push(`dx=${formatNumber(a.dx)}`);
    if (a.dy != null) parts.push(`dy=${formatNumber(a.dy)}`);
    if (a.dz != null) parts.push(`dz=${formatNumber(a.dz)}`);
    if (a.nbt) parts.push(`nbt=${a.nbt}`);
    if (parts.length === 0) return `@${sel.kind}`;
    return `@${sel.kind}[${parts.join(",")}]`;
}

export function selectorError(sel: TargetSelector): string | null {
    if (sel.kind === "name") {
        if (!sel.playerName?.trim()) return "A player name is required for this target.";
        if (!/^[A-Za-z0-9_]{1,16}$/.test(sel.playerName.trim())) {
            return "Minecraft player names are 1-16 characters of letters, digits and underscores.";
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// /execute chain
// ---------------------------------------------------------------------------

export type ExecuteClauseKind = (typeof EXECUTE_CLAUSE_KINDS)[number];

export interface ExecuteClause {
    readonly id: string;
    readonly kind: ExecuteClauseKind;
    /** `if`/`unless`: which real subcommand this condition checks. */
    readonly conditionKind?: "entity" | "block" | "score" | undefined;
    readonly target?: TargetSelector | undefined;
    readonly coord?: Coord3 | undefined;
    readonly rotationYaw?: number | undefined;
    readonly rotationPitch?: number | undefined;
    readonly facingCoord?: Coord3 | undefined;
    readonly axes?: string | undefined;
    readonly anchor?: "eyes" | "feet" | undefined;
    readonly dimension?: string | undefined;
    readonly blockId?: string | undefined;
    readonly negate?: boolean | undefined;
    readonly scoreObjective?: string | undefined;
    readonly scoreRange?: string | undefined;
    readonly storeTarget?: "result" | "success" | undefined;
}

export function makeExecuteClause(kind: ExecuteClauseKind): ExecuteClause {
    return {
        id: `clause-${Math.random().toString(36).slice(2)}`,
        kind,
        conditionKind: "entity",
        target: makeTargetSelector("e"),
        coord: makeCoord3(),
        anchor: "feet",
        storeTarget: "result",
    };
}

function executeClauseToken(clause: ExecuteClause): { text: string; error: string | null } {
    switch (clause.kind) {
        case "as":
        case "at": {
            const sel = clause.target ?? makeTargetSelector("e");
            const err = selectorError(sel);
            return { text: `${clause.kind} ${selectorToken(sel)}`, error: err };
        }
        case "positioned":
            return { text: `positioned ${coord3Tokens(clause.coord ?? makeCoord3())}`, error: null };
        case "rotated":
            return { text: `rotated ${formatNumber(clause.rotationYaw ?? 0)} ${formatNumber(clause.rotationPitch ?? 0)}`, error: null };
        case "facing":
            return { text: `facing ${coord3Tokens(clause.facingCoord ?? makeCoord3())}`, error: null };
        case "align":
            return { text: `align ${(clause.axes ?? "xyz").trim() || "xyz"}`, error: null };
        case "anchored":
            return { text: `anchored ${clause.anchor ?? "feet"}`, error: null };
        case "in":
            if (!clause.dimension?.trim()) return { text: "", error: "The `in` clause needs a dimension id." };
            return { text: `in ${clause.dimension.trim()}`, error: null };
        case "if":
        case "unless": {
            const word = clause.negate ? (clause.kind === "if" ? "unless" : "if") : clause.kind;
            if (clause.conditionKind === "entity") {
                const sel = clause.target ?? makeTargetSelector("e");
                const err = selectorError(sel);
                return { text: `${word} entity ${selectorToken(sel)}`, error: err };
            }
            if (clause.conditionKind === "block") {
                if (!clause.blockId?.trim()) return { text: "", error: "The block condition needs a block id." };
                return { text: `${word} block ${coord3Tokens(clause.coord ?? makeCoord3())} ${clause.blockId.trim()}`, error: null };
            }
            // score
            if (!clause.target || !clause.scoreObjective?.trim() || !clause.scoreRange?.trim()) {
                return { text: "", error: "The score condition needs a target, an objective and a range." };
            }
            return {
                text: `${word} score ${selectorToken(clause.target)} ${clause.scoreObjective.trim()} matches ${clause.scoreRange.trim()}`,
                error: null,
            };
        }
        case "store": {
            const dest = clause.storeTarget ?? "result";
            if (!clause.target || !clause.scoreObjective?.trim()) {
                return { text: "", error: "The `store` clause needs a target and an objective to store into." };
            }
            return { text: `store ${dest} score ${selectorToken(clause.target)} ${clause.scoreObjective.trim()}`, error: null };
        }
        default:
            return { text: "", error: null };
    }
}

/** Joins an ordered execute chain plus its final `run <command>` into one command string. */
export function buildExecuteCommand(clauses: readonly ExecuteClause[], runCommand: string): { text: string; errors: readonly string[] } {
    const errors: string[] = [];
    const tokens: string[] = ["execute"];
    for (const clause of clauses) {
        const { text, error } = executeClauseToken(clause);
        if (error) errors.push(error);
        else if (text) tokens.push(text);
    }
    if (!runCommand.trim()) {
        errors.push("The `run` clause needs the command to run - build or type it below.");
    } else {
        tokens.push("run", runCommand.trim().replace(/^\//, ""));
    }
    return { text: `/${tokens.join(" ")}`, errors };
}

// ---------------------------------------------------------------------------
// Field specs (drive the generic UI) and per-form values
// ---------------------------------------------------------------------------

export type FieldKind =
    | "target"
    | "playerName"
    | "itemId"
    | "blockId"
    | "entityId"
    | "enchantmentId"
    | "effectId"
    | "particleId"
    | "soundId"
    | "attributeId"
    | "gameruleId"
    | "coord3"
    | "int"
    | "float"
    | "bool"
    | "enum"
    | "string"
    | "json";

export interface FieldSpec {
    readonly key: string;
    readonly label: string;
    readonly kind: FieldKind;
    readonly options?: readonly string[];
    readonly min?: number;
    readonly max?: number;
    readonly required?: boolean;
    readonly hint?: string;
}

export interface CommandForm {
    readonly id: string;
    readonly group: string;
    readonly label: string;
    readonly summary: string;
    readonly fields: readonly FieldSpec[];
}

// Reusable field spec fragments -------------------------------------------------

const targetField = (key = "target", label = "Target"): FieldSpec => ({ key, label, kind: "target", required: true });
const coordField = (key = "position", label = "Position"): FieldSpec => ({ key, label, kind: "coord3", required: true });

export const COMMAND_FORMS: readonly CommandForm[] = [
    {
        id: "give",
        group: "give",
        label: "/give",
        summary: "Give an item stack to a target.",
        fields: [
            targetField(),
            { key: "item", label: "Item", kind: "itemId", required: true },
            { key: "count", label: "Count", kind: "int", min: 1, max: 6400 },
        ],
    },
    {
        id: "summon",
        group: "summon",
        label: "/summon",
        summary: "Summon an entity at a position.",
        fields: [
            { key: "entity", label: "Entity", kind: "entityId", required: true },
            coordField(),
            { key: "nbt", label: "NBT data (optional, advanced)", kind: "json" },
        ],
    },
    {
        id: "tp",
        group: "tp",
        label: "/teleport",
        summary: "Teleport a target to another entity.",
        fields: [targetField("target", "Who to teleport"), targetField("destination", "Destination entity")],
    },
    {
        id: "tp_coords",
        group: "tp",
        label: "/teleport (to coordinates)",
        summary: "Teleport a target to a position.",
        fields: [targetField("target", "Who to teleport"), coordField("position", "Destination")],
    },
    {
        id: "effect_give",
        group: "effect",
        label: "/effect give",
        summary: "Apply a status effect.",
        fields: [
            targetField(),
            { key: "effect", label: "Effect", kind: "effectId", required: true },
            { key: "seconds", label: "Duration (seconds)", kind: "int", min: 1, max: 1000000 },
            { key: "amplifier", label: "Amplifier", kind: "int", min: 0, max: 255 },
            { key: "hideParticles", label: "Hide particles", kind: "bool" },
        ],
    },
    {
        id: "effect_clear",
        group: "effect",
        label: "/effect clear",
        summary: "Remove status effects.",
        fields: [targetField(), { key: "effect", label: "Effect (leave blank for all)", kind: "effectId" }],
    },
    {
        id: "gamemode",
        group: "gamemode",
        label: "/gamemode",
        summary: "Set a target's game mode.",
        fields: [{ key: "mode", label: "Mode", kind: "enum", options: GAMEMODES, required: true }, targetField("target", "Target (optional)")],
    },
    {
        id: "time_set",
        group: "time",
        label: "/time set",
        summary: "Set the world time.",
        fields: [{ key: "value", label: "Time (day, night, noon, midnight, or a tick count)", kind: "string", required: true }],
    },
    {
        id: "time_add",
        group: "time",
        label: "/time add",
        summary: "Advance the world time.",
        fields: [{ key: "ticks", label: "Ticks to add", kind: "int", min: 0, required: true }],
    },
    {
        id: "weather",
        group: "weather",
        label: "/weather",
        summary: "Set the weather.",
        fields: [
            { key: "type", label: "Weather", kind: "enum", options: WEATHER_TYPES, required: true },
            { key: "seconds", label: "Duration (seconds, optional)", kind: "int", min: 0 },
        ],
    },
    {
        id: "difficulty",
        group: "difficulty",
        label: "/difficulty",
        summary: "Set the world difficulty.",
        fields: [{ key: "level", label: "Difficulty", kind: "enum", options: DIFFICULTIES, required: true }],
    },
    {
        id: "gamerule",
        group: "gamerule",
        label: "/gamerule",
        summary: "Read or set a game rule.",
        fields: [
            { key: "rule", label: "Rule", kind: "gameruleId", required: true },
            { key: "value", label: "Value (leave blank to only read it)", kind: "string" },
        ],
    },
    {
        id: "kill",
        group: "kill",
        label: "/kill",
        summary: "Kill target entities.",
        fields: [targetField("target", "Target (optional; defaults to yourself)")],
    },
    {
        id: "clear",
        group: "clear",
        label: "/clear",
        summary: "Clear a target's inventory.",
        fields: [
            targetField("target", "Target (optional)"),
            { key: "item", label: "Only this item (optional)", kind: "itemId" },
            { key: "maxCount", label: "Max count to remove (optional)", kind: "int", min: 0 },
        ],
    },
    {
        id: "enchant",
        group: "enchant",
        label: "/enchant",
        summary: "Enchant a target's held item.",
        fields: [
            targetField(),
            { key: "enchantment", label: "Enchantment", kind: "enchantmentId", required: true },
            { key: "level", label: "Level", kind: "int", min: 1, max: 255 },
        ],
    },
    {
        id: "xp_add",
        group: "xp",
        label: "/xp add",
        summary: "Grant experience.",
        fields: [
            targetField(),
            { key: "amount", label: "Amount", kind: "int", required: true },
            { key: "unit", label: "Unit", kind: "enum", options: ["points", "levels"] },
        ],
    },
    {
        id: "xp_set",
        group: "xp",
        label: "/xp set",
        summary: "Set experience exactly.",
        fields: [
            targetField(),
            { key: "amount", label: "Amount", kind: "int", min: 0, required: true },
            { key: "unit", label: "Unit", kind: "enum", options: ["points", "levels"] },
        ],
    },
    {
        id: "xp_query",
        group: "xp",
        label: "/xp query",
        summary: "Read a target's experience.",
        fields: [targetField(), { key: "unit", label: "Unit", kind: "enum", options: ["points", "levels"] }],
    },
    {
        id: "title",
        group: "title",
        label: "/title",
        summary: "Send a title, subtitle or action bar message.",
        fields: [
            targetField(),
            { key: "slot", label: "Slot", kind: "enum", options: TITLE_SLOTS, required: true },
            { key: "text", label: "Message text (JSON or plain text)", kind: "json" },
            { key: "fadeIn", label: "Fade in (ticks, only for 'times')", kind: "int", min: 0 },
            { key: "stay", label: "Stay (ticks, only for 'times')", kind: "int", min: 0 },
            { key: "fadeOut", label: "Fade out (ticks, only for 'times')", kind: "int", min: 0 },
        ],
    },
    {
        id: "playsound",
        group: "playsound",
        label: "/playsound",
        summary: "Play a sound to a target.",
        fields: [
            { key: "sound", label: "Sound", kind: "soundId", required: true },
            { key: "source", label: "Source", kind: "enum", options: ["master", "music", "record", "weather", "block", "hostile", "neutral", "player", "ambient", "voice"] },
            targetField("target", "Target"),
            coordField("position", "Position (optional)"),
            { key: "volume", label: "Volume", kind: "float", min: 0, max: 10 },
            { key: "pitch", label: "Pitch", kind: "float", min: 0, max: 2 },
        ],
    },
    {
        id: "particle",
        group: "particle",
        label: "/particle",
        summary: "Spawn a particle effect.",
        fields: [
            { key: "particle", label: "Particle", kind: "particleId", required: true },
            coordField("position", "Position"),
            { key: "dx", label: "Spread X", kind: "float", min: 0 },
            { key: "dy", label: "Spread Y", kind: "float", min: 0 },
            { key: "dz", label: "Spread Z", kind: "float", min: 0 },
            { key: "speed", label: "Speed", kind: "float", min: 0 },
            { key: "count", label: "Count", kind: "int", min: 0 },
            { key: "force", label: "Force (visible beyond render distance)", kind: "bool" },
            targetField("viewer", "Viewer (optional)"),
        ],
    },
    {
        id: "setblock",
        group: "setblock",
        label: "/setblock",
        summary: "Place a single block.",
        fields: [coordField("position", "Position"), { key: "block", label: "Block", kind: "blockId", required: true }, { key: "mode", label: "Mode", kind: "enum", options: ["replace", "keep", "destroy"] }],
    },
    {
        id: "fill",
        group: "fill",
        label: "/fill",
        summary: "Fill a region with a block.",
        fields: [
            coordField("from", "Corner 1"),
            coordField("to", "Corner 2"),
            { key: "block", label: "Block", kind: "blockId", required: true },
            { key: "mode", label: "Mode", kind: "enum", options: FILL_MODES },
        ],
    },
    {
        id: "clone",
        group: "clone",
        label: "/clone",
        summary: "Copy a region to another position.",
        fields: [
            coordField("from", "Source corner 1"),
            coordField("to", "Source corner 2"),
            coordField("dest", "Destination corner"),
            { key: "maskMode", label: "Mask mode", kind: "enum", options: CLONE_MASK_MODES },
            { key: "cloneMode", label: "Clone mode", kind: "enum", options: CLONE_MODES },
        ],
    },
    {
        id: "scoreboard_objectives_add",
        group: "scoreboard",
        label: "/scoreboard objectives add",
        summary: "Create a new objective.",
        fields: [
            { key: "objective", label: "Objective name", kind: "string", required: true },
            { key: "criteria", label: "Criteria", kind: "enum", options: SCOREBOARD_CRITERIA, required: true },
            { key: "displayName", label: "Display name (optional, JSON or text)", kind: "json" },
        ],
    },
    {
        id: "scoreboard_players_set",
        group: "scoreboard",
        label: "/scoreboard players set",
        summary: "Set a score.",
        fields: [targetField("target", "Target"), { key: "objective", label: "Objective", kind: "string", required: true }, { key: "score", label: "Score", kind: "int", required: true }],
    },
    {
        id: "scoreboard_players_add",
        group: "scoreboard",
        label: "/scoreboard players add",
        summary: "Add to a score.",
        fields: [targetField("target", "Target"), { key: "objective", label: "Objective", kind: "string", required: true }, { key: "score", label: "Amount", kind: "int", required: true }],
    },
    {
        id: "team_add",
        group: "team",
        label: "/team add",
        summary: "Create a team.",
        fields: [{ key: "team", label: "Team name", kind: "string", required: true }, { key: "displayName", label: "Display name (optional)", kind: "string" }],
    },
    {
        id: "team_join",
        group: "team",
        label: "/team join",
        summary: "Add a target to a team.",
        fields: [{ key: "team", label: "Team name", kind: "string", required: true }, targetField("target", "Target (optional)")],
    },
    {
        id: "tag_add",
        group: "tag",
        label: "/tag add",
        summary: "Tag a target.",
        fields: [targetField(), { key: "tag", label: "Tag", kind: "string", required: true }],
    },
    {
        id: "tag_remove",
        group: "tag",
        label: "/tag remove",
        summary: "Remove a tag from a target.",
        fields: [targetField(), { key: "tag", label: "Tag", kind: "string", required: true }],
    },
    {
        id: "advancement_grant",
        group: "advancement",
        label: "/advancement grant",
        summary: "Grant an advancement. Advancement ids are datapack- and version-specific, so this is a free-entry field rather than a picker - see the report.",
        fields: [targetField(), { key: "scope", label: "Scope", kind: "enum", options: ["everything", "only", "from", "through", "until"] }, { key: "advancement", label: "Advancement id", kind: "string", required: true }],
    },
    {
        id: "advancement_revoke",
        group: "advancement",
        label: "/advancement revoke",
        summary: "Revoke an advancement (free-entry id, see report).",
        fields: [targetField(), { key: "scope", label: "Scope", kind: "enum", options: ["everything", "only", "from", "through", "until"] }, { key: "advancement", label: "Advancement id", kind: "string", required: true }],
    },
    {
        id: "attribute_get",
        group: "attribute",
        label: "/attribute get",
        summary: "Read a target's attribute value.",
        fields: [targetField(), { key: "attribute", label: "Attribute", kind: "attributeId", required: true }],
    },
    {
        id: "attribute_base_set",
        group: "attribute",
        label: "/attribute base set",
        summary: "Set an attribute's base value.",
        fields: [targetField(), { key: "attribute", label: "Attribute", kind: "attributeId", required: true }, { key: "value", label: "Value", kind: "float", required: true }],
    },
    {
        id: "ban",
        group: "ban",
        label: "/ban",
        summary: "Ban a player by name.",
        fields: [{ key: "player", label: "Player name", kind: "playerName", required: true }, { key: "reason", label: "Reason (optional)", kind: "string" }],
    },
    {
        id: "kick",
        group: "kick",
        label: "/kick",
        summary: "Kick a player.",
        fields: [{ key: "player", label: "Player name", kind: "playerName", required: true }, { key: "reason", label: "Reason (optional)", kind: "string" }],
    },
    {
        id: "op",
        group: "op",
        label: "/op",
        summary: "Grant operator status.",
        fields: [{ key: "player", label: "Player name", kind: "playerName", required: true }],
    },
    {
        id: "deop",
        group: "deop",
        label: "/deop",
        summary: "Revoke operator status.",
        fields: [{ key: "player", label: "Player name", kind: "playerName", required: true }],
    },
    {
        id: "whitelist_add",
        group: "whitelist",
        label: "/whitelist add",
        summary: "Add a player to the whitelist.",
        fields: [{ key: "player", label: "Player name", kind: "playerName", required: true }],
    },
    {
        id: "whitelist_remove",
        group: "whitelist",
        label: "/whitelist remove",
        summary: "Remove a player from the whitelist.",
        fields: [{ key: "player", label: "Player name", kind: "playerName", required: true }],
    },
    {
        id: "whitelist_toggle",
        group: "whitelist",
        label: "/whitelist on|off|list|reload",
        summary: "Control the whitelist itself.",
        fields: [{ key: "action", label: "Action", kind: "enum", options: ["on", "off", "list", "reload"], required: true }],
    },
    {
        id: "worldborder_set",
        group: "worldborder",
        label: "/worldborder set",
        summary: "Set the world border size.",
        fields: [
            { key: "diameter", label: "Diameter (blocks)", kind: "float", min: 1, required: true },
            { key: "seconds", label: "Transition time (seconds, optional)", kind: "int", min: 0 },
        ],
    },
    {
        id: "worldborder_center",
        group: "worldborder",
        label: "/worldborder center",
        summary: "Move the world border's centre.",
        fields: [{ key: "x", label: "Centre X", kind: "float", required: true }, { key: "z", label: "Centre Z", kind: "float", required: true }],
    },
    {
        id: "spawnpoint",
        group: "spawnpoint",
        label: "/spawnpoint",
        summary: "Set a player's individual respawn point.",
        fields: [targetField("target", "Target (optional)"), coordField("position", "Position (optional)")],
    },
    {
        id: "setworldspawn",
        group: "setworldspawn",
        label: "/setworldspawn",
        summary: "Set the world spawn point.",
        fields: [coordField("position", "Position (optional)")],
    },
    {
        id: "locate",
        group: "locate",
        label: "/locate",
        summary: "Find the nearest structure, biome or point of interest.",
        fields: [
            { key: "kind", label: "Kind", kind: "enum", options: LOCATE_KINDS, required: true },
            { key: "id", label: "Structure/biome/poi id (namespaced)", kind: "string", required: true },
        ],
    },
    {
        id: "loot_give",
        group: "loot",
        label: "/loot give",
        summary: "Give a target loot from a table, entity, or kill.",
        fields: [targetField("target", "Recipient"), { key: "source", label: "Loot table id or `entity`/`kill` source", kind: "string", required: true }],
    },
    {
        id: "data_get",
        group: "data",
        label: "/data get",
        summary: "Read NBT data.",
        fields: [
            { key: "targetKind", label: "Target kind", kind: "enum", options: DATA_TARGET_KINDS, required: true },
            { key: "targetRef", label: "Target (selector, coordinates, or storage id)", kind: "string", required: true },
            { key: "path", label: "NBT path (optional)", kind: "string" },
        ],
    },
];

// ---------------------------------------------------------------------------
// Building command text from a form's values
// ---------------------------------------------------------------------------

export interface BuildResult {
    readonly text: string;
    readonly errors: readonly string[];
}

function requireTarget(value: unknown, label: string, errors: string[], required: boolean): string {
    const sel = value as TargetSelector | undefined;
    if (!sel) {
        if (required) errors.push(`${label} is required.`);
        return "";
    }
    const err = selectorError(sel);
    if (err) errors.push(err);
    return selectorToken(sel);
}

function requireString(value: unknown, label: string, errors: string[], required: boolean): string {
    const s = typeof value === "string" ? value.trim() : "";
    if (required && s === "") errors.push(`${label} is required.`);
    return s;
}

function coordOrDefault(value: unknown): Coord3 {
    return (value as Coord3 | undefined) ?? makeCoord3();
}

/**
 * Builds the exact command text for one form's current values.
 *
 * Every command is namespaced under its own case here rather than a fully generic engine,
 * because Minecraft's argument ORDER and optional trailing arguments differ command to command
 * in ways a generic join would get wrong (`/gamemode <mode> [target]` vs. `/give <target> <item>
 * [count]`, for instance).
 */
export function buildCommand(formId: string, values: Record<string, unknown>): BuildResult {
    const errors: string[] = [];
    const v = values;
    const t = (key: string, label: string, required = true) => requireTarget(v[key], label, errors, required);
    const s = (key: string, label: string, required = true) => requireString(v[key], label, errors, required);
    const int = (key: string, fallback = 0): number => (typeof v[key] === "number" ? (v[key] as number) : fallback);

    switch (formId) {
        case "give": {
            const target = t("target", "Target");
            const item = s("item", "Item");
            const count = int("count", 1);
            return { text: `/give ${target} ${item} ${count}`, errors };
        }
        case "summon": {
            const entity = s("entity", "Entity");
            const pos = coord3Tokens(coordOrDefault(v["position"]));
            const nbt = typeof v["nbt"] === "string" ? (v["nbt"] as string).trim() : "";
            return { text: `/summon ${entity} ${pos}${nbt ? ` ${nbt}` : ""}`, errors };
        }
        case "tp": {
            const target = t("target", "Who to teleport");
            const dest = t("destination", "Destination entity");
            return { text: `/teleport ${target} ${dest}`, errors };
        }
        case "tp_coords": {
            const target = t("target", "Who to teleport");
            const pos = coord3Tokens(coordOrDefault(v["position"]));
            return { text: `/teleport ${target} ${pos}`, errors };
        }
        case "effect_give": {
            const target = t("target", "Target");
            const effect = s("effect", "Effect");
            const seconds = int("seconds", 30);
            const amplifier = int("amplifier", 0);
            const hide = v["hideParticles"] === true;
            return { text: `/effect give ${target} ${effect} ${seconds} ${amplifier}${hide ? " true" : ""}`, errors };
        }
        case "effect_clear": {
            const target = t("target", "Target");
            const effect = typeof v["effect"] === "string" ? (v["effect"] as string).trim() : "";
            return { text: `/effect clear ${target}${effect ? ` ${effect}` : ""}`, errors };
        }
        case "gamemode": {
            const mode = s("mode", "Mode");
            const targetSel = v["target"] as TargetSelector | undefined;
            const target = targetSel ? requireTarget(targetSel, "Target", errors, false) : "";
            return { text: `/gamemode ${mode}${target ? ` ${target}` : ""}`, errors };
        }
        case "time_set": {
            const value = s("value", "Time value");
            return { text: `/time set ${value}`, errors };
        }
        case "time_add": {
            const ticks = int("ticks", 0);
            return { text: `/time add ${ticks}`, errors };
        }
        case "weather": {
            const type = s("type", "Weather");
            const seconds = v["seconds"];
            return { text: `/weather ${type}${typeof seconds === "number" ? ` ${seconds}` : ""}`, errors };
        }
        case "difficulty": {
            const level = s("level", "Difficulty");
            return { text: `/difficulty ${level}`, errors };
        }
        case "gamerule": {
            const rule = s("rule", "Rule");
            const value = typeof v["value"] === "string" ? (v["value"] as string).trim() : "";
            return { text: `/gamerule ${rule}${value ? ` ${value}` : ""}`, errors };
        }
        case "kill": {
            const targetSel = v["target"] as TargetSelector | undefined;
            const target = targetSel ? requireTarget(targetSel, "Target", errors, false) : "";
            return { text: `/kill${target ? ` ${target}` : ""}`, errors };
        }
        case "clear": {
            const targetSel = v["target"] as TargetSelector | undefined;
            const target = targetSel ? requireTarget(targetSel, "Target", errors, false) : "";
            const item = typeof v["item"] === "string" ? (v["item"] as string).trim() : "";
            const maxCount = v["maxCount"];
            const tail = item ? ` ${item}${typeof maxCount === "number" ? ` ${maxCount}` : ""}` : "";
            return { text: `/clear${target ? ` ${target}` : ""}${tail}`, errors };
        }
        case "enchant": {
            const target = t("target", "Target");
            const enchantment = s("enchantment", "Enchantment");
            const level = int("level", 1);
            return { text: `/enchant ${target} ${enchantment} ${level}`, errors };
        }
        case "xp_add":
        case "xp_set": {
            const target = t("target", "Target");
            const amount = int("amount", 0);
            const unit = typeof v["unit"] === "string" ? (v["unit"] as string) : "points";
            const verb = formId === "xp_add" ? "add" : "set";
            return { text: `/xp ${verb} ${target} ${amount} ${unit}`, errors };
        }
        case "xp_query": {
            const target = t("target", "Target");
            const unit = typeof v["unit"] === "string" ? (v["unit"] as string) : "points";
            return { text: `/xp query ${target} ${unit}`, errors };
        }
        case "title": {
            const target = t("target", "Target");
            const slot = s("slot", "Slot");
            if (slot === "times") {
                const fadeIn = int("fadeIn", 10);
                const stay = int("stay", 70);
                const fadeOut = int("fadeOut", 20);
                return { text: `/title ${target} times ${fadeIn} ${stay} ${fadeOut}`, errors };
            }
            if (slot === "clear" || slot === "reset") {
                return { text: `/title ${target} ${slot}`, errors };
            }
            const text = typeof v["text"] === "string" ? (v["text"] as string).trim() : "";
            if (!text) errors.push("Message text is required for this slot.");
            return { text: `/title ${target} ${slot} ${text}`, errors };
        }
        case "playsound": {
            const sound = s("sound", "Sound");
            const source = typeof v["source"] === "string" ? (v["source"] as string) : "master";
            const target = t("target", "Target");
            const posSel = v["position"] as Coord3 | undefined;
            const pos = posSel ? coord3Tokens(posSel) : "";
            const volume = v["volume"];
            const pitch = v["pitch"];
            let tail = "";
            if (pos) tail += ` ${pos}`;
            if (typeof volume === "number") tail += ` ${volume}`;
            if (typeof pitch === "number" && pos) tail += ` ${pitch}`;
            return { text: `/playsound ${sound} ${source} ${target}${tail}`, errors };
        }
        case "particle": {
            const particle = s("particle", "Particle");
            const pos = coord3Tokens(coordOrDefault(v["position"]));
            const dx = int("dx", 0);
            const dy = int("dy", 0);
            const dz = int("dz", 0);
            const speed = int("speed", 0);
            const count = int("count", 1);
            const force = v["force"] === true;
            const viewerSel = v["viewer"] as TargetSelector | undefined;
            const viewer = viewerSel ? requireTarget(viewerSel, "Viewer", errors, false) : "";
            let text = `/particle ${particle} ${pos} ${dx} ${dy} ${dz} ${speed} ${count}`;
            if (force || viewer) text += ` ${force ? "force" : "normal"}`;
            if (viewer) text += ` ${viewer}`;
            return { text, errors };
        }
        case "setblock": {
            const pos = coord3Tokens(coordOrDefault(v["position"]));
            const block = s("block", "Block");
            const mode = typeof v["mode"] === "string" ? (v["mode"] as string) : "replace";
            return { text: `/setblock ${pos} ${block} ${mode}`, errors };
        }
        case "fill": {
            const from = coord3Tokens(coordOrDefault(v["from"]));
            const to = coord3Tokens(coordOrDefault(v["to"]));
            const block = s("block", "Block");
            const mode = typeof v["mode"] === "string" ? (v["mode"] as string) : "replace";
            return { text: `/fill ${from} ${to} ${block} ${mode}`, errors };
        }
        case "clone": {
            const from = coord3Tokens(coordOrDefault(v["from"]));
            const to = coord3Tokens(coordOrDefault(v["to"]));
            const dest = coord3Tokens(coordOrDefault(v["dest"]));
            const maskMode = typeof v["maskMode"] === "string" ? (v["maskMode"] as string) : "replace";
            const cloneMode = typeof v["cloneMode"] === "string" ? (v["cloneMode"] as string) : "normal";
            return { text: `/clone ${from} ${to} ${dest} ${maskMode} ${cloneMode}`, errors };
        }
        case "scoreboard_objectives_add": {
            const objective = s("objective", "Objective name");
            const criteria = s("criteria", "Criteria");
            const displayName = typeof v["displayName"] === "string" ? (v["displayName"] as string).trim() : "";
            return { text: `/scoreboard objectives add ${objective} ${criteria}${displayName ? ` ${displayName}` : ""}`, errors };
        }
        case "scoreboard_players_set":
        case "scoreboard_players_add": {
            const target = t("target", "Target");
            const objective = s("objective", "Objective");
            const score = int("score", 0);
            const verb = formId === "scoreboard_players_set" ? "set" : "add";
            return { text: `/scoreboard players ${verb} ${target} ${objective} ${score}`, errors };
        }
        case "team_add": {
            const team = s("team", "Team name");
            const displayName = typeof v["displayName"] === "string" ? (v["displayName"] as string).trim() : "";
            return { text: `/team add ${team}${displayName ? ` ${displayName}` : ""}`, errors };
        }
        case "team_join": {
            const team = s("team", "Team name");
            const targetSel = v["target"] as TargetSelector | undefined;
            const target = targetSel ? requireTarget(targetSel, "Target", errors, false) : "";
            return { text: `/team join ${team}${target ? ` ${target}` : ""}`, errors };
        }
        case "tag_add":
        case "tag_remove": {
            const target = t("target", "Target");
            const tag = s("tag", "Tag");
            const verb = formId === "tag_add" ? "add" : "remove";
            return { text: `/tag ${target} ${verb} ${tag}`, errors };
        }
        case "advancement_grant":
        case "advancement_revoke": {
            const target = t("target", "Target");
            const scope = typeof v["scope"] === "string" ? (v["scope"] as string) : "everything";
            const advancement = typeof v["advancement"] === "string" ? (v["advancement"] as string).trim() : "";
            const verb = formId === "advancement_grant" ? "grant" : "revoke";
            const needsId = scope !== "everything";
            if (needsId && !advancement) errors.push("An advancement id is required for this scope.");
            return { text: `/advancement ${verb} ${target} ${scope}${needsId ? ` ${advancement}` : ""}`, errors };
        }
        case "attribute_get": {
            const target = t("target", "Target");
            const attribute = s("attribute", "Attribute");
            return { text: `/attribute ${target} ${attribute} get`, errors };
        }
        case "attribute_base_set": {
            const target = t("target", "Target");
            const attribute = s("attribute", "Attribute");
            const value = typeof v["value"] === "number" ? (v["value"] as number) : 0;
            return { text: `/attribute ${target} ${attribute} base set ${value}`, errors };
        }
        case "ban":
        case "kick": {
            const player = s("player", "Player name");
            const reason = typeof v["reason"] === "string" ? (v["reason"] as string).trim() : "";
            const verb = formId === "ban" ? "ban" : "kick";
            return { text: `/${verb} ${player}${reason ? ` ${reason}` : ""}`, errors };
        }
        case "op":
        case "deop": {
            const player = s("player", "Player name");
            return { text: `/${formId} ${player}`, errors };
        }
        case "whitelist_add":
        case "whitelist_remove": {
            const player = s("player", "Player name");
            const verb = formId === "whitelist_add" ? "add" : "remove";
            return { text: `/whitelist ${verb} ${player}`, errors };
        }
        case "whitelist_toggle": {
            const action = s("action", "Action");
            return { text: `/whitelist ${action}`, errors };
        }
        case "worldborder_set": {
            const diameter = typeof v["diameter"] === "number" ? (v["diameter"] as number) : 0;
            if (diameter <= 0) errors.push("Diameter must be greater than zero.");
            const seconds = v["seconds"];
            return { text: `/worldborder set ${diameter}${typeof seconds === "number" ? ` ${seconds}` : ""}`, errors };
        }
        case "worldborder_center": {
            const x = typeof v["x"] === "number" ? (v["x"] as number) : 0;
            const z = typeof v["z"] === "number" ? (v["z"] as number) : 0;
            return { text: `/worldborder center ${x} ${z}`, errors };
        }
        case "spawnpoint": {
            const targetSel = v["target"] as TargetSelector | undefined;
            const target = targetSel ? requireTarget(targetSel, "Target", errors, false) : "";
            const posSel = v["position"] as Coord3 | undefined;
            const pos = posSel ? coord3Tokens(posSel) : "";
            const tail = target ? ` ${target}${pos ? ` ${pos}` : ""}` : pos ? ` @s ${pos}` : "";
            return { text: `/spawnpoint${tail}`, errors };
        }
        case "setworldspawn": {
            const posSel = v["position"] as Coord3 | undefined;
            const pos = posSel ? coord3Tokens(posSel) : "";
            return { text: `/setworldspawn${pos ? ` ${pos}` : ""}`, errors };
        }
        case "locate": {
            const kind = s("kind", "Kind");
            const id = s("id", "Id");
            return { text: `/locate ${kind} ${id}`, errors };
        }
        case "loot_give": {
            const target = t("target", "Recipient");
            const source = s("source", "Source");
            return { text: `/loot give ${target} ${source}`, errors };
        }
        case "data_get": {
            const kind = s("targetKind", "Target kind");
            const ref = s("targetRef", "Target");
            const path = typeof v["path"] === "string" ? (v["path"] as string).trim() : "";
            return { text: `/data get ${kind} ${ref}${path ? ` ${path}` : ""}`, errors };
        }
        default:
            return { text: "", errors: [`Unknown command form "${formId}".`] };
    }
}

export function formById(id: string): CommandForm | undefined {
    return COMMAND_FORMS.find((f) => f.id === id);
}
