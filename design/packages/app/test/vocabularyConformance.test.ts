import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VocabularyStore } from "../src/main/vocabulary/store.js";
import { validateVocabularyPayload } from "../../ui/src/components/vocabulary/vocabularySchema.js";
import { PersonalVocabulary } from "../../site/src/settings/personalVocabulary.js";
import { Preferences } from "../../site/src/platform/Preferences.js";

const payload = (entries: Record<string, unknown>) => JSON.stringify({ schemaVersion: 1, entries });
const cases: Array<[string, string, boolean]> = [
    ["ordinary strings", payload({ label: "replacement" }), true],
    ["empty mapping", payload({}), true],
    ["more than former count ceiling", payload(Object.fromEntries(Array.from({ length: 5000 }, (_, i) => ["term" + i, "value"]))), true],
    ["Unicode code-point limits", payload({ ["😀".repeat(160)]: "😀".repeat(1000) }), true],
    ["oversized key", payload({ ["😀".repeat(161)]: "value" }), false],
    ["oversized value", payload({ label: "😀".repeat(1001) }), false],
    ["UTF-8 byte bound", payload(Object.fromEntries(Array.from({ length: 100 }, (_, i) => ["term" + i, "界".repeat(900)]))), false],
    ["duplicate property", '{"schemaVersion":1,"entries":{"term":"first","term":"second"}}', false],
    ["escaped duplicate property", '{"schemaVersion":1,"entries":{"term":"first","\\u0074erm":"second"}}', false],
    ["unknown field", '{"schemaVersion":1,"entries":{},"extra":true}', false],
    ["unknown version", '{"schemaVersion":2,"entries":{}}', false],
    ["unsafe key", '{"schemaVersion":1,"entries":{"__proto__":"value"}}', false],
    ["nonstring value", payload({ term: 42 }), false],
    ["malformed input", '{', false],
    ["deep array", '['.repeat(20000) + '0' + ']'.repeat(20000), false],
    ["discarded deeply nested duplicate", '{"schemaVersion":1,"entries":' + '['.repeat(20000) + '0' + ']'.repeat(20000) + ',"entries":{}}', false],
    ["braces within strings", payload({ term: '[{'.repeat(100) }), true],
];

describe("personal wording cross-surface validation", () => {
    it.each(cases)("agrees on %s and preserves a previous payload on rejection", async (_name, raw, accepted) => {
        const directory = await mkdtemp(join(tmpdir(), "vocabulary-conformance-"));
        try {
            const host = new VocabularyStore(directory);
            const site = new PersonalVocabulary(new Preferences(null));
            const previous = payload({ stable: "retained" });
            await host.load(previous);
            site.load(previous);
            expect(validateVocabularyPayload(raw).ok).toBe(accepted);
            expect((await host.load(raw)).ok).toBe(accepted);
            expect(site.load(raw).ok).toBe(accepted);
            if (!accepted) {
                expect((await host.read()).entries).toEqual({ stable: "retained" });
                expect(site.apply("stable")).toBe("retained");
            }
        } finally { await rm(directory, { recursive: true, force: true }); }
    });
});
