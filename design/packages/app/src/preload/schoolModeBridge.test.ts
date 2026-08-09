import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn(), send: vi.fn() },
    webUtils: { getPathForFile: vi.fn(() => "") },
}));

import { contextBridge, ipcRenderer } from "electron";
import "./index.js";

interface SchoolModeBridgeUnderTest {
    schoolMode: {
        read(): Promise<unknown>;
        enable(request: { readonly name: string | null; readonly credential: string }): Promise<unknown>;
        rename(name: string | null): Promise<unknown>;
        disable(credential: string): Promise<unknown>;
        reset(): Promise<unknown>;
    };
}

let bridge: SchoolModeBridgeUnderTest;

beforeAll(() => {
    const calls = vi.mocked(contextBridge.exposeInMainWorld).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("worldlens");
    bridge = calls[0]?.[1] as SchoolModeBridgeUnderTest;
});

beforeEach(() => {
    vi.mocked(ipcRenderer.invoke).mockReset();
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(undefined);
});

describe("window.worldlens.schoolMode", () => {
    it("exposes only the five narrow shared-record calls", async () => {
        const credential = "test-only-unlock";
        await bridge.schoolMode.read();
        await bridge.schoolMode.enable({ name: "Quiet study", credential });
        await bridge.schoolMode.rename("Quiet study");
        await bridge.schoolMode.disable(credential);
        await bridge.schoolMode.reset();

        expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, "schoolMode:read");
        expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, "schoolMode:enable", {
            name: "Quiet study",
            credential,
        });
        expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(3, "schoolMode:rename", "Quiet study");
        expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(4, "schoolMode:disable", credential);
        expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(5, "schoolMode:reset");
    });

    it("does not retain a credential or verifier on the exposed bridge object", () => {
        const shape = JSON.stringify(bridge.schoolMode);
        expect(shape).not.toContain("credential");
        expect(shape).not.toContain("hash");
        expect(shape).not.toContain("salt");
    });
});
