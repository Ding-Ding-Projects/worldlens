// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { keystrokeIsForEditableTarget } from "./keyboardTarget";

/**
 * Build a real KeyboardEvent dispatched at `target` and hand back whatever the target actually
 * saw, so `evt.target` / `evt.composedPath()` reflect genuine DOM dispatch rather than a
 * hand-built fake object -- the helper's whole job is reading those two things correctly.
 */
function fireKeydownAt(target: EventTarget, code: string): KeyboardEvent {
    let captured: KeyboardEvent | null = null;
    const listener = (e: Event) => {
        captured = e as KeyboardEvent;
    };
    target.addEventListener("keydown", listener);
    const evt = new KeyboardEvent("keydown", { code, bubbles: true, composed: true });
    target.dispatchEvent(evt);
    target.removeEventListener("keydown", listener);
    return captured!;
}

describe("keystrokeIsForEditableTarget", () => {
    it("is true for a plain text input -- the exact 'cannot type wasd' report", () => {
        const input = document.createElement("input");
        input.type = "text";
        document.body.appendChild(input);
        expect(keystrokeIsForEditableTarget(fireKeydownAt(input, "KeyW"))).toBe(true);
        document.body.removeChild(input);
    });

    it("treats an <input> with no type attribute as text, per HTML's own default", () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        expect(keystrokeIsForEditableTarget(fireKeydownAt(input, "KeyA"))).toBe(true);
        document.body.removeChild(input);
    });

    it("is FALSE for a checkbox input -- WASD must still pan the map through a checkbox", () => {
        const input = document.createElement("input");
        input.type = "checkbox";
        document.body.appendChild(input);
        expect(keystrokeIsForEditableTarget(fireKeydownAt(input, "KeyS"))).toBe(false);
        document.body.removeChild(input);
    });

    it("is FALSE for a button input, same reasoning as checkbox", () => {
        const input = document.createElement("input");
        input.type = "button";
        document.body.appendChild(input);
        expect(keystrokeIsForEditableTarget(fireKeydownAt(input, "KeyD"))).toBe(false);
        document.body.removeChild(input);
    });

    it("is true for a textarea", () => {
        const textarea = document.createElement("textarea");
        document.body.appendChild(textarea);
        expect(keystrokeIsForEditableTarget(fireKeydownAt(textarea, "KeyA"))).toBe(true);
        document.body.removeChild(textarea);
    });

    it("is true for a select", () => {
        const select = document.createElement("select");
        document.body.appendChild(select);
        expect(keystrokeIsForEditableTarget(fireKeydownAt(select, "KeyS"))).toBe(true);
        document.body.removeChild(select);
    });

    it("is true for a contentEditable element", () => {
        const div = document.createElement("div");
        div.contentEditable = "true";
        document.body.appendChild(div);
        expect(keystrokeIsForEditableTarget(fireKeydownAt(div, "KeyD"))).toBe(true);
        document.body.removeChild(div);
    });

    it("is true for an element with role=textbox / searchbox / combobox", () => {
        for (const role of ["textbox", "searchbox", "combobox"]) {
            const div = document.createElement("div");
            div.setAttribute("role", role);
            document.body.appendChild(div);
            expect(keystrokeIsForEditableTarget(fireKeydownAt(div, "KeyW"))).toBe(true);
            document.body.removeChild(div);
        }
    });

    it("is FALSE when nothing in particular has focus (target is body/window)", () => {
        expect(keystrokeIsForEditableTarget(fireKeydownAt(document.body, "KeyW"))).toBe(false);
    });

    it("recognises a contentEditable custom element's shadow DOM via composedPath()", () => {
        // Registering a genuinely custom element in this environment is more machinery than the
        // point warrants; this test proves the composedPath()-over-target ordering the helper
        // relies on by shadowing the target itself, which is exactly the situation a shadow-root
        // keystroke produces: evt.target is retargeted to the host, but composedPath()[0] still
        // names the real, innermost, contentEditable element.
        const host = document.createElement("div"); // stands in for the shadow host
        const innerEditable = document.createElement("span");
        innerEditable.contentEditable = "true";
        document.body.appendChild(host);
        host.appendChild(innerEditable);

        const evt = new KeyboardEvent("keydown", { code: "KeyA" });
        Object.defineProperty(evt, "target", { value: host }); // retargeted, as shadow DOM does
        Object.defineProperty(evt, "composedPath", { value: () => [innerEditable, host, document.body] });

        expect(keystrokeIsForEditableTarget(evt)).toBe(true);
        document.body.removeChild(host);
    });
});
