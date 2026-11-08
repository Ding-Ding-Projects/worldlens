// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import DrawingBoard from "./DrawingBoard.vue";
import { STORAGE_KEY } from "./drawingModel.js";

beforeAll(() => {
    globalThis.ResizeObserver ??= class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    globalThis.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })) as unknown as typeof matchMedia;
    // Vuetify's menu positioning reads the visual viewport, which jsdom does not define.
    globalThis.visualViewport ??= { width: 1440, height: 900, offsetLeft: 0, offsetTop: 0, scale: 1, addEventListener: () => {}, removeEventListener: () => {} } as unknown as VisualViewport;
    // jsdom has no layout: the board is 600 by 400 on screen.
    HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

let wrapper: VueWrapper | null = null;
beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
    document.body.innerHTML = "";
});

const mountBoard = () =>
    mount(DrawingBoard, {
        attachTo: document.body,
        global: { plugins: [createVuetify(), createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    });

type Exposed = { strokes: { length: number }; tool: string };

function pointer(type: string, x: number, y: number, extra: Record<string, unknown> = {}): Event {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...extra });
    Object.defineProperty(event, "pointerId", { value: 1 });
    return event;
}

async function stroke(w: VueWrapper, from: [number, number], to: [number, number], extra: Record<string, unknown> = {}): Promise<void> {
    const canvas = w.find("canvas").element;
    canvas.dispatchEvent(pointer("pointerdown", ...from));
    canvas.dispatchEvent(pointer("pointermove", (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, extra));
    canvas.dispatchEvent(pointer("pointermove", ...to, extra));
    canvas.dispatchEvent(pointer("pointerup", ...to));
    await flushPromises();
}

const press = async (w: VueWrapper, key: string, mods: KeyboardEventInit = {}): Promise<void> => {
    await w.find("[data-test=drawing-board]").trigger("keydown", { key, ...mods });
};

describe("the drawing board", () => {
    it("picks every pen and the eraser by its key, the same key its tooltip names", async () => {
        wrapper = mountBoard();
        await flushPromises();
        const vm = wrapper.vm as unknown as Exposed;
        for (const [key, tool] of [["n", "pencil"], ["p", "pen"], ["f", "fineliner"], ["m", "marker"], ["h", "highlighter"], ["b", "brush"], ["i", "fountain"], ["e", "eraser"]] as const) {
            await press(wrapper, key);
            expect(vm.tool, key).toBe(tool);
            expect(wrapper.find(`[data-tool=${tool}]`).attributes("aria-label")).toContain(`(${key.toUpperCase()})`);
        }
    });

    it("draws, erases part of a stroke, undoes and redoes by key", async () => {
        wrapper = mountBoard();
        await flushPromises();
        const vm = wrapper.vm as unknown as Exposed;
        await stroke(wrapper, [10, 100], [500, 100]);
        expect(vm.strokes.length).toBe(1);
        await press(wrapper, "e");
        await stroke(wrapper, [250, 90], [250, 110]);
        expect(vm.strokes.length).toBe(2);
        await press(wrapper, "z", { ctrlKey: true });
        expect(vm.strokes.length).toBe(1);
        await press(wrapper, "Z", { ctrlKey: true, shiftKey: true });
        expect(vm.strokes.length).toBe(2);
    });

    it("keeps strokes and undo across a restart", async () => {
        wrapper = mountBoard();
        await flushPromises();
        await stroke(wrapper, [10, 10], [200, 50]);
        await stroke(wrapper, [10, 200], [200, 250]);
        vi.advanceTimersByTime(300);
        expect(localStorage.getItem(STORAGE_KEY)).toContain('"version":1');
        wrapper.unmount();
        wrapper = mountBoard();
        await flushPromises();
        const vm = wrapper.vm as unknown as Exposed;
        expect(vm.strokes.length).toBe(2);
        await press(wrapper, "z", { ctrlKey: true });
        expect(vm.strokes.length).toBe(1);
    });

    it("lists every tool and action with its shortcut in the right-click menu", async () => {
        wrapper = mountBoard();
        await flushPromises();
        await wrapper.find("[data-test=drawing-board]").trigger("contextmenu", { clientX: 100, clientY: 100 });
        await flushPromises();
        const rows = Array.from(document.querySelectorAll(".mb-menu-search .v-list-item"));
        const text = rows.map((r) => r.textContent ?? "");
        expect(text.some((r) => r.includes("Fountain pen") && r.includes("I"))).toBe(true);
        expect(text.some((r) => r.includes("Undo") && r.includes("Ctrl+Z"))).toBe(true);
        expect(rows.find((r) => r.textContent?.includes("Eraser"))?.getAttribute("aria-keyshortcuts")).toBe("E");
    });

    it("offers Clear only when there is something to clear, and says why", async () => {
        wrapper = mountBoard();
        await flushPromises();
        expect(wrapper.text()).toContain("Clear is available once there is a stroke.");
        await stroke(wrapper, [10, 10], [100, 10]);
        expect(wrapper.text()).not.toContain("Clear is available once there is a stroke.");
    });
});
