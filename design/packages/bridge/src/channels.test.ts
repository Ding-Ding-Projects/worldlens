/**
 * Locks the hand-written channel inventory to the factory, in both directions.
 *
 * One direction catches a channel that appeared in the factory without anybody deciding it
 * should be reachable. The other catches a channel removed from the factory while the
 * inventory still claims it, which would leave a hosting policy standing guard over nothing
 * and quietly overstate what has been reviewed.
 *
 * This reads the factory's source rather than calling it, deliberately: a channel name is a
 * string literal, so the only way to know which ones exist is to look at them. Calling every
 * method would prove which ones a test remembered to call, which is the discovery-only trap
 * this pair exists to avoid.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
    BRIDGE_CHANNELS,
    BRIDGE_EVENT_CHANNELS,
    BRIDGE_INVOKE_CHANNELS,
    BRIDGE_SYNC_CHANNELS,
} from "./channels.js";

const source = readFileSync(fileURLToPath(new URL("./factory.ts", import.meta.url)), "utf8");

function channelsIn(call: "invoke" | "on" | "sendSync"): string[] {
    // Anchored on `transport.<call>("` so a commented-out line cannot satisfy it and a
    // renamed receiver cannot be carried along by a substring match.
    const pattern = new RegExp(String.raw`transport\.${call}\(\s*"([^"]+)"`, "g");
    return [...source.matchAll(pattern)].map((match) => match[1] as string).sort();
}

const unique = (values: readonly string[]): string[] => [...new Set(values)].sort();

describe("the channel inventory", () => {
    it("names exactly the request channels the factory reaches", () => {
        expect(unique(channelsIn("invoke"))).toEqual([...BRIDGE_INVOKE_CHANNELS].sort());
    });

    it("names exactly the push channels the factory subscribes to", () => {
        expect(unique(channelsIn("on"))).toEqual([...BRIDGE_EVENT_CHANNELS].sort());
    });

    it("names exactly the synchronous channels the factory reads", () => {
        expect(unique(channelsIn("sendSync"))).toEqual([...BRIDGE_SYNC_CHANNELS].sort());
    });

    it("keeps every channel distinct, so a policy cannot be written twice for one name", () => {
        expect(BRIDGE_CHANNELS.length).toBe(new Set(BRIDGE_CHANNELS).size);
    });

    it("finds a real surface rather than an empty one", () => {
        // The tripwire for the failure that would make every assertion above vacuous: if the
        // pattern stopped matching - a rename, a reformat that split the call across lines -
        // both sides would be empty and every comparison would pass while checking nothing.
        expect(channelsIn("invoke").length).toBeGreaterThan(250);
        expect(channelsIn("on").length).toBeGreaterThan(15);
    });
});
