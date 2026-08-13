/**
 * What the update surfaces show, as a value.
 *
 * Pure functions over an {@link UpdateState}, so every rule about when the banner appears,
 * when Restart is reachable and what tone a state carries can be tested without mounting a
 * component or running an updater. The components below are then only markup.
 *
 * ## Why the banner is the ready state and (almost) nothing else
 *
 * A persistent banner is a standing claim on the top of the window, and the project's own
 * rules say plainly that anything which only *informs* is a non-blocking notification
 * rather than a fixture. "There is nothing new" and "the check failed, it will try again"
 * inform; they belong in the notification corner and the settings row.
 *
 * "An update is downloaded and one restart away" is different: it is an offer the user has
 * to be able to take at a moment of their choosing, possibly hours later, and a toast that
 * auto-dismisses would take it away while they were mid-render. So that one persists - and
 * because it persists, it is dismissible, and because it is dismissible it has to be
 * reachable again, which is what {@link dismissUpdate} and the settings row are for.
 */

import { setupStorage } from "../setup/setupPrefs.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";
import type { UpdateCopyKey } from "./updateCopy.js";
import type { UpdateDownloadProgress, UpdateState, UpdateStatus } from "./updateBridge.js";

/** Where a dismissed version is remembered, so a restart does not resurrect the banner. */
const DISMISSED_KEY = "worldlens.update.dismissed";

/** The version whose banner the user put away, or null. */
export function readDismissedUpdate(): string | null {
    const raw = setupStorage().read(DISMISSED_KEY);
    return raw !== null && raw.trim() !== "" ? raw : null;
}

/**
 * Records that this version's banner was dismissed.
 *
 * Per *version*, never a blanket "do not show update banners": the next release has to be
 * able to announce itself, and a setting that silently suppressed every future update would
 * be a setting that stops the app being updated at all.
 */
export function dismissUpdate(version: string): void {
    setupStorage().write(DISMISSED_KEY, version);
    // Fire-and-forget mirror into the main process's own settings history, on top of the
    // write above - see `appSettingsHistorySync.ts`'s own doc comment.
    recordAppSetting("updateDismissed", version);
}

/** Brings the banner back, which is what the settings row's action does. */
export function clearDismissedUpdate(): void {
    setupStorage().remove(DISMISSED_KEY);
}

/* -------------------------------------------------------------------------- */
/* The banner                                                                 */
/* -------------------------------------------------------------------------- */

export type UpdateTone = "info" | "success" | "warning" | "error";

/* -------------------------------------------------------------------------- */
/* Download progress                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What the banner can honestly draw for a download in flight.
 *
 * The whole shape exists so the component never decides anything. A bar that invents motion
 * is worse than no bar at all, because it tells the user the download is fine at the exact
 * moment nothing may be happening, so the "is there a real percentage" decision is made here
 * once, from the numbers the updater reported, and is unit-testable without mounting
 * anything.
 */
export interface UpdateProgressModel {
    /**
     * True when the download is genuinely underway and no percentage is known.
     *
     * This is a real and ordinary case rather than a fallback for a bug: Electron's Squirrel
     * updater reports the start and the finish of a download and nothing in between, and a
     * feed served without a `Content-Length` gives a byte count with no total to divide it by.
     */
    readonly indeterminate: boolean;
    /** 0 to 100, rounded for display. Null whenever the updater did not report one. */
    readonly percent: number | null;
    /** "12.4 MB", or null when even the transferred count is unknown. */
    readonly transferredLabel: string | null;
    /** "48.0 MB", or null when the server did not say how big the package is. */
    readonly totalLabel: string | null;
    /** "1.2 MB/s", or null when the engine does not measure a rate. */
    readonly rateLabel: string | null;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * A byte count as a person reads it.
 *
 * Kept in the model rather than the template so the numbers a screen reader hears and the
 * numbers on screen come from one function, and so the rounding is testable. Powers of 1024
 * with the unit names the installer and the releases page already use, which matters more
 * than the decimal/binary argument: two surfaces disagreeing about the size of the same
 * download is what a reader actually notices.
 */
export function formatByteCount(bytes: number): string | null {
    if (!Number.isFinite(bytes) || bytes < 0) return null;
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
        value /= 1024;
        unit += 1;
    }
    // Whole bytes have no meaningful fraction, and everything larger reads better with one
    // decimal than with a six-digit integer.
    const rendered = unit === 0 ? String(Math.round(value)) : value.toFixed(1);
    return `${rendered} ${BYTE_UNITS[unit] ?? "B"}`;
}

/**
 * The progress model for a state, or null when nothing is downloading.
 *
 * `downloadProgress` is read defensively rather than trusted, because an older preload that
 * predates this field sends a state without it: the type says the field is there and the
 * running process is what actually decides.
 */
export function progressFor(state: UpdateState): UpdateProgressModel | null {
    if (state.status !== "downloading") return null;

    const progress: UpdateDownloadProgress | null = state.downloadProgress ?? null;
    if (progress === null) {
        // Downloading with nothing counting the bytes. Indeterminate is the honest answer;
        // hiding the bar entirely would be the state this feature exists to remove, and a
        // number here would be fiction.
        return {
            indeterminate: true,
            percent: null,
            transferredLabel: null,
            totalLabel: null,
            rateLabel: null,
        };
    }

    const percent =
        progress.percent === null || !Number.isFinite(progress.percent)
            ? null
            : Math.min(Math.max(Math.round(progress.percent), 0), 100);

    return {
        indeterminate: percent === null,
        percent,
        transferredLabel: formatByteCount(progress.transferredBytes),
        totalLabel: progress.totalBytes === null ? null : formatByteCount(progress.totalBytes),
        rateLabel:
            progress.bytesPerSecond === null
                ? null
                : (() => {
                      const rate = formatByteCount(progress.bytesPerSecond);
                      return rate === null ? null : `${rate}/s`;
                  })(),
    };
}

export interface UpdateBannerModel {
    readonly visible: boolean;
    readonly tone: UpdateTone;
    readonly titleKey: UpdateCopyKey;
    readonly bodyKey: UpdateCopyKey;
    /** Interpolated into the copy after the level has chosen it, so it cannot be styled. */
    readonly vars: Readonly<Record<string, string>>;
    /** False while a render is running: pressing it would be refused anyway. */
    readonly canRestart: boolean;
    /** The https release-notes address, or null when the feed gave none. */
    readonly notesUrl: string | null;
    /** The notes themselves, when the feed carried them. Rendered, never printed raw. */
    readonly notes: string | null;
    /** The bar and its byte counts while a download runs. Null the rest of the time. */
    readonly progress: UpdateProgressModel | null;
    /**
     * False while the banner is reporting something the user cannot act on.
     *
     * A download in flight has no offer to put away: dismissal is remembered against the
     * staged version, and there is no staged version yet, so a Later button there would look
     * like a control and do nothing at all.
     */
    readonly canDismiss: boolean;
}

const HIDDEN: UpdateBannerModel = {
    visible: false,
    tone: "info",
    titleKey: "update.banner.readyTitle",
    bodyKey: "update.banner.readyBody",
    vars: {},
    canRestart: false,
    notesUrl: null,
    notes: null,
    progress: null,
    canDismiss: false,
};

/**
 * The banner for a state, or a hidden one.
 *
 * `canRestart` follows the render guard so the button is visibly held rather than silently
 * refusing when pressed - the main process refuses either way, and a control that looks
 * live and does nothing is indistinguishable from a broken one.
 */
export function bannerFor(
    state: UpdateState,
    options: {
        readonly dismissedVersion?: string | null;
        readonly canRestart?: boolean;
        readonly unsavedWork?: boolean;
    } = {},
): UpdateBannerModel {
    const downloading = progressFor(state);
    if (downloading !== null) {
        /*
         * The one other state that earns the banner, and it earns it for the opposite reason
         * to the ready state.
         *
         * The module comment above says a banner is for an offer the user has to be able to
         * take later, and that anything which merely informs belongs in the notification
         * corner. A download in flight is neither: it is a large file arriving over a
         * connection that may be slow or may have stalled, and the only place that question
         * can be answered is a bar that is on screen for as long as the download is. It
         * removes itself when the download ends, so it never becomes a fixture nobody asked
         * for, and it offers no action, so it never competes with the offer that follows it.
         */
        const named = state.newVersion;
        return {
            visible: true,
            tone: "info",
            titleKey:
                named === null
                    ? "update.banner.downloadingTitleUnknown"
                    : "update.banner.downloadingTitle",
            bodyKey: "update.banner.downloadingBody",
            vars: named === null ? {} : { version: named },
            canRestart: false,
            notesUrl: state.releaseNotesUrl,
            notes: null,
            progress: downloading,
            canDismiss: false,
        };
    }

    const version = state.readyVersion;
    if (state.status !== "ready" || version === null) return HIDDEN;

    const dismissed = options.dismissedVersion ?? null;
    if (dismissed === version) return HIDDEN;

    const unsaved = options.unsavedWork ?? false;
    const held = state.renderInProgress || unsaved;
    return {
        visible: true,
        tone: held ? "warning" : "success",
        titleKey: "update.banner.readyTitle",
        bodyKey: state.renderInProgress
            ? "update.banner.heldBody"
            : unsaved
              ? "update.banner.unsavedBody"
              : "update.banner.readyBody",
        vars: { version },
        canRestart: !held && (options.canRestart ?? true),
        notesUrl: state.releaseNotesUrl,
        notes: state.releaseNotes,
        progress: null,
        canDismiss: true,
    };
}

/* -------------------------------------------------------------------------- */
/* The settings row                                                           */
/* -------------------------------------------------------------------------- */

export interface UpdateStatusModel {
    /** The visible state, in one word the row can also key an icon off. */
    readonly status: UpdateStatus | "checking";
    readonly tone: UpdateTone;
    readonly messageKey: UpdateCopyKey;
    readonly vars: Readonly<Record<string, string>>;
    /** The failure's own sentence, which is already written for a person. */
    readonly failureMessage: string | null;
    /** The updater's own words, for a disclosure. Never the whole message. */
    readonly failureDetail: string | null;
    /** Why this build cannot update itself, when it cannot. */
    readonly unsupportedReason: string | null;
    /** False while a check is already running, so the button cannot start a second. */
    readonly canCheck: boolean;
    /** True when there is a staged update the row should offer to install. */
    readonly canRestart: boolean;
}

/**
 * The whole of what the settings row shows.
 *
 * `checking` wins over the status underneath it only for the *word*: the failure, the
 * versions and the staged update all stay visible, because a check in flight is not a
 * reason to forget what was already known.
 */
export function statusFor(
    state: UpdateState,
    options: {
        readonly canCheck?: boolean;
        readonly canRestart?: boolean;
        readonly unsavedWork?: boolean;
    } = {},
): UpdateStatusModel {
    const staged = state.status === "ready" && state.readyVersion !== null;
    const unsaved = options.unsavedWork ?? false;
    const base = {
        failureMessage: state.failure?.message ?? null,
        failureDetail: state.failure?.detail ?? null,
        unsupportedReason: state.unsupportedReason,
        canCheck: (options.canCheck ?? true) && !state.checking && state.status !== "unsupported",
        canRestart: staged && !state.renderInProgress && !unsaved && (options.canRestart ?? true),
    };

    if (state.checking) {
        return {
            ...base,
            status: "checking",
            tone: "info",
            messageKey: "update.status.checking",
            vars: {},
        };
    }

    switch (state.status) {
        case "unsupported":
            return {
                ...base,
                status: "unsupported",
                tone: "info",
                messageKey:
                    state.newVersion === null
                        ? "update.status.unsupported"
                        : "update.status.available",
                vars: state.newVersion === null ? {} : { version: state.newVersion },
            };
        case "up-to-date":
            return {
                ...base,
                status: "up-to-date",
                tone: "success",
                messageKey: "update.status.upToDate",
                vars: {},
            };
        case "available":
            return {
                ...base,
                status: "available",
                tone: "info",
                messageKey: "update.status.available",
                vars: { version: state.newVersion ?? "" },
            };
        case "downloading":
            return {
                ...base,
                status: "downloading",
                tone: "info",
                messageKey: "update.status.downloading",
                vars: {},
            };
        case "ready": {
            const heldMessage = state.renderInProgress
                ? "update.banner.heldBody"
                : unsaved
                  ? "update.banner.unsavedBody"
                  : "update.banner.readyTitle";
            return {
                ...base,
                status: "ready",
                tone: state.renderInProgress || unsaved ? "warning" : "success",
                messageKey: heldMessage,
                vars: { version: state.readyVersion ?? "" },
            };
        }
        case "failed":
            return {
                ...base,
                status: "failed",
                tone: "error",
                messageKey: "update.status.failed",
                vars: {},
            };
        case "idle":
            return {
                ...base,
                status: "idle",
                tone: "info",
                messageKey: "update.status.idle",
                vars: {},
            };
    }
}

/** A state to render before the main process has answered, so nothing renders undefined. */
export function unknownUpdateState(currentVersion = ""): UpdateState {
    return {
        status: "idle",
        checking: false,
        currentVersion,
        newVersion: null,
        readyVersion: null,
        releaseNotes: null,
        releaseNotesUrl: null,
        failure: null,
        lastCheckedAt: null,
        lastCheckWasManual: false,
        unsupportedReason: null,
        renderInProgress: false,
        feedUrl: null,
        downloadProgress: null,
    };
}
