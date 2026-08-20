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
        verify(credential: string): Promise<unknown>;
        disable(credential: string): Promise<unknown>;
        reset(): Promise<unknown>;
        onChanged(listener: (result: unknown) => void): () => void;
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
    vi.mocked(ipcRenderer.on).mockReset();
    vi.mocked(ipcRenderer.off).mockReset();
});

describe("window.worldlens.schoolMode", () => {
    it("exposes the six narrow shared-record calls", async () => {
        const credential = "test-only-unlock";
        await bridge.schoolMode.read();
        await bridge.schoolMode.enable({ name: "Quiet study", credential });
        await bridge.schoolMode.rename("Quiet study");
        await bridge.schoolMode.verify(credential);
        await bridge.schoolMode.disable(credential);
        await bridge.schoolMode.reset();

        expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, "schoolMode:read");
        expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, "schoolMode:enable", {
            name: "Quiet study",
            credential,
        });
        expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(3, "schoolMode:rename", "Quiet study");
        expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(4, "schoolMode:verify", credential);
        expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(5, "schoolMode:disable", credential);
        expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(6, "schoolMode:reset");
    });

    it("subscribes and unsubscribes the exact safe change listener", () => {
        const listener = vi.fn();
        const unsubscribe = bridge.schoolMode.onChanged(listener);
        const registered = vi.mocked(ipcRenderer.on).mock.calls[0];
        expect(registered?.[0]).toBe("schoolMode:changed");
        const forward = registered?.[1];
        if (forward === undefined) throw new Error("School-mode change listener was not registered.");

        const result = {
            ok: true,
            state: { version: 1, enabled: true, name: "Quiet study", credentialConfigured: true },
        };
        forward({} as never, result);
        expect(listener).toHaveBeenCalledWith(result);

        unsubscribe();
        expect(ipcRenderer.off).toHaveBeenCalledWith("schoolMode:changed", forward);
    });

    it("does not retain a credential or verifier on the exposed bridge object", () => {
        const shape = JSON.stringify(bridge.schoolMode);
        expect(shape).not.toContain("credential");
        expect(shape).not.toContain("hash");
        expect(shape).not.toContain("salt");
    });
});
