/**
 * A framework-neutral presentation restriction for embedders.
 *
 * The viewer must remain usable on a standalone map server, so it does not import the
 * desktop application's settings, storage, or Vue state.  An embedding host may instead
 * hand it this tiny value-only policy.  The policy has two jobs: present English/serious
 * copy while restricted, and preserve the raw viewer locale so it can return afterwards.
 */

export interface ViewerPresentationRestriction {
    /** Hides language/tone controls and applies their effective English/level-one values. */
    readonly languageAndToneRestricted: boolean;
}

/** The three persisted presentation choices the standalone served shell can render. */
export const VIEWER_LANGUAGE_MODES = ["en", "yue", "bilingual"] as const;
export type ViewerLanguageMode = (typeof VIEWER_LANGUAGE_MODES)[number];
export type ViewerPresentationLanguage = Exclude<ViewerLanguageMode, "bilingual">;

/** A host-owned, framework-neutral copy bridge for the standalone served shell. */
export interface ViewerPresentationCopyRequest {
    readonly surface: "material-shell";
    readonly key: string;
    readonly language: ViewerPresentationLanguage;
    readonly funnyLevel: 1 | 2 | 3 | 4 | 5;
    readonly values: Readonly<Record<string, string | number>>;
}

/**
 * Deliberately independent from the upstream `i18n` lookup adapter.
 *
 * The served shell owns its three language modes and its two tone levels; an embedding host can
 * supply compatible copy without importing a UI framework into the viewer.  A subscription is
 * optional, but when supplied it must return a disposer so discarded map shells release it.
 */
export interface ViewerPresentationAdapter {
    copy(request: ViewerPresentationCopyRequest): string | undefined;
    subscribe?(listener: () => void): () => void;
}

export function normaliseViewerLanguageMode(value: string | null | undefined): ViewerLanguageMode {
    return VIEWER_LANGUAGE_MODES.includes(value as ViewerLanguageMode)
        ? (value as ViewerLanguageMode)
        : "en";
}

const UNRESTRICTED: ViewerPresentationRestriction = { languageAndToneRestricted: false };

function normaliseRestriction(
    restriction: ViewerPresentationRestriction | undefined,
): ViewerPresentationRestriction {
    return restriction?.languageAndToneRestricted === true
        ? { languageAndToneRestricted: true }
        : UNRESTRICTED;
}

function isStoredLocale(value: string): boolean {
    return value.trim().length > 0 && value !== "none";
}

/**
 * Owns the raw locale remembered from BlueMap's existing `bluemap-lang` setting.
 *
 * `BlueMapApp.saveUserSettings()` runs after every load, including a restricted launch.
 * Without this small state holder that ordinary save would replace a person's selected locale
 * with the temporary English locale and there would be nothing to restore on exit.
 */
export class ViewerPresentationPolicy {
    private restriction: ViewerPresentationRestriction;
    private rememberedLocale: string | null = null;
    readonly presentationAdapter: ViewerPresentationAdapter | undefined;

    constructor(
        restriction?: ViewerPresentationRestriction,
        presentationAdapter?: ViewerPresentationAdapter,
    ) {
        this.restriction = normaliseRestriction(restriction);
        this.presentationAdapter = presentationAdapter;
    }

    get languageAndToneRestricted(): boolean {
        return this.restriction.languageAndToneRestricted;
    }

    /** Records the raw stored locale before applying the effective presentation override. */
    resolveLoadedLocale(locale: string): string {
        this.remember(locale);
        return this.languageAndToneRestricted ? "en" : locale;
    }

    /** Returns the value that belongs in BlueMap's existing user-settings storage. */
    resolveSavedLocale(effectiveLocale: string): string {
        if (!this.languageAndToneRestricted) {
            this.remember(effectiveLocale);
            return effectiveLocale;
        }
        return this.rememberedLocale ?? effectiveLocale;
    }

    /**
     * Updates the restriction and returns a locale the host should install, if the current
     * effective locale must change.  `null` means the current locale already matches policy.
     */
    setRestriction(
        restriction: ViewerPresentationRestriction,
        currentLocale: string,
    ): string | null {
        const wasRestricted = this.languageAndToneRestricted;
        this.restriction = normaliseRestriction(restriction);

        if (!wasRestricted && this.languageAndToneRestricted) {
            this.remember(currentLocale);
            return currentLocale === "en" ? null : "en";
        }
        if (wasRestricted && !this.languageAndToneRestricted) {
            const restore = this.rememberedLocale;
            return restore !== null && restore !== currentLocale ? restore : null;
        }
        if (this.languageAndToneRestricted && currentLocale !== "en") return "en";
        return null;
    }

    /** Level one is the serious effective value without writing over the person's slider. */
    effectiveFunnyLevel(level: number): number {
        return this.languageAndToneRestricted ? 1 : level;
    }

    /** Restriction forces English presentation without changing the stored viewer choice. */
    effectiveLanguageMode(mode: ViewerLanguageMode): ViewerLanguageMode {
        return this.languageAndToneRestricted ? "en" : mode;
    }

    /** Subscribes only when the embedding host has a live presentation source. */
    subscribePresentation(listener: () => void): () => void {
        return this.presentationAdapter?.subscribe?.(listener) ?? (() => {});
    }

    private remember(locale: string): void {
        if (isStoredLocale(locale)) this.rememberedLocale = locale;
    }
}
