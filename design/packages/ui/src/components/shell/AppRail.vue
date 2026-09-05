<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiBellOutline,
    mdiBriefcaseOutline,
    mdiCogOutline,
    mdiDotsHorizontal,
    mdiHomeOutline,
    mdiMagnify,
    mdiMapOutline,
    mdiServerOutline,
} from "@mdi/js";
import { VIcon, VMenu, VTooltip } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import type { RailDestination } from "./featureTargets.js";
import {
    computeRailShortcutSplit,
    RAIL_MORE_BUTTON_PX,
    RAIL_SHORTCUT_ITEM_PX,
    RAIL_SHORTCUTS_DIVIDER_PX,
} from "./railOverflow.js";
import { nonNegativeInteger } from "./shellNumbers.js";

/**
 * The four core destinations, plus direct-open shortcuts to a handful of frequently reached
 * jobs, and the three footer actions - on an 80 px column that is on screen no matter what the
 * person is doing.
 *
 * ### Four destinations, not four items
 *
 * An earlier version of this component's doc comment said the rail holds exactly four
 * destinations and treated that as the reason it never grows. That was conflating two different
 * things: `RailDestination` (home/map/host/work) names which *top-level screen* is showing, and
 * is deliberately narrow, because widening it would mean every catalogue feature could become "a
 * screen the shell has to know how to switch to" - the trap this component's own history already
 * warns about for a *fourth rail destination*. A **shortcut** is a different, smaller claim: it
 * is a one-click path straight to a job that already lives in Work, exactly what the command
 * palette's own "open a page" row already does, just anchored where a person's eye already is.
 * Adding shortcuts costs nothing in the destination model; adding a destination would.
 *
 * `jobShortcuts` is that list - Der Machine rendering, Docker hosting, SSH remote hosting,
 * Chunker, Backups, Minecraft servers and the world downloader, at the time this was written -
 * and clicking one emits `openJob`, which the shell answers exactly as it answers the palette's
 * own open-page route: switch to Work, ensure the job's tab exists, reveal it. Nothing here
 * decides *which* jobs are worth a shortcut; that list lives in `App.vue`, one level up, next to
 * every other place a job id is named.
 *
 * ### It emits, and owns nothing
 *
 * No overlay state, no job list, no store. The rail says "Work was pressed" or "open this job"
 * and the shell decides what that means, exactly as `App.vue` already makes the command palette
 * work. A rail that opened the settings drawer itself would be a second place that knows how
 * settings opens, and the two would drift.
 *
 * ### Why these are buttons and not floating actions
 *
 * The pre-rewrite shell had four round buttons floating over the content: settings, the options
 * editor, the licence panel and the welcome panel. Two of them were for surfaces most people open
 * once. They are gone, and their destinations live here in the footer, as ordinary buttons in an
 * ordinary column - which is the difference between chrome and litter. Nothing in this component
 * is positioned absolutely over anything.
 *
 * ### Badges say the number, and also say it in words
 *
 * The Work badge is the count of open jobs and the bell badge is the count of unread notices.
 * Both are visual, both are compact past 99, and both put the full number in the accessible name -
 * because "99+" read aloud is not a count, and a badge that only exists as a coloured dot is
 * colour carrying meaning on its own.
 */
const props = withDefaults(
    defineProps<{
        destination: RailDestination;
        /** From the tab workspace itself, never from a second copy of it. */
        openJobCount: number;
        /** From the existing notice store. */
        unreadCount: number;
        /** The user's own chosen name for this application, or the shipped one. */
        productName: string;
        /** The palette's real chord, so the tooltip cannot drift from the binding. */
        paletteShortcut?: string;
        /**
         * The DOM id the notification history anchors to.
         *
         * Passed in rather than generated here so the shell can hand the same id to the panel: an
         * anchored panel needs a stable selector for the control that opens it, and a control that
         * generated its own id would be one the panel could never find.
         */
        notificationsActivatorId?: string;
        /** The panel controlled by the notification disclosure button. */
        notificationsPanelId?: string;
        notificationsOpen?: boolean;
        /** The settings disclosure button and the docked panel it controls. */
        settingsActivatorId?: string;
        settingsPanelId?: string;
        settingsOpen?: boolean;
        /**
         * Direct-open shortcuts to jobs that already live in Work, rendered below the four core
         * destinations. Not a fifth `RailDestination` - see the doc comment above - just a
         * one-click path to a job id the shell already knows how to reveal.
         */
        jobShortcuts?: readonly { id: string; icon: string; label: string; shortLabel: string }[];
    }>(),
    {
        paletteShortcut: "Ctrl+Shift+F",
        notificationsActivatorId: "",
        notificationsPanelId: "",
        notificationsOpen: false,
        settingsActivatorId: "",
        settingsPanelId: "",
        settingsOpen: false,
        jobShortcuts: () => [],
    },
);

const emit = defineEmits<{
    select: [destination: RailDestination];
    /** A job shortcut was pressed; the shell answers exactly as it answers the palette's own
     *  open-page route. */
    openJob: [jobId: string];
    openPalette: [];
    /**
     * One user press changes this state exactly once. The panel still owns its overlay and its
     * anchor, but the rail owns the press: relying on an overlay's selector activator left the
     * real bell inert in the packaged application even though it happened to work in isolated
     * markup. `NotificationPanel` turns off the overlay's automatic activator click, so this
     * event cannot race a second toggle.
     */
    toggleNotifications: [];
    openSettings: [];
}>();

const { t } = useI18n();

const openJobCount = computed(() => nonNegativeInteger(props.openJobCount));
const unreadCount = computed(() => nonNegativeInteger(props.unreadCount));

interface RailItem {
    readonly id: RailDestination;
    readonly icon: string;
    readonly label: string;
    readonly badge: number;
    readonly badgeLabel: string;
}

const items = computed<readonly RailItem[]>(() => [
    {
        id: "home",
        icon: mdiHomeOutline,
        label: t("rail.home", "Home"),
        badge: 0,
        badgeLabel: "",
    },
    {
        id: "map",
        icon: mdiMapOutline,
        label: t("rail.map", "Map"),
        badge: 0,
        badgeLabel: "",
    },
    {
        id: "host",
        icon: mdiServerOutline,
        label: t("rail.host", "Host Server"),
        badge: 0,
        badgeLabel: "",
    },
    {
        id: "work",
        icon: mdiBriefcaseOutline,
        label: t("rail.work", "Work"),
        badge: openJobCount.value,
        badgeLabel:
            openJobCount.value === 0
                ? ""
                : t(
                      "rail.work.openJobs",
                      { count: String(openJobCount.value) },
                      "{count} jobs open",
                  ),
    },
]);

/** Compact past ninety-nine, because the pill is 56 px wide and a four-digit badge is a smear. */
function compact(count: number): string {
    const safe = nonNegativeInteger(count);
    return safe > 99 ? "99+" : String(safe);
}

const unreadLabel = computed(() =>
    unreadCount.value === 0
        ? t("rail.notifications", "Notifications")
        : t(
              "rail.notifications.unread",
              { count: String(unreadCount.value) },
              "Notifications, {count} unread",
          ),
);

/**
 * Real measured heights driving `computeRailShortcutSplit`, so the four destinations can never
 * be pushed out of view by however many shortcuts happen to be configured.
 *
 * Regression: v2-08-rail-7-jobs-1280x800-dark.png showed the whole rail as one scrolling column
 * with the destinations scrolled out of the visible area and every shortcut label wrapping
 * three to five lines inside the 80px column. The fix has two parts - compact, single-line
 * shortcut rows (see `.wl-rail-label--compact` below) so each one is a fixed, small height
 * rather than an unbounded multi-line one, and this measurement so the exact number that fits
 * is computed from the real rendered rail rather than assumed.
 *
 * `ResizeObserver` is guarded because jsdom (this suite's unit-test environment) does not
 * implement it by default; every mounted test either stubs it or never receives a resize
 * callback, so `shortcutSplit` below falls back to "show everything" until the first real
 * measurement lands - the same safe default a server-rendered or not-yet-painted rail needs.
 */
const railEl = ref<HTMLElement | null>(null);
const destinationsEl = ref<HTMLElement | null>(null);
const footerEl = ref<HTMLElement | null>(null);
const measuredAvailable = ref<number | null>(null);
const measuredDestinations = ref<number | null>(null);
const measuredFooter = ref<number | null>(null);

let railObserver: ResizeObserver | null = null;

/**
 * `destinationsEl`'s and `footerEl`'s own `getBoundingClientRect().height` were the first cut
 * here, and a real running build (not jsdom) proved them wrong by a consistent 46px at both
 * 800px and 600px window heights - `.wl-rail`'s own 26px of top/bottom padding, plus the
 * shortcuts divider's 17px of margin/padding/border, sit between those two elements and the
 * rail's edges, and neither element's own height includes space it does not occupy. Measuring
 * the *distance from the rail's edges* instead - `destinationsRect.bottom - railRect.top` and
 * `railRect.bottom - footerRect.top` - folds the rail's own padding into the number
 * automatically, because that padding is exactly the gap between the rail's edge and the first
 * child's edge. The divider is still a fixed, separately-known cost (`RAIL_SHORTCUTS_DIVIDER_PX`),
 * spent only when at least one shortcut is going to render at all.
 */
function measureRail(): void {
    const rail = railEl.value;
    const destinations = destinationsEl.value;
    const footer = footerEl.value;
    if (rail === null || destinations === null || footer === null) {
        measuredAvailable.value = null;
        measuredDestinations.value = null;
        measuredFooter.value = null;
        return;
    }
    const railRect = rail.getBoundingClientRect();
    const destinationsRect = destinations.getBoundingClientRect();

    // The footer's own HEIGHT, never its position. `.wl-rail__footer`'s `margin-block-start:
    // auto` only pushes it flush against the rail's bottom edge when there is room left to push
    // it there - the moment shortcuts overflow, the footer is wherever the overflow left it, and
    // `railRect.bottom - footerRect.top` stops meaning "the footer's height" and starts meaning
    // garbage (it went negative in the exact case this function exists to prevent). Real bug,
    // found only by measuring a real running build: this function decided "everything fits"
    // once, before the footer had anywhere honest left to be, and stayed wrong forever after -
    // the fixed point of using a rendered result to justify the render that produced it.
    measuredDestinations.value = destinationsRect.bottom - railRect.top;
    measuredAvailable.value = rail.clientHeight;
    measuredFooter.value =
        footer.getBoundingClientRect().height +
        ((props.jobShortcuts ?? []).length > 0 ? RAIL_SHORTCUTS_DIVIDER_PX : 0);
}

onMounted(() => {
    measureRail();
    if (typeof ResizeObserver !== "undefined" && railEl.value !== null) {
        railObserver = new ResizeObserver(() => measureRail());
        railObserver.observe(railEl.value);
    }
});

onBeforeUnmount(() => {
    railObserver?.disconnect();
    railObserver = null;
});

const shortcutSplit = computed(() => {
    const shortcuts = props.jobShortcuts ?? [];
    if (
        measuredAvailable.value === null ||
        measuredDestinations.value === null ||
        measuredFooter.value === null
    ) {
        return { visibleCount: shortcuts.length, overflowCount: 0, showMore: false };
    }
    return computeRailShortcutSplit({
        availableBlockSize: measuredAvailable.value,
        destinationsBlockSize: measuredDestinations.value,
        footerBlockSize: measuredFooter.value,
        shortcutItemBlockSize: RAIL_SHORTCUT_ITEM_PX,
        moreButtonBlockSize: RAIL_MORE_BUTTON_PX,
        shortcutCount: shortcuts.length,
    });
});

const visibleShortcuts = computed(() =>
    (props.jobShortcuts ?? []).slice(0, shortcutSplit.value.visibleCount),
);
const overflowShortcuts = computed(() =>
    (props.jobShortcuts ?? []).slice(shortcutSplit.value.visibleCount),
);

/**
 * The "More" menu: an anchored, searchable list for whatever shortcuts did not fit, per the
 * house rule that every list-shaped surface gets its own search with an anchored regex builder.
 * `ConfigSearchField` is the shared component every other search-with-regex-builder field in
 * this application already uses; reusing it here rather than writing a second one is the point.
 */
const moreOpen = ref(false);
const moreQuery = ref("");
const moreRegex = ref(false);
const moreFlags = ref("i");
const moreButtonRef = ref<HTMLElement | null>(null);

const filteredOverflow = computed(() => {
    const matcher = createSettingMatcher(moreQuery.value, moreRegex.value, moreFlags.value);
    if (matcher.error !== null || moreQuery.value === "") return overflowShortcuts.value;
    return overflowShortcuts.value.filter((item) => matcher.test(item.label));
});

function selectFromMore(jobId: string): void {
    emit("openJob", jobId);
    moreOpen.value = false;
}

function onMoreMenuChange(open: boolean): void {
    if (open) return;
    moreQuery.value = "";
    // Vuetify's own activator-focus-return is not guaranteed across every close path (Escape,
    // an outside click, a selection): returning focus explicitly is what actually keeps the
    // "More" button reachable by keyboard immediately after closing, rather than dropping focus
    // to the document body.
    void nextTick(() => moreButtonRef.value?.focus());
}
</script>

<template>
    <!--
        A labelled landmark rather than a bare column of buttons, so a screen reader can jump
        straight to it and say what it is. The product name is in the label because a person
        running two of these applications side by side hears which one they are in.
    -->
    <nav
        ref="railEl"
        class="wl-rail"
        :aria-label="t('rail.label', { product: productName }, '{product} navigation')"
    >
        <!--
            `data-tutorial-anchor` on each destination button because the interactive tour
            highlights real controls by selector, and two of its steps are about the map - which
            is one of these buttons now rather than a tab in the strip. `TabStrip.vue` carries the
            same attribute on a tab button, spelled `tab-<pageId>`; these are `rail-<destination>`
            so the two namespaces cannot collide, and `tutorialAnchors.test.ts` is what proves
            every step still resolves the control it names.
        -->
        <ul ref="destinationsEl" class="wl-rail__items">
            <li v-for="item in items" :key="item.id">
                <button
                    type="button"
                    class="wl-rail-item mb-interactive"
                    :class="{ 'wl-rail-item--active': destination === item.id }"
                    :aria-current="destination === item.id ? 'page' : undefined"
                    :aria-label="
                        item.badgeLabel === '' ? undefined : `${item.label}, ${item.badgeLabel}`
                    "
                    :data-destination="item.id"
                    :data-tutorial-anchor="`rail-${item.id}`"
                    @click="emit('select', item.id)"
                >
                    <span class="wl-rail-pill">
                        <v-icon :icon="item.icon" size="22" />
                        <!--
                            aria-hidden because the full count is already in the button's own
                            accessible name above: "99+" announced on its own is not a number, and
                            announcing both would say the count twice.
                        -->
                        <span v-if="item.badge > 0" class="wl-rail-badge" aria-hidden="true">
                            {{ compact(item.badge) }}
                        </span>
                    </span>
                    <!--
                        The label is visible, always. An icon-only rail is a rail people learn by
                        trial and error, and the 80 px column exists precisely so it does not have
                        to be.
                    -->
                    <span class="wl-rail-label">{{ item.label }}</span>
                </button>
            </li>
        </ul>

        <!--
            Direct-open job shortcuts. Same button markup, same 48px target, same accessible
            name pattern as the four destinations above - the only difference is what pressing
            one does (`openJob`, not `select`), and that none of them is ever "active" the way a
            destination is, because the rail does not track which job is on top in Work.
        -->
        <ul v-if="visibleShortcuts.length > 0" class="wl-rail__items wl-rail__shortcuts">
            <li v-for="item in visibleShortcuts" :key="item.id">
                <button
                    type="button"
                    class="wl-rail-item wl-rail-item--compact mb-interactive"
                    :aria-label="item.label"
                    :data-job-shortcut="item.id"
                    :data-tutorial-anchor="`rail-job-${item.id}`"
                    @click="emit('openJob', item.id)"
                >
                    <span class="wl-rail-pill">
                        <v-icon :icon="item.icon" size="22" />
                    </span>
                    <!--
                        The visible label is the short form and stays on one line - the
                        regression this fixes was a bilingual label ("Get a world off a server
                        由伺服器攞返個世界") wrapping five lines inside an 80px column. The full
                        form is never lost: it is the button's own accessible name above, and a
                        tooltip repeats it for a sighted pointer user who wants the long version.
                    -->
                    <span class="wl-rail-label wl-rail-label--compact">{{ item.shortLabel }}</span>
                    <v-tooltip activator="parent" location="end" :text="item.label" />
                </button>
            </li>
            <li v-if="shortcutSplit.showMore">
                <button
                    ref="moreButtonRef"
                    type="button"
                    class="wl-rail-item wl-rail-item--compact mb-interactive"
                    :aria-label="
                        t(
                            'rail.moreShortcuts',
                            { count: String(overflowShortcuts.length) },
                            'More shortcuts ({count})',
                        )
                    "
                    aria-haspopup="menu"
                    :aria-expanded="moreOpen ? 'true' : 'false'"
                    data-rail-more
                    @click="moreOpen = true"
                >
                    <span class="wl-rail-pill">
                        <v-icon :icon="mdiDotsHorizontal" size="22" />
                    </span>
                    <span class="wl-rail-label wl-rail-label--compact">{{ t("rail.more", "More") }}</span>
                </button>
                <v-menu
                    v-model="moreOpen"
                    :activator="moreButtonRef ?? undefined"
                    location="end"
                    :close-on-content-click="false"
                    @update:model-value="onMoreMenuChange"
                >
                    <div
                        class="wl-rail-more-menu"
                        role="menu"
                        :aria-label="t('rail.moreShortcuts.title', 'More shortcuts')"
                    >
                        <ConfigSearchField
                            v-model="moreQuery"
                            v-model:regex="moreRegex"
                            v-model:flags="moreFlags"
                            :label="t('rail.moreShortcuts.search', 'Filter shortcuts')"
                            density="compact"
                            :sample="overflowShortcuts.map((item) => item.label).join('\n')"
                        />
                        <ul class="wl-rail-more-menu__list">
                            <li v-for="item in filteredOverflow" :key="item.id">
                                <button
                                    type="button"
                                    class="wl-rail-more-menu__item mb-interactive"
                                    :data-job-shortcut="item.id"
                                    @click="selectFromMore(item.id)"
                                >
                                    <v-icon :icon="item.icon" size="20" />
                                    <span>{{ item.label }}</span>
                                </button>
                            </li>
                            <li v-if="filteredOverflow.length === 0" class="wl-rail-more-menu__empty">
                                {{ t("rail.moreShortcuts.empty", "No shortcuts match.") }}
                            </li>
                        </ul>
                    </div>
                </v-menu>
            </li>
        </ul>

        <div ref="footerEl" class="wl-rail__footer">
            <button
                type="button"
                class="wl-rail-action mb-interactive"
                :aria-label="
                    t(
                        'rail.search',
                        { shortcut: paletteShortcut },
                        'Search everything ({shortcut})',
                    )
                "
                aria-haspopup="dialog"
                @click="emit('openPalette')"
            >
                <v-icon :icon="mdiMagnify" size="22" />
                <v-tooltip
                    activator="parent"
                    location="end"
                    :text="
                        t(
                            'rail.search',
                            { shortcut: paletteShortcut },
                            'Search everything ({shortcut})',
                        )
                    "
                />
            </button>

            <!--
                This is the one opener for the anchored notification history. The panel keeps the
                bell as its geometry anchor, but it does not also bind its own automatic click to
                that anchor: one click reaches this event, the shell flips `notificationsOpen`, and
                the panel reflects that same value back through `aria-expanded`. The command
                palette remains a separate, explicit reveal route in `NotificationPanel`.
            -->
            <button
                :id="notificationsActivatorId === '' ? undefined : notificationsActivatorId"
                type="button"
                class="wl-rail-action mb-interactive"
                :aria-label="unreadLabel"
                :aria-expanded="notificationsOpen ? 'true' : 'false'"
                :aria-controls="notificationsPanelId === '' ? undefined : notificationsPanelId"
                aria-haspopup="dialog"
                @click="emit('toggleNotifications')"
            >
                <span class="wl-rail-action__icon">
                    <v-icon :icon="mdiBellOutline" size="22" />
                    <span v-if="unreadCount > 0" class="wl-rail-badge" aria-hidden="true">
                        {{ compact(unreadCount) }}
                    </span>
                </span>
                <v-tooltip activator="parent" location="end" :text="unreadLabel" />
            </button>

            <button
                :id="settingsActivatorId === '' ? undefined : settingsActivatorId"
                type="button"
                class="wl-rail-action mb-interactive"
                :aria-label="t('settings.title', 'Settings')"
                :aria-expanded="settingsOpen ? 'true' : 'false'"
                :aria-controls="settingsPanelId === '' ? undefined : settingsPanelId"
                aria-haspopup="dialog"
                @click="emit('openSettings')"
            >
                <v-icon :icon="mdiCogOutline" size="22" />
                <v-tooltip
                    activator="parent"
                    location="end"
                    :text="t('settings.title', 'Settings')"
                />
            </button>
        </div>
    </nav>
</template>

<style scoped>
/*
 * 80 px at every supported width, including 800. It is a fixed column rather than a flexible one
 * on purpose: a rail that shrank on a narrow window would clip its own labels, and the labels are
 * the reason it is 80 rather than 56.
 */
.wl-rail {
    display: flex;
    flex-direction: column;
    inline-size: 80px;
    min-inline-size: 80px;
    flex: 0 0 80px;
    /* The prototype prints 14/12 and a 2px gap, and the difference from a symmetric 12 is
     * visible: the first pill sits one notch lower than the title bar bottom edge. */
    padding: 14px 0 12px;
    background: rgb(var(--v-theme-surface));
    border-inline-end: 1px solid rgb(var(--v-theme-outline-variant));
    overflow-y: auto;
    overflow-x: hidden;
}

.wl-rail__items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

/* A visible seam between the four core destinations and the job shortcuts beneath them, so the
 * two groups read as different kinds of thing rather than one undifferentiated list. */
.wl-rail__shortcuts {
    margin-block-start: 8px;
    padding-block-start: 8px;
    border-block-start: 1px solid rgb(var(--v-theme-outline-variant));
}

.wl-rail__footer {
    margin-block-start: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding-block-start: 12px;
}

/* 48 px minimum target, met by the padding rather than by a fixed height that would clip a
   two-line label in bilingual mode. */
.wl-rail-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    inline-size: 100%;
    min-block-size: 48px;
    padding: 4px 2px;
    background: none;
    border: 0;
    cursor: pointer;
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-rail-pill {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 56px;
    block-size: 32px;
    border-radius: var(--md-sys-shape-corner-full, 9999px);
    transition:
        background-color var(--md-sys-motion-duration-short2, 100ms)
            var(--md-sys-motion-easing-standard, ease),
        color var(--md-sys-motion-duration-short2, 100ms) var(--md-sys-motion-easing-standard, ease);
}

.wl-rail-item--active .wl-rail-pill {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

.wl-rail-item--active .wl-rail-label {
    color: rgb(var(--v-theme-on-surface));
    font-weight: 600;
}

.wl-rail-item:hover .wl-rail-pill {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.wl-rail-item--active:hover .wl-rail-pill {
    background: rgb(var(--v-theme-primary-container));
}

/*
 * The label wraps rather than truncating. Bilingual mode renders two languages in this space and
 * the longest of them is what decides whether this rail clips - so it is allowed to grow.
 */
.wl-rail-label {
    /*
     * 11px with 0.04em tracking, from the prototype. A label this small needs the tracking or it
     * reads as a smudge at 100% scale, and the weight is what keeps it legible against the pill
     * above it rather than looking like a caption that fell off something.
     */
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    line-height: 1.25;
    text-align: center;
    inline-size: 100%;
    overflow-wrap: anywhere;
    /* Two lines, never more. A bilingual destination label wraps once and stops; the shortcuts
     * below skip wrapping entirely (see `--compact`) rather than needing this clamp at all. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

/*
 * A shortcut row: icon beside a single-line label rather than icon-over-wrapped-label, and a
 * fixed 48px height (`RAIL_SHORTCUT_ITEM_PX` in railOverflow.ts - the two must agree, because
 * the overflow arithmetic assumes every shortcut costs exactly this many pixels). The full
 * bilingual name never disappears - it is the button's `aria-label` and its tooltip - this is
 * only the on-screen text, which regression v2-08 showed wrapping five lines when it was the
 * long form.
 */
.wl-rail-item--compact {
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    block-size: 48px;
    min-block-size: 48px;
    gap: 6px;
    /* Deliberately tighter than the destinations' 4px-2px padding above: an 80px column has
     * very little room left for a readable label once an icon and its own padding are paid
     * for, and the label - not the icon - is the thing this compact row exists to show. */
    padding-inline: 6px;
}

.wl-rail-item--compact .wl-rail-pill {
    /* No pill capsule for a compact row - it is decorative weight the 80px column cannot
     * afford here, and removing it is most of the width the label gets back. */
    background: none !important;
    inline-size: 22px;
    block-size: 22px;
    flex: 0 0 auto;
}

.wl-rail-label--compact {
    text-align: start;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    inline-size: auto;
    min-inline-size: 0;
    flex: 1 1 auto;
    /* Overrides the two-line clamp above: a compact row is one line, full stop, by design. */
    display: block;
    -webkit-line-clamp: unset;
}

/*
 * The "More" menu's own anchored panel - a bounded, scrollable list with its own search field
 * and regex builder (via `ConfigSearchField`), per the house rule that a search field never
 * ships without one.
 */
.wl-rail-more-menu {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    min-inline-size: 240px;
    max-inline-size: 320px;
    max-block-size: 360px;
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    border-radius: var(--md-sys-shape-corner-medium, 12px);
}

.wl-rail-more-menu__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
}

.wl-rail-more-menu__item {
    display: flex;
    align-items: center;
    gap: 10px;
    inline-size: 100%;
    min-block-size: 44px;
    padding: 8px 10px;
    border: 0;
    border-radius: var(--md-sys-shape-corner-small, 8px);
    background: none;
    color: rgb(var(--v-theme-on-surface));
    text-align: start;
    cursor: pointer;
}

.wl-rail-more-menu__item:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.wl-rail-more-menu__empty {
    padding: 8px 10px;
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: 0.875rem;
}

.wl-rail-action {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 48px;
    block-size: 48px;
    border: 0;
    /*
     * 14px, not a full pill. A full radius on a 48px square is a circle, and a circle in a corner
     * is exactly the floating-button shape this rewrite removed - the footer actions have to read
     * as part of the rail rather than as three FABs that happened to line up.
     */
    border-radius: 14px;
    background: none;
    cursor: pointer;
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-rail-action:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.wl-rail-action__icon {
    position: relative;
    display: grid;
    place-items: center;
}

.wl-rail-badge {
    position: absolute;
    inset-block-start: -6px;
    inset-inline-end: -12px;
    min-inline-size: 16px;
    block-size: 16px;
    padding-inline: 3px;
    display: grid;
    place-items: center;
    border-radius: var(--md-sys-shape-corner-full, 9999px);
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
    font-size: 0.625rem;
    font-weight: 700;
    line-height: 16px;
}

/*
 * The bell badge is an error colour in the prototype where the Work badge is primary, and that is
 * a real distinction rather than a palette slip. The Work badge counts things you opened; the bell
 * counts things that happened to you. One is neutral information and the other wants an eye.
 */
.wl-rail-action .wl-rail-badge {
    background: rgb(var(--v-theme-error-container, var(--v-theme-error)));
    color: rgb(var(--v-theme-on-error-container, var(--v-theme-on-error)));
}

/*
 * Contrast is literal on the rewrite chrome: every readable rail state stays at 21:1.
 * A normal M3 state layer is deliberately translucent, but white at 8% over the contrast
 * surface turns the background grey and makes its white icon fall short of that exact promise.
 * Use the existing inverse container pair for interactive feedback instead; no new colour is
 * introduced and the state remains visible.
 */
:global(.v-theme--contrast) .wl-rail-item:hover .wl-rail-pill,
:global(.v-theme--contrast) .wl-rail-action:hover,
:global(.v-theme--contrast) .wl-rail-action .wl-rail-badge {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

/* Visible focus in all three themes, using the existing focus role rather than a new colour. */
.wl-rail-item:focus-visible,
.wl-rail-action:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

/* This stays last so every transition introduced by the rail is covered. */
@media (prefers-reduced-motion: reduce) {
    .wl-rail-pill {
        transition: none;
    }
}
</style>
