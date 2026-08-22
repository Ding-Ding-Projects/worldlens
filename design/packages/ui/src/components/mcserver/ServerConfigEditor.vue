<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentSave, mdiRestore } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VChip, VDivider, VSelect, VSwitch, VTextarea } from "vuetify/components";
import type { PlainValue } from "@worldlens/config";
import ConfigControl from "../config/ConfigControl.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { useServerStore } from "./useServers.js";
import { writeBlockReason } from "./serverModel.js";
import { serverPropertiesFields, SERVER_PROPERTIES_GROUPS } from "./serverPropertiesFields.js";
import type { FileEntry } from "./serverStore.js";

/**
 * A file picker across every configuration file this server keeps, with `server.properties`
 * rendered as real typed controls (grouped, searchable, diffable) through the same
 * `ConfigControl.vue` the appearance and BlueMap editors use. Every other file - YAML/JSON
 * config, `ops.json`, `eula.txt`, a plugin's own config - has no shared schema here yet, so
 * it gets an honest raw text editor rather than a fake typed one.
 */
const props = defineProps<{ serverId: string }>();

const { t } = useI18n();
const store = useServerStore();

const WELL_KNOWN = ["server.properties", "bukkit.yml", "spigot.yml", "paper-global.yml", "ops.json", "whitelist.json", "eula.txt"];

const entries = ref<FileEntry[]>([]);
const selected = ref<string>("server.properties");
const rawText = ref("");
const originalHash = ref<string | null>(null);
const loading = ref(false);
const failure = ref<string | null>(null);
const saved = ref(false);
const query = ref("");
const useRegex = ref(false);
const flags = ref("i");
const changedOnly = ref(false);

// server.properties structured state
const props1 = ref<Record<string, string>>({});
const propsOriginal = ref<Record<string, string>>({});

function parseProperties(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index === -1) continue;
        out[trimmed.slice(0, index)] = trimmed.slice(index + 1);
    }
    return out;
}
function serializeProperties(values: Record<string, string>): string {
    return Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
}

const isProperties = computed(() => selected.value === "server.properties");

async function listFiles(): Promise<void> {
    const result = await store.files.list(props.serverId, ".");
    if (result.ok) {
        entries.value = (result.value ?? []).filter((e) => e.kind === "file").slice(0, 200) as FileEntry[];
    }
}

async function loadSelected(): Promise<void> {
    loading.value = true;
    failure.value = null;
    saved.value = false;
    const result = await store.files.read(props.serverId, selected.value);
    if (result.ok && result.value) {
        const text = new TextDecoder().decode(result.value.bytes);
        originalHash.value = result.value.hash;
        rawText.value = text;
        if (isProperties.value) {
            props1.value = parseProperties(text);
            propsOriginal.value = { ...props1.value };
        }
    } else if (result.ok === false && result.failure?.code === "not-found") {
        rawText.value = "";
        originalHash.value = null;
        props1.value = {};
        propsOriginal.value = {};
    } else {
        failure.value = result.failure?.message ?? t("mcserver.config.readFailed", "This file could not be read.");
    }
    loading.value = false;
}

onMounted(async () => {
    await listFiles();
    await loadSelected();
});
watch(() => props.serverId, async () => {
    await listFiles();
    await loadSelected();
});
watch(selected, loadSelected);

const capabilities = computed(() => store.capabilitiesFor(props.serverId));
const server = computed(() => store.get(props.serverId));
const blockReason = computed(() => (server.value ? writeBlockReason(server.value, capabilities.value) : null));

const fileOptions = computed(() => {
    const names = new Set(WELL_KNOWN);
    for (const e of entries.value) if (/\.(yml|yaml|json|txt|properties)$/i.test(e.name)) names.add(e.name);
    return [...names];
});

const fieldsFiltered = computed(() => {
    let list = serverPropertiesFields;
    if (query.value.trim() !== "") {
        if (useRegex.value) {
            try {
                const pattern = new RegExp(query.value, flags.value);
                list = list.filter((f) => pattern.test(f.key) || pattern.test(f.label));
            } catch {
                list = [];
            }
        } else {
            const needle = query.value.toLowerCase();
            list = list.filter((f) => f.key.toLowerCase().includes(needle) || f.label.toLowerCase().includes(needle));
        }
    }
    if (changedOnly.value) {
        list = list.filter((f) => props1.value[f.key] !== propsOriginal.value[f.key]);
    }
    return list;
});

const groupedFields = computed(() => {
    const byGroup = new Map<string, typeof serverPropertiesFields extends readonly (infer T)[] ? T[] : never>();
    for (const group of SERVER_PROPERTIES_GROUPS) byGroup.set(group, []);
    for (const field of fieldsFiltered.value) {
        const bucket = byGroup.get(field.group) ?? [];
        bucket.push(field);
        byGroup.set(field.group, bucket);
    }
    return [...byGroup.entries()].filter(([, list]) => list.length > 0);
});

function toControlValue(key: string, control: (typeof serverPropertiesFields)[number]["control"]): PlainValue {
    const raw = props1.value[key];
    if (raw === undefined) return null;
    if (control.kind === "switch") return raw === "true";
    if (control.kind === "number") return Number(raw);
    return raw;
}
function setValue(key: string, value: PlainValue): void {
    props1.value = { ...props1.value, [key]: String(value ?? "") };
}
function revertField(key: string): void {
    if (propsOriginal.value[key] === undefined) {
        const { [key]: _removed, ...rest } = props1.value;
        props1.value = rest;
    } else {
        props1.value = { ...props1.value, [key]: propsOriginal.value[key] };
    }
}
const changedKeys = computed(() => serverPropertiesFields.filter((f) => props1.value[f.key] !== propsOriginal.value[f.key]).map((f) => f.key));

const diffText = computed(() =>
    changedKeys.value
        .map((key) => `${key}: ${propsOriginal.value[key] ?? "(unset)"} -> ${props1.value[key] ?? "(unset)"}`)
        .join("\n"),
);

async function save(): Promise<void> {
    saved.value = false;
    const text = isProperties.value ? serializeProperties(props1.value) : rawText.value;
    const result = await store.files.write(props.serverId, selected.value, { text, expectedHash: originalHash.value });
    if (result.ok && result.value) {
        originalHash.value = result.value.hash;
        if (isProperties.value) propsOriginal.value = { ...props1.value };
        saved.value = true;
    } else if (result.ok === false && result.failure?.code === "stale") {
        failure.value = t("mcserver.config.stale", "This file changed on disk since it was opened. Reload before saving.");
    } else {
        failure.value = result.failure?.message ?? t("mcserver.config.saveFailed", "Could not save.");
    }
}
</script>

<template>
    <div class="wl-mcserver-config">
        <div class="wl-mcserver-config__picker">
            <VSelect
                v-model="selected"
                :items="fileOptions"
                :label="t('mcserver.config.file', 'Configuration file')"
                density="compact"
                hide-details
            />
        </div>

        <VAlert v-if="blockReason" type="info" variant="tonal" class="mb-3">{{ blockReason }}</VAlert>
        <VAlert v-if="failure" type="warning" variant="tonal" class="mb-3">{{ failure }}</VAlert>
        <VAlert v-if="saved" type="success" variant="tonal" class="mb-3">{{ t("mcserver.config.saved", "Saved.") }}</VAlert>

        <template v-if="isProperties && !loading">
            <div class="wl-mcserver-config__toolbar">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="useRegex"
                    v-model:flags="flags"
                    :label="t('mcserver.config.search', 'Search settings')"
                    :sample="serverPropertiesFields.map((f) => f.key).join(' ')"
                    class="wl-mcserver-config__search"
                />
                <VSwitch v-model="changedOnly" :label="t('mcserver.config.changedOnly', 'Changed only')" hide-details density="compact" />
                <VChip v-if="changedKeys.length > 0" size="small" color="primary" variant="tonal">
                    {{ t("mcserver.config.changedCount", { n: changedKeys.length }, "{n} changed") }}
                </VChip>
            </div>

            <VCard v-for="[group, fields] in groupedFields" :key="group" variant="outlined" class="mb-3">
                <VCardText>
                    <h4 class="text-subtitle-2 mb-2">{{ group }}</h4>
                    <div v-for="field in fields" :key="field.key" class="wl-mcserver-config__row">
                        <ConfigControl
                            :control="field.control"
                            :model-value="toControlValue(field.key, field.control)"
                            :label="field.label"
                            :disabled="!!blockReason"
                            @update:model-value="(v) => setValue(field.key, v)"
                        />
                        <VBtn
                            v-if="props1[field.key] !== propsOriginal[field.key]"
                            :icon="mdiRestore"
                            size="x-small"
                            variant="text"
                            :title="t('mcserver.config.revert', 'Revert this field')"
                            :aria-label="t('mcserver.config.revertAria', { label: field.label }, 'Revert {label}')"
                            @click="revertField(field.key)"
                        />
                    </div>
                </VCardText>
            </VCard>

            <VCard v-if="changedKeys.length > 0" variant="tonal" class="mb-3">
                <VCardText>
                    <h4 class="text-subtitle-2 mb-1">{{ t("mcserver.config.diff", "Changes to be saved") }}</h4>
                    <pre class="wl-mcserver-config__diff">{{ diffText }}</pre>
                </VCardText>
            </VCard>
        </template>

        <VTextarea
            v-else-if="!loading"
            v-model="rawText"
            :label="selected"
            rows="20"
            :disabled="!!blockReason"
            class="wl-mcserver-config__raw"
        />

        <VDivider class="my-3" />
        <VBtn
            color="primary"
            variant="tonal"
            :prepend-icon="mdiContentSave"
            :disabled="!!blockReason || loading"
            :title="blockReason ?? undefined"
            @click="save"
        >
            {{ t("mcserver.config.save", "Save") }}
        </VBtn>
    </div>
</template>

<style scoped>
.wl-mcserver-config__picker {
    max-width: 320px;
    margin-bottom: 12px;
}
.wl-mcserver-config__toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
}
.wl-mcserver-config__search {
    flex: 1 1 260px;
}
.wl-mcserver-config__row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
}
.wl-mcserver-config__row > :first-child {
    flex: 1 1 auto;
}
.wl-mcserver-config__diff {
    font-family: monospace;
    font-size: 12px;
    white-space: pre-wrap;
}
.wl-mcserver-config__raw :deep(textarea) {
    font-family: monospace;
    font-size: 12px;
}
</style>
