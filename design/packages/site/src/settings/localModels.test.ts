/**
 * The address check and the failure wording carry almost all the value here.
 *
 * A field that accepted any host would make a page somebody was merely reading into a
 * scanner, and a failure that named one cause out of two indistinguishable ones would send
 * people to the wrong place with confidence.
 */

import { describe, expect, it } from "vitest";

import {
    DEFAULT_ENDPOINT,
    PAGE_BOUNDARY,
    endpointAllowed,
    listLocalModels,
} from "./localModels.js";

const ok = (body: unknown): typeof fetch =>
    (async () =>
        ({ ok: true, status: 200, json: async () => body }) as unknown as Response) as typeof fetch;

describe("which addresses are allowed", () => {
    it("allows loopback in the spellings people actually use", () => {
        for (const address of [
            "http://127.0.0.1:11434",
            "http://localhost:11434",
            "http://[::1]:11434",
        ]) {
            expect(endpointAllowed(address).allowed).toBe(true);
        }
    });

    it("refuses anywhere else", () => {
        // A field that accepted any host would make a page somebody was reading into a
        // scanner pointed at whatever they pasted in.
        for (const address of [
            "http://192.168.1.10:11434",
            "https://example.com",
            "http://169.254.169.254",
        ]) {
            const result = endpointAllowed(address);
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe("not-loopback");
        }
    });

    it("refuses something that is not an address at all", () => {
        expect(endpointAllowed("nonsense").reason).toBe("not-an-address");
        expect(endpointAllowed("file:///etc/passwd").reason).toBe("not-an-address");
    });

    it("checks before making any request", async () => {
        // The check has to happen before the fetch, or refusing it afterwards has already
        // made the request it was meant to prevent.
        let called = false;
        const spy = (async () => {
            called = true;
            return {} as Response;
        }) as typeof fetch;
        await listLocalModels("http://example.com", spy);
        expect(called).toBe(false);
    });
});

describe("listing what is installed", () => {
    it("reports the models a runtime names", async () => {
        const result = await listLocalModels(
            DEFAULT_ENDPOINT,
            ok({ models: [{ name: "llama3", size: 4_700_000_000 }] }),
        );
        expect(result.ok).toBe(true);
        expect(result.ok === true && result.models[0]?.name).toBe("llama3");
        expect(result.ok === true && result.models[0]?.bytes).toBe(4_700_000_000);
    });

    it("never claims to know whether a model will run well", async () => {
        // The browser cannot see RAM, VRAM or the driver, and a verdict guessed from a name
        // is not a verdict.
        const result = await listLocalModels(DEFAULT_ENDPOINT, ok({ models: [{ name: "llama3:70b" }] }));
        expect(result.ok === true && result.models[0]?.fit).toBe("unknown");
    });

    it("skips an entry with no name rather than inventing one", async () => {
        const result = await listLocalModels(DEFAULT_ENDPOINT, ok({ models: [{ size: 1 }, { name: "a" }] }));
        expect(result.ok === true && result.models.map((m) => m.name)).toEqual(["a"]);
    });

    it("says something answered wrongly when it did", async () => {
        const result = await listLocalModels(DEFAULT_ENDPOINT, ok({ nope: true }));
        expect(result.ok === false && result.reason).toBe("unexpected-answer");
    });
});

describe("when there is no answer", () => {
    it("names both possibilities instead of picking one", async () => {
        // A browser reports a blocked cross-origin request and a refused connection
        // identically. Naming one would be a guess stated as a fact, and the two send a
        // person to different places.
        const refuse = (async () => {
            throw new TypeError("Failed to fetch");
        }) as typeof fetch;
        const result = await listLocalModels(DEFAULT_ENDPOINT, refuse);
        expect(result.ok === false && result.reason).toBe("unreachable-or-blocked");
        expect(result.ok === false && result.detail).toMatch(/cannot tell you which/);
    });

    it("distinguishes a timeout from a refusal", async () => {
        const hang = (async () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            throw error;
        }) as typeof fetch;
        const result = await listLocalModels(DEFAULT_ENDPOINT, hang, 5);
        expect(result.ok === false && result.reason).toBe("timed-out");
    });
});

describe("the boundary it states", () => {
    it("says it never relays anything through a server", () => {
        expect(PAGE_BOUNDARY.join(" ")).toMatch(/straight to the address you name/);
    });

    it("names every thing it cannot do, rather than leaving them to be discovered", () => {
        const all = PAGE_BOUNDARY.join(" ");
        expect(all).toMatch(/cannot tell you whether a model will run well/);
        expect(all).toMatch(/cannot download or delete/);
        expect(all).toMatch(/cannot launch/);
    });
});
