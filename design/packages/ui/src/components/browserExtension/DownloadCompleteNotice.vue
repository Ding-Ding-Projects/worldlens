<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn } from "vuetify/components";

import type { FinishedDownload } from "./downloadCaptureStore.js";

/**
 * State 3 of the browser-extension capture flow: the non-blocking completion notice.
 *
 * A corner toast, not a dialog - this is exactly the kind of "only informs" surface this
 * project's own rules require to be non-blocking, and it never fires until the transfer
 * this file describes has genuinely reached `completed`, `cancelled` or `failed`. The
 * outcome comes straight from the finished record the store wrote; nothing here infers a
 * success from silence. It still needs to sit above the originating browser and
 * application windows until dismissed, which is the shell's job at the window-manager
 * level - see the doc comment at the top of `browserExtensionHost.ts` for the seam that
 * would carry that request to the desktop shell.
 */
const props = defineProps<{
    readonly entry: FinishedDownload;
}>();

const emit = defineEmits<{
    dismiss: [id: string];
}>();

const { t } = useI18n();

const message = computed(() => {
    const filename = props.entry.download.filename;
    switch (props.entry.outcome.kind) {
        case "completed":
            return t(
                "browserExtension.complete.completed",
                { filename },
                "{filename} finished downloading.",
            );
        case "cancelled":
            return t(
                "browserExtension.complete.cancelled",
                { filename },
                "{filename} was cancelled.",
            );
        case "failed":
            return t(
                "browserExtension.complete.failed",
                { filename, reason: props.entry.outcome.reason },
                "{filename} failed: {reason}",
            );
    }
});

const severity = computed<"success" | "warning" | "error">(() => {
    switch (props.entry.outcome.kind) {
        case "completed":
            return "success";
        case "cancelled":
            return "warning";
        case "failed":
            return "error";
    }
});

function onDismiss(): void {
    emit("dismiss", props.entry.download.id);
}
</script>

<template>
    <VAlert
        :type="severity"
        variant="tonal"
        density="compact"
        closable
        class="mb-download-complete-notice"
        role="status"
        :title="t('browserExtension.complete.title', 'Download complete')"
        @click:close="onDismiss"
    >
        <span data-test="download-complete-message">{{ message }}</span>
        <template #append>
            <VBtn size="small" variant="text" data-test="download-complete-dismiss" @click="onDismiss">
                {{ t("browserExtension.complete.dismiss", "Dismiss") }}
            </VBtn>
        </template>
    </VAlert>
</template>

<style scoped>
.mb-download-complete-notice {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    max-width: 360px;
    z-index: 2400;
}
</style>
