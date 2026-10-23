import { languageMode } from "../setup/setupI18n.js";
import { applyVocabularyTemplate } from "../vocabulary/applyVocabulary.js";
/** Shared workflow copy observes the existing language and private local wording settings. */
export function workflowText(en: string, yue: string): string {
    return applyVocabularyTemplate(
        languageMode() === "yue" ? yue : languageMode() === "bilingual" ? `${en}\n${yue}` : en,
    );
}
