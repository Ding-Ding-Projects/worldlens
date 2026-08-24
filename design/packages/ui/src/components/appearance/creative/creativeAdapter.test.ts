// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createCreativeDocument } from "./creativeDocument.js";
import { applyCreativeDocument, creativeDocumentFor, resetCreativeDocumentFor } from "./creativeAdapter.js";
import { appearanceState, reloadAppearance } from "../useAppearance.js";

describe("creative adapter integration", () => {
    it("reads only validated documents from the core preserved appearance record", () => {
        const document = createCreativeDocument();
        const state = {
            version: 1,
            elements: { target: { typography: {}, surface: {}, inherit: "", preserved: { creativeDocument: document } } },
            presets: [],
            activePreset: "",
        };
        expect(creativeDocumentFor(state, "target")).toEqual(document);
        expect(creativeDocumentFor({ ...state, elements: { target: { ...state.elements.target, preserved: { creativeDocument: { bad: true } } } } }, "target")).toBeNull();
    });

    it("applies through the core commit seam and survives reload, then resets cleanly", () => {
        const document = createCreativeDocument({ background: "#123456" });
        applyCreativeDocument("creative-test-target", document);
        expect(creativeDocumentFor(appearanceState().value, "creative-test-target")).toEqual(document);
        reloadAppearance();
        expect(creativeDocumentFor(appearanceState().value, "creative-test-target")).toEqual(document);
        resetCreativeDocumentFor("creative-test-target");
        expect(creativeDocumentFor(appearanceState().value, "creative-test-target")).toBeNull();
    });
});
