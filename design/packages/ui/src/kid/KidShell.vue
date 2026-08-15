<script setup lang="ts">
/**
 * Kid mode's shell: the rail, the status bar, and one view at a time.
 *
 * It owns no destination logic and no feature list. Everything it draws comes from the props the
 * adult shell already computes - the resolved catalogues, the open job ids, the problem list, the
 * notice history, the live render rows - and every feature-row activation is emitted straight back
 * out to `shellNavigation.activateTarget`, exactly as the adult Home and catalogue pages already do.
 * Job screens, the map canvas, settings, the options editor, the palette and the tab finder are the
 * existing components, reached the existing ways: settings and the options editor through Adult
 * Mode once the grown-up gate is passed (see `KidGrownUpGate.vue`), the map canvas and job screens
 * through the `map` slot and the wildcard-forwarded job-id slots below.
 *
 * ### The Work view re-hosts `WorkPane`, and its slots are forwarded, not renamed
 *
 * `KidJobStrip.vue` mounts its own `WorkPane`, and `WorkPane` renders one named slot per job id
 * (`world`, `projects`, `cirender`, ...) - the same slot names `App.vue` already fills. The earlier
 * version of this file offered a single `#default="{ id }"` slot instead, which is not a shape
 * `WorkPane`'s real slot mechanism produces, so nothing would ever have rendered inside a kid-mode
 * job tab. This file now forwards its own `$slots` wholesale into `KidJobStrip`, the identical
 * wildcard pattern `KidJobStrip` already uses to forward them again into `WorkPane` - a caller
 * fills `#world`, `#projects`, and so on, exactly as it already does for the adult shell's own
 * `WorkPane`, and this shell never needs to know the full job-id list to pass them through.
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { CatalogueFeatureDefinition } from "../components/shell/index.js";
import { findFeature } from "../components/shell/catalogues.js";
/* `ResolvedCatalogue` is not part of the shell barrel's own public surface - it comes straight
 * from `catalogueSearch.js`, the same direct import `KidCataloguePage.vue` already uses for it. */
import type { ResolvedCatalogue } from "../components/shell/catalogueSearch.js";
import KidRail from "./KidRail.vue";
import KidHome from "./KidHome.vue";
import KidCataloguePage from "./KidCataloguePage.vue";
import KidJobStrip from "./KidJobStrip.vue";
import KidStickerBook from "./KidStickerBook.vue";
import KidGrownUpGate from "./KidGrownUpGate.vue";
import KidCelebration from "./KidCelebration.vue";
import { useKidMode } from "./kidMode.js";
import { useKidProgress, type StickerId } from "./useKidProgress.js";
import { KID_SHELL_VARS } from "./kidTheme.js";

const props = defineProps<{
    destination: "home" | "map" | "work";
    catalogues: readonly ResolvedCatalogue[];
    openJobs: readonly string[];
    problems: readonly { id: string; message: string }[];
    notices: readonly { level: string; text: string; at: string; read: boolean }[];
    /**
     * `renderId` is the same id `label` itself falls back to when nothing human-readable has been
     * resolved yet (`activeRenders.ts`'s `worldLabelOf`/`ciToRow`) - forwarded through unchanged so
     * `KidHome` can tell "a real name" apart from "the technical id, because nothing better is
     * known yet" without guessing at the id's shape. See `KidHome.vue`'s own doc comment on why a
     * child is never shown the bare id either way.
     */
    renderRows: readonly { state: string; percent: number | null; label: string; renderId: string }[];
    renderPercent: number | null;
    /** Forwarded to `KidJobStrip` -> `WorkPane`, exactly as the adult shell already computes it. */
    runningRenderCount?: number;
    /** Forwarded to `KidHome`. Local renders and remote servers, from the existing profile store. */
    profiles?: readonly { id: string; name: string; meta: string; remote: boolean }[];
}>();

const emit = defineEmits<{
    activate: [feature: CatalogueFeatureDefinition];
    selectDestination: [destination: "home" | "map" | "work"];
    /** Relayed from `KidJobStrip`'s own `WorkPane`, so the caller's own open-job tracking stays
     * live across a Kid Mode toggle instead of freezing at whatever it read before the switch. */
    workspaceChange: [pageIds: readonly string[]];
}>();

const { t } = useI18n();
const kid = useKidMode();
const progress = useKidProgress();

/** Kid mode adds exactly two views of its own: the sticker book and the grown-up gate. */
const view = ref<"catalogues" | "catalogue" | "map" | "work" | "stickers" | "grown-ups">(destinationToView(props.destination));
const openCatalogueId = ref<string | null>(null);
const jobStrip = ref<InstanceType<typeof KidJobStrip> | null>(null);
const celebration = ref<InstanceType<typeof KidCelebration> | null>(null);

function destinationToView(destination: "home" | "map" | "work"): "catalogues" | "map" | "work" {
    if (destination === "map") return "map";
    if (destination === "work") return "work";
    return "catalogues";
}

/**
 * Kept in step with the caller's own `destination`, the same way the adult shell's own three-way
 * switch would be: an external navigation (a job activated from outside, a deep link, a restored
 * workspace) still lands kid mode on the right top-level view. Internal-only views - the catalogue
 * detail page, the sticker book, the grown-up gate - are never overwritten by this, because they
 * only change when `props.destination` itself changes to a different value, not on every render.
 */
watch(
    () => props.destination,
    (next) => (view.value = destinationToView(next)),
);

/**
 * `noUncheckedIndexedAccess` (and `.find()`'s own signature) both type a lookup as possibly
 * `undefined`, so this is the one place that is decided rather than asserted with `!` at the call
 * site - `openCatalogueId` only ever holds an id `openCatalogue()` took from a real row in
 * `props.catalogues`, so a `null` result here only happens if the caller's own catalogue list
 * changed shape out from under an already-open page, which is exactly the case worth falling back
 * to "no catalogue open" for rather than crashing on.
 */
const activeCatalogue = computed<ResolvedCatalogue | null>(() =>
    openCatalogueId.value === null
        ? null
        : (props.catalogues.find((entry) => entry.id === openCatalogueId.value) ?? null),
);

const running = computed(() => props.renderRows.filter((row) => row.state === "running" || row.state === "starting"));
const unread = computed(() => props.notices.filter((notice) => !notice.read).length);

function openCatalogue(id: string): void {
    openCatalogueId.value = id;
    view.value = "catalogue";
}

/** The render-progress chip routes through the real catalogue, not a bespoke "open renders" path -
 * kid mode adds no navigation route the catalogue does not already declare. */
function openRendersInProgress(): void {
    const feature = findFeature("make.while-it-runs.renders-in-progress");
    if (feature !== null) emit("activate", feature);
}

/**
 * The rail's "find" and "messages" footer buttons route through the same two real catalogue
 * features "Set up & help" already declares - `setup.how-the-interface-behaves.command-palette`
 * and `...notification-centre` - rather than the fabricated `{ key: "palette", ... } as never`
 * `CatalogueFeatureDefinition` the earlier draft invented. A cast through `never`/`unknown`
 * manufactures a *fake* row that happens to satisfy the type, which is a worse answer than using
 * the two rows the catalogue genuinely has for exactly these destinations.
 */
function openPalette(): void {
    const feature = findFeature("setup.how-the-interface-behaves.command-palette");
    if (feature !== null) emit("activate", feature);
}
function openNotifications(): void {
    const feature = findFeature("setup.how-the-interface-behaves.notification-centre");
    if (feature !== null) emit("activate", feature);
}

/** Passed a real completion event's sticker id - see `useKidProgress().award()`'s own doc comment
 * for why nothing here can celebrate something that did not happen. */
function award(id: StickerId): void {
    const result = progress.award(id);
    if (result === null) return;
    if (result.levelledUp) {
        celebration.value?.celebrate(
            t("kid.celebrate.levelUp.title", { n: String(progress.level.value) }, "Level {n}"),
            t("kid.celebrate.levelUp.body", "You earned enough XP to level up."),
        );
    } else {
        celebration.value?.celebrate(
            t("kid.celebrate.sticker.title", { sticker: result.sticker }, "New sticker: {sticker}"),
            t("kid.celebrate.sticker.body", "Open the sticker book to see it."),
        );
    }
}

/**
 * Job requests that arrived before `KidJobStrip` existed to receive them.
 *
 * `ensureJob`/`revealJob` below flip `view.value` to `"work"` and, in that same call, used to try
 * reaching `jobStrip.value` immediately - but `KidJobStrip` sits behind `v-else-if="view === 'work'"`
 * in the template, so the very first time a caller enters Work from any other view, Vue has not yet
 * run the render/patch that mounts it: a reactive update is batched onto the microtask queue like
 * every other Vue update, never applied synchronously inside the function that triggered it. So
 * `jobStrip.value` was still `null` at the exact point this file read it, and the call silently did
 * nothing - the first tap on any non-pinned job (Backups, GitHub runners, Pages, and so on) opened
 * nothing at all, with no error and no way for a child to know why. A second tap worked, because by
 * then the strip had mounted from the first tap's own `view.value = "work"` - which is exactly what
 * made this bug read as "the app randomly ignores the first tap" rather than "job X is broken".
 *
 * The fix queues the request instead of dropping it, and the `watch` below drains the whole queue,
 * in order, the moment `jobStrip` actually becomes non-null. This is deliberately not a `nextTick()`
 * guess that happens to win a race on a fast machine: it reacts to the one event that actually
 * matters (the ref being set by Vue's own mount), so it is correct no matter how many render passes
 * the real mount takes. Queuing rather than overwriting also means a second request that arrives
 * before the strip has mounted is not lost to the first - both are queued, in arrival order, and
 * both are applied once the strip exists, rather than the later call clobbering the earlier one.
 */
type PendingJobRequest = { readonly pageId: string; readonly focus: boolean };
const pendingJobRequests = ref<PendingJobRequest[]>([]);

watch(jobStrip, (strip) => {
    if (strip === null || pendingJobRequests.value.length === 0) return;
    const queued = pendingJobRequests.value;
    pendingJobRequests.value = [];
    for (const request of queued) {
        if (request.focus) strip.revealPage(request.pageId);
        else strip.ensurePage(request.pageId);
    }
});

/** Switches to the Work view and ensures the job's tab exists, without focusing it - the same pair
 * of effects `App.vue`'s own `ShellNavigationHost.ensureJob` produces for the adult shell.
 *
 * `KidJobStrip` may not be mounted yet the instant this runs - see `pendingJobRequests`'s own doc
 * comment above. When that is the case, the request is queued rather than dropped; the `watch`
 * above applies it, in order, as soon as the strip actually mounts. */
function ensureJob(pageId: string): void {
    view.value = "work";
    if (jobStrip.value !== null) {
        jobStrip.value.ensurePage(pageId);
    } else {
        pendingJobRequests.value = [...pendingJobRequests.value, { pageId, focus: false }];
    }
}

/** Switches to the Work view and focuses the job's tab. Same queuing as `ensureJob` above applies
 * when the strip has not mounted yet. */
function revealJob(pageId: string): void {
    view.value = "work";
    if (jobStrip.value !== null) {
        jobStrip.value.revealPage(pageId);
    } else {
        pendingJobRequests.value = [...pendingJobRequests.value, { pageId, focus: true }];
    }
}

/**
 * Kid Mode is presentation only, so leaving it is a flip of the one flag every other kid-mode
 * component already reads - no separate "leave" state to keep in sync. `KidGrownUpGate.vue` never
 * touches `kid.enabled` itself; it only decides *whether* a grown-up has proven they are one, and
 * this is the one place that acts on that decision.
 */
function switchToAdult(): void {
    kid.enabled.value = false;
    // Reset for the next time Kid Mode is turned back on, so it does not reopen on the gate.
    view.value = destinationToView(props.destination);
}

/**
 * Exposed for `App.vue`'s own `ShellNavigationHost`: while Kid Mode is active, a job-target
 * activation (from the command palette, a notice action, or anywhere else the shared
 * `shellNavigation.activateTarget` reaches) has to land inside *this* shell's own `WorkPane`
 * instance rather than the adult shell's, and only this component has a ref to it.
 */
defineExpose({ ensureJob, revealJob, award });
</script>

<template>
    <div class="wl-kid" :style="KID_SHELL_VARS">
        <KidRail
            :view="view"
            :job-count="props.openJobs.length"
            :unread="unread"
            @home="((view = 'catalogues'), emit('selectDestination', 'home'))"
            @map="((view = 'map'), emit('selectDestination', 'map'))"
            @work="((view = 'work'), emit('selectDestination', 'work'))"
            @stickers="view = 'stickers'"
            @find="openPalette"
            @messages="openNotifications"
            @grown-ups="view = 'grown-ups'"
        />

        <main class="wl-kid__pane">
            <header class="wl-kid__status">
                <!--
                    Was `<span class="wl-kid__level-badge">{{ progress.level.value }}</span>` right
                    beside `t("kid.status.level", ...)`, which already spells out "Level {n}" - so a
                    four-to-six-year-old read the level number twice, once bare and once inside its
                    own sentence ("1 Level 1"). `wl-kid__level-badge` was never even given a style of
                    its own (`KidShell.vue`'s style block has no such rule), so it was not a deliberate
                    numeral badge either - just a leftover duplicate. One number, in one sentence.
                -->
                <button class="wl-kid__level" type="button" @click="view = 'stickers'">
                    {{ t("kid.status.level", { n: String(progress.level.value) }, "Level {n}") }}
                </button>
                <div class="wl-kid__xp" role="progressbar" :aria-valuenow="progress.intoLevel.value" aria-valuemin="0" :aria-valuemax="500">
                    <div class="wl-kid__xp-fill" :style="{ width: (progress.intoLevel.value / 5) + '%' }" />
                </div>
                <!-- The same aggregator the adult status strip and the Work badge read. -->
                <button v-if="running.length > 0" class="wl-kid__chip wl-kid__chip--go" type="button" @click="openRendersInProgress">
                    {{ props.renderPercent === null ? "…" : Math.round(props.renderPercent) + "%" }}
                </button>
                <button v-if="props.problems.length > 0" class="wl-kid__chip wl-kid__chip--problem" type="button" @click="view = 'grown-ups'">
                    {{ props.problems.length }}
                </button>
                <span class="wl-kid__spacer" />
                <span class="wl-kid__name">{{ kid.childName.value }}</span>
            </header>

            <KidHome
                v-if="view === 'catalogues'"
                :catalogues="props.catalogues"
                :render-rows="props.renderRows"
                :profiles="props.profiles"
                @open-catalogue="openCatalogue"
                @activate="(feature) => emit('activate', feature)"
            />
            <KidCataloguePage
                v-else-if="view === 'catalogue' && activeCatalogue !== null"
                :catalogue="activeCatalogue!"
                @back="view = 'catalogues'"
                @activate="(feature) => emit('activate', feature)"
            />
            <div v-else-if="view === 'map'" class="wl-kid__map"><slot name="map" /></div>
            <KidJobStrip
                v-else-if="view === 'work'"
                ref="jobStrip"
                :running-render-count="props.runningRenderCount ?? 0"
                @workspace-change="(ids: readonly string[]) => emit('workspaceChange', ids)"
            >
                <!-- Every job screen the caller passed to this shell, forwarded verbatim - the
                     same wildcard pattern KidJobStrip already uses to reach WorkPane. -->
                <template v-for="(_, name) in $slots" #[name]="scope: Record<string, unknown>">
                    <slot :name="name" v-bind="scope ?? {}" />
                </template>
            </KidJobStrip>
            <KidStickerBook v-else-if="view === 'stickers'" :stickers="progress.stickers.value" @activate="(feature) => emit('activate', feature)" />
            <KidGrownUpGate v-else-if="view === 'grown-ups'" @switch-to-adult="switchToAdult" />
        </main>

        <!--
            Mounted unconditionally, per `KidCelebration.vue`'s own doc comment: gating the whole
            component's existence on `mayAnimate` meant a user with celebrations on but the OS
            asking for reduced motion never saw a celebration at all. `KidCelebration` decides for
            itself whether to show anything (on `kid.celebrations` alone) and whether to animate it
            once shown (on `mayAnimate`).
        -->
        <KidCelebration ref="celebration" />
    </div>
</template>

<style scoped>
/*
 * `pointer-events: auto`, stated explicitly, is the one property standing between this shell and
 * a build where nothing in it can be pressed - `App.vue`'s own `.mb-kid-shell-host` positions this
 * component over the same rectangle `.mb-shell-body` fills, and that rectangle sits inside
 * `#app .v-main`, which `styles/global.scss` sets to `pointer-events: none` on purpose: it is what
 * keeps the map draggable through the gaps of the adult shell's own chrome. `pointer-events` is an
 * inherited property, so that `none` was never something this component started from and had to
 * opt out of - it was the ambient value flowing straight down through `.mb-kid-shell-host`,
 * `.wl-kid` and every descendant all the way to the buttons a child actually presses, because
 * nothing in this file ever said otherwise.
 *
 * The adult shell never hits this trap because its own non-map destinations declare the opposite
 * explicitly at exactly this level - `App.vue`'s Home and Work layers are each
 * `class="mb-shell-layer mb-shell-layer--home mb-interactive"` / `"mb-shell-layer mb-interactive"`
 * - and this rule is that same opt-in, moved to the one root every kid-mode view already shares
 * instead of repeated per destination. Without it, a real click or tap anywhere in kid mode - the
 * rail, the catalogue tiles, the grown-up gate's own button - hit-tests straight past this entire
 * subtree to whatever is behind it in the document, which in this app is `#map-container`
 * (`position: fixed`, filling the viewport, a sibling of `#app` per `global.scss`'s own stacking
 * comment). That is not a Playwright quirk: `elementFromPoint`-style hit-testing skips a
 * `pointer-events: none` ancestor in a real browser exactly as it does in a driven one, so a real
 * child tapping "Explore" on a fresh install - kid mode ships on by default - would have had the
 * tap swallowed by an empty map canvas and nothing on screen would ever have responded. Found by
 * three screenshot captures timing out with Playwright naming the interceptor outright:
 * "<div id=map-container> intercepts pointer events".
 *
 * `.wl-kid__map` below is the one deliberate exception - see its own comment.
 */
.wl-kid {
    display: flex;
    gap: 14px;
    height: 100%;
    padding: 14px;
    background: rgb(var(--v-theme-background));
    font-family: var(--wl-kid-font);
    pointer-events: auto;
}
.wl-kid__pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: var(--wl-kid-radius-lg);
    background: rgb(var(--v-theme-surface));
    /*
     * Vuetify's own `.v-application` wrapper sets the WHOLE app's default text colour to
     * `on-background` - white, in kid mode's scheme, because `background` is the dark navy the rail
     * sits on. Every element inside this pane that draws text or an icon without its own explicit
     * `color` (the catalogue tile labels, the "what this app is doing" row, panel headings, the
     * child's own name in the status header, ...) was inheriting that ambient white straight through
     * onto this pane's light surfaces - not a loading skeleton and not deliberate styling, just
     * unreadable white-on-near-white. One `color` here, on the one ancestor every kid-mode screen
     * shares, is what every un-coloured descendant should have been inheriting from the start; see
     * `KidShell.paneColor.test.ts` for the guard, and its own doc comment for why a real packaged-app
     * screenshot caught this and this project's own unit suite never had - jsdom does not render real
     * CSS custom-property cascade and inheritance the way a browser paints one.
     */
    color: rgb(var(--v-theme-on-surface));
}
.wl-kid__status {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 16px;
    background: rgb(var(--v-theme-surface-container-lowest));
    border-bottom: 3px solid rgb(var(--v-theme-outline-variant));
}
.wl-kid__level,
.wl-kid__chip {
    min-height: var(--wl-kid-target-min);
    padding: 0 16px;
    border: 0;
    border-radius: var(--wl-kid-radius-full);
    font: inherit;
    font-weight: 800;
    font-size: 18px;
    cursor: pointer;
}
.wl-kid__level { background: rgb(var(--v-theme-tertiary-container)); color: rgb(var(--v-theme-on-tertiary-container)); }
.wl-kid__chip--go { background: rgb(var(--v-theme-secondary-container)); color: rgb(var(--v-theme-on-secondary-container)); }
.wl-kid__chip--problem { background: rgb(var(--v-theme-error-container)); color: rgb(var(--v-theme-on-error-container)); }
.wl-kid__xp { width: 240px; height: 18px; border-radius: 9px; background: rgb(var(--v-theme-surface-variant)); overflow: hidden; }
.wl-kid__xp-fill { height: 100%; background: rgb(var(--v-theme-primary)); }
.wl-kid__spacer { flex: 1; }
/*
 * The one view in this shell that must stay click-through, and for the same reason the adult
 * shell's own `.mb-shell-layer--map` does: the `#map` slot rendered inside it is the identical
 * `.mb-map-page` markup `App.vue` gives the adult tree - the live WebGL canvas is a `#map-container`
 * sibling of `#app` underneath it, never a child of this element, and a child dragging the map with
 * a finger needs that drag to reach the canvas rather than stop at this transparent pane. Every
 * floating control the slot actually draws (`ZoomButtons`, `ControlBar`, `MainMenu`, the free-flight
 * arrows) already declares its own `pointer-events: auto` - `.mb-interactive` or an equivalent
 * explicit rule in each of those components' own files - which is what keeps them pressable while
 * everything else here reverts to the ambient `none` this override restores. Removing this line
 * would not break kid mode's own chrome (the `.wl-kid` rule above already covers that); it would
 * make the map itself impossible to pan wherever no floating control happens to be drawn.
 */
.wl-kid__map { flex: 1; min-height: 0; position: relative; pointer-events: none; }
</style>
