import { describe, expect, it } from "vitest";
import { newLines, startConsoleFeed } from "./consoleFeed.js";

const line = (text: string) => ({ stream: "stdout" as const, text, at: "t" });

describe("the management site's console feed", () => {
    it("finds the lines a sliding tail added", () => {
        expect(newLines(["a", "b", "c"], ["b", "c", "d", "e"])).toEqual(["d", "e"]);
        expect(newLines([], ["a"])).toEqual(["a"]);
        expect(newLines(["a", "b"], ["a", "b"])).toEqual([]);
        expect(newLines(["x"], ["y", "z"])).toEqual(["y", "z"]);
    });

    it("keeps history from the first read and emits only later lines", async () => {
        const reads = [["a", "b"], ["a", "b", "c"], ["b", "c", "d"]];
        const emitted: string[] = [];
        let i = 0;
        const feed = startConsoleFeed({
            read: async () => (reads[Math.min(i++, reads.length - 1)] ?? []).map(line),
            emit: (l) => emitted.push(l.text),
            intervalMs: 5,
        });
        await new Promise((r) => setTimeout(r, 60));
        feed.stop();
        expect(emitted).toEqual(["c", "d"]);
        expect(feed.history().map((l) => l.text)).toEqual(["a", "b", "c", "d"]);
    });
});
