/**
 * What one element's appearance actually is, and how it turns into CSS.
 *
 * An appearance record is deliberately a record of *opinions*, not of values. A key that is
 * absent means "I have no view on this, follow whatever is above me"; a key that is present
 * means "this one, regardless". Keeping those two distinguishable is what makes per-property
 * reset work at all: resetting the weight of a tab has to remove the opinion, so the tab goes
 * back to following the theme, rather than write today's theme weight into the tab and pin it
 * there until somebody notices, six months later, that restyling the app changed everything
 * except that one tab.
 *
 * ## Colours are stored as the user wrote them
 *
 * Every colour here is a string, and it is the string the user authored: `oklch(0.7 0.1 250)`
 * stays `oklch(0.7 0.1 250)` in the record even though what is painted is an `rgb()` the
 * browser is certain to understand. Storing the resolved value instead would quietly destroy
 * information — the gamut the user chose in, the precision they typed, the notation they
 * think in — and the record is the thing that gets exported, shared and imported into a
 * build with a different engine.
 *
 * The corollary is that a colour can fail to parse, and this module never answers a failed
 * colour with black. It leaves the declaration off, keeps the authored text exactly as it
 * was, and reports it in {@link AppearanceStyle.unreadableColors} so the editor can say which
 * value it could not use and offer it back for correction. That is the contract's "never
 * silently drop a value it cannot represent" clause, applied to the one place in this feature
 * where dropping is genuinely tempting.
 */

import { colorParseErrorKey, parseColor, type ColorParseError } from "./colorParse.js";
import { cssColor } from "./colorFormat.js";
import { fontFamilyStack, type FontFamily } from "./fontCatalog.js";
import { isRainbowColor, rainbowDuration, type RainbowSpeedLevel } from "./rainbow.js";
import {
    DEFAULT_TYPOGRAPHY,
    mergeTypography,
    resetTypographyProperty,
    typographyCss,
    type TypographyCapabilities,
    type TypographyNote,
    type TypographyPropertyId,
    type TypographySpec,
} from "./typographySpec.js";

/* -------------------------------------------------------------------------- */
/* The surface an element paints                                              */
/* -------------------------------------------------------------------------- */

export type BorderStyle = "none" | "solid" | "dashed" | "dotted" | "double";

/** Chrome metadata that is rendered by the host rather than by the text box itself. */
export interface IconSpec {
    name: string;
    color: string;
    size: number;
    opacity: number;
}

export type BadgeShape = "rounded" | "pill" | "square";

export interface BadgeSpec {
    text: string;
    color: string;
    backgroundColor: string;
    shape: BadgeShape;
    visible: boolean;
}

export type SeparatorStyle = "none" | "solid" | "dashed" | "dotted" | "double";

export interface SeparatorSpec {
    visible: boolean;
    color: string;
    thickness: number;
    style: SeparatorStyle;
}

/** Shape variants are named so a host can map them to its own Material primitives. */
export type ShapeVariant = "square" | "rounded" | "pill" | "cut" | "soft";
export type DensityLevel = "comfortable" | "compact" | "spacious" | "custom";
export type MotionLevel = "system" | "standard" | "reduced" | "none";

export interface SpacingSpec {
    gap: number;
    marginInline: number;
    marginBlock: number;
    paddingInline: number;
    paddingBlock: number;
}

/** The explicit pseudo-state inventory, kept hand-written so a missing state cannot hide. */
export type AppearanceStateName =
    "hover" | "focus" | "selected" | "expanded" | "collapsed" | "disabled" | "pressed" | "active";

export const APPEARANCE_STATES: readonly AppearanceStateName[] = [
    "hover",
    "focus",
    "selected",
    "expanded",
    "collapsed",
    "disabled",
    "pressed",
    "active",
];

export interface AppearanceEffectSpec {
    elevation: number;
    opacity: number;
    shadowColor: string;
    shadowBlur: number;
    glowColor: string;
    glowRadius: number;
}

/** One state layer. Credentials never belong here; locks live in the lock store by path. */
export interface AppearanceStateLayer {
    typography?: Partial<TypographySpec>;
    surface?: Partial<SurfaceSpec>;
    effect?: Partial<AppearanceEffectSpec>;
    icon?: Partial<IconSpec>;
    badge?: Partial<BadgeSpec>;
    separator?: Partial<SeparatorSpec>;
    shape?: ShapeVariant;
    spacing?: Partial<SpacingSpec>;
    preserved?: Record<string, unknown>;
}

/**
 * Everything about an element that is not its text.
 *
 * Kept separate from typography rather than folded in, because the two are edited in
 * different tabs of the editor, reset independently, and — for a group header or a tab strip
 * — inherited from different places. A single flat bag would make "reset this element's
 * colours but keep its font" impossible to express.
 */
export interface SurfaceSpec {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderStyle: BorderStyle;
    borderRadius: number;
    paddingInline: number;
    paddingBlock: number;
    /** Material's elevation steps, 0 to 5, rendered as the tonal shadow for that level. */
    elevation: number;
    opacity: number;
    icon: IconSpec;
    badge: BadgeSpec;
    separator: SeparatorSpec;
    shape: ShapeVariant;
    density: DensityLevel;
    motion: MotionLevel;
    gap: number;
    marginInline: number;
    marginBlock: number;
}

export type SurfacePropertyId = keyof SurfaceSpec;

/** Editor order, which is also the order the search bar lists them in. */
export const SURFACE_PROPERTIES: readonly SurfacePropertyId[] = [
    "backgroundColor",
    "borderColor",
    "borderWidth",
    "borderStyle",
    "borderRadius",
    "paddingInline",
    "paddingBlock",
    "elevation",
    "opacity",
    "icon",
    "badge",
    "separator",
    "shape",
    "density",
    "motion",
    "gap",
    "marginInline",
    "marginBlock",
];

/**
 * An element that has been given no surface opinions at all.
 *
 * Every colour is the empty string, meaning "inherit", rather than a concrete value. An
 * element whose default background were a real colour would paint over whatever it sits on
 * the moment it acquired any override at all, which is exactly the behaviour that makes a
 * theming system feel like it is fighting the layout.
 */
export const DEFAULT_SURFACE: SurfaceSpec = {
    backgroundColor: "",
    borderColor: "",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: 0,
    paddingInline: 0,
    paddingBlock: 0,
    elevation: 0,
    opacity: 1,
    icon: { name: "", color: "", size: 24, opacity: 1 },
    badge: { text: "", color: "", backgroundColor: "", shape: "rounded", visible: false },
    separator: { visible: false, color: "", thickness: 1, style: "solid" },
    shape: "square",
    density: "comfortable",
    motion: "system",
    gap: 0,
    marginInline: 0,
    marginBlock: 0,
};

function mergeSurface(base: SurfaceSpec, ...layers: Partial<SurfaceSpec>[]): SurfaceSpec {
    return layers.reduce<SurfaceSpec>(
        (current, layer) => ({
            backgroundColor: layer.backgroundColor ?? current.backgroundColor,
            borderColor: layer.borderColor ?? current.borderColor,
            borderWidth: layer.borderWidth ?? current.borderWidth,
            borderStyle: layer.borderStyle ?? current.borderStyle,
            borderRadius: layer.borderRadius ?? current.borderRadius,
            paddingInline: layer.paddingInline ?? current.paddingInline,
            paddingBlock: layer.paddingBlock ?? current.paddingBlock,
            elevation: layer.elevation ?? current.elevation,
            opacity: layer.opacity ?? current.opacity,
            icon:
                layer.icon === undefined ? { ...current.icon } : { ...current.icon, ...layer.icon },
            badge:
                layer.badge === undefined
                    ? { ...current.badge }
                    : { ...current.badge, ...layer.badge },
            separator:
                layer.separator === undefined
                    ? { ...current.separator }
                    : { ...current.separator, ...layer.separator },
            shape: layer.shape ?? current.shape,
            density: layer.density ?? current.density,
            motion: layer.motion ?? current.motion,
            gap: layer.gap ?? current.gap,
            marginInline: layer.marginInline ?? current.marginInline,
            marginBlock: layer.marginBlock ?? current.marginBlock,
        }),
        { ...base },
    );
}

/* -------------------------------------------------------------------------- */
/* The record                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One element's overrides.
 *
 * `preserved` is the interesting field. A theme file exported by a later build can carry
 * sections this build has never heard of, and the tempting thing to do with them is nothing —
 * which quietly deletes them on the next save, so a user who round-trips their theme through
 * an older version loses whatever the newer one added. They are kept verbatim instead, and
 * written back out on export. This build cannot render them and does not pretend to; it
 * simply refuses to be the reason they disappear.
 */
export interface AppearanceRecord {
    typography: Partial<TypographySpec>;
    surface: Partial<SurfaceSpec>;
    /** The id of a preset this element follows, or the empty string for none. */
    inherit: string;
    /** Keys from a future version of the format, kept so exporting does not lose them. */
    preserved: Record<string, unknown>;
    /** Per-state opinions. Unknown state properties survive import and export. */
    states: Partial<Record<AppearanceStateName, AppearanceStateLayer>>;
}

export function emptyRecord(): AppearanceRecord {
    return { typography: {}, surface: {}, inherit: "", preserved: {}, states: {} };
}

/** True when the record expresses no opinion at all, so the editor can offer no reset. */
export function isRecordEmpty(record: AppearanceRecord): boolean {
    return (
        Object.keys(record.typography).length === 0 &&
        Object.keys(record.surface).length === 0 &&
        record.inherit === "" &&
        Object.keys(record.preserved).length === 0 &&
        Object.keys(record.states).length === 0
    );
}

/**
 * Folds a chain of records into one, later entries winning.
 *
 * The chain is built by the caller and is normally global, then preset, then element, which
 * is the order the contract's inheritance clause describes. `preserved` is merged too, so a
 * key a preset carried from a future build is not lost because an element also had one.
 */
export function mergeRecords(...records: readonly AppearanceRecord[]): AppearanceRecord {
    return records.reduce<AppearanceRecord>(
        (current, next) => ({
            typography: { ...current.typography, ...next.typography },
            surface: { ...current.surface, ...next.surface },
            inherit: next.inherit === "" ? current.inherit : next.inherit,
            preserved: { ...current.preserved, ...next.preserved },
            states: mergeStateLayers(current.states, next.states),
        }),
        emptyRecord(),
    );
}

/** The fully-resolved appearance a chain of records describes. */
export interface ResolvedAppearance {
    typography: TypographySpec;
    surface: SurfaceSpec;
    states: Partial<Record<AppearanceStateName, AppearanceStateLayer>>;
}

function mergeStateLayers(
    base: Partial<Record<AppearanceStateName, AppearanceStateLayer>>,
    next: Partial<Record<AppearanceStateName, AppearanceStateLayer>>,
): Partial<Record<AppearanceStateName, AppearanceStateLayer>> {
    const merged: Partial<Record<AppearanceStateName, AppearanceStateLayer>> = { ...base };
    for (const state of APPEARANCE_STATES) {
        const left = base[state];
        const right = next[state];
        if (left === undefined && right === undefined) continue;
        merged[state] = {
            ...left,
            ...right,
            typography: { ...left?.typography, ...right?.typography },
            surface: { ...left?.surface, ...right?.surface },
            effect: { ...left?.effect, ...right?.effect },
            icon: { ...left?.icon, ...right?.icon },
            badge: { ...left?.badge, ...right?.badge },
            separator: { ...left?.separator, ...right?.separator },
            spacing: { ...left?.spacing, ...right?.spacing },
            preserved: { ...left?.preserved, ...right?.preserved },
        };
    }
    return merged;
}

export function resolveRecords(...records: readonly AppearanceRecord[]): ResolvedAppearance {
    const merged = mergeRecords(...records);
    return {
        typography: mergeTypography(DEFAULT_TYPOGRAPHY, merged.typography),
        surface: mergeSurface(DEFAULT_SURFACE, merged.surface),
        states: merged.states,
    };
}

/** Removes one typography opinion, returning a new record and leaving the old one alone. */
export function resetTypography(
    record: AppearanceRecord,
    id: TypographyPropertyId,
): AppearanceRecord {
    return { ...record, typography: resetTypographyProperty(record.typography, id) };
}

/** Removes one surface opinion, returning a new record. */
export function resetSurface(record: AppearanceRecord, id: SurfacePropertyId): AppearanceRecord {
    const surface: Partial<SurfaceSpec> = { ...record.surface };
    delete surface[id];
    return { ...record, surface };
}

export type AppearanceStatePropertyGroup =
    "typography" | "surface" | "effect" | "spacing" | "icon" | "badge" | "separator" | "shape";

/** Removes one opinion from one pseudo-state while retaining every sibling opinion. */
export function resetAppearanceStateProperty(
    record: AppearanceRecord,
    state: AppearanceStateName,
    group: AppearanceStatePropertyGroup,
    id: TypographyPropertyId | SurfacePropertyId,
): AppearanceRecord {
    const layer = record.states[state];
    if (layer === undefined) return record;
    const nextLayer: AppearanceStateLayer = { ...layer };
    if (group === "shape") delete nextLayer.shape;
    else {
        const values = { ...(layer[group] ?? {}) } as Record<string, unknown>;
        delete values[id];
        if (Object.keys(values).length === 0) delete nextLayer[group];
        else (nextLayer as Record<string, unknown>)[group] = values;
    }
    const states = { ...record.states, [state]: nextLayer };
    if (Object.keys(nextLayer).length === 0) delete states[state];
    return { ...record, states };
}

/** Resolves one named pseudo-state over a base appearance without mutating either record. */
export function resolveStateAppearance(
    resolved: ResolvedAppearance,
    state: AppearanceStateName | undefined,
): ResolvedAppearance {
    if (state === undefined) return resolved;
    const layer = resolved.states[state];
    if (layer === undefined) return resolved;
    const surface = {
        ...resolved.surface,
        ...(layer.surface ?? {}),
        ...(layer.icon === undefined ? {} : { icon: { ...resolved.surface.icon, ...layer.icon } }),
        ...(layer.badge === undefined
            ? {}
            : { badge: { ...resolved.surface.badge, ...layer.badge } }),
        ...(layer.separator === undefined
            ? {}
            : { separator: { ...resolved.surface.separator, ...layer.separator } }),
        ...(layer.shape === undefined ? {} : { shape: layer.shape }),
        ...(layer.spacing === undefined ? {} : layer.spacing),
        ...(layer.effect?.elevation === undefined ? {} : { elevation: layer.effect.elevation }),
        ...(layer.effect?.opacity === undefined ? {} : { opacity: layer.effect.opacity }),
    };
    return {
        ...resolved,
        typography: mergeTypography(resolved.typography, layer.typography ?? {}),
        surface: mergeSurface(resolved.surface, surface),
    };
}

/* -------------------------------------------------------------------------- */
/* Colours, resolved but never replaced                                       */
/* -------------------------------------------------------------------------- */

/** A colour string that could not be read, kept beside the reason it could not. */
export interface UnreadableColor {
    /** The record field it came from, e.g. `textColor` or `backgroundColor`. */
    property: string;
    /** Exactly what the user typed. Never normalised, never discarded. */
    authored: string;
    error: ColorParseError;
    /** The i18n key naming that failure, so the editor renders it without a switch. */
    messageKey: string;
}

/**
 * An authored colour turned into something a browser will certainly paint.
 *
 * The empty string means "inherit" and is not a failure — most colour fields are empty most
 * of the time, and treating that as an error would fill the editor with warnings about
 * settings nobody has touched.
 */
function resolveColor(property: string, authored: string, into: UnreadableColor[]): string {
    if (authored.trim() === "") return "";
    if (isRainbowColor(authored)) return "var(--appearance-rainbow-color)";

    const parsed = parseColor(authored);
    if (!parsed.ok) {
        into.push({
            property,
            authored,
            error: parsed.error,
            messageKey: colorParseErrorKey(parsed.error),
        });
        return "";
    }
    return cssColor(parsed.value.color);
}

/* -------------------------------------------------------------------------- */
/* CSS                                                                        */
/* -------------------------------------------------------------------------- */

/** Material Design 3's elevation shadows, indexed by level. Level 0 draws nothing. */
const ELEVATION_SHADOWS: readonly string[] = [
    "",
    "0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px 1px rgba(0, 0, 0, 0.15)",
    "0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px 2px rgba(0, 0, 0, 0.15)",
    "0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3)",
    "0 6px 10px 4px rgba(0, 0, 0, 0.15), 0 2px 3px rgba(0, 0, 0, 0.3)",
    "0 8px 12px 6px rgba(0, 0, 0, 0.15), 0 4px 4px rgba(0, 0, 0, 0.3)",
];

/** Everything the editor needs to both render an element and explain what it could not. */
export interface AppearanceStyle {
    /** A plain object for a Vue `:style` binding. */
    style: Record<string, string>;
    /** Typography properties this engine refused. The values stay in the record. */
    unsupported: TypographyPropertyId[];
    /** Honest notes about declarations CSS can only express once. */
    notes: TypographyNote[];
    /** Colours that could not be read. Kept in the record, not applied, and reported. */
    unreadableColors: UnreadableColor[];
}

function surfaceCss(
    surface: SurfaceSpec,
    unreadable: UnreadableColor[],
    rainbowSpeed: RainbowSpeedLevel,
): Record<string, string> {
    const style: Record<string, string> = {};

    const background = resolveColor("backgroundColor", surface.backgroundColor, unreadable);
    if (background !== "") style["background-color"] = background;

    if (surface.borderStyle !== "none" && surface.borderWidth > 0) {
        const border = resolveColor("borderColor", surface.borderColor, unreadable);
        style["border-style"] = surface.borderStyle;
        style["border-width"] = `${surface.borderWidth}px`;
        if (border !== "") style["border-color"] = border;
    } else if (surface.borderColor.trim() !== "") {
        // A colour with no width and no style paints nothing, and a user who set one and
        // saw no change would reasonably conclude the editor is broken. It is still read,
        // so a malformed value is still reported rather than ignored twice over.
        resolveColor("borderColor", surface.borderColor, unreadable);
    }

    if (surface.borderRadius > 0) style["border-radius"] = `${surface.borderRadius}px`;
    if (surface.paddingInline > 0) style["padding-inline"] = `${surface.paddingInline}px`;
    if (surface.paddingBlock > 0) style["padding-block"] = `${surface.paddingBlock}px`;

    const elevation = Math.round(Math.min(5, Math.max(0, surface.elevation)));
    const shadow = ELEVATION_SHADOWS[elevation] ?? "";
    if (shadow !== "") style["box-shadow"] = shadow;

    if (surface.opacity < 1) style.opacity = String(Math.max(0, surface.opacity));

    // These custom properties are the stable seam for host chrome. The appearance model keeps
    // icon and badge identity as data, while each host decides which real Material primitive
    // consumes them. Unknown names remain harmless and exportable rather than being discarded.
    if (surface.icon.name !== "") style["--appearance-icon-name"] = surface.icon.name;
    if (surface.icon.color !== "") {
        const iconColor = resolveColor("icon.color", surface.icon.color, unreadable);
        if (iconColor !== "") style["--appearance-icon-color"] = iconColor;
    }
    style["--appearance-icon-size"] = `${Math.max(1, surface.icon.size)}px`;
    style["--appearance-icon-opacity"] = String(Math.max(0, Math.min(1, surface.icon.opacity)));
    if (surface.badge.text !== "") style["--appearance-badge-text"] = surface.badge.text;
    if (surface.badge.color !== "") {
        const badgeColor = resolveColor("badge.color", surface.badge.color, unreadable);
        if (badgeColor !== "") style["--appearance-badge-color"] = badgeColor;
    }
    if (surface.badge.backgroundColor !== "") {
        const badgeBackground = resolveColor(
            "badge.backgroundColor",
            surface.badge.backgroundColor,
            unreadable,
        );
        if (badgeBackground !== "") style["--appearance-badge-background"] = badgeBackground;
    }
    style["--appearance-badge-shape"] = surface.badge.shape;
    style["--appearance-badge-visible"] = surface.badge.visible ? "1" : "0";
    if (surface.separator.visible) {
        const separatorColor = resolveColor("separator.color", surface.separator.color, unreadable);
        if (separatorColor !== "") style["--appearance-separator-color"] = separatorColor;
        style["--appearance-separator-width"] = `${Math.max(0, surface.separator.thickness)}px`;
        style["--appearance-separator-style"] = surface.separator.style;
    }
    style["--appearance-shape"] = surface.shape;
    style["--appearance-density"] = surface.density;
    style["--appearance-motion"] = surface.motion;
    style["--appearance-gap"] = `${Math.max(0, surface.gap)}px`;
    style["--appearance-margin-inline"] = `${surface.marginInline}px`;
    style["--appearance-margin-block"] = `${surface.marginBlock}px`;
    style["--appearance-rainbow-duration"] = rainbowDuration(rainbowSpeed);
    style["--appearance-rainbow-color"] = "hsl(210 80% 55%)";
    style["--appearance-rainbow-reduced-color"] = "hsl(210 80% 55%)";

    return style;
}

/**
 * The complete style for a resolved appearance, with everything it could not do reported.
 *
 * Colours are resolved into `rgb()` before typography sees them. That is not a preference for
 * one notation: a saved `oklch()` renders as nothing at all on an engine that has not shipped
 * it, and an appearance record whose meaning depends on the browser version is not a record.
 * The authored text is untouched in the record either way, so the day the engine catches up,
 * nothing needs migrating.
 */
export function appearanceStyle(
    resolved: ResolvedAppearance,
    capabilities: TypographyCapabilities,
    catalog?: readonly FontFamily[],
    state: AppearanceStateName | undefined = undefined,
    rainbowSpeed: RainbowSpeedLevel = 3,
): AppearanceStyle {
    const unreadableColors: UnreadableColor[] = [];

    const stateLayer = state === undefined ? undefined : resolved.states[state];
    const stateTypography =
        stateLayer?.typography === undefined
            ? resolved.typography
            : mergeTypography(resolved.typography, stateLayer.typography);
    const stateSurface =
        stateLayer?.surface === undefined
            ? resolved.surface
            : mergeSurface(resolved.surface, stateLayer.surface);

    const typography: TypographySpec = {
        ...stateTypography,
        textColor: resolveColor("textColor", stateTypography.textColor, unreadableColors),
        highlight: resolveColor("highlight", stateTypography.highlight, unreadableColors),
        underlineColor: resolveColor(
            "underlineColor",
            stateTypography.underlineColor,
            unreadableColors,
        ),
        outlineColor: resolveColor("outlineColor", stateTypography.outlineColor, unreadableColors),
        shadow: {
            ...stateTypography.shadow,
            color: resolveColor("shadow.color", stateTypography.shadow.color, unreadableColors),
        },
        glow: {
            ...stateTypography.glow,
            color: resolveColor("glow.color", stateTypography.glow.color, unreadableColors),
        },
    };

    const stack = fontFamilyStack(typography.fontFamily, catalog, typography.fontIdentity);
    const text = typographyCss(typography, capabilities, stack);

    const style = { ...text.style, ...surfaceCss(stateSurface, unreadableColors, rainbowSpeed) };
    const rainbowValues = [
        stateTypography.textColor,
        stateTypography.highlight,
        stateTypography.underlineColor,
        stateTypography.outlineColor,
        stateTypography.shadow.color,
        stateTypography.glow.color,
        stateSurface.backgroundColor,
        stateSurface.borderColor,
        stateSurface.icon.color,
        stateSurface.badge.color,
        stateSurface.badge.backgroundColor,
        stateSurface.separator.color,
    ];
    style["--appearance-rainbow"] = rainbowValues.some(isRainbowColor) ? "true" : "false";
    if (stateLayer?.effect !== undefined) {
        const effect = stateLayer.effect;
        if (effect.elevation !== undefined) {
            const level = Math.round(Math.min(5, Math.max(0, effect.elevation)));
            const shadow = ELEVATION_SHADOWS[level] ?? "";
            if (shadow !== "") style["box-shadow"] = shadow;
        }
        if (effect.opacity !== undefined)
            style.opacity = String(Math.max(0, Math.min(1, effect.opacity)));
        if (effect.shadowColor !== undefined)
            style["--appearance-state-shadow-color"] = effect.shadowColor;
        if (effect.shadowBlur !== undefined)
            style["--appearance-state-shadow-blur"] = `${Math.max(0, effect.shadowBlur)}px`;
        if (effect.glowColor !== undefined)
            style["--appearance-state-glow-color"] = effect.glowColor;
        if (effect.glowRadius !== undefined)
            style["--appearance-state-glow-radius"] = `${Math.max(0, effect.glowRadius)}px`;
    }
    if (stateLayer?.shape !== undefined) style["--appearance-shape"] = stateLayer.shape;
    if (stateLayer?.spacing !== undefined) {
        for (const [key, value] of Object.entries(stateLayer.spacing)) {
            if (typeof value === "number") style[`--appearance-${key}`] = `${value}px`;
        }
    }

    return {
        style,
        unsupported: [...text.unsupported],
        notes: [...text.notes],
        unreadableColors,
    };
}
