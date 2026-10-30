<script setup lang="ts">
import { computed } from "vue";
import { VBanner, VBtn, VIcon, VProgressLinear } from "vuetify/components";
import { mdiCellphoneArrowDown, mdiOpenInNew } from "@mdi/js";
import { langAttr } from "../setup/setupI18n.js";
import { updatePair, updateText } from "./updateCopy.js";
import type { UpdateBannerModel } from "./updateModel.js";

/**
 * The persistent, non-blocking "ready to install" banner.
 *
 * A full-width Material banner on the primary container, directly under the title bar: an
 * update icon, one line of copy, **Restart to install** and **Later**. It sits in the layout
 * rather than over it, it never takes focus, it never gates anything, and it stays until the
 * user acts on it. That persistence is the point - the offer has to survive an hour of
 * rendering so it can be taken at a moment of the user's choosing, which is exactly what a
 * toast that auto-dismisses cannot do.
 *
 * What it never does is block. It is a polite `status` region, not a dialog: nothing behind it
 * is disabled, `Escape` is not trapped, and the only two actions are "install it now" and
 * "not now". The illustration that used to sit in here lives beside the same offer in Settings
 * (`UpdateStatusRow.vue`), where there is room for it.
 *
 * **A download in flight gets a bar, and only ever a truthful one.** The bar is determinate
 * only when the updater reported a percentage or served a total to derive one from, and is
 * indeterminate otherwise, which is the ordinary case with Electron's Squirrel updater rather
 * than a failure. Every decision about which of the two to draw is made in `progressFor` next
 * door, so this component only renders what it is handed.
 *
 * **Restart is visibly held while a render runs.** The main process refuses either way, but
 * a button that looks live and silently does nothing is indistinguishable from a broken
 * one, so the button goes disabled and the body text changes to say why. The version number
 * in that copy is interpolated after the funny level has chosen the sentence, so no level
 * can touch it.
 */
const props = defineProps<{
    model: UpdateBannerModel;
    /** Set while the restart request is in flight, so it cannot be pressed twice. */
    busy?: boolean;
}>();

const emit = defineEmits<{
    (event: "restart"): void;
    (event: "dismiss"): void;
    (event: "open-notes", url: string): void;
}>();

// `updatePair` owns the whole mode rule - which language leads, and whether there is a
// second one at all - so neither this component nor the settings row restates it.
const titlePair = computed(() => updatePair(props.model.titleKey, props.model.vars));
const bodyPair = computed(() => updatePair(props.model.bodyKey, props.model.vars));

const restartLabel = computed(() => updateText("update.action.restart"));
const laterLabel = computed(() => updateText("update.action.later"));
const notesLabel = computed(() => updateText("update.action.notes"));
const dismissLabel = computed(() => updateText("update.action.dismiss"));

const progress = computed(() => props.model.progress);

/** The bar's own accessible name, since the numbers beside it are not its label. */
const progressLabel = computed(() => updateText("update.label.progress"));

/**
 * The visible line under the bar: the percentage, the byte counts and the rate.
 *
 * Assembled from whatever the updater actually reported and nothing else, so a download with
 * no total simply loses the "of 48.0 MB" half rather than gaining a guess. When none of the
 * three is known the line says so outright.
 */
const progressDetail = computed(() => {
    const current = progress.value;
    if (current === null) return "";

    const parts: string[] = [];
    if (current.percent !== null) parts.push(`${String(current.percent)}%`);
    if (current.transferredLabel !== null) {
        const counted =
            current.totalLabel === null
                ? current.transferredLabel
                : `${current.transferredLabel} / ${current.totalLabel}`;
        parts.push(`${updateText("update.label.downloaded")} ${counted}`);
    }
    if (current.rateLabel !== null) {
        parts.push(`${updateText("update.label.rate")} ${current.rateLabel}`);
    }
    if (parts.length === 0) return updateText("update.label.downloadingUnknownSize");
    return parts.join(" · ");
});

/**
 * The politely announced summary, deliberately coarse: rounded to the nearest ten percent so a
 * live region fed several progress events a second announces about ten times per download.
 */
const progressAnnouncement = computed(() => {
    const current = progress.value;
    if (current === null || current.percent === null) return "";
    const tens = Math.floor(current.percent / 10) * 10;
    return updateText("update.banner.downloadingPercent", { percent: String(tens) });
});

function onRestart(): void {
    if (!props.model.canRestart || props.busy === true) return;
    emit("restart");
}

function onNotes(): void {
    const url = props.model.notesUrl;
    if (url !== null) emit("open-notes", url);
}
</script>

<template>
    <!--
        `role="status"` overrides the banner's own `role="banner"`: the title bar above is the
        application's one banner landmark, and this is an announcement, not a second one.
    -->
    <v-banner
        v-if="props.model.visible"
        class="mb-update-banner"
        :class="`mb-update-banner--${props.model.tone}`"
        bg-color="primary-container"
        density="compact"
        role="status"
        aria-live="polite"
        :data-tone="props.model.tone"
    >
        <template #prepend>
            <v-icon :icon="mdiCellphoneArrowDown" size="20" aria-hidden="true" />
        </template>

        <div class="mb-update-banner__text">
            <p class="mb-update-banner__line">
                <span class="mb-update-banner__title">{{ titlePair.primary }}</span>
                {{ " " }}
                <span class="mb-update-banner__body">{{ bodyPair.primary }}</span>
            </p>
            <p
                v-if="titlePair.secondary !== null"
                class="mb-update-banner__secondary"
                :lang="langAttr('yue')"
            >
                {{ titlePair.secondary }}
                {{ bodyPair.secondary ?? "" }}
            </p>

            <div v-if="progress !== null" class="mb-update-banner__progress">
                <!-- `aria-live="off"` on the two rendered elements is load-bearing: the banner
                     around them is a polite live region, so without it every tick of the byte
                     counter would be announced. The coarse summary below carries its own
                     polite region instead. -->
                <v-progress-linear
                    class="mb-update-banner__bar"
                    :model-value="progress.percent ?? 0"
                    :indeterminate="progress.indeterminate"
                    :aria-label="progressLabel"
                    aria-live="off"
                    color="on-primary-container"
                    height="4"
                    rounded
                />
                <p class="mb-update-banner__progress-detail" aria-live="off">
                    {{ progressDetail }}
                </p>
                <p
                    v-if="progressAnnouncement !== ''"
                    class="mb-update-banner__visually-hidden"
                    aria-live="polite"
                >
                    {{ progressAnnouncement }}
                </p>
            </div>
        </div>

        <template v-if="progress === null" #actions>
            <div class="mb-update-banner__actions">
                <v-btn
                    v-if="props.model.notesUrl !== null"
                    :prepend-icon="mdiOpenInNew"
                    variant="text"
                    color="on-primary-container"
                    height="32"
                    class="mb-update-banner__notes"
                    @click="onNotes"
                >
                    {{ notesLabel }}
                </v-btn>
                <v-btn
                    :disabled="!props.model.canRestart || props.busy === true"
                    :loading="props.busy === true"
                    variant="flat"
                    color="primary"
                    height="32"
                    class="mb-update-banner__restart"
                    @click="onRestart"
                >
                    {{ restartLabel }}
                </v-btn>
                <v-btn
                    v-if="props.model.canDismiss"
                    variant="text"
                    color="on-primary-container"
                    height="32"
                    class="mb-update-banner__later"
                    :aria-label="dismissLabel"
                    @click="emit('dismiss')"
                >
                    {{ laterLabel }}
                </v-btn>
            </div>
        </template>
    </v-banner>
</template>

<style>
/*
 * Full width, opaque, on the primary container, in the layout rather than over it. The
 * banner's own surface is painted by `bg-color`, so nothing behind it - the map included -
 * shows through the copy.
 */
.mb-update-banner.v-banner {
    flex: 0 0 auto;
    align-items: center;
    /* One row: icon, copy, actions. Vuetify's own density rules add a second row and extra
       top padding meant for a two-line banner. */
    grid-template-rows: auto;
    padding: 8px 16px;
    border-block-end: 1px solid rgb(var(--v-theme-surface-container));
    color: rgb(var(--v-theme-on-primary-container));
    overflow-wrap: anywhere;
}

.mb-update-banner .v-banner__prepend {
    align-self: center;
    margin-inline-end: 16px;
}

.mb-update-banner .v-banner__content {
    min-inline-size: 0;
}

.mb-update-banner__text {
    min-inline-size: 0;
    flex: 1 1 auto;
}

.mb-update-banner__line {
    margin: 0;
    /* One line across the banner, as drawn: the global prose measure is for paragraphs. */
    max-inline-size: none;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    text-wrap: pretty;
}

.mb-update-banner__secondary {
    margin: 2px 0 0;
    max-inline-size: none;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    text-wrap: pretty;
}

.mb-update-banner__progress {
    margin: 8px 0 0;
    inline-size: 100%;
}

.mb-update-banner__progress-detail {
    margin: 4px 0 0;
    font-size: var(--md-sys-typescale-body-small-size);
    font-variant-numeric: tabular-nums;
    text-wrap: pretty;
}

/* Standard visually-hidden text: read by a screen reader, invisible to everyone else. */
.mb-update-banner__visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}

.mb-update-banner.v-banner .v-banner-actions {
    align-self: center;
    margin: 0;
}

/* Sentence case, as every button in the shell reads; Vuetify's default is uppercase. The
   prototype's 32px pill, which still clears the 24px minimum target with room to spare. */
.mb-update-banner .v-btn {
    padding-inline: 16px;
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
}

/* Wraps under the copy at a narrow width rather than clipping a button off the end. */
.mb-update-banner__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    margin-inline-start: 16px;
}

@media (max-width: 720px) {
    .mb-update-banner.v-banner {
        grid-template-areas: "prepend content" ". actions";
    }

    .mb-update-banner__actions {
        margin-inline-start: 0;
        margin-block-start: 8px;
    }
}
</style>
