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
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { useServerStore } from "./useServers.js";
import { adoptConfirm, adoptRelease } from "./mcserverBridge.js";
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
}>();
const emit = defineEmits<{ "update:modelValue": [value: boolean]; confirmed: [] }>();

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

async function confirm(): Promise<void> {
    if (!props.record) return;
    failure.value = null;
    if (props.containerId) {
        const result = await adoptConfirm({ id: props.record.id, containerId: props.containerId, consent: { ...consent } });
        if (!result.ok) {
            failure.value = result.failure?.message ?? t("mcserver.adopt.confirmFailed", "Could not confirm the adoption.");
            return;
        }
    }
    const result = await store.save(props.record);
    if (result.ok) {
        emit("confirmed");
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
    <VDialog v-model="open" max-width="560">
        <VCard v-if="record">
            <VCardTitle>{{ t("mcserver.adopt.title", "Review before adopting") }}</VCardTitle>
            <VCardText>
                <p>
                    {{
                        t(
                            "mcserver.adopt.blurb",
                            { name: record.name },
                            "{name} was not created by this app. This app will only be able to do what it is granted below.",
                        )
                    }}
                </p>

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

                <template v-if="evidence && evidence.length > 0">
                    <h4 class="text-subtitle-2 mt-2">{{ t("mcserver.adopt.evidenceTitle", "Why this looks like a Minecraft server") }}</h4>
                    <ul class="wl-mcserver-adopt__evidence">
                        <li v-for="(item, index) in evidence" :key="index">{{ item }}</li>
                    </ul>
                </template>

                <template v-if="mounts && mounts.length > 0">
                    <h4 class="text-subtitle-2 mt-2">{{ t("mcserver.adopt.mountsTitle", "Mounted paths") }}</h4>
                    <ul class="wl-mcserver-adopt__evidence">
                        <li v-for="(m, index) in mounts" :key="index">{{ m.source }} &rarr; {{ m.target }}</li>
                    </ul>
                </template>
                <template v-if="ports && ports.length > 0">
                    <h4 class="text-subtitle-2 mt-2">{{ t("mcserver.adopt.portsTitle", "Published ports") }}</h4>
                    <ul class="wl-mcserver-adopt__evidence">
                        <li v-for="(p, index) in ports" :key="index">{{ p.container }} &rarr; {{ p.host ?? t("mcserver.adopt.notPublished", "not published") }}</li>
                    </ul>
                </template>

                <VAlert v-if="hasBlockers" type="error" variant="tonal" class="my-2">
                    <div v-for="(b, index) in blockers" :key="index">{{ b }}</div>
                </VAlert>

                <VDivider class="my-3" />
                <h4 class="text-subtitle-2 mb-1">{{ t("mcserver.adopt.consentTitle", "What this app may do") }}</h4>
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
                <VBtn color="primary" variant="tonal" :disabled="probing || !capabilities || hasBlockers" @click="confirm">
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
.wl-mcserver-adopt__evidence {
    margin: 4px 0 0 20px;
    padding: 0;
    font-size: 0.875rem;
}
</style>
