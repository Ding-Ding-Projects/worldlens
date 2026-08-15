/**
 * Small module-level state shared between `App.vue`, every mounted `RowShell.vue`, and the
 * `window.__MD3_CHECK__` bridge `App.vue` installs for `scripts/capture.mjs` to call from
 * outside the renderer entirely. A module-level singleton rather than a prop/provide chain for
 * the same reason `packages/ui/src/components/settings/uiSizeSetting.ts`'s `currentUiSizeLevel`
 * is one: there is exactly one gallery of rows on screen at a time, and two separate copies of
 * "which rows exist right now" is how a capture run ends up walking a stale list.
 */
import { ref } from "vue";
import type { ComponentMeasurement, MeasurementDiff } from "./measure.js";

/** A row's full current comparison - `null` fields mean the row has not measured anything yet. */
export interface RowMeasurementSnapshot {
    readonly reference: ComponentMeasurement | null;
    readonly worldlens: ComponentMeasurement | null;
    readonly diff: MeasurementDiff | null;
}

/**
 * What a mounted `RowShell` registers itself as: enough to ask it to remeasure on demand, and
 * enough to read back what it currently shows. `getSnapshot` is a FUNCTION, not an exposed ref -
 * `defineExpose` in a `<script setup>` component does not auto-unwrap refs for a caller that
 * merely holds the exposed object in a plain JS `Map` (only a parent's own TEMPLATE ref access
 * gets that unwrapping), so a function that reads `.value` at call time and returns a plain
 * object is the form that behaves the same way no matter who calls it - the live UI's own
 * table, or `window.__MD3_CHECK__.measureAll()` from outside the renderer entirely.
 */
export interface RegisteredRow {
    readonly id: string;
    remeasure(): boolean;
    getSnapshot(): RowMeasurementSnapshot;
}

const rows = new Map<string, RegisteredRow>();

export function registerRow(row: RegisteredRow): void {
    rows.set(row.id, row);
}

export function unregisterRow(id: string): void {
    rows.delete(id);
}

/** Every row currently mounted, in registration order (which follows `RowsGallery.vue`'s markup order). */
export function allRegisteredRows(): RegisteredRow[] {
    return [...rows.values()];
}

/** Asks every currently-mounted row to re-read its DOM. Returns the ids that could not (see `RowShell.remeasure`). */
export function remeasureAllRows(): string[] {
    const failed: string[] = [];
    for (const row of allRegisteredRows()) {
        if (!row.remeasure()) failed.push(row.id);
    }
    return failed;
}

/**
 * The active theme name, as a plain string ref this package owns outright.
 *
 * Deliberately NOT built on Vuetify's `useTheme()` composable. `useTheme()` works by
 * `inject()`-ing a `Symbol` that Vuetify's own module creates at import time; if this package
 * resolved a *different physical copy* of the "vuetify" package than the one
 * `@worldlens/ui/src/vuetify.js` used to build the plugin instance this app installs (a real
 * risk in a pnpm workspace unless every version range lines up exactly), `inject()` would
 * silently find nothing and `useTheme()` would return a theme controller attached to nobody.
 * `<v-theme-provider :theme="currentThemeName">` (used as `App.vue`'s root) sidesteps the
 * whole hazard: it is a plain, globally-registered component resolved through Vue's own
 * component registry - which IS correctly wired, because `app.use()` was called with the
 * exact plugin instance `@worldlens/ui` built - and its `theme` prop is an ordinary reactive
 * string, no injection required. Setting this ref is then the entire theme-switching API.
 */
export const currentThemeName = ref<string>("dark");

/** The five UI-scale stops this harness's own scale control offers - see `App.vue`'s own header for why these five and not Vuetify's `density`. */
export const SCALE_STOPS: readonly number[] = [100, 125, 150, 175, 200];

export const currentScalePercent = ref<number>(100);
