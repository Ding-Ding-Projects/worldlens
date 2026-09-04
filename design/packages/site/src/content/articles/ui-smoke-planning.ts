import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const uiSmokePlanning: Article = {
    id: "ui-smoke-planning",
    title: "Planning built-app UI smoke evidence",
    summary:
        "A hand-written matrix for the real Windows application, recording every route, immediate surface, focus owner, capture tuple and honest evidence boundary.",
    category: "delivery",
    status: "ported-unverified",
    statusNote:
        "The smoke matrix, selector audit and plan validators are present and document the integrated routes. The final packaged run and refreshed captures are pending because the candidate still needs package proof and the current screenshot evidence is stale.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Each matrix row names a screen and state, theme, viewport, display scale, precondition, action, expected surface, focus owner, capture path and issue linkage.",
                        "Opening a new route, dialog, popup or tab requires an immediate capture, so a later whole-window image cannot hide a broken transition.",
                        "The plan covers server profiles, versions, rendering routes, Pages states, appearance, runtime settings, conversion, local models and documentation.",
                        "The final driver uses a fresh profile and named hidden desktop, with one built application target and dynamic window identity before interaction.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Matrix row",
                            description:
                                "One exact action and resulting state under a deterministic capture tuple.",
                        },
                        {
                            term: "Immediate capture",
                            description:
                                "The capture taken directly after a route, modal or tab transition before another action can change state.",
                        },
                        {
                            term: "Evidence boundary",
                            description:
                                "A truthful record of what a row proves and which runtime, account, host or package is still missing.",
                        },
                    ],
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "The driver stops if target isolation, window identity, focus, renderer console state or expected modal state is wrong.",
                        "A missing selector, duplicate row, absent route field or stale capture mapping makes plan validation fail rather than produce a partial green report.",
                        "Unreachable surfaces that require a real service or host are recorded as pending with their reason, never substituted with a mock.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "The route is isolated from the visible desktop and uses a fresh profile. Captures and ledgers exclude credentials, private vocabulary data and unrelated browser state, and the driver refuses to proceed when more than one page target or an unexpected window is present.",
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Final capture run remains pending",
                    content:
                        "Plan-only validation and selector checks are the current source evidence. A fresh packaged Windows run, per-action captures and the refreshed screenshot evidence check remain pending on the integrated package.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "screenshot-gallery",
            reason: "The gallery explains how accepted captures are promoted and presented.",
        },
        {
            articleId: "release-pipeline",
            reason: "The release pipeline supplies the packaged commit and provenance needed by the driver.",
        },
        {
            articleId: "desktop-shell-chrome",
            reason: "The smoke rows inspect the desktop shell and its focusable controls.",
        },
    ],
    sources: [
        { label: "docs/ui-smoke/README.md", href: repoFile("docs/ui-smoke/README.md") },
        {
            label: "docs/ui-smoke/smoke-matrix.json",
            href: repoFile("docs/ui-smoke/smoke-matrix.json"),
        },
        { label: "scripts/ui-smoke-matrix.mjs", href: repoFile("scripts/ui-smoke-matrix.mjs") },
    ],
};
