import {
    NBTReader,
    NBTWriter,
    STRING,
    TagType,
    TypeToken,
    listOf,
    type BlueNBT,
    type ObjectSchema,
    type TypeAdapter,
} from "@worldlens/nbt";
import { MCABlockEntity, MCA_BLOCK_ENTITY_FIELDS } from "./MCABlockEntity.js";

export const BANNER_BLOCK_ENTITY_TOKEN: TypeToken<BannerBlockEntity> =
    TypeToken.of("BannerBlockEntity");
const PATTERN_TOKEN: TypeToken<Pattern> = TypeToken.of("BannerBlockEntity.Pattern");

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
        throw new Error("Expected banner color as an NBT INT or STRING");
    },

    write(value: BannerColor, writer: NBTWriter): void {
        if (typeof value === "number") writer.valueInt(value);
        else writer.valueString(value);
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
        patterns: { names: ["Patterns", "patterns"], type: listOf(PATTERN_TOKEN) },
    },
};

export function registerBannerBlockEntitySchemas(nbt: BlueNBT): void {
    nbt.register(PATTERN_TOKEN, PATTERN_SCHEMA);
    nbt.register(BANNER_BLOCK_ENTITY_TOKEN, BANNER_BLOCK_ENTITY_SCHEMA);
}
