<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VSelect,
    VSwitch,
    VTextField,
    VChip,
    VTextarea,
} from "vuetify/components";
import { profilesStore } from "../../stores/profiles.js";
import * as mapStore from "../../stores/bluemap.js";
import { workflowText as text } from "./workflowText.js";
interface Answer<T> {
    ok: boolean;
    value?: T;
    failure?: { message: string };
}
interface Capability {
    engine: "mineflayer" | "baritone";
    serverVersion: string;
    available: boolean;
    reason: string | null;
    runtimeVerified: boolean;
}
interface Status {
    id: string;
    attempt: string;
    engine: string;
    state: string;
    message: string;
    position: { kind: "point"; dimension: string; x: number; y: number; z: number } | null;
}
interface Api {
    profiles?(request: { serverId: string }): Promise<Answer<Capability[]> | Capability[]>;
    accounts?(): Promise<Answer<{ accountRef: string; label: string }[]>>;
    prepareAccount?(request: { provider: "microsoft" | "offline"; username: string }): Promise<
        Answer<{
            accountRef?: string;
            label?: string;
            verificationUrl?: string;
            userCode?: string;
            state: string;
        }>
    >;
    deploy?(request: {
        engine: "mineflayer" | "baritone";
        serverId: string;
        accountRef: string;
        navigation: boolean;
    }): Promise<Answer<Status> | Status>;
    stop?(request: { botId: string }): Promise<Answer<Status> | Status>;
    reconnect?(request: { botId: string }): Promise<Answer<Status> | Status>;
    status?(request: { botId: string }): Promise<Answer<Status> | Status>;
    navigate?(request: {
        botId: string;
        point: { kind: "point"; dimension: string; x: number; y: number; z: number };
    }): Promise<Answer<Status> | Status>;
    cancel?(request: { botId: string }): Promise<Answer<Status> | Status>;
}
const props = defineProps<{ serverId: string }>();
const api = (globalThis as unknown as { worldlens?: { mcserver?: { bots?: Api } } }).worldlens
    ?.mcserver?.bots;
const engine = ref<"mineflayer" | "baritone">("mineflayer");
const capabilities = ref<Capability[]>([]);
const accounts = ref<{ reference: string; label: string }[]>([]);
const accountRef = ref("");
const username = ref("");
const navigation = ref(true);
const provider = ref<"microsoft" | "offline">("microsoft");
const challenge = ref<{ verificationUrl?: string; userCode?: string; state: string } | null>(null);
const ids = ref<Record<string, string>>({});
const statuses = ref<Record<string, Status>>({});
const logs = ref<Record<string, { at: string; message: string }[]>>({});
const failure = ref("");
const busy = ref("");
const observation = ref("unknown");
const x = ref(0),
    y = ref(64),
    z = ref(0);
const dimension = ref("minecraft:overworld");
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let generation = 0;
const key = computed(() => `${props.serverId}:${engine.value}`);
const selected = computed(() => capabilities.value.find((item) => item.engine === engine.value));
const currentId = computed(() => ids.value[key.value]);
const status = computed(() => statuses.value[key.value]);
const activeProfile = computed(() =>
    profilesStore.profiles.find((profile) => profile.id === profilesStore.activeId),
);
const mapPicker = (
    mapStore as unknown as {
        acquireSpatialPicker?: (
            callback: (point: { x: number; y: number; z: number }) => void,
        ) => () => void;
    }
).acquireSpatialPicker;
let releasePicker: (() => void) | undefined;
const picking = ref(false);
function cancelPick(): void {
    releasePicker?.();
    releasePicker = undefined;
    picking.value = false;
}
function pick(): void {
    cancelPick();
    const profile = activeProfile.value;
    if (!mapPicker || profile?.serverId !== props.serverId || !profile.dimension) return;
    const selectedProfile = profile.id;
    const selectedDimension = profile.dimension;
    picking.value = true;
    releasePicker = mapPicker((point) => {
        if (activeProfile.value?.id !== selectedProfile) return;
        x.value = point.x;
        y.value = point.y;
        z.value = point.z;
        dimension.value = selectedDimension;
        cancelPick();
    });
}
watch(() => [activeProfile.value?.id, activeProfile.value?.serverId, props.serverId], cancelPick);
const choices = computed(() => [
    { title: "Mineflayer", value: "mineflayer" },
    { title: "Baritone Java client", value: "baritone" },
]);
function answer<T>(value: Answer<T> | T): Answer<T> {
    return value && typeof value === "object" && "ok" in value
        ? (value as Answer<T>)
        : { ok: true, value: value as T };
}
async function invoke<T>(
    action: string,
    call: () => Promise<Answer<T> | T>,
    accept: (value: T) => void,
): Promise<void> {
    if (busy.value) return;
    busy.value = action;
    failure.value = "";
    const serial = generation;
    try {
        const result = answer(await call());
        if (serial !== generation) return;
        if (result.ok && result.value !== undefined) accept(result.value);
        else
            failure.value =
                result.failure?.message ??
                text("The bot operation did not complete.", "機械人操作未完成。");
    } catch {
        if (serial === generation)
            failure.value = text(
                "The bot operation could not be observed.",
                "無法觀察機械人操作結果。",
            );
    } finally {
        busy.value = "";
    }
}
async function load(): Promise<void> {
    const serial = ++generation;
    capabilities.value = [];
    observation.value = "unknown";
    if (!api?.profiles) {
        failure.value = text(
            "Bot profiles are unavailable in this build.",
            "此版本未提供機械人設定檔。",
        );
        return;
    }
    try {
        const result = answer(await api.profiles({ serverId: props.serverId }));
        if (serial !== generation) return;
        if (result.ok && result.value) capabilities.value = result.value;
        else
            failure.value =
                result.failure?.message ?? text("Compatibility is unknown.", "相容性未知。");
        if (api.accounts) {
            const answer = await api.accounts();
            if (serial === generation && answer.ok && answer.value)
                accounts.value = answer.value.map((account) => ({
                    reference: account.accountRef,
                    label: account.label,
                }));
        }
    } catch {
        if (serial === generation)
            failure.value = text("Compatibility is unknown.", "相容性未知。");
    }
}
async function observe(): Promise<void> {
    const id = currentId.value,
        k = key.value,
        serial = generation;
    try {
        if (id && api?.status) {
            const result = answer(await api.status({ botId: id }));
            if (serial !== generation || id !== ids.value[k]) return;
            if (result.ok && result.value) {
                statuses.value = { ...statuses.value, [k]: result.value };
                const previous = logs.value[k] ?? [];
                if (previous.at(-1)?.message !== result.value.message)
                    logs.value = {
                        ...logs.value,
                        [k]: [
                            ...previous,
                            { at: new Date().toISOString(), message: result.value.message },
                        ].slice(-200),
                    };
                if (k === key.value) observation.value = "observed";
            } else if (k === key.value) observation.value = "unknown";
        }
    } catch {
        if (k === key.value) observation.value = "unknown";
    } finally {
        if (!disposed) timer = setTimeout(() => void observe(), 2500);
    }
}

function prepareAccount(): void {
    if (!api?.prepareAccount) return;
    challenge.value = null;
    void invoke(
        "account",
        () => api.prepareAccount!({ provider: provider.value, username: username.value }),
        (value) => {
            challenge.value = value;
            if (value.accountRef) {
                accounts.value = [
                    ...accounts.value,
                    { reference: value.accountRef, label: value.label ?? username.value },
                ];
                accountRef.value = value.accountRef;
            }
        },
    );
}
function create(): void {
    if (
        !api?.deploy ||
        !selected.value?.available ||
        (currentId.value && !["stopped", "failed"].includes(status.value?.state ?? ""))
    )
        return;
    const k = key.value;
    void invoke(
        "deploy",
        () =>
            api.deploy!({
                engine: engine.value,
                serverId: props.serverId,
                accountRef: accountRef.value,
                navigation: navigation.value,
            }),
        (value) => {
            ids.value = { ...ids.value, [k]: value.id };
            statuses.value = { ...statuses.value, [k]: value };
            observation.value = "observed";
        },
    );
}
function lifecycle(action: "stop" | "reconnect" | "cancel"): void {
    const id = currentId.value,
        k = key.value,
        method = api?.[action];
    if (!id || !method) return;
    void invoke(
        action,
        () => method({ botId: id }),
        (value) => {
            if (ids.value[k] !== id) return;
            // Reconnection creates a new main-owned session. Adopt its identity before any later poll.
            ids.value = { ...ids.value, [k]: value.id };
            statuses.value = { ...statuses.value, [k]: value };
            observation.value = "observed";
        },
    );
}
function navigate(): void {
    const id = currentId.value,
        k = key.value;
    if (!id || !api?.navigate || ![x.value, y.value, z.value].every(Number.isFinite)) return;
    void invoke(
        "navigate",
        () =>
            api.navigate!({
                botId: id,
                point: {
                    kind: "point",
                    dimension: dimension.value,
                    x: x.value,
                    y: y.value,
                    z: z.value,
                },
            }),
        (value) => (statuses.value = { ...statuses.value, [k]: value }),
    );
}
function approvedSignIn(url: string | undefined): boolean {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return (
            parsed.protocol === "https:" &&
            [
                "microsoft.com",
                "www.microsoft.com",
                "login.microsoftonline.com",
                "login.live.com",
            ].includes(parsed.hostname)
        );
    } catch {
        return false;
    }
}
onMounted(() => {
    void load();
    void observe();
});
watch(engine, () => {
    observation.value = "unknown";
    challenge.value = null;
});
watch(
    () => props.serverId,
    () => {
        challenge.value = null;
        void load();
    },
);
onBeforeUnmount(() => {
    disposed = true;
    generation++;
    cancelPick();
    clearTimeout(timer);
    challenge.value = null;
});
</script>
<template>
    <VCard variant="outlined" class="bot-panel"
        ><VCardText
            ><h3>{{ text("Independent bot profiles", "獨立機械人設定檔") }}</h3>
            <VSelect
                v-model="engine"
                :items="choices"
                :label="text('Bot engine', '機械人引擎')"
                :disabled="!!busy"
            /><VAlert v-if="failure" type="error" role="status">{{ failure }}</VAlert
            ><VAlert v-if="selected?.reason" type="warning">{{ selected.reason }}</VAlert>
            <p>
                {{ text("Compatibility", "相容性") }}:
                {{
                    selected?.available
                        ? text("Declared for this exact version", "已列明支援此指定版本")
                        : text("Unavailable or unknown", "不可用或未知")
                }}
            </p>
            <p>
                {{
                    text(
                        "Runtime verification is separate for each profile.",
                        "每個設定檔的執行驗證均獨立計算。",
                    )
                }}
            </p>
            <div class="bot-grid">
                <VSelect
                    v-model="provider"
                    :items="['microsoft', 'offline']"
                    :label="text('Account provider', '帳戶類型')"
                /><VTextField
                    v-model="username"
                    :label="text('Account display name', '帳戶顯示名稱')"
                    autocomplete="username"
                />
            </div>
            <VBtn :disabled="!!busy || !username || !api?.prepareAccount" @click="prepareAccount">{{
                text("Prepare protected account", "準備受保護的帳戶")
            }}</VBtn>
            <div v-if="challenge" aria-live="polite">
                <p>{{ challenge.state }}</p>
                <a
                    v-if="approvedSignIn(challenge.verificationUrl)"
                    :href="challenge.verificationUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ text("Complete protected sign-in", "完成受保護登入") }}</a
                >
                <p>{{ challenge.userCode }}</p>
            </div>
            <VSelect
                v-model="accountRef"
                :items="accounts"
                item-title="label"
                item-value="reference"
                :label="text('Protected account', '受保護的帳戶')"
            /><VSwitch v-model="navigation" :label="text('Enable navigation', '啟用導航')" />
            <div class="bot-actions">
                <VBtn
                    :disabled="
                        !!busy ||
                        !selected?.available ||
                        !accountRef ||
                        !api?.deploy ||
                        (!!currentId && !['stopped', 'failed'].includes(status?.state ?? ''))
                    "
                    @click="create"
                    >{{ text("Deploy selected profile", "部署已選設定檔") }}</VBtn
                ><VBtn
                    :disabled="!!busy || !currentId || !api?.reconnect"
                    @click="lifecycle('reconnect')"
                    >{{ text("Reconnect", "重新連線") }}</VBtn
                ><VBtn :disabled="!!busy || !currentId || !api?.stop" @click="lifecycle('stop')">{{
                    text("Stop", "停止")
                }}</VBtn>
            </div>
            <VChip>{{ text("Observation", "觀察狀態") }}: {{ observation }}</VChip>
            <p v-if="status">{{ status.engine }} · {{ status.state }} · {{ status.message }}</p>
            <h4>{{ text("Navigate to a position", "前往指定位置") }}</h4>
            <VBtn
                :disabled="
                    !mapPicker || activeProfile?.serverId !== serverId || !activeProfile?.dimension
                "
                @click="pick"
                >{{ text("Pick destination on this server map", "在此伺服器地圖選擇目的地") }}</VBtn
            ><VBtn v-if="picking" @click="cancelPick">{{
                text("Cancel map selection", "取消地圖選擇")
            }}</VBtn>
            <p>
                {{
                    text(
                        "Picking coordinates prepares the destination; only Navigate sends it.",
                        "選擇座標只會準備目的地；按下導航才會執行。",
                    )
                }}
            </p>
            <div class="bot-grid">
                <VTextField v-model="dimension" :label="text('Dimension', '維度')" /><VTextField
                    v-model.number="x"
                    type="number"
                    label="X"
                /><VTextField v-model.number="y" type="number" label="Y" /><VTextField
                    v-model.number="z"
                    type="number"
                    label="Z"
                />
            </div>
            <div class="bot-actions">
                <VBtn
                    :disabled="
                        !!busy ||
                        observation !== 'observed' ||
                        !['connected', 'navigating'].includes(status?.state ?? '') ||
                        !api?.navigate
                    "
                    @click="navigate"
                    >{{ text("Navigate", "導航") }}</VBtn
                ><VBtn
                    :disabled="!!busy || !currentId || !api?.cancel"
                    @click="lifecycle('cancel')"
                    >{{ text("Cancel navigation (keep connected)", "取消導航（保留連線）") }}</VBtn
                >
            </div>
            <VTextarea
                :model-value="
                    (logs[key] ?? []).map((line) => `${line.at} ${line.message}`).join('\n')
                "
                readonly
                :label="text('Observed lifecycle messages', '已觀察的生命週期訊息')"
                rows="6"
            /> </VCardText
    ></VCard>
</template>
<style scoped>
.bot-panel {
    white-space: pre-line;
    min-width: 0;
}
.bot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
    gap: 12px;
    margin-block: 12px;
}
.bot-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block: 12px;
}
.bot-actions :deep(.v-btn__content) {
    white-space: pre-line;
}
</style>
