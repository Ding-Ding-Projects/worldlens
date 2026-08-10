/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapControls } from "./MapControls";

let activeControls: MapControls | null = null;

beforeEach(() => {
    // Hammer's capability probe calls canvas.getContext(). JSDOM intentionally has no
    // canvas implementation, while this test only needs the real focusable element.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
});

afterEach(() => {
    activeControls?.stop();
    activeControls = null;
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

function startMapControls(): {
    canvas: HTMLCanvasElement;
    handleMapInteraction: ReturnType<typeof vi.fn>;
} {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("tabindex", "-1");
    canvas.setAttribute("aria-label", "Host map label");
    canvas.setAttribute("aria-keyshortcuts", "Alt+M");
    canvas.setAttribute("data-terrain-actions-keyboard", "Host shortcut");
    canvas.getBoundingClientRect = () =>
        ({
            x: 40,
            y: 80,
            left: 40,
            top: 80,
            right: 840,
            bottom: 580,
            width: 800,
            height: 500,
            toJSON: () => ({}),
        }) as DOMRect;
    document.body.appendChild(canvas);

    const handleMapInteraction = vi.fn();
    activeControls = new MapControls(canvas, canvas);
    activeControls.start({ handleMapInteraction } as never);

    return { canvas, handleMapInteraction };
}

describe("MapControls terrain actions", () => {
    it("routes Shift+F10 from the focused map canvas through the real terrain interaction", () => {
        const { canvas, handleMapInteraction } = startMapControls();
        canvas.focus();
        const event = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "F10",
            shiftKey: true,
        });

        canvas.dispatchEvent(event);

        expect(document.activeElement).toBe(canvas);
        expect(event.defaultPrevented).toBe(true);
        expect(canvas.getAttribute("tabindex")).toBe("0");
        expect(canvas.getAttribute("aria-keyshortcuts")).toBe("Shift+F10 ContextMenu");
        expect(canvas.getAttribute("data-terrain-actions-keyboard")).toBe(
            "Shift+F10 ContextMenu",
        );
        expect(handleMapInteraction).toHaveBeenCalledTimes(1);

        const [screenPoint, data] = handleMapInteraction.mock.calls[0]!;
        expect(screenPoint.x).toBe(440);
        expect(screenPoint.y).toBe(330);
        expect(data).toEqual({
            contextMenu: true,
            screenX: 440,
            screenY: 330,
            contextMenuInvoker: canvas,
        });
    });

    it("supports the Context Menu key and leaves unrelated keys to the map controls", () => {
        const { canvas, handleMapInteraction } = startMapControls();

        canvas.dispatchEvent(
            new KeyboardEvent("keydown", {
                bubbles: true,
                cancelable: true,
                key: "ContextMenu",
                code: "ContextMenu",
            }),
        );
        canvas.dispatchEvent(
            new KeyboardEvent("keydown", {
                bubbles: true,
                cancelable: true,
                key: "Enter",
            }),
        );

        expect(handleMapInteraction).toHaveBeenCalledTimes(1);
        expect(handleMapInteraction.mock.calls[0]?.[1]).toMatchObject({
            contextMenu: true,
            contextMenuInvoker: canvas,
        });
    });

    it("restores an embedding host's original focus and shortcut metadata on stop", () => {
        const { canvas } = startMapControls();

        activeControls?.stop();
        activeControls = null;

        expect(canvas.getAttribute("tabindex")).toBe("-1");
        expect(canvas.getAttribute("aria-label")).toBe("Host map label");
        expect(canvas.getAttribute("aria-keyshortcuts")).toBe("Alt+M");
        expect(canvas.getAttribute("data-terrain-actions-keyboard")).toBe("Host shortcut");
    });
});
