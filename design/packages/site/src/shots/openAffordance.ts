/**
 * The control that makes a capture openable in the lightbox.
 *
 * Every gallery on the site (the home page's showcase strip, the dedicated Screenshots page's
 * committed and CI-fetched grids, and the walkthrough cards) wraps its existing `<img>` or
 * `<picture>` in exactly this control rather than each writing its own click listener. That
 * is the whole point of factoring it out: a bare `<img onclick>` is invisible to a keyboard
 * and to a screen reader (an image has no keyboard interaction model and no "activate" verb
 * of its own), so the thing a visitor can actually operate has to be a real, focusable
 * control -- and there is exactly one place that control's click/Enter/Space wiring lives,
 * so every gallery gets the same, tested behaviour rather than three near-identical copies
 * that drift the first time one of them is touched.
 *
 * `<button>` elements activate on Enter and on Space natively in every real browser -- that
 * is intrinsic button semantics, not something this file has to implement. The explicit
 * `keydown` handler below exists anyway, for the same reason `tabs/TabStrip.ts`'s own
 * `role="tab"` elements carry one: jsdom, which every test in this package runs under, does
 * not synthesize a `click` event from a keyboard `Enter`/`Space` press on a `<button>`
 * (verified directly: dispatching those `KeyboardEvent`s at a real `<button>` under jsdom
 * leaves a `click` listener uncalled). Without an explicit handler, "opens on Enter" and
 * "opens on Space" would be untestable claims resting entirely on the runtime the tests never
 * exercise. `event.preventDefault()` on Space additionally stops the page from scrolling,
 * which native button activation does on its own and this handler has to do by hand.
 */

import { el, icon } from "../platform/dom.js";
import type { I18n } from "../i18n/I18n.js";
import type { StringKey } from "../i18n/strings.js";

export interface OpenAffordanceOptions {
    readonly i18n: I18n;
    /** A `{name}`-interpolating key naming what the control opens: see `shots.enlargeNamed`. */
    readonly ariaLabelKey: StringKey;
    /** The capture's own name, read into the accessible label and, on activation, handed back. */
    readonly name: string;
    /** Runs on click, on Enter, and on Space. Receives the button itself as the focus-return anchor. */
    readonly onActivate: (trigger: HTMLElement) => void;
}

/**
 * Wraps `content` (the capture's own `<img>` or `<picture>`, already fully built by the
 * caller) in a real button that opens the lightbox, and returns that button in `content`'s
 * place. The caller inserts the returned element into the figure instead of `content`
 * directly; `content` itself is unchanged and stays exactly where the caller put it, one
 * level further into the tree.
 */
export function wrapCaptureInOpenButton(
    content: HTMLElement,
    options: OpenAffordanceOptions,
): HTMLButtonElement {
    const button = el("button", { class: "mb-shot-open", attrs: { type: "button" } });
    button.append(content);

    // Decorative only -- aria-hidden, and the button's own aria-label (set below) is what a
    // screen reader actually announces, so this glyph never has to carry meaning on its own.
    // "open_in_new" reads as "this opens a bigger view of what you are looking at", which is
    // closer to what is actually happening here than the magnifying-glass "search" glyph would
    // be, and reusing an icon this package already ships keeps every glyph on the page drawn
    // through the one shared, network-free icon set rather than a second hand-drawn path.
    const glyph = el("span", { class: "mb-shot-open__glyph" }, icon("openInNew"));
    button.append(glyph);

    options.i18n.bindAttr(button, "aria-label", options.ariaLabelKey, { name: options.name });

    button.addEventListener("click", () => options.onActivate(button));
    button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        options.onActivate(button);
    });

    return button;
}
