import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveWorldDownloaderBridge } from "./worldDownloaderBridge.js";

afterEach(() => vi.unstubAllGlobals());

function complete() {
    return {
        status: vi.fn(),
        ensureJar: vi.fn(),
        readSettings: vi.fn(),
        writeSettings: vi.fn(),
        testConnection: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        openTokenIntake: vi.fn(),
        clearToken: vi.fn(),
        countChunks: vi.fn(),
        portFree: vi.fn(),
        onWorldDownloaderEvent: vi.fn(),
    };
}

describe("resolveWorldDownloaderBridge", () => {
    it("resolves the real nested preload namespace only when every method exists", () => {
        const worldDownloader = complete();
        vi.stubGlobal("worldlens", { worldDownloader });
        expect(resolveWorldDownloaderBridge()).toBe(worldDownloader);
    });

    it("refuses a partial bridge with no event listener instead of presenting invented progress", () => {
        const partial = { ...complete(), onWorldDownloaderEvent: undefined };
        vi.stubGlobal("worldlens", { worldDownloader: partial });
        expect(resolveWorldDownloaderBridge()).toBeNull();
    });

    it("refuses when the namespace is entirely absent, on an older shell", () => {
        vi.stubGlobal("worldlens", {});
        expect(resolveWorldDownloaderBridge()).toBeNull();
    });

    it("refuses a bridge missing start, so a screen cannot silently pretend a download began", () => {
        const partial = { ...complete(), start: undefined };
        vi.stubGlobal("worldlens", { worldDownloader: partial });
        expect(resolveWorldDownloaderBridge()).toBeNull();
    });
});
