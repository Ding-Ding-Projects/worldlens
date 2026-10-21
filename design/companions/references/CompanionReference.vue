<script setup lang="ts">
/** Design reference only. Actions emit an intent; this component never starts a process. */
import { computed } from "vue";
import {
    VApp,
    VAppBar,
    VAppBarTitle,
    VBtn,
    VMain,
    VContainer,
    VRow,
    VCol,
    VCard,
    VCardTitle,
    VCardText,
    VCardActions,
    VAlert,
    VChip,
    VTabs,
    VTab,
    VProgressLinear,
    VTextField,
    VDivider,
} from "vuetify/components";
import { companionStates } from "../state-inventory.js";
const props = withDefaults(
    defineProps<{
        surface: "build" | "guide";
        state: string;
        language?: "en" | "yue" | "both";
        theme?: "light" | "dark";
    }>(),
    { language: "en", theme: "light" },
);
const emit = defineEmits<{ intent: [action: string] }>();
const label = (en: string, yue: string): string =>
    props.language === "en" ? en : props.language === "yue" ? yue : `${en} · ${yue}`;
const current = computed(() =>
    companionStates.find(
        (state) =>
            state.id === props.state &&
            (state.surface === props.surface || state.surface === "shared"),
    ),
);
const active = computed(() =>
    ["acquiring", "building", "verifying", "installer", "running", "cancelling"].includes(
        props.state,
    ),
);
</script>

<template>
    <VApp :theme="theme">
        <VAppBar flat border>
            <VAppBarTitle>{{
                surface === "build" ? "Worldlens Build" : "Worldlens Guide"
            }}</VAppBarTitle>
            <VBtn min-height="44" @click="emit('intent', 'accessibility')">{{
                label("Accessibility", "無障礙工具")
            }}</VBtn>
            <VBtn min-height="44" @click="emit('intent', 'settings')">{{
                label("Settings", "設定")
            }}</VBtn>
        </VAppBar>
        <VMain>
            <VContainer fluid class="pa-4">
                <VAlert type="info" variant="tonal" class="mb-4">{{
                    label(
                        "Design reference. No commands run and no build result is claimed.",
                        "設計參考。唔會執行指令，亦唔代表任何建置結果。",
                    )
                }}</VAlert>
                <VTabs show-arrows :model-value="surface" class="mb-4">
                    <VTab :value="surface">{{ label("Workspace", "工作區") }}</VTab>
                    <VTab value="history">{{ label("History", "歷史") }}</VTab>
                    <VTab value="source">{{ label("Source and version", "來源同版本") }}</VTab>
                </VTabs>
                <VRow>
                    <VCol cols="12" md="3">
                        <VCard variant="outlined">
                            <VCardTitle>{{ label("Current source", "目前來源") }}</VCardTitle>
                            <VCardText>
                                <VChip variant="tonal">98fb083e</VChip>
                                <VDivider class="my-4" />
                                {{
                                    label(
                                        "No production receipt attached",
                                        "未附上正式版本驗證記錄",
                                    )
                                }}
                            </VCardText>
                            <VCardActions>
                                <VBtn
                                    min-height="44"
                                    @click="
                                        emit(
                                            'intent',
                                            surface === 'build' ? 'choose-source' : 'contents',
                                        )
                                    "
                                    >{{
                                        label(
                                            surface === "build" ? "Choose checkout" : "Contents",
                                            surface === "build" ? "揀原始碼資料夾" : "目錄",
                                        )
                                    }}</VBtn
                                >
                            </VCardActions>
                        </VCard>
                    </VCol>
                    <VCol cols="12" md="9">
                        <VCard variant="outlined">
                            <VCardTitle>{{
                                surface === "build"
                                    ? label("Build workbench", "建置工作區")
                                    : label("Read and learn offline", "離線閱讀同學習")
                            }}</VCardTitle>
                            <VCardText v-if="surface === 'build'">
                                <VTextField
                                    :label="label('Release candidate ordinal', '發佈候選序號')"
                                    inputmode="numeric"
                                    variant="outlined"
                                    :hint="
                                        label(
                                            'Required only for Build installer; positive decimal integer.',
                                            '只喺建立安裝程式時需要；必須係正整數。',
                                        )
                                    "
                                    persistent-hint
                                />
                                <VAlert
                                    v-if="current"
                                    variant="tonal"
                                    :type="state === 'failed' ? 'error' : 'info'"
                                    class="my-4"
                                    >{{ current.id }}</VAlert
                                >
                                <VProgressLinear
                                    v-if="active"
                                    indeterminate
                                    :aria-label="label('Observed phase progress', '目前階段進度')"
                                />
                            </VCardText>
                            <VCardText v-else>
                                <slot name="article">
                                    <VAlert type="warning" variant="tonal">{{
                                        label(
                                            "Supply the complete current article through the shared sanitized documentation renderer. No placeholder article counts as source coverage.",
                                            "請用共用文件顯示器載入完整目前文章。佔位文章唔算來源覆蓋。",
                                        )
                                    }}</VAlert>
                                </slot>
                            </VCardText>
                            <VCardActions v-if="surface === 'build'" class="flex-wrap ga-2">
                                <VBtn
                                    variant="flat"
                                    color="primary"
                                    min-height="44"
                                    @click="emit('intent', 'build')"
                                    >{{ label("Build", "建置") }}</VBtn
                                >
                                <VBtn
                                    variant="tonal"
                                    min-height="44"
                                    @click="emit('intent', 'build-run')"
                                    >{{ label("Build and run", "建置並啟動") }}</VBtn
                                >
                                <VBtn
                                    variant="tonal"
                                    min-height="44"
                                    @click="emit('intent', 'installer')"
                                    >{{ label("Build installer", "建立安裝程式") }}</VBtn
                                >
                                <VBtn
                                    v-if="active"
                                    min-height="44"
                                    @click="emit('intent', 'cancel')"
                                    >{{ label("Cancel build", "取消建置") }}</VBtn
                                >
                            </VCardActions>
                        </VCard>
                        <VCard variant="outlined" class="mt-4">
                            <VCardTitle>{{
                                surface === "build"
                                    ? label("Diagnostics", "診斷")
                                    : label("Related articles", "相關文章")
                            }}</VCardTitle>
                            <VCardText
                                ><slot name="context">{{
                                    label(
                                        "Reference content is supplied by the deterministic host; real output is never fabricated.",
                                        "參考內容由固定狀態宿主提供；唔會虛構真實輸出。",
                                    )
                                }}</slot></VCardText
                            >
                        </VCard>
                    </VCol>
                </VRow>
            </VContainer>
        </VMain>
    </VApp>
</template>
