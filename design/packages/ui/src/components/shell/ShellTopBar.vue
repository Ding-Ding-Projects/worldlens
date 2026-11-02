<script setup lang="ts">
/**
 * The Contour top bar: the search bar every screen shares, and the notification bell.
 *
 * Search used to be an icon at the foot of the rail, which made the one control that reaches
 * everything the least visible one. Here it is a Material 3 search bar across the top of the
 * content, with the shortcut printed inside it, so it is the first thing a person sees and the
 * shortcut is learnt by looking. Pressing it opens the same command palette as Ctrl+Shift+F; the
 * bar does not filter anything itself, because a second search with different results would be
 * worse than one. It is a `v-btn` dressed as the search bar rather than a field, because it
 * performs an action and must be announced as one.
 *
 * The bell moved here with it, and kept everything it had in the rail: the shell still owns the
 * open state, this only emits, and the anchored history panel finds it by the same activator id.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiBellOutline, mdiMagnify } from "@mdi/js";
import { VBadge, VBtn, VIcon, VTooltip } from "vuetify/components";
import { nonNegativeInteger } from "./shellNumbers.js";

const props = withDefaults(
    defineProps<{
        unreadCount: number;
        paletteShortcut?: string;
        notificationsActivatorId?: string;
        notificationsPanelId?: string;
        notificationsOpen?: boolean;
    }>(),
    {
        paletteShortcut: "Ctrl+Shift+F",
        notificationsActivatorId: "",
        notificationsPanelId: "",
        notificationsOpen: false,
    },
);

const emit = defineEmits<{
    openPalette: [];
    toggleNotifications: [];
}>();

const { t } = useI18n();

const unreadCount = computed(() => nonNegativeInteger(props.unreadCount));

const searchPlaceholder = computed(() =>
    t("topBar.search.placeholder", "Search maps, servers, settings and commands"),
);

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

function compact(count: number): string {
    const safe = nonNegativeInteger(count);
    return safe > 99 ? "99+" : String(safe);
}
</script>

<template>
    <header class="wl-topbar" data-test="shell-top-bar">
        <v-btn
            class="wl-topbar__search mb-interactive"
            variant="flat"
            color="surface-container-high"
            rounded="xl"
            :ripple="false"
            :aria-label="searchLabel"
            aria-haspopup="dialog"
            data-tutorial-anchor="topbar-search"
            @click="emit('openPalette')"
        >
            <v-icon :icon="mdiMagnify" size="24" aria-hidden="true" />
            <span class="wl-topbar__placeholder">{{ searchPlaceholder }}</span>
            <kbd class="wl-topbar__kbd" aria-hidden="true">{{ props.paletteShortcut }}</kbd>
        </v-btn>

        <div class="wl-topbar__actions">
            <!--
                The one opener for the anchored notification history, moved from the rail with
                its contract intact: one click reaches this event, the shell flips the open state,
                and the panel reflects it back through `aria-expanded`.
            -->
            <v-btn
                :id="
                    props.notificationsActivatorId === ''
                        ? undefined
                        : props.notificationsActivatorId
                "
                class="wl-topbar-action mb-interactive"
                variant="text"
                rounded="xl"
                color="on-surface-variant"
                :icon="true"
                :aria-label="unreadLabel"
                :aria-expanded="props.notificationsOpen ? 'true' : 'false'"
                :aria-controls="
                    props.notificationsPanelId === '' ? undefined : props.notificationsPanelId
                "
                aria-haspopup="dialog"
                data-test="top-bar-bell"
                @click="emit('toggleNotifications')"
            >
                <v-badge
                    class="wl-topbar-badge"
                    :model-value="unreadCount > 0"
                    :content="compact(unreadCount)"
                    color="error"
                    aria-hidden="true"
                >
                    <v-icon :icon="mdiBellOutline" size="24" />
                </v-badge>
                <v-tooltip activator="parent" location="bottom" :text="unreadLabel" />
            </v-btn>
        </div>
    </header>
</template>

<style scoped>
.wl-topbar {
    display: flex;
    align-items: center;
    gap: 16px;
    block-size: 64px;
    padding: 8px 16px 8px 0;
    box-sizing: border-box;
    background: rgb(var(--v-theme-background));
    pointer-events: auto;
}

/*
 * A Material 3 search bar: full-pill, surface-container-high, 56 dp in the spec and 48 here to
 * sit inside a 64 px bar. It is a button that looks like a field, because it opens the palette.
 */
.wl-topbar__search.v-btn {
    flex: 1 1 320px;
    justify-content: flex-start;
    letter-spacing: normal;
    text-transform: none;
    font-weight: 400;
    max-inline-size: 720px;
    margin-inline: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    block-size: 48px;
    padding: 0 8px 0 16px;
    border-radius: var(--md-sys-shape-corner-full);
    background: var(--md-sys-color-surface-container-high);
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--md-sys-typescale-body-large-size);
    transition: background-color var(--md-sys-motion-duration-short2)
        var(--md-sys-motion-easing-standard);
}

.wl-topbar__search.v-btn:hover {
    background: var(--md-sys-color-surface-container-highest);
}

.wl-topbar__search.v-btn:focus-visible,
.wl-topbar-action.v-btn:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.wl-topbar__search.v-btn :deep(.v-btn__content) {
    flex: 1 1 auto;
    min-inline-size: 0;
    gap: 12px;
    justify-content: flex-start;
}

.wl-topbar__search.v-btn :deep(.v-btn__overlay) {
    display: none;
}

.wl-topbar__placeholder {
    text-align: start;
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.wl-topbar__kbd {
    flex: 0 0 auto;
    padding: 4px 8px;
    border-radius: var(--md-sys-shape-corner-sm);
    background: var(--md-sys-color-surface-container-highest);
    color: var(--md-sys-color-on-surface-variant);
    font-family: "Roboto Mono", monospace;
    font-size: var(--md-sys-typescale-label-medium-size);
}

.wl-topbar__actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
}

.wl-topbar-action.v-btn {
    inline-size: 48px;
    min-inline-size: 48px;
    block-size: 48px;
}

.wl-topbar-badge :deep(.v-badge__badge) {
    min-inline-size: 16px;
    block-size: 16px;
    padding: 0 4px;
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: 700;
    line-height: 16px;
}

:global(.v-theme--contrast) .wl-topbar__search.v-btn {
    outline: 1px solid rgb(var(--v-theme-on-surface));
}

:global(.v-theme--contrast) .wl-topbar-action:hover,
:global(.v-theme--contrast) .wl-topbar-action .wl-topbar-badge :deep(.v-badge__badge) {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

@media (prefers-reduced-motion: reduce) {
    .wl-topbar__search.v-btn {
        transition: none;
    }
}
</style>
