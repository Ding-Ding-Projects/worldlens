<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { VAlert, VBtn, VSelect, VTextField, VCheckbox } from "vuetify/components";
import PathField from "../PathField.vue";
import { hostingBridge } from "./managedHostingBridge.js";
import type { HostingProfile } from "./managedHostingBridge.js";
import { workflowText as text } from "../mcserver/workflowText.js";
const props = defineProps<{ context: string; disabled: boolean }>();
const emit = defineEmits<{ selected: [profile: HostingProfile | null] }>();
const api = hostingBridge()?.profiles;
const profiles = ref<HostingProfile[]>([]);
const selected = ref("");
const empty = (): HostingProfile => ({
    id: "",
    name: "",
    target: "native-windows",
    origin: "",
    port: 8443,
    dataRoot: "",
    tlsCert: "",
    tlsKey: "",
    distribution: "",
});
const draft = reactive(empty());
const busy = ref(false);
const message = ref("");
const ready = ref(false);
const removeConfirmed = ref(false);
watch(
    draft,
    () => {
        ready.value = false;
        removeConfirmed.value = false;
        emit("selected", null);
    },
    { flush: "sync" },
);
watch(
    () => props.context,
    () => {
        ready.value = false;
        emit("selected", null);
    },
);
async function run(work: () => Promise<void>): Promise<void> {
    if (busy.value || props.disabled) return;
    busy.value = true;
    message.value = "";
    try {
        await work();
    } catch (error) {
        message.value =
            error instanceof Error
                ? error.message
                : text("Operation did not complete.", "操作未完成。");
    } finally {
        busy.value = false;
    }
}
async function reload(): Promise<void> {
    if (!api) return;
    const answer = await api.list();
    if (!answer.ok || !answer.value)
        throw new Error(
            answer.failure?.message ?? text("Profiles unavailable.", "無法讀取設定檔。"),
        );
    profiles.value = answer.value;
}
function choose(id: string): void {
    selected.value = id;
    Object.assign(draft, profiles.value.find((p) => p.id === id) ?? empty());
}
function save(): void {
    void run(async () => {
        if (!api) return;
        const answer = await api.save({ ...draft });
        if (!answer.ok || !answer.value)
            throw new Error(
                answer.failure?.message ?? text("Profile was not saved.", "設定檔未儲存。"),
            );
        await reload();
        choose(answer.value.id);
        message.value = text(
            "Saved locally. Check readiness before deploying.",
            "已儲存到本機。部署前請檢查準備狀態。",
        );
    });
}
function remove(): void {
    void run(async () => {
        if (!api || !draft.id || !removeConfirmed.value) return;
        const answer = await api.remove(draft.id);
        if (!answer.ok)
            throw new Error(
                answer.failure?.message ?? text("Profile was not removed.", "設定檔未移除。"),
            );
        await reload();
        choose("");
    });
}
function check(): void {
    void run(async () => {
        if (!api || !draft.id || !props.context) return;
        const saved = profiles.value.find((p) => p.id === draft.id);
        if (
            !saved ||
            (Object.keys(empty()) as (keyof HostingProfile)[]).some(
                (key) => saved[key] !== draft[key],
            )
        )
            throw new Error(text("Save your changes first.", "請先儲存變更。"));
        const checked = JSON.stringify({ ...draft });
        const context = props.context;
        const answer = await api.readiness({
            profileId: draft.id,
            context,
            target: draft.target,
            port: draft.port,
        });
        if (checked !== JSON.stringify({ ...draft }) || context !== props.context) return;
        if (!answer.ok || answer.value?.state !== "configured")
            throw new Error(
                answer.failure?.message ??
                    text("Host configuration is incomplete.", "主機設定未完成。"),
            );
        ready.value = true;
        emit("selected", { ...draft });
        message.value = text(
            "Configuration checked. Certificate trust, host health and LAN access remain unverified until deployment.",
            "設定已檢查。憑證信任、主機健康及區域網絡存取仍須在部署後驗證。",
        );
    });
}
onMounted(() => {
    void run(reload);
});
</script>
<template>
    <section class="profile-panel" :aria-label="text('Hosting profiles', '託管設定檔')">
        <h4>{{ text("Private hosting profile", "私人託管設定檔") }}</h4>
        <VAlert v-if="!api" type="info">{{
            text(
                "Hosting profile controls are unavailable in this build.",
                "此版本未提供託管設定檔控制。",
            )
        }}</VAlert>
        <VSelect
            :model-value="selected"
            :items="profiles"
            item-title="name"
            item-value="id"
            :label="text('Saved profile', '已儲存設定檔')"
            :disabled="disabled || busy"
            @update:model-value="choose"
        />
        <VBtn :disabled="disabled || busy" @click="choose('')">{{
            text("New profile", "新增設定檔")
        }}</VBtn>
        <div class="profile-grid">
            <VTextField
                v-model="draft.name"
                :label="text('Profile name', '設定檔名稱')"
                :disabled="disabled || busy"
                maxlength="100"
            />
            <VSelect
                v-model="draft.target"
                :items="[
                    { title: text('Native Windows', 'Windows 原生'), value: 'native-windows' },
                    { title: text('Native WSL', 'WSL 原生'), value: 'native-wsl' },
                    { title: text('Docker container', 'Docker 容器'), value: 'container' },
                ]"
                :label="text('Deployment target', '部署目標')"
                :disabled="disabled || busy"
            />
            <VTextField
                v-model="draft.origin"
                :label="text('Exact HTTPS origin including port', '完整 HTTPS 來源（包括連接埠）')"
                placeholder="https://map.example:8443"
                :disabled="disabled || busy"
            />
            <VTextField
                v-model.number="draft.port"
                type="number"
                min="1024"
                max="65535"
                :label="text('Host port', '主機連接埠')"
                :disabled="disabled || busy"
            />
            <VTextField
                v-if="draft.target === 'native-wsl'"
                v-model="draft.distribution"
                :label="text('Installed WSL distribution', '已安裝 WSL 發行版')"
                :disabled="disabled || busy"
            />
            <VTextField
                v-if="draft.target === 'native-wsl'"
                v-model="draft.dataRoot"
                :label="text('Existing private Linux data folder', '現有私人 Linux 資料夾')"
                :disabled="disabled || busy"
            />
            <PathField
                v-else
                :disabled="disabled || busy"
                v-model="draft.dataRoot"
                field="hosting private data"
                semantic="folder"
                :label="text('Existing private data folder', '現有私人資料夾')"
            />
            <PathField
                :disabled="disabled || busy"
                v-model="draft.tlsCert"
                field="hosting TLS certificate"
                semantic="file"
                :label="text('Local TLS certificate file', '本機 TLS 憑證檔')"
            />
            <PathField
                :disabled="disabled || busy"
                v-model="draft.tlsKey"
                field="hosting TLS private key"
                semantic="file"
                :label="text('Local TLS key file', '本機 TLS 金鑰檔')"
            />
        </div>
        <p>
            {{
                text(
                    "Choose existing TLS files trusted by your clients. No trust-store settings are changed. Private account storage must remain outside the map and export folders. WSL maps local TLS and context paths through the selected distribution.",
                    "請選擇用戶端信任的現有 TLS 檔案。此操作不會變更信任存放區。私人帳戶資料須留在地圖及匯出資料夾以外。WSL 會透過所選發行版轉換本機 TLS 及內容路徑。",
                )
            }}
        </p>
        <div class="profile-actions">
            <VBtn :disabled="!api || disabled || busy" @click="save">{{
                text("Save profile", "儲存設定檔")
            }}</VBtn>
            <VBtn :disabled="!api || disabled || busy || !draft.id || !context" @click="check">{{
                text("Check readiness", "檢查準備狀態")
            }}</VBtn>
        </div>
        <VCheckbox
            v-model="removeConfirmed"
            :disabled="!draft.id || disabled || busy"
            :label="
                text(
                    'Remove this profile only; keep running hosts and data',
                    '只移除此設定檔；保留運作中的主機及資料',
                )
            "
        />
        <VBtn
            :disabled="!api || disabled || busy || !draft.id || !removeConfirmed"
            @click="remove"
            >{{ text("Remove profile", "移除設定檔") }}</VBtn
        >
        <VAlert v-if="message" :type="ready ? 'success' : 'info'" role="status">{{
            message
        }}</VAlert>
    </section>
</template>
<style scoped>
.profile-panel {
    min-width: 0;
}
.profile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr));
    gap: 12px;
    margin-block: 12px;
}
.profile-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
p {
    overflow-wrap: anywhere;
    white-space: pre-line;
}
:deep(.v-btn__content) {
    white-space: pre-line;
}
</style>
