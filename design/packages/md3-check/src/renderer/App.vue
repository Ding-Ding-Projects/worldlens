<script setup lang="ts">
/**
 * The whole harness's shell: the toolbar (theme, scale, jump-to-row), the honesty banner, the
 * coverage notice, and the row gallery - wrapped in `<v-theme-provider>` so every `--v-theme-*`
 * colour role, on both panes of every row, answers to the ONE theme picker below. See
 * `lib/harnessState.ts`'s own header for why this uses `<v-theme-provider>` rather than calling
 * Vuetify's `useTheme()` composable directly.
 *
 * This file is also where `window.__MD3_CHECK__` gets installed - the one bridge
 * `scripts/capture.mjs` calls into from outside the renderer, over Playwright's
 * `page.evaluate()`. Every method on it is a thin wrapper around functions this file already
 * needs for its own live UI (`remeasureAllRows`, each row's `getSnapshot`), so the capture
 * script and the live table a person can read on screen are guaranteed to agree - there is
 * only one measuring code path, called twice.
 */
import { nextTick, watch } from "vue";
import HonestyBanner from "./components/HonestyBanner.vue";
import CoverageNotice from "./components/CoverageNotice.vue";
import RowsGallery from "./components/RowsGallery.vue";
import { THEME_SCHEMES } from "./lib/worldlensVuetify.js";
import {
    allRegisteredRows,
    currentScalePercent,
    currentThemeName,
    remeasureAllRows,
    SCALE_STOPS,
} from "./lib/harnessState.js";
import { implementedRows, plannedRows } from "./lib/rows.js";
import type { RowMeasurementSnapshot } from "./lib/harnessState.js";

/** The four themes Worldlens really ships, read from the same object `vuetify.ts` builds its `theme.themes` option from - never a hand-typed list that could drift out of sync with it. */
const themeNames = Object.keys(THEME_SCHEMES);

const pickerRows = implementedRows();

/** The jump-to-row `<select>`'s own `@change` handler: navigates, then resets to the placeholder so the same row can be re-selected later without first picking a different one. */
function onJumpSelectChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    jumpToRow(select.value);
    select.value = "";
}

function jumpToRow(id: string): void {
    if (id === "") return;
    const el = document.querySelector<HTMLElement>(`[data-md3-row="${CSS.escape(id)}"]`);
    if (el === null) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Gives the row a moment's visible focus outline after the scroll settles, so a keyboard
    // user who just triggered the jump can see where they landed rather than only inferring it
    // from scroll position. `tabindex="-1"` on the row itself (set below in the template) is
    // what makes a plain <section> focusable at all for this purpose.
    window.setTimeout(() => el.focus({ preventScroll: true }), 400);
}

/**
 * How long a Vuetify component's OWN `background-color` transition takes to finish blending
 * from one theme's colour to the next. Measured directly, not guessed: polling
 * `getComputedStyle(button).backgroundColor` at increasing delays after a real theme switch
 * (no confirmation dialog, no animation-heavy screen - just this app's own filled button)
 * returned a strictly-interpolating sequence of colours between the old and new theme's values
 * - `rgb(143,205,255)` at 0ms, `rgb(107,178,230)` at +10ms, `rgb(51,137,191)` at +20ms,
 * `rgb(11,107,163)` at +50ms, settling at the true `rgb(0,99,155)` by +100ms and staying there
 * through +800ms. That is a CSS `transition`, not a rendering race - Vuetify ships one on its
 * own button styles (for hover/press feedback) that fires unconditionally on ANY background-
 * colour change, theme switches included, and it is NOT gated behind `prefers-reduced-motion`
 * the way this repository's OWN `global.scss` gates its own transitions - Electron's
 * `--force-prefers-reduced-motion` flag (see `scripts/capture.mjs`) does not touch it. A frame-
 * counting wait can never fix a wall-clock-duration transition: two `requestAnimationFrame`
 * calls pass in roughly 33ms, comfortably inside the ~100ms blend, which is exactly why
 * `contrastRatio` for a THEME OTHER THAN THE DEFAULT one previously came back with a plainly
 * wrong number (a light-theme button measuring 1.70:1 instead of its real ~6.45:1) - not a
 * timing coincidence, but this exact transition caught mid-blend, every single time.
 */
const THEME_TRANSITION_SETTLE_MS = 200;

function wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Re-measures every mounted row after ANY change that could alter what is on screen: theme or
 * scale. `nextTick` waits for Vue's own DOM patch (the `<v-theme-provider>` prop change and
 * every component reading it re-rendering); the fixed wait after it is what actually waits for
 * Vuetify's background-colour transition described above to finish, with roughly double the
 * measured ~100ms settle time as margin. `capture.mjs`'s own `waitForTimeout(50)` after
 * `setTheme()` is a SEPARATE, smaller margin on top of this - it is not a substitute for it,
 * and was not enough on its own to catch this before this fix existed.
 */
async function remeasureAfterVisualChange(): Promise<void> {
    await nextTick();
    await wait(THEME_TRANSITION_SETTLE_MS);
    remeasureAllRows();
}

watch(currentThemeName, remeasureAfterVisualChange);
watch(currentScalePercent, remeasureAfterVisualChange);

/** The bridge `scripts/capture.mjs` calls through Playwright's `page.evaluate()`. See this file's own header. */
interface Md3CheckBridge {
    listRows(): { id: string; title: string; m3Name: string }[];
    /** The manifest's `"planned"` half - see `lib/rows.ts` - so the capture JSON can record every skip and why, without the Node-side script needing to load TypeScript itself. */
    listPlannedRows(): { id: string; vuetifyComponent: string; reason: string }[];
    listThemes(): string[];
    setTheme(name: string): Promise<void>;
    setScale(percent: number): Promise<void>;
    measureAll(): Record<string, RowMeasurementSnapshot>;
}

declare global {
    interface Window {
        __MD3_CHECK__?: Md3CheckBridge;
    }
}

/**
 * Reads the row list straight off the live DOM rather than off `ROW_MANIFEST` - the manifest
 * says what SHOULD exist (and `lib/rows.test.ts` already proves it matches `RowsGallery.vue`
 * one-for-one), but this bridge's job is to describe what is actually ON SCREEN right now, in
 * whatever titles the rendered rows actually carry, so `scripts/capture.mjs` never has to trust
 * two sources agreeing.
 */
function listRowsFromDom(): { id: string; title: string; m3Name: string }[] {
    return [...document.querySelectorAll<HTMLElement>("[data-md3-row]")].map((el) => ({
        id: el.getAttribute("data-md3-row") ?? "",
        title: el.querySelector(".md3check-row__title")?.textContent?.trim() ?? "",
        m3Name: el.querySelector(".md3check-row__m3name")?.textContent?.trim() ?? "",
    }));
}

function installCaptureBridge(): void {
    window.__MD3_CHECK__ = {
        listRows: listRowsFromDom,
        listPlannedRows: () =>
            plannedRows().map((r) => ({
                id: r.id,
                vuetifyComponent: r.vuetifyComponent,
                reason: r.plannedReason ?? "",
            })),
        listThemes: () => [...themeNames],
        setTheme: async (name: string) => {
            if (!themeNames.includes(name)) {
                throw new Error(`setTheme("${name}"): not one of ${themeNames.join(", ")}`);
            }
            currentThemeName.value = name;
            await remeasureAfterVisualChange();
        },
        setScale: async (percent: number) => {
            if (!SCALE_STOPS.includes(percent)) {
                throw new Error(`setScale(${percent}): not one of ${SCALE_STOPS.join(", ")}`);
            }
            currentScalePercent.value = percent;
            await remeasureAfterVisualChange();
        },
        measureAll: () => {
            const out: Record<string, RowMeasurementSnapshot> = {};
            for (const row of allRegisteredRows()) {
                out[row.id] = row.getSnapshot();
            }
            return out;
        },
    };
}

installCaptureBridge();
</script>

<template>
    <v-theme-provider :theme="currentThemeName" with-background tag="div" class="md3check-app-root">
        <header class="md3check-toolbar">
            <div class="md3check-toolbar__group">
                <span id="md3check-theme-label">Theme</span>
                <select
                    aria-labelledby="md3check-theme-label"
                    :value="currentThemeName"
                    @change="(event: Event) => (currentThemeName = (event.target as HTMLSelectElement).value)"
                >
                    <option v-for="name in themeNames" :key="name" :value="name">{{ name }}</option>
                </select>
            </div>

            <div class="md3check-toolbar__group">
                <span id="md3check-scale-label">Scale</span>
                <div role="group" aria-labelledby="md3check-scale-label">
                    <button
                        v-for="stop in SCALE_STOPS"
                        :key="stop"
                        type="button"
                        :aria-pressed="currentScalePercent === stop"
                        @click="currentScalePercent = stop"
                    >
                        {{ stop }}%
                    </button>
                </div>
            </div>

            <div class="md3check-toolbar__group">
                <span id="md3check-jump-label">Jump to component</span>
                <select aria-labelledby="md3check-jump-label" @change="onJumpSelectChange">
                    <option value="">Choose a row…</option>
                    <option v-for="row in pickerRows" :key="row.id" :value="row.id">{{ row.id }}</option>
                </select>
            </div>
        </header>

        <div class="md3check-scaled-region" :style="{ zoom: String(currentScalePercent / 100) }">
            <HonestyBanner />
            <CoverageNotice />
            <RowsGallery />
        </div>
    </v-theme-provider>
</template>
