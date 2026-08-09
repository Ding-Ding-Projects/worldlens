/**
 * Unresolved problems, aggregated from the sources that already own them.
 *
 * The rule this exists to keep is "one source of truth per concept". A problem is a *view* of a
 * validation error, a failed render or an unreadable stored value - all of which already live
 * somewhere with a component that renders them inline, beside the field or the action that
 * produced them. Cloning those into a second mutable list is how a Problems panel ends up
 * confidently listing an error the user fixed ten minutes ago.
 *
 * So nothing here holds state. `collectProblems` is a pure function over whatever the shell can
 * see right now, and the panel re-derives on every change. Resolving the source removes the
 * problem because the source stopped reporting it, not because anything here was told to forget.
 *
 * ### Severity is not colour
 *
 * Every problem carries an explicit `severity` **and** a translated severity word, because a red
 * dot beside a row is not a severity to somebody who cannot see the red. The panel renders both.
 *
 * ### A remedy is real or absent
 *
 * `remedy` is a target the shell can actually route to. A generic "Fix" that only dismisses the
 * row is worse than no button: it teaches the reader that the panel's actions do nothing.
 */

import type { FeatureTarget } from "./featureTargets.js";

export type ProblemSeverity = "error" | "warning" | "info";

export interface Problem {
    /**
     * Stable across re-derivations, so a row does not lose its selection or its focus every time
     * an unrelated source changes. Derived from what the problem is *about* - a field path, a
     * render id - never from an array index.
     */
    readonly id: string;
    readonly severity: ProblemSeverity;
    /** Where it came from, in the user's terms: a file path, a screen name, a dotted key. */
    readonly source: string;
    /** The error as the source reported it. Never reworded - it is what a search will match. */
    readonly message: string;
    /** What it means for the person reading it, in plain words. */
    readonly meaning: string;
    /** A real destination, or null when nothing in this build can fix it from here. */
    readonly remedy: { readonly label: string; readonly target: FeatureTarget } | null;
}

/** What the shell can currently see, handed in rather than imported. */
export interface ProblemSources {
    /**
     * Page ids restored from a workspace that nothing in this build declares.
     *
     * Reported rather than deleted: an extension page, or a page a newer build added, is
     * recoverable data. The migration keeps the tab and this says why it renders empty, instead
     * of leaving the tab system's honest "no content for that page" panel to be read as a crash.
     */
    readonly unresolvedPageIds?: readonly string[];
    /** Renders that ended in a failure the user has not dismissed. */
    readonly failedRenders?: readonly {
        readonly id: string;
        readonly label: string;
        readonly error: string;
    }[];
    /** Validation errors from the options editor, by dotted path. */
    readonly configErrors?: readonly { readonly path: string; readonly message: string }[];
    /** A target the shell could not route, reported by `shellNavigation`. */
    readonly routingFailures?: readonly { readonly id: string; readonly message: string }[];
}

/** The repository's own `t()` shape. */
export type Translate = (
    key: string,
    valuesOrFallback?: Record<string, string> | string,
    fallback?: string,
) => string;

/**
 * Every unresolved problem the shell can currently see, most severe first.
 *
 * Order is by severity and then by first appearance, never by id: a list that reshuffled itself
 * as sources reported in a different order would move a row out from under a pointer.
 */
export function collectProblems(sources: ProblemSources, t: Translate): readonly Problem[] {
    const problems: Problem[] = [];

    for (const pageId of sources.unresolvedPageIds ?? []) {
        problems.push({
            id: `workspace.unknown-page.${pageId}`,
            severity: "warning",
            source: t("problems.source.workspace", "Saved workspace"),
            message: t(
                "problems.unknownPage.message",
                { page: pageId },
                "This workspace has a tab for “{page}”, which this build does not know about.",
            ),
            meaning: t(
                "problems.unknownPage.meaning",
                "Nothing was deleted. The tab is kept so a build that does know about it can still restore your arrangement.",
            ),
            remedy: null,
        });
    }

    for (const render of sources.failedRenders ?? []) {
        problems.push({
            id: `render.failed.${render.id}`,
            severity: "error",
            source: render.label,
            message: render.error,
            meaning: t(
                "problems.render.meaning",
                "The render stopped. Whatever tiles it had already written are still there, and it can be resumed or discarded.",
            ),
            remedy: {
                label: t("problems.render.remedy", "Open the render console"),
                target: { kind: "job", jobId: "renders", reveal: "console" },
            },
        });
    }

    for (const error of sources.configErrors ?? []) {
        problems.push({
            id: `config.invalid.${error.path}`,
            severity: "error",
            source: error.path,
            message: error.message,
            meaning: t(
                "problems.config.meaning",
                "This value will not be written until it is valid. Nothing else in the file is affected.",
            ),
            remedy: {
                label: t("problems.config.remedy", "Open the setting"),
                target: { kind: "overlay", overlay: "config", reveal: error.path },
            },
        });
    }

    for (const failure of sources.routingFailures ?? []) {
        problems.push({
            id: failure.id,
            severity: "warning",
            source: t("problems.source.navigation", "Navigation"),
            message: failure.message,
            meaning: t(
                "problems.routing.meaning",
                "The feature exists in the catalogue but this build cannot open it, so the row was left where it is rather than doing nothing when pressed.",
            ),
            remedy: null,
        });
    }

    const rank: Record<ProblemSeverity, number> = { error: 0, warning: 1, info: 2 };
    // A stable sort, so equal severities keep the order their sources reported them in.
    return [...problems].sort((left, right) => rank[left.severity] - rank[right.severity]);
}

/** The translated word for a severity, so the panel never leans on colour alone. */
export function severityLabel(severity: ProblemSeverity, t: Translate): string {
    switch (severity) {
        case "error":
            return t("problems.severity.error", "Error");
        case "warning":
            return t("problems.severity.warning", "Warning");
        case "info":
            return t("problems.severity.info", "Note");
    }
}

/** How many are unresolved, for the status strip's summary. */
export function unresolvedCount(problems: readonly Problem[]): number {
    return problems.length;
}
