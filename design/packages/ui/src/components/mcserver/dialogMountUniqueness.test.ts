import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A dialog bound to one piece of open-state must be mounted once per layer, not twice.
 *
 * This is written from a real defect. Two merges each added a `CreateServerWizard` to the
 * same layer, both bound to the same `mcServerCreateOpen`, and nobody removed the other. So
 * pressing "New server" opened two identical dialogs stacked on top of each other: the upper
 * one's scrim intercepted every click aimed at the lower, the catalogue was fetched twice,
 * and half the controls on screen belonged to a copy nobody could reach.
 *
 * It was invisible from every angle except driving the built application - the markup is
 * correct in isolation, both mounts are legitimate on their own, and nothing throws.
 */
const APP = fileURLToPath(new URL("../../App.vue", import.meta.url));

/**
 * Each dialog is opened by exactly one screen, so the two must be mounted in equal number.
 *
 * Counting pairs rather than parsing layer boundaries on purpose: the first version of this
 * guard tried to slice the file into layers by their opening tag, got the boundaries wrong,
 * and passed cleanly on a deliberately duplicated mount - a guard that had quietly stopped
 * guarding, which is worse than none.
 */
const PAIRS = [
    { opener: "ServerListScreen", dialog: "CreateServerWizard" },
    { opener: "ServerListScreen", dialog: "AdoptionBrowser" },
];

function count(source: string, tag: string): number {
    return source.split(`<${tag}`).length - 1;
}

describe("every screen that opens a dialog has exactly one of it", () => {
    const source = readFileSync(APP, "utf8");

    it("mounts the screen at all", () => {
        // Without this the checks below pass on a file that mounts nothing.
        expect(count(source, "ServerListScreen")).toBeGreaterThanOrEqual(1);
    });

    it.each(PAIRS.map((p) => [p.opener, p.dialog] as const))(
        "%s and %s are mounted in equal number",
        (opener, dialog) => {
            const openers = count(source, opener);
            const dialogs = count(source, dialog);
            expect(
                dialogs,
                `<${dialog}> is mounted ${dialogs} times against ${openers} <${opener}>. ` +
                    `They share one piece of open-state, so every extra copy opens at the ` +
                    `same moment and the topmost one's scrim swallows clicks meant for the ` +
                    `others.`,
            ).toBe(openers);
        },
    );
});
