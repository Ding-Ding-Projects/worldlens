/**
 * Every other kind of file a data pack can carry, edited as checked JSON.
 *
 * Recipes, functions, tags, advancements, loot tables, predicates and biomes have their own
 * visual editors. The rest of the registries a pack can add to (item modifiers, enchantments,
 * damage types, trims, banner patterns, worldgen and so on) are listed here with the folder
 * each lives in and a small starting file that the game accepts, so a new one is never a
 * blank page. A file of one of the visual kinds that the visual editor cannot read back (a
 * smithing trim recipe, an advancement with several criteria) opens here too, instead of
 * being kept out of sight.
 *
 * Folder names follow the 1.21 rename: from pack format 48 a registry folder is singular
 * (`item_modifier`), before it the older plural (`item_modifiers`). Worldgen folders never
 * changed.
 */

export interface PartKind {
    readonly id: string;
    readonly label: string;
    /** Folder under `data/<namespace>/` from pack format 48. */
    readonly folder: string;
    /** Folder before pack format 48, when it was different. */
    readonly oldFolder?: string;
    readonly group: "items" | "combat" | "cosmetic" | "world" | "opened";
    /** The smallest file of this kind the game reads. */
    readonly template: (namespace: string) => unknown;
}

export const PART_KINDS: readonly PartKind[] = [
    {
        id: "item_modifier",
        label: "Item modifier",
        folder: "item_modifier",
        oldFolder: "item_modifiers",
        group: "items",
        template: () => [{ function: "minecraft:set_count", count: 2 }],
    },
    {
        id: "enchantment",
        label: "Enchantment",
        folder: "enchantment",
        group: "combat",
        template: () => ({
            description: { text: "New enchantment" },
            supported_items: "#minecraft:enchantable/weapon",
            weight: 5,
            max_level: 3,
            min_cost: { base: 1, per_level_above_first: 10 },
            max_cost: { base: 21, per_level_above_first: 10 },
            anvil_cost: 2,
            slots: ["mainhand"],
            effects: {},
        }),
    },
    {
        id: "enchantment_provider",
        label: "Enchantment provider",
        folder: "enchantment_provider",
        group: "combat",
        template: () => ({ type: "minecraft:by_cost", enchantments: "#minecraft:in_enchanting_table", cost: 10 }),
    },
    {
        id: "damage_type",
        label: "Damage type",
        folder: "damage_type",
        group: "combat",
        template: (ns) => ({ message_id: ns, exhaustion: 0.1, scaling: "when_caused_by_living_non_player" }),
    },
    {
        id: "trim_material",
        label: "Armour trim material",
        folder: "trim_material",
        group: "cosmetic",
        template: () => ({
            asset_name: "copper",
            description: { text: "New material", color: "#B4684D" },
        }),
    },
    {
        id: "trim_pattern",
        label: "Armour trim pattern",
        folder: "trim_pattern",
        group: "cosmetic",
        template: (ns) => ({
            asset_id: `${ns}:new_pattern`,
            description: { text: "New pattern" },
            decal: false,
        }),
    },
    {
        id: "banner_pattern",
        label: "Banner pattern",
        folder: "banner_pattern",
        group: "cosmetic",
        template: (ns) => ({ asset_id: `${ns}:new_pattern`, translation_key: `block.${ns}.banner.new_pattern` }),
    },
    {
        id: "painting_variant",
        label: "Painting",
        folder: "painting_variant",
        group: "cosmetic",
        template: (ns) => ({ asset_id: `${ns}:new_painting`, width: 2, height: 2 }),
    },
    {
        id: "chat_type",
        label: "Chat type",
        folder: "chat_type",
        group: "cosmetic",
        template: () => ({
            chat: { translation_key: "chat.type.text", parameters: ["sender", "content"] },
            narration: { translation_key: "chat.type.text.narrate", parameters: ["sender", "content"] },
        }),
    },
    {
        id: "jukebox_song",
        label: "Jukebox song",
        folder: "jukebox_song",
        group: "cosmetic",
        template: () => ({
            sound_event: "minecraft:music_disc.cat",
            description: { text: "New song" },
            length_in_seconds: 185,
            comparator_output: 2,
        }),
    },
    {
        id: "instrument",
        label: "Goat horn sound",
        folder: "instrument",
        group: "cosmetic",
        template: () => ({
            sound_event: "minecraft:item.goat_horn.sound.0",
            use_duration: 7,
            range: 256,
            description: { text: "New horn" },
        }),
    },
    {
        id: "dimension",
        label: "Dimension",
        folder: "dimension",
        group: "world",
        template: () => ({
            type: "minecraft:overworld",
            generator: {
                type: "minecraft:noise",
                settings: "minecraft:overworld",
                biome_source: { type: "minecraft:fixed", biome: "minecraft:plains" },
            },
        }),
    },
    {
        id: "dimension_type",
        label: "Dimension type",
        folder: "dimension_type",
        group: "world",
        template: () => ({
            ultrawarm: false,
            natural: true,
            coordinate_scale: 1,
            has_skylight: true,
            has_ceiling: false,
            ambient_light: 0,
            monster_spawn_light_level: 0,
            monster_spawn_block_light_limit: 0,
            piglin_safe: false,
            bed_works: true,
            respawn_anchor_works: false,
            has_raids: true,
            logical_height: 384,
            min_y: -64,
            height: 384,
            infiniburn: "#minecraft:infiniburn_overworld",
            effects: "minecraft:overworld",
        }),
    },
    {
        id: "noise_settings",
        label: "Noise settings",
        folder: "worldgen/noise_settings",
        group: "world",
        template: () => ({
            sea_level: 63,
            disable_mob_generation: false,
            aquifers_enabled: true,
            ore_veins_enabled: true,
            legacy_random_source: false,
            default_block: { Name: "minecraft:stone" },
            default_fluid: { Name: "minecraft:water", Properties: { level: "0" } },
            noise: { min_y: -64, height: 384, size_horizontal: 1, size_vertical: 2 },
            noise_router: {},
            spawn_target: [],
            surface_rule: { type: "minecraft:sequence", sequence: [] },
        }),
    },
    {
        id: "density_function",
        label: "Density function",
        folder: "worldgen/density_function",
        group: "world",
        template: () => ({ type: "minecraft:constant", argument: 0 }),
    },
    {
        id: "configured_feature",
        label: "Configured feature",
        folder: "worldgen/configured_feature",
        group: "world",
        template: () => ({
            type: "minecraft:ore",
            config: {
                size: 9,
                discard_chance_on_air_exposure: 0,
                targets: [
                    {
                        target: { predicate_type: "minecraft:tag_match", tag: "minecraft:stone_ore_replaceables" },
                        state: { Name: "minecraft:diamond_ore" },
                    },
                ],
            },
        }),
    },
    {
        id: "placed_feature",
        label: "Placed feature",
        folder: "worldgen/placed_feature",
        group: "world",
        template: (ns) => ({
            feature: `${ns}:new_configured_feature`,
            placement: [
                { type: "minecraft:count", count: 4 },
                { type: "minecraft:in_square" },
                {
                    type: "minecraft:height_range",
                    height: { type: "minecraft:uniform", min_inclusive: { absolute: -64 }, max_inclusive: { absolute: 16 } },
                },
                { type: "minecraft:biome" },
            ],
        }),
    },
    {
        id: "structure",
        label: "Structure",
        folder: "worldgen/structure",
        group: "world",
        template: (ns) => ({
            type: "minecraft:jigsaw",
            biomes: "#minecraft:is_overworld",
            step: "surface_structures",
            spawn_overrides: {},
            terrain_adaptation: "beard_thin",
            start_pool: `${ns}:start`,
            size: 1,
            start_height: { absolute: 0 },
            project_start_to_heightmap: "WORLD_SURFACE_WG",
            max_distance_from_center: 80,
            use_expansion_hack: false,
        }),
    },
    {
        id: "structure_set",
        label: "Structure set",
        folder: "worldgen/structure_set",
        group: "world",
        template: (ns) => ({
            structures: [{ structure: `${ns}:new_structure`, weight: 1 }],
            placement: { type: "minecraft:random_spread", spacing: 32, separation: 8, salt: 14357617 },
        }),
    },
    {
        id: "template_pool",
        label: "Jigsaw template pool",
        folder: "worldgen/template_pool",
        group: "world",
        template: (ns) => ({
            fallback: "minecraft:empty",
            elements: [
                {
                    weight: 1,
                    element: {
                        element_type: "minecraft:single_pool_element",
                        location: `${ns}:house`,
                        processors: "minecraft:empty",
                        projection: "rigid",
                    },
                },
            ],
        }),
    },
    {
        id: "processor_list",
        label: "Structure processor list",
        folder: "worldgen/processor_list",
        group: "world",
        template: () => ({ processors: [{ processor_type: "minecraft:block_rot", integrity: 0.8 }] }),
    },
    {
        id: "configured_carver",
        label: "Cave carver",
        folder: "worldgen/configured_carver",
        group: "world",
        template: () => ({
            type: "minecraft:cave",
            config: {
                probability: 0.15,
                y: { type: "minecraft:uniform", min_inclusive: { above_bottom: 8 }, max_inclusive: { absolute: 180 } },
                yScale: 0.5,
                lava_level: { above_bottom: 8 },
                replaceable: "#minecraft:overworld_carver_replaceables",
                horizontal_radius_multiplier: 1,
                vertical_radius_multiplier: 1,
                floor_level: -0.7,
            },
        }),
    },
    // Opened files of the visual kinds that the visual editors cannot read back.
    { id: "recipe", label: "Recipe (as JSON)", folder: "recipe", oldFolder: "recipes", group: "opened", template: () => ({}) },
    { id: "advancement", label: "Advancement (as JSON)", folder: "advancement", oldFolder: "advancements", group: "opened", template: () => ({ criteria: {} }) },
    { id: "loot_table", label: "Loot table (as JSON)", folder: "loot_table", oldFolder: "loot_tables", group: "opened", template: () => ({ pools: [] }) },
    { id: "predicate", label: "Predicate (as JSON)", folder: "predicate", oldFolder: "predicates", group: "opened", template: () => ({ condition: "minecraft:random_chance", chance: 0.5 }) },
    { id: "biome", label: "Biome (as JSON)", folder: "worldgen/biome", group: "opened", template: () => ({}) },
];

/** Kinds a person adds from the "New part" list; the opened kinds only arrive with a pack. */
export const NEW_PART_KINDS: readonly PartKind[] = PART_KINDS.filter((k) => k.group !== "opened");

export interface PackPart {
    kind: string;
    name: string;
    /** Set when the file lives under another namespace, such as an override of `minecraft`. */
    namespace?: string;
    /** The file, as the person typed it. Written verbatim when it parses. */
    text: string;
}

export const partKind = (id: string): PartKind | undefined => PART_KINDS.find((k) => k.id === id);

export function newPart(kind: string, name: string, namespace: string): PackPart {
    const k = partKind(kind);
    return { kind, name, text: `${JSON.stringify(k?.template(namespace) ?? {}, null, 2)}\n` };
}

export function partFolder(kind: PartKind, packFormat: number): string {
    return packFormat >= 48 || kind.oldFolder === undefined ? kind.folder : kind.oldFolder;
}

export function partPath(part: PackPart, namespace: string, packFormat: number): string | null {
    const k = partKind(part.kind);
    if (k === undefined) return null;
    return `data/${part.namespace ?? namespace}/${partFolder(k, packFormat)}/${part.name}.json`;
}

/** The parse error of a part, or null when it is valid JSON. */
export function partError(part: PackPart): string | null {
    try {
        JSON.parse(part.text);
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

/**
 * The part a pack file path is, if it is one. `opened` kinds are matched last, so only a file
 * the caller could not read into its visual editor ends up here.
 */
export function partFromPath(path: string, text: string): PackPart | null {
    const m = /^data\/([a-z0-9_.-]+)\/(.+)\.json$/.exec(path);
    if (m === null) return null;
    const rest = m[2]!;
    // Longest folder first, so worldgen/structure_set is not read as worldgen/structure.
    const kinds = [...PART_KINDS].sort(
        (a, b) => b.folder.length - a.folder.length,
    );
    for (const k of kinds) {
        for (const folder of [k.folder, k.oldFolder]) {
            if (folder === undefined) continue;
            if (rest.startsWith(`${folder}/`)) {
                return { kind: k.id, name: rest.slice(folder.length + 1), namespace: m[1]!, text };
            }
        }
    }
    return null;
}

/* -------------------------------------------------------------------------- */
/* Overlays                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One overlay: a folder beside `data/` whose files replace the base ones on the listed game
 * versions. Indexes point into `PACK_VERSIONS` (newest first), so `newest` is the smaller one.
 */
export interface PackOverlay {
    directory: string;
    oldest: number;
    newest: number;
}

export const OVERLAY_DIRECTORY = /^[a-z0-9_-]+$/;
