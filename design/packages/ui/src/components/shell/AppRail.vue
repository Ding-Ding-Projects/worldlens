<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiBellOutline,
    mdiCogOutline,
    mdiDns,
    mdiEarth,
    mdiHammerScrewdriver,
    mdiHomeOutline,
    mdiMagnify,
} from "@mdi/js";
import { VBadge, VBtn, VIcon, VTooltip } from "vuetify/components";
import type { RailDestination } from "./featureTargets.js";
import { nonNegativeInteger } from "./shellNumbers.js";

/**
 * The application's Material 3 navigation rail: four destinations and three footer actions.
 *
 * ### Four destinations, and exactly four
 *
 * Home, Map, Work and Servers, as the approved prototype draws them. Home, Map and Work are
 * `RailDestination`s - top-level screens the shell switches between. **Servers is not a fourth
 * screen**: it is the Minecraft servers job, opened in Work exactly as the palette's own
 * "open a page" row opens it, and it carries the active indicator while that job is the one on
 * top of Work. That is the prototype's own rule (`goServers` opens the job; the Servers pill is
 * active on `route === "work" && job === "mcservers"` and Work's pill is not), and it keeps the
 * destination model narrow: nothing here can grow into "a screen the shell has to learn".
 *
 * The rail used to carry seven more direct-open job shortcuts and a "More" overflow menu under
 * a divider. The prototype has none of them. Every one of those jobs is still one step away:
 * Work's own add-job (+) picker lists them all, the command palette has a destination row for
 * each, and the catalogues on Home link to the ones they describe.
 *
 * ### It emits, and owns nothing
 *
 * No application state, job ownership or store. The rail says "Work was pressed" or "open this
 * job" and the shell decides what that means, the same division the command palette uses. A rail
 * that opened the settings surface itself would be a second place that knows how settings opens.
 *
 * ### Real Material components
 *
 * Each destination is a `v-btn` whose content is the M3 rail-item anatomy: a 56 x 32 full-corner
 * active indicator holding the icon (and a `v-badge` where there is a count), with the label
 * always visible beneath it. The button's own full-width state layer is turned off so the hover
 * and press feedback lands on the indicator, where the specification puts it. The footer actions
 * are icon `v-btn`s with `v-tooltip`s.
 *
 * ### Badges say the number, and also say it in words
 *
 * Work counts open jobs, Servers counts running servers and the bell counts unread notices. Each
 * badge is compact past 99 and hidden from assistive technology, because the full number is in the
 * button's own accessible name: "99+" read aloud is not a count, and a coloured dot alone is colour
 * carrying meaning on its own.
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
         * The job Servers opens, or null when this build cannot host it - in which case the
         * destination is not drawn at all rather than drawn pointing nowhere.
         */
        serversJobId?: string | null;
        /** The job on top of Work, so Servers can carry the indicator while it is showing. */
        activeJobId?: string | null;
        /** Running Minecraft servers, from the one server store. */
        runningServerCount?: number;
        /**
         * The DOM id the notification history anchors to.
         *
         * Passed in rather than generated here so the shell can hand the same id to the panel: an
         * anchored panel needs a stable selector for the control that opens it.
         */
        notificationsActivatorId?: string;
        /** The panel controlled by the notification disclosure button. */
        notificationsPanelId?: string;
        notificationsOpen?: boolean;
        /** The settings disclosure button and the docked panel it controls. */
        settingsActivatorId?: string;
        settingsPanelId?: string;
        settingsOpen?: boolean;
    }>(),
    {
        paletteShortcut: "Ctrl+Shift+F",
        serversJobId: null,
        activeJobId: null,
        runningServerCount: 0,
        notificationsActivatorId: "",
        notificationsPanelId: "",
        notificationsOpen: false,
        settingsActivatorId: "",
        settingsPanelId: "",
        settingsOpen: false,
    },
);

const emit = defineEmits<{
    select: [destination: RailDestination];
    /** Servers was pressed; the shell answers exactly as it answers the palette's open-page row. */
    openJob: [jobId: string];
    openPalette: [];
    /**
     * One user press changes this state exactly once. The panel still owns its overlay and its
     * anchor, but the rail owns the press: `NotificationPanel` turns off the overlay's automatic
     * activator click, so this event cannot race a second toggle.
     */
    toggleNotifications: [];
    openSettings: [];
}>();

const { t } = useI18n();

const openJobCount = computed(() => nonNegativeInteger(props.openJobCount));
const unreadCount = computed(() => nonNegativeInteger(props.unreadCount));
const runningServerCount = computed(() => nonNegativeInteger(props.runningServerCount));

type RailItemId = RailDestination | "servers";

interface RailItem {
    readonly id: RailItemId;
    readonly icon: string;
    readonly label: string;
    readonly badge: number;
    readonly badgeLabel: string;
    readonly active: boolean;
}

/** Servers is showing when its job is on top of Work; Work is showing for every other job. */
const serversShowing = computed(
    () =>
        props.serversJobId !== null &&
        props.destination === "work" &&
        props.activeJobId === props.serversJobId,
);

const items = computed<readonly RailItem[]>(() => {
    const list: RailItem[] = [
        {
            id: "home",
            icon: mdiHomeOutline,
            label: t("rail.home", "Home"),
            badge: 0,
            badgeLabel: "",
            active: props.destination === "home",
        },
        {
            id: "map",
            icon: mdiEarth,
            label: t("rail.map", "Map"),
            badge: 0,
            badgeLabel: "",
            active: props.destination === "map",
        },
        {
            id: "work",
            icon: mdiHammerScrewdriver,
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
            active: props.destination === "work" && !serversShowing.value,
        },
    ];
    if (props.serversJobId !== null) {
        list.push({
            id: "servers",
            icon: mdiDns,
            label: t("rail.servers", "Servers"),
            badge: runningServerCount.value,
            badgeLabel:
                runningServerCount.value === 0
                    ? ""
                    : t(
                          "rail.servers.running",
                          { count: String(runningServerCount.value) },
                          "{count} running",
                      ),
            active: serversShowing.value,
        });
    }
    return list;
});

function press(item: RailItem): void {
    if (item.id === "servers") {
        if (props.serversJobId !== null) emit("openJob", props.serversJobId);
        return;
    }
    emit("select", item.id);
}

/** Compact past ninety-nine, because the indicator is 56 px wide and a four-digit badge is a smear. */
function compact(count: number): string {
    const safe = nonNegativeInteger(count);
    return safe > 99 ? "99+" : String(safe);
}

const searchLabel = computed(() =>
    t("rail.search", { shortcut: props.paletteShortcut }, "Search everything ({shortcut})"),
);

const unreadLabel = computed(() =>
    unreadCount.value === 0
        ? t("rail.notifications", "Notifications")
        : t(
              "rail.notifications.unread",
              { count: String(unreadCount.value) },
              "Notifications, {count} unread",
          ),
);

const settingsLabel = computed(() => t("settings.title", "Settings"));
</script>

<template>
    <!--
        A labelled landmark rather than a bare column of buttons, so a screen reader can jump
        straight to it and say what it is. The product name is in the label because a person
        running two of these applications side by side hears which one they are in.
    -->
    <nav
        class="wl-rail"
        :aria-label="t('rail.label', { product: productName }, '{product} navigation')"
    >
        <!--
            `data-tutorial-anchor` on each destination because the interactive tour highlights
            real controls by selector. `TabStrip.vue` spells its own `tab-<pageId>`; these are
            `rail-<destination>` so the two namespaces cannot collide, and
            `tutorialAnchors.test.ts` proves every step still resolves the control it names.
        -->
        <ul class="wl-rail__items wl-rail__destinations">
            <li v-for="item in items" :key="item.id">
                <v-btn
                    class="wl-rail-item mb-interactive"
                    :class="{ 'wl-rail-item--active': item.active }"
                    variant="text"
                    rounded="0"
                    :color="item.active ? 'on-surface' : 'on-surface-variant'"
                    :ripple="false"
                    :aria-current="item.active ? 'page' : undefined"
                    :aria-label="
                        item.badgeLabel === '' ? undefined : `${item.label}, ${item.badgeLabel}`
                    "
                    :data-destination="item.id"
                    :data-tutorial-anchor="`rail-${item.id}`"
                    @click="press(item)"
                >
                    <span class="wl-rail-pill">
                        <!--
                            aria-hidden because the full count is already in the button's own
                            accessible name: "99+" announced on its own is not a number, and
                            announcing both would say the count twice.
                        -->
                        <v-badge
                            class="wl-rail-badge"
                            :model-value="item.badge > 0"
                            :content="compact(item.badge)"
                            color="primary"
                            aria-hidden="true"
                        >
                            <v-icon :icon="item.icon" size="22" />
                        </v-badge>
                    </span>
                    <!--
                        The label is visible, always. An icon-only rail is a rail people learn by
                        trial and error, and the 80 px column exists precisely so it does not have
                        to be.
                    -->
                    <span class="wl-rail-label">{{ item.label }}</span>
                </v-btn>
            </li>
        </ul>

        <div class="wl-rail__footer">
            <v-btn
                class="wl-rail-action mb-interactive"
                variant="text"
                rounded="lg"
                color="on-surface-variant"
                :icon="true"
                :aria-label="searchLabel"
                aria-haspopup="dialog"
                @click="emit('openPalette')"
            >
                <v-icon :icon="mdiMagnify" size="22" />
                <v-tooltip activator="parent" location="end" :text="searchLabel" />
            </v-btn>

            <!--
                This is the one opener for the anchored notification history. The panel keeps the
                bell as its geometry anchor, but it does not also bind its own automatic click to
                that anchor: one click reaches this event, the shell flips `notificationsOpen`, and
                the panel reflects that same value back through `aria-expanded`.
            -->
            <v-btn
                :id="notificationsActivatorId === '' ? undefined : notificationsActivatorId"
                class="wl-rail-action mb-interactive"
                variant="text"
                rounded="lg"
                color="on-surface-variant"
                :icon="true"
                :aria-label="unreadLabel"
                :aria-expanded="notificationsOpen ? 'true' : 'false'"
                :aria-controls="notificationsPanelId === '' ? undefined : notificationsPanelId"
                aria-haspopup="dialog"
                @click="emit('toggleNotifications')"
            >
                <v-badge
                    class="wl-rail-badge"
                    :model-value="unreadCount > 0"
                    :content="compact(unreadCount)"
                    color="error"
                    aria-hidden="true"
                >
                    <v-icon :icon="mdiBellOutline" size="22" />
                </v-badge>
                <v-tooltip activator="parent" location="end" :text="unreadLabel" />
            </v-btn>

            <v-btn
                :id="settingsActivatorId === '' ? undefined : settingsActivatorId"
                class="wl-rail-action mb-interactive"
                variant="text"
                rounded="lg"
                color="on-surface-variant"
                :icon="true"
                :aria-label="settingsLabel"
                :aria-expanded="settingsOpen ? 'true' : 'false'"
                :aria-controls="settingsPanelId === '' ? undefined : settingsPanelId"
                aria-haspopup="dialog"
                @click="emit('openSettings')"
            >
                <v-icon :icon="mdiCogOutline" size="22" />
                <v-tooltip activator="parent" location="end" :text="settingsLabel" />
            </v-btn>
        </div>
    </nav>
</template>

<style scoped>
/*
 * 80 px, always. A narrow window shrinks the content beside the rail, never the rail's labels.
 * At an extreme height the column scrolls as a whole rather than cutting a target short.
 */
.wl-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    inline-size: 80px;
    min-inline-size: 80px;
    flex: 0 0 80px;
    min-block-size: 0;
    /* The prototype prints 14/12: the first indicator sits one notch below the strip above. */
    padding: 14px 0 12px;
    background: rgb(var(--v-theme-surface));
    border-inline-end: 1px solid rgb(var(--v-theme-surface-container));
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
    inline-size: 100%;
}

.wl-rail__footer {
    margin-block-start: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding-block-start: 12px;
}

/*
 * The M3 rail item: a 48 px minimum target met by padding rather than a fixed height, so a
 * two-line label in bilingual mode grows the item instead of being clipped. The button's own
 * full-width state layer is hidden; the indicator below carries hover and press instead.
 */
.wl-rail-item.v-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    inline-size: 100%;
    min-inline-size: 0;
    block-size: auto;
    min-block-size: 48px;
    padding: 4px;
    letter-spacing: normal;
    text-transform: none;
}

.wl-rail-item.v-btn :deep(.v-btn__overlay),
.wl-rail-item.v-btn :deep(.v-btn__underlay) {
    display: none;
}

.wl-rail-item.v-btn :deep(.v-btn__content) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    inline-size: 100%;
    white-space: normal;
}

.wl-rail-pill {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 56px;
    block-size: 32px;
    border-radius: var(--md-sys-shape-corner-full);
    transition:
        background-color var(--md-sys-motion-duration-short2) var(--md-sys-motion-easing-standard),
        color var(--md-sys-motion-duration-short2) var(--md-sys-motion-easing-standard);
}

/*
 * The active indicator is the primary-container pair the prototype draws, and the one pair the
 * contrast scheme keeps at 21:1 (`contrastAcceptance.test.ts`): the contrast scheme's
 * secondary-container is black on black.
 */
.wl-rail-item--active .wl-rail-pill {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

.wl-rail-item.v-btn:hover .wl-rail-pill {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.wl-rail-item--active.v-btn:hover .wl-rail-pill {
    background: rgb(var(--v-theme-primary-container));
}

/*
 * The label wraps rather than truncating. Bilingual mode renders two languages in this space and
 * the longest of them decides whether this rail clips - so it is allowed to grow.
 */
.wl-rail-label {
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: 500;
    letter-spacing: 0.04em;
    line-height: 1.25;
    text-align: center;
    inline-size: 100%;
    overflow-wrap: anywhere;
    display: block;
    min-inline-size: 0;
    white-space: normal;
    overflow: visible;
}

/*
 * 48 x 48 icon buttons with the large corner, not a full circle: three circles in a column read
 * as floating actions, and these are part of the rail.
 */
.wl-rail-action.v-btn {
    inline-size: 48px;
    min-inline-size: 48px;
    block-size: 48px;
}

/*
 * The badge geometry the prototype prints: 16 px tall, its corner just outside the icon's.
 */
.wl-rail-badge :deep(.v-badge__badge) {
    min-inline-size: 16px;
    block-size: 16px;
    padding: 0 4px;
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: 700;
    line-height: 16px;
}

/*
 * Contrast is literal on the rewrite chrome: every readable rail state stays at 21:1.
 * A normal M3 state layer is deliberately translucent, but white at 8% over the contrast
 * surface turns the background grey and makes its white icon fall short of that exact promise.
 * Use the existing primary container pair for interactive feedback instead.
 */
:global(.v-theme--contrast) .wl-rail-item:hover .wl-rail-pill,
:global(.v-theme--contrast) .wl-rail-action:hover,
:global(.v-theme--contrast) .wl-rail-action .wl-rail-badge :deep(.v-badge__badge) {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

/* Visible focus in all three themes, using the existing focus role rather than a new colour. */
.wl-rail-item.v-btn:focus-visible,
.wl-rail-action.v-btn:focus-visible {
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
