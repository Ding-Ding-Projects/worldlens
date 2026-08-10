<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDeleteSweep, mdiRefresh } from "@mdi/js";
import { VAlert, VBtn } from "vuetify/components";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import {
    resolveGhCliBridge,
    type GhCliLegacyCredentialRemovalReadout,
    type GhCliLegacyCredentialStatusReadout,
} from "./ghCliBridge.js";

const props = defineProps<{ hasFreshAccount: boolean }>();
const { locale } = useI18n();
const bridge = resolveGhCliBridge();
const status = ref<GhCliLegacyCredentialStatusReadout | null>(null);
const result = ref<GhCliLegacyCredentialRemovalReadout | null>(null);
const failure = ref<string | null>(null);
const loading = ref(false);
const removing = ref(false);

function localized(en: string, yue: string): string {
    if (locale.value === "yue") return yue;
    if (locale.value === "bilingual") return `${en} · ${yue}`;
    return en;
}

const copy = computed(() => ({
    title: localized("Retired credential files", "舊憑證檔案"),
    description: localized(
        "Older Worldlens versions stored GitHub credentials locally. Their contents are never opened or imported. After signing in again through GitHub CLI, remove the retired files here.",
        "舊版 Worldlens 曾經喺本機儲存 GitHub 憑證。新版唔會打開、讀取或者匯入入面內容。請先用 GitHub CLI 重新登入，再喺呢度刪除舊檔。",
    ),
    revoke: localized(
        "Deleting these local files does not revoke authorizations still listed by GitHub.",
        "刪除本機舊檔唔會撤銷 GitHub 帳戶入面仍然存在嘅授權。",
    ),
    needsAccount: localized(
        "Sign in through GitHub CLI first. Removal stays disabled until a fresh account is available.",
        "請先用 GitHub CLI 登入。未有新帳戶之前，刪除功能會保持停用。",
    ),
    confirmTitle: localized("Confirm deleting retired credential files", "確認刪除舊憑證檔案"),
    confirmAction: localized(
        "This permanently deletes only Worldlens's retired local GitHub credential locations. It does not sign out GitHub CLI, delete repositories, or revoke provider-side grants.",
        "呢個操作只會永久刪除 Worldlens 舊有嘅本機 GitHub 憑證位置；唔會登出 GitHub CLI、刪除儲存庫，亦唔會撤銷供應商端授權。",
    ),
    remove: localized("Delete retired files", "刪除舊檔"),
    check: localized("Check again", "再檢查"),
}));

const supported =
    typeof bridge?.ghCliLegacyCredentialStatus === "function" &&
    typeof bridge?.ghCliRemoveLegacyCredentials === "function";

async function load(): Promise<void> {
    if (!supported || loading.value) return;
    loading.value = true;
    failure.value = null;
    try {
        status.value = await bridge!.ghCliLegacyCredentialStatus!();
    } catch (error) {
        failure.value = error instanceof Error ? error.message : String(error);
    } finally {
        loading.value = false;
    }
}

async function remove(): Promise<void> {
    if (!supported || removing.value || !props.hasFreshAccount) return;
    removing.value = true;
    failure.value = null;
    try {
        const removeLegacyCredentials = bridge!.ghCliRemoveLegacyCredentials!;
        result.value = await removeLegacyCredentials();
        await load();
    } catch (error) {
        failure.value = error instanceof Error ? error.message : String(error);
    } finally {
        removing.value = false;
    }
}

onMounted(() => void load());
</script>

<template>
    <section v-if="supported && (status?.present || result !== null || failure !== null)" class="mb-legacy-credentials">
        <h4 class="mb-legacy-credentials__title">{{ copy.title }}</h4>
        <p class="mb-legacy-credentials__note">{{ copy.description }}</p>
        <v-alert v-if="status?.present" type="warning" variant="tonal" density="comfortable">
            {{ status.message }} {{ copy.revoke }}
        </v-alert>
        <v-alert v-if="!hasFreshAccount && status?.present" type="info" variant="tonal" density="comfortable">
            {{ copy.needsAccount }}
        </v-alert>
        <v-alert v-if="result !== null" type="success" variant="tonal" density="comfortable" role="status">
            {{ result.message }}
        </v-alert>
        <v-alert v-if="failure !== null" type="error" variant="tonal" density="comfortable" role="alert">
            {{ failure }}
        </v-alert>
        <div class="mb-legacy-credentials__actions">
            <ConfigSuperConfirm
                v-if="status?.present"
                :title="copy.confirmTitle"
                :action="copy.confirmAction"
                :confirm-label="copy.remove"
                :disabled="removing || !hasFreshAccount"
                @confirm="remove"
            >
                <template #activator="{ props: activatorProps }">
                    <v-btn
                        v-bind="activatorProps"
                        :prepend-icon="mdiDeleteSweep"
                        variant="tonal"
                        color="error"
                        :loading="removing"
                        :disabled="!hasFreshAccount"
                    >
                        {{ copy.remove }}
                    </v-btn>
                </template>
            </ConfigSuperConfirm>
            <v-btn :prepend-icon="mdiRefresh" variant="text" :loading="loading" @click="load">
                {{ copy.check }}
            </v-btn>
        </div>
    </section>
</template>

<style scoped>
.mb-legacy-credentials {
    display: grid;
    gap: 12px;
    padding-block-start: 12px;
    border-block-start: 1px solid rgba(var(--v-theme-outline), 0.32);
}

.mb-legacy-credentials__title,
.mb-legacy-credentials__note {
    margin: 0;
}

.mb-legacy-credentials__note {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-legacy-credentials__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
</style>
