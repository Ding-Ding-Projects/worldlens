/**
 * What this build of the site actually is, and when it was made.
 *
 * Two contracts meet here. Every user-facing page has to show its running version and that
 * exact version's updated-at time before anything else; and every project has to report its
 * state somewhere a person can look. A static page cannot reach a live status service, so
 * what it can honestly do is state its own provenance and say plainly where the live record
 * lives.
 *
 * ## The whole difficulty is the missing case
 *
 * Provenance comes from the environment that produced the build. A local `pnpm build` has
 * none of it, and the tempting thing is to fall back to something that looks like an answer:
 * the current time, a file's mtime, a hand-written constant. Every one of those is wrong in
 * the same direction - it produces a plausible timestamp that is not the build's, on a
 * surface whose entire purpose is to be trusted about exactly that. Launch time is not build
 * time. So a missing value stays missing and is rendered as "not recorded".
 *
 * ## What it does not claim
 *
 * It reports the build. It does not report whether anything passed, whether a render
 * succeeded, or whether the project is healthy, because a static page has no way to know any
 * of that and a status surface that guesses is worse than none.
 */

/** Injected at build time by `vite.config.ts`. Absent fields are genuinely absent. */
declare const __SITE_PROVENANCE__: {
    readonly version: string | null;
    readonly commit: string | null;
    readonly builtAt: string | null;
};

export interface SiteProvenance {
    readonly version: string | null;
    readonly commit: string | null;
    /** ISO-8601, as recorded by the build. Never derived from the clock reading it. */
    readonly builtAt: string | null;
}

/**
 * One fact, as a surface should render it.
 *
 * `known: false` is a first-class outcome rather than an empty string, so a caller cannot
 * accidentally render a blank where an explanation belongs.
 */
export type StatusFact =
    | { readonly known: true; readonly label: string; readonly value: string }
    | { readonly known: false; readonly label: string; readonly why: string };

/** The provenance this bundle was built with. */
export function siteProvenance(): SiteProvenance {
    // A bundle built by a toolchain that did not define it at all - an older config, a test
    // importing this directly - must not throw. Nothing is a valid answer here.
    if (typeof __SITE_PROVENANCE__ === "undefined") {
        return { version: null, commit: null, builtAt: null };
    }
    return __SITE_PROVENANCE__;
}

const NOT_RECORDED =
    "Not recorded by the build that produced this page. It is left blank rather than " +
    "guessed, because a guessed time would look exactly like a real one.";

/**
 * Formats an ISO instant in the reader's own timezone, to the second, naming the zone.
 *
 * Seconds and the zone name are both required by the contract, and both earn their place:
 * without the zone a timestamp is ambiguous by up to a day, and a reader comparing this
 * against a release cannot do it if the two are in different unlabelled zones.
 */
export function formatBuiltAt(iso: string, now: Date = new Date(iso)): string {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
        // An unparseable value is not a time. Saying so beats rendering "Invalid Date",
        // which reads as a defect in the page rather than in the value it was handed.
        return "recorded, but not a readable date";
    }
    void now;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const stamp = new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(parsed);
    return `${stamp} (${zone})`;
}

/** The facts a status surface renders, in the order it should render them. */
export function statusFacts(provenance: SiteProvenance = siteProvenance()): readonly StatusFact[] {
    return [
        provenance.version === null
            ? { known: false, label: "Version", why: NOT_RECORDED }
            : { known: true, label: "Version", value: provenance.version },
        provenance.builtAt === null
            ? { known: false, label: "Updated at", why: NOT_RECORDED }
            : { known: true, label: "Updated at", value: formatBuiltAt(provenance.builtAt) },
        provenance.commit === null
            ? { known: false, label: "Commit", why: NOT_RECORDED }
            : { known: true, label: "Commit", value: provenance.commit.slice(0, 12) },
    ];
}

/**
 * Whether this build can state what it is at all.
 *
 * A surface uses this to decide between showing the facts and showing one honest sentence.
 * Three "not recorded" rows in a table look like a broken table; one sentence explaining
 * that this build carries no provenance is the same information, read correctly.
 */
export function provenanceAvailable(provenance: SiteProvenance = siteProvenance()): boolean {
    return provenance.version !== null || provenance.builtAt !== null || provenance.commit !== null;
}
