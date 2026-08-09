/**
 * The rail's bell must not open the notification panel itself.
 *
 * `NotificationPanel` anchors its `v-menu` to this button by id, and Vuetify's `activator` prop
 * does two things at once: it positions the menu against the element, and it binds a handler that
 * *toggles* the menu on click. A second handler on the button that also opened the panel therefore
 * produced two state changes from one press - the request opened it, the activator's toggle shut it
 * again - and the bell did nothing whatsoever.
 *
 * That is a defect no unit test caught and no screenshot showed. It was found by driving the real
 * packaged application on a fresh profile: pressing the bell left `aria-expanded="false"` with the
 * panel absent from the document, while the command palette's row for the same panel opened it
 * every time, because the palette rings the doorbell without also pressing the switch.
 *
 * ### Why this reads the source rather than mounting
 *
 * The failure lives in Vuetify's activator binding, which needs real layout and a real overlay
 * root; jsdom has neither, so a mounted test would pass with the defect present and prove nothing.
 * What can be checked exactly, and is the whole of the fix, is that the button carries no click
 * handler and the component declares no emit for one - which is the same technique
 * `tabPanelContainingBlock.test.ts` uses next door, and for the same reason.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./AppRail.vue", import.meta.url)), "utf8");

/** The bell's `<button>` element, from its id binding to the closing angle of the open tag. */
function bellOpenTag(): string {
    const start = source.indexOf("notificationsActivatorId === ''");
    expect(start, "the bell button is identified by its activator id binding").toBeGreaterThan(-1);
    const tagStart = source.lastIndexOf("<button", start);
    const tagEnd = source.indexOf(">", start);
    expect(tagStart).toBeGreaterThan(-1);
    expect(tagEnd).toBeGreaterThan(tagStart);
    return source.slice(tagStart, tagEnd + 1);
}

describe("the rail's notification bell", () => {
    it("carries no click handler, because the anchored menu's activator already owns the press", () => {
        const tag = bellOpenTag();
        expect(
            tag,
            "a click handler here fights the menu's own activator toggle: one press becomes two " +
                "state changes and the panel opens and immediately shuts.",
        ).not.toMatch(/@click|v-on:click/);
    });

    it("declares no emit for opening the panel, so the shell cannot re-add the second opener", () => {
        expect(
            source,
            "`openNotifications` was removed with the click handler. Restoring the emit is how " +
                "somebody re-introduces the defect while believing they are wiring up a button.",
        ).not.toContain("openNotifications");
    });

    it("still reports whether the panel is open, so the button is not silent to assistive technology", () => {
        const tag = bellOpenTag();
        // The panel emits `update:open` and the shell hands it back as `notificationsOpen`; losing
        // this would leave a button that opens something and never says that it did.
        expect(tag).toContain("aria-expanded");
        expect(tag).toContain("notificationsOpen");
    });
});
