import { describe, expect, it } from "vitest";

import { readUpstreamRelease, type FetchJson } from "./source.js";

/**
 * "We could not ask" and "you are up to date" are different claims, and this file is the guard on
 * the one place they were the same answer.
 *
 * The upstream check reads three GitHub documents in order, so the stand-in below answers by URL
 * rather than by call count: a test that depends on the order of those three would go red the
 * next time an annotated tag needs peeling, which is a change to how upstream tags a release
 * rather than a defect in this module.
 */
function github(compare: unknown): FetchJson {
    return (url: string) => {
        if (url.endsWith("/releases/latest")) {
            return Promise.resolve({ tag_name: "v5.23", published_at: "2026-08-01T00:00:00Z" });
        }
        if (url.includes("/git/ref/tags/")) {
            return Promise.resolve({
                object: { sha: "1111111111111111111111111111111111111111", type: "commit" },
            });
        }
        if (url.includes("/compare/")) return Promise.resolve(compare);
        throw new Error(`unexpected request: ${url}`);
    };
}

const PINNED = "0000000000000000000000000000000000000000";

describe("what upstream said, and what it did not say", () => {
    it("reads a real comparison from the pin's own side", async () => {
        const release = await readUpstreamRelease(PINNED, github({ status: "ahead", ahead_by: 4, behind_by: 0 }));

        // GitHub phrases the compare from the head's side, so upstream being ahead is us being
        // behind. The inversion is the reason `classifyComparison` exists at all.
        expect(release.comparison).toBe("behind");
        expect(release.commitsBehind).toBe(4);
    });

    it("refuses a comparison with no status rather than reporting it as up to date", async () => {
        // A 200 whose body carries no status: a rewritten response, or a future change to the
        // shape of the API. This used to become "identical", then "level", then the settings row
        // saying there was nothing to do - an affirmative verdict from a field never read.
        await expect(readUpstreamRelease(PINNED, github({}))).rejects.toThrow(/no usable status/);
    });
});
