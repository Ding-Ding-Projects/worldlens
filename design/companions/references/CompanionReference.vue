<script setup lang="ts">
/** Design reference: local presentation interactions only; host actions emit reviewed intents. */
import { computed, ref } from "vue";
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
    VList,
    VListItem,
    VSwitch,
    VDialog,
} from "vuetify/components";
import { companionDestinations } from "../state-inventory.js";
const props = withDefaults(
    defineProps<{
        surface: "build" | "guide";
        state: string;
        language?: "en" | "yue" | "both";
        theme?: "light" | "dark";
        sourceVerified?: boolean;
        candidateValid?: boolean;
        wizardStepVerified?: boolean;
    }>(),
    {
        language: "en",
        theme: "light",
        sourceVerified: false,
        candidateValid: false,
        wizardStepVerified: false,
    },
);
const emit = defineEmits<{ intent: [action: string] }>();
const label = (en: string, yue: string): string =>
    props.state === "restricted" || props.language === "en"
        ? en
        : props.language === "yue"
          ? yue
          : `${en} · ${yue}`;
const query = ref("");
const soundMuted = ref(false);
const reducedMotion = ref(false);
const active = computed(() =>
    ["acquiring", "building", "verifying", "installer", "running", "cancelling"].includes(
        props.state,
    ),
);
const setup = computed(() => props.state.startsWith("setup-"));
const destinations = computed(() =>
    companionDestinations.filter(
        (item) =>
            (item.surface === props.surface || item.surface === "shared") &&
            label(item.en, item.yue).toLocaleLowerCase().includes(query.value.toLocaleLowerCase()),
    ),
);
const canBuild = computed(
    () => props.sourceVerified && !active.value && props.state !== "choose-source" && !setup.value,
);
const documents = [
    {
        id: "docs/personal-vocabulary",
        en: "Personal vocabulary",
        yue: "個人詞彙",
        detail: "docs/personal-vocabulary.md",
    },
    {
        id: "docs/build/maintained-viewer",
        en: "Maintained viewer build",
        yue: "維護中檢視器建置",
        detail: "docs/build/maintained-viewer.md",
    },
    { id: "wiki/Home", en: "Wiki home", yue: "Wiki 主頁", detail: "wiki:0b66c193 / Home.md" },
    {
        id: "wiki/GitHub-Pages-feature-parity",
        en: "Documentation site feature parity",
        yue: "文件網站功能對照",
        detail: "wiki:0b66c193 / GitHub-Pages-feature-parity.md",
    },
];
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
        <VMain
            ><VContainer fluid class="pa-4">
                <VAlert type="info" variant="tonal" class="mb-4">{{
                    label(
                        "Design reference. Commands and result fixtures do not execute real work.",
                        "設計參考。指令同結果示例唔會執行真實工作。",
                    )
                }}</VAlert>
                <VTabs show-arrows :model-value="surface" class="mb-2">
                    <VTab :value="surface">{{ label("Workspace", "工作區") }}</VTab>
                    <VTab value="history" @click="emit('intent', 'history')">{{
                        label("History", "歷史")
                    }}</VTab>
                    <VTab value="source" @click="emit('intent', 'source')">{{
                        label("Source and version", "來源同版本")
                    }}</VTab>
                </VTabs>
                <VBtn
                    variant="tonal"
                    min-height="44"
                    class="mb-4"
                    @click="emit('intent', 'new-tab')"
                    >{{ label("New tab", "新分頁") }}</VBtn
                >

                <VCard v-if="setup" variant="outlined">
                    <VCardTitle>{{ label("Set up your workspace", "設定工作區") }}</VCardTitle>
                    <VCardText>
                        <VChip>{{
                            label("Saved locally · resume any time", "本機儲存 · 隨時繼續")
                        }}</VChip>
                        <VList>
                            <VListItem
                                :title="label('1. Choose and verify source', '1. 選擇並驗證來源')"
                                :subtitle="
                                    surface === 'build'
                                        ? label(
                                              'Locate root scripts and inspect checkout identity.',
                                              '尋找根目錄指令碼並核對原始碼身分。',
                                          )
                                        : label(
                                              'Verify the bundled documentation and wiki manifest.',
                                              '驗證隨附文件同 wiki 清單。',
                                          )
                                "
                            />
                            <VListItem
                                :title="
                                    label(
                                        '2. Choose reading and accessibility preferences',
                                        '2. 選擇閱讀同無障礙偏好',
                                    )
                                "
                                :subtitle="
                                    label(
                                        'Optional; you can change these in Settings.',
                                        '可選；之後可以喺設定更改。',
                                    )
                                "
                            />
                            <VListItem
                                :title="
                                    label(
                                        '3. Review observed results and open workspace',
                                        '3. 檢查實際結果並開啟工作區',
                                    )
                                "
                            />
                        </VList>
                        <VAlert
                            :type="wizardStepVerified ? 'success' : 'warning'"
                            variant="tonal"
                            >{{
                                wizardStepVerified
                                    ? label(
                                          "Required source checks passed in this reference fixture.",
                                          "呢個參考狀態嘅必要來源檢查已通過。",
                                      )
                                    : label(
                                          "Source verification is incomplete. Run the check to continue.",
                                          "來源驗證未完成。請執行檢查先繼續。",
                                      )
                            }}</VAlert
                        >
                        <VBtn
                            min-height="44"
                            class="mt-3"
                            @click="emit('intent', 'setup-verify')"
                            >{{ label("Verify source", "驗證來源") }}</VBtn
                        >
                    </VCardText>
                    <VCardActions class="flex-wrap ga-2">
                        <VBtn min-height="44" @click="emit('intent', 'setup-back')">{{
                            label("Back", "上一步")
                        }}</VBtn>
                        <VBtn min-height="44" @click="emit('intent', 'setup-save-exit')">{{
                            label("Save and continue later", "儲存並稍後繼續")
                        }}</VBtn>
                        <VBtn
                            v-if="state === 'setup-preferences'"
                            min-height="44"
                            @click="emit('intent', 'setup-skip-optional')"
                            >{{ label("Skip optional preferences", "略過可選偏好") }}</VBtn
                        >
                        <VBtn
                            color="primary"
                            variant="flat"
                            min-height="44"
                            :disabled="!wizardStepVerified"
                            @click="
                                emit(
                                    'intent',
                                    state === 'setup-review'
                                        ? 'setup-open-workspace'
                                        : 'setup-next',
                                )
                            "
                            >{{
                                state === "setup-review"
                                    ? label("Open workspace", "開啟工作區")
                                    : label("Next", "下一步")
                            }}</VBtn
                        >
                    </VCardActions>
                </VCard>

                <VCard v-else-if="state === 'new-tab' || state === 'palette'" variant="outlined">
                    <VCardTitle>{{
                        state === "new-tab"
                            ? label("Open a destination", "開啟目的地")
                            : label("Command palette", "指令選單")
                    }}</VCardTitle>
                    <VCardText>
                        <VTextField
                            v-model="query"
                            :label="label('Find a destination or action', '搜尋目的地或者動作')"
                            variant="outlined"
                        />
                        <VBtn
                            min-height="44"
                            @click="emit('intent', 'destination-regex-builder')"
                            >{{ label("Pattern builder", "模式建立工具") }}</VBtn
                        >
                        <VList
                            ><VListItem
                                v-for="item in destinations"
                                :key="item.id"
                                :title="label(item.en, item.yue)"
                                :subtitle="
                                    label(
                                        'Opens a tab; existing drafts stay intact.',
                                        '開啟分頁；現有草稿會保留。',
                                    )
                                "
                                @click="emit('intent', `open:${item.id}`)"
                        /></VList>
                    </VCardText>
                </VCard>

                <VCard
                    v-else-if="state === 'settings' || state === 'restricted'"
                    variant="outlined"
                >
                    <VCardTitle>{{ label("Workspace settings", "工作區設定") }}</VCardTitle>
                    <VCardText>
                        <VTextField
                            :label="label('Search settings', '搜尋設定')"
                            variant="outlined"
                        />
                        <VBtn min-height="44" @click="emit('intent', 'settings-regex-builder')">{{
                            label("Pattern builder", "模式建立工具")
                        }}</VBtn>
                        <VTabs show-arrows
                            ><VTab>{{ label("Appearance", "外觀") }}</VTab
                            ><VTab>{{ label("Accessibility", "無障礙工具") }}</VTab
                            ><VTab>{{ label("Schedules", "排程") }}</VTab></VTabs
                        >
                        <VSwitch
                            v-model="soundMuted"
                            :label="label('Mute outcome sounds', '靜音結果音效')"
                        />
                        <VSwitch
                            v-model="reducedMotion"
                            :label="label('Reduce motion', '減少動態效果')"
                        />
                        <VAlert v-if="state === 'restricted'" type="info" variant="tonal"
                            >Restricted presentation is active. Use the shared unlock control to
                            restore your saved preferences.</VAlert
                        >
                        <VBtn
                            v-if="state === 'restricted'"
                            min-height="44"
                            @click="emit('intent', 'shared-unlock')"
                            >Unlock</VBtn
                        >
                        <VCard v-else variant="tonal" class="mt-3"
                            ><VCardText>{{
                                label("Language, tone and personal wording", "語言、語調同個人字眼")
                            }}</VCardText
                            ><VCardActions
                                ><VBtn
                                    min-height="44"
                                    @click="emit('intent', 'language-controls')"
                                    >{{ label("Edit preferences", "更改偏好") }}</VBtn
                                ></VCardActions
                            ></VCard
                        >
                    </VCardText>
                </VCard>

                <VRow v-else>
                    <VCol cols="12" md="3"
                        ><VCard variant="outlined">
                            <VCardTitle>{{
                                surface === "build"
                                    ? label("Source workspace", "來源工作區")
                                    : label("Contents", "目錄")
                            }}</VCardTitle>
                            <VCardText
                                ><VChip>98fb083e</VChip><VDivider class="my-3" />{{
                                    label(
                                        "One checkout identity per workspace",
                                        "每個工作區對應一個原始碼身分",
                                    )
                                }}</VCardText
                            >
                            <VList v-if="surface === 'guide'"
                                ><VListItem
                                    v-for="item in documents"
                                    :key="item.id"
                                    :title="label(item.en, item.yue)"
                                    @click="emit('intent', `navigate:${item.id}`)"
                            /></VList>
                            <VCardActions
                                ><VBtn min-height="44" @click="emit('intent', 'choose-source')">{{
                                    label("Choose source", "選擇來源")
                                }}</VBtn></VCardActions
                            >
                        </VCard></VCol
                    >
                    <VCol cols="12" md="9">
                        <VCard v-if="surface === 'build'" variant="outlined">
                            <VCardTitle>{{ label("Build workbench", "建置工作區") }}</VCardTitle>
                            <VCardText v-if="state === 'choose-source'">
                                <VTextField
                                    readonly
                                    :label="label('Checkout folder', '原始碼資料夾')"
                                    :placeholder="
                                        label(
                                            'Choose a folder containing both root build scripts',
                                            '揀包含兩個根目錄建置指令碼嘅資料夾',
                                        )
                                    "
                                    variant="outlined"
                                />
                                <VBtn min-height="44" @click="emit('intent', 'browse-checkout')">{{
                                    label("Browse folders", "瀏覽資料夾")
                                }}</VBtn>
                                <VAlert type="warning" variant="tonal" class="mt-3">{{
                                    label(
                                        "Build is unavailable until the checkout and root scripts are verified.",
                                        "驗證原始碼同根目錄指令碼之前，建置不可用。",
                                    )
                                }}</VAlert>
                            </VCardText>
                            <VCardText v-else-if="state === 'succeeded'">
                                <VAlert type="success" variant="tonal">{{
                                    label(
                                        "Verified completion fixture · child exit 0",
                                        "已驗證完成示例 · 子程序退出碼 0",
                                    )
                                }}</VAlert>
                                <VList
                                    ><VListItem
                                        :title="label('Build receipt', '建置驗證記錄')"
                                        :subtitle="
                                            label(
                                                'Source identity and artifact hashes matched',
                                                '來源身分同產物雜湊相符',
                                            )
                                        " /><VListItem
                                        :title="label('Verified outputs', '已驗證產物')"
                                        :subtitle="
                                            label(
                                                'Open only the files listed in this run receipt',
                                                '只開啟呢次記錄列出嘅檔案',
                                            )
                                        "
                                /></VList>
                                <VBtn min-height="44" @click="emit('intent', 'open-artifacts')">{{
                                    label("Open outputs", "開啟產物")
                                }}</VBtn
                                ><VBtn min-height="44" @click="emit('intent', 'export-receipt')">{{
                                    label("Export receipt", "匯出驗證記錄")
                                }}</VBtn>
                            </VCardText>
                            <VCardText
                                v-else-if="['interrupted', 'failed', 'cancelled'].includes(state)"
                            >
                                <VAlert type="error" variant="tonal">{{
                                    label(
                                        "This run did not complete. Partial outputs are not eligible for delivery.",
                                        "呢次執行未完成。部分產物不可交付。",
                                    )
                                }}</VAlert>
                                <VList
                                    ><VListItem
                                        :title="label('Last observed phase', '最後觀察到嘅階段')"
                                        :subtitle="
                                            label(
                                                'Workspace build; no successful final receipt',
                                                '工作區建置；冇成功最終記錄',
                                            )
                                        " /><VListItem
                                        :title="label('Recovery', '恢復')"
                                        :subtitle="
                                            label(
                                                'Recheck source and cached prerequisites before a fresh run',
                                                '重新執行前再檢查來源同快取依賴',
                                            )
                                        "
                                /></VList>
                                <VBtn min-height="44" @click="emit('intent', 'inspect-run')">{{
                                    label("Inspect diagnostics", "檢視診斷")
                                }}</VBtn
                                ><VBtn min-height="44" @click="emit('intent', 'retry-preflight')">{{
                                    label("Recheck and retry", "重新檢查並再試")
                                }}</VBtn>
                            </VCardText>
                            <VCardText v-else>
                                <VTextField
                                    :label="label('Release candidate ordinal', '發佈候選序號')"
                                    inputmode="numeric"
                                    variant="outlined"
                                    :hint="
                                        label(
                                            'A positive decimal integer is required for Build installer.',
                                            '建立安裝程式需要正整數序號。',
                                        )
                                    "
                                    persistent-hint
                                />
                                <VAlert
                                    v-if="!sourceVerified"
                                    type="warning"
                                    variant="tonal"
                                    class="my-3"
                                    >{{
                                        label(
                                            "Source verification is required before a build can start.",
                                            "開始建置之前必須驗證來源。",
                                        )
                                    }}</VAlert
                                >
                                <VProgressLinear
                                    v-if="active"
                                    indeterminate
                                    :aria-label="label('Observed phase progress', '目前階段進度')"
                                    class="mt-3"
                                />
                                <VBtn
                                    v-if="active"
                                    min-height="44"
                                    @click="emit('intent', 'cancel-confirm')"
                                    >{{ label("Cancel build", "取消建置") }}</VBtn
                                >
                            </VCardText>
                            <VCardActions class="flex-wrap ga-2">
                                <VBtn
                                    :disabled="!canBuild"
                                    color="primary"
                                    variant="flat"
                                    min-height="44"
                                    @click="emit('intent', 'build')"
                                    >{{ label("Build", "建置") }}</VBtn
                                >
                                <VBtn
                                    :disabled="!canBuild"
                                    min-height="44"
                                    @click="emit('intent', 'build-run')"
                                    >{{ label("Build and run", "建置並啟動") }}</VBtn
                                >
                                <VBtn
                                    :disabled="!canBuild || !candidateValid"
                                    min-height="44"
                                    @click="emit('intent', 'installer')"
                                    >{{ label("Build installer", "建立安裝程式") }}</VBtn
                                >
                            </VCardActions>
                        </VCard>
                        <VCard v-else variant="outlined">
                            <VCardTitle>{{
                                label("Read and learn offline", "離線閱讀同學習")
                            }}</VCardTitle>
                            <VCardText>
                                <VTextField
                                    v-if="state.startsWith('search')"
                                    v-model="query"
                                    :label="label('Search complete documentation', '搜尋完整文件')"
                                    variant="outlined"
                                />
                                <VAlert
                                    v-if="state === 'search-empty'"
                                    type="info"
                                    variant="tonal"
                                    >{{
                                        label(
                                            "No results. Keep the query or clear filters to try again.",
                                            "冇結果。保留搜尋字眼或者清除篩選再試。",
                                        )
                                    }}</VAlert
                                >
                                <VList
                                    v-else-if="
                                        [
                                            'home',
                                            'category',
                                            'search-results',
                                            'guide-navigation',
                                        ].includes(state)
                                    "
                                    ><VListItem
                                        v-for="item in documents.filter((item) =>
                                            label(item.en, item.yue)
                                                .toLowerCase()
                                                .includes(query.toLowerCase()),
                                        )"
                                        :key="item.id"
                                        :title="label(item.en, item.yue)"
                                        :subtitle="item.detail"
                                        @click="emit('intent', `navigate:${item.id}`)"
                                /></VList>
                                <slot v-else name="article"
                                    ><VAlert type="warning" variant="tonal">{{
                                        label(
                                            "The deterministic host must supply the complete real source article.",
                                            "固定狀態宿主必須提供完整真實來源文章。",
                                        )
                                    }}</VAlert></slot
                                >
                            </VCardText>
                            <VCardActions
                                ><VBtn min-height="44" @click="emit('intent', 'back')">{{
                                    label("Back", "返回")
                                }}</VBtn
                                ><VBtn min-height="44" @click="emit('intent', 'related')">{{
                                    label("Related articles", "相關文章")
                                }}</VBtn></VCardActions
                            >
                        </VCard>
                        <VCard v-if="surface === 'build'" variant="outlined" class="mt-4"
                            ><VCardTitle>{{ label("Diagnostics", "診斷") }}</VCardTitle
                            ><VCardText
                                ><slot name="context">{{
                                    label(
                                        "No live output in this design reference.",
                                        "呢個設計參考冇即時輸出。",
                                    )
                                }}</slot></VCardText
                            ></VCard
                        >
                    </VCol>
                </VRow>
                <VDialog
                    :model-value="state === 'cancel-confirm' || state === 'close-active-run'"
                    max-width="560"
                    persistent
                >
                    <VCard
                        ><VCardTitle>{{ label("Cancel this build?", "取消呢次建置？") }}</VCardTitle
                        ><VCardText>{{
                            label(
                                "Only this workspace’s owned process tree will stop. Partial outputs remain ineligible. Other workspaces keep running.",
                                "只會停止呢個工作區擁有嘅程序樹。部分產物不可交付。其他工作區繼續執行。",
                            )
                        }}</VCardText
                        ><VCardActions class="flex-wrap ga-2"
                            ><VBtn min-height="44" @click="emit('intent', 'return-to-run')">{{
                                label("Return to build", "返回建置")
                            }}</VBtn
                            ><VBtn min-height="44" @click="emit('intent', 'cancel-owned-run')">{{
                                label("Cancel owned build", "取消本工作區建置")
                            }}</VBtn></VCardActions
                        ></VCard
                    >
                </VDialog>
            </VContainer></VMain
        >
    </VApp>
</template>
