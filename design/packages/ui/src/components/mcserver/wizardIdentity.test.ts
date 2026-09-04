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

    it("never overwrites something the person actually typed", () => {
        const body = source.slice(
            source.indexOf("function suggestIdentity()"),
            source.indexOf("async function fillSuggestedFolder"),
        );
        expect(body).not.toBe("");
        // This used to assert the guards were `serverId.value.trim() === ""`, and that
        // emptiness test was the defect rather than the contract: the suggestion itself is
        // what makes the field non-empty, so after the first arrival at review it could
        // never run again. Going back and changing the flavour left `paper-26-2` on a
        // vanilla server, and those values are persisted verbatim, so the stored record was
        // wrong and not merely the label. The intent - never argue with a typed value - is
        // unchanged; what carries it is now a flag set only by real user input.
        expect(body).toContain("if (!serverIdEdited.value)");
        expect(body).toContain("if (!serverNameEdited.value)");
    });

    it("sets those flags only from real user input, never from its own suggestion", () => {
        // Vuetify emits `update:model-value` for user edits and not for a programmatic
        // assignment, which is the whole distinction the emptiness test could not make.
        expect(source).toMatch(/@update:model-value="serverIdEdited = true"/);
        expect(source).toMatch(/@update:model-value="serverNameEdited = true"/);
        // And a fresh wizard forgets them, or the second server created in one session
        // would keep the first one's name.
        expect(source).toContain("serverIdEdited.value = false");
        expect(source).toContain("serverNameEdited.value = false");
    });

    it("counts up rather than colliding with an id already taken", () => {
        const body = source.slice(
            source.indexOf("function suggestIdentity()"),
            source.indexOf("async function fillSuggestedFolder"),
        );
        expect(body).toContain("taken.has(candidate)");
    });
});
