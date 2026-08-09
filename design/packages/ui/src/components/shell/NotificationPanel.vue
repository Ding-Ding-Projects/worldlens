<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VCard, VMenu } from "vuetify/components";
import { NoticeCentrePanel } from "../notifications/index.js";
import type { NoticeState } from "../config/notifications.js";
import { onRevealRequested } from "./revealRequests.js";

/**
 * The notification history, anchored beside the rail, opened only because somebody asked.
 *
 * ### What this is not
 *
 * It is not a new notification centre. `NoticeCentrePanel` already owns the list, the level
 * filters with their live counts, the search with its anchored regex builder, per-row selection,
 * the tri-state select-all and every bulk action including export - all of it unit-tested without
 * mounting an overlay. Rebuilding that here would be a second implementation of a solved problem
 * and a second place for the redaction rules to drift.
 *
 * What this component adds is the one thing the rewrite actually changes: **where it appears and
 * what makes it appear.** The old bell sat in a fixed corner beside a stack of toasts. This one is
 * anchored to the rail's own bell, and nothing opens it except a person pressing that bell or the
 * palette asking for it by name.
 *
 * ### Nothing arrives here on its own
 *
 * `raiseNotice()` is untouched and still puts a notice in the history. What it no longer does is
 * cause anything to appear over the content. A notice increments the unread count on the rail
 * badge and waits to be looked at, which is the whole difference between a history and an
 * interruption.
 */
const props = defineProps<{
    state: NoticeState;
    /** The rail's bell, so the panel anchors to the control that opened it. */
    activator: string;
}>();

const emit = defineEmits<{ "update:open": [open: boolean] }>();

const { t } = useI18n();

const open = ref(false);

watch(open, (value) => {
    emit("update:open", value);
    // Opening the history is what "I have seen these" means, so the unread mark moves to the
    // newest entry at that moment. An id rather than a count, because the history is bounded and
    // two counts drift apart the moment it starts dropping its oldest entry.
    if (value) {
        const newest = props.state.history[0];
        if (newest !== undefined) props.state.reviewedId = newest.id;
    }
});

/*
 * The palette offers this panel by name, and the palette opens nothing itself. This is the other
 * end of that doorbell: a request rings, and the component that owns the open state - this one -
 * answers it with its own focus handling.
 */
onRevealRequested("noticeCentre", () => {
    open.value = true;
});

const label = computed(() => t("notice.centre.title", "Notifications"));

function close(): void {
    open.value = false;
}
</script>

<template>
    <!--
        Anchored to the rail's bell rather than positioned against the viewport. The geometry the
        design asks for - about 88 px in from the left, 16 px up from the bottom, 420 wide, 560
        tall at most - is what anchoring to that button produces, and asking for it by anchor
        rather than by fixed offsets is what keeps it right when the window is short, when the
        interface size dial is turned up, or when a translated label makes the rail taller.
    -->
    <v-menu
        v-model="open"
        :activator="activator"
        :close-on-content-click="false"
        location="end top"
        offset="8"
        :aria-label="label"
    >
        <v-card class="wl-notifications" rounded="lg" :aria-label="label">
            <NoticeCentrePanel :state="state" @close="close" />
        </v-card>
    </v-menu>
</template>

<style scoped>
/*
 * Bounded, and scrolling inside that bound rather than clipping past it. A capped height with
 * hidden overflow deletes whatever sits past the cap with no scrollbar to say anything is
 * missing, which is how a notification list quietly loses its oldest half.
 */
.wl-notifications {
    inline-size: 420px;
    max-inline-size: calc(100vw - 96px);
    max-block-size: min(560px, calc(100vh - 96px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.wl-notifications :deep(.mb-notice-centre) {
    min-block-size: 0;
    overflow-y: auto;
}
</style>
