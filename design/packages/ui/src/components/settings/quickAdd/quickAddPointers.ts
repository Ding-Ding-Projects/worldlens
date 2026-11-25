/**
 * Every place the interface tells the person to add, set or accept something in Settings,
 * and what sits beside that message so they can do it on the spot.
 *
 * This list is written by hand and is the thing the guard in `quickAddPointers.test.ts`
 * reads. A rule alone ("every pointer has a quick-add control") passes on a pointer nobody
 * remembered to list, because it never looked at it. So the guard does two jobs: it checks
 * that each entry marked `wired` really mounts the control, and it scans the source for
 * pointer-shaped wording and fails when the file holding it is not named here.
 *
 * An entry is never silently dropped. A pointer that cannot carry a control says why
 * (`exempt`), and one that should but does not yet says so (`unfinished`), so the gap reads
 * as a decision or a to-do rather than as an oversight.
 */

import type { SettingsSectionAnchor } from "../settingsSections.js";
import { MAP_STORAGE_DIR_KEY } from "../../setup/mapStorage.js";

/** The kinds of quick entry this surface can draw. */
export type QuickAddControl = "folder" | "consent";

export interface QuickAddTarget {
    readonly anchor: SettingsSectionAnchor;
    /** The control drawn beside a pointer to this setting, or null when none applies. */
    readonly control: QuickAddControl | null;
    /**
     * The stored value the Settings row writes, and therefore the one the quick entry writes.
     * `null` when there is no quick entry.
     */
    readonly settingsKey: string | null;
    /** Why there is no quick entry, when there is not one. */
    readonly reason: string | null;
}

/**
 * The setting anchors a pointer can name, and the quick entry each one has.
 *
 * `mojang-download-consent` is kept by the main process rather than in browser storage, so
 * its key names the record rather than a storage slot. Both the Settings row and the quick
 * entry reach it through `createConsentSettings()`, which is what keeps them one value.
 */
export const QUICK_ADD_TARGETS: readonly QuickAddTarget[] = [
    {
        anchor: "map-storage-directory",
        control: "folder",
        settingsKey: MAP_STORAGE_DIR_KEY,
        reason: null,
    },
    {
        anchor: "mojang-download-consent",
        control: "consent",
        settingsKey: "main-process:mojang-download-consent",
        reason: null,
    },
    {
        anchor: "world-folder",
        control: null,
        settingsKey: null,
        reason: "A world folder belongs to one map and is chosen in that map's wizard, so there is no single stored value to write here.",
    },
    {
        anchor: "java-runtime",
        control: null,
        settingsKey: null,
        reason: "Java is found or downloaded rather than typed. A quick download button is not built yet.",
    },
];

/** The target for an anchor, or null when the anchor has no entry at all. */
export function quickAddTargetFor(anchor: string | null | undefined): QuickAddTarget | null {
    return QUICK_ADD_TARGETS.find((target) => target.anchor === anchor) ?? null;
}

/** The control for an anchor, or null when none applies. */
export function quickAddControlFor(anchor: string | null | undefined): QuickAddControl | null {
    return quickAddTargetFor(anchor)?.control ?? null;
}

export type QuickAddPointerStatus = "wired" | "exempt" | "unfinished";

export interface QuickAddPointer {
    readonly id: string;
    /** The source file that holds the message or switch, relative to `src/`. */
    readonly surface: string;
    /** More files that hold the same kind of pointer, when one entry covers several. */
    readonly alsoOn?: readonly string[];
    /** What the message tells the person to do. */
    readonly points: string;
    readonly status: QuickAddPointerStatus;
    /** Anchors the pointer can name; the quick entry follows the anchor. */
    readonly anchors: readonly SettingsSectionAnchor[];
    /** Why a pointer is exempt or unfinished. */
    readonly reason: string | null;
}

export const QUICK_ADD_POINTERS: readonly QuickAddPointer[] = [
    {
        id: "render-console-advice",
        surface: "components/console/RenderConsole.vue",
        points: "Advice beside a failed render line, with an Open the setting button.",
        status: "wired",
        anchors: ["map-storage-directory", "mojang-download-consent", "world-folder", "java-runtime"],
        reason: null,
    },
    {
        id: "download-row-remedy",
        surface: "components/downloads/DownloadRowCard.vue",
        points: "A failed download that names the setting that would fix it.",
        status: "wired",
        anchors: ["map-storage-directory", "mojang-download-consent"],
        reason: null,
    },
    {
        id: "wizard-review-consent",
        surface: "components/world/WizardReviewStep.vue",
        points: "The render review warning that the Mojang download has not been accepted.",
        status: "wired",
        anchors: ["mojang-download-consent"],
        reason: null,
    },
    {
        id: "config-field-consent",
        surface: "components/config/ConfigField.vue",
        points: "A consent-gated config field that reports consent is missing.",
        status: "wired",
        anchors: ["mojang-download-consent"],
        reason: null,
    },
    {
        id: "config-run-consent",
        surface: "components/config/RunScreen.vue",
        points: "The run screen warning that the client download was never accepted.",
        status: "wired",
        anchors: ["mojang-download-consent"],
        reason: null,
    },
    {
        id: "cirender-consent",
        surface: "components/cirender/CiRenderScreen.vue",
        points: "The CI render notes that the Mojang licence has not been accepted.",
        status: "wired",
        anchors: ["mojang-download-consent"],
        reason: null,
    },
    {
        id: "project-render-consent-notice",
        surface: "components/project/ProjectsScreen.vue",
        points: "A notice-history action that opens the consent setting.",
        status: "unfinished",
        anchors: ["mojang-download-consent"],
        reason: "The pointer is an action button inside a notice, which has no room for an inline entry. The screen then opens Settings itself.",
    },
    {
        id: "github-sign-in-pointers",
        surface: "components/backup/BackupScreen.vue",
        alsoOn: [
            "components/backup/BackupRunCard.vue",
            "components/chunker/ChunkerActionsPanel.vue",
            "components/cirender/CiRenderScreen.vue",
            "components/mcserver/WorldGeneratorDialog.vue",
        ],
        points: "Sign in from GitHub accounts in Settings, on the backup, chunker, CI render, pages and world generator surfaces.",
        status: "unfinished",
        anchors: ["github-account"],
        reason: "Signing in is an interactive device flow rather than a value to paste, and its inline control is not built yet.",
    },
];
