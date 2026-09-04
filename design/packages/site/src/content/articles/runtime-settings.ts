import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const runtimeSettings: Article = {
    id: "runtime-settings",
    title: "Runtime settings, schedules and accommodations",
    summary:
        "Shared settings for language, appearance, narration, external sources and independent attention accommodations, with bounded local history and honest unavailable states.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The settings registry, schedule evaluator, narrator configuration, status reporting, history protection and accommodation controls have focused source proof. Final packaged interaction and capture of the integrated tab remain pending.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Settings can schedule language, theme, density, accent, fonts, motion and display presentation by local date, time and weekday.",
                        "External API and Home Assistant values are temporary overrides and never replace the recoverable local base.",
                        "Narration is off by default, offers independent language voices, and serializes queued messages while respecting reduced sound and assistive technology.",
                        "Focus, Low stimulation, Time awareness, One thing at a time and Momentum are separate persisted accommodations, all off by default.",
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
                            term: "Base value",
                            description:
                                "The local setting restored when a scheduled or external override no longer matches.",
                        },
                        {
                            term: "Scheduled rule",
                            description:
                                "A versioned bounded record with stable id, precedence, local-time window, optional dates and weekdays, and a selected source.",
                        },
                        {
                            term: "External source",
                            description:
                                "A validated HTTPS API or boolean Home Assistant entity accessed through the privileged boundary.",
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
                        "Invalid dates, reversed ranges, unsafe URLs, malformed responses, unavailable credentials and external timeouts are reported beside the setting and leave the last valid base state intact.",
                        "A missing Status Hub credential disables registration and evidence actions with the reason rather than presenting a control that cannot deliver.",
                        "A voice that is not installed remains selected and is identified as falling back, never silently replaced.",
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
                        "Network access is bounded to the privileged process, redirects and unsafe destinations are rejected, credentials remain in the operating-system vault, and history stores only redacted or encrypted snapshots. External values, tokens and private paths do not enter renderer state, exports or public evidence.",
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
                    title: "Packaged capture remains pending",
                    content:
                        "Focused tests cover schedule precedence, persistence, vault-backed registration, narrator state, external failures and history. The integrated packaged settings tab and its compact layout capture remain pending.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "scheduled-settings",
            reason: "The schedule-specific article gives the source contract and timezone rules.",
        },
        {
            articleId: "language-and-tone",
            reason: "Language modes and funny levels shape the copy this settings surface displays.",
        },
        {
            articleId: "panel-geometry",
            reason: "Settings overlays use the shared bounded and persistent panel geometry.",
        },
    ],
    sources: [
        {
            label: "docs/runtime-settings-and-accommodations.md",
            href: repoFile("docs/runtime-settings-and-accommodations.md"),
        },
        {
            label: "packages/app/src/main/runtimeSettings/service.ts",
            href: repoFile("design/packages/app/src/main/runtimeSettings/service.ts"),
        },
        {
            label: "packages/ui/src/components/runtimeSettings/RuntimeSettingsPanel.vue",
            href: repoFile(
                "design/packages/ui/src/components/runtimeSettings/RuntimeSettingsPanel.vue",
            ),
        },
    ],
};
