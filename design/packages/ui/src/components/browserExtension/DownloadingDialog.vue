<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDialog, VProgressLinear } from "vuetify/components";

import type { CapturedDownload, DownloadProgress } from "./downloadCapture.js";
import { formatBytes, formatEta, formatRate, percentDone } from "./downloadCapture.js";

/**
 * State 2 of the browser-extension capture flow: the IDM-style Downloading surface.
 *
 * Distinct from any background table row, on purpose - a download that is genuinely
 * moving deserves a surface of its own, the way Internet Download Manager's own dialog
 * does, rather than a line in a list that somebody has to go looking for. Every number
 * here is read straight from the live {@link DownloadProgress} this dialog was handed;
 * nothing is computed as a fake tick of a timer. Pause, resume and cancel emit real events
 * that the host wires to the actual transfer - see `browserExtensionHost.ts` - and this
 * component never pretends a click succeeded before the host confirms it.
 *
 * A countdown or a rate is never the only carrier of meaning here: the ETA and the rate
 * both render as words next to the number, and "not known yet" is a real, spoken state
 * rather than a blank spot where a number should be.
 */
const props = defineProps<{
    readonly download: CapturedDownload | null;
    readonly progress: DownloadProgress | null;
}>();

const emit = defineEmits<{
    pause: [id: string];
    resume: [id: string];
    cancel: [id: string];
}>();

const { t } = useI18n();

const open = computed(() => props.download !== null && props.progress !== null);

const percent = computed(() => (props.progress === null ? null : percentDone(props.progress)));
const rateLabel = computed(() => formatRate(props.progress?.ratePerSecond ?? null));
const etaLabel = computed(() => formatEta(props.progress?.etaSeconds ?? null));
const unknownLabel = computed(() => t("browserExtension.downloading.unknown", "Not known yet"));

const downloadedLabel = computed(() => {
    if (props.progress === null) return "";
    const done = formatBytes(props.progress.bytesDone);
    return props.progress.bytesTotal === null
        ? done
        : `${done} / ${formatBytes(props.progress.bytesTotal)}`;
});

function onPause(): void {
    if (props.download !== null) emit("pause", props.download.id);
}
function onResume(): void {
    if (props.download !== null) emit("resume", props.download.id);
}
function onCancel(): void {
    if (props.download !== null) emit("cancel", props.download.id);
}
</script>

<template>
    <VDialog :model-value="open" persistent max-width="480" data-test="downloading-dialog">
        <VCard v-if="download && progress" role="dialog" :aria-label="t('browserExtension.downloading.title', 'Downloading')">
            <VCardTitle>{{ t("browserExtension.downloading.title", "Downloading") }} - {{ download.filename }}</VCardTitle>
            <VCardText>
                <p class="mb-lede" data-test="downloading-lede">
                    {{ t("browserExtension.downloading.lede", "This is the real transfer, watched live. The controls below operate the real download; nothing here is a simulated progress value.") }}
                </p>

                <VProgressLinear
                    :model-value="percent ?? 0"
                    :indeterminate="percent === null"
                    height="10"
                    rounded
                    color="primary"
                    data-test="downloading-progress-bar"
                />

                <dl class="mb-download-fields">
                    <div>
                        <dt>{{ t("browserExtension.downloading.downloaded", "Downloaded") }}</dt>
                        <dd data-test="downloading-bytes">{{ downloadedLabel }}</dd>
                    </div>
                    <div>
                        <dt>{{ t("browserExtension.downloading.rate", "Rate") }}</dt>
                        <dd data-test="downloading-rate">{{ rateLabel ?? unknownLabel }}</dd>
                    </div>
                    <div>
                        <dt>{{ t("browserExtension.downloading.eta", "Time remaining") }}</dt>
                        <dd data-test="downloading-eta">{{ etaLabel ?? unknownLabel }}</dd>
                    </div>
                </dl>

                <p
                    v-if="progress.state === 'failed'"
                    class="mb-download-error"
                    role="alert"
                    data-test="downloading-error"
                >
                    {{ t("browserExtension.downloading.stateFailed", "Failed") }}:
                    {{ progress.errorMessage }}
                </p>
                <p v-else-if="progress.state === 'paused'" data-test="downloading-paused">
                    {{ t("browserExtension.downloading.statePaused", "Paused") }}
                </p>
            </VCardText>
            <VCardActions>
                <VBtn
                    v-if="progress.state === 'downloading'"
                    variant="text"
                    data-test="downloading-pause"
                    @click="onPause"
                >
                    {{ t("browserExtension.downloading.pause", "Pause") }}
                </VBtn>
                <VBtn
                    v-if="progress.state === 'paused'"
                    variant="text"
                    data-test="downloading-resume"
                    @click="onResume"
                >
                    {{ t("browserExtension.downloading.resume", "Resume") }}
                </VBtn>
                <VBtn color="error" variant="text" data-test="downloading-cancel" @click="onCancel">
                    {{ t("browserExtension.downloading.cancel", "Cancel download") }}
                </VBtn>
            </VCardActions>
        </VCard>
    </VDialog>
</template>

<style scoped>
.mb-download-fields {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.75rem;
}

.mb-download-fields dt {
    font-weight: 600;
    font-size: 0.8rem;
    opacity: 0.75;
}

.mb-download-fields dd {
    margin: 0;
}

.mb-download-error {
    color: rgb(var(--v-theme-error));
    margin-top: 0.75rem;
}
</style>
