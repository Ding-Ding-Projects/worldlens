/**
 * The shell's one notification queue.
 *
 * The rules the queue follows are already covered next door in
 * `components/config/notifications.test.ts`; nothing here re-tests them. What this file
 * pins is the part only a singleton can get wrong: that every caller writes to the same
 * state, that the state is reactive so the rail badge updates for all of them, and
 * that a message outlives the screen that raised it. That last one is the whole reason the
 * queue was hoisted out of the options editor, and it is invisible to a test that builds
 * its own state with `createNoticeState()`.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { watchEffect } from "vue";
import { dismissAll, notify } from "../components/config/notifications.js";
import { DEFAULT_NOTICE_DURATION_LEVEL } from "../components/config/noticeDurationLevels.js";
import { readNoticeDurationLevel } from "../components/config/noticeDurationPrefs.js";
import { memoryStorage, setSetupStorage } from "../components/setup/setupPrefs.js";
import { changeNoticeDuration, notices, raiseNotice } from "./notices.js";
import { productDisplayName } from "./productName.js";

beforeEach(() => {
    dismissAll(notices);
    notices.history.length = 0;
    productDisplayName.value = "Worldlens";
});

describe("the shared rail history", () => {
    it("records a raised notice for the rail bell without creating a fixed toast", () => {
        const notice = raiseNotice("success", "Wrote 9 files in /srv/bluemap.");

        expect(notices.live).toEqual([]);
        expect(notices.history).toEqual([notice]);
        expect(notice.delivery).toBe("history");
        expect(notice.title).toBe("Worldlens");
    });

    it("keeps direct shared-queue writers at the rail too, not just raiseNotice callers", () => {
        const notice = notify(notices, "info", "The options editor recorded its defaults.");

        expect(notices.live).toEqual([]);
        expect(notices.history).toEqual([notice]);
        expect(notice.delivery).toBe("history");
    });

    it("uses the cosmetic display name as the default notification title", () => {
        productDisplayName.value = "Andy's Atlas";
        expect(raiseNotice("info", "Ready.").title).toBe("Andy's Atlas");
        expect(raiseNotice("info", "Named.", { title: "Specific title" }).title).toBe("Specific title");
    });

    it("carries a detail through to the same state", () => {
        raiseNotice("error", "The files were not written.", "EACCES: permission denied");

        expect(notices.history[0]?.detail).toBe("EACCES: permission denied");
    });

    it("is reactive, so the rail badge sees anything the shared helper records", () => {
        const seen: number[] = [];
        const stop = watchEffect(() => seen.push(notices.history.length), { flush: "sync" });

        raiseNotice("info", "Read 4 config files.");
        stop();

        expect(seen).toEqual([0, 1]);
    });

    it("keeps several shared events in the one reviewable history", () => {
        raiseNotice("info", "from the shell");
        raiseNotice("info", "from the options editor");

        expect(notices.live).toEqual([]);
        expect(notices.history.map((notice) => notice.message)).toEqual([
            "from the options editor",
            "from the shell",
        ]);
    });

    it("keeps a notice after the screen that raised it is gone, which is why it was hoisted", () => {
        // Nothing here unmounts anything, because the point is that there is nothing to
        // unmount: the queue is module state, so closing the editor cannot take the
        // message with it and a warning about maps needing a re-render still gets read.
        raiseNotice("warning", "These maps have to be rendered again: overworld.");

        expect(notices.live).toHaveLength(0);
        expect(notices.history).toHaveLength(1);
    });
});

describe("changing how long a toast stays", () => {
    it("changes what the shared queue itself gives a freshly raised notice", () => {
        try {
            changeNoticeDuration(5);
            const notice = raiseNotice("info", "should stay until dismissed");
            expect(notice.timeout).toBeNull();
        } finally {
            changeNoticeDuration(DEFAULT_NOTICE_DURATION_LEVEL);
        }
    });

    it("is the only place the preference is written, so it always persists what it just set", () => {
        setSetupStorage(memoryStorage());
        try {
            changeNoticeDuration(1);
            expect(readNoticeDurationLevel()).toBe(1);
        } finally {
            changeNoticeDuration(DEFAULT_NOTICE_DURATION_LEVEL);
        }
    });
});
