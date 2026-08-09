/**
 * The shell has no floating action buttons, and this is what keeps it that way.
 *
 * This file used to prove the opposite: that the floating stack reserved enough clearance not to
 * sit on top of the free-flight controls. That was the right test for a shell that had four round
 * buttons hovering over every screen - settings, the options editor, the licence panel and the
 * welcome panel, two of them for surfaces most people open once.
 *
 * The rewrite removed them rather than spacing them better. Settings lives in the application
 * rail's footer, the options editor is a row in the Set up & help catalogue, and the licence and
 * welcome panels are reached from the catalogue and the command palette. So the clearance contract
 * is gone, and what replaces it is the rule that made it unnecessary: **nothing in this shell
 * floats over content**.
 *
 * Written as a source-and-style contract rather than a mounted assertion on purpose. A mounted
 * test can only prove that no FAB is on screen *in the state it happened to mount*, which is
 * exactly the coverage gap that lets a floating control return behind a conditional nobody
 * exercised. Reading the shell's own stylesheet and template catches it wherever it is declared.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(fileURLToPath(new URL("./App.vue", import.meta.url)), "utf8");

const railSource = readFileSync(
    fileURLToPath(new URL("./components/shell/AppRail.vue", import.meta.url)),
    "utf8",
);

/** The template, without the script or the styles, so a comment about FABs is not a FAB. */
function templateOf(source: string): string {
    const start = source.indexOf("<template>");
    const end = source.lastIndexOf("</template>");
    return start < 0 || end < 0 ? "" : source.slice(start, end);
}

/** The scoped stylesheet only. */
function styleOf(source: string): string {
    const start = source.indexOf("<style");
    return start < 0 ? "" : source.slice(start);
}

describe("the shell has no floating action buttons", () => {
    it("declares no FAB stack and no FAB class", () => {
        // The two class names the removed stack used. Their absence is the whole point: a shell
        // that reintroduces a floating control under the old name fails here immediately.
        expect(appSource).not.toContain("mb-shell-fabs");
        expect(appSource).not.toContain("mb-shell-fab");
    });

    it("mounts no Vuetify floating-action component", () => {
        // `VFab` is the framework's own answer to "a button that floats over content". The shell
        // does not use it, and a future one reaching for it should have to delete this line first.
        expect(templateOf(appSource)).not.toMatch(/<v-fab|VFab/i);
        expect(templateOf(railSource)).not.toMatch(/<v-fab|VFab/i);
    });

    it("positions nothing in the rail absolutely over the content", () => {
        // The rail is a column in the flex row, not a layer on top of one. `position: fixed` or
        // `absolute` in its own stylesheet would mean it had stopped being chrome and started
        // being an overlay - which is the distinction this whole change is about.
        // The rail's own rule, not the whole stylesheet: the unread badge inside it is
        // legitimately absolute against its own pill, which is a badge on a button rather than a
        // control floating over the page.
        const style = styleOf(railSource);
        const railRule = style.slice(style.indexOf(".wl-rail {"), style.indexOf(".wl-rail__items"));
        expect(railRule).not.toMatch(/position:\s*fixed/);
        expect(railRule).not.toMatch(/position:\s*absolute/);
    });

    it("keeps the rail a fixed 80 px column at every width", () => {
        const style = styleOf(railSource);
        // Declared three ways on purpose - inline-size, min-inline-size and the flex basis - so a
        // narrow window shrinks the content beside it rather than crushing the rail's labels.
        expect(style).toContain("inline-size: 80px");
        expect(style).toContain("min-inline-size: 80px");
        expect(style).toContain("flex: 0 0 80px");
    });

    it("gives every rail control at least a 48 px target", () => {
        const style = styleOf(railSource);
        expect(style).toContain("min-block-size: 48px");
        expect(style).toMatch(/inline-size:\s*48px/);
    });
});

describe("the destinations are layers, not floats", () => {
    it("stacks the three destinations in one box rather than floating any of them", () => {
        const style = styleOf(appSource);
        // One shared box, `inset: 0`, and only one showing. That is a layer stack; a float would
        // be an element positioned against the viewport with the others still laid out beneath it.
        expect(style).toContain(".mb-shell-layer");
        expect(style).toContain(".mb-shell-content");
    });

    it("never hides the map layer with display:none", () => {
        const template = templateOf(appSource);
        // The map layer is hidden with `inert` and `aria-hidden`, never `v-if` or `v-show`:
        // `display: none` on a canvas host is how a WebGL scene loses its size and has to be
        // rebuilt, and switching destination must never cost a scene, a camera or a marker
        // selection. The other two layers may use `v-show` freely - they draw no canvas.
        // The opening tag only. Everything inside the layer - the control bar, the zoom cluster -
        // is legitimately conditional; what must never be conditional is the layer itself.
        const at = template.indexOf("mb-shell-layer--map");
        const mapLayer = template.slice(at, template.indexOf(">", at) + 1);
        expect(mapLayer).toContain("inert");
        expect(mapLayer).toContain("aria-hidden");
        expect(mapLayer).not.toContain("v-show");
        expect(mapLayer).not.toContain("v-if");
    });
});
