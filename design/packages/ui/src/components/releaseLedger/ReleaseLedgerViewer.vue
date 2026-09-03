<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy, mdiDownload, mdiOpenInNew, mdiRefresh, mdiShieldAlert, mdiShieldCheck, mdiProgressClock } from "@mdi/js";
import { VBtn, VChip, VIcon, VProgressCircular } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { resolveReleaseLedgerBridge, type ReleaseLedgerEntry, type ReleaseLedgerReadout, type ReleaseLedgerVerification } from "./releaseLedgerBridge.js";

const props = defineProps<{ bridge?: ReturnType<typeof resolveReleaseLedgerBridge> }>();
const { t } = useI18n();
const bridge = computed(() => props.bridge ?? resolveReleaseLedgerBridge());
const readout = ref<ReleaseLedgerReadout | null>(null);
const loading = ref(false);
const failure = ref<string | null>(null);
const query = ref(""); const regex = ref(false); const flags = ref("i");

function describe(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, ""); }
async function refresh(): Promise<void> {
    const reader = bridge.value?.releaseLedgerRead;
    if (typeof reader !== "function") { failure.value = t("releaseLedger.unavailable", "This build has no release-ledger reader. No release state is being guessed."); return; }
    loading.value = true; failure.value = null;
    try { const next = await reader.call(bridge.value); if (next.source !== "bridge" || !Array.isArray(next.entries)) throw new Error("The release-ledger response was not a bridge readout."); readout.value = next; }
    catch (error) { readout.value = null; failure.value = describe(error); } finally { loading.value = false; }
}
onMounted(() => void refresh());
const entries = computed(() => readout.value?.entries ?? []);
const matcher = computed(() => {
    if (query.value.trim() === "") return null;
    try { const expression = regex.value ? new RegExp(query.value, flags.value) : null; return (entry: ReleaseLedgerEntry) => { const text = [entry.phase, entry.integrationSha, entry.releaseTag, entry.codeName, entry.verificationNote].filter(Boolean).join(" "); return expression ? expression.test(text) : text.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()); }; }
    catch { return () => false; }
});
const shown = computed(() => matcher.value === null ? entries.value : entries.value.filter(matcher.value));
function statusLabel(status: ReleaseLedgerVerification): string { return t(`releaseLedger.status.${status}`, { running: "Running", failed: "Failed", verified: "Verified", unverified: "Unverified" }[status]); }
function statusIcon(status: ReleaseLedgerVerification): string { return status === "verified" ? mdiShieldCheck : status === "running" ? mdiProgressClock : mdiShieldAlert; }
function bytes(value: number | null): string { return value === null ? t("releaseLedger.notReported", "not reported") : `${new Intl.NumberFormat().format(value)} bytes`; }
function markdown(): string {
    return [
        `# ${t("releaseLedger.title", "Phase release ledger")}`,
        "",
        `Read at: ${readout.value?.readAt ?? "unknown"}`,
        "",
        ...shown.value.map((entry) => `## ${entry.phase}\n\n- Integration: ${entry.integrationSha}\n- Release: ${entry.releaseTag ?? "not published"}\n- Workflow: ${entry.workflowRun ?? "not reported"} (${entry.workflowState})\n- Timing: ${entry.startedAt ?? "not reported"} → ${entry.completedAt ?? "not reported"} · ${entry.duration ?? "not reported"}\n- Code name: ${entry.codeName ?? "none recorded"}\n- Verification: ${entry.verification}\n- Note: ${entry.verificationNote}\n- Assets: ${entry.assets.map((asset) => `${asset.name} (${bytes(asset.bytes)}${asset.sha256 ? `, SHA-256 ${asset.sha256}` : ""})`).join("; ") || "none"}`),
    ].join("\n");
}
async function copy(): Promise<void> { const text = markdown(); if (bridge.value?.writeClipboardText) await bridge.value.writeClipboardText(text); else await navigator.clipboard.writeText(text); }
function download(): void { const blob = new Blob([markdown()], { type: "text/markdown;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "release-ledger.md"; anchor.click(); URL.revokeObjectURL(url); }
</script>

<template>
    <section class="wl-release-ledger" aria-labelledby="release-ledger-title">
        <header class="wl-release-ledger__header"><div><div class="wl-release-ledger__eyebrow text-overline">{{ t("releaseLedger.eyebrow", "Release evidence") }}</div><div id="release-ledger-title" class="text-h2">{{ t("releaseLedger.title", "Phase release ledger") }}</div><div class="text-body-1">{{ t("releaseLedger.lede", "Read-only evidence for each completed implementation phase. A local build never becomes a cloud verdict by wishful thinking.") }}</div></div><div class="wl-release-ledger__actions"><VBtn variant="tonal" :prepend-icon="mdiRefresh" :loading="loading" @click="refresh">{{ t("releaseLedger.refresh", "Refresh evidence") }}</VBtn><VBtn variant="text" :prepend-icon="mdiContentCopy" :disabled="!readout" @click="copy">{{ t("releaseLedger.copy", "Copy shown") }}</VBtn><VBtn variant="text" :prepend-icon="mdiDownload" :disabled="!readout" @click="download">{{ t("releaseLedger.export", "Export Markdown") }}</VBtn></div></header>
        <div v-if="loading" class="wl-release-ledger__state text-body-1" role="status"><VProgressCircular indeterminate size="18" width="2" aria-hidden="true" />{{ t("releaseLedger.loading", "Reading the live release ledger…") }}</div>
        <div v-else-if="failure" class="wl-release-ledger__state wl-release-ledger__state--error text-body-1" role="status">{{ failure }}</div>
        <template v-else-if="readout"><ConfigSearchField v-model="query" v-model:regex="regex" v-model:flags="flags" class="wl-release-ledger__search" :label="t('releaseLedger.search', 'Search phases, commits and releases')" :sample="entries.map((entry) => `${entry.phase} ${entry.releaseTag ?? ''}`).join(' | ')" :summary="t('releaseLedger.count', { shown: shown.length, total: entries.length }, '{shown} of {total} phases')" /><div class="wl-release-ledger__source text-body-2">{{ t("releaseLedger.source", { at: readout.readAt }, "Live bridge read at {at}") }}</div><div v-if="shown.length === 0" class="wl-release-ledger__state text-body-1" role="status">{{ t("releaseLedger.empty", "No phase matches this search. Nothing has been fabricated to fill the gap.") }}</div><ol v-else class="wl-release-ledger__list"><li v-for="entry in shown" :key="entry.id" class="wl-release-ledger__row"><div class="wl-release-ledger__row-head"><div><div class="text-h3">{{ entry.phase }}</div><div class="wl-release-ledger__sha text-body-2">{{ entry.integrationSha }}</div></div><VChip :color="entry.verification === 'verified' ? 'success' : entry.verification === 'failed' ? 'error' : 'warning'" size="small"><VIcon :icon="statusIcon(entry.verification)" size="16" start />{{ statusLabel(entry.verification) }}</VChip></div><dl class="wl-release-ledger__facts"><div><dt>{{ t("releaseLedger.release", "Release") }}</dt><dd><a v-if="entry.releaseUrl" :href="entry.releaseUrl" target="_blank" rel="noopener noreferrer">{{ entry.releaseTag }}</a><span v-else>{{ t("releaseLedger.notPublished", "not published") }}</span></dd></div><div><dt>{{ t("releaseLedger.workflow", "Workflow") }}</dt><dd><a v-if="entry.workflowUrl" :href="entry.workflowUrl" target="_blank" rel="noopener noreferrer">{{ entry.workflowRun }}</a><span v-else>{{ entry.workflowRun ?? t("releaseLedger.notReported", "not reported") }}</span> · {{ entry.workflowState }}</dd></div><div><dt>{{ t("releaseLedger.timing", "Timing") }}</dt><dd>{{ entry.startedAt ?? t("releaseLedger.notReported", "not reported") }} → {{ entry.completedAt ?? t("releaseLedger.notReported", "not reported") }} · {{ entry.duration ?? t("releaseLedger.notReported", "not reported") }}</dd></div><div><dt>{{ t("releaseLedger.codeName", "Code name") }}</dt><dd>{{ entry.codeName ?? t("releaseLedger.none", "none recorded") }}</dd></div><div><dt>{{ t("releaseLedger.lines", "Lines") }}</dt><dd>{{ entry.lineCount ?? t("releaseLedger.notReported", "not reported") }}</dd></div><div><dt>{{ t("releaseLedger.catalog", "Public catalog") }}</dt><dd><a v-if="entry.catalogUrl" :href="entry.catalogUrl" target="_blank" rel="noopener noreferrer">{{ t("releaseLedger.openCatalog", "Open catalog evidence") }}</a><span v-else>{{ t("releaseLedger.notReported", "not reported") }}</span></dd></div></dl><div class="wl-release-ledger__note text-body-2">{{ entry.verificationNote }}</div><ul v-if="entry.assets.length" class="wl-release-ledger__assets"><li v-for="asset in entry.assets" :key="asset.name"><span class="font-weight-bold">{{ asset.name }}</span> · {{ bytes(asset.bytes) }}<span v-if="asset.sha256"> · SHA-256 {{ asset.sha256 }}</span></li></ul></li></ol></template>
    </section>
</template>

<style scoped>
.wl-release-ledger { max-inline-size: 1080px; padding: 24px 28px 40px; color: rgb(var(--v-theme-on-surface)); }
.wl-release-ledger__header, .wl-release-ledger__row-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
.wl-release-ledger__actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.wl-release-ledger__eyebrow { color: rgb(var(--v-theme-primary)); font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.wl-release-ledger h2 { margin: 4px 0 8px; } .wl-release-ledger h3 { margin: 0; }
.wl-release-ledger__search { margin: 20px 0 8px; } .wl-release-ledger__source, .wl-release-ledger__note { color: rgb(var(--v-theme-on-surface-variant)); }
.wl-release-ledger__list { display: grid; gap: 12px; margin: 18px 0 0; padding: 0; list-style: none; }
.wl-release-ledger__row { padding: 18px; border: 1px solid rgb(var(--v-theme-outline-variant)); border-radius: 16px; background: rgb(var(--v-theme-surface-container-low)); }
.wl-release-ledger__sha { margin: 4px 0 0; font: .8rem ui-monospace, monospace; overflow-wrap: anywhere; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-release-ledger__facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px 16px; margin: 16px 0 10px; } .wl-release-ledger__facts dt { font-size: .75rem; color: rgb(var(--v-theme-on-surface-variant)); } .wl-release-ledger__facts dd { margin: 3px 0 0; overflow-wrap: anywhere; }
.wl-release-ledger__assets { margin: 8px 0 0; padding-left: 18px; font-size: .8rem; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-release-ledger__state { display: flex; align-items: center; gap: 10px; margin: 18px 0; padding: 12px; border-radius: 12px; background: rgb(var(--v-theme-surface-container)); } .wl-release-ledger__state--error { color: rgb(var(--v-theme-error)); }
@media (max-width: 720px) { .wl-release-ledger { padding-inline: 16px; } .wl-release-ledger__header, .wl-release-ledger__row-head { flex-direction: column; } .wl-release-ledger__actions { justify-content: flex-start; } }
</style>
