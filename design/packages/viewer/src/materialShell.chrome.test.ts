/**
 * @vitest-environment jsdom
 *
 * Who draws the bar: the viewer, or the page embedding it.
 *
 * The served map has to draw its own - in a browser tab there is nothing else to provide a
 * search field, a coordinate readout, a settings button or a command palette. The desktop
 * application draws all of those itself, and left unchecked the viewer drew a second set on
 * top: two search fields, two coordinate readouts, two settings buttons, one bar stacked
 * over the other. Reported from a real build with a screenshot of both bars at once.
 *
 * Asserted from the DOM the shell actually produces rather than from the option it was
 * handed, because "the flag was passed" and "the bar is not there" are different claims and
 * only the second one is the bug.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { MaterialShell } from "./materialShell";

function root(): HTMLElement {
    const element = document.createElement("div");
    document.body.appendChild(element);
    return element;
}

beforeEach(() => {
    document.body.innerHTML = "";
    document.getElementById("bm-m3-style")?.remove();
});

describe("the served map draws its own chrome", () => {
    it("appends the app bar when nothing else provides one", () => {
        const element = root();
        const shell = new MaterialShell(element);

        const bar = element.querySelector(".bm-m3-appbar");
        expect(bar).not.toBeNull();
        // The pieces a browser tab has no other way to get.
        expect(bar!.querySelector("input[type='search']")).not.toBeNull();
        expect(bar!.querySelector('[data-action="settings"]')).not.toBeNull();
        expect(bar!.querySelector('[data-action="command"]')).not.toBeNull();
        expect(bar!.querySelector(".bm-m3-coordinates")).not.toBeNull();
        shell.dispose();
    });

    it("defaults to served, so a plain deployment needs no option at all", () => {
        const element = root();
        const shell = new MaterialShell(element, undefined, {});
        expect(element.querySelector(".bm-m3-appbar")).not.toBeNull();
        shell.dispose();
    });
});

describe("an embedding host draws it instead", () => {
    it("appends no app bar, so there is exactly one of everything on screen", () => {
        const element = root();
        const shell = new MaterialShell(element, undefined, { chrome: "embedded" });

        expect(element.querySelector(".bm-m3-appbar")).toBeNull();

        // Every *always-visible* control the host also draws is gone with it. The command
        // palette keeps its own search field, deliberately: it is a surface the host opens
        // through the viewer's API and it is hidden until then, so it is not a second
        // control competing with the host's bar. Asserted as "nothing outside a hidden
        // container" rather than "no input anywhere", because the second is a claim this
        // shell should not have to satisfy and quietly weakens into meaninglessness the day
        // somebody adds a hidden field.
        const visibleSearch = [...element.querySelectorAll("input[type='search']")].filter(
            (input) => input.closest("[hidden]") === null,
        );
        expect(visibleSearch).toEqual([]);
        expect(element.querySelector('[data-action="settings"]')).toBeNull();
        expect(element.querySelector('[data-action="command"]')).toBeNull();
        shell.dispose();
    });

    it("marks the root so a host stylesheet can tell which arrangement it is in", () => {
        const element = root();
        const shell = new MaterialShell(element, undefined, { chrome: "embedded" });
        expect(element.classList.contains("bm-m3-shell")).toBe(true);
        expect(element.classList.contains("bm-m3-shell--embedded")).toBe(true);
        shell.dispose();
    });

    it("still constructs without throwing, so the shell's own API keeps working", () => {
        // Everything else the shell owns - the map menu, settings, notification history,
        // the search scopes - is still built and is still reachable through the viewer's
        // own API. Only the bar is not appended, so a host that opens one of those
        // surfaces must not find half a shell.
        const element = root();
        expect(() => {
            const shell = new MaterialShell(element, undefined, { chrome: "embedded" });
            shell.dispose();
        }).not.toThrow();
    });
});
