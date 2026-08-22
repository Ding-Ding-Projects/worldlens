import { describe, expect, it, vi } from "vitest";
import {
    adoptDiscover,
    consoleOpen,
    hasExtendedBridge,
    playersAction,
    pluginsSearch,
    rconTest,
    webConsoleStatus,
} from "./mcserverBridge.js";

function fakeRoot(overrides: Record<string, unknown> = {}): unknown {
    return { worldlens: { mcserver: overrides } };
}

describe("mcserverBridge", () => {
    it("reports no host as ok:false with a stable code, never throwing", async () => {
        const result = await rconTest("srv-1", {});
        expect(result.ok).toBe(false);
        expect(result.failure?.code).toBe("no-host");
    });

    it("passes through an Answer the bridge already returns", async () => {
        const root = fakeRoot({ rconTest: vi.fn().mockResolvedValue({ ok: true, value: { ok: true, latencyMs: 4, message: "" } }) });
        const result = await rconTest("srv-1", root);
        expect(result.ok).toBe(true);
        expect(result.value?.latencyMs).toBe(4);
    });

    it("wraps a bare (non-Answer) resolved value as ok:true", async () => {
        const root = fakeRoot({ consoleOpen: vi.fn().mockResolvedValue({ sessionId: "abc" }) });
        const result = await consoleOpen("srv-1", 100, root);
        expect(result).toEqual({ ok: true, value: { sessionId: "abc" } });
    });

    it("turns a thrown error into a failed Answer instead of rejecting", async () => {
        const root = fakeRoot({ players: { action: vi.fn().mockRejectedValue(new Error("boom")) } });
        const result = await playersAction("srv-1", { action: "kick", name: "Steve" }, root);
        expect(result.ok).toBe(false);
        expect(result.failure?.message).toBe("boom");
    });

    it("reports missing namespaces individually rather than needing the whole bridge", async () => {
        const root = fakeRoot({ plugins: {} });
        const result = await pluginsSearch({ sourceId: "modrinth", query: "x" }, root);
        expect(result.ok).toBe(false);
    });

    it("adoptDiscover and webConsoleStatus are independently feature-detected", async () => {
        const root = fakeRoot({ adopt: { discover: vi.fn().mockResolvedValue([]) } });
        expect((await adoptDiscover(root)).ok).toBe(true);
        expect((await webConsoleStatus(root)).ok).toBe(false);
    });

    it("hasExtendedBridge is false until every namespace is present", () => {
        expect(hasExtendedBridge({})).toBe(false);
        expect(
            hasExtendedBridge(
                fakeRoot({
                    consoleOpen: vi.fn(),
                    players: { list: vi.fn() },
                    plugins: { search: vi.fn() },
                    adopt: { discover: vi.fn() },
                    webConsole: { status: vi.fn() },
                }),
            ),
        ).toBe(true);
    });
});
