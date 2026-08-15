/**
 * The measuring instrument itself: reads real, resolved values off a real DOM node, rather
 * than trusting whatever a component's source claims it draws. Every number this file
 * produces comes from `getBoundingClientRect()` and `getComputedStyle()` - the browser telling
 * us what it actually painted - never from re-parsing a `.scss` file or a prop value. That is
 * the whole point of the harness: two panes measured through the identical code path, so a
 * difference in the numbers is a difference in the paint, not a difference in how carefully
 * two separate readers happened to look.
 *
 * This module is deliberately framework-free (no Vue import) so it can be unit-tested in
 * `measure.test.ts` under plain jsdom, and so `scripts/capture.mjs` (Node, outside the
 * renderer) can trust that what it reads back via `page.evaluate()` is the exact same
 * arithmetic the live UI displays - one measuring function, two callers, per the repository's
 * own "guard tests catch a thing done wrongly, never a thing not done at all" lesson: a second,
 * hand-rolled measurement path in the capture script would be exactly the kind of drift that
 * lesson warns about.
 */

/** One component's measured shape, type, colour and contrast, read straight off its DOM node. */
export interface ComponentMeasurement {
    /** `getBoundingClientRect().height`, in CSS pixels. */
    readonly heightPx: number;
    /** `getBoundingClientRect().width`, in CSS pixels. */
    readonly widthPx: number;
    /**
     * The corner radius the browser actually paints, clamped to `min(width, height) / 2` the
     * way every UA clamps an over-large declared radius at paint time. `getComputedStyle`
     * returns the *declared* value verbatim (a "9999px" pill reads back as 9999, not as the
     * visually clamped radius), which would make every pill-shaped component "measure" as
     * 9999px regardless of its real size - true of nothing a human looking at the screen would
     * call true, and useless for comparing two pills of different heights. This is the
     * clamped, paint-accurate value; {@link declaredCornerRadiusPx} keeps the raw one for
     * anyone who wants it.
     */
    readonly cornerRadiusPx: number;
    /** The raw `border-*-radius` value(s) as declared, before the clamp above. */
    readonly declaredCornerRadiusPx: number;
    /** False when the four corners are not all equal (e.g. a filled text field's top-only radius). */
    readonly cornerRadiusUniform: boolean;
    /** True when the effective corner radius reaches the pill limit (`min(w, h) / 2`, minus a half-pixel tolerance). */
    readonly isPill: boolean;
    readonly fontFamily: string;
    readonly fontSizePx: number;
    /** `font-weight` as the browser resolves it - almost always numeric, but kept as a string since CSS allows keywords. */
    readonly fontWeight: string;
    readonly lineHeightPx: number;
    readonly letterSpacingPx: number;
    /** Resolved `color`, always `rgb(...)`/`rgba(...)` - never a keyword, never `currentColor`. */
    readonly textColor: string;
    /**
     * The element's own background if it is not transparent; otherwise the nearest ancestor's,
     * walked up the DOM. A text button's own background is `rgba(0,0,0,0)` by design - the
     * container that actually paints behind it is what a real reader compares its text
     * against, so that is what {@link contrastRatio} is computed from too.
     */
    readonly backgroundColor: string;
    /** Where {@link backgroundColor} came from: the element itself, an ancestor, or nowhere (no opaque background found at all). */
    readonly backgroundSource: "self" | "ancestor" | "none";
    /**
     * WCAG 2.x contrast ratio between {@link textColor} and {@link backgroundColor}, or `null`
     * when no opaque background could be resolved at all (so no honest ratio exists to report).
     */
    readonly contrastRatio: number | null;
    /**
     * The smaller of the interactive element's own width/height - a bound on its touch target,
     * not a full account of it. This does **not** attempt to discover invisible hit-area
     * padding (a checkbox's 48px tap zone extending past its 18px visible box via a
     * pseudo-element or an ancestor's padding): that padding is real in this app (Vuetify
     * expands several controls' click targets past their visual box) but is not reliably
     * observable from computed style alone without knowing which ancestor is the actual event
     * target. Reported honestly as a floor, with that limitation stated again in the UI next
     * to every number this produces - see `RowShell.vue`.
     */
    readonly minVisibleTargetPx: number;
}

/** Four longhand corner radii, in declaration order (CSS's own `border-radius` order). */
function readCornerRadii(style: CSSStyleDeclaration): [number, number, number, number] {
    return [
        parseFloat(style.borderTopLeftRadius) || 0,
        parseFloat(style.borderTopRightRadius) || 0,
        parseFloat(style.borderBottomRightRadius) || 0,
        parseFloat(style.borderBottomLeftRadius) || 0,
    ];
}

const CORNER_TOLERANCE_PX = 0.5;

/** True when an `rgb()`/`rgba()` computed-style string is fully transparent (alpha ~0 or the `transparent` keyword). */
function isTransparentColor(value: string): boolean {
    if (value === "" || value === "transparent") return true;
    const match = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+))?\s*\)/.exec(value);
    if (match === null) return false;
    const alpha = match[1];
    return alpha !== undefined && parseFloat(alpha) < 0.001;
}

/** Parses a resolved `rgb()`/`rgba()` computed-style string into 0-255 channel values, or `null` if it cannot. */
export function parseRgb(value: string): readonly [number, number, number] | null {
    const match = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+)?\s*\)/.exec(value);
    if (match === null) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Walks from `el` up through `parentElement` looking for the first non-transparent
 * `background-color`, capped at a generous depth so a malformed page cannot loop forever. Real
 * layouts in this app are never more than a handful of elements deep from an interactive leaf
 * to its painted container.
 */
function resolveEffectiveBackground(el: Element): { color: string; source: "self" | "ancestor" | "none" } {
    let node: Element | null = el;
    let hops = 0;
    const MAX_HOPS = 12;
    while (node !== null && hops <= MAX_HOPS) {
        const bg = getComputedStyle(node).backgroundColor;
        if (!isTransparentColor(bg)) {
            return { color: bg, source: hops === 0 ? "self" : "ancestor" };
        }
        node = node.parentElement;
        hops += 1;
    }
    return { color: "rgba(0, 0, 0, 0)", source: "none" };
}

/**
 * WCAG 2.x relative luminance. `c` is a single sRGB channel in 0-255; the linearisation
 * threshold (0.03928) and the 2.4 gamma are the spec's own constants, not tuned values -
 * see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance, transcribed here rather than
 * pulled from a library because no colour-contrast package is a dependency anywhere in this
 * workspace and this is twelve lines of well-specified arithmetic, not something worth a new
 * dependency for.
 */
function srgbChannelToLinear(c: number): number {
    const normalized = c / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: readonly [number, number, number]): number {
    const [r, g, b] = rgb;
    return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

/** WCAG 2.x contrast ratio between two colours, order-independent, in `[1, 21]`. */
export function contrastRatio(
    a: readonly [number, number, number],
    b: readonly [number, number, number],
): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const lighter = Math.max(la, lb);
    const darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Measures one DOM element exactly as painted right now. Call again after any theme, scale or
 * layout change - nothing here is cached, on purpose: a stale measurement displayed as current
 * would be a worse failure than a missing one, and re-measuring is cheap (a handful of
 * `getComputedStyle` calls) next to the cost of getting that wrong.
 */
export function measureComponent(el: HTMLElement): ComponentMeasurement {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    const radii = readCornerRadii(style);
    const declaredCornerRadiusPx = Math.max(...radii);
    const cornerRadiusUniform = radii.every((r) => Math.abs(r - radii[0]!) <= CORNER_TOLERANCE_PX);
    const pillLimit = Math.min(rect.width, rect.height) / 2;
    // Every corner clamped individually, then the uniform/non-uniform question re-asked on the
    // clamped values: a text field's square bottom corners (declared 0) and rounded top
    // corners (declared 12px, clamped to whatever the field's own half-height allows) must
    // stay visibly different after clamping, not collapse into "uniform" just because 0 never
    // needed clamping.
    const clampedRadii = radii.map((r) => Math.min(r, pillLimit)) as [number, number, number, number];
    const cornerRadiusPx = Math.max(...clampedRadii);
    const isPill = declaredCornerRadiusPx >= pillLimit - CORNER_TOLERANCE_PX && pillLimit > 0;

    const fontSizePx = parseFloat(style.fontSize) || 0;
    const lineHeightPx =
        style.lineHeight === "normal" ? Math.round(fontSizePx * 1.2) : parseFloat(style.lineHeight) || 0;
    const letterSpacingPx = style.letterSpacing === "normal" ? 0 : parseFloat(style.letterSpacing) || 0;

    const background = resolveEffectiveBackground(el);
    const textRgb = parseRgb(style.color);
    const bgRgb = background.source === "none" ? null : parseRgb(background.color);
    const contrast = textRgb !== null && bgRgb !== null ? contrastRatio(textRgb, bgRgb) : null;

    return {
        heightPx: rect.height,
        widthPx: rect.width,
        cornerRadiusPx,
        declaredCornerRadiusPx,
        cornerRadiusUniform,
        isPill,
        fontFamily: style.fontFamily,
        fontSizePx,
        fontWeight: style.fontWeight,
        lineHeightPx,
        letterSpacingPx,
        textColor: style.color,
        backgroundColor: background.color,
        backgroundSource: background.source,
        contrastRatio: contrast,
        minVisibleTargetPx: Math.min(rect.width, rect.height),
    };
}

/** One field's comparison between the two panes. */
export interface FieldDiff {
    readonly reference: number | string | null;
    readonly worldlens: number | string | null;
    /** `worldlens - reference` for numeric fields; `null` for non-numeric ones. */
    readonly deltaNumeric: number | null;
    /** True when the two sides are NOT equal within the field's tolerance - never "wrong", just "different"; see `RowShell.vue`. */
    readonly differs: boolean;
}

const NUMERIC_TOLERANCE_PX = 0.5;
const CONTRAST_TOLERANCE = 0.05;
const WEIGHT_TOLERANCE = 0;

function numericDiff(a: number, b: number, tolerance: number): FieldDiff {
    return {
        reference: a,
        worldlens: b,
        deltaNumeric: b - a,
        differs: Math.abs(b - a) > tolerance,
    };
}

function stringDiff(a: string, b: string): FieldDiff {
    return { reference: a, worldlens: b, deltaNumeric: null, differs: a !== b };
}

/** A full row's diff: one {@link FieldDiff} per measured field, keyed the same as {@link ComponentMeasurement}. */
export interface MeasurementDiff {
    readonly cornerRadiusPx: FieldDiff;
    readonly heightPx: FieldDiff;
    readonly widthPx: FieldDiff;
    readonly minVisibleTargetPx: FieldDiff;
    readonly fontFamily: FieldDiff;
    readonly fontSizePx: FieldDiff;
    readonly fontWeight: FieldDiff;
    readonly lineHeightPx: FieldDiff;
    readonly letterSpacingPx: FieldDiff;
    readonly contrastRatio: FieldDiff;
}

/**
 * Compares a reference measurement against the real-component measurement, field by field.
 * Deliberately produces no verdict, no pass/fail, no colour beyond "differs or not": whether a
 * difference is a defect or a deliberate, documented choice (Worldlens's text fields are 12px-
 * cornered by design, not 4px like the baseline spec - see `md3Reference.scss`) is a judgement
 * only a reader with the row's own citations in view can make. This function's only job is to
 * make sure no difference goes unreported.
 */
export function diffMeasurements(reference: ComponentMeasurement, worldlens: ComponentMeasurement): MeasurementDiff {
    return {
        cornerRadiusPx: numericDiff(reference.cornerRadiusPx, worldlens.cornerRadiusPx, NUMERIC_TOLERANCE_PX),
        heightPx: numericDiff(reference.heightPx, worldlens.heightPx, NUMERIC_TOLERANCE_PX),
        widthPx: numericDiff(reference.widthPx, worldlens.widthPx, NUMERIC_TOLERANCE_PX),
        minVisibleTargetPx: numericDiff(
            reference.minVisibleTargetPx,
            worldlens.minVisibleTargetPx,
            NUMERIC_TOLERANCE_PX,
        ),
        fontFamily: stringDiff(reference.fontFamily, worldlens.fontFamily),
        fontSizePx: numericDiff(reference.fontSizePx, worldlens.fontSizePx, NUMERIC_TOLERANCE_PX),
        fontWeight: numericDiff(
            Number(reference.fontWeight) || 0,
            Number(worldlens.fontWeight) || 0,
            WEIGHT_TOLERANCE,
        ),
        lineHeightPx: numericDiff(reference.lineHeightPx, worldlens.lineHeightPx, NUMERIC_TOLERANCE_PX),
        letterSpacingPx: numericDiff(reference.letterSpacingPx, worldlens.letterSpacingPx, NUMERIC_TOLERANCE_PX),
        contrastRatio: numericDiff(
            reference.contrastRatio ?? Number.NaN,
            worldlens.contrastRatio ?? Number.NaN,
            CONTRAST_TOLERANCE,
        ),
    };
}
