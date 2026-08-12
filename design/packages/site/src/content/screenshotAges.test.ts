/**
 * Ages are computed when read, so the only thing worth pinning is the arithmetic and the
 * wording - and that a date the record could not supply never renders as a confident lie.
 */
import { describe, expect, it } from "vitest";

import { captureAge, captureTakenLine } from "./screenshots.js";

const NOW = Date.parse("2026-08-10T12:00:00Z");

describe("how long ago a capture was taken", () => {
    it("speaks in whole units", () => {
        expect(captureAge("2026-08-10T11:59:30Z", NOW)).toBe("just now");
        expect(captureAge("2026-08-10T11:45:00Z", NOW)).toBe("15 minutes ago");
        expect(captureAge("2026-08-10T09:00:00Z", NOW)).toBe("3 hours ago");
        expect(captureAge("2026-08-09T12:00:00Z", NOW)).toBe("1 day ago");
        expect(captureAge("2026-08-01T12:00:00Z", NOW)).toBe("1 week ago");
        expect(captureAge("2026-06-10T12:00:00Z", NOW)).toBe("2 months ago");
        expect(captureAge("2024-08-10T12:00:00Z", NOW)).toBe("2 years ago");
    });

    it("refuses to invent an age it does not have", () => {
        expect(captureAge("not a date", NOW)).toBe("at an unrecorded time");
    });

    it("never reports a future capture as negative time", () => {
        expect(captureAge("2026-08-10T12:00:30Z", NOW)).toBe("just now");
    });

    it("names the date beside the age, and says which kind of date it is", () => {
        expect(captureTakenLine("2026-08-09T12:00:00Z", "captured", NOW)).toBe("Taken 2026-08-09 · 1 day ago");
        expect(captureTakenLine("2026-08-09T12:00:00Z", "committed", NOW)).toBe("Committed 2026-08-09 · 1 day ago");
    });
});
