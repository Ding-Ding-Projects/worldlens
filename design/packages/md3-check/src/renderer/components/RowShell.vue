<script setup lang="ts">
/**
 * One row of the gallery: a title, its spec citations (or a "no direct M3 equivalent" flag),
 * two panes (`#reference`, `#worldlens`), and the measurement machinery that reads both.
 *
 * This is the ONE place `measure.ts` gets called from inside the live UI. `RowsGallery.vue`
 * supplies the markup for each pane; this component finds the single element inside each pane
 * carrying `data-measure` (there must be exactly one - see `findMeasureTarget` below) and
 * reports what `measureComponent()` sees. Consolidating the measuring here, rather than letting
 * each row re-implement it, is what keeps every row's numbers produced by the identical code
 * path `scripts/capture.mjs` also calls via `window.__MD3_CHECK__.measureAll()` - see that
 * global's own registration in `App.vue`, which is what actually makes this component's
 * instances reachable from outside Vue at all.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
    diffMeasurements,
    measureComponent,
    type ComponentMeasurement,
    type MeasurementDiff,
} from "../lib/measure.js";
import { registerRow, unregisterRow, type RegisteredRow, type RowMeasurementSnapshot } from "../lib/harnessState.js";

const props = withDefaults(
    defineProps<{
        id: string;
        title: string;
        /** The Material 3 component name this row compares against, e.g. "Filled button". */
        m3Name: string;
        /** Spec citations shown under the title, one per line. Omit when `noSpecEquivalent` is set. */
        citations?: string[];
        /** Set when Material 3 defines no directly-named component this row can cite against. */
        noSpecEquivalent?: string;
        /**
         * Overrides which element inside each pane gets measured, for the rows where the
         * component being compared is not the single obvious `[data-measure]` root - a
         * Vuetify selection control (checkbox/radio) renders its visible glyph as a nested
         * `<v-icon>` well inside a much larger hit-target wrapper that VBtn-style
         * `data-measure` forwarding cannot reach selectively. See the relevant row's own
         * comment in `RowsGallery.vue` for why its selector differs from the default.
         */
        referenceSelector?: string;
        worldlensSelector?: string;
    }>(),
    { referenceSelector: "[data-measure]", worldlensSelector: "[data-measure]" },
);

const referencePane = ref<HTMLElement | null>(null);
const worldlensPane = ref<HTMLElement | null>(null);

const referenceMeasurement = ref<ComponentMeasurement | null>(null);
const worldlensMeasurement = ref<ComponentMeasurement | null>(null);
const diff = ref<MeasurementDiff | null>(null);

/**
 * Exactly one element matching `selector` is expected per pane - the one DOM node that IS the
 * component being compared, as opposed to whatever padding/label wrapper surrounds it. More
 * than one is a markup mistake in `RowsGallery.vue` (which element did the author mean?); this
 * throws rather than silently picking the first match, because a wrong silent pick here would
 * quietly measure the wrong element and report it as though it were correct - exactly the kind
 * of guard that would pass while proving nothing.
 */
function findMeasureTarget(container: HTMLElement | null, selector: string): HTMLElement | null {
    if (container === null) return null;
    const matches = container.querySelectorAll<HTMLElement>(selector);
    if (matches.length === 0) return null;
    if (matches.length > 1) {
        throw new Error(
            `Row "${props.id}": ${matches.length} elements match "${selector}" in one pane; expected exactly one.`,
        );
    }
    return matches[0]!;
}

/**
 * Re-reads both panes right now. Safe to call as often as needed - see `measure.ts`'s own note
 * on why nothing here is cached. Returns `false` (rather than throwing) when a pane's target
 * is not yet in the DOM, which happens for one frame around initial mount; callers that care
 * can check the return value, and `onMounted` below retries once via `nextTick` for exactly
 * that reason.
 */
function remeasure(): boolean {
    const refTarget = findMeasureTarget(referencePane.value, props.referenceSelector);
    const wlTarget = findMeasureTarget(worldlensPane.value, props.worldlensSelector);
    if (refTarget === null || wlTarget === null) return false;

    const refMeasurement = measureComponent(refTarget);
    const wlMeasurement = measureComponent(wlTarget);
    referenceMeasurement.value = refMeasurement;
    worldlensMeasurement.value = wlMeasurement;
    diff.value = diffMeasurements(refMeasurement, wlMeasurement);
    return true;
}

function getSnapshot(): RowMeasurementSnapshot {
    return {
        reference: referenceMeasurement.value,
        worldlens: worldlensMeasurement.value,
        diff: diff.value,
    };
}

defineExpose<RegisteredRow>({ id: props.id, remeasure, getSnapshot });

onMounted(async () => {
    if (!remeasure()) {
        // The measured elements exist in the template but the browser has not yet completed
        // its first layout pass when this runs; one microtask/frame is enough in every
        // observed case. If it still fails after that, remeasure() is called again by every
        // subsequent theme/scale change anyway, so nothing is lost - the row just shows "-"
        // for one paint.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        remeasure();
    }
    registerRow({ id: props.id, remeasure, getSnapshot });
});

onBeforeUnmount(() => {
    unregisterRow(props.id);
});

/** Small formatting helpers - kept here rather than in `measure.ts` since they are display-only. */
function fmtPx(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return `${value.toFixed(1)}px`;
}

function fmtDelta(value: number | null): string {
    if (value === null || Number.isNaN(value)) return "-";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}`;
}

function fmtRatio(value: number | null): string {
    if (value === null || Number.isNaN(value)) return "n/a";
    return `${value.toFixed(2)}:1`;
}

/**
 * The corner-radius column shows the largest of the four corners (see `measure.ts`'s own
 * comment on why `cornerRadiusPx` is that max rather than an average or a first-corner value),
 * with "(mixed)" appended whenever the four corners are not actually equal - a filled text
 * field's square bottom corners against its rounded top ones, for instance. None of this
 * package's current 15 rows produces a mixed shape on either pane, but a future row easily
 * could, and a plain number with no such flag would silently misrepresent one.
 */
function fmtCorner(measurement: ComponentMeasurement | null): string {
    if (measurement === null) return "-";
    const base = fmtPx(measurement.cornerRadiusPx);
    return measurement.cornerRadiusUniform ? base : `${base} (mixed)`;
}

const headlineDeltas = computed(() => {
    const d = diff.value;
    if (d === null) return [];
    return [
        { label: "Corner", value: fmtDelta(d.cornerRadiusPx.deltaNumeric), differs: d.cornerRadiusPx.differs },
        { label: "Height", value: fmtDelta(d.heightPx.deltaNumeric), differs: d.heightPx.differs },
        { label: "Font size", value: fmtDelta(d.fontSizePx.deltaNumeric), differs: d.fontSizePx.differs },
        { label: "Contrast", value: fmtDelta(d.contrastRatio.deltaNumeric), differs: d.contrastRatio.differs },
    ];
});
</script>

<template>
    <section
        class="md3check-row"
        :data-md3-row="id"
        :aria-label="`${title} comparison row`"
        tabindex="-1"
    >
        <header class="md3check-row__header">
            <h3 class="md3check-row__title">{{ title }}</h3>
            <span class="md3check-row__m3name">{{ m3Name }}</span>
        </header>

        <p v-if="noSpecEquivalent" class="md3check-row__no-spec" role="note">
            <strong>No direct Material 3 component:</strong> {{ noSpecEquivalent }}
        </p>
        <ul v-else-if="citations && citations.length > 0" class="md3check-row__citations">
            <li v-for="(citation, i) in citations" :key="i">{{ citation }}</li>
        </ul>

        <div class="md3check-row__panes">
            <div ref="referencePane" class="md3check-pane md3check-pane--reference">
                <span class="md3check-pane__label">M3 reference (hand-typed, static)</span>
                <div class="md3check-pane__stage">
                    <slot name="reference" />
                </div>
            </div>

            <div ref="worldlensPane" class="md3check-pane md3check-pane--worldlens">
                <span class="md3check-pane__label">Worldlens (real component)</span>
                <div class="md3check-pane__stage">
                    <slot name="worldlens" />
                </div>
            </div>

            <div class="md3check-diff-narrow" aria-label="Headline measured differences">
                <span class="md3check-diff-narrow__label">&Delta;</span>
                <div
                    v-for="item in headlineDeltas"
                    :key="item.label"
                    class="md3check-diff-narrow__item"
                    :class="{ 'md3check-diff-narrow__item--differs': item.differs }"
                >
                    <span class="md3check-diff-narrow__field">{{ item.label }}</span>
                    <span class="md3check-diff-narrow__value">{{ item.value }}</span>
                </div>
            </div>
        </div>

        <table class="md3check-row__table" v-if="referenceMeasurement && worldlensMeasurement && diff">
            <caption class="md3check-row__table-caption">
                Measured directly from the rendered DOM (getBoundingClientRect / getComputedStyle) - not
                read from any source file. A value marked &Delta; differs from the reference by more than
                this instrument's rounding tolerance; that is a reported difference, never a verdict - see
                the citations above for whether it is a bug or a deliberate choice.
            </caption>
            <thead>
                <tr>
                    <th scope="col">Field</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Worldlens</th>
                    <th scope="col">&Delta;</th>
                </tr>
            </thead>
            <tbody>
                <tr :class="{ 'md3check-row__table-diff': diff.cornerRadiusPx.differs }">
                    <th scope="row">Corner radius (effective)</th>
                    <td>{{ fmtCorner(referenceMeasurement) }}</td>
                    <td>{{ fmtCorner(worldlensMeasurement) }}</td>
                    <td>{{ fmtDelta(diff.cornerRadiusPx.deltaNumeric) }}</td>
                </tr>
                <tr :class="{ 'md3check-row__table-diff': diff.heightPx.differs }">
                    <th scope="row">Height</th>
                    <td>{{ fmtPx(referenceMeasurement.heightPx) }}</td>
                    <td>{{ fmtPx(worldlensMeasurement.heightPx) }}</td>
                    <td>{{ fmtDelta(diff.heightPx.deltaNumeric) }}</td>
                </tr>
                <tr :class="{ 'md3check-row__table-diff': diff.widthPx.differs }">
                    <th scope="row">Width</th>
                    <td>{{ fmtPx(referenceMeasurement.widthPx) }}</td>
                    <td>{{ fmtPx(worldlensMeasurement.widthPx) }}</td>
                    <td>{{ fmtDelta(diff.widthPx.deltaNumeric) }}</td>
                </tr>
                <tr :class="{ 'md3check-row__table-diff': diff.minVisibleTargetPx.differs }">
                    <th scope="row">Min visible dimension</th>
                    <td>{{ fmtPx(referenceMeasurement.minVisibleTargetPx) }}</td>
                    <td>{{ fmtPx(worldlensMeasurement.minVisibleTargetPx) }}</td>
                    <td>{{ fmtDelta(diff.minVisibleTargetPx.deltaNumeric) }}</td>
                </tr>
                <tr :class="{ 'md3check-row__table-diff': diff.fontSizePx.differs }">
                    <th scope="row">Font size</th>
                    <td>{{ fmtPx(referenceMeasurement.fontSizePx) }}</td>
                    <td>{{ fmtPx(worldlensMeasurement.fontSizePx) }}</td>
                    <td>{{ fmtDelta(diff.fontSizePx.deltaNumeric) }}</td>
                </tr>
                <tr :class="{ 'md3check-row__table-diff': diff.fontWeight.differs }">
                    <th scope="row">Font weight</th>
                    <td>{{ referenceMeasurement.fontWeight }}</td>
                    <td>{{ worldlensMeasurement.fontWeight }}</td>
                    <td>{{ fmtDelta(diff.fontWeight.deltaNumeric) }}</td>
                </tr>
                <tr :class="{ 'md3check-row__table-diff': diff.lineHeightPx.differs }">
                    <th scope="row">Line height</th>
                    <td>{{ fmtPx(referenceMeasurement.lineHeightPx) }}</td>
                    <td>{{ fmtPx(worldlensMeasurement.lineHeightPx) }}</td>
                    <td>{{ fmtDelta(diff.lineHeightPx.deltaNumeric) }}</td>
                </tr>
                <tr :class="{ 'md3check-row__table-diff': diff.letterSpacingPx.differs }">
                    <th scope="row">Letter spacing</th>
                    <td>{{ fmtPx(referenceMeasurement.letterSpacingPx) }}</td>
                    <td>{{ fmtPx(worldlensMeasurement.letterSpacingPx) }}</td>
                    <td>{{ fmtDelta(diff.letterSpacingPx.deltaNumeric) }}</td>
                </tr>
                <tr :class="{ 'md3check-row__table-diff': diff.fontFamily.differs }">
                    <th scope="row">Font family</th>
                    <td>{{ referenceMeasurement.fontFamily }}</td>
                    <td>{{ worldlensMeasurement.fontFamily }}</td>
                    <td>{{ diff.fontFamily.differs ? "differs" : "same" }}</td>
                </tr>
                <tr :class="{ 'md3check-row__table-diff': diff.contrastRatio.differs }">
                    <th scope="row">Text/background contrast</th>
                    <td>{{ fmtRatio(referenceMeasurement.contrastRatio) }}</td>
                    <td>{{ fmtRatio(worldlensMeasurement.contrastRatio) }}</td>
                    <td>{{ fmtDelta(diff.contrastRatio.deltaNumeric) }}</td>
                </tr>
            </tbody>
        </table>
    </section>
</template>
