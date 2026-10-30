/**
 * The **Show emojis in dialogs** preference, and the one helper dialogs use to read it.
 *
 * When on, a dialog or message box heading carries one relevant emoji beside its words.
 * The emoji is decoration only:
 *
 *  - it is rendered in its own `aria-hidden` element, so it is never part of an accessible
 *    name, and a screen reader announces the heading exactly as it does with the switch off;
 *  - it is placed beside a heading and never in a button, field label or other control text;
 *  - it never replaces a word, and never appears inside the facts a dialog states (what is
 *    affected, that something cannot be undone), which are rendered separately.
 *
 * On by default, matching the shipped playful tone of the funny levels. Persisted through
 * `setupStorage()` like the language mode and mirrored into the settings history under
 * `dialogEmoji`. School mode treats it as off without changing the stored choice, the same
 * way it treats the funny levels.
 */

import { computed, ref, type ComputedRef } from "vue";
import { setupStorage } from "./setupPrefs.js";
import { schoolModeEnabled } from "./schoolMode.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

export const DIALOG_EMOJI_KEY = "worldlens.language.dialogEmoji";
export const DEFAULT_DIALOG_EMOJI = true;

/** The kinds of dialog an emoji is chosen for, and the emoji each one gets. */
export const DIALOG_EMOJI = {
    /** A super-confirmation for something that cannot be undone. */
    destructive: "🧯",
    /** A question that changes something but loses nothing. */
    decision: "🤔",
    /** A dialog reporting a problem. */
    problem: "🩹",
    /** A dialog reporting something that went well. */
    success: "🎉",
    /** Plain information. */
    info: "💡",
} as const;

export type DialogEmojiKind = keyof typeof DIALOG_EMOJI;

function readStored(): boolean {
    const raw = setupStorage().read(DIALOG_EMOJI_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return DEFAULT_DIALOG_EMOJI;
}

const stored = ref<boolean>(readStored());

/** Re-reads the stored value. Tests call it after swapping the backing store. */
export function reloadDialogEmoji(): void {
    stored.value = readStored();
}

/** The stored choice, ignoring School mode. What the switch shows. */
export function dialogEmojiChoice(): boolean {
    return stored.value;
}

/** Whether dialogs show an emoji right now. */
export function dialogEmojiEnabled(): boolean {
    return stored.value && !schoolModeEnabled();
}

/** Turns the emoji on or off. Applies immediately and is remembered. */
export function setDialogEmojiEnabled(enabled: boolean): void {
    stored.value = enabled === true;
    setupStorage().write(DIALOG_EMOJI_KEY, String(stored.value));
    recordAppSetting("dialogEmoji", stored.value);
}

/**
 * The emoji for a dialog, or null when the preference is off.
 *
 * `override` lets a caller pick a more specific emoji for its own dialog; `null` there asks
 * for none at all, for a dialog where any decoration would be out of place.
 */
export function dialogEmojiFor(kind: DialogEmojiKind, override?: string | null): string | null {
    if (!dialogEmojiEnabled()) return null;
    if (override === null) return null;
    return override ?? DIALOG_EMOJI[kind];
}

/** A reactive form of {@link dialogEmojiFor}, for a component's template. */
export function useDialogEmoji(
    kind: () => DialogEmojiKind,
    override: () => string | null | undefined = () => undefined,
): ComputedRef<string | null> {
    return computed(() => dialogEmojiFor(kind(), override()));
}
