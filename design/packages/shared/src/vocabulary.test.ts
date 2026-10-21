import { expect, it } from "vitest";
import { validateVocabularyPayload } from "./vocabulary.js";
it("distinguishes the exact raw nesting ceiling from schema rejection", () => {
    expect(validateVocabularyPayload("[".repeat(8) + "0" + "]".repeat(8))).toEqual({ ok: false, reason: "not-an-object" });
    expect(validateVocabularyPayload("[".repeat(9) + "0" + "]".repeat(9))).toEqual({ ok: false, reason: "too-deeply-nested" });
});
it("does not interpret escaped quotes or structural characters inside strings as nesting", () => {
    const raw = JSON.stringify({ schemaVersion: 1, entries: { term: '\\"' + "[{".repeat(100) } });
    expect(validateVocabularyPayload(raw).ok).toBe(true);
});
