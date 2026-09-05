<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VProgressLinear, VRadio, VRadioGroup, VSwitch, VTextField } from "vuetify/components";
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

/** workflow_dispatch `world-source`. Everything below the picker changes shape with it. */
const WORLD_SOURCES = ["release-asset", "url", "artifact"] as const;
type WorldSource = typeof WORLD_SOURCES[number];
const worldSource = ref<WorldSource>("release-asset");
/** workflow_dispatch `world`. Blank while worldSource is release-asset means "upload worldFolder for me". */
const externalWorld = ref("");
/** workflow_dispatch `world-repository`. Blank means "this repository" (the destination chosen below). */
const sourceRepository = ref("");
/** workflow_dispatch `output-name` prefix; the app appends the conversion's own id so collection stays exact. */
const outputName = ref("converted-world");
const OUTPUT_MODES = ["artifact", "artifact-and-release"] as const;
type OutputMode = typeof OUTPUT_MODES[number];
const output = ref<OutputMode>("artifact");
const maxJobs = ref("64");
const regionsPerShard = ref("64");
type PruneMode = "none" | "guided" | "text";
const pruneMode = ref<PruneMode>("none");
const pruneMinX = ref<number | null>(null);
const pruneMinZ = ref<number | null>(null);
const pruneMaxX = ref<number | null>(null);
const pruneMaxZ = ref<number | null>(null);
const pruneText = ref("");

/** True exactly when this app uploads worldFolder itself, rather than dispatching against a world the user already pointed at elsewhere. */
const usesOwnUpload = computed(() => worldSource.value === "release-asset" && externalWorld.value.trim() === "");

const worldHint = computed(() => {
    if (worldSource.value === "release-asset") return t("chunker.actions.worldHintReleaseAsset", 'Leave blank to upload this world automatically, or name an existing release asset as "tag/asset".');
    if (worldSource.value === "url") return t("chunker.actions.worldHintUrl", "A direct link to a .zip of the world.");
    return t("chunker.actions.worldHintArtifact", 'An existing workflow artifact, as "run-id/artifact-name".');
});
const worldPlaceholder = computed(() => {
    if (worldSource.value === "release-asset") return t("chunker.actions.worldPlaceholderReleaseAsset", "world.zip");
    if (worldSource.value === "url") return t("chunker.actions.worldPlaceholderUrl", "https://example.com/world.zip");
    return t("chunker.actions.worldPlaceholderArtifact", "123456789/world");
});

const pruneBounds = computed(() => {
    if (pruneMode.value === "text") return pruneText.value.trim();
    if (pruneMode.value === "guided") {
        const parts = [pruneMinX.value, pruneMinZ.value, pruneMaxX.value, pruneMaxZ.value];
        return parts.every((part) => part !== null && Number.isInteger(part)) ? parts.join(",") : "";
    }
    return "";
});
const pruneBoundsBackwards = computed(() => pruneMode.value === "guided" && pruneMinX.value !== null && pruneMaxX.value !== null && pruneMinZ.value !== null && pruneMaxZ.value !== null && (pruneMinX.value > pruneMaxX.value || pruneMinZ.value > pruneMaxZ.value));
const pruneTextInvalid = computed(() => pruneMode.value === "text" && pruneText.value.trim() !== "" && !/^-?\d+,-?\d+,-?\d+,-?\d+$/.test(pruneText.value.trim()));

const maxJobsInvalid = computed(() => !/^\d+$/.test(maxJobs.value) || Number(maxJobs.value) < 1 || Number(maxJobs.value) > 256);
const regionsPerShardInvalid = computed(() => !/^\d+$/.test(regionsPerShard.value) || Number(regionsPerShard.value) < 1);
const sourceRepositoryInvalid = computed(() => sourceRepository.value.trim() !== "" && !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(sourceRepository.value.trim()));
const externalWorldRequired = computed(() => !usesOwnUpload.value && externalWorld.value.trim() === "");

const accountItems = computed(() => accounts.accounts.value.map((entry) => ({ title: `${entry.login} (${entry.host})`, value: entry.id, props: { disabled: !entry.healthy } })));
const repositoryItems = computed(() => repositories.value.map((entry) => ({ title: `${entry.fullName} (${entry.private ? "private" : "public"})`, value: entry.fullName, props: { disabled: !entry.canWrite } })));
const request = computed(() => ({
    ...props,
    accountId: accountId.value ?? undefined,
    owner: repository.value?.split("/")[0] ?? "",
    repo: repository.value?.split("/")[1] ?? "",
    acknowledgeUpload: upload.value,
    acknowledgePublic: publicUpload.value,
    worldSource: worldSource.value,
    externalWorld: externalWorld.value.trim(),
    sourceRepository: sourceRepository.value.trim(),
    outputName: outputName.value.trim(),
    output: output.value,
    maxJobs: maxJobs.value,
    regionsPerShard: regionsPerShard.value,
    pruneBounds: pruneBounds.value,
}));
const canStart = computed(() =>
    !busy.value && !!repository.value && !!host && !!props.worldFolder && !!props.outputDirectory &&
    (!usesOwnUpload.value || upload.value) &&
    !externalWorldRequired.value && !sourceRepositoryInvalid.value &&
    !maxJobsInvalid.value && !regionsPerShardInvalid.value && !pruneBoundsBackwards.value && !pruneTextInvalid.value,
);
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

        <h4 class="mt-4">{{ t('chunker.actions.worldSourceTitle', 'Where the world comes from') }}</h4>
        <VRadioGroup v-model="worldSource" inline hide-details data-test="chunker-actions-world-source">
            <VRadio value="release-asset" :label="t('chunker.actions.worldSourceReleaseAsset', 'A release asset (this app can upload it for you)')" data-test="chunker-actions-world-source-release-asset" />
            <VRadio value="url" :label="t('chunker.actions.worldSourceUrl', 'A direct URL')" data-test="chunker-actions-world-source-url" />
            <VRadio value="artifact" :label="t('chunker.actions.worldSourceArtifact', 'An existing workflow artifact')" data-test="chunker-actions-world-source-artifact" />
        </VRadioGroup>
        <VTextField
            v-model="externalWorld"
            :label="t('chunker.actions.world', 'World')"
            :placeholder="worldPlaceholder"
            :hint="worldHint"
            persistent-hint
            :error-messages="externalWorldRequired ? [t('chunker.actions.worldRequired', 'Give the world for this source before starting.')] : []"
            data-test="chunker-actions-world"
        />
        <VTextField
            v-model="sourceRepository"
            :label="t('chunker.actions.worldRepository', 'World repository (owner/name)')"
            :placeholder="t('chunker.actions.worldRepositoryPlaceholder', 'owner/name')"
            :hint="t('chunker.actions.worldRepositoryHint', 'Only used for a release asset or artifact. Blank means the repository chosen above.')"
            persistent-hint
            :error-messages="sourceRepositoryInvalid ? [t('chunker.actions.worldRepositoryInvalid', 'Must be owner/name, or blank.')] : []"
            data-test="chunker-actions-world-repository"
        />

        <VSwitch v-if="usesOwnUpload" v-model="upload" :label="t('chunker.actions.upload', 'I authorize uploading this world to the selected repository')" />
        <VSwitch v-if="usesOwnUpload && repositories.find(entry => entry.fullName === repository)?.private === false" v-model="publicUpload" :label="t('chunker.actions.public', 'I understand this repository makes the uploaded world public')" />

        <h4 class="mt-4">{{ t('chunker.actions.pruneTitle', 'Trim which regions are even converted') }}</h4>
        <VRadioGroup v-model="pruneMode" inline hide-details data-test="chunker-actions-prune-mode">
            <VRadio value="none" :label="t('chunker.actions.pruneNone', 'Convert the whole world')" data-test="chunker-actions-prune-none" />
            <VRadio value="guided" :label="t('chunker.actions.pruneGuided', 'Trim to a chunk boundary')" data-test="chunker-actions-prune-guided" />
            <VRadio value="text" :label="t('chunker.actions.pruneText', 'Enter bounds as text')" data-test="chunker-actions-prune-text" />
        </VRadioGroup>
        <div v-if="pruneMode === 'guided'" class="mb-chunker-bounds" data-test="chunker-actions-prune-guided-fields">
            <VTextField v-model.number="pruneMinX" type="number" :label="t('chunker.actions.pruneMinX', 'Minimum chunk X')" density="compact" data-test="chunker-actions-prune-min-x" />
            <VTextField v-model.number="pruneMinZ" type="number" :label="t('chunker.actions.pruneMinZ', 'Minimum chunk Z')" density="compact" data-test="chunker-actions-prune-min-z" />
            <VTextField v-model.number="pruneMaxX" type="number" :label="t('chunker.actions.pruneMaxX', 'Maximum chunk X')" density="compact" data-test="chunker-actions-prune-max-x" />
            <VTextField v-model.number="pruneMaxZ" type="number" :label="t('chunker.actions.pruneMaxZ', 'Maximum chunk Z')" density="compact" data-test="chunker-actions-prune-max-z" />
        </div>
        <VAlert v-if="pruneBoundsBackwards" type="error" variant="tonal" data-test="chunker-actions-prune-backwards">
            {{ t('chunker.actions.pruneBackwards', 'The maximum is lower than the minimum, so this boundary keeps nothing.') }}
        </VAlert>
        <VTextField
            v-if="pruneMode === 'text'"
            v-model="pruneText"
            :label="t('chunker.actions.pruneTextLabel', 'Bounds (minChunkX,minChunkZ,maxChunkX,maxChunkZ)')"
            :placeholder="t('chunker.actions.pruneTextPlaceholder', '-8,-8,8,8')"
            :error-messages="pruneTextInvalid ? [t('chunker.actions.pruneTextInvalid', 'Must be four whole numbers separated by commas: minChunkX,minChunkZ,maxChunkX,maxChunkZ.')] : []"
            data-test="chunker-actions-prune-text-field"
        />

        <h4 class="mt-4">{{ t('chunker.actions.outputTitle', 'Where the converted world goes') }}</h4>
        <VTextField
            v-model="outputName"
            :label="t('chunker.actions.outputName', 'Output archive name')"
            :hint="t('chunker.actions.outputNameHint', 'Letters, digits, dot, underscore and hyphen only. This conversion\'s own id is appended automatically.')"
            persistent-hint
            data-test="chunker-actions-output-name"
        />
        <VRadioGroup v-model="output" inline hide-details data-test="chunker-actions-output">
            <VRadio value="artifact" :label="t('chunker.actions.outputArtifact', 'A workflow artifact only')" data-test="chunker-actions-output-artifact" />
            <VRadio value="artifact-and-release" :label="t('chunker.actions.outputArtifactAndRelease', 'A workflow artifact and a release')" data-test="chunker-actions-output-artifact-and-release" />
        </VRadioGroup>

        <h4 class="mt-4">{{ t('chunker.actions.performanceTitle', 'Performance') }}</h4>
        <VTextField
            v-model="maxJobs"
            type="number"
            min="1"
            max="256"
            :label="t('chunker.actions.maxJobs', 'Maximum parallel jobs')"
            :hint="t('chunker.actions.maxJobsHint', '1 to 256. GitHub itself refuses more.')"
            persistent-hint
            :error-messages="maxJobsInvalid ? [t('chunker.actions.maxJobsInvalid', 'Must be a whole number from 1 to 256.')] : []"
            data-test="chunker-actions-max-jobs"
        />
        <VTextField
            v-model="regionsPerShard"
            type="number"
            min="1"
            :label="t('chunker.actions.regionsPerShard', 'Region files per job')"
            :hint="t('chunker.actions.regionsPerShardHint', 'How many region files one job converts before another starts.')"
            persistent-hint
            :error-messages="regionsPerShardInvalid ? [t('chunker.actions.regionsPerShardInvalid', 'Must be a whole number of at least 1.')] : []"
            data-test="chunker-actions-regions-per-shard"
        />

        <VBtn :disabled="busy || !repository || !host" @click="call('prepare', request)">{{ t('chunker.actions.prepare', 'Prepare conversion workflow') }}</VBtn>
        <VBtn :disabled="!canStart" @click="call('start', request)">{{ t('chunker.actions.start', 'Upload and convert') }}</VBtn>
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
