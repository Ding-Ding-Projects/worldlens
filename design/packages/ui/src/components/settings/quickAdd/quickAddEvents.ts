/**
 * Tells the Settings rows that a quick entry just wrote their value.
 *
 * The Settings sheet is hidden rather than unmounted, so its rows hold their own copy of a
 * value in memory. A quick entry that wrote the stored value without telling them would leave
 * Settings showing the old answer until something else reloaded it, which is the same
 * "two surfaces, two answers" defect `world/consentState.ts` documents. The quick entry
 * bumps this counter after a successful write; the Settings surface watches it and reloads.
 */

import { ref, type Ref } from "vue";

export interface QuickAddSaved {
    readonly anchor: string;
    readonly count: number;
}

/** The latest quick-entry save, or null before the first one. Module scope on purpose. */
export const lastQuickAddSave: Ref<QuickAddSaved | null> = ref(null);

let counter = 0;

/** Records that a quick entry wrote the value behind `anchor`. */
export function announceQuickAddSave(anchor: string): void {
    counter += 1;
    lastQuickAddSave.value = { anchor, count: counter };
}
