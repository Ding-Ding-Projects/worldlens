// @vitest-environment jsdom

// Regression tests for the "cannot type w a s d into the app" bug: KeyMoveControls (and its five
// siblings, per keyboardTarget.ts) used to register its keydown/keyup handlers on the global
// `window` and call preventDefault() on WASD with no regard for what actually had focus, so any
// text field anywhere in the app had its W/A/S/D keystrokes silently eaten by the map. These
// tests exercise the fixed control exactly as the app does: real `window` listeners, real
// KeyboardEvent dispatch, real focused elements.

import { afterEach, describe, expect, it } from "vitest";
import { KeyMoveControls } from "./KeyMoveControls";

function dispatchKey(type: "keydown" | "keyup", target: EventTarget, code: string) {
    const evt = new KeyboardEvent(type, { code, bubbles: true, composed: true, cancelable: true });
    const preventedBefore = evt.defaultPrevented;
    target.dispatchEvent(evt);
    return { evt, wasPrevented: evt.defaultPrevented && !preventedBefore };
}

describe("KeyMoveControls window-level keyboard handling", () => {
    let controls: KeyMoveControls;

    afterEach(() => {
        controls?.stop();
        document.body.innerHTML = "";
    });

    it("does nothing and does not preventDefault when WASD is typed into a text input", () => {
        controls = new KeyMoveControls(window, 1, 1);
        controls.start({} as never);

        const input = document.createElement("input");
        input.type = "text";
        document.body.appendChild(input);
        input.focus();

        const { wasPrevented } = dispatchKey("keydown", input, "KeyW");

        expect(wasPrevented).toBe(false);
        expect(controls.up).toBe(false); // no map movement was armed by this keystroke
    });

    it("still moves the map when WASD is typed into a checkbox input", () => {
        controls = new KeyMoveControls(window, 1, 1);
        controls.start({} as never);

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        document.body.appendChild(checkbox);
        checkbox.focus();

        const { wasPrevented } = dispatchKey("keydown", checkbox, "KeyD");

        expect(wasPrevented).toBe(true);
        expect(controls.right).toBe(true);
    });

    it("still moves the map when nothing has focus (dispatched straight at window)", () => {
        controls = new KeyMoveControls(window, 1, 1);
        controls.start({} as never);

        const { wasPrevented } = dispatchKey("keydown", window, "KeyS");

        expect(wasPrevented).toBe(true);
        expect(controls.down).toBe(true);
    });

    it("does not leave the movement flag stuck true when keyup happens over a text field", () => {
        // The scenario this guards: the map has focus (or nothing does) when the key goes down,
        // so the movement flag is armed correctly -- then the user clicks into a text field
        // *before releasing the key*, and keyup fires with the field as its target. onKeyUp must
        // NOT apply the same editable-target guard as onKeyDown, or this keyup would be ignored
        // and the map would drift in that direction forever.
        controls = new KeyMoveControls(window, 1, 1);
        controls.start({} as never);

        dispatchKey("keydown", window, "KeyA");
        expect(controls.left).toBe(true);

        const input = document.createElement("input");
        input.type = "text";
        document.body.appendChild(input);
        input.focus();

        dispatchKey("keyup", input, "KeyA");

        expect(controls.left).toBe(false);
    });
});
