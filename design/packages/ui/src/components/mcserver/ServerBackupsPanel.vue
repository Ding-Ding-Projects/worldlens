<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VCard, VCardText, VChip, VList, VListItem, VSelect, VSwitch, VTextField } from "vuetify/components";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { backupAuthorizeRestore, backupCancel, backupCreate, backupIssueRestoreChallenge, backupIssueRestoreReceipt, backupList, backupRestore, backupRestoreStep, type BackupEntry } from "./mcserverBridge.js";
import { useServerStore } from "./useServers.js";

const props = defineProps<{ serverId: string }>();
const { t } = useI18n();
const store = useServerStore();
const owner = ref("");
const repo = ref("");
const worldFolder = ref("");
const selectedTag = ref("");
const entries = ref<readonly BackupEntry[]>([]);
const worldOptions = ref<string[]>([]);
const worldsLoading = ref(false);
const message = ref<string | null>(null);
const busy = ref(false);
const backupConsent = ref(false);
const restoreConsent = ref(false);
const restoreChallenge = ref<string | null>(null);
let transitionQueue = Promise.resolve();
let sentKeyOne = false;
let sentKeyTwo = false;
let sentTravel = false;
const server = computed(() => store.get(props.serverId));
const target = computed(() => worldFolder.value.trim() || server.value?.ref.serverDir || "/data");
const targetValid = computed(() => {
    const root = server.value?.ref.serverDir;
    return root !== undefined && (target.value === root || target.value.startsWith(`${root.replace(/\/$/, "")}/`));
});

async function refresh(): Promise<void> {
    if (busy.value) return;
    if (owner.value.trim() === "" || repo.value.trim() === "") return;
    busy.value = true;
    const result = await backupList(owner.value.trim(), repo.value.trim());
    busy.value = false;
    if (result.ok) entries.value = result.value ?? [];
    else message.value = result.failure?.message ?? t("mcserver.backup.listFailed", "Backups could not be listed.");
}
async function create(): Promise<void> {
    if (busy.value) return;
    if (owner.value.trim() === "" || repo.value.trim() === "" || server.value === undefined) return;
    busy.value = true;
    const result = await backupCreate(props.serverId, {
        owner: owner.value.trim(),
        repo: repo.value.trim(),
        worldFolder: target.value,
        ...(server.value.origin === "adopted" ? { backupConsent: backupConsent.value } : {}),
    });
    busy.value = false;
    message.value = result.ok ? t("mcserver.backup.created", "Backup created.") : result.failure?.message ?? t("mcserver.backup.createFailed", "Backup could not be created.");
    if (result.ok) await refresh();
}
async function cancel(): Promise<void> {
    if (!busy.value) return;
    const result = await backupCancel(props.serverId);
    message.value = result.ok ? t("mcserver.backup.cancelRequested", "Cancellation requested. The current transfer will finish its safe cleanup before stopping.") : result.failure?.message ?? t("mcserver.backup.cancelFailed", "The active backup could not be cancelled.");
}
async function restore(): Promise<void> {
    if (busy.value) return;
    if (selectedTag.value === "" || owner.value.trim() === "" || repo.value.trim() === "") return;
    if (restoreChallenge.value === null || !sentKeyOne || !sentKeyTwo || !sentTravel) {
        message.value = t("mcserver.backup.challengeMissing", "Open the restore confirmation again so the main process can issue a fresh challenge.");
        return;
    }
    busy.value = true;
    await transitionQueue;
    const authorized = await backupAuthorizeRestore(props.serverId, { challenge: restoreChallenge.value });
    if (!authorized.ok || authorized.value === undefined) {
        busy.value = false;
        message.value = authorized.failure?.message ?? t("mcserver.backup.authorizeFailed", "The main native confirmation did not authorize this restore.");
        return;
    }
    const receipt = await backupIssueRestoreReceipt(props.serverId, {
        owner: owner.value.trim(), repo: repo.value.trim(), tag: selectedTag.value, worldFolder: target.value,
        challenge: restoreChallenge.value, authorization: authorized.value.authorization,
    });
    if (!receipt.ok || receipt.value === undefined) {
        busy.value = false;
        message.value = receipt.failure?.message ?? t("mcserver.backup.confirmFailed", "Restore confirmation could not be issued.");
        return;
    }
    const result = await backupRestore(props.serverId, {
        owner: owner.value.trim(), repo: repo.value.trim(), tag: selectedTag.value, worldFolder: target.value,
        ...(server.value?.origin === "adopted" ? { restoreConsent: restoreConsent.value } : {}), restoreReceipt: receipt.value.receipt,
    });
    busy.value = false;
    message.value = result.ok ? t("mcserver.backup.restored", "Restore completed.") : result.failure?.message ?? t("mcserver.backup.restoreFailed", "Restore could not be completed.");
}
async function prepareRestoreChallenge(): Promise<void> {
    restoreChallenge.value = null;
    sentKeyOne = false;
    sentKeyTwo = false;
    sentTravel = false;
    transitionQueue = Promise.resolve();
    if (selectedTag.value === "" || owner.value.trim() === "" || repo.value.trim() === "") return;
    const result = await backupIssueRestoreChallenge(props.serverId, { owner: owner.value.trim(), repo: repo.value.trim(), tag: selectedTag.value, worldFolder: target.value });
    if (result.ok && result.value) restoreChallenge.value = result.value.challenge;
    else message.value = result.failure?.message ?? t("mcserver.backup.challengeFailed", "The main process could not prepare this restore confirmation.");
}
function recordRestoreTransition(value: { keyOne: boolean; keyTwo: boolean; travel: number }): void {
    if (restoreChallenge.value === null) return;
    const step = !sentKeyOne && value.keyOne
        ? { step: "key-one" as const, value: true }
        : !sentKeyTwo && value.keyTwo
            ? { step: "key-two" as const, value: true }
            : !sentTravel && value.travel === 100
                ? { step: "slider" as const, value: 100 as const }
                : null;
    if (step === null) return;
    if (step.step === "key-one") sentKeyOne = true;
    if (step.step === "key-two") sentKeyTwo = true;
    if (step.step === "slider") sentTravel = true;
    transitionQueue = transitionQueue.then(async () => {
        const result = await backupRestoreStep(props.serverId, { challenge: restoreChallenge.value!, ...step });
        if (!result.ok) message.value = result.failure?.message ?? t("mcserver.backup.challengeStepFailed", "The main process rejected a confirmation transition.");
    });
}
onMounted(async () => {
    worldFolder.value = server.value?.ref.serverDir ?? "";
    worldsLoading.value = true;
    const result = await store.worldsList(props.serverId);
    worldsLoading.value = false;
    if (result.ok) {
        worldOptions.value = (result.value ?? []).map((world) => world.folder);
        if (worldOptions.value.length > 0) worldFolder.value = worldOptions.value[0]!;
    } else {
        message.value = result.failure?.message ?? t("mcserver.backup.worldsFailed", "The mounted world folders could not be listed.");
    }
});
</script>

<template>
    <VCard flat>
        <VCardText>
            <div class="text-subtitle-1">{{ t("mcserver.backup.title", "Backups and restore") }}</div>
            <div class="text-body-2 mb-3">{{ t("mcserver.backup.scope", { server: server?.name ?? serverId, target }) }}</div>
            <div class="wl-mcserver-backup-fields">
                <VTextField v-model="owner" :label="t('mcserver.backup.owner', 'Backup owner')" autocomplete="off" />
                <VTextField v-model="repo" :label="t('mcserver.backup.repository', 'Backup repository')" autocomplete="off" />
                <VSelect v-model="worldFolder" :items="worldOptions" :loading="worldsLoading" :label="t('mcserver.backup.target', 'Mounted world folder')" :hint="t('mcserver.backup.targetHint', 'Choose a discovered world folder. The server host validates it again before any transfer.')" persistent-hint />
            </div>
            <div class="d-flex ga-2 mb-3">
                <VBtn :loading="busy" :disabled="owner.trim() === '' || repo.trim() === '' || !targetValid" variant="tonal" @click="refresh">{{ t("mcserver.backup.refresh", "Refresh backups") }}</VBtn>
                <VBtn :loading="busy" :disabled="owner.trim() === '' || repo.trim() === '' || !targetValid || (server?.origin === 'adopted' && !backupConsent)" color="primary" @click="create">{{ t("mcserver.backup.create", "Create backup") }}</VBtn>
                <VBtn v-if="busy" variant="text" color="error" @click="cancel">{{ t("mcserver.backup.cancel", "Cancel") }}</VBtn>
            </div>
            <VProgressLinear v-if="busy" indeterminate color="primary" class="mb-3" role="progressbar" :aria-label="t('mcserver.backup.progress', 'Backup operation in progress')" />
            <VAlert v-if="!targetValid" type="warning" variant="tonal" class="mb-3">{{ t("mcserver.backup.targetInvalid", "Choose a mounted folder inside this server's recognized directory.") }}</VAlert>
            <VSwitch v-if="server?.origin === 'adopted'" v-model="backupConsent" :label="t('mcserver.backup.consent', 'I consent to reading this adopted server for backup')" density="compact" hide-details class="mb-2" />
            <VSwitch v-if="server?.origin === 'adopted'" v-model="restoreConsent" :label="t('mcserver.backup.restoreConsent', 'I consent to restoring this adopted server')" density="compact" hide-details class="mb-2" />
            <VAlert v-if="message" type="info" variant="tonal" class="mb-3">{{ message }}</VAlert>
            <VList v-if="entries.length > 0" lines="two" class="mb-3">
                <VListItem v-for="entry in entries" :key="entry.tag" :active="selectedTag === entry.tag" @click="selectedTag = entry.tag">
                    <template #title>{{ entry.tag }}</template>
                    <template #subtitle>{{ entry.createdAt }} <span v-if="entry.sizeBytes !== null">· {{ entry.sizeBytes }} bytes</span></template>
                    <template #append><VChip size="small" variant="tonal">{{ selectedTag === entry.tag ? t("mcserver.backup.selected", "Selected") : t("mcserver.backup.select", "Select") }}</VChip></template>
                </VListItem>
            </VList>
            <div v-else class="text-body-2">{{ t("mcserver.backup.empty", "No verified backups are listed yet.") }}</div>
            <ConfigSuperConfirm
                :title="t('mcserver.backup.restoreTitle', 'Restore this world')"
                :action="t('mcserver.backup.restoreAction', { server: server?.name ?? serverId, tag: selectedTag || '(none)', target })"
                :affected="[server?.name ?? serverId, selectedTag || '(none)', target]"
                :confirm-label="t('mcserver.backup.restore', 'Restore')"
                :disabled="selectedTag === '' || busy || !targetValid || (server?.origin === 'adopted' && !restoreConsent)"
                @open="prepareRestoreChallenge"
                @progress="recordRestoreTransition"
                @confirm="restore"
            />
        </VCardText>
    </VCard>
</template>
