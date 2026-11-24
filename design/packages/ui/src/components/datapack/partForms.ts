/**
 * Forms for the registry parts that have no editor of their own: the fields each kind has,
 * with the control that matches the value and the game's limits for it.
 *
 * The form patches one field at a time into the part's JSON (`setAt`), so a field with no
 * control here (an enchantment's effects, a structure's spawn overrides) is kept as written.
 * Design: `design-sources/datapacks-and-chunks/RegistryForms.dc.html`.
 */

export type PartField =
    | { kind: "number"; path: string; label: string; min: number; max: number; step: number; fallback: number }
    | { kind: "text"; path: string; label: string }
    | { kind: "choice"; path: string; label: string; options: readonly string[] }
    | { kind: "switch"; path: string; label: string }
    | { kind: "colour"; path: string; label: string };

const n = (path: string, label: string, min: number, max: number, step: number, fallback: number): PartField => ({
    kind: "number",
    path,
    label,
    min,
    max,
    step,
    fallback,
});
const tx = (path: string, label: string): PartField => ({ kind: "text", path, label });
const ch = (path: string, label: string, options: readonly string[]): PartField => ({ kind: "choice", path, label, options });
const sw = (path: string, label: string): PartField => ({ kind: "switch", path, label });

export const PART_FORMS: Readonly<Record<string, readonly PartField[]>> = {
    enchantment: [
        tx("description.text", "Name shown"),
        tx("supported_items", "Items it can go on (id or #tag)"),
        n("weight", "How common", 1, 1024, 1, 5),
        n("max_level", "Highest level", 1, 255, 1, 3),
        n("anvil_cost", "Anvil cost", 0, 255, 1, 2),
        n("min_cost.base", "Lowest cost at level 1", 0, 100, 1, 1),
        n("min_cost.per_level_above_first", "Lowest cost added per level", 0, 50, 1, 10),
        n("max_cost.base", "Highest cost at level 1", 0, 100, 1, 21),
        n("max_cost.per_level_above_first", "Highest cost added per level", 0, 50, 1, 10),
    ],
    enchantment_provider: [n("cost", "Enchanting cost", 1, 100, 1, 10), tx("enchantments", "Enchantments (id, #tag or list)")],
    damage_type: [
        tx("message_id", "Death message id"),
        n("exhaustion", "Hunger cost", 0, 1, 0.05, 0.1),
        ch("scaling", "Scales with difficulty", ["never", "when_caused_by_living_non_player", "always"]),
        ch("effects", "Sound", ["hurt", "thorns", "drowning", "burning", "poking", "freezing"]),
        ch("death_message_type", "Death message style", ["default", "fall_variants", "intentional_game_design"]),
    ],
    trim_material: [tx("asset_name", "Texture name"), tx("description.text", "Name shown"), { kind: "colour", path: "description.color", label: "Text colour" }],
    trim_pattern: [tx("asset_id", "Texture"), tx("description.text", "Name shown"), sw("decal", "Drawn over the armour (decal)")],
    banner_pattern: [tx("asset_id", "Texture"), tx("translation_key", "Name key")],
    painting_variant: [tx("asset_id", "Texture"), n("width", "Width (blocks)", 1, 16, 1, 1), n("height", "Height (blocks)", 1, 16, 1, 1)],
    chat_type: [tx("chat.translation_key", "Chat message key"), tx("narration.translation_key", "Narration key")],
    jukebox_song: [
        tx("sound_event", "Sound"),
        tx("description.text", "Name shown"),
        n("length_in_seconds", "Length (seconds)", 1, 3600, 1, 185),
        n("comparator_output", "Comparator signal", 0, 15, 1, 2),
    ],
    instrument: [
        tx("sound_event", "Sound"),
        tx("description.text", "Name shown"),
        n("use_duration", "Play time (seconds)", 1, 60, 1, 7),
        n("range", "Heard from (blocks)", 1, 512, 1, 256),
    ],
    dimension: [
        ch("type", "Dimension type", ["minecraft:overworld", "minecraft:the_nether", "minecraft:the_end", "minecraft:overworld_caves"]),
        ch("generator.settings", "Terrain shape", [
            "minecraft:overworld",
            "minecraft:large_biomes",
            "minecraft:amplified",
            "minecraft:nether",
            "minecraft:end",
            "minecraft:caves",
            "minecraft:floating_islands",
        ]),
        tx("generator.biome_source.biome", "Biome everywhere (fixed source)"),
    ],
    dimension_type: [
        sw("has_skylight", "Has a sky"),
        sw("has_ceiling", "Has a ceiling"),
        sw("natural", "Natural (compasses and clocks work)"),
        sw("ultrawarm", "Ultrawarm (water evaporates)"),
        sw("piglin_safe", "Piglins are safe"),
        sw("bed_works", "Beds work"),
        sw("respawn_anchor_works", "Respawn anchors work"),
        sw("has_raids", "Raids happen"),
        n("ambient_light", "Ambient light", 0, 1, 0.05, 0),
        n("coordinate_scale", "Travel scale", 0.125, 8, 0.125, 1),
        n("min_y", "Bottom Y", -2032, 2016, 16, -64),
        n("height", "Height", 16, 4064, 16, 384),
        n("logical_height", "Height for portals and fruit", 0, 4064, 16, 384),
        n("monster_spawn_block_light_limit", "Monsters spawn up to block light", 0, 15, 1, 0),
        ch("effects", "Sky look", ["minecraft:overworld", "minecraft:the_nether", "minecraft:the_end"]),
        tx("infiniburn", "Blocks that burn forever (#tag)"),
    ],
    density_function: [n("argument", "Value (constant)", -1000, 1000, 0.5, 0)],
    structure: [
        ch("type", "Kind", ["minecraft:jigsaw", "minecraft:buried_treasure", "minecraft:desert_pyramid", "minecraft:igloo", "minecraft:mineshaft", "minecraft:swamp_hut"]),
        tx("biomes", "Biomes (id or #tag)"),
        ch("step", "Generation step", [
            "raw_generation",
            "lakes",
            "local_modifications",
            "underground_structures",
            "surface_structures",
            "strongholds",
            "underground_ores",
            "underground_decoration",
            "fluid_springs",
            "vegetal_decoration",
            "top_layer_modification",
        ]),
        ch("terrain_adaptation", "Fit to the ground", ["none", "beard_thin", "beard_box", "bury", "encapsulate"]),
        tx("start_pool", "Start pool (jigsaw)"),
        n("size", "Jigsaw depth", 0, 20, 1, 1),
        n("max_distance_from_center", "Reach from the start (blocks)", 1, 128, 1, 80),
        sw("use_expansion_hack", "Use the expansion hack"),
    ],
    configured_carver: [
        ch("type", "Kind", ["minecraft:cave", "minecraft:nether_cave", "minecraft:canyon"]),
        n("config.probability", "Chance per chunk", 0, 1, 0.01, 0.15),
        tx("config.replaceable", "What it may carve (#tag)"),
    ],
};

export const hasForm = (kind: string): boolean => (PART_FORMS[kind]?.length ?? 0) > 0;
