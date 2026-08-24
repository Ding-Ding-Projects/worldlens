<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCartOutline,
    mdiChatOutline,
    mdiDeleteOutline,
    mdiDownloadOutline,
    mdiPencilOutline,
    mdiPlus,
    mdiRefresh,
    mdiSend,
    mdiStopCircleOutline,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VChip,
    VDivider,
    VIcon,
    VList,
    VListItem,
    VProgressLinear,
    VSelect,
    VTextarea,
    VTextField,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    deleteInstalledModel,
    fetchInstalledModels,
    fetchVersion,
    pullModel,
    streamChat,
    type OllamaChatMessage,
} from "./ollamaApi.js";
import { assessFit, type DetectedHardware, type FitVerdict } from "./hardwareFit.js";
import { flattenVariants, type CatalogVariant } from "./ollamaCatalog.js";
import {
    appendChatMessage,
    cacheFit,
    createChatSession,
    deleteChatSession,
    enqueuePulls,
    ollamaStore,
    renameChatSession,
    setCatalog,
    setInstalledModels,
    setRuntimeStatus,
    updateLastAssistantMessage,
    updatePullItem,
    type ChatSession,
} from "./ollamaStore.js";

/**
 * The local Ollama suite manager: runtime health, the exhaustive Model Store, a batch-pull
 * cart that is explicitly not commerce, and streaming chat.
 *
 * Every network call in this screen goes through `ollamaApi.ts` to the documented local
 * daemon endpoint only. There is no cloud fallback anywhere in this file: a missing or
 * stopped daemon is reported as exactly that, with in-app recovery guidance, never silently
 * routed anywhere else.
 */

const { t } = useI18n();

/* -------------------------------------------------------------------------- */
/* Runtime health                                                             */
/* -------------------------------------------------------------------------- */

const checkingRuntime = ref(false);
const runtimeProvisioning = ref(false);
const runtimeProgress = ref("");

async function installRuntime(): Promise<void> {
    const bridge = globalThis.window?.worldlens?.ollama;
    if (!bridge || runtimeProvisioning.value) return;
    runtimeProvisioning.value = true;
    runtimeProgress.value = "Acquiring the pinned official runtime automatically.";
    try {
        const result = await bridge.runtimeEnsure();
        if (typeof result === "object" && result !== null && "ok" in result && result.ok === true) await checkRuntime();
        else setRuntimeStatus({ state: "missing", version: null, checkedAt: new Date().toISOString(), detail: typeof result === "object" && result !== null && "message" in result ? String(result.message) : "Automatic acquisition did not complete." });
    } finally { runtimeProvisioning.value = false; }
}

async function cancelRuntime(): Promise<void> { const bridge = globalThis.window?.worldlens?.ollama; if (!bridge) return; await bridge.runtimeCancel(); runtimeProgress.value = "Runtime acquisition cancelled. The source files remain untouched."; }
async function stopRuntime(): Promise<void> { const bridge = globalThis.window?.worldlens?.ollama; if (!bridge) return; const result = await bridge.runtimeStop(); runtimeProgress.value = result ? "Managed Ollama runtime stopped." : "No managed Ollama runtime process was running."; await checkRuntime(); }
async function restartRuntime(): Promise<void> { const bridge = globalThis.window?.worldlens?.ollama; if (!bridge) return; const result = await bridge.runtimeRestart(); runtimeProgress.value = result.ok ? "Managed Ollama runtime restarted and probed." : result.message ?? "Managed Ollama runtime restart did not complete."; await checkRuntime(); }
async function probeRuntime(): Promise<void> { const bridge = globalThis.window?.worldlens?.ollama; if (!bridge) return; const result = await bridge.runtimeProbe(); runtimeProgress.value = result.ok ? "Managed Ollama readiness probe succeeded." : result.message ?? "Managed Ollama readiness probe did not succeed."; await checkRuntime(); }

async function checkRuntime(): Promise<void> {
    checkingRuntime.value = true;
    try {
        const bridge = globalThis.window?.worldlens?.ollama;
        const runtime = bridge ? await bridge.runtime() : null;
        if (runtime && runtime.origin === "unavailable") {
            setRuntimeStatus({ state: "missing", version: null, checkedAt: new Date().toISOString(), detail: typeof runtime.reason === "string" ? runtime.reason : "The runtime is not available." });
            if (!runtimeProvisioning.value) await installRuntime();
            return;
        }
        const result = await fetchVersion();
        if (!result.ok) {
            const state =
                result.error.kind === "unreachable" || result.error.kind === "timeout"
                    ? "stopped"
                    : "unhealthy";
            setRuntimeStatus({
                state,
                version: null,
                checkedAt: new Date().toISOString(),
                detail: result.error.message,
            });
            return;
        }
        setRuntimeStatus({
            state: "ready",
            version: result.value.version,
            checkedAt: new Date().toISOString(),
            detail: null,
        });
        await refreshInstalledModels();
    } finally {
        checkingRuntime.value = false;
    }
}

async function refreshInstalledModels(): Promise<void> {
    const result = await fetchInstalledModels();
    if (result.ok) setInstalledModels(result.value);
}

const runtimeLabel = computed(() => {
    switch (ollamaStore.runtime.state) {
        case "missing":
            return t("ollama.runtime.missing", "Ollama is not installed");
        case "stopped":
            return t("ollama.runtime.stopped", "Ollama is not running");
        case "unhealthy":
            return t("ollama.runtime.unhealthy", "Ollama answered oddly");
        case "ready":
            return t("ollama.runtime.ready", "Ollama is ready");
        default:
            return t("ollama.runtime.checking", "Checking for Ollama…");
    }
});

const runtimeGuidance = computed(() => {
    switch (ollamaStore.runtime.state) {
        case "missing":
            return t("ollama.runtime.missingGuidance", "The application will acquire the pinned runtime automatically. No manual installation step is required.");
        case "stopped":
            return t(
                "ollama.runtime.stoppedGuidance",
                "Ollama is installed but not currently running. Start it, then check again.",
            );
        case "unhealthy":
            return t(
                "ollama.runtime.unhealthyGuidance",
                "Ollama answered, but not in the shape this app expected. Check again once it settles.",
            );
        default:
            return "";
    }
});

const runtimeReady = computed(() => ollamaStore.runtime.state === "ready");

/* -------------------------------------------------------------------------- */
/* Model Store                                                                */
/* -------------------------------------------------------------------------- */

const storeQuery = ref("");
const storeRegex = ref(false);
const storeFlags = ref("i");
const refreshingCatalog = ref(false);
const catalogAbort = ref<AbortController | null>(null);
const catalogRefreshMessage = ref("");

async function refreshStoreCatalog(): Promise<void> {
    if (refreshingCatalog.value) return;
    const bridge = globalThis.window?.worldlens?.ollama;
    if (!bridge) return;
    refreshingCatalog.value = true;
    try {
        const result = await bridge.catalogRefresh();
        catalogRefreshMessage.value = result.ok ? "" : result.message ?? "The official source did not provide an exhaustive catalog, so refresh remains incomplete.";
        if (result.catalog) {
            const raw = result.catalog as { readonly variants?: readonly { readonly name: string; readonly family: string | null; readonly size?: number; readonly quantization: string | null; readonly context?: number }[]; readonly fetchedAt?: string; readonly pages?: number; readonly complete?: boolean; readonly revision?: string | null; readonly completenessReason?: string };
            const groups = new Map<string, { readonly family: string; readonly description: string; readonly capabilities: readonly string[]; readonly tags: { readonly tag: string; readonly sizeBytes: number | null; readonly contextWindow: number | null; readonly quantization: string | null }[] }>();
            for (const variant of raw.variants ?? []) { const family = variant.family ?? variant.name.split(":")[0]!; const existing = groups.get(family) ?? { family, description: "Official Ollama catalog variant", capabilities: [], tags: [] }; groups.set(family, { ...existing, tags: [...existing.tags, { tag: variant.name.includes(":") ? variant.name.slice(variant.name.indexOf(":") + 1) : variant.name, sizeBytes: typeof variant.size === "number" ? variant.size : null, contextWindow: typeof variant.context === "number" ? variant.context : null, quantization: variant.quantization ?? null }] }); }
            setCatalog({ models: [...groups.values()], revision: { sourceRevision: raw.revision ?? null, refreshedAt: raw.fetchedAt ?? new Date().toISOString(), pageCount: raw.pages ?? 0, complete: raw.complete === true, completenessReason: raw.completenessReason ?? null } }, result.ok !== true || raw.complete !== true);
        }
    } finally {
        refreshingCatalog.value = false;
    }
}

const allVariants = computed<readonly CatalogVariant[]>(() =>
    ollamaStore.catalog ? flattenVariants(ollamaStore.catalog) : [],
);

const storeMatcher = computed(() =>
    createSettingMatcher(storeQuery.value, storeRegex.value, storeFlags.value),
);

const installedNames = computed(
    () => new Set(ollamaStore.installedModels.map((model) => model.model)),
);

/** Conservative hardware facts. Detection is intentionally minimal: unknown stays unknown. */
const detectedHardware = ref<DetectedHardware>({
    totalRamBytes: null,
    gpuVramBytes: null,
    gpuDriverSupported: null,
    freeDiskBytes: null,
});
const hardwareEvidence = ref("Hardware evidence has not been refreshed.");

async function refreshHardware(): Promise<void> {
    const bridge = globalThis.window?.worldlens?.ollama;
    if (!bridge) return;
    const facts = await bridge.hardware();
    detectedHardware.value = { totalRamBytes: facts.totalRamBytes, gpuVramBytes: facts.gpuVramBytes, gpuDriverSupported: facts.gpuDriverSupported, freeDiskBytes: facts.freeDiskBytes };
    hardwareEvidence.value = `Architecture ${facts.architecture ?? "unknown"}; RAM ${facts.totalRamBytes === null ? "unknown" : Math.round(facts.totalRamBytes / 1024 / 1024) + " MiB"}; free disk ${facts.freeDiskBytes === null ? "unknown" : Math.round(facts.freeDiskBytes / 1024 / 1024) + " MiB"}; GPU ${facts.gpuModel ?? "not reported"}. Sources: ${facts.sources.join(", ")}.`;
}

function fitFor(variant: CatalogVariant): FitVerdict {
    const cached = ollamaStore.fitCache[variant.fullName];
    if (cached) return cached.verdict;
    const assessment = assessFit(detectedHardware.value, {
        blobSizeBytes: variant.sizeBytes,
        parameterCountBillions: null,
        quantization: variant.quantization,
        declaredContextWindow: variant.contextWindow,
    });
    cacheFit(variant.fullName, assessment);
    return assessment.verdict;
}

const fitFilter = ref<FitVerdict | null>(null);
const installedFilter = ref<boolean | null>(null);
const installedFilterSearch = ref("");
const installedFilterRegex = ref(false);
const installedFilterFlags = ref("i");
const fitFilterSearch = ref("");
const fitFilterRegex = ref(false);
const fitFilterFlags = ref("i");
const chatModelSearch = ref("");
const chatModelRegex = ref(false);
const chatModelFlags = ref("i");
const filterItems = (items: readonly { readonly title: string; readonly value: unknown }[], query: string, useRegex: boolean, flags: string) => { if (!query.trim()) return items; try { const matcher = useRegex ? new RegExp(query, flags) : null; return items.filter((item) => matcher ? matcher.test(item.title) : item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())); } catch { return []; } };
const installedFilterItems = computed(() => filterItems([{ title: t("config.search.clear", "Clear the search"), value: null }, { title: t("ollama.store.filter.installed", "Installed"), value: true }, { title: t("ollama.model.addToCart", "Add to pull cart"), value: false }], installedFilterSearch.value, installedFilterRegex.value, installedFilterFlags.value));
const fitFilterItems = computed(() => filterItems([{ title: t("config.search.clear", "Clear the search"), value: null }, { title: t("ollama.fit.runsWell", "Runs well"), value: "Runs well" }, { title: t("ollama.fit.runsWithLimits", "Runs with limits"), value: "Runs with limits" }, { title: t("ollama.fit.unlikely", "Unlikely"), value: "Unlikely" }, { title: t("ollama.fit.unknown", "Unknown"), value: "Unknown" }], fitFilterSearch.value, fitFilterRegex.value, fitFilterFlags.value));
const chatModelItems = computed(() => filterItems(ollamaStore.installedModels.map((model) => ({ title: model.model, value: model.model })), chatModelSearch.value, chatModelRegex.value, chatModelFlags.value));

const visibleVariants = computed(() =>
    allVariants.value.filter((variant) => {
        if (!storeMatcher.value.test(`${variant.family} ${variant.tag} ${variant.description}`))
            return false;
        if (
            installedFilter.value !== null &&
            installedNames.value.has(variant.fullName) !== installedFilter.value
        )
            return false;
        if (fitFilter.value !== null && fitFor(variant) !== fitFilter.value) return false;
        return true;
    }),
);

const storeSummary = computed(() =>
    t(
        "config.search.summary",
        { shown: visibleVariants.value.length, total: allVariants.value.length },
        "Showing {shown} of {total}",
    ),
);

/* -------------------------------------------------------------------------- */
/* Pull cart                                                                  */
/* -------------------------------------------------------------------------- */

const cart = ref<Set<string>>(new Set());

function toggleCart(fullName: string): void {
    if (cart.value.has(fullName)) cart.value.delete(fullName);
    else cart.value.add(fullName);
}

const cartVariants = computed(() =>
    allVariants.value.filter((variant) => cart.value.has(variant.fullName)),
);

const cartAggregateBytes = computed(() =>
    cartVariants.value.reduce((total, variant) => total + (variant.sizeBytes ?? 0), 0),
);

const pulling = ref(false);
const pullControllers = new Map<string, AbortController>();

async function runPullItem(item: ReturnType<typeof enqueuePulls>[number]): Promise<void> {
    const controller = new AbortController();
    pullControllers.set(item.id, controller);
    updatePullItem(item.id, { state: "pulling", statusLine: "Starting…", error: null });
    try {
        const result = await pullModel(item.modelName, (progress) => { const percent = typeof progress.total === "number" && progress.total > 0 && typeof progress.completed === "number" ? Math.round((progress.completed / progress.total) * 100) : null; updatePullItem(item.id, { percent, statusLine: progress.status }); }, { signal: controller.signal });
        if (result.ok) updatePullItem(item.id, { state: "pulled", percent: 100, statusLine: "Pulled." });
        else updatePullItem(item.id, { state: result.error.kind === "aborted" ? "cancelled" : "failed", error: result.error.message, statusLine: result.error.message });
    } finally { pullControllers.delete(item.id); }
}

function cancelPull(id: string): void { pullControllers.get(id)?.abort(); updatePullItem(id, { state: "cancelled", statusLine: "Cancelled by the user." }); }
async function retryPull(id: string): Promise<void> { const item = ollamaStore.pullQueue.find((candidate) => candidate.id === id); if (!item || (item.state !== "failed" && item.state !== "cancelled")) return; updatePullItem(id, { state: "queued", percent: 0, error: null, statusLine: "Queued for retry." }); await runPullItem(item); await refreshInstalledModels(); }
function removePull(id: string): void { const index = ollamaStore.pullQueue.findIndex((item) => item.id === id); if (index >= 0 && !pullControllers.has(id)) ollamaStore.pullQueue.splice(index, 1); }

async function startPulls(): Promise<void> {
    if (cart.value.size === 0) return;
    const names = [...cart.value];
    cart.value = new Set();
    const items = enqueuePulls(names);
    pulling.value = true;
    // Bounded parallelism: two at a time rather than the whole cart at once, so a large
    // batch cannot saturate the daemon or the network link all by itself.
    const concurrency = 2;
    let cursor = 0;
    async function worker(): Promise<void> {
        for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) return;
            const item = items[index]!;
            await runPullItem(item);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
    pulling.value = false;
    await refreshInstalledModels();
}

async function deleteInstalled(name: string): Promise<void> {
    const result = await deleteInstalledModel(name);
    if (result.ok) await refreshInstalledModels();
}

/* -------------------------------------------------------------------------- */
/* Chat                                                                       */
/* -------------------------------------------------------------------------- */

const chatQuery = ref("");
const chatRegex = ref(false);
const chatFlags = ref("i");
const chatMatcher = computed(() =>
    createSettingMatcher(chatQuery.value, chatRegex.value, chatFlags.value),
);

const visibleSessions = computed(() =>
    ollamaStore.sessions.filter((session) =>
        chatMatcher.value.test(`${session.name} ${session.model}`),
    ),
);

const activeSession = computed<ChatSession | null>(
    () =>
        ollamaStore.sessions.find((session) => session.id === ollamaStore.activeSessionId) ?? null,
);

const draftMessage = ref("");
const sending = ref(false);
const chatAbort = ref<AbortController | null>(null);
const renamingSessionId = ref<string | null>(null);
const renameDraft = ref("");

function newSession(): void {
    const model = ollamaStore.installedModels[0]?.model ?? "";
    createChatSession(model, t("ollama.chat.newSession", "New chat"));
}

function beginRename(session: ChatSession): void {
    renamingSessionId.value = session.id;
    renameDraft.value = session.name;
}

function commitRename(): void {
    if (renamingSessionId.value)
        renameChatSession(renamingSessionId.value, renameDraft.value.trim() || "Untitled chat");
    renamingSessionId.value = null;
}

function confirmDeleteSession(session: ChatSession): void {
    deleteChatSession(session.id);
}

async function sendMessage(): Promise<void> {
    const session = activeSession.value;
    if (!session || draftMessage.value.trim().length === 0 || sending.value) return;
    const content = draftMessage.value;
    draftMessage.value = "";
    appendChatMessage(session.id, { role: "user", content });
    appendChatMessage(session.id, { role: "assistant", content: "" });

    const history: OllamaChatMessage[] = [
        ...(session.systemPrompt.trim().length > 0
            ? [{ role: "system" as const, content: session.systemPrompt }]
            : []),
        ...session.messages
            .filter((m) => m.content.length > 0 || m.role === "user")
            .map((m) => ({ role: m.role, content: m.content })),
    ];

    sending.value = true;
    const controller = new AbortController();
    chatAbort.value = controller;
    let assembled = "";
    const result = await streamChat(
        session.model,
        history,
        (chunk) => {
            if (chunk.message?.content) {
                assembled += chunk.message.content;
                updateLastAssistantMessage(session.id, assembled);
            }
        },
        {},
        { signal: controller.signal },
    );
    if (!result.ok && result.error.kind !== "aborted") {
        updateLastAssistantMessage(
            session.id,
            assembled.length > 0 ? assembled : `(${result.error.message})`,
        );
    }
    sending.value = false;
    chatAbort.value = null;
}

function stopSending(): void {
    chatAbort.value?.abort();
}

async function retryLast(): Promise<void> {
    const session = activeSession.value;
    if (!session || session.messages.length === 0) return;
    // Drop the last assistant turn and resend the user's message that preceded it.
    const last = session.messages[session.messages.length - 1];
    if (last && last.role === "assistant") session.messages.pop();
    const previousUser = session.messages[session.messages.length - 1];
    if (!previousUser || previousUser.role !== "user") return;
    session.messages.pop();
    draftMessage.value = previousUser.content;
    await sendMessage();
}

let stopRuntimeProgress: (() => void) | undefined;

onMounted(() => {
    const bridge = globalThis.window?.worldlens?.ollama;
    stopRuntimeProgress = bridge?.onRuntimeProgress((progress) => { runtimeProgress.value = typeof progress.message === "string" ? progress.message : "Acquiring the runtime automatically."; });
    void checkRuntime();
    void refreshHardware();
});

onBeforeUnmount(() => {
    // A chat stream belongs to this screen. Leaving it alive would keep the component closure
    // and its session reference reachable, then append late chunks after the user has moved on.
    chatAbort.value?.abort();
    catalogAbort.value?.abort();
    stopRuntimeProgress?.();
});
</script>

<template>
    <!--
        The capture harness finds this screen by its data-test attribute. It sits on this plain
        root div rather than on one of the Vuetify components inside because a fallthrough
        attribute on one of those is not reliably queryable, and it has to be the screen's own
        root rather than the runtime alert below: that alert renders only while the runtime is
        not ready, so anchoring to it would photograph one state of the page and miss the other.
    -->
    <div class="mb-ollama" data-test="ollama-screen">
        <VAlert
            v-if="!runtimeReady"
            type="warning"
            variant="tonal"
            class="mb-ollama__runtime"
            data-test="ollama-runtime-alert"
        >
            <div class="mb-ollama__runtime-body">
                <p class="mb-ollama__runtime-label">{{ runtimeLabel }}</p>
                <p v-if="runtimeGuidance" class="mb-ollama__runtime-guidance">
                    {{ runtimeGuidance }}
                </p>
                <p v-if="runtimeProgress" class="mb-ollama__runtime-guidance">{{ runtimeProgress }}</p>
                <div class="mb-ollama__runtime-actions">
                    <VBtn
                        v-if="ollamaStore.runtime.state === 'missing'"
                        variant="tonal"
                        :prepend-icon="mdiDownloadOutline"
                        :loading="runtimeProvisioning"
                        @click="installRuntime"
                    >
                        {{
                            t(
                                "ollama.runtime.acquireAutomatically",
                                "Acquire Ollama automatically",
                            )
                        }}
                    </VBtn>
                    <VBtn
                        variant="tonal"
                        :prepend-icon="mdiRefresh"
                        :loading="checkingRuntime"
                        @click="checkRuntime"
                    >
                        {{ t("ollama.runtime.recheck", "Check again") }}
                    </VBtn>
                    <VBtn v-if="runtimeProvisioning" variant="tonal" @click="cancelRuntime">Cancel acquisition</VBtn>
                    <VBtn variant="tonal" @click="probeRuntime">Probe readiness</VBtn>
                    <VBtn variant="tonal" @click="restartRuntime">Restart runtime</VBtn>
                    <VBtn variant="tonal" @click="stopRuntime">Stop runtime</VBtn>
                </div>
            </div>
        </VAlert>

        <VCard v-else class="mb-ollama__ready" variant="tonal" color="success">
            <VCardText><div>{{ runtimeLabel }} · {{ ollamaStore.runtime.version }}</div><div class="mb-ollama__runtime-actions"><VBtn size="small" variant="tonal" @click="probeRuntime">Probe readiness</VBtn><VBtn size="small" variant="tonal" @click="restartRuntime">Restart runtime</VBtn><VBtn size="small" variant="tonal" @click="stopRuntime">Stop runtime</VBtn></div></VCardText>
        </VCard>

        <p class="mb-ollama__intro">
            {{
                t(
                    "ollama.intro",
                    "Run language models on this machine, with no cloud account required.",
                )
            }}
        </p>

        <VAlert
            v-if="ollamaStore.failure !== null"
            type="error"
            variant="tonal"
            data-test="ollama-chat-storage-failure"
        >
            {{
                t(
                    "ollama.chat.storageFailure",
                    { reason: ollamaStore.failure },
                    "Saved chats could not be read, so this screen will not overwrite them. Resolve the local storage problem, then reopen this tab. Details: {reason}",
                )
            }}
        </VAlert>

        <VDivider class="my-4" />

        <section aria-labelledby="ollama-store-heading">
            <h2 id="ollama-store-heading" class="mb-ollama__heading">
                {{ t("ollama.store.title", "Model Store") }}
            </h2>
            <p class="mb-ollama__stale" role="status">{{ hardwareEvidence }} <VBtn size="small" variant="text" @click="refreshHardware">Refresh hardware evidence</VBtn></p>

            <div class="mb-ollama__store-toolbar">
                <ConfigSearchField
                    v-model="storeQuery"
                    v-model:regex="storeRegex"
                    v-model:flags="storeFlags"
                    :label="t('ollama.store.search', 'Search models and tags')"
                    :sample="allVariants.map((v) => `${v.family}:${v.tag}`).join('\n')"
                    :summary="storeSummary"
                />
                <VBtn
                    variant="tonal"
                    :prepend-icon="mdiRefresh"
                    :loading="refreshingCatalog"
                    :disabled="!runtimeReady"
                    :title="
                        !runtimeReady
                            ? t('ollama.disabled.noRuntime', 'Ollama is not ready yet.')
                            : undefined
                    "
                    @click="refreshStoreCatalog"
                >
                    {{ t("ollama.store.refresh", "Refresh catalogue") }}
                </VBtn>
            </div>

            <VAlert v-if="catalogRefreshMessage" class="mt-2" type="warning" variant="tonal" role="status">{{ catalogRefreshMessage }}</VAlert>

            <p v-if="ollamaStore.catalogStale" class="mb-ollama__stale" role="status">
                {{ t("ollama.store.stale", "Showing the last verified catalogue. It is stale.") }}
            </p>

            <div class="mb-ollama__filters">
                <ConfigSearchField v-model="installedFilterSearch" v-model:regex="installedFilterRegex" v-model:flags="installedFilterFlags" label="Search installed filter" sample="Installed\nNot installed\nClear the search" />
                <VSelect
                    v-model="installedFilter"
                    :label="t('ollama.store.filter.installed', 'Installed')"
                    :items="installedFilterItems"
                    density="compact"
                    hide-details
                    class="mb-ollama__filter"
                />
                <ConfigSearchField v-model="fitFilterSearch" v-model:regex="fitFilterRegex" v-model:flags="fitFilterFlags" label="Search hardware fit filter" sample="Runs well\nRuns with limits\nUnlikely\nUnknown" />
                <VSelect
                    v-model="fitFilter"
                    :label="t('ollama.store.filter.fit', 'Hardware fit')"
                    :items="fitFilterItems"
                    density="compact"
                    hide-details
                    class="mb-ollama__filter"
                />
            </div>

            <VList class="mb-ollama__variant-list" data-test="ollama-variant-list">
                <VListItem
                    v-for="variant in visibleVariants"
                    :key="variant.fullName"
                    class="mb-ollama__variant"
                >
                    <template #title>{{ variant.fullName }}</template>
                    <template #subtitle>
                        <VChip size="x-small" class="mr-1">{{ fitFor(variant) }}</VChip>
                        <span v-if="variant.quantization">{{ variant.quantization }}</span>
                    </template>
                    <template #append>
                        <ConfigSuperConfirm
                            v-if="installedNames.has(variant.fullName)"
                            :title="t('ollama.model.deleteConfirmTitle', 'Delete this model?')"
                            :action="
                                t(
                                    'ollama.model.deleteAction',
                                    { name: variant.fullName },
                                    'This deletes the local copy of {name}. Nothing else on this machine is touched, and it would have to be pulled again to use it.',
                                )
                            "
                            :confirm-label="
                                t('ollama.model.deleteConfirmLabel', 'Delete model forever')
                            "
                            data-test="ollama-model-delete-gate"
                            @confirm="deleteInstalled(variant.fullName)"
                        >
                            <template #activator="{ props: activatorProps }">
                                <VBtn
                                    v-bind="activatorProps"
                                    :icon="mdiDeleteOutline"
                                    :aria-label="t('ollama.model.delete', 'Delete this model')"
                                    variant="text"
                                />
                            </template>
                        </ConfigSuperConfirm>
                        <VBtn
                            v-else
                            :icon="mdiPlus"
                            :aria-label="t('ollama.model.addToCart', 'Add to pull cart')"
                            :color="cart.has(variant.fullName) ? 'primary' : undefined"
                            variant="text"
                            @click="toggleCart(variant.fullName)"
                        />
                    </template>
                </VListItem>
            </VList>
        </section>

        <VDivider class="my-4" />

        <section aria-labelledby="ollama-cart-heading">
            <h2 id="ollama-cart-heading" class="mb-ollama__heading mb-ollama__heading--icon">
                <VIcon :icon="mdiCartOutline" aria-hidden="true" />
                {{ t("ollama.cart.title", "Pull cart") }}
            </h2>
            <p class="mb-ollama__not-commerce">
                {{
                    t(
                        "ollama.cart.notCommerce",
                        "This is a download queue: no price, no checkout, no account and no payment.",
                    )
                }}
            </p>

            <p v-if="cartVariants.length === 0" class="mb-ollama__empty">
                {{ t("ollama.cart.empty", "Nothing queued yet.") }}
            </p>
            <VList v-else>
                <VListItem v-for="variant in cartVariants" :key="variant.fullName">
                    <template #title>{{ variant.fullName }}</template>
                </VListItem>
            </VList>

            <VBtn
                :prepend-icon="mdiDownloadOutline"
                :loading="pulling"
                :disabled="cart.size === 0 || !runtimeReady"
                :title="
                    !runtimeReady
                        ? t('ollama.disabled.noRuntime', 'Ollama is not ready yet.')
                        : cart.size === 0
                          ? t('ollama.disabled.emptyQueue', 'The pull cart is empty.')
                          : undefined
                "
                color="primary"
                @click="startPulls"
            >
                {{ t("ollama.cart.start", "Start pulling") }}
            </VBtn>

            <VList
                v-if="ollamaStore.pullQueue.length > 0"
                class="mb-ollama__queue"
                data-test="ollama-pull-queue"
            >
                <VListItem v-for="item in ollamaStore.pullQueue" :key="item.id">
                    <template #title>{{ item.modelName }}</template>
                    <template #subtitle>
                        {{ item.statusLine }}
                        <VProgressLinear
                            v-if="item.percent !== null"
                            :model-value="item.percent"
                            height="4"
                        />
                    </template>
                    <template #append>
                        <VBtn v-if="item.state === 'pulling' || item.state === 'queued'" size="small" variant="text" @click="cancelPull(item.id)">Cancel</VBtn>
                        <VBtn v-if="item.state === 'failed' || item.state === 'cancelled'" size="small" variant="text" @click="retryPull(item.id)">Retry</VBtn>
                        <VBtn v-if="item.state !== 'pulling'" size="small" variant="text" @click="removePull(item.id)">Remove</VBtn>
                    </template>
                </VListItem>
            </VList>
        </section>

        <VDivider class="my-4" />

        <section aria-labelledby="ollama-chat-heading" class="mb-ollama__chat">
            <h2 id="ollama-chat-heading" class="mb-ollama__heading mb-ollama__heading--icon">
                <VIcon :icon="mdiChatOutline" aria-hidden="true" />
                {{ t("ollama.chat.title", "Chat") }}
            </h2>

            <div class="mb-ollama__chat-layout">
                <div class="mb-ollama__chat-sidebar">
                    <VBtn
                        :prepend-icon="mdiPlus"
                        block
                        variant="tonal"
                        :disabled="!runtimeReady"
                        @click="newSession"
                    >
                        {{ t("ollama.chat.newSession", "New chat") }}
                    </VBtn>
                    <ConfigSearchField
                        v-model="chatQuery"
                        v-model:regex="chatRegex"
                        v-model:flags="chatFlags"
                        :label="t('ollama.chat.search', 'Search chats')"
                        class="mt-2"
                    />
                    <VList density="compact" data-test="ollama-chat-session-list">
                        <VListItem
                            v-for="session in visibleSessions"
                            :key="session.id"
                            :active="session.id === ollamaStore.activeSessionId"
                            @click="ollamaStore.activeSessionId = session.id"
                        >
                            <template v-if="renamingSessionId === session.id" #default>
                                <VTextField
                                    v-model="renameDraft"
                                    autofocus
                                    density="compact"
                                    hide-details
                                    @keydown.enter="commitRename"
                                    @blur="commitRename"
                                />
                            </template>
                            <template v-else #title>{{ session.name }}</template>
                            <template #append>
                                <VBtn
                                    :icon="mdiPencilOutline"
                                    :aria-label="t('ollama.chat.rename', 'Rename chat')"
                                    variant="text"
                                    size="small"
                                    @click.stop="beginRename(session)"
                                />
                                <ConfigSuperConfirm
                                    :title="
                                        t('ollama.chat.deleteConfirmTitle', 'Delete this chat?')
                                    "
                                    :action="
                                        t(
                                            'ollama.chat.deleteAction',
                                            { count: session.messages.length },
                                            'This deletes {count} messages in this chat. Nothing else is touched, and a deleted chat cannot be recovered.',
                                        )
                                    "
                                    :confirm-label="
                                        t('ollama.chat.deleteConfirmLabel', 'Delete chat forever')
                                    "
                                    data-test="ollama-chat-delete-gate"
                                    @confirm="confirmDeleteSession(session)"
                                >
                                    <template #activator="{ props: activatorProps }">
                                        <VBtn
                                            v-bind="activatorProps"
                                            :icon="mdiDeleteOutline"
                                            :aria-label="t('ollama.chat.delete', 'Delete chat')"
                                            variant="text"
                                            size="small"
                                            @click.stop
                                        />
                                    </template>
                                </ConfigSuperConfirm>
                            </template>
                        </VListItem>
                    </VList>
                </div>

                <div class="mb-ollama__chat-main">
                    <template v-if="activeSession">
                        <VSelect
                            v-model="activeSession.model"
                            :label="t('ollama.chat.modelLabel', 'Model')"
                            :items="chatModelItems"
                            density="compact"
                            hide-details
                        />
                        <ConfigSearchField v-model="chatModelSearch" v-model:regex="chatModelRegex" v-model:flags="chatModelFlags" label="Search chat models" :sample="ollamaStore.installedModels.map((m) => m.model).join('\n')" />
                        <VTextarea
                            v-model="activeSession.systemPrompt"
                            :label="t('ollama.chat.systemPrompt', 'System prompt')"
                            rows="2"
                            density="compact"
                            hide-details
                        />

                        <div class="mb-ollama__chat-messages" data-test="ollama-chat-messages">
                            <p v-if="activeSession.messages.length === 0" class="mb-ollama__empty">
                                {{
                                    t(
                                        "ollama.chat.empty",
                                        "No messages yet. Choose a model and start typing.",
                                    )
                                }}
                            </p>
                            <div
                                v-for="message in activeSession.messages"
                                :key="message.id"
                                class="mb-ollama__message"
                                :data-role="message.role"
                            >
                                <strong>{{ message.role }}</strong>
                                <p>{{ message.content }}</p>
                            </div>
                        </div>

                        <div class="mb-ollama__chat-input">
                            <VTextarea
                                v-model="draftMessage"
                                rows="2"
                                hide-details
                                :disabled="!runtimeReady || sending"
                                :label="
                                    !runtimeReady
                                        ? t('ollama.disabled.noRuntime', 'Ollama is not ready yet.')
                                        : !activeSession.model
                                          ? t('ollama.disabled.noModel', 'Choose a model first.')
                                          : undefined
                                "
                                @keydown.enter.exact.prevent="sendMessage"
                            />
                            <VBtn
                                v-if="sending"
                                :prepend-icon="mdiStopCircleOutline"
                                color="error"
                                @click="stopSending"
                            >
                                {{ t("ollama.chat.stop", "Stop") }}
                            </VBtn>
                            <VBtn
                                v-else
                                :prepend-icon="mdiSend"
                                color="primary"
                                :disabled="
                                    !runtimeReady ||
                                    !activeSession.model ||
                                    draftMessage.trim().length === 0
                                "
                                :title="
                                    !runtimeReady
                                        ? t('ollama.disabled.noRuntime', 'Ollama is not ready yet.')
                                        : !activeSession.model
                                          ? t('ollama.disabled.noModel', 'Choose a model first.')
                                          : draftMessage.trim().length === 0
                                            ? t(
                                                  'ollama.disabled.noMessage',
                                                  'Type a message first.',
                                              )
                                            : undefined
                                "
                                @click="sendMessage"
                            >
                                {{ t("ollama.chat.send", "Send") }}
                            </VBtn>
                            <VBtn
                                variant="text"
                                :disabled="sending || activeSession.messages.length === 0"
                                @click="retryLast"
                            >
                                {{ t("ollama.chat.retry", "Retry") }}
                            </VBtn>
                        </div>
                    </template>
                    <p v-else class="mb-ollama__empty">
                        {{
                            t(
                                "ollama.chat.empty",
                                "No messages yet. Choose a model and start typing.",
                            )
                        }}
                    </p>
                </div>
            </div>
        </section>
    </div>
</template>

<style>
.mb-ollama {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    max-inline-size: 100%;
    overflow-x: auto;
}

.mb-ollama__runtime-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.mb-ollama__runtime-label {
    font-weight: 600;
}

.mb-ollama__runtime-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-ollama__intro {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-ollama__heading {
    font-size: 1.05rem;
    font-weight: 600;
    margin-block-end: 8px;
}

.mb-ollama__heading--icon {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mb-ollama__store-toolbar {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    flex-wrap: wrap;
}

.mb-ollama__filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-block: 8px;
}

.mb-ollama__filter {
    max-inline-size: 220px;
}

.mb-ollama__not-commerce {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    margin-block-end: 8px;
}

.mb-ollama__empty {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.875rem;
}

.mb-ollama__chat-layout {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
}

.mb-ollama__chat-sidebar {
    flex: 1 1 220px;
    max-inline-size: 280px;
    min-inline-size: 0;
}

.mb-ollama__chat-main {
    flex: 3 1 400px;
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-ollama__chat-messages {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-block-size: 40vh;
    overflow-y: auto;
    padding: 8px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 8px;
}

.mb-ollama__chat-input {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    flex-wrap: wrap;
}

@media (max-width: 640px) {
    .mb-ollama__chat-layout {
        flex-direction: column;
    }

    .mb-ollama__chat-sidebar {
        max-inline-size: 100%;
    }
}
</style>
