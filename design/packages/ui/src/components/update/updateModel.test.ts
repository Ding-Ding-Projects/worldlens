import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";
import {
    bannerFor,
    clearDismissedUpdate,
    dismissUpdate,
    readDismissedUpdate,
    formatByteCount,
    progressFor,
    statusFor,
    unknownUpdateState,
} from "./updateModel.js";
import type { UpdateState } from "./updateBridge.js";

beforeEach(() => {
    setSetupStorage(memoryStorage());
});

function state(overrides: Partial<UpdateState> = {}): UpdateState {
    return { ...unknownUpdateState("0.1.0"), ...overrides };
}

const ready = state({ status: "ready", readyVersion: "0.2.0", newVersion: "0.2.0" });

describe("bannerFor", () => {
    it("shows nothing until there is something staged", () => {
        expect(bannerFor(state()).visible).toBe(false);
        expect(bannerFor(state({ status: "up-to-date" })).visible).toBe(false);
        // A download in flight is the one other state that earns the banner, because a bar
        // is the only place "is this moving or has it stalled" can be answered. It carries
        // no offer, so it carries no actions.
        const downloading = bannerFor(state({ status: "downloading", newVersion: "0.2.0" }));
        expect(downloading.visible).toBe(true);
        expect(downloading.canRestart).toBe(false);
        expect(downloading.canDismiss).toBe(false);
        // A failed check informs; it belongs in the notification corner, not in a fixture
        // that occupies the top of the window until somebody dismisses it.
        expect(bannerFor(state({ status: "failed" })).visible).toBe(false);
    });

    it("shows the staged version, exactly, as a variable rather than as copy", () => {
        const banner = bannerFor(ready);
        expect(banner.visible).toBe(true);
        expect(banner.vars["version"]).toBe("0.2.0");
        expect(banner.canRestart).toBe(true);
        expect(banner.tone).toBe("success");
    });

    it("holds Restart visibly while a render runs, and says why", () => {
        const banner = bannerFor({ ...ready, renderInProgress: true });
        expect(banner.visible).toBe(true);
        expect(banner.canRestart).toBe(false);
        expect(banner.tone).toBe("warning");
        // A different sentence, not merely a disabled button: a control that looks live and
        // does nothing is indistinguishable from a broken one.
        expect(banner.bodyKey).toBe("update.banner.heldBody");
    });

    it("holds Restart visibly while configuration work is unsaved", () => {
        const banner = bannerFor(ready, { unsavedWork: true });
        expect(banner.canRestart).toBe(false);
        expect(banner.tone).toBe("warning");
        expect(banner.bodyKey).toBe("update.banner.unsavedBody");
        expect(statusFor(ready, { unsavedWork: true }).canRestart).toBe(false);
    });

    it("hides Restart when the build can report an update but not install one", () => {
        expect(bannerFor(ready, { canRestart: false }).canRestart).toBe(false);
    });

    it("stays away once dismissed for that version", () => {
        expect(bannerFor(ready, { dismissedVersion: "0.2.0" }).visible).toBe(false);
    });

    it("comes back for the next version, so Later never means never", () => {
        const next = { ...ready, readyVersion: "0.3.0", newVersion: "0.3.0" };
        expect(bannerFor(next, { dismissedVersion: "0.2.0" }).visible).toBe(true);
    });

    it("carries the notes and the link when the feed gave them", () => {
        const banner = bannerFor({
            ...ready,
            releaseNotes: "Fixed a thing",
            releaseNotesUrl: "https://example.test/r",
        });
        expect(banner.notes).toBe("Fixed a thing");
        expect(banner.notesUrl).toBe("https://example.test/r");
    });
});

describe("the dismissal store", () => {
    it("remembers a dismissal per version and can be cleared", () => {
        expect(readDismissedUpdate()).toBeNull();
        dismissUpdate("0.2.0");
        expect(readDismissedUpdate()).toBe("0.2.0");
        clearDismissedUpdate();
        expect(readDismissedUpdate()).toBeNull();
    });

    describe("mirroring into the application-settings history", () => {
        beforeEach(() => {
            vi.mocked(recordAppSetting).mockClear();
        });

        it("mirrors the dismissed version under the updateDismissed key", () => {
            dismissUpdate("0.2.0");
            expect(recordAppSetting).toHaveBeenCalledTimes(1);
            expect(recordAppSetting).toHaveBeenCalledWith("updateDismissed", "0.2.0");
        });
    });
});

describe("statusFor", () => {
    it("names every state the row has to show", () => {
        expect(statusFor(state()).status).toBe("idle");
        expect(statusFor(state({ checking: true })).status).toBe("checking");
        expect(statusFor(state({ status: "up-to-date" })).status).toBe("up-to-date");
        expect(statusFor(state({ status: "downloading" })).status).toBe("downloading");
        expect(statusFor(ready).status).toBe("ready");
        expect(statusFor(state({ status: "failed" })).status).toBe("failed");
        expect(statusFor(state({ status: "unsupported" })).status).toBe("unsupported");
    });

    it("keeps a failure visible while a new check runs", () => {
        const model = statusFor(
            state({
                status: "failed",
                checking: true,
                failure: {
                    code: "offline",
                    message: "Offline.",
                    detail: "ENOTFOUND",
                    retryable: true,
                },
            }),
        );
        // The spinner sits beside what is known, never instead of it - which is the whole
        // of "never hide a failure behind a spinner".
        expect(model.status).toBe("checking");
        expect(model.failureMessage).toBe("Offline.");
        expect(model.failureDetail).toBe("ENOTFOUND");
    });

    it("will not start a second check while one is running", () => {
        expect(statusFor(state({ checking: true })).canCheck).toBe(false);
    });

    it("offers no check at all on a build that cannot update", () => {
        const model = statusFor(
            state({ status: "unsupported", unsupportedReason: "Not packaged." }),
        );
        expect(model.canCheck).toBe(false);
        expect(model.unsupportedReason).toBe("Not packaged.");
    });

    it("reports a version an unsupported build cannot install, without offering to", () => {
        const model = statusFor(
            state({
                status: "unsupported",
                unsupportedReason: "Not packaged.",
                newVersion: "0.9.0",
            }),
        );
        expect(model.messageKey).toBe("update.status.available");
        expect(model.vars["version"]).toBe("0.9.0");
        expect(model.canRestart).toBe(false);
    });

    it("offers Restart only when something is staged and nothing is rendering", () => {
        expect(statusFor(ready).canRestart).toBe(true);
        expect(statusFor({ ...ready, renderInProgress: true }).canRestart).toBe(false);
        expect(statusFor(state({ status: "downloading" })).canRestart).toBe(false);
        expect(statusFor(ready, { canRestart: false }).canRestart).toBe(false);
    });

    it("reports a build with no manual check as having none", () => {
        expect(statusFor(state(), { canCheck: false }).canCheck).toBe(false);
    });
});

describe("progressFor", () => {
    it("reports nothing at all unless a download is running", () => {
        expect(progressFor(state())).toBeNull();
        expect(progressFor(ready)).toBeNull();
        expect(progressFor(state({ status: "failed" }))).toBeNull();
    });

    it("is indeterminate when the download is underway and nobody is counting", () => {
        // The ordinary case with Electron's Squirrel updater, which reports the start and the
        // finish of a download and nothing in between. An indeterminate bar is the truth;
        // a percentage here would be invented.
        const progress = progressFor(state({ status: "downloading" }));
        expect(progress?.indeterminate).toBe(true);
        expect(progress?.percent).toBeNull();
        expect(progress?.transferredLabel).toBeNull();
    });

    it("stays indeterminate when bytes are counted but no total was served", () => {
        const progress = progressFor(
            state({
                status: "downloading",
                downloadProgress: {
                    transferredBytes: 5 * 1024 * 1024,
                    totalBytes: null,
                    percent: null,
                    bytesPerSecond: null,
                },
            }),
        );
        // The byte count is real and is shown; the percentage it cannot support is not.
        expect(progress?.transferredLabel).toBe("5.0 MB");
        expect(progress?.totalLabel).toBeNull();
        expect(progress?.percent).toBeNull();
        expect(progress?.indeterminate).toBe(true);
    });

    it("renders the reported percentage, the counts and the rate when they exist", () => {
        const progress = progressFor(
            state({
                status: "downloading",
                downloadProgress: {
                    transferredBytes: 12 * 1024 * 1024,
                    totalBytes: 48 * 1024 * 1024,
                    percent: 25,
                    bytesPerSecond: 1536 * 1024,
                },
            }),
        );
        expect(progress?.indeterminate).toBe(false);
        expect(progress?.percent).toBe(25);
        expect(progress?.transferredLabel).toBe("12.0 MB");
        expect(progress?.totalLabel).toBe("48.0 MB");
        expect(progress?.rateLabel).toBe("1.5 MB/s");
    });

    it("survives a preload older than the field, rather than rendering undefined", () => {
        // A running process decides what a state actually carries, whatever the type says.
        const older = { ...state({ status: "downloading" }) } as Record<string, unknown>;
        delete older["downloadProgress"];
        const progress = progressFor(older as unknown as UpdateState);
        expect(progress?.indeterminate).toBe(true);
    });
});

describe("formatByteCount", () => {
    it("names the unit and keeps one decimal above bytes", () => {
        expect(formatByteCount(512)).toBe("512 B");
        expect(formatByteCount(1024)).toBe("1.0 KB");
        expect(formatByteCount(1024 * 1024 * 3.5)).toBe("3.5 MB");
    });

    it("refuses a count that is not one", () => {
        expect(formatByteCount(-1)).toBeNull();
        expect(formatByteCount(Number.NaN)).toBeNull();
    });
});
