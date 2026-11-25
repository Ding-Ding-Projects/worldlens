import DOMPurify from "dompurify";

/**
 * Formatted text on its way into, and out of, the rich text editor.
 *
 * The editor is never the only defence against hostile markup: whatever it hands back is
 * passed through DOMPurify, and the same function runs again where a note is saved or loaded.
 * The viewer sanitizes a third time when it shows the note in a marker popup. This module does
 * not import the viewer, whose entry point needs a browser window, so the marker model that
 * calls it keeps loading in a plain node test. Two cases need care here:
 *
 *  - Notes written before the editor existed are plain text with line breaks. Loaded as HTML
 *    they would collapse into one line, so {@link toEditorHtml} turns them into paragraphs.
 *  - DOMPurify needs a DOM. Without one (a node process running the marker model) it cannot
 *    clean anything, so {@link sanitizeRichText} fails closed by dropping every tag instead of
 *    returning the input untouched.
 */

const HTML_TAG = /<\/?[a-z][a-z0-9-]*(\s[^>]*)?\/?>/i;

/** True when the text carries at least one HTML tag, so it is already formatted text. */
export function looksLikeHtml(text: string): boolean {
    return HTML_TAG.test(text);
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Plain text with line breaks as one escaped paragraph per line. */
export function plainTextToHtml(text: string): string {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

/** Every tag removed, with the handful of entities a note can contain decoded. */
export function stripTagsToText(html: string): string {
    return html
        .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<\/(p|div|li|h[1-6]|tr)\s*>|<br\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * What a formatted note may contain: ordinary text markup, lists, links and tables. No style
 * element, no form controls, no embedded SVG or MathML, and no data attributes.
 */
const NOTE_POLICY = {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "option", "iframe", "object", "embed"],
    ALLOW_DATA_ATTR: false,
};

function hasDom(): boolean {
    return typeof document !== "undefined" && typeof document.createElement === "function";
}

/** HTML that is safe to store and to show; scripts, event handlers and styles are gone. */
export function sanitizeRichText(html: string): string {
    if (html === "") return "";
    if (!hasDom()) return plainTextToHtml(stripTagsToText(html));
    return DOMPurify.sanitize(html, NOTE_POLICY).trim();
}

/** What the editor should be given for a stored value: legacy plain notes become paragraphs. */
export function toEditorHtml(stored: string): string {
    if (stored === "") return "";
    return looksLikeHtml(stored) ? sanitizeRichText(stored) : plainTextToHtml(stored);
}

/** The formatted text as the plain words a search should match against. */
export function richTextToPlain(stored: string): string {
    return looksLikeHtml(stored) ? stripTagsToText(stored) : stored;
}

/** True when the formatted text has no words, so an empty editor stores an empty note. */
export function isEmptyRichText(html: string): boolean {
    return stripTagsToText(html).trim() === "" && !/<(img|hr|table|video|audio)\b/i.test(html);
}
