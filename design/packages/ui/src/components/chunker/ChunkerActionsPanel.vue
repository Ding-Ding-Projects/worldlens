<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VProgressLinear, VSwitch } from "vuetify/components";
import GhEntityPicker from "../github/GhEntityPicker.vue";
import { createGhCliAccountsStore, defaultGhCliAccountId } from "../github/ghCliAccountsStore.js";
import { resolveCiRenderBridge } from "../cirender/ciRenderBridge.js";
const props = defineProps<{ worldFolder: string; outputDirectory: string; targetFormat: string; config: object }>();
const { t } = useI18n();
const accounts = createGhCliAccountsStore();
const ci = resolveCiRenderBridge();
type Answer = { ok: boolean; value?: any; message?: string };
type Actions = Record<"prepare" | "start" | "list" | "recoverable" | "adopt" | "check" | "collect" | "cancel", (value?: unknown) => Promise<Answer>>;
const host = (globalThis as any).worldlens?.chunkerActions as Actions | undefined;
const accountId = ref<string | null>(null);
const repository = ref<string | null>(null);
const repositories = ref<any[]>([]);
const upload = ref(false);
const publicUpload = ref(false);
const busy = ref(false);
const message = ref("");
const record = ref<any>(null);
const history = ref<any[]>([]);
const recoverable = ref<any[]>([]);
const recoveryId = ref<string|null>(null);
const accountItems = computed(() => accounts.accounts.value.map((entry) => ({ title: `${entry.login} (${entry.host})`, value: entry.id, props: { disabled: !entry.healthy } })));
const repositoryItems = computed(() => repositories.value.map((entry) => ({ title: `${entry.fullName} (${entry.private ? "private" : "public"})`, value: entry.fullName, props: { disabled: !entry.canWrite } })));
const request = computed(() => ({ ...props, accountId: accountId.value ?? undefined, owner: repository.value?.split("/")[0] ?? "", repo: repository.value?.split("/")[1] ?? "", acknowledgeUpload: upload.value, acknowledgePublic: publicUpload.value }));
async function refreshRepositories(): Promise<void> {
    repositories.value = [];
    repository.value = null;
    const answer = await ci?.listExistingRepositories?.(accountId.value ?? undefined);
    if (answer?.ok) repositories.value = [...answer.value];
    else message.value = answer?.message ?? t("chunker.actions.repoDiscoveryUnavailable", "Repository discovery is unavailable. Open GitHub accounts in Settings.");
}
async function call(operation: keyof Actions, value?: unknown): Promise<void> {
    if (!host || busy.value) return;
    busy.value = true;
    try {
        const result = await host[operation](value);
        if (!result.ok) throw new Error(result.message ?? t("chunker.actions.operationFailed", "The operation did not finish."));
        if (operation === "list") history.value = result.value;
        else if (operation === 'recoverable') recoverable.value = result.value;
        else if (operation === "prepare") message.value = result.value.changed ? t("chunker.actions.workflowPrepared", { sha: result.value.commitSha }, "Workflow prepared at {sha}.") : t("chunker.actions.workflowCurrent", "The workflow is current.");
        else { record.value = result.value; message.value = result.value.message; }
    } catch (error) { message.value = error instanceof Error ? error.message : String(error); }
    finally { busy.value = false; }
}
onMounted(async () => {
    await accounts.load();
    accountId.value = defaultGhCliAccountId(accounts.accounts.value);
    await refreshRepositories();
    await call("list");
});
const timer=setInterval(()=>{if(record.value && ['uploading','dispatching','waiting'].includes(record.value.state) && !busy.value)void call('check',record.value.id);},10_000);
onBeforeUnmount(()=>clearInterval(timer));
</script>
<template>
    <section data-test="chunker-actions-panel">
        <h3>{{ t('chunker.actions.title', 'Convert with GitHub Actions') }}</h3>
        <p>{{ t('chunker.actions.explain', 'Choose the account and repository that will receive this world. Uploads use resumable 500 MiB parts. Prepare writes the bundled conversion workflow to the selected repository.') }}</p>
        <VAlert v-if="!host" type="warning">{{ t('chunker.actions.unavailable', 'This build has no conversion dispatch bridge.') }}</VAlert>
        <GhEntityPicker v-model="accountId" :items="accountItems" data-test-base="chunker-actions-account" :search-label="t('chunker.actions.accountSearch', 'Search accounts')" :select-label="t('chunker.actions.account', 'Run as account')" :selected-label="t('chunker.actions.accountSelected', 'Selected account')" :empty-message="t('chunker.actions.signIn', 'Sign in from GitHub accounts in Settings.')" :no-match-message="t('chunker.actions.noMatchingAccount', 'No matching account')" @update:model-value="refreshRepositories" />
        <GhEntityPicker v-model="repository" :items="repositoryItems" data-test-base="chunker-actions-repository" :search-label="t('chunker.actions.repoSearch', 'Search repositories')" :select-label="t('chunker.actions.repository', 'Conversion repository')" :selected-label="t('chunker.actions.repoSelected', 'Selected repository')" :empty-message="t('chunker.actions.noRepos', 'No writable repositories loaded.')" :no-match-message="t('chunker.actions.noMatchingRepo', 'No matching repository')" />
        <VBtn :disabled="busy" @click="refreshRepositories">{{ t('chunker.actions.refresh', 'Refresh repositories') }}</VBtn>
        <VSwitch v-model="upload" :label="t('chunker.actions.upload', 'I authorize uploading this world to the selected repository')" />
        <VSwitch v-if="repositories.find(entry => entry.fullName === repository)?.private === false" v-model="publicUpload" :label="t('chunker.actions.public', 'I understand this repository makes the uploaded world public')" />
        <VBtn :disabled="busy || !repository || !host" @click="call('prepare', request)">{{ t('chunker.actions.prepare', 'Prepare conversion workflow') }}</VBtn>
        <VBtn :disabled="busy || !repository || !upload || !host || !worldFolder || !outputDirectory" @click="call('start', request)">{{ t('chunker.actions.start', 'Upload and convert') }}</VBtn>
        <p role="status" aria-live="polite">{{ message }}</p>
        <VBtn :disabled="busy" @click="call('recoverable')">{{ t('chunker.actions.findRecoverable', 'Find saved conversions from before restart') }}</VBtn>
        <GhEntityPicker v-if="recoverable.length" v-model="recoveryId" :items="recoverable.map(entry=>({title:`${entry.repository}: ${entry.state} ${entry.updatedAt}`,value:entry.id}))" data-test-base="chunker-actions-recovery" :search-label="t('chunker.actions.searchRecoverable', 'Search recoverable conversions')" :select-label="t('chunker.actions.recoverableToRecover', 'Saved conversion to recover')" :selected-label="t('chunker.actions.recoverableSelected', 'Selected conversion')" :empty-message="t('chunker.actions.noRecoverable', 'No recoverable conversions')" :no-match-message="t('chunker.actions.noMatchingConversion', 'No matching conversion')" />
        <VBtn v-if="recoveryId" :disabled="busy" @click="call('adopt',{id:recoveryId,confirmed:true})">{{ t('chunker.actions.recoverHere', 'Recover this saved conversion in this window') }}</VBtn>
        <section v-if="record" data-test="chunker-actions-progress">
            <p>{{ record.state }} · {{ record.bytesDone }} / {{ record.bytesTotal }} bytes</p>
            <VProgressLinear :model-value="record.bytesTotal > 0 ? 100 * record.bytesDone / record.bytesTotal : 0" :indeterminate="record.state === 'waiting'" />
            <a v-if="record.run" :href="record.run.htmlUrl" target="_blank" rel="noopener">{{ t('chunker.actions.run', 'Open conversion run') }}</a>
            <ul><li v-for="job in record.jobs" :key="job.id">{{ job.name }}: {{ job.status }} · {{ job.conclusion ?? t('chunker.actions.pending', 'pending') }}</li></ul>
            <VBtn :disabled="busy" @click="call('check', record.id)">{{ t('chunker.actions.check', 'Check progress or resume upload') }}</VBtn>
            <VBtn :disabled="busy || record.state !== 'completed'" @click="call('collect', record.id)">{{ t('chunker.actions.collect', 'Verify and collect converted world') }}</VBtn>
            <VBtn :disabled="busy" @click="call('cancel', record.id)">{{ t('chunker.actions.cancel', 'Request cancellation') }}</VBtn>
        </section>
        <GhEntityPicker v-if="history.length" :model-value="record?.id" :items="history.map(entry => ({ title: `${entry.request.owner}/${entry.request.repo}: ${entry.state} ${entry.updatedAt}`, value: entry.id }))" data-test-base="chunker-actions-history" :search-label="t('chunker.actions.searchHistory', 'Search saved conversions')" :select-label="t('chunker.actions.resumeHistory', 'Resume saved conversion')" :selected-label="t('chunker.actions.historySelected', 'Selected conversion')" :empty-message="t('chunker.actions.noHistory', 'No saved conversions')" :no-match-message="t('chunker.actions.noMatchingConversion', 'No matching conversion')" @update:model-value="id => record = history.find(entry => entry.id === id)" />
    </section>
</template>
