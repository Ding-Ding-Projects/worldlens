<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiBellOutline,
    mdiBriefcaseOutline,
    mdiChevronDoubleLeft,
    mdiChevronDoubleRight,
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
    isCompactRail,
    RAIL_EXPANDED_SHORTCUT_ITEM_PX,
    RAIL_MORE_BUTTON_PX,
    RAIL_SHORTCUT_ITEM_PX,
    RAIL_SHORTCUTS_DIVIDER_PX,
} from "./railOverflow.js";
import type { RailMode } from "./railPrefs.js";
import { nonNegativeInteger } from "./shellNumbers.js";
import { restoreRailMenuFocus } from "./railMenuFocus.js";

/**
 * The four core destinations, plus direct-open shortcuts to a handful of frequently reached
 * jobs, and the footer actions. Two persisted widths (see `railPrefs.ts`):
 *
 *  - **expanded** (the default): a 208 px extended navigation rail. Destinations are 48 px pill
 *    rows with icon and full label, the active one on `secondary-container`; a divider and a
 *    small "Jobs" section label head the job shortcuts, which are 40 px single-line rows.
 *  - **compact**: the 80 px icon rail, icons over short labels.
 *
 * No label in either mode ever wraps. A label too long for its row ends in an ellipsis, and the
 * full text is always the control's accessible name and its tooltip or `title`. A short window
 * still switches to the 192 px grid below, whichever width was chosen, keeping targets and the
 * overflow route reachable without a taller window.
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
 * `jobShortcuts` is that list - GitHub Actions rendering, Docker hosting, SSH remote hosting,
 * Chunker, Backups, Minecraft servers and the world downloader, at the time this was written -
 * and clicking one emits `openJob`, which the shell answers exactly as it answers the palette's
 * own open-page route: switch to Work, ensure the job's tab exists, reveal it. Nothing here
 * decides *which* jobs are worth a shortcut; that list lives in `App.vue`, one level up, next to
 * every other place a job id is named.
 *
 * ### It emits, and owns nothing
 *
 * No application overlay state, job ownership or store. The rail says "Work was pressed" or "open this job"
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
        /** Expanded (full labels) or compact (80 px icon rail). The shell owns the preference. */
        mode?: RailMode;
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
        mode: "expanded",
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
    /** The footer's expand/collapse toggle was pressed; the shell flips the stored preference. */
    toggleMode: [];
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
 * Measure real content, including translated labels, rather than treating an estimated row
 * height as a maximum. Until layout is available, retain the ordinary unmeasured fallback.
 * The short-height layout uses a separate destination scroller and a pinned utility row.
 */
const railEl = ref<HTMLElement | null>(null);
const destinationsEl = ref<HTMLElement | null>(null);
const footerEl = ref<HTMLElement | null>(null);
const shortcutsEl = ref<HTMLElement | null>(null);
const sectionLabelEl = ref<HTMLElement | null>(null);
const measuredAvailable = ref<number | null>(null);
const measuredDestinations = ref<number | null>(null);
const measuredFooter = ref<number | null>(null);
/** The unmeasured cost of one shortcut row in the width the rail is currently drawn at. */
function baseShortcutItem(): number {
    return props.mode === "compact" ? RAIL_SHORTCUT_ITEM_PX : RAIL_EXPANDED_SHORTCUT_ITEM_PX;
}
const measuredShortcutItem = ref(baseShortcutItem());
const measuredMoreButton = ref(RAIL_MORE_BUTTON_PX);
const compactRail = computed(() => isCompactRail(measuredAvailable.value ?? 0));

/**
 * The extended rail is drawn only when it was chosen *and* the window is tall enough for the
 * ordinary column. A short window keeps its own 192 px grid in either mode, because that grid
 * already shows every destination label in full.
 */
const expanded = computed(() => props.mode !== "compact" && !compactRail.value);

const jobsLabelId = `wl-rail-jobs-${useId()}`;
const toggleLabel = computed(() =>
    props.mode === "compact"
        ? t("rail.expand", "Expand navigation")
        : t("rail.collapse", "Collapse navigation"),
);

let railObserver: ResizeObserver | null = null;

/**
 * Measure the footer's height, never its position: overflow can move its top below the rail.
 * clientHeight includes rail padding, so reserve its bottom padding explicitly. A scrolled
 * destination rect needs scrollTop added back or scrolling would create imaginary free space.
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

    const style = getComputedStyle(rail);
    const bottomPadding = Math.max(0, Number.parseFloat(style.paddingBlockEnd) || 0);
    measuredAvailable.value = rail.clientHeight;
    measuredDestinations.value = destinationsRect.bottom - railRect.top + rail.scrollTop;
    // The divider is paid once whenever a shortcut renders. The extended rail also carries the
    // "Jobs" section label above its shortcuts, measured rather than estimated so a translated
    // or enlarged label is budgeted at the size it really is.
    const sectionLabel = sectionLabelEl.value;
    const dividerCost =
        sectionLabel === null
            ? RAIL_SHORTCUTS_DIVIDER_PX
            : RAIL_SHORTCUTS_DIVIDER_PX + sectionLabel.getBoundingClientRect().height;
    measuredFooter.value =
        footer.getBoundingClientRect().height +
        bottomPadding +
        ((props.jobShortcuts ?? []).length > 0 ? dividerCost : 0);

    // Keep a conservative high-water mark. Forgetting a tall row when it folds into More
    // would immediately make it fit again, causing an endless resize/render oscillation.
    for (const row of shortcutsEl.value?.querySelectorAll<HTMLElement>("[data-job-shortcut]") ??
        []) {
        measuredShortcutItem.value = Math.max(
            measuredShortcutItem.value,
            row.getBoundingClientRect().height + 2,
        );
    }
    if (moreButtonRef.value !== null) {
        measuredMoreButton.value = Math.max(
            measuredMoreButton.value,
            moreButtonRef.value.getBoundingClientRect().height + 2,
        );
    }
}

onMounted(() => {
    measureRail();
    if (typeof ResizeObserver !== "undefined" && railEl.value !== null) {
        railObserver = new ResizeObserver(() => measureRail());
        for (const element of [
            railEl.value,
            destinationsEl.value,
            footerEl.value,
            shortcutsEl.value,
        ]) {
            if (element !== null) railObserver.observe(element);
        }
    }
});

// The list can mount or disappear without changing the outer rail's height.
watch(
    shortcutsEl,
    (element, previous) => {
        if (previous !== null) railObserver?.unobserve(previous);
        if (element !== null) railObserver?.observe(element);
        measureRail();
    },
    { flush: "post" },
);
watch(
    () => props.jobShortcuts.length,
    () => {
        void nextTick(measureRail);
    },
);
// A width change changes every row's height, so the high-water mark starts again from the
// new mode's own row size instead of carrying the other mode's taller rows across.
watch(
    () => props.mode,
    () => {
        measuredShortcutItem.value = baseShortcutItem();
        measuredMoreButton.value = RAIL_MORE_BUTTON_PX;
        void nextTick(measureRail);
    },
);

onBeforeUnmount(() => {
    railObserver?.disconnect();
    railObserver = null;
});

const shortcutSplit = computed(() => {
    const shortcuts = props.jobShortcuts ?? [];
    if (compactRail.value) {
        return { visibleCount: 0, overflowCount: shortcuts.length, showMore: shortcuts.length > 0 };
    }
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
        shortcutItemBlockSize: measuredShortcutItem.value,
        moreButtonBlockSize: measuredMoreButton.value,
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
const moreMenuRef = ref<HTMLElement | null>(null);

const filteredOverflow = computed(() => {
    const matcher = createSettingMatcher(moreQuery.value, moreRegex.value, moreFlags.value);
    if (matcher.error !== null || moreQuery.value === "") return overflowShortcuts.value;
    return overflowShortcuts.value.filter((item) => matcher.test(item.label));
});

function selectFromMore(jobId: string): void {
    emit("openJob", jobId);
    moreOpen.value = false;
}

// Observe the state itself: selection and the activator toggle do not emit VMenu's update
// event. Capture focus before teardown, then respect any focus moved into the newly opened job.
watch(moreOpen, (open, wasOpen) => {
    if (open || !wasOpen) return;
    moreQuery.value = "";
    const menu = moreMenuRef.value;
    const active = railEl.value?.ownerDocument.activeElement ?? null;
    void nextTick(() => {
        if (moreOpen.value) return;
        const target =
            moreButtonRef.value ??
            railEl.value?.querySelector<HTMLElement>("[aria-current='page']") ??
            null;
        restoreRailMenuFocus(menu, target, active);
    });
});
watch(
    () => shortcutSplit.value.showMore,
    (show) => {
        if (!show) moreOpen.value = false;
    },
);
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
        :class="{
            'wl-rail--short': compactRail,
            'wl-rail--expanded': expanded,
            'wl-rail--compact': !expanded && !compactRail,
        }"
        :data-rail-mode="mode"
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
        <ul ref="destinationsEl" class="wl-rail__items wl-rail__destinations">
            <li v-for="item in items" :key="item.id">
                <button
                    type="button"
                    class="wl-rail-item mb-interactive"
                    :class="{ 'wl-rail-item--active': destination === item.id }"
                    :aria-current="destination === item.id ? 'page' : undefined"
                    :aria-label="
                        item.badgeLabel === '' ? undefined : `${item.label}, ${item.badgeLabel}`
                    "
                    :title="item.label"
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
                        The label is visible, always, on one line. An icon-only rail is a rail
                        people learn by trial and error. Too long for its row, it ends in an
                        ellipsis and the full text stays in `title` above.
                    -->
                    <span class="wl-rail-label">{{ item.label }}</span>
                </button>
            </li>
        </ul>

        <!--
            Direct-open job shortcuts. Same accessible name pattern as the destinations above -
            the only difference is what pressing one does (`openJob`, not `select`), and that
            none of them is ever "active" the way a destination is, because the rail does not
            track which job is on top in Work. The extended rail heads them with a small "Jobs"
            section label that also names the list for assistive technology.
        -->
        <div v-if="visibleShortcuts.length > 0 || shortcutSplit.showMore" class="wl-rail__jobs">
            <span
                v-if="expanded"
                :id="jobsLabelId"
                ref="sectionLabelEl"
                class="wl-rail__section-label"
            >
                {{ t("rail.jobs", "Jobs") }}
            </span>
            <ul
                ref="shortcutsEl"
                class="wl-rail__items wl-rail__shortcuts"
                :aria-labelledby="expanded ? jobsLabelId : undefined"
            >
                <li v-for="item in visibleShortcuts" :key="item.id">
                    <button
                        type="button"
                        class="wl-rail-item wl-rail-item--compact mb-interactive"
                        :aria-label="item.label"
                        :title="expanded ? item.label : undefined"
                        :data-job-shortcut="item.id"
                        :data-tutorial-anchor="`rail-job-${item.id}`"
                        @click="emit('openJob', item.id)"
                    >
                        <span class="wl-rail-pill">
                            <v-icon :icon="item.icon" size="18" />
                        </span>
                        <!--
                            The extended rail shows the full job name and the compact rail the
                            dedicated short form; both stay on one line and ellipsize when a
                            translation or a personal-vocabulary replacement is longer than the
                            row. The full name is never lost: it is the button's accessible name
                            and its `title`, and the compact rail adds a tooltip for a pointer.
                        -->
                        <span class="wl-rail-label wl-rail-label--compact">{{
                            expanded ? item.label : item.shortLabel
                        }}</span>
                        <v-tooltip
                            v-if="!expanded"
                            activator="parent"
                            location="end"
                            :text="item.label"
                        />
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
                        @click="moreOpen = !moreOpen"
                    >
                        <span class="wl-rail-pill">
                            <v-icon :icon="mdiDotsHorizontal" size="18" />
                        </span>
                        <span class="wl-rail-label wl-rail-label--compact">{{
                            expanded ? t("rail.moreJobs", "More jobs…") : t("rail.more", "More")
                        }}</span>
                    </button>
                    <!--
                        `target`, never `activator`. An `activator` element makes the overlay
                        bind its own click listener to that same button, and the button already
                        has one: a real pointer click then ran both, so the state went true and
                        straight back to false inside one click and the menu never appeared. A
                        DOM-dispatched click in a unit test happened to survive it, which is why
                        this shipped - the packaged build's own instrumentation recorded the
                        `aria-expanded` sequence true, true, false, false for one press. `target`
                        gives the overlay the same anchor geometry and none of the events, so the
                        button below is the only thing that opens or closes this menu - the exact
                        arrangement `NotificationPanel` already uses for the bell.
                    -->
                    <v-menu
                        v-model="moreOpen"
                        :target="moreButtonRef ?? undefined"
                        location="end"
                        :close-on-content-click="false"
                    >
                        <div
                            ref="moreMenuRef"
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
                                <li
                                    v-if="filteredOverflow.length === 0"
                                    class="wl-rail-more-menu__empty"
                                >
                                    {{ t("rail.moreShortcuts.empty", "No shortcuts match.") }}
                                </li>
                            </ul>
                        </div>
                    </v-menu>
                </li>
            </ul>
        </div>

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

            <!--
                The width preference. A toggle button rather than a disclosure: it changes how
                this navigation is drawn, it does not reveal a panel, so `aria-pressed` carries
                the state ("collapsed" is pressed) and the name says what pressing it will do.
                The same preference is a row in Settings > Display and in the command palette.
                Not drawn in the short-height grid, which is the same 192 px in either mode: a
                toggle there would change nothing visible, and a fourth action would push the
                footer's targets below 44 px. The preference still applies once the window is
                tall enough again, and stays reachable from Settings and the palette meanwhile.
            -->
            <button
                v-if="!compactRail"
                type="button"
                class="wl-rail-action wl-rail-action--mode mb-interactive"
                :aria-label="toggleLabel"
                :aria-pressed="mode === 'compact' ? 'true' : 'false'"
                data-rail-mode-toggle
                @click="emit('toggleMode')"
            >
                <v-icon
                    :icon="mode === 'compact' ? mdiChevronDoubleRight : mdiChevronDoubleLeft"
                    size="22"
                />
                <v-tooltip activator="parent" location="end" :text="toggleLabel" />
            </button>
        </div>
    </nav>
</template>

<style scoped>
/*
 * Two widths, both fixed columns rather than flexible ones, so a narrow window shrinks the
 * content beside the rail rather than crushing its labels: the compact 80 px icon rail and the
 * 208 px extended rail. Short heights switch to the grid further down in either mode, rather
 * than shrinking targets to make an overfull column appear to fit.
 */
.wl-rail {
    display: flex;
    flex-direction: column;
    inline-size: 80px;
    min-inline-size: 80px;
    flex: 0 0 80px;
    min-block-size: 0;
    /* The prototype prints 14/12 and a 2px gap, and the difference from a symmetric 12 is
     * visible: the first pill sits one notch lower than the title bar bottom edge. */
    padding: 14px 0 12px;
    background: rgb(var(--v-theme-surface));
    border-inline-end: 1px solid rgb(var(--v-theme-outline-variant));
    overflow-y: auto;
    overflow-x: hidden;
    transition:
        inline-size var(--md-sys-motion-duration-medium2, 300ms)
            var(--md-sys-motion-easing-emphasized, ease),
        min-inline-size var(--md-sys-motion-duration-medium2, 300ms)
            var(--md-sys-motion-easing-emphasized, ease),
        flex-basis var(--md-sys-motion-duration-medium2, 300ms)
            var(--md-sys-motion-easing-emphasized, ease);
}

.wl-rail--expanded {
    inline-size: 208px;
    min-inline-size: 208px;
    flex: 0 0 208px;
    /* 8px gutters leave exactly 192px: room for four 48px footer actions in one row. */
    padding: 12px 8px;
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
.wl-rail__jobs {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    margin-block-start: 8px;
    padding-block-start: 8px;
    border-block-start: 1px solid rgb(var(--v-theme-outline-variant));
}

/* The extended rail's small uppercase "Jobs" heading, one line like every other label. */
.wl-rail__section-label {
    display: block;
    padding: 8px 16px 4px;
    font-size: var(--md-sys-typescale-label-small-size);
    line-height: var(--md-sys-typescale-label-small-line-height);
    font-weight: var(--md-sys-typescale-label-small-weight);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-on-surface-variant));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.wl-rail__footer {
    margin-block-start: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding-block-start: 12px;
}

/* The extended rail lays its footer actions out as one row of 48 px icon buttons. */
.wl-rail--expanded .wl-rail__footer {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 0;
}

/* 48 px minimum target in the compact rail: icon pill above a single-line label. */
.wl-rail-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    inline-size: 100%;
    min-inline-size: 0;
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
    flex: 0 0 auto;
    border-radius: var(--md-sys-shape-corner-full, 9999px);
    transition:
        background-color var(--md-sys-motion-duration-short2, 100ms)
            var(--md-sys-motion-easing-standard, ease),
        color var(--md-sys-motion-duration-short2, 100ms) var(--md-sys-motion-easing-standard, ease);
}

/* The active indicator is the M3 navigation role, secondary-container. */
.wl-rail-item--active .wl-rail-pill {
    background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}

.wl-rail-item--active .wl-rail-label {
    color: rgb(var(--v-theme-on-surface));
    font-weight: 600;
}

.wl-rail-item:hover .wl-rail-pill {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.wl-rail-item--active:hover .wl-rail-pill {
    background: rgb(var(--v-theme-secondary-container));
}

/*
 * Every rail label is one line. A label too long for its row - a translation, bilingual mode, a
 * personal-vocabulary replacement, a large interface size - ends in an ellipsis rather than
 * growing the row into a second line, and the full text is never lost: it is the control's
 * accessible name and its `title`.
 */
.wl-rail-label {
    /*
     * 11px with 0.04em tracking, from the prototype. A label this small needs the tracking or it
     * reads as a smudge at 100% scale, and the weight is what keeps it legible against the pill
     * above it rather than looking like a caption that fell off something.
     */
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: 500;
    letter-spacing: 0.04em;
    line-height: 1.25;
    text-align: center;
    display: block;
    inline-size: 100%;
    min-inline-size: 0;
    max-inline-size: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/*
 * A compact-rail shortcut row: icon beside its short label, with a 48 px minimum rather than a
 * fixed height. The overflow arithmetic starts with `RAIL_SHORTCUT_ITEM_PX` and raises that
 * budget from actual rows when a large interface size makes the single line taller.
 */
.wl-rail-item--compact {
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    min-block-size: 48px;
    gap: 4px;
    /*
     * 4px padding + an 18px icon + this 4px gap leaves ~50px for the label, which is what the
     * widest of the dedicated short labels in shell.ts needs; `railShortcutLabels.test.ts`
     * enforces the character-count bound that keeps the shipped labels clear of the ellipsis.
     */
    padding-inline: 4px;
}

.wl-rail-item--compact .wl-rail-pill {
    /* No pill capsule for a compact row - it is decorative weight the 80px column cannot
     * afford here, and removing it is most of the width the label gets back. */
    background: none !important;
    inline-size: 18px;
    block-size: 18px;
}

/*
 * The shortcut label: one line, ellipsized, never wrapped. The full job name is the button's
 * accessible name and its tooltip or `title`, so the ellipsis hides nothing a person cannot reach.
 */
.wl-rail-label--compact {
    text-align: start;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    inline-size: auto;
    min-inline-size: 0;
    flex: 1 1 auto;
    display: block;
}

/*
 * The extended rail. Destinations are 48 px full-width pills, icon beside a full label, the
 * whole pill carrying the active indicator; shortcuts are 40 px single-line rows in the same
 * shape with a smaller icon.
 */
.wl-rail--expanded .wl-rail-item {
    flex-direction: row;
    justify-content: flex-start;
    gap: 12px;
    min-block-size: 48px;
    block-size: 48px;
    padding: 0 16px;
    border-radius: var(--md-sys-shape-corner-full, 9999px);
    transition: background-color var(--md-sys-motion-duration-short2, 100ms)
        var(--md-sys-motion-easing-standard, ease);
}

.wl-rail--expanded .wl-rail-item .wl-rail-pill {
    inline-size: 24px;
    block-size: 24px;
    background: none;
}

.wl-rail--expanded .wl-rail-label {
    flex: 1 1 auto;
    text-align: start;
    font-size: var(--md-sys-typescale-label-large-size);
    line-height: var(--md-sys-typescale-label-large-line-height);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
    font-weight: var(--md-sys-typescale-label-large-weight);
}

.wl-rail--expanded .wl-rail-item:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.wl-rail--expanded .wl-rail-item--active,
.wl-rail--expanded .wl-rail-item--active:hover {
    background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}

.wl-rail--expanded .wl-rail-item--active .wl-rail-label {
    color: rgb(var(--v-theme-on-secondary-container));
}

.wl-rail--expanded .wl-rail-item--compact {
    min-block-size: 40px;
    block-size: 40px;
    gap: 12px;
    padding: 0 16px;
}

.wl-rail--expanded .wl-rail-item--compact .wl-rail-pill {
    inline-size: 24px;
    block-size: 18px;
}

.wl-rail--expanded .wl-rail-label--compact {
    font-size: var(--md-sys-typescale-label-large-size);
    font-weight: 400;
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
    box-sizing: border-box;
    inline-size: min(320px, calc(100dvw - 16px));
    min-inline-size: 0;
    max-inline-size: min(320px, calc(100dvw - 16px));
    min-block-size: 0;
    max-block-size: min(360px, calc(100dvh - 16px));
    overflow-y: auto;
    overflow-x: hidden;
    overflow-wrap: anywhere;
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
    min-inline-size: 0;
    min-block-size: 44px;
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

.wl-rail-more-menu__item > span {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    white-space: normal;
}

.wl-rail-more-menu__item > :deep(.v-icon) {
    flex: 0 0 auto;
}

.wl-rail-more-menu__item:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.wl-rail-more-menu__empty {
    padding: 8px 10px;
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: var(--md-sys-typescale-body-medium-size);
}

.wl-rail-action {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 48px;
    block-size: 48px;
    flex: 0 0 48px;
    border: 0;
    /*
     * 14px, not a full pill. A full radius on a 48px square is a circle, and a circle in a corner
     * is exactly the floating-button shape this rewrite removed - the footer actions have to read
     * as part of the rail rather than as three FABs that happened to line up.
     */
    border-radius: var(--md-sys-shape-corner-large);
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
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: 700;
    line-height: 16px;
    white-space: nowrap;
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
 * surface turns the background grey and makes its white icon fall short of that exact promise,
 * and the secondary-container active indicator does not reach 21:1 there either. Use the
 * existing primary container pair for interactive feedback and the active state instead; no
 * new colour is introduced and the state remains visible.
 */
:global(.v-theme--contrast) .wl-rail-item:hover .wl-rail-pill,
:global(.v-theme--contrast) .wl-rail-item--active .wl-rail-pill,
:global(.v-theme--contrast) .wl-rail--expanded .wl-rail-item:hover,
:global(.v-theme--contrast) .wl-rail--expanded .wl-rail-item--active,
:global(.v-theme--contrast) .wl-rail-action:hover,
:global(.v-theme--contrast) .wl-rail-action .wl-rail-badge {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

:global(.v-theme--contrast) .wl-rail--expanded .wl-rail-item--active .wl-rail-label,
:global(.v-theme--contrast) .wl-rail--expanded .wl-rail-item:hover .wl-rail-label {
    color: rgb(var(--v-theme-on-primary-container));
}

:global(.v-theme--contrast) .wl-rail--expanded .wl-rail-item:hover .wl-rail-pill,
:global(.v-theme--contrast) .wl-rail--expanded .wl-rail-item--active .wl-rail-pill {
    background: none;
}

/* Visible focus in all three themes, using the existing focus role rather than a new colour. */
.wl-rail-item:focus-visible,
.wl-rail-action:focus-visible,
.wl-rail-more-menu__item:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

/*
 * Short-height grid: four labelled destinations above one pinned utility row. More occupies
 * its own 48 px column beside the footer actions. Only the destination area scrolls at extreme
 * logical heights; shortcuts never evict More or the footer from that row.
 */
.wl-rail--short {
    display: grid;
    inline-size: 192px;
    min-inline-size: 192px;
    flex-basis: 192px;
    grid-template-columns: 48px minmax(0, 1fr);
    grid-template-rows: minmax(44px, 1fr) auto;
    gap: 4px 0;
    padding-block: 4px;
}

.wl-rail--short .wl-rail__destinations {
    grid-column: 1 / -1;
    grid-row: 1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    min-block-size: 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
}

.wl-rail--short .wl-rail__destinations .wl-rail-item {
    flex-direction: row;
    min-block-size: 44px;
    gap: 4px;
    padding-inline: 4px;
    text-align: start;
}

.wl-rail--short .wl-rail__destinations .wl-rail-pill {
    inline-size: 24px;
    block-size: 32px;
    flex: 0 0 24px;
}

.wl-rail--short .wl-rail__destinations .wl-rail-label {
    text-align: start;
    flex: 1 1 auto;
}

.wl-rail--short .wl-rail__jobs {
    grid-column: 1;
    grid-row: 2;
    margin-block-start: 0;
    padding-block-start: 0;
    border-block-start: 0;
}

.wl-rail--short .wl-rail__shortcuts .wl-rail-item {
    flex-direction: column;
    justify-content: center;
    min-block-size: 44px;
    gap: 2px;
}

.wl-rail--short .wl-rail__shortcuts .wl-rail-label {
    text-align: center;
    flex: 0 1 auto;
    max-inline-size: 100%;
}

.wl-rail--short .wl-rail__footer {
    grid-column: 2;
    grid-row: 2;
    flex-direction: row;
    justify-content: space-evenly;
    margin-block-start: 0;
    padding-block-start: 0;
}

.wl-rail--short .wl-rail-action {
    inline-size: 44px;
    min-inline-size: 44px;
    block-size: 44px;
    flex: 0 0 44px;
}

/* App.vue's detached world host is outside the flex body. Its ordinary 80 px inset must
 * follow the rail's actual width: the extended column, or the short-height grid. Other
 * overlays anchor directly to their own controls. Only an existing rail activates these
 * rules, not a map-only or child-mode shell.
 */
:global(:root:has(.wl-rail--expanded) .mb-world-host--beside-rail) {
    inset-inline-start: 208px;
}

:global(:root:has(.wl-rail--short) .mb-world-host--beside-rail) {
    inset-inline-start: 192px;
}

/* This stays last so every transition introduced by the rail is covered. */
@media (prefers-reduced-motion: reduce) {
    .wl-rail,
    .wl-rail-pill,
    .wl-rail--expanded .wl-rail-item {
        transition: none;
    }
}
</style>
