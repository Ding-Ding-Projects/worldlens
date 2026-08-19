<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy, mdiDownload, mdiOpenInNew, mdiRefresh } from "@mdi/js";
import { VAlert, VBtn, VDivider, VTextarea } from "vuetify/components";
import type { FailureSummary, RepairDiagnosis, RepairResult } from "./repairBridge.js";
import {
    buildIssueReportFields,
    issueReportJson,
    issueReportMarkdown,
    issueReportUrl,
    type IssueReportField,
} from "./issueReport.js";

const props = defineProps<{
    failure: FailureSummary;
    diagnoses?: readonly RepairDiagnosis[];
    result?: RepairResult | null;
}>();

const { t } = useI18n();
const open = ref(false);
const appVersion = ref("unknown");
const fields = ref<IssueReportField[]>([]);
const status = ref("");
const evidence = ref("");

function readVersion(): void {
    const bridge = (globalThis as { worldlens?: { getVersion?: () => Promise<string> } }).worldlens;
    if (typeof bridge?.getVersion !== "function") return;
    void bridge.getVersion().then((value) => {
        if (value.trim()) appVersion.value = value.trim();
    }).catch(() => undefined);
}

function reset(): void {
    fields.value = buildIssueReportFields({
        appVersion: appVersion.value,
        platform: navigator.userAgent,
        engine: "BlueMap renderer",
        failure: props.failure,
        diagnoses: props.diagnoses,
        result: props.result,
        consoleEvidence: evidence.value,
    });
    status.value = "";
}

function toggle(): void {
    open.value = !open.value;
    if (open.value) reset();
}

function reportMarkdown(): string {
    return issueReportMarkdown(fields.value);
}

async function copyDraft(): Promise<boolean> {
    try {
        const bridge = (globalThis as { worldlens?: { writeClipboardText?: (text: string) => Promise<void> } }).worldlens;
        if (typeof bridge?.writeClipboardText === "function") await bridge.writeClipboardText(reportMarkdown());
        else if (navigator.clipboard) await navigator.clipboard.writeText(reportMarkdown());
        else throw new Error("clipboard unavailable");
        status.value = t("repair.reportCopied", "Draft copied. GitHub has not received anything.");
        return true;
    } catch {
        status.value = t("repair.reportCopyFailed", "The clipboard is unavailable. The draft stayed local and GitHub was not opened; export it locally instead.");
        return false;
    }
}

async function copyAndOpen(): Promise<void> {
    if (!(await copyDraft())) return;
    window.open(issueReportUrl(fields.value.find((field) => field.key === "category")?.value ?? "Issue report"), "_blank", "noopener,noreferrer");
}

function download(format: "markdown" | "json"): void {
    const body = format === "markdown" ? reportMarkdown() : issueReportJson(fields.value);
    const blob = new Blob([body], { type: format === "markdown" ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `worldlens-issue-report.${format === "markdown" ? "md" : "json"}`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    status.value = t("repair.reportExported", "Draft exported locally. Nothing was submitted.");
}

onMounted(readVersion);

const visibleFields = computed(() => fields.value.filter((field) => field.required || field.value.trim().length > 0));
const reportPanelId = computed(() => `issue-report-panel-${props.failure.id.replace(/[^A-Za-z0-9_-]/g, "-")}`);
</script>

<template>
    <div class="mb-issue-report">
        <v-btn
            :prepend-icon="mdiRefresh"
            variant="text"
            size="small"
            :aria-expanded="open"
            :aria-controls="reportPanelId"
            @click="toggle"
        >
            {{ t("repair.reportAction", "Report a problem") }}
        </v-btn>

        <div v-if="open" :id="reportPanelId" class="mb-issue-report__body" data-test="issue-report-panel">
            <p class="mb-repair__note">
                {{ t("repair.reportPreview", "Review every field before opening GitHub. Nothing is sent automatically; optional evidence can be edited or removed.") }}
            </p>
            <div v-for="field in visibleFields" :key="field.key" class="mb-issue-report__field">
                <v-textarea
                    v-model="field.value"
                    :label="field.label"
                    :readonly="field.required"
                    :hint="field.required ? t('repair.reportRequired', 'Included because it identifies this failure.') : t('repair.reportOptional', 'Optional; clear it to remove it from the draft.')"
                    persistent-hint
                    rows="2"
                    auto-grow
                    density="compact"
                    variant="outlined"
                />
            </div>
            <v-divider class="my-2" />
            <p v-if="status" class="mb-repair__note" role="status" aria-live="polite">{{ status }}</p>
            <div class="mb-issue-report__actions">
                <v-btn :prepend-icon="mdiContentCopy" variant="tonal" @click="copyDraft">
                    {{ t("repair.reportCopy", "Copy draft") }}
                </v-btn>
                <v-btn :prepend-icon="mdiDownload" variant="tonal" @click="download('markdown')">
                    {{ t("repair.reportMarkdown", "Export Markdown") }}
                </v-btn>
                <v-btn :prepend-icon="mdiDownload" variant="tonal" @click="download('json')">
                    {{ t("repair.reportJson", "Export JSON") }}
                </v-btn>
                <v-btn :prepend-icon="mdiOpenInNew" color="primary" variant="flat" @click="copyAndOpen">
                    {{ t("repair.reportOpen", "Copy draft and open GitHub") }}
                </v-btn>
            </div>
            <v-alert type="info" variant="tonal" density="compact" class="mt-3">
                {{ t("repair.reportNoAutoSend", "Opening GitHub only opens a new issue form. The report body stays on this computer until you choose what to paste.") }}
            </v-alert>
        </div>
    </div>
</template>

<style>
.mb-issue-report__body {
    margin-block-start: 8px;
    padding: 12px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 12px;
}

.mb-issue-report__field { margin-block-start: 10px; }
.mb-issue-report__actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
