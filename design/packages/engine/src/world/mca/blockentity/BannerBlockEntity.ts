import {
    IOException,
    LenientListAdapter,
    NBTReader,
    NBTWriter,
    STRING,
    TagType,
    TypeToken,
    type BlueNBT,
    type ObjectSchema,
    type TypeAdapter,
} from "@worldlens/nbt";
import { Key } from "@worldlens/shared";
import { MCABlockEntity, MCA_BLOCK_ENTITY_FIELDS } from "./MCABlockEntity.js";
import { KEY_TOKEN } from "../data/KeyDeserializer.js";
import { ResourcePath } from "../../../resources/ResourcePath.js";
import type { Texture } from "../../../resources/pack/resourcepack/texture/Texture.js";

export const BANNER_BLOCK_ENTITY_TOKEN: TypeToken<BannerBlockEntity> =
    TypeToken.of("BannerBlockEntity");
const PATTERN_TOKEN: TypeToken<Pattern> = TypeToken.of("BannerBlockEntity.Pattern");

const BANNER_PATTERN_DIAGNOSTIC_LIMIT = 32;
const bannerPatternDiagnostics: string[] = [];

function recordBannerPatternDiagnostic(_error: IOException): void {
    if (bannerPatternDiagnostics.length === BANNER_PATTERN_DIAGNOSTIC_LIMIT)
        bannerPatternDiagnostics.shift();
    bannerPatternDiagnostics.push("Dropped one malformed banner pattern layer (IOException).");
}

/** Returns a copy of the recent payload-free banner parse diagnostics. */
export function getBannerPatternDiagnostics(): readonly string[] {
    return [...bannerPatternDiagnostics];
}

/** Clears the bounded banner parse-diagnostic history. */
export function clearBannerPatternDiagnostics(): void {
    bannerPatternDiagnostics.length = 0;
}

/** upstream: BannerBlockEntity.Pattern */
export const BANNER_PATTERN = {
    BASE: "b",
    BORDER: "bo",
    BRICKS: "bri",
    CIRCLE: "mc",
    CREEPER: "cre",
    CROSS: "cr",
    CURLY_BORDER: "cbo",
    DIAGONAL: "d",
    DIAGONAL_LEFT: "ld",
    DIAGONAL_RIGHT: "rd",
    FLOWER: "flo",
    GLOBE: "glb",
    GRADIENT: "gra",
    GRADIENT_UP: "gru",
    HALF_HORIZONTAL: "hh",
    HALF_HORIZONTAL_BOTTOM: "hhb",
    HALF_VERTICAL: "vh",
    HALF_VERTICAL_RIGHT: "vhr",
    MOJANG: "moj",
    PIGLIN: "pig",
    RHOMBUS: "mr",
    SKULL: "sku",
    SMALL_STRIPES: "ss",
    SQUARE_BOTTOM_LEFT: "bl",
    SQUARE_BOTTOM_RIGHT: "br",
    SQUARE_TOP_LEFT: "tl",
    SQUARE_TOP_RIGHT: "tr",
    STRIPE_BOTTOM: "bs",
    STRIPE_CENTER: "cs",
    STRIPE_DOWNLEFT: "dls",
    STRIPE_DOWNRIGHT: "drs",
    STRIPE_LEFT: "ls",
    STRIPE_MIDDLE: "ms",
    STRIPE_RIGHT: "rs",
    STRIPE_TOP: "ts",
    TRIANGLE_BOTTOM: "bt",
    TRIANGLE_TOP: "tt",
    TRIANGLES_BOTTOM: "bts",
    TRIANGLES_TOP: "tts",
} as const;

/** Canonical resource-location identifiers used by current banner components. */
export const BANNER_PATTERN_CURRENT = {
    BASE: "minecraft:base",
    BORDER: "minecraft:border",
    BRICKS: "minecraft:bricks",
    CIRCLE: "minecraft:circle",
    CREEPER: "minecraft:creeper",
    CROSS: "minecraft:cross",
    CURLY_BORDER: "minecraft:curly_border",
    DIAGONAL: "minecraft:diagonal",
    DIAGONAL_LEFT: "minecraft:diagonal_left",
    DIAGONAL_RIGHT: "minecraft:diagonal_right",
    FLOWER: "minecraft:flower",
    GLOBE: "minecraft:globe",
    GRADIENT: "minecraft:gradient",
    GRADIENT_UP: "minecraft:gradient_up",
    HALF_HORIZONTAL: "minecraft:half_horizontal",
    HALF_HORIZONTAL_BOTTOM: "minecraft:half_horizontal_bottom",
    HALF_VERTICAL: "minecraft:half_vertical",
    HALF_VERTICAL_RIGHT: "minecraft:half_vertical_right",
    MOJANG: "minecraft:mojang",
    PIGLIN: "minecraft:piglin",
    RHOMBUS: "minecraft:rhombus",
    SKULL: "minecraft:skull",
    SMALL_STRIPES: "minecraft:small_stripes",
    SQUARE_BOTTOM_LEFT: "minecraft:square_bottom_left",
    SQUARE_BOTTOM_RIGHT: "minecraft:square_bottom_right",
    SQUARE_TOP_LEFT: "minecraft:square_top_left",
    SQUARE_TOP_RIGHT: "minecraft:square_top_right",
    STRIPE_BOTTOM: "minecraft:stripe_bottom",
    STRIPE_CENTER: "minecraft:stripe_center",
    STRIPE_DOWNLEFT: "minecraft:stripe_downleft",
    STRIPE_DOWNRIGHT: "minecraft:stripe_downright",
    STRIPE_LEFT: "minecraft:stripe_left",
    STRIPE_MIDDLE: "minecraft:stripe_middle",
    STRIPE_RIGHT: "minecraft:stripe_right",
    STRIPE_TOP: "minecraft:stripe_top",
    TRIANGLE_BOTTOM: "minecraft:triangle_bottom",
    TRIANGLE_TOP: "minecraft:triangle_top",
    TRIANGLES_BOTTOM: "minecraft:triangles_bottom",
    TRIANGLES_TOP: "minecraft:triangles_top",
} as const;

export type KnownBannerPattern =
    | (typeof BANNER_PATTERN)[keyof typeof BANNER_PATTERN]
    | (typeof BANNER_PATTERN_CURRENT)[keyof typeof BANNER_PATTERN_CURRENT];
export type UnknownBannerPattern = string & { readonly __unknownBannerPattern: unique symbol };
export type BannerPatternId = KnownBannerPattern | UnknownBannerPattern;

/** The legacy 0..15 dye-color ids remain the on-disk banner representation. */
export type KnownBannerColor =
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15;
export type UnknownBannerColor = number & { readonly __unknownBannerColor: unique symbol };
export type KnownBannerColorIdentifier =
    | "minecraft:white"
    | "minecraft:orange"
    | "minecraft:magenta"
    | "minecraft:light_blue"
    | "minecraft:yellow"
    | "minecraft:lime"
    | "minecraft:pink"
    | "minecraft:gray"
    | "minecraft:light_gray"
    | "minecraft:cyan"
    | "minecraft:purple"
    | "minecraft:blue"
    | "minecraft:brown"
    | "minecraft:green"
    | "minecraft:red"
    | "minecraft:black";
export type UnknownBannerColorIdentifier = string & {
    readonly __unknownBannerColorIdentifier: unique symbol;
};
export type BannerColor =
    | KnownBannerColor
    | UnknownBannerColor
    | KnownBannerColorIdentifier
    | UnknownBannerColorIdentifier;

/** The render-facing layer produced from one ordered NBT pattern entry. */
export interface BannerRenderLayer {
    readonly pattern: BannerPatternId;
    readonly color: BannerColor;
    readonly texture: ResourcePath<Texture>;
    readonly tint: readonly [number, number, number];
}

export const BANNER_COLOR = {
    WHITE: 0,
    ORANGE: 1,
    MAGENTA: 2,
    LIGHT_BLUE: 3,
    YELLOW: 4,
    LIME: 5,
    PINK: 6,
    GRAY: 7,
    LIGHT_GRAY: 8,
    CYAN: 9,
    PURPLE: 10,
    BLUE: 11,
    BROWN: 12,
    GREEN: 13,
    RED: 14,
    BLACK: 15,
} as const satisfies Record<string, KnownBannerColor>;

export const BANNER_COLOR_CURRENT = {
    WHITE: "minecraft:white",
    ORANGE: "minecraft:orange",
    MAGENTA: "minecraft:magenta",
    LIGHT_BLUE: "minecraft:light_blue",
    YELLOW: "minecraft:yellow",
    LIME: "minecraft:lime",
    PINK: "minecraft:pink",
    GRAY: "minecraft:gray",
    LIGHT_GRAY: "minecraft:light_gray",
    CYAN: "minecraft:cyan",
    PURPLE: "minecraft:purple",
    BLUE: "minecraft:blue",
    BROWN: "minecraft:brown",
    GREEN: "minecraft:green",
    RED: "minecraft:red",
    BLACK: "minecraft:black",
} as const satisfies Record<string, KnownBannerColorIdentifier>;

const LEGACY_PATTERN_TO_CURRENT: Readonly<Record<string, string>> = Object.fromEntries(
    Object.entries(BANNER_PATTERN).map(([name, legacy]) => [legacy, BANNER_PATTERN_CURRENT[name as keyof typeof BANNER_PATTERN_CURRENT]]),
);

const BANNER_TINTS: Readonly<Record<string, readonly [number, number, number]>> = {
    "minecraft:white": [0.976, 1, 0.996],
    "minecraft:orange": [0.976, 0.502, 0.114],
    "minecraft:magenta": [0.780, 0.306, 0.741],
    "minecraft:light_blue": [0.227, 0.702, 0.855],
    "minecraft:yellow": [0.996, 0.847, 0.239],
    "minecraft:lime": [0.502, 0.780, 0.122],
    "minecraft:pink": [0.953, 0.545, 0.667],
    "minecraft:gray": [0.278, 0.310, 0.322],
    "minecraft:light_gray": [0.616, 0.616, 0.592],
    "minecraft:cyan": [0.086, 0.612, 0.612],
    "minecraft:purple": [0.537, 0.196, 0.722],
    "minecraft:blue": [0.235, 0.267, 0.667],
    "minecraft:brown": [0.514, 0.329, 0.196],
    "minecraft:green": [0.369, 0.486, 0.086],
    "minecraft:red": [0.690, 0.180, 0.149],
    "minecraft:black": [0.114, 0.114, 0.129],
};

function currentPatternId(pattern: BannerPatternId): string {
    return pattern.includes(":") ? pattern : LEGACY_PATTERN_TO_CURRENT[pattern] ?? pattern;
}

function currentColorId(color: BannerColor): string | null {
    if (typeof color === "string") return color.includes(":") ? color : `minecraft:${color}`;
    return Object.values(BANNER_COLOR).includes(color as KnownBannerColor)
        ? Object.values(BANNER_COLOR_CURRENT)[color as number] ?? null
        : null;
}

/**
 * Resolves the ordered typed layers into the resource-pack paths and tint values
 * consumed by a banner renderer. Unknown identifiers stay addressable rather than
 * being replaced by the missing texture or a guessed dye colour.
 */
export function bannerRenderLayers(entity: BannerBlockEntity): readonly BannerRenderLayer[] {
    return entity.getPatterns().map((layer) => {
        const pattern = layer.getPattern();
        const patternId = currentPatternId(pattern);
        const separator = patternId.indexOf(":");
        const namespace = separator === -1 ? "minecraft" : patternId.slice(0, separator);
        const value = separator === -1 ? patternId : patternId.slice(separator + 1);
        const color = layer.getColor();
        const colorId = currentColorId(color);
        return {
            pattern,
            color,
            texture: new ResourcePath<Texture>(
                `${namespace}:entity/banner/${value === "base" ? "banner_base" : value}`,
            ),
            tint: BANNER_TINTS[colorId ?? ""] ?? [1, 1, 1],
        };
    });
}

export class Pattern {
    /** Ordered NBT Pattern identifier; future identifiers are retained verbatim. */
    pattern: BannerPatternId = BANNER_PATTERN.BASE;
    /** Ordered NBT dye-color id; future numeric ids are retained verbatim. */
    color: BannerColor = 0;

    getPattern(): BannerPatternId {
        return this.pattern;
    }

    getColor(): BannerColor {
        return this.color;
    }
}

const BANNER_COLOR_ADAPTER: TypeAdapter<BannerColor> = {
    read(reader: NBTReader): BannerColor {
        if (reader.peek() === TagType.INT) return reader.nextInt() as BannerColor;
        if (reader.peek() === TagType.STRING) return reader.nextString() as BannerColor;
        throw new IOException("Expected banner color as an NBT INT or STRING");
    },

    write(value: BannerColor, writer: NBTWriter): void {
        if (typeof value === "number") writer.valueInt(value);
        else writer.valueString(value);
    },
};

const BANNER_KEY_ADAPTER: TypeAdapter<Key> = {
    read(reader: NBTReader): Key {
        return Key.parse(reader.nextString(), Key.MINECRAFT_NAMESPACE);
    },

    write(value: Key, writer: NBTWriter): void {
        writer.valueString(value.getFormatted());
    },
};

/*
public enum Color {
    WHITE, ORANGE, MAGENTA, LIGHT_BLUE, YELLOW, LIME, PINK, GRAY, LIGHT_GRAY, CYAN, PURPLE, BLUE, BROWN, GREEN,
    RED, BLACK
}
*/

export class BannerBlockEntity extends MCABlockEntity {
    customName: string | null = null; // @NBTName("CustomName")
    patterns: Pattern[] = [];

    getCustomName(): string | null {
        return this.customName;
    }

    getPatterns(): Pattern[] {
        return this.patterns;
    }
}

const PATTERN_SCHEMA: ObjectSchema<Pattern> = {
    create: () => new Pattern(),
    fields: {
        pattern: {
            names: ["Pattern", "pattern"],
            type: STRING as unknown as TypeToken<BannerPatternId>,
        },
        color: {
            names: ["Color", "color"],
            type: BANNER_COLOR_ADAPTER,
        },
    },
};

const BANNER_BLOCK_ENTITY_SCHEMA: ObjectSchema<BannerBlockEntity> = {
    create: () => new BannerBlockEntity(),
    fields: {
        ...MCA_BLOCK_ENTITY_FIELDS,
        customName: { names: ["CustomName"], type: STRING },
        patterns: {
            names: ["Patterns", "patterns"],
            type: (nbt) =>
                new LenientListAdapter<Pattern>(
                    nbt,
                    PATTERN_TOKEN,
                    recordBannerPatternDiagnostic,
                ),
        },
    },
};

export function registerBannerBlockEntitySchemas(nbt: BlueNBT): void {
    nbt.register(KEY_TOKEN, BANNER_KEY_ADAPTER);
    nbt.register(PATTERN_TOKEN, PATTERN_SCHEMA);
    nbt.register(BANNER_BLOCK_ENTITY_TOKEN, BANNER_BLOCK_ENTITY_SCHEMA);
}
