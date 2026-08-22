import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The creation wizard must never let you onto a step whose blocking condition is edited
 * somewhere else.
 *
 * This is written from a real dead end. The server folder field lives on the runtime step,
 * but only the resources step required it - so you walked past the folder, arrived at
 * resources, and found Next disabled with the field that would fix it nowhere on screen and
 * nothing saying what was wrong. Every individual piece looked correct; the wizard was
 * simply unfinishable for the default transport.
 */
const WIZARD = fileURLToPath(new URL("./CreateServerWizard.vue", import.meta.url));

describe("the creation wizard can always be finished", () => {
    const source = readFileSync(WIZARD, "utf8");

    it("stops on the runtime step when the folder that step owns is missing", () => {
        const guard = source.slice(
            source.indexOf("const canAdvanceFromRuntime"),
            source.indexOf("const canAdvanceFromJava"),
        );
        expect(guard).not.toBe("");
        expect(guard).toContain("folderError.value !== null");
    });

    it("names the unmet condition instead of only greying the button out", () => {
        expect(source).toContain("const advanceBlockedReason");
        // Rendered, not merely computed. A reason nobody can read is not a reason.
        expect(source).toContain("{{ advanceBlockedReason }}");
    });
});
