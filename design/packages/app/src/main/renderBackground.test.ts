import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { backgroundRenderCopy, protectBackgroundRender } from "./renderBackground.js";

const state = vi.hoisted(() => ({
    appEvents: new Map<string, (event: { preventDefault(): void }) => void>(),
    trays: [] as Array<{
        events: Map<string, () => void>;
        menu: Array<{ enabled?: boolean; click?: () => void }>;
        destroyed: boolean;
    }>,
    quit: vi.fn(),
    failTray: false,
}));
vi.mock("electron", () => ({
    app: {
        on: (name: string, fn: (event: { preventDefault(): void }) => void) =>
            state.appEvents.set(name, fn),
        removeListener: (name: string) => state.appEvents.delete(name),
        quit: state.quit,
    },
    Menu: { buildFromTemplate: (items: unknown) => items },
    Tray: class {
        events = new Map<string, () => void>();
        menu: Array<{ enabled?: boolean; click?: () => void }> = [];
        destroyed = false;
        constructor() {
            if (state.failTray) throw new Error("tray unavailable");
            state.trays.push(this);
        }
        on(name: string, fn: () => void) {
            this.events.set(name, fn);
        }
        setToolTip() {}
        setContextMenu(items: typeof this.menu) {
            this.menu = items;
        }
        destroy() {
            this.destroyed = true;
        }
    },
}));
vi.mock("./settings/store.js", () => ({
    readAppSettingsState: async () => ({ values: { languageMode: "en" } }),
}));

class TestWindow extends EventEmitter {
    hide = vi.fn();
    show = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
    minimize = vi.fn();
    isDestroyed = () => false;
    isMinimized = () => false;
}
beforeEach(() => {
    vi.useFakeTimers();
    state.trays.length = 0;
    state.appEvents.clear();
    state.failTray = false;
    state.quit.mockClear();
});
afterEach(() => vi.useRealTimers());
it("keeps the renderer and process alive on close, and reopens the same window", async () => {
    const window = new TestWindow();
    let active = true;
    const dispose = protectBackgroundRender(window as unknown as BrowserWindow, {
        hasWork: () => active,
        icon: "icon.ico",
        dataDir: "/task",
    });
    const event = { preventDefault: vi.fn() };
    window.emit("close", event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(window.hide).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.trays[0]!.menu[2]!.enabled).toBe(false);
    state.trays[0]!.events.get("click")!();
    expect(window.show).toHaveBeenCalledOnce();
    const quitting = { preventDefault: vi.fn() };
    state.appEvents.get("before-quit")!(quitting);
    expect(quitting.preventDefault).toHaveBeenCalledOnce();
    active = false;
    await vi.advanceTimersByTimeAsync(2000);
    expect(state.trays[0]!.menu[2]!.enabled).toBe(true);
    const finished = { preventDefault: vi.fn() };
    window.emit("close", finished);
    expect(finished.preventDefault).not.toHaveBeenCalled();
    window.emit("closed");
    expect(state.trays[0]!.destroyed).toBe(true);
    expect(state.appEvents.has("before-quit")).toBe(false);
    dispose();
});
it("retains a taskbar entry when no tray can be created", () => {
    state.failTray = true;
    const window = new TestWindow();
    const dispose = protectBackgroundRender(window as unknown as BrowserWindow, {
        hasWork: () => true,
        icon: "icon.ico",
        dataDir: "/task",
    });
    window.emit("close", { preventDefault: vi.fn() });
    expect(window.minimize).toHaveBeenCalledOnce();
    expect(window.hide).not.toHaveBeenCalled();
    dispose();
});
it("provides English, Cantonese and bilingual background actions", () => {
    expect(backgroundRenderCopy("en").open).toBe("Open Worldlens");
    expect(backgroundRenderCopy("yue").open).toBe("打開 Worldlens");
    expect(backgroundRenderCopy("bilingual").open).toBe("Open Worldlens / 打開 Worldlens");
});
