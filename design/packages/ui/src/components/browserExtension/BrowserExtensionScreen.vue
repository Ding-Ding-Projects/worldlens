<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VList, VListItem } from "vuetify/components";

import { useBrowserExtensionHost, browserExtensionHostMissingReason } from "./browserExtensionHost.js";
import DownloadCompleteNotice from "./DownloadCompleteNotice.vue";
import DownloadingDialog from "./DownloadingDialog.vue";
import StartDownloadDialog from "./StartDownloadDialog.vue";
import {
    activeDownloadCaptures,
    confirmDownload,
    declineDownload,
    dismissFinished,
    finishedDownloads,
    pendingDownloads,
    proposeDownload,
    updateDownloadProgress,
} from "./downloadCaptureStore.js";

/**
 * The page that hosts the three browser-extension capture states end to end.
 *
 * Mounted once, on its own tab, so a capture is reachable the same way every other surface
 * in this application is - see `../surfacesReachable.test.ts` for why that is a real risk
 * rather than a formality. The host seam is probed once here and the missing-host message
 * is what renders when this build has no bridge to a real extension, exactly the way
 * `LockList.vue` reports a missing lock host instead of drawing dead controls.
 *
 * Only one pending proposal is decided at a time: the Start dialog shows the oldest one in
 * the queue, and the rest wait their turn, which is the same one-decision-at-a-time shape
 * the destructive-action gate already uses elsewhere in this application.
 */
const { t } = useI18n();
const host = useBrowserExtensionHost();

const pending = pendingDownloads();
const active = activeDownloadCaptures();
const finished = finishedDownloads();

const currentPending = () => pending.value[0] ?? null;

let unsubscribeProgress: (() => void) | null = null;
let unsubscribeCaptured: (() => void) | null = null;

onMounted(() => {
    if (host === null) return;
    unsubscribeProgress = host.onProgress((id, progress) => updateDownloadProgress(id, progress));
    unsubscribeCaptured = host.onCaptured((download) => proposeDownload(download));
});

onUnmounted(() => {
    unsubscribeProgress?.();
    unsubscribeCaptured?.();
});

async function onConfirm(id: string): Promise<void> {
    const download = confirmDownload(id);
    if (download !== null && host !== null) await host.startDownload(download);
}

function onCancelPending(id: string): void {
    declineDownload(id);
}

async function onPause(id: string): Promise<void> {
    if (host !== null) await host.pauseDownload(id);
}
async function onResume(id: string): Promise<void> {
    if (host !== null) await host.resumeDownload(id);
}
async function onCancelActive(id: string): Promise<void> {
    if (host !== null) await host.cancelDownload(id);
}

function onDismiss(id: string): void {
    dismissFinished(id);
}
</script>

<template>
    <section class="mb-browser-extension" data-test="browser-extension-screen">
        <h2 class="mb-page-title">{{ t("tabs.page.browserExtension", "Browser downloads") }}</h2>
        <p class="mb-lede">
            {{ t("browserExtension.page.lede", "Every download a browser extension hands to this application: proposed, started, watched, finished, in that order.") }}
        </p>

        <VAlert v-if="host === null" type="info" variant="tonal" density="compact">
            <span data-test="browser-extension-no-host">
                {{ t("browserExtension.start.noHost", browserExtensionHostMissingReason()) }}
            </span>
        </VAlert>

        <template v-else>
            <StartDownloadDialog
                :download="currentPending()"
                @confirm="onConfirm"
                @cancel="onCancelPending"
            />

            <DownloadingDialog
                v-for="entry in active"
                :key="entry.download.id"
                :download="entry.download"
                :progress="entry.progress"
                @pause="onPause"
                @resume="onResume"
                @cancel="onCancelActive"
            />

            <DownloadCompleteNotice
                v-for="entry in finished.slice(0, 1)"
                :key="entry.download.id"
                :entry="entry"
                @dismiss="onDismiss"
            />

            <p
                v-if="pending.length === 0 && active.length === 0 && finished.length === 0"
                class="text-medium-emphasis"
                data-test="browser-extension-empty"
            >
                {{ t("browserExtension.list.empty", "No captures yet. This page fills in when a browser extension hands this application a file to download.") }}
            </p>

            <VList v-else density="compact" class="mt-2" data-test="browser-extension-finished-list">
                <VListItem v-for="entry in finished" :key="entry.download.id + entry.finishedAt">
                    <VListItem-title>{{ entry.download.filename }}</VListItem-title>
                    <VListItem-subtitle>{{ entry.outcome.kind }} - {{ entry.finishedAt }}</VListItem-subtitle>
                </VListItem>
            </VList>
        </template>
    </section>
</template>

<style scoped>
.mb-browser-extension {
    padding: 1rem;
}
</style>
