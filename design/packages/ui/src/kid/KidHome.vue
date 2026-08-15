<script setup lang="ts">
/**
 * Kid mode's Home: the GO card, the five catalogues as lands, what the app is doing right now, and
 * the maps this machine knows about.
 *
 * Every card and every row here activates through the same `FeatureTarget` the adult Home uses, so
 * nothing on this screen is decorative and nothing routes on its own. The five lands come from the
 * resolved catalogues; the "what this app is doing right now" rows come from `createActiveRenders`,
 * the one live feed `App.vue` actually computes and forwards as `renderRows`; the map list comes
 * from the profile store.
 *
 * An earlier version of this component also declared an `activity` prop for "preview, backups and
 * CI" rows its own doc comment claimed the adult shell already computed. It never did: `App.vue`
 * never passed `:activity` to `KidShell`, so the prop was always `undefined`, the row it fed always
 * rendered nothing, and the claim above was aspirational rather than true. Removed rather than left
 * wired to nothing - see this checkout's own rule against a declared-but-never-supplied prop that
 * renders an empty region. `renderRows` is unaffected; it was always real.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiChevronRight, mdiLayersOutline, mdiLockOutline, mdiPlayCircle, mdiProgressClock, mdiTerrain } from "@mdi/js";
import { VIcon } from "vuetify/components";
import type { CatalogueFeatureDefinition } from "../components/shell/index.js";
import { findFeature } from "../components/shell/catalogues.js";
/* `ResolvedCatalogue` is not part of the shell barrel's own public surface - it comes straight
 * from `catalogueSearch.js`, the same direct import `KidCataloguePage.vue` already uses for it. */
import type { ResolvedCatalogue } from "../components/shell/catalogueSearch.js";
import { KID_FEATURE_LABELS, kidCatalogueLabel, kidLabel } from "./kidLabels.js";
import { useKidMode } from "./kidMode.js";

const props = defineProps<{
    catalogues: readonly ResolvedCatalogue[];
    /** See `KidShell.vue`'s own doc comment on why `renderId` rides along with `label`. */
    renderRows: readonly { state: string; percent: number | null; label: string; renderId: string }[];
    /**
     * Local renders and remote servers, from the existing profile store. `| undefined`
     * alongside the `?` for the same reason `BackupScreen.vue`'s own optional array props
     * carry it: `KidShell.vue` forwards its own optional prop straight through in the
     * template, so the value this component actually receives is `T[] | undefined`, and
     * `exactOptionalPropertyTypes` treats that as a different type from a bare `T[]`.
     */
    profiles?: readonly { id: string; name: string; meta: string; remote: boolean }[] | undefined;
}>();

const emit = defineEmits<{
    openCatalogue: [id: string];
    activate: [feature: CatalogueFeatureDefinition];
    openProfile: [id: string];
}>();

const { t } = useI18n();
const kid = useKidMode();

/** The hero action is the project editor, exactly as the adult Home's hero is. */
const heroTarget = computed(() => findFeature("make.finding-a-world.the-project-editor"));
const guideTarget = computed(() => findFeature("make.finding-a-world.the-guide"));

function activateByName(featureName: string): void {
    const match = props.catalogues.flatMap((catalogue) => catalogue.features).find((entry) => entry.name === featureName);
    if (match !== undefined) emit("activate", match.definition);
}

/**
 * What a four-to-six-year-old reads for "which map/world is this row about" - never the raw
 * technical id `activeRenders.ts` falls back to before a real name has resolved (a local render's
 * own render id, or a CI row's sync id - see `KidShell.vue`'s own doc comment on the `renderId`
 * prop this compares against).
 *
 * `row.label === row.renderId` is the exact condition under which `worldLabelOf`/`ciToRow` had
 * nothing better to report: both functions return the id itself, verbatim, as their own fallback,
 * so equality here can only mean "no human name yet" - never a real folder that happens to share
 * its name with a hash-suffixed render id, which the id's own 12-hex-character tail makes
 * astronomically unlikely on top of already being a stable, string-equal comparison rather than a
 * guess at the id's shape. This never invents a name; it only decides whether the honest
 * "still finding out" line replaces the id, or the real resolved label is shown as-is.
 */
function rowLabel(row: { label: string; renderId: string }): string {
    if (row.label !== row.renderId) return row.label;
    return t("kid.home.nowUnnamed", "Finding its name");
}
</script>

<template>
    <div class="wl-kid-home">
        <section class="wl-kid-home__hero">
            <span class="wl-kid-home__mascot" aria-hidden="true"><v-icon :icon="mdiTerrain" size="40" /></span>
            <div class="wl-kid-home__hero-copy">
                <h1>{{ t("kid.home.hero", "Make a new map!") }}</h1>
                <p>{{ t("kid.home.heroBlurb", "Pick a world, press GO, and watch it get drawn.") }}</p>
            </div>
            <button class="wl-kid-home__secondary" v-if="guideTarget !== null" type="button" @click="emit('activate', guideTarget)">
                {{ t("kid.home.guide", "Walk me through it") }}
            </button>
            <button class="wl-kid-home__go" v-if="heroTarget !== null" type="button" @click="emit('activate', heroTarget)">
                <v-icon :icon="mdiPlayCircle" size="28" aria-hidden="true" />{{ t("kid.home.go", "GO") }}
            </button>
        </section>

        <section class="wl-kid-home__lands" :aria-label="t('kid.home.lands', 'Everything this app can do')">
            <button
                v-for="catalogue in props.catalogues"
                :key="catalogue.id"
                class="wl-kid-home__land"
                type="button"
                @click="emit('openCatalogue', catalogue.id)"
            >
                <v-icon :icon="catalogue.definition.icon" size="34" aria-hidden="true" />
                <strong>{{ kidCatalogueLabel(catalogue.id, catalogue.title) }}</strong>
                <em>{{ catalogue.title }}</em>
                <span class="wl-kid-home__count">{{ catalogue.features.length }}</span>
            </button>
        </section>

        <div class="wl-kid-home__split">
            <section class="wl-kid-home__panel">
                <h2>{{ t("kid.home.now", "What this app is doing right now") }}</h2>
                <!-- Running renders first: the same rows the status strip and the Work badge read. -->
                <button
                    v-for="row in props.renderRows"
                    :key="row.renderId"
                    class="wl-kid-home__row"
                    type="button"
                    @click="activateByName('Renders in progress')"
                >
                    <v-icon :icon="mdiProgressClock" size="20" aria-hidden="true" />
                    <strong>{{ kidLabel("Renders in progress", KID_FEATURE_LABELS, kid.labelStyle.value).primary }}</strong>
                    <em>{{ rowLabel(row) }}</em>
                    <span class="wl-kid-home__meta">{{ row.percent === null ? "…" : Math.round(row.percent) + "%" }}</span>
                </button>
                <p v-if="props.renderRows.length === 0">
                    {{ t("kid.home.quiet", "Nothing is happening right now. Press GO to start something.") }}
                </p>
            </section>

            <section class="wl-kid-home__panel">
                <h2>{{ t("kid.home.maps", "Your maps and servers") }}</h2>
                <button
                    v-for="profile in props.profiles ?? []"
                    :key="profile.id"
                    class="wl-kid-home__row"
                    type="button"
                    @click="emit('openProfile', profile.id)"
                >
                    <v-icon :icon="profile.remote ? mdiLockOutline : mdiLayersOutline" size="20" aria-hidden="true" />
                    <strong>{{ profile.name }}</strong>
                    <em>{{ profile.meta }}</em>
                </button>
                <button class="wl-kid-home__secondary" type="button" @click="activateByName('Maps and servers')">
                    {{ t("kid.home.addMap", "Add another one") }}
                    <v-icon :icon="mdiChevronRight" size="18" aria-hidden="true" />
                </button>
            </section>
        </div>
    </div>
</template>

<style scoped>
/*
 * `overflow-x: hidden` alongside the existing vertical scroll is a deliberate backstop, not
 * a change of intent: this project's own rule is that the body - and every scrolling
 * container standing in for it - never scrolls sideways. Before the narrow-width rules below
 * existed, the hero's headline could overflow its own flex slot (see `.wl-kid-home__hero`'s
 * own comment), and because this element scrolled with a bare `overflow: auto`, that overflow
 * surfaced as exactly the horizontal scrollbar the rule forbids. The reflow rules make that
 * overflow stop happening in the first place; this line is what keeps it from coming back.
 */
.wl-kid-home { padding: 20px 24px 28px; overflow-y: auto; overflow-x: hidden; }
.wl-kid-home__hero { display: flex; align-items: center; gap: 16px; padding: 18px 22px; border-radius: var(--wl-kid-radius-lg); background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary)); }
.wl-kid-home__mascot { width: 100px; height: 100px; flex: 0 0 auto; display: grid; place-items: center; border-radius: var(--wl-kid-radius-md); background: rgb(var(--v-theme-tertiary)); color: rgb(var(--v-theme-on-tertiary)); }
@media (prefers-reduced-motion: no-preference) {
    .wl-kid-home__mascot { animation: wl-kid-bob 2.6s ease-in-out infinite; }
    @keyframes wl-kid-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
}
.wl-kid-home__hero-copy { flex: 1; min-width: 0; }
.wl-kid-home__hero-copy h1 { margin: 0; font-size: 36px; font-weight: 800; overflow-wrap: anywhere; }
.wl-kid-home__hero-copy p { margin: 0; font-size: 20px; overflow-wrap: anywhere; }
.wl-kid-home__go,
.wl-kid-home__secondary { min-height: var(--wl-kid-target-min); border: 0; border-radius: var(--wl-kid-radius-full); font: inherit; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; flex: 0 0 auto; }
.wl-kid-home__go { min-height: 82px; padding: 0 34px; font-size: 30px; background: rgb(var(--v-theme-tertiary)); color: rgb(var(--v-theme-on-tertiary)); }
.wl-kid-home__secondary { padding: 0 22px; font-size: 19px; background: rgb(var(--v-theme-surface-container-lowest)); color: rgb(var(--v-theme-secondary)); }
.wl-kid-home__lands { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.wl-kid-home__land { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-height: 168px; padding: 15px; border: 0; border-radius: var(--wl-kid-radius-lg); background: rgb(var(--v-theme-surface-container-lowest)); box-shadow: var(--wl-kid-press); font: inherit; text-align: left; cursor: pointer; }
.wl-kid-home__land strong { font-size: 24px; font-weight: 800; overflow-wrap: anywhere; }
.wl-kid-home__land em { font-style: normal; font-size: 15px; color: rgb(var(--v-theme-outline)); overflow-wrap: anywhere; }
.wl-kid-home__count { font-size: 16px; font-weight: 800; color: rgb(var(--v-theme-primary)); }
.wl-kid-home__split { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; margin-top: 16px; }
.wl-kid-home__panel { padding: 16px 18px; border-radius: var(--wl-kid-radius-lg); background: rgb(var(--v-theme-surface-container-lowest)); box-shadow: var(--wl-kid-press); min-width: 0; }
.wl-kid-home__panel h2 { margin: 0 0 11px; font-size: 24px; font-weight: 800; overflow-wrap: anywhere; }
.wl-kid-home__row { width: 100%; min-height: var(--wl-kid-target-min); display: flex; align-items: center; gap: 12px; margin-bottom: 9px; padding: 11px 13px; border: 0; border-radius: var(--wl-kid-radius-md); background: rgb(var(--v-theme-surface-container-high)); font: inherit; text-align: left; cursor: pointer; }
.wl-kid-home__row strong { font-size: 21px; font-weight: 800; overflow-wrap: anywhere; }
.wl-kid-home__row em { font-style: normal; font-size: 15px; color: rgb(var(--v-theme-outline)); overflow-wrap: anywhere; }
.wl-kid-home__meta { margin-left: auto; font-family: var(--wl-kid-mono); font-size: 14px; color: rgb(var(--v-theme-outline)); }

/*
 * Narrow-width reflow, at the same 860px measure `HomeCatalogues.vue`'s own hero/grid
 * breakpoint already uses for the adult shell's Home (`.wl-hero`, `.wl-home__grid`) - the
 * width below which two things sharing a row stop being a readable layout and start being a
 * crushed one, this file's own version of it just as real: `docs/screenshots/kid-home-390.png`
 * caught the fixed 5-column `.wl-kid-home__lands` grid crushing every catalogue label
 * ("Make a map", "Buttons & help", ...) into a stack of unreadable fragments, because
 * `minmax(0, 1fr)` columns are free to shrink far below a 24px bold word's own min-content
 * width, and caught the one-row `.wl-kid-home__hero` (mascot + copy + two buttons, all in a
 * single flex line) squeezing `.wl-kid-home__hero-copy` toward zero width while its
 * fixed-size siblings kept theirs, which let the headline overflow past its own box (the
 * default `overflow-wrap: normal` lets a word overflow rather than break) straight into the
 * "Walk me through it" button beside it - and because `.wl-kid-home` scrolls with `overflow:
 * auto`, that overflowing headline is exactly what produced the horizontal scrollbar this
 * project's own rule forbids.
 *
 * The fix mirrors the adult shell's own answer rather than inventing a new one: the hero
 * drops to a single column, exactly as `.wl-hero` does at this width, so
 * `.wl-kid-home__hero-copy` gets the hero's full inline size to wrap its words in instead of
 * a slice of a shared row; the lands grid drops from five columns to two, exactly as
 * `.wl-home__grid` drops from two to one, so each land gets a column wide enough to hold its
 * label; and the two-panel split collapses to one column for the same reason. Every touch
 * target below keeps or exceeds `--wl-kid-target-min` (64px) - this block only ever removes
 * space between or around targets, never shrinks one below the floor kid mode exists to
 * raise.
 */
@media (max-width: 860px) {
    .wl-kid-home { padding: 16px 14px 20px; }
    .wl-kid-home__hero { flex-direction: column; align-items: stretch; text-align: center; padding: 16px 18px; }
    .wl-kid-home__mascot { width: 76px; height: 76px; margin: 0 auto; }
    .wl-kid-home__hero-copy { text-align: center; }
    .wl-kid-home__hero-copy h1 { font-size: 26px; }
    .wl-kid-home__hero-copy p { font-size: 16px; }
    .wl-kid-home__go,
    .wl-kid-home__secondary { width: 100%; }
    .wl-kid-home__go { min-height: 72px; font-size: 24px; padding: 0 20px; }
    .wl-kid-home__lands { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .wl-kid-home__land { min-height: 132px; padding: 12px; }
    .wl-kid-home__land strong { font-size: 19px; }
    .wl-kid-home__land em { font-size: 13px; }
    .wl-kid-home__split { grid-template-columns: 1fr; }
}
</style>
