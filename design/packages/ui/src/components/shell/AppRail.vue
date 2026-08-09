<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiBellOutline, mdiBriefcaseOutline, mdiCogOutline, mdiHomeOutline, mdiMagnify, mdiMapOutline } from "@mdi/js";
import { VIcon, VTooltip } from "vuetify/components";
import type { RailDestination } from "./featureTargets.js";

/**
 * The three destinations, and the three footer actions, on an 80 px column that is on screen no
 * matter what the person is doing.
 *
 * ### It emits, and owns nothing
 *
 * No overlay state, no job list, no store. The rail says "Work was pressed" and the shell decides
 * what that means, exactly as `App.vue` already makes the command palette work. A rail that
 * opened the settings drawer itself would be a second place that knows how settings opens, and
 * the two would drift.
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
        /** Reflected into `aria-expanded` so the footer buttons describe their own surfaces. */
        /**
         * The DOM id the notification history anchors to.
         *
         * Passed in rather than generated here so the shell can hand the same id to the panel: an
         * anchored panel needs a stable selector for the control that opens it, and a control that
         * generated its own id would be one the panel could never find.
         */
        notificationsActivatorId?: string;
        notificationsOpen?: boolean;
        settingsOpen?: boolean;
    }>(),
    {
        paletteShortcut: "Ctrl+Shift+F",
        notificationsActivatorId: "",
        notificationsOpen: false,
        settingsOpen: false,
    },
);

const emit = defineEmits<{
    select: [destination: RailDestination];
    openPalette: [];
    openNotifications: [];
    openSettings: [];
}>();

const { t } = useI18n();

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
        id: "work",
        icon: mdiBriefcaseOutline,
        label: t("rail.work", "Work"),
        badge: props.openJobCount,
        badgeLabel:
            props.openJobCount === 0
                ? ""
                : t(
                      "rail.work.openJobs",
                      { count: String(props.openJobCount) },
                      "{count} jobs open",
                  ),
    },
]);

/** Compact past ninety-nine, because the pill is 56 px wide and a four-digit badge is a smear. */
function compact(count: number): string {
    return count > 99 ? "99+" : String(count);
}

const unreadLabel = computed(() =>
    props.unreadCount === 0
        ? t("rail.notifications", "Notifications")
        : t(
              "rail.notifications.unread",
              { count: String(props.unreadCount) },
              "Notifications, {count} unread",
          ),
);
</script>

<template>
    <!--
        A labelled landmark rather than a bare column of buttons, so a screen reader can jump
        straight to it and say what it is. The product name is in the label because a person
        running two of these applications side by side hears which one they are in.
    -->
    <nav class="wl-rail" :aria-label="t('rail.label', { product: productName }, '{product} navigation')">
        <!--
            `data-tutorial-anchor` on each destination button because the interactive tour
            highlights real controls by selector, and two of its steps are about the map - which
            is one of these buttons now rather than a tab in the strip. `TabStrip.vue` carries the
            same attribute on a tab button, spelled `tab-<pageId>`; these are `rail-<destination>`
            so the two namespaces cannot collide, and `tutorialAnchors.test.ts` is what proves
            every step still resolves the control it names.
        -->
        <ul class="wl-rail__items">
            <li v-for="item in items" :key="item.id">
                <button
                    type="button"
                    class="wl-rail-item mb-interactive"
                    :class="{ 'wl-rail-item--active': destination === item.id }"
                    :aria-current="destination === item.id ? 'page' : undefined"
                    :aria-label="item.badgeLabel === '' ? undefined : `${item.label}, ${item.badgeLabel}`"
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

        <div class="wl-rail__footer">
            <button
                type="button"
                class="wl-rail-action mb-interactive"
                :aria-label="t('rail.search', { shortcut: paletteShortcut }, 'Search everything ({shortcut})')"
                @click="emit('openPalette')"
            >
                <v-icon :icon="mdiMagnify" size="22" />
                <v-tooltip
                    activator="parent"
                    location="end"
                    :text="t('rail.search', { shortcut: paletteShortcut }, 'Search everything ({shortcut})')"
                />
            </button>

            <button
                :id="notificationsActivatorId === '' ? undefined : notificationsActivatorId"
                type="button"
                class="wl-rail-action mb-interactive"
                :aria-label="unreadLabel"
                :aria-expanded="notificationsOpen ? 'true' : 'false'"
                @click="emit('openNotifications')"
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
                type="button"
                class="wl-rail-action mb-interactive"
                :aria-label="t('settings.title', 'Settings')"
                :aria-expanded="settingsOpen ? 'true' : 'false'"
                @click="emit('openSettings')"
            >
                <v-icon :icon="mdiCogOutline" size="22" />
                <v-tooltip activator="parent" location="end" :text="t('settings.title', 'Settings')" />
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
        color var(--md-sys-motion-duration-short2, 100ms)
            var(--md-sys-motion-easing-standard, ease);
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

/* Visible focus in all three themes, using the existing focus role rather than a new colour. */
.wl-rail-item:focus-visible,
.wl-rail-action:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
</style>
