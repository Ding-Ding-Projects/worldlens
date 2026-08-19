import { afterEach, describe, expect, it } from "vitest";
import { resolveCiRenderBridge } from "./ciRenderBridge.js";

afterEach(() => {
    delete (globalThis as { worldlens?: unknown }).worldlens;
});

describe("the CI Pages bootstrap bridge", () => {
    it("forwards the explicit Pages choice through the optional adapter", async () => {
        const calls: unknown[][] = [];
        (globalThis as { worldlens?: unknown }).worldlens = {
            ciRenderPreflight: () => Promise.resolve({ ok: false, message: "unused" }),
            startCiRender: () => Promise.resolve({ ok: false, syncId: "unused" }),
            onCiRenderEvent: () => () => {},
            bootstrapCiRepository: (...args: unknown[]) => {
                calls.push(args);
                return Promise.resolve({
                    ok: false,
                    failure: {
                        code: "invalid-request",
                        message: "recorded",
                        missingScopes: null,
                    },
                });
            },
            onCiBootstrapEvent: () => () => {},
        };

        const bridge = resolveCiRenderBridge();
        expect(bridge?.bootstrapCiRepository).toBeTypeOf("function");

        await bridge?.bootstrapCiRepository?.("owner", "repo", "account", true);

        expect(calls).toEqual([["owner", "repo", "account", true]]);
    });
});
