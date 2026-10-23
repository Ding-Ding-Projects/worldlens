<script setup lang="ts">
import { onMounted, ref, toRef } from "vue";
import { VAlert, VBtn, VCard, VCardText, VTextField, VChip } from "vuetify/components";
import {
    hostingBridge,
    preparedAccess,
    ACCESS_REFERENCE_KEY,
    accessPreparationDraft,
} from "./managedHostingBridge.js";
import { workflowText as text } from "../mcserver/workflowText.js";
const bridge = hostingBridge();
const username = toRef(accessPreparationDraft, "username");
const password = toRef(accessPreparationDraft, "password");
const busy = ref(false);
const failure = ref("");
async function refresh(): Promise<void> {
    const reference = preparedAccess.value?.reference ?? localStorage.getItem(ACCESS_REFERENCE_KEY);
    if (!reference || !bridge?.access?.read) return;
    try {
        const result = await bridge.access.read(reference);
        if (result.ok && result.value) preparedAccess.value = result.value;
        else
            failure.value =
                result.failure?.message ??
                text("Access observation is unavailable.", "無法取得存取設定狀態。");
    } catch {
        failure.value = text("Access observation is unavailable.", "無法取得存取設定狀態。");
    }
}
async function prepare(): Promise<void> {
    if (!bridge?.access?.prepare || busy.value) return;
    busy.value = true;
    failure.value = "";
    const submitted = password.value;
    password.value = "";
    try {
        const result = await bridge.access.prepare({
            username: username.value,
            password: submitted,
        });
        if (result.ok && result.value) {
            preparedAccess.value = result.value;
            localStorage.setItem(ACCESS_REFERENCE_KEY, result.value.reference);
        } else
            failure.value =
                result.failure?.message ??
                text("Protected access was not prepared.", "未能準備受保護的存取設定。");
    } catch {
        failure.value = text("Protected access was not prepared.", "未能準備受保護的存取設定。");
    } finally {
        busy.value = false;
    }
}
onMounted(() => void refresh());
</script>
<template>
    <VCard variant="outlined" class="access-panel"
        ><VCardText
            ><h3>{{ text("Access before rendering", "繪製前的存取設定") }}</h3>
            <p>
                {{
                    text(
                        "Prepare the administrator in protected local storage. Preparation does not provision or verify a host. Credentials stay outside project history and exports.",
                        "在受保護的本機儲存空間準備管理員。準備完成不代表主機已設定或驗證。登入資料不會加入專案歷史或匯出。",
                    )
                }}
            </p>
            <VAlert v-if="!bridge?.access" type="warning">{{
                text(
                    "Protected access is unavailable in this build.",
                    "此版本未提供受保護的存取設定。",
                )
            }}</VAlert
            ><VAlert v-if="failure" type="error" role="status">{{ failure }}</VAlert>
            <div class="access-fields">
                <VTextField
                    v-model="username"
                    :label="text('Administrator username', '管理員名稱')"
                    autocomplete="username"
                    :disabled="busy"
                /><VTextField
                    v-model="password"
                    type="password"
                    :label="text('Administrator password', '管理員密碼')"
                    autocomplete="new-password"
                    :disabled="busy"
                />
            </div>
            <div class="access-actions">
                <VBtn
                    color="primary"
                    :disabled="!bridge?.access || !username || !password || busy"
                    @click="prepare"
                    >{{ text("Prepare protected access", "準備受保護的存取設定") }}</VBtn
                ><VBtn :disabled="!preparedAccess || busy" @click="refresh">{{
                    text("Refresh access state", "更新存取狀態")
                }}</VBtn>
            </div>
            <div class="access-actions" aria-live="polite">
                <VChip :color="preparedAccess ? 'success' : 'default'"
                    >{{ text("Prepared", "已準備") }}:
                    {{ preparedAccess ? text("yes", "是") : text("unknown", "未知") }}</VChip
                ><VChip
                    >{{ text("Provisioned", "已設定") }}:
                    {{
                        preparedAccess?.state === "provisioned" ||
                        preparedAccess?.state === "verified"
                            ? text("yes", "是")
                            : text("not verified", "未驗證")
                    }}</VChip
                ><VChip
                    >{{ text("Verified", "已驗證") }}:
                    {{
                        preparedAccess?.state === "verified"
                            ? text("yes", "是")
                            : text("not verified", "未驗證")
                    }}</VChip
                >
            </div></VCardText
        ></VCard
    >
</template>
<style scoped>
.access-panel {
    white-space: pre-line;
    min-width: 0;
}
.access-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
    gap: 12px;
    margin-block: 12px;
}
.access-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block: 12px;
}
.access-actions :deep(.v-btn__content) {
    white-space: pre-line;
}
</style>
