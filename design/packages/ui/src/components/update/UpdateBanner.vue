<script setup lang="ts">
import { computed } from "vue";
import { VAlert, VBtn, VProgressLinear } from "vuetify/components";
import { mdiOpenInNew, mdiRestart } from "@mdi/js";
import ActionArtwork from "../actionArtwork/ActionArtwork.vue";
import { langAttr } from "../setup/setupI18n.js";
import { updatePair, updateText } from "./updateCopy.js";
import type { UpdateBannerModel } from "./updateModel.js";

/**
 * The persistent, non-blocking "ready to install" banner.
 *
 * Modelled on GitHub Desktop's: it sits in the layout rather than over it, it never takes
 * focus, it never gates anything, and it stays until the user acts on it. That persistence
 * is the point - the offer has to survive an hour of rendering so it can be taken at a
 * moment of the user's choosing, which is exactly what a toast that auto-dismisses cannot
 * do.
 *
 * What it never does is block. It is an `alert` region announced politely, not a dialog:
 * nothing behind it is disabled, `Escape` is not trapped, and the only two actions are
 * "install it now" and "not now".
 *
 * **A download in flight gets a bar, and only ever a truthful one.** The bar is determinate
 * only when the updater reported a percentage or served a total to derive one from, and is
 * indeterminate otherwise, which is the ordinary case with Electron's Squirrel updater rather
 * than a failure. Nothing here computes a percentage of its own: a bar that invents motion
 * says the download is fine at exactly the moment nothing may be happening, which is worse
 * than showing no bar at all. Every decision about which of the two to draw is made in
 * `progressFor` next door, so this component only renders what it is handed.
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
 * three is known the line says so outright, because a bar sliding back and forth over an
 * empty caption leaves the user unable to tell a slow download from a stalled one.
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
 * The politely announced summary, deliberately coarse.
 *
 * A progress event can arrive several times a second, and a live region wired straight to it
 * would talk over everything else a screen reader is trying to say. So this is rounded to the
 * nearest ten percent: the text changes about ten times across a whole download, and a live
 * region only announces when its text actually changes. An indeterminate download announces
 * nothing here at all, because the banner's own title has already said a download is running
 * and there is no new fact to add.
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
    <v-alert
        v-if="props.model.visible"
        :type="props.model.tone === 'warning' ? 'warning' : props.model.tone === 'info' ? 'info' : 'success'"
        variant="tonal"
        density="comfortable"
        role="status"
        aria-live="polite"
        class="mb-update-banner"
    >
        <!-- The artwork illustrates the restart offer, which a download in flight has not
             reached yet, and it would push the bar off the first line at a narrow width. -->
        <ActionArtwork
            v-if="progress === null"
            artwork="restartToInstall"
            :alt="updateText('update.artwork.restartAlt')"
        />
        <div class="mb-update-banner__text">
            <p class="mb-update-banner__title">{{ titlePair.primary }}</p>
            <p
                v-if="titlePair.secondary !== null"
                class="mb-update-banner__secondary"
                :lang="langAttr('yue')"
            >
                {{ titlePair.secondary }}
            </p>
            <p class="mb-update-banner__body">{{ bodyPair.primary }}</p>
            <p
                v-if="bodyPair.secondary !== null"
                class="mb-update-banner__secondary"
                :lang="langAttr('yue')"
            >
                {{ bodyPair.secondary }}
            </p>

            <div v-if="progress !== null" class="mb-update-banner__progress">
                <!-- `aria-live="off"` on the two rendered elements is load-bearing: the alert
                     around them is a polite live region, so without it every tick of the byte
                     counter would be announced. The coarse summary below carries its own
                     polite region instead, and changes about ten times per download. -->
                <v-progress-linear
                    class="mb-update-banner__bar"
                    :model-value="progress.percent ?? 0"
                    :indeterminate="progress.indeterminate"
                    :aria-label="progressLabel"
                    aria-live="off"
                    height="8"
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

        <div v-if="progress === null" class="mb-update-banner__actions">
            <v-btn
                :prepend-icon="mdiRestart"
                :disabled="!props.model.canRestart || props.busy === true"
                :loading="props.busy === true"
                variant="tonal"
                class="mb-update-banner__restart"
                @click="onRestart"
            >
                {{ restartLabel }}
            </v-btn>
            <v-btn
                v-if="props.model.notesUrl !== null"
                :prepend-icon="mdiOpenInNew"
                variant="text"
                class="mb-update-banner__notes"
                @click="onNotes"
            >
                {{ notesLabel }}
            </v-btn>
            <v-btn
                v-if="props.model.canDismiss"
                variant="text"
                class="mb-update-banner__later"
                :aria-label="dismissLabel"
                @click="emit('dismiss')"
            >
                {{ laterLabel }}
            </v-btn>
        </div>
    </v-alert>
</template>

<style>
.mb-update-banner {
    /*
     * An opaque surface of its own, which a tonal alert does not have.
     *
     * This banner is the one alert in the application that renders *over the map*. Vuetify's
     * `tonal` variant is a tinted wash at low alpha, which is fine on a page background and
     * is illegible on top of a rendered world: the map's own colour reads straight through
     * the copy, so "Version x is downloaded and ready to install" sits on top of roads and
     * rooftops and cannot be read at all. Reported from a real build with exactly that
     * screenshot.
     *
     * So it paints its own background, border and elevation rather than borrowing the map's.
     * The tonal tint is kept as a colour-mix over the opaque surface, so the success and
     * warning tones still read as themselves instead of the alert becoming a plain grey box.
     */
    background: color-mix(
        in srgb,
        rgb(var(--v-theme-surface)) 92%,
        currentColor
    );
    box-shadow: var(--v-shadow-key-umbra-opacity, 0 0 0 rgba(0, 0, 0, 0.2)),
        0 4px 12px rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));

    display: flex;
    /* Grows downward at a narrow width rather than clipping the buttons off the end,
       which is what a single row does at 800px in bilingual mode. */
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px 16px;
    overflow-wrap: anywhere;
}

.mb-update-banner__text {
    flex: 1 1 18rem;
    min-width: 0;
}

.mb-update-banner .mb-action-artwork {
    flex: 1 1 18rem;
    max-inline-size: 24rem;
    margin: 0;
    aspect-ratio: 16 / 9;
}

.mb-update-banner__title {
    margin: 0;
    font-weight: 600;
    text-wrap: pretty;
}

.mb-update-banner__body {
    margin: 4px 0 0;
    font-size: 0.875rem;
    text-wrap: pretty;
}

.mb-update-banner__secondary {
    margin: 2px 0 0;
    font-size: 0.75rem;
    line-height: 1.5;
    opacity: 0.85;
    text-wrap: pretty;
}

.mb-update-banner__progress {
    margin: 10px 0 0;
    /* The bar is a full-width measure of one thing, so it spans the text column rather than
       sitting inline beside copy that would make its length mean nothing. */
    inline-size: 100%;
}

.mb-update-banner__progress-detail {
    margin: 6px 0 0;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.9;
    text-wrap: pretty;
}

/* Standard visually-hidden text: read by a screen reader, invisible to everyone else. The
   coarse progress summary lives here so the announcement exists without a second copy of
   the same numbers on screen. */
.mb-update-banner__visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

.mb-update-banner__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.mb-update-banner__actions .v-btn {
    /* An adequate target at every supported display scale. */
    min-height: 40px;
}

@media (max-width: 720px) {
    .mb-update-banner .mb-action-artwork {
        flex-basis: 100%;
        max-inline-size: none;
    }
}
</style>
