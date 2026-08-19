import { beforeEach, describe, expect, it } from "vitest";
import {
    CONSOLE_HISTORY_KEY,
    clearConsoleHistory,
    persistConsoleHistory,
    redactConsoleText,
    readConsoleHistory,
    type ConsoleHistoryRecord,
} from "./consoleHistory.js";
import type { ConsoleLine } from "./consoleModel.js";

function storage(): Storage {
    const values = new Map<string, string>();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
        clear: () => values.clear(),
        key: (index) => [...values.keys()][index] ?? null,
        get length() {
            return values.size;
        },
    } as Storage;
}

function line(id: number, message = `line ${id}`): ConsoleLine {
    return {
        id,
        level: "info",
        origin: "engine",
        message,
        text: null,
        at: "2026-08-19T00:00:00.000Z",
        annotations: [],
    };
}

describe("durable render console history", () => {
    let target: Storage;

    beforeEach(() => {
        target = storage();
    });

    it("round-trips a complete stream while the visible ring may be smaller", () => {
        const record: Omit<ConsoleHistoryRecord, "version" | "updatedAt"> = {
            renderId: "render-1",
            lines: [line(1), line(2), line(3)],
            dropped: 7,
            complete: false,
        };

        expect(persistConsoleHistory(record, target)).toBe(true);
        expect(readConsoleHistory("render-1", target)).toMatchObject({ ...record, version: 1 });
    });

    it("does not publish a partial record when storage refuses the temporary write", () => {
        const refusing = storage();
        refusing.setItem = () => {
            throw new Error("quota");
        };
        expect(persistConsoleHistory({ renderId: "render-1", lines: [line(1)], dropped: 0, complete: true }, refusing)).toBe(false);
        expect(refusing.getItem(CONSOLE_HISTORY_KEY)).toBeNull();
    });

    it("replaces one render atomically and can prune only that render", () => {
        expect(persistConsoleHistory({ renderId: "one", lines: [line(1)], dropped: 0, complete: true }, target)).toBe(true);
        expect(persistConsoleHistory({ renderId: "two", lines: [line(2)], dropped: 0, complete: true }, target)).toBe(true);
        expect(clearConsoleHistory("one", target)).toBe(true);
        expect(readConsoleHistory("one", target)).toBeNull();
        expect(readConsoleHistory("two", target)?.lines[0]?.message).toBe("line 2");
    });

    it("redacts credentials before durable storage while retaining the line facts in memory", () => {
        const source = "GET https://user:password@example.test/map?token=ghp_12345678901234567890";
        expect(redactConsoleText(source)).toBe("GET https://[redacted]@example.test/map?token=[redacted]");
        expect(persistConsoleHistory({ renderId: "private", lines: [line(1, source)], dropped: 0, complete: true }, target)).toBe(true);
        expect(readConsoleHistory("private", target)?.lines[0]?.message).not.toContain("ghp_");
    });

    it("reports line retention loss instead of pretending the record is complete", () => {
        const lines = Array.from({ length: 200_001 }, (_, index) => line(index));
        expect(persistConsoleHistory({ renderId: "large", lines, dropped: 0, complete: true }, target)).toBe(true);
        const restored = readConsoleHistory("large", target);
        expect(restored?.complete).toBe(false);
        expect(restored?.evictedLines).toBeGreaterThan(0);
        expect(["retention-limit", "storage-limit"]).toContain(restored?.storageWarning);
    });
});
