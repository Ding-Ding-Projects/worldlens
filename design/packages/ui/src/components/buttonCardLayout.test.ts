/**
 * A `VBtn` that holds a stack of blocks must lay that stack out on `.v-btn__content`.
 *
 * ## The defect this exists to stop
 *
 * `CreateServerWizard.vue` drew its seven server-flavour cards as `VBtn`s, each wrapping a
 * name, a tagline, a description and sometimes a chip, and styled them like this:
 *
 * ```css
 * .wl-mcserver-wizard__flavour-card { display: flex; flex-direction: column; gap: 4px; }
 * ```
 *
 * That rule reads as though it stacks the four blocks. It does nothing at all. Vuetify renders
 * a button's slot inside `.v-btn__content`, so the element being told to become a column had
 * no children to arrange, while the element that actually held them stayed what Vuetify makes
 * it: a horizontally centred row, `white-space: nowrap`, inside a button of fixed height.
 *
 * The result on screen was not subtle. All four blocks were laid on one line, none of them
 * allowed to wrap, so every flavour's prose printed straight through its neighbour's, the row
 * overflowed its container, and the step grew a horizontal scrollbar. It was the single most
 * broken-looking screen in the application, and the stylesheet that caused it looked correct
 * to anybody reading it.
 *
 * That is the reason this guard reads source rather than trusting review. The mistake is
 * invisible in the CSS: the rule is well-formed, the property is spelled right, and it is
 * simply attached to the wrong element. Only rendering it, or checking for the `:deep()` that
 * has to accompany it, tells you.
 *
 * ## What it checks
 *
 * For every `.vue` file: find each `<VBtn>` that wraps two or more block children and carries a
 * project class. If the stylesheet gives that class a column layout, it must also carry a
 * `:deep(.v-btn__content)` rule. A column on the root alone is the exact broken shape.
 *
 * Deliberately not a snapshot and deliberately not an allowlist of known cards: a new
 * multi-block button is precisely the thing that would reintroduce this, so the check has to
 * find components it has never been told about.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const componentsRoot = dirname(fileURLToPath(import.meta.url));

/** Every `.vue` file under `components/`, recursively. */
function vueFiles(directory: string, found: string[] = []): string[] {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) vueFiles(full, found);
        else if (entry.name.endsWith(".vue")) found.push(full);
    }
    return found;
}

/** Escapes a class name for use inside a `RegExp` source string. */
const escapeForPattern = (name: string): string => name.replaceAll("-", "\\-");

interface Offender {
    readonly file: string;
    readonly className: string;
}

function offendersIn(file: string): Offender[] {
    const source = readFileSync(file, "utf8").replaceAll("\r", "");
    const found: Offender[] = [];

    for (const match of source.matchAll(/<VBtn\b([^>]*)>([\s\S]*?)<\/VBtn>/g)) {
        const openingTag = match[1] ?? "";
        const body = match[2] ?? "";

        // Two or more block children is what makes this a stacked card rather than an
        // ordinary label-and-icon button, which Vuetify's own row layout handles correctly.
        if ((body.match(/<div\b/g) ?? []).length < 2) continue;

        // Read the class from the button's own opening tag, never from the body. The first
        // draft of this searched the whole block and so picked up whichever child happened to
        // carry a class first: it reported `.mb-ollama__chat-main`, a plain layout `<div>`
        // nested inside a button, as a broken button card. A guard that names the wrong
        // element sends the next reader to a file with nothing wrong in it, which costs more
        // than the check saves.
        const className = ((openingTag.match(/\bclass="([^"]*)"/) ?? [])[1] ?? "")
            .split(/\s+/)
            .find((candidate) => candidate.startsWith("wl-") || candidate.startsWith("mb-"));
        if (className === undefined) continue;

        const pattern = escapeForPattern(className);
        const columnOnRoot = new RegExp(`\\.${pattern}\\s*\\{[^}]*flex-direction:\\s*column`).test(source);
        const laysOutContent = new RegExp(`\\.${pattern}[^{]*:deep\\(\\.v-btn__content\\)`).test(source);

        if (columnOnRoot && !laysOutContent) found.push({ file, className });
    }

    return found;
}

describe("a VBtn holding a stack of blocks lays it out on .v-btn__content", () => {
    const files = vueFiles(componentsRoot);

    it("finds components to check at all, so a broken walk cannot pass silently", () => {
        // Without this, a `readdirSync` that returned nothing would make every assertion below
        // vacuously true, which is the failure mode every source-reading guard shares.
        expect(files.length).toBeGreaterThan(50);
    });

    it("has no button that stacks its content on the wrong element", () => {
        const offenders = files.flatMap(offendersIn);
        const described = offenders.map(
            (offender) =>
                `${offender.file.split(sep).join("/").replace(componentsRoot.split(sep).join("/"), "components")}` +
                ` sets flex-direction: column on .${offender.className}, which is the VBtn root.` +
                " Vuetify puts the slot inside .v-btn__content, so that rule arranges nothing and" +
                " the blocks stay on one nowrap line, printing through each other. Add a" +
                ` \`.${offender.className} :deep(.v-btn__content)\` rule with the column layout,` +
                " white-space: normal, and height: auto on the root.",
        );
        expect(described, described.join("\n\n")).toEqual([]);
    });
});
