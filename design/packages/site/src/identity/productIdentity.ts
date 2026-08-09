/**
 * What the site calls itself, and what it *is*, kept deliberately apart.
 *
 * Every other label this site renders is already the visitor's to change, and the product's
 * own name was the single fixed string nobody ever decided to exempt. This module ends that
 * exemption: the name in the wordmark, the browser tab and the About line is a preference
 * like any other, resettable in one action and following the language modes and funny levels
 * exactly like the copy around it.
 *
 * The reason this is safe to offer at all is the separation below, and it is not a
 * hypothetical concern. A project whose data directory was derived from its package name
 * discovered that a rename would have orphaned every stored profile, credential and history
 * it had. So: **display comes from a setting, identity comes from a constant, and neither one
 * is ever derived from the other.** The storage namespace (`mbm-site:`), the published base
 * path (`/worldlens/`), the repository name and the update feed are identity. They stay put
 * however many times somebody retitles the page, which is why renaming here cannot lose a
 * single stored preference.
 *
 * There is one place the chosen name must lose: anywhere the real product has to be
 * identifiable by somebody who is not the visitor. A crash report, a diagnostic dump or an
 * issue filed against the project all carry `SHIPPED_PRODUCT_NAME`, because a reader of that
 * report has no idea what software "My Map Thing" is, and a bug report nobody can route is a
 * bug report nobody fixes. The rename surface says so in words rather than leaving the
 * visitor to discover it from a confused maintainer.
 */

import type { Preferences } from "../platform/Preferences.js";

/**
 * The name this build actually ships as.
 *
 * Deliberately a constant in its own module rather than a string read out of the settings
 * store, so that no amount of preference reading can turn a diagnostic identifier into
 * whatever the visitor typed. Anything that must survive leaving this browser imports this.
 */
export const SHIPPED_PRODUCT_NAME = "worldlens";

/**
 * The preference key the chosen name lives under.
 *
 * Namespaced `identity.` to match the settings id that drives it, so a visitor exporting
 * their settings and reading the file can see at a glance which entry is the rename.
 */
export const DISPLAY_NAME_KEY = "identity.displayName";

/**
 * A ceiling on the chosen name, because the wordmark sits in a fixed-width rail head and the
 * document title is truncated by the browser rather than by us.
 *
 * Forty-eight is generous enough for a real title in either language (a Cantonese name of
 * that length is a very long name indeed) while still being short enough that the rail cannot
 * be pushed into the content area by a paste of an entire paragraph. A longer entry is
 * truncated rather than refused: refusing it would throw away what the visitor typed, which
 * this project treats as worse than trimming it.
 */
export const MAX_DISPLAY_NAME_LENGTH = 48;

export type IdentityListener = () => void;

/**
 * Normalise a candidate name into either a real name or "no choice at all".
 *
 * Whitespace-only input is treated as an absent choice rather than as a name made of spaces,
 * because a wordmark rendering three spaces looks exactly like a failed build. Returning
 * `null` for it lets every caller share one meaning of "fall back to the shipped name"
 * instead of each one inventing its own emptiness check.
 */
export function normaliseDisplayName(raw: string): string | null {
    const trimmed = raw.trim().slice(0, MAX_DISPLAY_NAME_LENGTH).trim();
    return trimmed === "" ? null : trimmed;
}

export class ProductIdentity {
    private readonly prefs: Preferences;
    private readonly listeners = new Set<IdentityListener>();
    private chosen: string | null;

    constructor(prefs: Preferences) {
        this.prefs = prefs;
        this.chosen = normaliseDisplayName(prefs.read(DISPLAY_NAME_KEY, ""));
    }

    /** What the interface calls this product right now. Never empty. */
    get displayName(): string {
        return this.chosen ?? SHIPPED_PRODUCT_NAME;
    }

    /**
     * True while no rename is in force.
     *
     * This is what the settings row's provenance line and its reset button read, so that
     * "already at its default" is derived from the same fact the wordmark is, rather than
     * from a second comparison that could disagree with it.
     */
    get isShippedName(): boolean {
        return this.chosen === null;
    }

    /**
     * The name that leaves this browser.
     *
     * Identical to `SHIPPED_PRODUCT_NAME` and exposed as an instance member purely so a
     * caller that already holds an identity does not have to import the constant separately
     * and risk drifting to the display name by autocomplete.
     */
    get reportingName(): string {
        return SHIPPED_PRODUCT_NAME;
    }

    setDisplayName(raw: string): void {
        const next = normaliseDisplayName(raw);
        if (next === this.chosen) return;
        this.chosen = next;
        // Storing nothing rather than storing the shipped name keeps "has the visitor made a
        // choice?" answerable from storage alone. A stored value equal to the shipped name
        // would be indistinguishable from no choice, and the two mean different things the
        // day the shipped name changes.
        if (next === null) this.prefs.remove(DISPLAY_NAME_KEY);
        else this.prefs.write(DISPLAY_NAME_KEY, next);
        this.emit();
    }

    /** Return to the shipped name in one action. */
    reset(): void {
        this.setDisplayName("");
    }

    subscribe(listener: IdentityListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit(): void {
        for (const listener of [...this.listeners]) listener();
    }
}

/**
 * Push the chosen name onto every surface that introduces the site to its visitor.
 *
 * Kept as one function rather than scattered `document.title = …` assignments so there is a
 * single place that knows the full list of surfaces a rename has to reach. A rename that
 * updates the wordmark and forgets the browser tab is the sort of half-wired control this
 * project treats as a defect rather than as a partial feature.
 *
 * The wordmark elements are found by class rather than held as references because the shell
 * rebuilds itself on a language change, and a captured node would go stale the first time a
 * visitor switched to Cantonese.
 */
export function applyProductName(identity: ProductIdentity, root: Document = document): void {
    const name = identity.displayName;
    root.title = name;
    for (const word of root.querySelectorAll<HTMLElement>(".mb-brand-word")) {
        word.textContent = name;
    }
}
