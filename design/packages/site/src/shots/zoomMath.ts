/**
 * Pure geometry for the screenshot lightbox: how large a capture displays the moment it
 * opens, how far a visitor can zoom in, and how far the image can be dragged before it
 * would leave empty space at an edge.
 *
 * Kept free of the DOM on purpose. `getBoundingClientRect` and `naturalWidth` never return
 * real numbers under the test runner (jsdom performs no layout and decodes no images), so
 * the only way to actually prove this arithmetic is to hand it plain numbers and check what
 * comes back. Every caller -- the real `Lightbox`, and its tests -- goes through this file
 * rather than each carrying its own copy of the same four formulas.
 */

export interface Size {
    readonly width: number;
    readonly height: number;
}

export interface Offset {
    readonly x: number;
    readonly y: number;
}

/** Below this a size is not something the formulas below can reason about. */
function isUsable(size: Size): boolean {
    return Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;
}

/**
 * The scale that shows the whole capture inside the viewport with nothing cropped.
 *
 * This is the "as large as the viewport allows" reading of the requirement, not "no larger
 * than the image's own pixels": a capture smaller than the stage -- the notification panel,
 * the regex-builder dialog -- is scaled *up* to fill the space rather than floating at
 * postage-stamp size in the middle of a dark screen. A capture whose own or the viewport's
 * size is not yet known (the image has not loaded, or the stage has not been measured) gets
 * a scale of 1 rather than a division by zero or a NaN that would poison everything after it.
 */
export function computeFitScale(image: Size, viewport: Size): number {
    if (!isUsable(image) || !isUsable(viewport)) return 1;
    return Math.min(viewport.width / image.width, viewport.height / image.height);
}

/**
 * The bottom of the zoom range.
 *
 * Not simply the fit scale: a capture natively smaller than the viewport (the notification
 * panel, the regex-builder dialog) has a fit scale *above* 1, because fit scales it up to
 * fill the space. If the floor were the fit scale in that case, "100%" -- natural size, the
 * other half of the double-click/double-tap toggle the task calls for -- would sit *below*
 * the floor and be immediately clamped back up to fit, which is exactly the bug this
 * function exists to prevent (caught by `Lightbox.test.ts`'s double-click test: toggling to
 * natural size on a small capture landed back on fit scale instead). The floor is therefore
 * whichever of fit and natural size is smaller, so both are always reachable.
 */
export function computeMinScale(fitScale: number): number {
    return Math.min(fitScale, 1);
}

/** Multiplied against the fit scale (or against natural size, whichever is larger) for the ceiling. */
export const ZOOM_RANGE_ABOVE_FIT = 4;

/**
 * The top of the zoom range.
 *
 * At least four times the fit scale, so a capture that already fills the viewport at fit
 * still gets a genuine four-times headroom on top of that -- the interface text inside it
 * is the whole reason this control exists, and it has to actually get bigger. Also at least
 * four times natural size (a scale of 1), so a capture whose fit scale is tiny -- the
 * full-page changelog scroll, scaled down to a sliver so the whole thing is visible at once
 * -- still reaches a scale that makes its text legible, rather than four times a number that
 * was already minuscule.
 */
export function computeMaxScale(fitScale: number): number {
    return Math.max(fitScale, 1) * ZOOM_RANGE_ABOVE_FIT;
}

/**
 * Keeps a requested scale inside `[minScale, maxScale]`.
 *
 * Generic over what `minScale` means to the caller -- `Lightbox.ts` passes
 * `computeMinScale(fitScale)`, not the fit scale directly, for the reason documented on that
 * function. A non-finite request (a stray `NaN` or `Infinity` from a malformed gesture)
 * falls back to `minScale` rather than propagating, so it can never poison the transform.
 */
export function clampScale(scale: number, minScale: number, maxScale: number): number {
    if (!Number.isFinite(scale)) return minScale;
    return Math.min(maxScale, Math.max(minScale, scale));
}

/**
 * Keeps the displayed image covering the viewport in whichever dimension it currently
 * exceeds it, so an edge of the picture can never be dragged past the middle of the stage.
 *
 * When the image is smaller than the viewport in a dimension (at fit scale, always; at a
 * partial zoom, sometimes, for a very wide or very tall capture) the offset in that
 * dimension is clamped to exactly zero: there is no slack to pan into, and no reason to
 * pretend there is. This is the guard the task calls "the image can never be dragged
 * completely out of view" -- it is written tighter than that literal sentence asks for,
 * because "completely out of view" would still allow a visitor to drag most of a capture off
 * the edge and lose the very text they zoomed in to read.
 */
export function clampPan(offset: Offset, image: Size, viewport: Size, scale: number): Offset {
    const displayedWidth = image.width * scale;
    const displayedHeight = image.height * scale;
    const maxX = Math.max(0, (displayedWidth - viewport.width) / 2);
    const maxY = Math.max(0, (displayedHeight - viewport.height) / 2);
    return {
        // `|| 0` turns a clamped `-0` into `0`: harmless for every other value (it only ever
        // substitutes when the clamped result is falsy, and the only falsy number is zero
        // either sign of it), and it keeps a caller who compares the offset with `===` or a
        // deep-equality assertion from tripping over a sign bit nobody put there on purpose.
        x: Math.min(maxX, Math.max(-maxX, offset.x)) || 0,
        y: Math.min(maxY, Math.max(-maxY, offset.y)) || 0,
    };
}

/** The zoom level as the whole-number percentage a visitor reads: 100% is the image's own pixels. */
export function zoomPercent(scale: number): number {
    return Math.round(scale * 100);
}

/**
 * A capture's own aspect ratio, recorded as a CSS value like `"8 / 5"` (see
 * `RepoCapture.aspectRatio` in `content/captures.ts`), read back into a placeholder size for
 * the geometry above.
 *
 * It carries no claim about pixel dimensions, only the shape -- exactly what `computeFitScale`
 * and `clampPan` need to lay the dialog out correctly the instant it opens, before the real
 * `<img>` has finished loading and its actual `naturalWidth`/`naturalHeight` become known.
 * Once the image does load, the caller re-measures from the real element and this placeholder
 * is discarded; nothing downstream ever treats it as an actual pixel count.
 */
export function sizeFromAspectRatio(ratio: string): Size | null {
    const match = /^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/.exec(ratio);
    if (match === null) return null;
    const width = Number.parseFloat(match[1] as string);
    const height = Number.parseFloat(match[2] as string);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return { width, height };
}
