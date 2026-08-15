<script setup lang="ts">
/**
 * The kid rail: the same three destinations the adult rail has, plus the sticker book, and the same
 * three footer actions (find, messages, grown-ups). No floating action button, here either.
 *
 * Icons render through Vuetify's `<v-icon>` with real `@mdi/js` path data, matching every other
 * icon in this application (`AppRail.vue` is the model this file was checked against). The earlier
 * `<span class="mdi mdi-home">` shape depends on the `@mdi/font` CSS icon font, which this package
 * does not bundle - only `@mdi/js` is a dependency - so none of those glyphs ever rendered.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiBellOutline, mdiEarth, mdiHammerWrench, mdiHomeOutline, mdiLockOutline, mdiMagnify, mdiMedalOutline } from "@mdi/js";
import { VIcon, VTooltip } from "vuetify/components";

const props = defineProps<{ view: string; jobCount: number; unread: number }>();

/**
 * A real call-signature type, not the tuple-of-a-union shape the drop-in shipped with
 * (`defineEmits<["home", ...][number][]>()`), which `@vue/compiler-sfc` cannot parse as a
 * type-only `defineEmits<T>()` - it only understands a call-signature type or an object whose
 * values are tuples, and this file's siblings (`KidHome.vue`, `KidShell.vue`, ...) already use
 * the object form below.
 */
const emit = defineEmits<{
    home: [];
    map: [];
    work: [];
    stickers: [];
    find: [];
    messages: [];
    grownUps: [];
}>();

const { t } = useI18n();

/** Compact past ninety-nine, matching `AppRail.vue`'s own badge convention. */
function compact(count: number): string {
    return count > 99 ? "99+" : String(count);
}

const jobCountLabel = computed(() =>
    props.jobCount > 0 ? t("kid.rail.workOpenJobs", { count: String(props.jobCount) }, "{count} jobs open") : "",
);
const unreadLabel = computed(() =>
    props.unread > 0 ? t("kid.rail.messagesUnread", { count: String(props.unread) }, "{count} unread") : "",
);
</script>

<template>
    <nav class="wl-kid-rail" :aria-label="t('kid.rail.label', 'Where to go')">
        <button
            class="wl-kid-rail__big"
            type="button"
            :aria-current="view === 'catalogues' ? 'page' : undefined"
            @click="emit('home')"
        >
            <v-icon :icon="mdiHomeOutline" size="30" />
            <span>{{ t("kid.rail.home", "Home") }}</span>
        </button>
        <button
            class="wl-kid-rail__big"
            type="button"
            :aria-current="view === 'map' ? 'page' : undefined"
            @click="emit('map')"
        >
            <v-icon :icon="mdiEarth" size="30" />
            <span>{{ t("kid.rail.map", "Explore") }}</span>
        </button>
        <button
            class="wl-kid-rail__big"
            type="button"
            :aria-current="view === 'work' ? 'page' : undefined"
            :aria-label="jobCountLabel === '' ? undefined : `${t('kid.rail.work', 'My jobs')}, ${jobCountLabel}`"
            @click="emit('work')"
        >
            <v-icon :icon="mdiHammerWrench" size="30" />
            <span>{{ t("kid.rail.work", "My jobs") }}</span>
            <!-- The full count already lives in this button's own aria-label above; the pill is
                 aria-hidden so a compacted "99+" cannot also be announced as a broken number. -->
            <span v-if="jobCount > 0" class="wl-kid-rail__badge" aria-hidden="true">{{ compact(jobCount) }}</span>
        </button>
        <button
            class="wl-kid-rail__big"
            type="button"
            :aria-current="view === 'stickers' ? 'page' : undefined"
            @click="emit('stickers')"
        >
            <v-icon :icon="mdiMedalOutline" size="30" />
            <span>{{ t("kid.rail.stickers", "Stickers") }}</span>
        </button>

        <span class="wl-kid-rail__spacer" />

        <button
            class="wl-kid-rail__small"
            type="button"
            :aria-label="t('kid.rail.find', 'Find anything')"
            @click="emit('find')"
        >
            <v-icon :icon="mdiMagnify" size="22" />
            <v-tooltip activator="parent" location="end" :text="t('kid.rail.find', 'Find anything')" />
        </button>
        <button
            class="wl-kid-rail__small"
            type="button"
            :aria-label="unreadLabel === '' ? t('kid.rail.messages', 'Messages') : `${t('kid.rail.messages', 'Messages')}, ${unreadLabel}`"
            @click="emit('messages')"
        >
            <v-icon :icon="mdiBellOutline" size="22" />
            <span v-if="unread > 0" class="wl-kid-rail__badge wl-kid-rail__badge--alert" aria-hidden="true">
                {{ compact(unread) }}
            </span>
            <v-tooltip activator="parent" location="end" :text="t('kid.rail.messages', 'Messages')" />
        </button>
        <!--
            The one route out of Kid Mode that never requires opening Settings first: reachable
            from every kid-mode screen, on the persistent rail, with keyboard focus and an
            accessible name that names the destination by name ("Adult Mode") rather than only
            "grown-ups", so a search for either word finds it.
        -->
        <button
            class="wl-kid-rail__small"
            type="button"
            :aria-label="t('kid.rail.grownUps', 'Grown-ups: switch to Adult Mode')"
            @click="emit('grownUps')"
        >
            <v-icon :icon="mdiLockOutline" size="22" />
            <v-tooltip activator="parent" location="end" :text="t('kid.rail.grownUps', 'Grown-ups: switch to Adult Mode')" />
        </button>
    </nav>
</template>

<style scoped>
.wl-kid-rail { width: 124px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.wl-kid-rail__big,
.wl-kid-rail__small {
    position: relative;
    border: 0;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    color: rgb(var(--v-theme-inverse-on-surface));
    background: rgba(255, 255, 255, 0.12);
    border-radius: var(--wl-kid-radius-md);
    display: grid;
    place-items: center;
}
.wl-kid-rail__big { width: 106px; min-height: 92px; font-size: 17px; gap: 2px; }
.wl-kid-rail__small { width: 94px; min-height: var(--wl-kid-target-min); }
.wl-kid-rail__big[aria-current="page"] { background: rgb(var(--v-theme-tertiary)); color: rgb(var(--v-theme-on-tertiary)); }
.wl-kid-rail__badge {
    position: absolute; top: 6px; right: 10px; min-width: 26px; height: 26px; padding: 0 5px;
    border-radius: 13px; background: rgb(var(--v-theme-tertiary)); color: rgb(var(--v-theme-on-tertiary));
    font-size: 15px; line-height: 26px;
}
.wl-kid-rail__badge--alert { background: rgb(var(--v-theme-error)); color: rgb(var(--v-theme-on-error)); }
.wl-kid-rail__spacer { flex: 1; }
</style>
