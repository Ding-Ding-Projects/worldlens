/**
 * Hand-written inventory of the settings that must carry an explanation and a provenance line.
 *
 * A rule-shaped guard cannot prove this. "Every explanation that exists is well-formed" is
 * satisfied, silently and permanently, by a setting that has no explanation at all: the guard
 * iterates the explanations it finds, finds none for that row, and reports success. The same
 * hole swallows a whole new setting - it arrives with no description key, matches no pattern,
 * and the suite stays green while the surface it renders is the exact defect the rule was
 * written to prevent.
 *
 * So the list below is written by hand and is closed. It is checked in both directions, and
 * the second direction is the one that does the work: an id here that the schema cannot
 * satisfy fails, *and* a stored setting in the schema that nobody added here fails too. The
 * second arm is what makes adding a setting without an explanation impossible rather than
 * merely discouraged, and it costs one line in this file per setting - which is the point,
 * because that line is where somebody has to decide the setting deserves an explanation.
 *
 * Deliberately boring: no globbing, no derivation from the schema, no clever shortcut. A list
 * derived from the thing it is checking checks nothing.
 */

/**
 * Every stored setting the site has, each of which must declare a `descriptionKey` and render
 * a provenance line naming its current value.
 *
 * Action settings are absent on purpose rather than by oversight: an action holds no value, so
 * there is no source for a provenance line to report. Actions still carry their own explanatory
 * copy where the surface that builds them renders one - that copy is not a stored setting's
 * explanation and is not what this list governs.
 */
export const SETTINGS_REQUIRING_EXPLANATION = [
    /* General */
    "theme.mode",
    "theme.contrast",
    "theme.density",
    "theme.accent",
    "theme.surfaceTint",
    "identity.displayName",
    "ui.dialogEmoji",
    "tabs.placement",
    "tabs.sidebarCollapsed",
    "motion.reduce",
    "motion.scale",

    /* Language */
    "language.mode",
    "language.secondaryInline",
    "language.funny.en",
    "language.funny.yue",

    /* Appearance */
    "type.family",
    "type.mono",
    "type.scale",
    "type.weight",
    "shape.cornerScale",
    "shape.elevation",
    "shape.borderWidth",

    /* Accessibility */
    "a11y.focusWidth",
    "a11y.focusColor",
    "a11y.underlineLinks",
    "a11y.minTarget",
    "a11y.textSpacing",
] as const;

export type ExplainedSettingId = (typeof SETTINGS_REQUIRING_EXPLANATION)[number];

export interface CoverageGaps {
    /** Listed here, but the schema has no stored setting by that id. */
    readonly listedButAbsent: readonly string[];
    /** A stored setting the schema has, that nobody added to the list above. */
    readonly presentButUnlisted: readonly string[];
}

/**
 * Both directions of the comparison, computed together.
 *
 * Returning one structure rather than two predicates keeps the two arms from being asserted
 * separately and then, one refactor later, only one of them being asserted at all - which
 * returns the guard to exactly the "checks what exists, never what is missing" shape this
 * module was written to escape.
 */
export function coverageGaps(storedSettingIds: readonly string[]): CoverageGaps {
    const listed = new Set<string>(SETTINGS_REQUIRING_EXPLANATION);
    const present = new Set(storedSettingIds);
    return {
        listedButAbsent: [...listed].filter((id) => !present.has(id)),
        presentButUnlisted: [...present].filter((id) => !listed.has(id)),
    };
}
