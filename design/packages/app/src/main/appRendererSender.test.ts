import type { IpcMainInvokeEvent } from "electron";
import { afterEach, describe, expect, it } from "vitest";
import { forgetAppRenderer, isAppRendererSender, trustAppRenderer } from "./appRendererSender.js";

const mainFrame = { name: "main" };

function event(
    overrides: {
        id?: number;
        url?: string;
        destroyed?: boolean;
        frame?: unknown;
    } = {},
): IpcMainInvokeEvent {
    return {
        sender: {
            id: overrides.id ?? 1,
            isDestroyed: () => overrides.destroyed ?? false,
            getURL: () => overrides.url ?? "http://127.0.0.1:4100/",
            mainFrame,
        },
        senderFrame: overrides.frame === undefined ? mainFrame : overrides.frame,
    } as unknown as IpcMainInvokeEvent;
}

afterEach(forgetAppRenderer);

describe("the application's own renderer", () => {
    it("trusts nothing before the main window is recorded", () => {
        expect(isAppRendererSender(event())).toBe(false);
    });

    it("accepts the main window's main frame at the embedded server's origin", () => {
        trustAppRenderer({ id: 1 }, "http://127.0.0.1:4100");
        expect(isAppRendererSender(event())).toBe(true);
        expect(isAppRendererSender(event({ url: "http://127.0.0.1:4100/#/work" }))).toBe(true);
    });

    // The defect: the packaged interface is served over loopback HTTP, and the old checks
    // accepted only `file:`, so Generate and start was refused in every installed build.
    it("accepts the packaged renderer that the old file:-only check refused", () => {
        trustAppRenderer({ id: 1 }, "http://127.0.0.1:52311");
        const packaged = event({ url: "http://127.0.0.1:52311/" });
        expect(packaged.sender.getURL().startsWith("file:")).toBe(false);
        expect(isAppRendererSender(packaged)).toBe(true);
    });

    it("refuses another window, an embedded frame, another origin and a destroyed sender", () => {
        trustAppRenderer({ id: 1 }, "http://127.0.0.1:4100");
        expect(isAppRendererSender(event({ id: 2 }))).toBe(false);
        expect(isAppRendererSender(event({ frame: { name: "iframe" } }))).toBe(false);
        expect(isAppRendererSender(event({ url: "http://127.0.0.1:4101/" }))).toBe(false);
        expect(isAppRendererSender(event({ url: "https://untrusted.invalid/" }))).toBe(false);
        expect(isAppRendererSender(event({ url: "file:///workspace/index.html" }))).toBe(false);
        expect(isAppRendererSender(event({ url: "not a url" }))).toBe(false);
        expect(isAppRendererSender(event({ destroyed: true }))).toBe(false);
    });

    it("trusts nothing once the window is forgotten", () => {
        trustAppRenderer({ id: 1 }, "http://127.0.0.1:4100");
        forgetAppRenderer();
        expect(isAppRendererSender(event())).toBe(false);
    });
});
