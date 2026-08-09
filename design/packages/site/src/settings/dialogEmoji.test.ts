/**
 * @vitest-environment jsdom
 *
 * The two assertions worth having here are both about what the emoji must NOT reach.
 *
 * That a glyph appears when the switch is on is trivially true and would pass on a broken
 * implementation that also salted every button label. What actually matters is that the words
 * are identical in both states, that the accessible name never changes, and that a call site
 * cannot quietly start decorating a control — so the guard against decorating a focusable
 * element is exercised directly rather than trusted.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
    decorateDialogHeading,
    dialogEmoji,
    dialogEmojiEnabled,
    dialogEmojiNode,
    setDialogEmojiEnabled,
} from "./dialogEmoji.js";

afterEach(() => {
    setDialogEmojiEnabled(true);
    document.body.replaceChildren();
});

describe("dialog emoji", () => {
    it("is on by default", () => {
        expect(dialogEmojiEnabled()).toBe(true);
        expect(dialogEmoji("warning")).not.toBeNull();
    });

    it("produces nothing at all when switched off, rather than an empty node", () => {
        setDialogEmojiEnabled(false);
        expect(dialogEmoji("warning")).toBeNull();
        expect(dialogEmojiNode("warning")).toBeNull();
    });

    it("leaves the words identical whichever way it is set", () => {
        const heading = document.createElement("h2");
        heading.textContent = "Delete everything";
        decorateDialogHeading(heading, "destructive");
        const decorated = heading.textContent ?? "";

        heading.textContent = "Delete everything";
        setDialogEmojiEnabled(false);
        decorateDialogHeading(heading, "destructive");

        expect(heading.textContent).toBe("Delete everything");
        expect(decorated).toContain("Delete everything");
    });

    /*
     * The accessible-name assertion. `aria-hidden` on the decoration is what keeps a screen
     * reader announcing the heading exactly as it would with the feature off, so this is
     * checked on the node itself rather than inferred from the class name.
     */
    it("marks the decoration hidden from assistive technology", () => {
        const node = dialogEmojiNode("error");
        expect(node?.getAttribute("aria-hidden")).toBe("true");
    });

    it("replaces a previous decoration instead of stacking a second one", () => {
        const heading = document.createElement("h2");
        heading.textContent = "Close tabs";
        decorateDialogHeading(heading, "confirm");
        decorateDialogHeading(heading, "confirm");
        expect(heading.querySelectorAll(".mb-dialog-emoji")).toHaveLength(1);
    });

    it("refuses to decorate a control, so a preference can never change a button's text", () => {
        const button = document.createElement("button");
        button.textContent = "Proceed";
        expect(() => decorateDialogHeading(button, "destructive")).toThrow();

        const insideAButton = document.createElement("span");
        button.append(insideAButton);
        document.body.append(button);
        expect(() => decorateDialogHeading(insideAButton, "destructive")).toThrow();
    });

    it("separates the glyph from the first word so a copied heading still reads", () => {
        const node = dialogEmojiNode("info");
        expect(node?.textContent?.endsWith(" ")).toBe(true);
    });
});
