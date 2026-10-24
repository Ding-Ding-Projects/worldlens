<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VCheckbox,
    VDialog,
    VSelect,
    VTextField,
    VChip,
    VProgressLinear,
    VExpansionPanels,
    VExpansionPanel,
    VExpansionPanelTitle,
    VExpansionPanelText,
} from "vuetify/components";
import ConfigControl from "../config/ConfigControl.vue";
import RecursiveValueEditor from "../config/RecursiveValueEditor.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    generationDialogOpen,
    generationBridge,
    type GenerationRequest,
    type GenerationState,
    type GenerationField,
} from "./generationWorkflow.js";
import { useServerStore } from "./useServers.js";
import { workflowText as text } from "./workflowText.js";
import type { PlainValue } from "@worldlens/config";
const emit = defineEmits<{ openProject: [world: string] }>();
const store = useServerStore();
const bridge = generationBridge();
const id = ref(`generation-${Date.now().toString(36)}`);
const name = ref("New world");
const flavour = ref<GenerationRequest["flavour"]>("vanilla");
const version = ref("");
const port = ref(25565);
const memory = ref(2048);
const seed = ref("");
const worldName = ref("world");
const consent = ref(false);
const eula = ref(false);
const busy = ref(false);
const failure = ref("");
const operation = ref<GenerationState | null>(null);
const request = ref<GenerationRequest | null>(null);
const cancellation = ref(false);
const catalogue = ref<Awaited<ReturnType<typeof store.catalogueList>>["value"]>();
const fields = ref<GenerationField[]>([]);
const inventory = ref<unknown>(null);
const inventorySource = ref("");
const inventorySources = computed(() =>
    (store.servers?.value ?? [])
        .filter(
            (server) =>
                server.flavour === flavour.value && server.minecraftVersion === version.value,
        )
        .map((server) => ({ title: server.name, value: server.id })),
);
const privateProperties = new Set(["property:rcon.password", "property:management-server-secret"]);
const values = ref<Record<string, unknown>>({});
const query = ref("");
const regex = ref(false);
const flags = ref("i");
const flavours = computed(
    () =>
        catalogue.value?.flavours
            .filter((item) => ["vanilla", "paper", "purpur", "spigot"].includes(item.flavour))
            .map((item) => item.flavour) ?? ["vanilla"],
);
const versions = computed(
    () =>
        catalogue.value?.flavours
            .find((item) => item.flavour === flavour.value)
            ?.versions.filter((item) => item.availability !== "missing-server-artifact")
            .map((item) => item.version) ?? [],
);
const filtered = computed(() => {
    const matcher = createSettingMatcher(query.value, regex.value, flags.value);
    return fields.value.filter((field) =>
        matcher.test(`${field.key} ${field.label} ${field.category}`),
    );
});
const activeStages = new Set(["creating-server", "generating", "inspecting", "creating-project"]);
const observing = computed(
    () => operation.value !== null && activeStages.has(operation.value.stage),
);
const running = computed(() => busy.value || observing.value);
const locked = computed(() => running.value || request.value !== null);
const canRun = computed(
    () =>
        !!bridge &&
        consent.value &&
        eula.value &&
        !!version.value &&
        Number.isInteger(port.value) &&
        port.value > 0 &&
        port.value < 65536 &&
        !!name.value.trim() &&
        Number.isInteger(memory.value) &&
        memory.value >= 512 &&
        !running.value,
);
const key = "worldlens.generation.workflow.v1";
function persist(): void {
    try {
        localStorage.setItem(
            key,
            JSON.stringify({
                id: id.value,
                name: name.value,
                flavour: flavour.value,
                version: version.value,
                port: port.value,
                memory: memory.value,
                seed: seed.value,
                worldName: worldName.value,
                request: request.value,
            }),
        );
    } catch {
        failure.value = text(
            "Draft persistence is unavailable. Keep this window open until the operation is saved.",
            "無法保留草稿。請保持此視窗開啟，直至操作狀態已儲存。",
        );
    }
}
let unsubscribe: (() => void) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let descriptorRequest = 0;
async function descriptors(): Promise<void> {
    const serial = ++descriptorRequest;
    fields.value = [];
    inventory.value = null;
    values.value = {};
    if (!bridge?.capabilities || !version.value) return;
    try {
        const result = await bridge.capabilities({
            edition: "java",
            version: version.value,
            flavour: flavour.value,
            ...(inventorySource.value ? { serverId: inventorySource.value } : {}),
        });
        if (serial !== descriptorRequest) return;
        if (result.ok && result.value) {
            inventory.value = result.value.inventory;
            fields.value = result.value.descriptors.map((field) => {
                if (!privateProperties.has(field.key)) return field;
                const { value: _privateValue, ...safe } = field;
                return {
                    ...safe,
                    available: false,
                    reason: text(
                        "Use protected account settings for this value.",
                        "請使用受保護的帳戶設定修改此數值。",
                    ),
                };
            });
            for (const field of fields.value)
                if (field.available && field.value !== undefined)
                    values.value[field.key] = field.value;
        } else
            failure.value =
                result.failure?.message ??
                text("Generation inventory unavailable.", "無法取得產生選項清單。");
    } catch {
        if (serial === descriptorRequest)
            failure.value = text("Generation inventory unavailable.", "無法取得產生選項清單。");
    }
}
async function refresh(): Promise<void> {
    if (!bridge) return;
    const observedId = id.value;
    try {
        const result = await bridge.read(observedId);
        if (observedId !== id.value || disposed) return;
        if (result.ok && result.value?.id === id.value) operation.value = result.value;
        else if (!result.ok)
            failure.value =
                result.failure?.message ??
                text("Operation state unavailable.", "無法取得操作狀態。");
    } catch {
        failure.value = text(
            "Operation observation unavailable; completion is unknown.",
            "無法取得操作狀態，完成情況未知。",
        );
    }
}
async function poll(): Promise<void> {
    await refresh();
    if (!disposed && running.value) timer = setTimeout(() => void poll(), 1500);
}
async function run(): Promise<void> {
    if (!canRun.value) return;
    const payload: GenerationRequest = request.value ?? {
        operationId: id.value,
        name: name.value,
        edition: "java",
        flavour: flavour.value,
        version: version.value,
        memoryMb: memory.value,
        port: port.value,
        acceptedEula: eula.value,
        provisionJavaIfMissing: true,
        seed: seed.value,
        worldName: worldName.value,
        downloadConsent: consent.value,
        ...(Object.keys(values.value).length ? { capabilityValues: values.value } : {}),
    };
    request.value = JSON.parse(JSON.stringify(payload)) as GenerationRequest;
    persist();
    busy.value = true;
    failure.value = "";
    cancellation.value = false;
    void poll();
    try {
        const result = await bridge!.run(
            JSON.parse(JSON.stringify(request.value)) as GenerationRequest,
        );
        if (result.ok && result.value) {
            operation.value = result.value;
            if (
                result.value.stage === "complete" &&
                result.value.worldFolder &&
                result.value.projectPath
            ) {
                emit("openProject", result.value.worldFolder);
            }
        } else {
            failure.value =
                result.failure?.message ?? text("Generation incomplete.", "產生程序未完成。");
            await refresh();
        }
    } catch {
        failure.value = text(
            "Connection lost. Refresh the durable operation before retrying.",
            "連線中斷。重試前請更新已儲存的操作狀態。",
        );
    } finally {
        busy.value = false;
        clearTimeout(timer);
        if (!disposed && observing.value) timer = setTimeout(() => void poll(), 1500);
    }
}
async function cancel(): Promise<void> {
    if (!bridge) return;
    try {
        const result = await bridge.cancel(id.value);
        cancellation.value = result.ok && result.value?.requested === true;
        if (!cancellation.value) await refresh();
    } catch {
        failure.value = text("Cancellation could not be confirmed.", "未能確認取消要求。");
    }
}
function newOperation(): void {
    if (running.value) return;
    id.value = `generation-${Date.now().toString(36)}`;
    request.value = null;
    operation.value = null;
    consent.value = false;
    eula.value = false;
    void descriptors();
    persist();
}
onMounted(async () => {
    try {
        const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Record<
            string,
            unknown
        > | null;
        if (saved && typeof saved.id === "string" && /^[a-z][a-z0-9-]{0,62}$/.test(saved.id)) {
            id.value = saved.id;
            for (const [field, target] of [
                [saved.name, name],

                [saved.version, version],

                [saved.seed, seed],
                [saved.worldName, worldName],
            ] as const)
                if (typeof field === "string") target.value = field;
            if (typeof saved.memory === "number") memory.value = saved.memory;
            if (typeof saved.port === "number") port.value = saved.port;
            if (["vanilla", "paper", "purpur", "spigot"].includes(String(saved.flavour)))
                flavour.value = saved.flavour as GenerationRequest["flavour"];
            if (
                saved.request &&
                typeof saved.request === "object" &&
                "operationId" in saved.request &&
                !("server" in saved.request)
            )
                request.value = saved.request as GenerationRequest;
        }
    } catch {
        failure.value = text("Saved draft could not be restored.", "無法還原已儲存的草稿。");
    }
    if (typeof store.load === "function") await store.load();
    const result = await store.catalogueList();
    if (result.ok) catalogue.value = result.value;
    else
        failure.value =
            result.failure?.message ?? text("Version catalogue unavailable.", "無法取得版本清單。");
    unsubscribe = bridge?.onState?.((state) => {
        if (state.id === id.value) operation.value = state;
    });
    await refresh();
    if (observing.value) void poll();
    if (!locked.value) await descriptors();
});
watch([name, flavour, version, port, memory, seed, worldName], persist);
watch([version, flavour, inventorySource], () => {
    if (!locked.value) void descriptors();
});
onBeforeUnmount(() => {
    disposed = true;
    clearTimeout(timer);
    unsubscribe?.();
});
</script>
<template>
    <VDialog v-model="generationDialogOpen" max-width="900" scrollable
        ><VCard class="generation-dialog"
            ><VCardTitle>{{ text("Generate and start project", "產生世界並建立專案") }}</VCardTitle
            ><VCardText>
                <VAlert v-if="!bridge" type="warning">{{
                    text(
                        "The generation coordinator is unavailable in this build.",
                        "此版本未提供世界產生協調服務。",
                    )
                }}</VAlert
                ><VAlert v-if="failure" type="error" role="status">{{ failure }}</VAlert>
                <div class="generation-grid">
                    <VTextField
                        v-model="name"
                        :label="text('Project name', '專案名稱')"
                        :disabled="locked"
                    /><VTextField
                        v-model.number="port"
                        type="number"
                        :label="text('Server port', '伺服器連接埠')"
                        :disabled="locked"
                    /><VSelect
                        v-model="flavour"
                        :items="flavours"
                        :label="text('Distribution', '伺服器類型')"
                        :disabled="locked"
                    /><VSelect
                        v-model="version"
                        :items="versions"
                        :label="text('Exact version', '指定版本')"
                        :disabled="locked"
                    /><VTextField
                        v-model="seed"
                        :label="text('Seed (exact text)', '種子碼（完整文字）')"
                        :disabled="locked"
                    /><VTextField
                        v-model="worldName"
                        :label="text('World folder name', '世界資料夾名稱')"
                        :disabled="locked"
                    /><VTextField
                        v-model.number="memory"
                        type="number"
                        min="512"
                        :label="text('Memory (MiB)', '記憶體（MiB）')"
                        :disabled="locked"
                    />
                </div>
                <VAlert type="info" variant="tonal">{{
                    text(
                        "Java vanilla generates a real persistent world. Pregeneration is off. Unsupported target options remain unavailable.",
                        "Java 原版會產生真正的永久世界。預先產生區塊已關閉。不支援的目標選項會標示為不可用。",
                    )
                }}</VAlert>
                <VExpansionPanels
                    ><VExpansionPanel
                        ><VExpansionPanelTitle>{{
                            text("Version-bound generation options", "指定版本的產生選項")
                        }}</VExpansionPanelTitle
                        ><VExpansionPanelText
                            ><VSelect
                                v-model="inventorySource"
                                :items="inventorySources"
                                :label="
                                    text(
                                        'Use exact-version inventory from server',
                                        '使用伺服器的指定版本選項清單',
                                    )
                                "
                                :disabled="locked"
                                clearable
                                @update:model-value="inventorySource = $event ?? ''"
                            />
                            <ConfigSearchField
                                v-model="query"
                                v-model:regex="regex"
                                v-model:flags="flags"
                                :label="text('Search generation settings', '搜尋產生設定')"
                                :sample="
                                    fields.map((field: GenerationField) => field.label).join('\n')
                                "
                            /><VAlert v-if="!fields.length" type="info">{{
                                text(
                                    "No exact target inventory is available yet. Only the verified basic generation inputs will be sent.",
                                    "尚未取得指定目標的選項清單。只會傳送已驗證的基本輸入。",
                                )
                            }}</VAlert>
                            <div
                                v-for="field in filtered"
                                :key="field.key"
                                class="generation-field"
                            >
                                <ConfigControl
                                    v-if="
                                        field.control &&
                                        (values[field.key] === undefined ||
                                            typeof values[field.key] !== 'object')
                                    "
                                    :control="field.control"
                                    :model-value="(values[field.key] ?? null) as PlainValue"
                                    :label="field.label"
                                    :disabled="locked || !field.available"
                                    @update:model-value="values[field.key] = $event"
                                /><RecursiveValueEditor
                                    v-else-if="field.control"
                                    v-model="values[field.key]"
                                    :label="field.label"
                                    :disabled="locked || !field.available"
                                /><strong v-else>{{ field.label }}</strong>
                                <p v-if="field.reason">{{ field.reason }}</p>
                            </div></VExpansionPanelText
                        ></VExpansionPanel
                    ></VExpansionPanels
                >
                <VCheckbox
                    v-model="consent"
                    :disabled="running"
                    :label="
                        text(
                            'Allow required server and Java downloads',
                            '允許下載所需伺服器及 Java',
                        )
                    "
                /><VCheckbox
                    v-model="eula"
                    :disabled="running"
                    :label="
                        text(
                            'I accept the Minecraft EULA for this server',
                            '本人接受此伺服器的 Minecraft 使用者授權合約',
                        )
                    "
                />
                <section v-if="operation" aria-live="polite">
                    <VChip>{{ operation.stage }}</VChip>
                    <p>{{ operation.message }}</p>
                    <p v-if="operation.worldFolder">{{ operation.worldFolder }}</p>
                </section>
                <VProgressLinear
                    v-if="running"
                    indeterminate
                    :aria-label="text('Generation in progress', '正在產生世界')"
                />
                <p v-if="cancellation" role="status">
                    {{
                        text(
                            "Cancellation requested. Waiting for safe stop and saved state.",
                            "已要求取消，正在等候安全停止及儲存狀態。",
                        )
                    }}
                </p> </VCardText
            ><VCardActions class="generation-actions"
                ><VBtn color="primary" :disabled="!canRun" @click="run">{{
                    request
                        ? text("Resume verified operation", "繼續已記錄的操作")
                        : text("Generate and start project", "產生世界並建立專案")
                }}</VBtn
                ><VBtn v-if="running" @click="cancel">{{ text("Cancel safely", "安全取消") }}</VBtn
                ><VBtn @click="refresh">{{ text("Refresh status", "更新狀態") }}</VBtn
                ><VBtn v-if="request && !running" @click="newOperation">{{
                    text("New operation", "新增操作")
                }}</VBtn
                ><VBtn @click="generationDialogOpen = false">{{
                    text("Close (keeps operation)", "關閉（保留操作）")
                }}</VBtn></VCardActions
            ></VCard
        ></VDialog
    >
</template>
<style scoped>
.generation-dialog {
    white-space: pre-line;
}
.generation-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
    gap: 12px;
}
.generation-actions {
    flex-wrap: wrap;
}
.generation-actions :deep(.v-btn__content) {
    white-space: pre-line;
}
.generation-field {
    margin-block: 12px;
    min-width: 0;
}
</style>
