<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
    mdiCheckDecagramOutline,
    mdiCogOutline,
    mdiFileDocumentOutline,
    mdiFileOutline,
    mdiShieldAccountOutline,
    mdiTune,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VChip,
    VIcon,
    VList,
    VListItem,
    VSwitch,
    VTextarea,
    VExpansionPanels,
    VExpansionPanel,
    VExpansionPanelTitle,
    VExpansionPanelText,
} from "vuetify/components";
import type { Control, PlainValue } from "@worldlens/config";
import ConfigControl from "../config/ConfigControl.vue";
import RecursiveValueEditor from "../config/RecursiveValueEditor.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { useServerStore } from "./useServers.js";
import { writeBlockReason } from "./serverModel.js";
import { workflowText as text } from "./workflowText.js";
import {
    serverConfigDraftKey,
    storeServerConfigDraft,
    readServerConfigDraft,
    discardServerConfigDraft,
} from "./serverConfigDrafts.js";
const props = defineProps<{ serverId: string }>();
const store = useServerStore();
interface Field {
    path: readonly string[];
    key: string;
    control: Control;
    label: string;
    help: string | null;
    group: string;
    value: unknown;
    readOnlyReason: string | null;
}
interface Description {
    fields: Field[];
    hash: string;
    unreadable: boolean;
}
interface Answer<T> {
    ok: boolean;
    value?: T;
    failure?: { code: string; message: string };
}
interface Bridge {
    describe(id: string, path: string): Promise<Answer<Description>>;
    apply(id: string, path: string, body: unknown): Promise<Answer<{ hash: string }>>;
    discover?(id: string): Promise<
        Answer<{
            files: string[];
            unavailable: { path: string; message: string }[];
            truncated: boolean;
        }>
    >;
}
function bridge(): Bridge | null {
    const api = (globalThis as unknown as { worldlens?: { mcserver?: { config?: Bridge } } })
        .worldlens?.mcserver?.config;
    return typeof api?.describe === "function" && typeof api.apply === "function" ? api : null;
}
const recordTemplates: Record<string, Record<string, unknown>> = {
    "ops.json": { uuid: "", name: "", level: 4, bypassesPlayerLimit: false },
    "whitelist.json": { uuid: "", name: "" },
    "banned-players.json": {
        uuid: "",
        name: "",
        created: "",
        source: "",
        expires: "forever",
        reason: "",
    },
    "banned-ips.json": { ip: "", created: "", source: "", expires: "forever", reason: "" },
};
const selectedRecordTemplate = computed(
    () => recordTemplates[selected.value.split("/").pop() ?? ""],
);
const known = [
    "server.properties",
    "eula.txt",
    "ops.json",
    "whitelist.json",
    "banned-players.json",
    "banned-ips.json",
    "bukkit.yml",
    "spigot.yml",
    "config/paper-global.yml",
    "config/paper-world-defaults.yml",
    "purpur.yml",
    "velocity.toml",
];
const files = ref([...known]);
const selected = ref("server.properties");
const fields = ref<Field[]>([]);
const values = ref<Record<string, unknown>>({});
const original = ref<Record<string, unknown>>({});
const hash = ref<string | null>(null);
const loading = ref(false);
const saving = ref(false);
const failure = ref("");
const inventoryNotice = ref("");
const saved = ref(false);
const conflict = ref(false);
const raw = ref("");
const rawLoaded = ref(false);
const rawMode = ref(false);
const fileQuery = ref("");
const fileRegex = ref(false);
const fileFlags = ref("i");
const query = ref("");
const regex = ref(false);
const flags = ref("i");
const changedOnly = ref(false);
let generation = 0;
const copy = (v: unknown): unknown => JSON.parse(JSON.stringify(v ?? null));
const changed = computed(() =>
    fields.value.filter(
        (field) =>
            JSON.stringify(values.value[field.key]) !== JSON.stringify(original.value[field.key]),
    ),
);
const fileOptions = computed(() => {
    const matcher = createSettingMatcher(fileQuery.value, fileRegex.value, fileFlags.value);
    return files.value.filter((name) => matcher.test(name));
});
const groups = computed(() => {
    const matcher = createSettingMatcher(query.value, regex.value, flags.value);
    const out = new Map<string, Field[]>();
    for (const field of fields.value) {
        if (
            !matcher.test(`${field.key} ${field.label} ${field.help ?? ""}`) ||
            (changedOnly.value && !changed.value.includes(field))
        )
            continue;
        out.set(field.group, [...(out.get(field.group) ?? []), field]);
    }
    return [...out];
});
const blockReason = computed(() => {
    const server = store.get(props.serverId);
    return server
        ? writeBlockReason(server, store.capabilitiesFor(props.serverId))
        : text("Server unavailable.", "伺服器不可用。");
});
async function discover(): Promise<void> {
    const id = props.serverId;
    const api = bridge();
    if (!api?.discover) {
        inventoryNotice.value = text(
            "Recursive discovery is unavailable in this build. Known files remain accessible.",
            "此版本未提供遞迴搜尋。仍可開啟已知檔案。",
        );
        return;
    }
    try {
        const result = await api.discover(id);
        if (id !== props.serverId) return;
        if (result.ok && result.value) {
            files.value = [...new Set([...known, ...result.value.files])];
            inventoryNotice.value =
                result.value.truncated || result.value.unavailable.length
                    ? text("Some directories could not be fully scanned.", "部分目錄未能完整搜尋。")
                    : "";
        } else
            inventoryNotice.value =
                result.failure?.message ??
                text("File inventory unavailable.", "無法取得檔案清單。");
    } catch {
        inventoryNotice.value = text("File inventory unavailable.", "無法取得檔案清單。");
    }
}
interface Draft {
    fields: Field[];
    values: Record<string, unknown>;
    original: Record<string, unknown>;
    hash: string | null;
    raw: string;
    rawLoaded: boolean;
    rawMode: boolean;
    conflict: boolean;
    failure: string;
}
let loadedKey: string | null = null;
function retainDraft(): void {
    if (!loadedKey || loading.value) return;
    storeServerConfigDraft(loadedKey, {
        fields: fields.value,
        values: values.value,
        original: original.value,
        hash: hash.value,
        raw: raw.value,
        rawLoaded: rawLoaded.value,
        rawMode: rawMode.value,
        conflict: conflict.value,
        failure: failure.value,
    } satisfies Draft);
}
async function load(discard = false): Promise<void> {
    retainDraft();
    const turn = ++generation;
    const id = props.serverId,
        path = selected.value;
    const nextKey = serverConfigDraftKey(id, path);
    if (discard) discardServerConfigDraft(nextKey);
    const draft = readServerConfigDraft<Draft>(nextKey);
    loadedKey = null;
    if (draft) {
        fields.value = draft.fields;
        values.value = draft.values;
        original.value = draft.original;
        hash.value = draft.hash;
        raw.value = draft.raw;
        rawLoaded.value = draft.rawLoaded;
        rawMode.value = draft.rawMode;
        conflict.value = draft.conflict;
        failure.value = draft.failure;
        saved.value = false;
        loading.value = false;
        loadedKey = nextKey;
        return;
    }
    loading.value = true;
    failure.value = "";
    saved.value = false;
    conflict.value = false;
    rawLoaded.value = false;
    rawMode.value = false;
    fields.value = [];
    hash.value = null;
    try {
        const api = bridge();
        if (!api) {
            failure.value = text(
                "Structured configuration is unavailable in this build.",
                "此版本未提供結構化設定。",
            );
            return;
        }
        const result = await api.describe(id, path);
        if (turn !== generation) return;
        if (!result.ok || !result.value || result.value.unreadable) {
            failure.value =
                result.failure?.message ??
                text(
                    "This file could not be described. The original file has not changed.",
                    "無法讀取此檔案的結構，原檔案保持不變。",
                );
            return;
        }
        fields.value = result.value.fields;
        values.value = Object.fromEntries(
            fields.value.map((field) => [field.key, copy(field.value)]),
        );
        original.value = Object.fromEntries(
            fields.value.map((field) => [field.key, copy(field.value)]),
        );
        hash.value = result.value.hash;
        loadedKey = nextKey;
    } catch {
        if (turn === generation)
            failure.value = text("Configuration observation is unavailable.", "無法取得設定狀態。");
    } finally {
        if (turn === generation) loading.value = false;
    }
}
async function loadRaw(): Promise<void> {
    if (rawLoaded.value) return;
    const turn = generation;
    const result = await store.files.read(props.serverId, selected.value);
    if (turn !== generation) return;
    if (result.ok && result.value) {
        raw.value = new TextDecoder().decode(result.value.bytes);
        rawLoaded.value = true;
    } else
        failure.value =
            result.failure?.message ?? text("Could not read raw source.", "無法讀取原始內容。");
}
async function save(): Promise<void> {
    if (saving.value || loading.value || blockReason.value || hash.value === null || conflict.value)
        return;
    const turn = generation,
        id = props.serverId,
        path = selected.value;
    const submitted = copy(values.value) as Record<string, unknown>;
    saving.value = true;
    failure.value = "";
    saved.value = false;
    try {
        const result = rawMode.value
            ? await store.files.write(id, path, { text: raw.value, expectedHash: hash.value })
            : await bridge()!.apply(id, path, {
                  expectedHash: hash.value,
                  changes: changed.value.map((field) => ({
                      path: field.path,
                      value: submitted[field.key],
                  })),
              });
        if (turn !== generation) return;
        if (result.ok) {
            await load(true);
            saved.value = true;
        } else {
            conflict.value = ["stale-document", "stale", "conflict"].includes(
                result.failure?.code ?? "",
            );
            failure.value =
                result.failure?.message ??
                text(
                    "Save did not complete. Your draft is retained.",
                    "儲存未完成，草稿仍然保留。",
                );
        }
    } catch {
        if (turn === generation)
            failure.value = text(
                "Save did not complete. Your draft is retained.",
                "儲存未完成，草稿仍然保留。",
            );
    } finally {
        saving.value = false;
    }
}
function reset(): void {
    values.value = Object.fromEntries(
        Object.entries(original.value).map(([key, value]) => [key, copy(value)]),
    );
}
/** A glyph per kind of file, so the rail reads at a glance the way the design draws it. */
function fileIcon(name: string): string {
    if (name.endsWith(".properties")) return mdiCogOutline;
    if (name.endsWith(".json")) return mdiShieldAccountOutline;
    if (name.endsWith(".txt")) return mdiCheckDecagramOutline;
    if (name.endsWith(".yml") || name.endsWith(".yaml") || name.endsWith(".toml")) return mdiTune;
    return mdiFileOutline;
}
function pickFile(next: unknown): void {
    const value = Array.isArray(next) ? next[0] : next;
    if (typeof value === "string" && value !== selected.value && !saving.value)
        selected.value = value;
}
function controlKind(field: Field): string {
    return (field.control as { kind?: string }).kind ?? "";
}
function show(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value);
}
function scalar(field: Field): PlainValue {
    return values.value[field.key] as PlainValue;
}
function complex(field: Field): boolean {
    const value = values.value[field.key];
    return value === null || typeof value === "object";
}
onMounted(() => {
    void discover();
    void load();
});
watch(
    () => props.serverId,
    () => {
        files.value = [...known];
        void discover();
        void load();
    },
);
watch(selected, () => void load());
onBeforeUnmount(() => {
    retainDraft();
    ++generation;
});
</script>
<template>
    <div class="server-config">
        <aside class="server-config__files">
            <ConfigSearchField
                v-model="fileQuery"
                v-model:regex="fileRegex"
                v-model:flags="fileFlags"
                :label="text('Search files', '搜尋檔案')"
                :sample="files.join('\n')"
            />
            <VList
                class="server-config__file-list"
                density="compact"
                :selected="[selected]"
                :disabled="saving"
                :aria-label="text('Configuration file', '設定檔案')"
                mandatory
                @update:selected="pickFile"
            >
                <VListItem
                    v-for="name in fileOptions"
                    :key="name"
                    :value="name"
                    :active="name === selected"
                    color="primary-container"
                    class="server-config__file"
                    :title="name"
                >
                    <template #prepend>
                        <VIcon :icon="fileIcon(name)" size="18" />
                    </template>
                </VListItem>
            </VList>
        </aside>

        <section class="server-config__main">
            <VCard variant="outlined" class="server-config__truth">
                <VIcon :icon="mdiFileDocumentOutline" size="20" class="server-config__truth-icon" />
                <p>
                    {{
                        text(
                            "The file is the truth and the schema is only a view of it. Comments, blank lines, ordering and keys nothing here has heard of are all kept, so a save that changes one setting cannot drop a setting it did not understand.",
                            "檔案先係真相，schema 只係一個睇法。註解、空行、次序同未識嘅 key 全部保留，改一個設定唔會順手丟咗佢唔明嘅設定。",
                        )
                    }}
                </p>
            </VCard>
            <VAlert v-if="inventoryNotice" type="info" variant="tonal">{{
                inventoryNotice
            }}</VAlert>
            <VAlert v-if="blockReason" type="warning" variant="tonal">{{ blockReason }}</VAlert>
            <VAlert v-if="failure" type="error" variant="tonal" role="status">{{ failure }}</VAlert>
            <div class="toolbar">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regex"
                    v-model:flags="flags"
                    :label="text('Search settings', '搜尋設定')"
                    :sample="fields.map((field) => field.key).join('\n')"
                />
                <VSwitch
                    v-model="changedOnly"
                    color="primary"
                    :label="text('Changed only', '只顯示改動')"
                    hide-details
                />
            </div>
            <template v-for="[group, items] in groups" :key="group">
                <h3 class="server-config__group">{{ group }}</h3>
                <VCard
                    v-for="field in items"
                    :key="field.key"
                    variant="outlined"
                    class="server-config__field"
                    :class="{ 'server-config__field--changed': changed.includes(field) }"
                >
                    <VCardText class="field">
                        <div class="server-config__field-doc">
                            <div class="server-config__field-head">
                                <span class="server-config__key">{{ field.key }}</span>
                                <span class="server-config__type">{{ controlKind(field) }}</span>
                                <span
                                    v-if="field.label !== field.key"
                                    class="server-config__label"
                                    >{{ field.label }}</span
                                >
                            </div>
                            <p v-if="field.help" class="server-config__help">{{ field.help }}</p>
                            <p
                                v-if="field.readOnlyReason"
                                class="server-config__help"
                                role="status"
                            >
                                {{ field.readOnlyReason }}
                            </p>
                            <VBtn
                                v-if="changed.includes(field)"
                                variant="text"
                                color="primary"
                                size="small"
                                :disabled="saving"
                                @click="values[field.key] = copy(original[field.key])"
                                >{{ text("Reset field", "重設欄位") }}</VBtn
                            >
                        </div>
                        <div
                            class="server-config__control"
                            :class="{ 'server-config__control--wide': complex(field) }"
                        >
                            <RecursiveValueEditor
                                v-if="complex(field)"
                                v-model="values[field.key]"
                                :label="field.label"
                                v-bind="
                                    selectedRecordTemplate && Array.isArray(values[field.key])
                                        ? { recordTemplate: selectedRecordTemplate }
                                        : {}
                                "
                                :disabled="
                                    !!blockReason || !!field.readOnlyReason || saving || rawMode
                                "
                            />
                            <ConfigControl
                                v-else
                                :control="field.control"
                                :model-value="scalar(field)"
                                :label="field.label"
                                :disabled="
                                    !!blockReason || !!field.readOnlyReason || saving || rawMode
                                "
                                @update:model-value="values[field.key] = $event"
                            />
                        </div>
                    </VCardText>
                </VCard>
            </template>
            <VExpansionPanels @update:model-value="loadRaw"
                ><VExpansionPanel
                    ><VExpansionPanelTitle>{{
                        text("Advanced source editor", "進階原始碼編輯器")
                    }}</VExpansionPanelTitle
                    ><VExpansionPanelText
                        ><VSwitch
                            v-model="rawMode"
                            color="primary"
                            :disabled="!rawLoaded || changed.length > 0 || saving"
                            :label="
                                text(
                                    'Edit raw source instead of structured values',
                                    '改用原始碼編輯',
                                )
                            " /><VTextarea
                            v-model="raw"
                            :readonly="!rawMode"
                            :label="selected"
                            rows="12" /></VExpansionPanelText></VExpansionPanel
            ></VExpansionPanels>
        </section>

        <aside class="server-config__side">
            <VCard variant="outlined" class="server-config__diff">
                <div class="server-config__diff-head">
                    <span>{{ text("Changes to be saved", "準備儲存嘅改動") }}</span>
                    <VChip size="small" variant="flat" color="secondary-container"
                        >{{ changed.length }} {{ text("changed", "項改動") }}</VChip
                    >
                </div>
                <VExpansionPanels :model-value="0" flat class="server-config__review">
                    <VExpansionPanel
                        ><VExpansionPanelTitle>{{
                            text("Review changes", "檢視改動")
                        }}</VExpansionPanelTitle
                        ><VExpansionPanelText
                            ><div
                                v-for="item in changed"
                                :key="item.key"
                                class="server-config__diff-row"
                            >
                                <div class="server-config__diff-path">{{ item.key }}</div>
                                <pre
                                    class="server-config__diff-values">{{ show(original[item.key]) }} → <span>{{ show(values[item.key]) }}</span></pre>
                            </div></VExpansionPanelText
                        ></VExpansionPanel
                    >
                </VExpansionPanels>
                <p class="server-config__diff-foot">
                    {{
                        text(
                            "The previous contents are copied aside before the file is replaced.",
                            "換檔案之前，會先將舊內容抄一份放埋一邊。",
                        )
                    }}
                </p>
            </VCard>
            <VAlert v-if="conflict" type="error" variant="flat" class="server-config__conflict">{{
                text(
                    "The source changed. Your draft is retained. Review it before explicitly reloading; no automatic overwrite is allowed.",
                    "原檔案已變更。草稿仍然保留，請檢視後才重新載入；不會自動覆寫。",
                )
            }}</VAlert>
            <VAlert v-if="saved" type="success" variant="tonal" role="status">{{
                text("Saved and read back.", "已儲存並重新讀取。")
            }}</VAlert>
            <VBtn
                block
                color="primary"
                variant="flat"
                :loading="saving"
                :disabled="!!blockReason || loading || conflict || hash === null"
                @click="save"
                >{{ text("Save changes", "儲存改動") }}</VBtn
            >
            <VBtn
                block
                variant="outlined"
                color="primary"
                :disabled="saving || loading"
                @click="reset"
                >{{ text("Reset draft", "重設草稿") }}</VBtn
            >
            <VBtn
                block
                variant="text"
                color="primary"
                :disabled="saving || loading"
                @click="load(true)"
                >{{ text("Discard draft and reload", "放棄草稿並重新載入") }}</VBtn
            >
        </aside>
    </div>
</template>
<style scoped>
/* `Worldlens.dc.html`'s Config tab: a file rail, the field cards, and the pending-changes column. */
.server-config {
    display: grid;
    grid-template-columns: 234px minmax(0, 1fr) 288px;
    gap: 20px;
    align-items: start;
    min-width: 0;
}
@media (max-width: 1100px) {
    .server-config {
        grid-template-columns: minmax(0, 1fr);
    }
}
.server-config__files,
.server-config__main,
.server-config__side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}
.server-config .server-config__file-list {
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-large);
    overflow: hidden;
    padding: 0;
}
.server-config .server-config__file {
    margin: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 10px 14px;
    border-bottom: 1px solid rgb(var(--v-theme-surface-container));
}
.server-config .server-config__file.v-list-item--active {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}
.server-config__file :deep(.v-list-item-title) {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    font-weight: 400;
    direction: rtl;
    text-align: left;
}
.server-config__file :deep(.v-list-item__prepend) {
    margin-inline-end: 10px;
}
.server-config__file :deep(.v-list-item__spacer) {
    inline-size: 0;
}
.server-config .server-config__truth {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 14px 18px;
}
.server-config__truth-icon {
    color: rgb(var(--v-theme-primary));
}
.server-config__truth p {
    margin: 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    color: rgb(var(--v-theme-on-surface-variant));
}
.toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
}
.toolbar > :first-child {
    flex: 1 1 220px;
}
.server-config__group {
    margin: 6px 0 0;
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-primary));
}
.server-config .server-config__field--changed {
    border-color: rgb(var(--v-theme-primary));
}
.server-config .field {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 18px;
    padding: 14px 18px;
    min-width: 0;
}
.server-config__field-doc {
    flex: 1 1 260px;
    min-width: 0;
}
.server-config__field-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
}
.server-config__key {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: 500;
}
.server-config__field--changed .server-config__key {
    color: rgb(var(--v-theme-primary));
}
.server-config__type,
.server-config__label {
    font-size: var(--md-sys-typescale-label-small-size);
    color: rgb(var(--v-theme-outline));
}
.server-config__help {
    margin: 4px 0 0;
    max-inline-size: 68ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    color: rgb(var(--v-theme-on-surface-variant));
    white-space: pre-line;
}
.server-config__control {
    flex: 0 1 262px;
    min-width: 0;
}
.server-config__control--wide {
    flex: 1 1 100%;
}
.server-config .server-config__diff {
    padding: 0;
    overflow: hidden;
}
.server-config__diff-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 13px 16px;
    border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: 500;
}
.server-config__review :deep(.v-expansion-panel) {
    background: transparent;
}
.server-config__diff-row {
    padding-block: 8px;
    border-bottom: 1px solid rgb(var(--v-theme-surface-container-high));
}
.server-config__diff-path {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-primary));
}
.server-config__diff-values {
    margin: 3px 0 0;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
.server-config__diff-values span {
    color: rgb(var(--v-theme-on-surface));
}
.server-config__diff-foot {
    margin: 0;
    padding: 12px 16px;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 19px;
    color: rgb(var(--v-theme-on-surface-variant));
}
.server-config .server-config__conflict {
    background: rgb(var(--v-theme-error-container));
    color: rgb(var(--v-theme-on-error-container));
}
</style>
