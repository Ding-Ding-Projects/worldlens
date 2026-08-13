<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDialog } from "vuetify/components";

import type { CapturedDownload } from "./downloadCapture.js";
import { formatBytes } from "./downloadCapture.js";

/**
 * State 1 of the browser-extension capture flow: the decision surface that opens before
 * any transfer begins.
 *
 * This is a real decision, not a preview. Nothing has been queued, nothing has been
 * written to disk, and no byte has moved - confirming here is the action that starts the
 * real transfer, and cancelling leaves the pending queue exactly as it was. The dialog
 * names the proposed file, its source and its destination in plain fields rather than a
 * paragraph, so a person can check all three before agreeing to any of them.
 *
 * It is modal by design: this is one of the two states this contract requires to stay
 * above the originating browser and application windows until the user resolves or
 * dismisses it, and a non-blocking notification cannot do that.
 */
const props = defineProps<{
    readonly download: CapturedDownload | null;
}>();

const emit = defineEmits<{
    confirm: [id: string];
    cancel: [id: string];
}>();

const { t } = useI18n();

const open = computed(() => props.download !== null);

const sizeLabel = computed(() =>
    props.download?.sizeBytes === null || props.download?.sizeBytes === undefined
        ? t("browserExtension.start.sizeUnknown", "Unknown")
        : formatBytes(props.download.sizeBytes),
);

function onConfirm(): void {
    if (props.download !== null) emit("confirm", props.download.id);
}

function onCancel(): void {
    if (props.download !== null) emit("cancel", props.download.id);
}
</script>

<template>
    <VDialog :model-value="open" persistent max-width="480" data-test="start-download-dialog">
        <VCard v-if="download" role="alertdialog" :aria-label="t('browserExtension.start.title', 'Start download')">
            <VCardTitle>{{ t("browserExtension.start.title", "Start download") }}</VCardTitle>
            <VCardText>
                <p class="mb-lede" data-test="start-download-lede">
                    {{ t("browserExtension.start.lede", "This file has not started downloading. Confirm starts the real transfer; cancel leaves the queue unchanged.") }}
                </p>
                <dl class="mb-start-fields">
                    <div>
                        <dt>{{ t("browserExtension.start.fileLabel", "File") }}</dt>
                        <dd data-test="start-download-filename">{{ download.filename }}</dd>
                    </div>
                    <div>
                        <dt>{{ t("browserExtension.start.sourceLabel", "Source") }}</dt>
                        <dd data-test="start-download-source">{{ download.sourceUrl }}</dd>
                    </div>
                    <div>
                        <dt>{{ t("browserExtension.start.destinationLabel", "Destination") }}</dt>
                        <dd data-test="start-download-destination">{{ download.destination }}</dd>
                    </div>
                    <div>
                        <dt>{{ t("browserExtension.start.sizeLabel", "Size") }}</dt>
                        <dd data-test="start-download-size">{{ sizeLabel }}</dd>
                    </div>
                </dl>
            </VCardText>
            <VCardActions>
                <VBtn variant="text" data-test="start-download-cancel" @click="onCancel">
                    {{ t("browserExtension.start.cancel", "Cancel") }}
                </VBtn>
                <VBtn color="primary" variant="tonal" data-test="start-download-confirm" @click="onConfirm">
                    {{ t("browserExtension.start.confirm", "Start download") }}
                </VBtn>
            </VCardActions>
        </VCard>
    </VDialog>
</template>

<style scoped>
.mb-start-fields {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.75rem;
}

.mb-start-fields dt {
    font-weight: 600;
    font-size: 0.8rem;
    opacity: 0.75;
}

.mb-start-fields dd {
    margin: 0;
    word-break: break-all;
}
</style>
