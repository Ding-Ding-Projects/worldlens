// The BlueMap-derived keyboard controls (KeyMoveControls, KeyAngleControls, KeyRotateControls,
// KeyZoomControls in map/keyboard/, and KeyMoveControls, KeyHeightControls in freeflight/keyboard/)
// all register their onKeyDown/onKeyUp handlers on the GLOBAL `window` object, because the map
// viewer has no reliable single element to focus. That is fine on its own -- BlueMap is a
// full-page map viewer with nothing else on the page to type into.
//
// Worldlens is not that. It embeds this viewer inside an app that also has search bars, a
// project-name field, the regex builder, the command palette and every dialog box the rest of
// the app owns. Once the map controls are started, EVERY keydown anywhere in the whole
// application passes through these window-level listeners first -- including a keystroke aimed
// at a plain <input type="text">.
//
// The trap: `evt.preventDefault()` on a letter key is completely silent. There is no console
// warning, no visible error, nothing distinguishing "the browser ate this keystroke" from "the
// keyboard is broken". A user typing "w" into a project name field just... doesn't get a "w".
// That is exactly the bug report this fix answers: "cannot type w a s d into the app".
//
// The one correct fix is not to stop listening on `window` (nothing else in the app promises to
// forward keystrokes to the map), and it is not to remove `preventDefault()` (arrow keys must
// still stop the page from scrolling while the map has "focus"). The fix is for every one of
// these controls to first ask "was this keystroke actually aimed at something that wants to
// consume text?" and, if so, get out of the way entirely -- no state change, no preventDefault,
// as if the control were not listening at all.
//
// This is the ONE place that question is answered, so all six control classes ask it the same
// way rather than reimplementing (and inevitably disagreeing about) it six times.

/**
 * HTML `<input>` types that behave like plain text entry as far as WASD/arrow keys are concerned.
 * A checkbox or a button is not editable in this sense -- pressing "d" while a checkbox has focus
 * should still pan the map, exactly as it would if nothing had focus at all. An input type this
 * list does not recognise (including a missing/empty `type`, which HTML treats as "text") is
 * treated as editable, because the safe default here is "assume it wants the keystroke" -- a
 * false positive merely means one frame of map movement is skipped, while a false negative means
 * a user's keystroke vanishes into the map controls again.
 */
const EDITABLE_INPUT_TYPES = new Set([
    "text",
    "search",
    "url",
    "tel",
    "email",
    "password",
    "number",
    "date",
    "datetime-local",
    "month",
    "week",
    "time",
]);

function isEditableInputElement(el: Element): boolean {
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") return true;

    if (tag === "INPUT") {
        const input = el as HTMLInputElement;
        // A missing/unrecognised `type` attribute is HTML's own "text" default, so treat it as
        // editable rather than assuming it is safe to steal the keystroke.
        const type = (input.type || "text").toLowerCase();
        return EDITABLE_INPUT_TYPES.has(type);
    }

    return false;
}

function isEditableRoleElement(el: Element): boolean {
    const role = el.getAttribute("role");
    return role === "textbox" || role === "searchbox" || role === "combobox";
}

/**
 * True when `evt` was aimed at something that wants to consume the keystroke as text --
 * an `<input>` of a text-accepting type, a `<textarea>`, a `<select>`, any `contentEditable`
 * element (including one that only reveals itself through `composedPath()` because it lives
 * inside a custom element's shadow DOM), or an ARIA role that says the same thing.
 *
 * A keyboard control that sees this return true MUST do nothing at all: no state change, no
 * `preventDefault()`. Anything else re-creates the exact bug this helper exists to prevent.
 */
export function keystrokeIsForEditableTarget(evt: KeyboardEvent): boolean {
    // Prefer composedPath()[0] over evt.target: inside a shadow DOM (a web component's own
    // contenteditable, for instance) evt.target is retargeted to the shadow host, which hides
    // exactly the element we need to check. composedPath() gives the real innermost element.
    const path = typeof evt.composedPath === "function" ? evt.composedPath() : undefined;
    const originalTarget = path && path.length > 0 ? path[0] : evt.target;

    if (!(originalTarget instanceof Element)) return false;

    let el: Element | null = originalTarget;
    // Walk up from the exact element the key landed on. A contentEditable region is usually a
    // wrapper <div contenteditable> around inline elements (formatting spans, cursor markers)
    // that are not themselves editable, so `isContentEditable` has to be checked up the tree,
    // not only on the innermost element.
    while (el) {
        if (el instanceof HTMLElement && el.isContentEditable) return true;
        if (isEditableInputElement(el)) return true;
        if (isEditableRoleElement(el)) return true;
        el = el.parentElement;
    }

    return false;
}
