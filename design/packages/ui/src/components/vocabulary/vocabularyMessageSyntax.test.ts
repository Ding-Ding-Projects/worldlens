// @vitest-environment jsdom
/**
 * A personal vocabulary value is somebody's own wording and may contain any character.
 *
 * vue-i18n reads `@`, `{`, `}`, `|` and `$` as message syntax. A value such as "@home tools"
 * used to be inserted into messages unescaped, the compiler threw "Invalid linked format" for
 * every message it landed in, the Work pane's page labels all threw, and Work rendered
 * nothing: no tabs and no way to open one.
 *
 * The library's development build swallows that compile error and returns the raw text, while
 * the production build throws, so rendering alone proves nothing here. Each case therefore
 * also runs the library's own message compiler with errors collected, and requires none.
 */
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { createI18n, type I18n } from "vue-i18n";
import { installVocabularyTranslationBoundary } from "../../i18n.js";
import {
    applyVocabularyMessageTree,
    applyVocabularyTemplate,
    escapeForMessageFormat,
} from "./applyVocabulary.js";
import { vocabularyStore } from "./vocabularyStore.js";

function i18n(messages: Record<string, string> = {}): I18n<Record<string, unknown>> {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "en",
        fallbackLocale: "en",
        messages: { en: messages },
    }) as unknown as I18n<Record<string, unknown>>;
}

function translate(instance: I18n<Record<string, unknown>>, ...args: unknown[]): string {
    const t = (instance.global as unknown as { t: (...rest: unknown[]) => unknown }).t;
    return String(t(...args));
}

/** vue-i18n's own compiler, reached through vue-i18n because it is not a direct dependency. */
const requireFromI18n = createRequire(createRequire(import.meta.url).resolve("vue-i18n"));
const { baseCompile } = requireFromI18n("@intlify/message-compiler") as {
    baseCompile: (source: string, options: { onError: (error: Error) => void }) => unknown;
};

/** The errors the production message compiler raises for a message; none means it is valid. */
function compileErrors(message: string): string[] {
    const errors: string[] = [];
    baseCompile(message, { onError: (error) => errors.push(error.message) });
    return errors;
}

afterEach(() => {
    vocabularyStore.entries = {};
});

describe("vocabulary values inside translated messages", () => {
    it("renders a value containing @ in a catalogue message instead of throwing", () => {
        vocabularyStore.entries = { "Universal features": "@home tools" };
        // The unescaped value is exactly what the production build refused.
        expect(compileErrors("@home tools")).toContain("Invalid linked format");

        const tree = applyVocabularyMessageTree({ "tabs.page.toolkit": "Universal features" });
        expect(compileErrors(tree["tabs.page.toolkit"])).toEqual([]);
        expect(translate(i18n(tree), "tabs.page.toolkit")).toBe("@home tools");
    });

    it("renders every message-syntax character literally", () => {
        vocabularyStore.entries = { Projects: "A|B {x} $y @z" };
        const tree = applyVocabularyMessageTree({ label: "Projects" });
        expect(compileErrors(tree.label)).toEqual([]);
        expect(translate(i18n(tree), "label")).toBe("A|B {x} $y @z");
    });

    it("keeps the shipped message's own placeholders working around an inserted value", () => {
        vocabularyStore.entries = { renders: "@jobs" };
        const instance = i18n(applyVocabularyMessageTree({ count: "{count} renders running" }));
        expect(translate(instance, "count", { count: "3" })).toBe("3 @jobs running");
    });

    it("renders a value containing @ in a fallback message, the path Work's tab labels use", () => {
        vocabularyStore.entries = { "Make a map": "Make an @map" };
        const instance = i18n();
        installVocabularyTranslationBoundary(instance);
        expect(translate(instance, "tabs.page.world", "Make a map")).toBe("Make an @map");
        // What the boundary hands the compiler for that fallback.
        expect(
            compileErrors(applyVocabularyTemplate("Make a map", { forMessageFormat: true })),
        ).toEqual([]);
    });

    it("leaves plain text callers unescaped, because they are never compiled", () => {
        vocabularyStore.entries = { tools: "@tools" };
        expect(applyVocabularyTemplate("Open tools")).toBe("Open @tools");
        expect(escapeForMessageFormat("@tools")).toBe("{'@'}tools");
    });
});
