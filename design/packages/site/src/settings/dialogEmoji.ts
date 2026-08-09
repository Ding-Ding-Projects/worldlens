/**
 * The decorative emoji a dialog or message box may carry, and the switch that governs it.
 *
 * The rule this implements is narrow on purpose and the narrowness is the whole point: when
 * the switch is on, each dialog or message box gets **one** relevant emoji as decoration; when
 * it is off, the same factual copy renders without it. Nothing else changes. The words a
 * visitor reads are identical in both states, so nobody can end up with a warning that means
 * something different because they preferred a quieter interface.
 *
 * Two boundaries are load-bearing and are enforced by construction here rather than by every
 * caller remembering them:
 *
 * The emoji never reaches a **control**. Not a button, not an action label, not a field label.
 * A control's text is what a person clicks by name and what a script finds by name, and
 * salting it with a glyph that comes and goes with a preference makes both of those unstable.
 * `decorateDialogHeading` therefore only ever attaches to a heading or a message line, and the
 * one function that produces the element refuses to be handed anything focusable.
 *
 * The emoji never reaches an **accessible name**. It is wrapped in a span marked
 * `aria-hidden`, so a screen reader announces the heading exactly as it would with the switch
 * off. An emoji read aloud as "police car light" in front of a delete warning is noise
 * standing between a person and a decision, and this feature is decoration — decoration that
 * makes itself heard has stopped being decoration.
 *
 * State lives in a module-level port rather than being read from storage on each call for the
 * same structural reason `settings/i18n.ts` is a port: `confirmDestructive` is a free function
 * that a caller reaches without holding a settings page, so there is no store instance to ask.
 * Whoever owns the preference pushes it in with `setDialogEmojiEnabled`.
 */

/**
 * The settings id, exported so the schema and the page bridge cannot drift from the port.
 *
 * A second literal copy of this string in `schema.ts` is exactly how a toggle ends up wired to
 * a key nothing reads, which looks identical to a working toggle right up until someone tries
 * it.
 */
export const DIALOG_EMOJI_SETTING_ID = "ui.dialogEmoji";

/**
 * The kinds of surface that may carry a decoration.
 *
 * A closed union rather than a free string so that adding a surface is a deliberate act with a
 * chosen glyph, instead of a typo silently producing no decoration and nobody noticing that
 * one dialog out of nine is plain.
 */
export type DialogEmojiKind =
    | "destructive"
    | "confirm"
    | "question"
    | "success"
    | "error"
    | "warning"
    | "info";

/**
 * One glyph per kind, chosen to be *relevant* rather than expressive.
 *
 * These are deliberately the boring, near-universal choices. A cleverer glyph would carry
 * meaning, and meaning in a decoration that a visitor can switch off is meaning that half the
 * visitors never receive — which would make the switch a content toggle rather than a
 * decoration toggle, and that is precisely what the rule forbids.
 */
const GLYPHS: Readonly<Record<DialogEmojiKind, string>> = {
    destructive: "🧨",
    confirm: "🤔",
    question: "❓",
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "💡",
};

/**
 * On by default.
 *
 * The rule requires the toggle to exist and to be honoured, not that decoration be opt-in, and
 * an audience arriving at a documentation site with a playful voice already set to level three
 * is better served by the default that matches that voice. A visitor who wants it quiet turns
 * it off once and the choice persists.
 */
let enabled = true;

export function setDialogEmojiEnabled(next: boolean): void {
    enabled = next;
}

export function dialogEmojiEnabled(): boolean {
    return enabled;
}

/**
 * The glyph for a surface, or `null` when the visitor has switched decoration off.
 *
 * Returning `null` rather than an empty string forces every call site to branch explicitly,
 * which is what keeps an empty decorative span out of the DOM when the feature is off. An
 * empty span is invisible but still occupies a grid cell and still shows up in a snapshot
 * diff, and "invisible" is not the same as "absent".
 */
export function dialogEmoji(kind: DialogEmojiKind): string | null {
    return enabled ? GLYPHS[kind] : null;
}

/**
 * The decorative node itself, or `null`.
 *
 * `aria-hidden` plus an empty `alt`-equivalent is what keeps the glyph out of the accessible
 * name of whatever it is appended to. The trailing space is a real space inside the span
 * rather than CSS margin so that a text-only copy of the heading (a visitor selecting and
 * copying it) does not run the glyph into the first word.
 */
export function dialogEmojiNode(
    kind: DialogEmojiKind,
    doc: Document = document,
): HTMLElement | null {
    const glyph = dialogEmoji(kind);
    if (glyph === null) return null;
    const span = doc.createElement("span");
    span.className = "mb-dialog-emoji";
    span.setAttribute("aria-hidden", "true");
    span.textContent = `${glyph} `;
    return span;
}

/**
 * Put the decoration in front of a heading or message line.
 *
 * The guard is not defensive programming for its own sake. The one way this feature can
 * actually cause harm is by leaking a glyph into something a person or a test identifies by
 * name, and the elements that get identified by name are the focusable ones. Refusing them
 * here means a future call site cannot make that mistake quietly; it makes it loudly, in
 * development, the first time it runs.
 */
export function decorateDialogHeading(target: HTMLElement, kind: DialogEmojiKind): void {
    if (target.tabIndex >= 0 || target.closest("button, a, [role='button']") !== null) {
        throw new Error(
            "Dialog emoji decoration is for headings and message lines only; a control's text must not change with a display preference.",
        );
    }
    const existing = target.querySelector(".mb-dialog-emoji");
    if (existing !== null) existing.remove();
    const node = dialogEmojiNode(kind, target.ownerDocument);
    if (node !== null) target.prepend(node);
}
