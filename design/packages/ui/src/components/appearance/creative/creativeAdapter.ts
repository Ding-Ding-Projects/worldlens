import { recordFor, withRecord, type AppearanceState } from "../appearanceStore.js";
import { appearanceState, commitAppearance } from "../useAppearance.js";
import { validateCreativeDocument } from "./creativeDocument.js";
import type { CreativeAppearanceDocument } from "./creativeTypes.js";

/** The preserved record key used by the core appearance store for creative documents. */
export const CREATIVE_RECORD_KEY = "creativeDocument";

export function creativeDocumentFor(state: AppearanceState, targetId: string): CreativeAppearanceDocument | null {
    const candidate = recordFor(state, targetId).preserved[CREATIVE_RECORD_KEY];
    return validateCreativeDocument(candidate) ? candidate : null;
}

/**
 * Commits through the core appearance store, so creative edits participate in the app's
 * existing local settings history and persistence channel. The document remains under the
 * preserved bag because the core renderer must not mistake it for CSS typography or surface
 * values.
 */
export function applyCreativeDocument(targetId: string, document: CreativeAppearanceDocument): void {
    if (!validateCreativeDocument(document)) throw new Error("The creative appearance document is not valid.");
    const state = appearanceState().value;
    const record = recordFor(state, targetId);
    commitAppearance(withRecord(state, targetId, {
        ...record,
        preserved: { ...record.preserved, [CREATIVE_RECORD_KEY]: document },
    }));
}

export function resetCreativeDocumentFor(targetId: string): void {
    const state = appearanceState().value;
    const record = recordFor(state, targetId);
    const preserved = { ...record.preserved };
    delete preserved[CREATIVE_RECORD_KEY];
    commitAppearance(withRecord(state, targetId, { ...record, preserved }));
}
