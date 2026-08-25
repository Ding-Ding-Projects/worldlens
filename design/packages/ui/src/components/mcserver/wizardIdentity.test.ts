import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The last step of the creation wizard must not demand typing.
 *
 * The review step opened with an empty server id and an empty display name, and refused to
 * create anything until both were filled. So the wizard could not be finished without typing
 * - at the very last step, after every other choice had been made from a real control.
 *
 * The app already knew enough to propose both: the flavour, the version, and which ids are
 * taken (the id validator is handed that list already). Demanding it anyway is the rule this
 * project is built on, broken where it is least visible.
 */
const WIZARD = fileURLToPath(new URL("./CreateServerWizard.vue", import.meta.url));

describe("the review step proposes rather than demands", () => {
    const source = readFileSync(WIZARD, "utf8");

    it("has a function that proposes the identity", () => {
        expect(source).toContain("function suggestIdentity()");
    });

    it("calls it when the review step is reached", () => {
        // Anchored to the call, not the bare name: a commented-out line still contains the
        // substring, and so does a rename that merely starts with it.
        // Anchored to the start of a line, so a commented-out call cannot satisfy it: the
        // substring survives `//` in front of it, and a guard that passes on a disabled line
        // is worse than none.
        expect(source).toMatch(/^\s*if \(WIZARD_STEPS\[idx \+ 1\] === "review"\) suggestIdentity\(\);/m);
    });

    it("never overwrites something already typed", () => {
        const body = source.slice(
            source.indexOf("function suggestIdentity()"),
            source.indexOf("async function fillSuggestedFolder"),
        );
        expect(body).not.toBe("");
        // Both fields are guarded on being empty. A suggestion that replaced a typed value
        // would be the interface arguing with the person using it.
        expect(body).toContain('if (serverId.value.trim() === "")');
        expect(body).toContain('if (serverName.value.trim() === "")');
    });

    it("counts up rather than colliding with an id already taken", () => {
        const body = source.slice(
            source.indexOf("function suggestIdentity()"),
            source.indexOf("async function fillSuggestedFolder"),
        );
        expect(body).toContain("taken.has(candidate)");
    });
});
