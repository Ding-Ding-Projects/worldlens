<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VChip,
    VDialog,
    VDivider,
    VList,
    VListItem,
    VSwitch,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { useServerStore } from "./useServers.js";
import { adoptRelease } from "./mcserverBridge.js";
import type { ServerRecord } from "./serverModel.js";

/**
 * What this app may and may not do to a container or process it did not create, said plainly
 * before the adoption is confirmed - never discovered later from a button that quietly does
 * nothing. Every consent switch below defaults off; nothing is granted just by opening this.
 */
const props = defineProps<{
    modelValue: boolean;
    record: ServerRecord | null;
    /** The discovery candidate's evidence, when this dialog is reviewing a fresh discovery. */
    evidence?: readonly string[];
    confidence?: "high" | "medium" | "low" | null;
    mounts?: readonly { readonly source: string; readonly target: string }[];
    ports?: readonly { readonly container: number; readonly host: number | null }[];
    blockers?: readonly string[];
    containerId?: string | null;
    hostId?: string | null;
}>();
const emit = defineEmits<{ "update:modelValue": [value: boolean]; confirmed: [record: ServerRecord] }>();

const { t } = useI18n();
const store = useServerStore();

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const probing = ref(false);
const failure = ref<string | null>(null);

const consent = reactive({
    configWrite: false,
    lifecycle: false,
    pluginInstall: false,
    consoleWrite: false,
});

watch(
    () => [props.modelValue, props.record?.id] as const,
    async ([isOpen, id]) => {
        if (isOpen && typeof id === "string") {
            probing.value = true;
            await store.probe(id);
            probing.value = false;
        }
    },
);

const capabilities = computed(() => (props.record ? store.capabilitiesFor(props.record.id) : null));
const hasBlockers = computed(() => (props.blockers?.length ?? 0) > 0);

/**
 * A real container can carry many mounts and published ports, and the discovery evidence
 * list grows with every heuristic that matched -- so this dialog gets the same local
 * filter every other list in this app does, covering evidence, mounts and ports together.
 * Plain text is the default; the anchored regex builder in {@link ConfigSearchField} is an
 * explicit opt-in. Filtering only ever hides rows: it never changes what "Adopt" does.
 */
const reviewQuery = ref("");
const reviewRegex = ref(false);
const reviewFlags = ref("i");
const reviewMatcher = computed(() => createSettingMatcher(reviewQuery.value, reviewRegex.value, reviewFlags.value));

const filteredEvidence = computed(() => (props.evidence ?? []).filter((item) => reviewMatcher.value.test(item)));
const filteredMounts = computed(() => (props.mounts ?? []).filter((m) => reviewMatcher.value.test(`${m.source} ${m.target}`)));
const filteredPorts = computed(() =>
    (props.ports ?? []).filter((p) => reviewMatcher.value.test(`${p.container} ${p.host ?? ""}`)),
);

const reviewSample = computed(() =>
    [
        ...(props.evidence ?? []),
        ...(props.mounts ?? []).map((m) => `${m.source} -> ${m.target}`),
        ...(props.ports ?? []).map((p) => `${p.container} -> ${p.host ?? ""}`),
    ].join(String.fromCharCode(10)),
);

const reviewHasRows = computed(() => (props.evidence?.length ?? 0) + (props.mounts?.length ?? 0) + (props.ports?.length ?? 0) > 0);
const reviewShownCount = computed(() => filteredEvidence.value.length + filteredMounts.value.length + filteredPorts.value.length);
const reviewTotalCount = computed(() => (props.evidence?.length ?? 0) + (props.mounts?.length ?? 0) + (props.ports?.length ?? 0));
const reviewSummary = computed(() =>
    t("mcserver.adopt.filterSummary", { shown: reviewShownCount.value, total: reviewTotalCount.value }, "Showing {shown} of {total}"),
);

async function confirm(): Promise<void> {
    if (!props.record) return;
    failure.value = null;
    if (!props.containerId) {
        failure.value = t("mcserver.adopt.noContainer", "No container was selected for adoption.");
        return;
    }
    const result = await store.adoptConfirm({ id: props.record.id, containerId: props.containerId, hostId: props.hostId, consent: { ...consent } });
    if (result.ok) {
        emit("confirmed", result.value ?? props.record);
        open.value = false;
    } else {
        failure.value = result.failure?.message ?? t("mcserver.adopt.saveFailed", "Could not save this server.");
    }
}

const releasing = ref(false);
async function confirmRelease(): Promise<void> {
    if (!props.record) return;
    releasing.value = true;
    const result = await adoptRelease(props.record.id, { restoreSnapshot: false });
    releasing.value = false;
    if (!result.ok) failure.value = result.failure?.message ?? t("mcserver.adopt.releaseFailed", "Could not release this adoption.");
}
</script>

<template>
    <VDialog v-model="open" max-width="560" persistent>
        <VCard v-if="record">
            <VCardTitle>{{ t("mcserver.adopt.title", "Review before adopting") }}</VCardTitle>
            <VCardText>
                <div>
                    {{
                        t(
                            "mcserver.adopt.blurb",
                            { name: record.name },
                            "{name} was not created by this app. This app will only be able to do what it is granted below.",
                        )
                    }}
                </div>

                <VAlert v-if="failure" type="warning" variant="tonal" class="my-2">{{ failure }}</VAlert>

                <template v-if="confidence">
                    <VChip
                        size="small"
                        :color="confidence === 'high' ? 'success' : confidence === 'medium' ? 'warning' : 'error'"
                        variant="tonal"
                        class="mb-2"
                    >
                        {{ t("mcserver.adopt.confidence", { level: confidence }, "Match confidence: {level}") }}
                    </VChip>
                </template>

                <ConfigSearchField
                    v-if="reviewHasRows"
                    v-model="reviewQuery"
                    v-model:regex="reviewRegex"
                    v-model:flags="reviewFlags"
                    :label="t('mcserver.adopt.filterLabel', 'Filter evidence, mounts and ports')"
                    :placeholder="t('mcserver.adopt.filterHint', 'Path, port or evidence text')"
                    :sample="reviewSample"
                    :summary="reviewSummary"
                    class="mb-2"
                />

                <template v-if="evidence && evidence.length > 0">
                    <div class="text-subtitle-2 mt-2">{{ t("mcserver.adopt.evidenceTitle", "Why this looks like a Minecraft server") }}</div>
                    <div v-if="filteredEvidence.length === 0" class="wl-mcserver-adopt__noMatch" role="status">
                        {{ t("mcserver.adopt.evidenceNoMatch", "No evidence line matches the filter.") }}
                    </div>
                    <ul v-else class="wl-mcserver-adopt__evidence">
                        <li v-for="(item, index) in filteredEvidence" :key="index">{{ item }}</li>
                    </ul>
                </template>

                <template v-if="mounts && mounts.length > 0">
                    <div class="text-subtitle-2 mt-2">{{ t("mcserver.adopt.mountsTitle", "Mounted paths") }}</div>
                    <div v-if="filteredMounts.length === 0" class="wl-mcserver-adopt__noMatch" role="status">
                        {{ t("mcserver.adopt.mountsNoMatch", "No mounted path matches the filter.") }}
                    </div>
                    <ul v-else class="wl-mcserver-adopt__evidence">
                        <li v-for="(m, index) in filteredMounts" :key="index">{{ m.source }} &rarr; {{ m.target }}</li>
                    </ul>
                </template>
                <template v-if="ports && ports.length > 0">
                    <div class="text-subtitle-2 mt-2">{{ t("mcserver.adopt.portsTitle", "Published ports") }}</div>
                    <div v-if="filteredPorts.length === 0" class="wl-mcserver-adopt__noMatch" role="status">
                        {{ t("mcserver.adopt.portsNoMatch", "No published port matches the filter.") }}
                    </div>
                    <ul v-else class="wl-mcserver-adopt__evidence">
                        <li v-for="(p, index) in filteredPorts" :key="index">{{ p.container }} &rarr; {{ p.host ?? t("mcserver.adopt.notPublished", "not published") }}</li>
                    </ul>
                </template>

                <VAlert v-if="hasBlockers" type="error" variant="tonal" class="my-2">
                    <div v-for="(b, index) in blockers" :key="index">{{ b }}</div>
                </VAlert>

                <VDivider class="my-3" />
                <div class="text-subtitle-2 mb-1">{{ t("mcserver.adopt.consentTitle", "What this app may do") }}</div>
                <VSwitch v-model="consent.configWrite" :label="t('mcserver.adopt.consentConfig', 'Write its configuration files')" hide-details density="compact" />
                <VSwitch v-model="consent.lifecycle" :label="t('mcserver.adopt.consentLifecycle', 'Start and stop it')" hide-details density="compact" />
                <VSwitch v-model="consent.pluginInstall" :label="t('mcserver.adopt.consentPlugins', 'Install and remove plugins')" hide-details density="compact" />
                <VSwitch v-model="consent.consoleWrite" :label="t('mcserver.adopt.consentConsole', 'Send console commands')" hide-details density="compact" />

                <VAlert v-if="probing" type="info" variant="tonal" class="mt-3">
                    {{ t("mcserver.adopt.probing", "Checking what this app may do...") }}
                </VAlert>
                <VList v-else-if="capabilities" class="mt-3">
                    <VListItem>
                        {{ t("mcserver.adopt.canLifecycle", "Start and stop") }}
                        <template #append>
                            <VChip :color="capabilities.canLifecycle ? 'success' : 'error'" size="small">
                                {{ capabilities.canLifecycle ? t("common.yes", "Yes") : t("common.no", "No") }}
                            </VChip>
                        </template>
                    </VListItem>
                    <VListItem>
                        {{ t("mcserver.adopt.canWrite", "Write its files") }}
                        <template #append>
                            <VChip :color="capabilities.canWriteFiles ? 'success' : 'error'" size="small">
                                {{ capabilities.canWriteFiles ? t("common.yes", "Yes") : t("common.no", "No") }}
                            </VChip>
                        </template>
                    </VListItem>
                    <VListItem>
                        {{ t("mcserver.adopt.canDestroy", "Delete it") }}
                        <template #append>
                            <VChip :color="capabilities.canDestroy ? 'success' : 'error'" size="small">
                                {{ capabilities.canDestroy ? t("common.yes", "Yes") : t("common.no", "No") }}
                            </VChip>
                        </template>
                    </VListItem>
                    <VListItem>
                        {{ t("mcserver.adopt.console", "Console") }}
                        <template #append>
                            <VChip size="small">{{ capabilities.console }}</VChip>
                        </template>
                    </VListItem>
                </VList>
                <VAlert v-else type="warning" variant="tonal">
                    {{ t("mcserver.adopt.unreachable", "This server could not be reached, so nothing here can be confirmed yet.") }}
                </VAlert>
            </VCardText>
            <VCardActions>
                <VBtn variant="text" @click="open = false">{{ t("common.cancel", "Cancel") }}</VBtn>
                <VBtn color="primary" variant="tonal" :disabled="probing || !containerId || hasBlockers" @click="confirm">
                    {{ t("mcserver.adopt.confirm", "Adopt") }}
                </VBtn>
            </VCardActions>

            <VDivider />
            <VCardText>
                <ConfigSuperConfirm
                    :title="t('mcserver.adopt.releaseTitle', 'Release this adoption')"
                    :action="
                        t(
                            'mcserver.adopt.releaseAction',
                            { name: record.name },
                            'Forgets the adoption of {name} in this app only. It destroys nothing: the container, its process, and its files are left exactly as they are.',
                        )
                    "
                    :affected="[record.name]"
                    :confirm-label="t('mcserver.adopt.releaseConfirm', 'Release')"
                    @confirm="confirmRelease"
                />
            </VCardText>
        </VCard>
    </VDialog>
</template>

<style scoped>
.wl-mcserver-adopt__noMatch {
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: 0.875rem;
    margin: 4px 0 0 0;
}
.wl-mcserver-adopt__evidence {
    margin: 4px 0 0 20px;
    padding: 0;
    font-size: 0.875rem;
}
</style>
