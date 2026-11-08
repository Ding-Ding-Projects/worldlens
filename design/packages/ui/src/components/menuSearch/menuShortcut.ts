/**
 * Converts the shortcut a menu row shows into the `aria-keyshortcuts` grammar, so assistive
 * technology announces it as a shortcut rather than as decorative text.
 */

/** `Ctrl+Shift+Z` in the `aria-keyshortcuts` grammar (`Control+Shift+Z`). */
export function ariaShortcut(shortcut: string): string {
    return shortcut
        .split("+")
        .map((part) => (part === "Ctrl" ? "Control" : part === "Cmd" ? "Meta" : part === "Esc" ? "Escape" : part))
        .join("+");
}
