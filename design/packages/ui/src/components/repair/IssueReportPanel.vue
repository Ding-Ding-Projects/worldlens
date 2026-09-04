<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy, mdiDownload, mdiSend, mdiRefresh } from "@mdi/js";
import { VAlert, VBtn, VDivider, VProgressCircular, VTextarea } from "vuetify/components";
import type {
    FailureSummary,
    IssueReportAvailability,
    IssueReportBridge,
} from "./repairBridge.js";
import {
    buildIssueReportFields,
    issueReportJson,
    issueReportMarkdown,
    redactReportText,
    type IssueReportField,
} from "./issueReport.js";

const props = defineProps<{
    failure: FailureSummary;
    reportBridge?: IssueReportBridge | null;
}>();

const { t } = useI18n();
const open = ref(false);
const draftLoading = ref(false);
const submitting = ref(false);
const fields = ref<IssueReportField[]>([]);
const draftTitle = ref("");
const status = ref("");
const bridgeError = ref("");
const submittedUrl = ref<string | null>(null);
const reportState = ref<IssueReportAvailability>({
    status: "offline",
    reason: "The report bridge is not available in this build.",
});

const reportPanelId = computed(() => "issue-report-panel-" + props.failure.id.replace(/[^A-Za-z0-9_-]/g, "-"));
const hasDraft = computed(() => fields.value.length > 0 && draftTitle.value.trim().length > 0);

function offlineState(reason = t("repair.reportOffline", "Issue reporting is unavailable while this build is offline.")): void {
    reportState.value = { status: "offline", reason };
}

function localizedBridgeMessage(status: string, message: string): string {
    const keys: Record<string, { copyKey: string }> = {
        invalid: { copyKey: "repair.reportSubmitInvalid" },
        missing: { copyKey: "repair.reportDraftMissing" },
        offline: { copyKey: "repair.reportSubmitOffline" },
        "not-signed-in": { copyKey: "repair.reportSubmitNotSignedIn" },
        "permission-denied": { copyKey: "repair.reportSubmitPermissionDenied" },
        failed: { copyKey: message.toLowerCase().includes("restore") ? "repair.reportSubmitRestoreUncertain" : "repair.reportSubmitFailed" },
        cancelled: { copyKey: "repair.reportExportCancelled" },
    };
    const fallback = t(keys[status]?.copyKey ?? "repair.reportSubmitFailed", "The report operation did not complete.");
    return message.trim() === "" ? fallback : fallback + " " + message;
}

function applyBridgeError(answer: {
    status: "invalid" | "offline" | "not-signed-in" | "permission-denied" | "failed";
    message: string;
}): void {
    if (answer.status === "offline" || answer.status === "not-signed-in") {
        reportState.value = { status: answer.status, reason: localizedBridgeMessage(answer.status, answer.message) };
        return;
    }
    bridgeError.value = localizedBridgeMessage(answer.status, answer.message);
}

async function readReportState(): Promise<void> {
    if (!props.reportBridge) {
        offlineState();
        return;
    }
    try {
        const answer = await props.reportBridge.availability();
        if (answer.status === "ready" || answer.status === "offline" || answer.status === "not-signed-in") {
            reportState.value = answer;
        } else {
            offlineState();
        }
    } catch {
        offlineState();
    }
}

function selectionFromFields(): {
    reproductionSteps?: readonly string[];
    consoleEvidence?: readonly string[];
} {
    const values = (key: string): readonly string[] => {
        const value = fields.value.find((field) => field.key === key)?.value ?? "";
        return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    };
    const reproductionSteps = values("reproductionSteps");
    const consoleEvidence = values("consoleEvidence");
    return {
        ...(reproductionSteps.length > 0 ? { reproductionSteps } : {}),
        ...(consoleEvidence.length > 0 ? { consoleEvidence } : {}),
    };
}

async function loadDraft(): Promise<void> {
    if (!props.reportBridge) {
        offlineState();
        return;
    }
    draftLoading.value = true;
    bridgeError.value = "";
    status.value = "";
    try {
        const answer = await props.reportBridge.draft(props.failure.id, selectionFromFields());
        if (!answer.ok) {
            bridgeError.value = localizedBridgeMessage(answer.status, answer.message);
            return;
        }
        const draft = answer.draft;
        if (draft.autoSubmitted || !draft.requiresUserConfirmation) {
            bridgeError.value = t("repair.reportUnexpectedState", "The report bridge returned an invalid automatic-submission state.");
            return;
        }
        draftTitle.value = redactReportText(draft.title, 120).replace(/[\r\n]/g, " ").trim() || "Issue report";
        fields.value = buildIssueReportFields(draft.report);
        submittedUrl.value = null;
        bridgeError.value = "";
    } catch {
        offlineState();
    } finally {
        draftLoading.value = false;
    }
}

function toggle(): void {
    open.value = !open.value;
    if (open.value && !hasDraft.value && !draftLoading.value) void loadDraft();
}

function reportMarkdown(): string {
    return issueReportMarkdown(fields.value);
}

async function copyDraft(): Promise<boolean> {
    if (!hasDraft.value) {
        status.value = t("repair.reportNoDraft", "The report draft is still loading.");
        return false;
    }
    const body = reportMarkdown();
    try {
        const bridge = (globalThis as { worldlens?: { writeClipboardText?: (text: string) => Promise<void> } }).worldlens;
        if (typeof bridge?.writeClipboardText === "function") await bridge.writeClipboardText(body);
        else if (navigator.clipboard) await navigator.clipboard.writeText(body);
        else throw new Error("clipboard unavailable");
        status.value = t("repair.reportCopied", "Draft copied. GitHub has not received anything.");
        return true;
    } catch {
        status.value = t("repair.reportCopyFailed", "The clipboard is unavailable. The draft stayed local; export it locally instead.");
        return false;
    }
}

function safeIssueUrl(value: string): string | null {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === "github.com" ? url.href : null;
    } catch {
        return null;
    }
}

async function submitReport(): Promise<void> {
    if (!props.reportBridge || !hasDraft.value || reportState.value.status !== "ready") return;
    submitting.value = true;
    bridgeError.value = "";
    submittedUrl.value = null;
    status.value = t("repair.reportSubmitting", "Submitting the reviewed report...");
    try {
        const answer = await props.reportBridge.submit({
            title: redactReportText(draftTitle.value, 120).replace(/[\r\n]/g, " ").trim() || "Issue report",
            markdown: reportMarkdown(),
        });
        if (!answer.ok) {
            applyBridgeError(answer);
            status.value = "";
            return;
        }
        const url = safeIssueUrl(answer.url);
        if (!url) {
            bridgeError.value = t("repair.reportInvalidUrl", "The report was accepted but the returned issue link was not a safe GitHub URL.");
            status.value = "";
            return;
        }
        submittedUrl.value = url;
        status.value = t("repair.reportSubmitted", "The reviewed report was submitted. Open the returned issue link to inspect it.");
    } catch {
        bridgeError.value = t("repair.reportSubmitFailed", "The report could not be submitted. The reviewed draft remains local.");
        status.value = "";
    } finally {
        submitting.value = false;
    }
}

async function download(format: "markdown" | "json"): Promise<void> {
    if (!hasDraft.value) {
        status.value = t("repair.reportNoDraft", "The report draft is still loading.");
        return;
    }
    if (!props.reportBridge) {
        offlineState();
        return;
    }
    bridgeError.value = "";
    const content = format === "markdown" ? reportMarkdown() : issueReportJson(fields.value);
    try {
        const answer = await props.reportBridge.export(content, format);
        if (!answer.ok) {
            if (answer.status === "cancelled") {
                status.value = localizedBridgeMessage(answer.status, answer.message);
            } else if (answer.status === "invalid") {
                bridgeError.value = t("repair.reportExportInvalid", "The reviewed report could not be exported because its content was invalid.") + " " + answer.message;
            } else {
                bridgeError.value = t("repair.reportExportFailed", "The report could not be exported. The reviewed draft remains local.") + " " + answer.message;
            }
            return;
        }
        status.value = t("repair.reportExported", "Draft exported locally. Nothing was submitted.");
    } catch {
        bridgeError.value = t("repair.reportExportFailed", "The report could not be exported. The reviewed draft remains local.");
    }
}

onMounted(() => {
    void readReportState();
});

function fieldLabel(field: IssueReportField): string {
    const labels: Record<string, { labelKey: string }> = {
        app: { labelKey: "repair.reportFieldApp" },
        build: { labelKey: "repair.reportFieldBuild" },
        platform: { labelKey: "repair.reportFieldPlatform" },
        engine: { labelKey: "repair.reportFieldEngine" },
        failureCategory: { labelKey: "repair.reportFieldCategory" },
        configFacts: { labelKey: "repair.reportFieldConfig" },
        reproductionSteps: { labelKey: "repair.reportFieldReproduction" },
        consoleEvidence: { labelKey: "repair.reportFieldConsole" },
    };
    return t(labels[field.key]?.labelKey ?? "", field.label);
}
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
            <div class="mb-repair__note text-body-2">
                {{ t("repair.reportPreview", "Review every field before submitting. Nothing is sent automatically; optional evidence can be edited or removed.") }}
            </div>
            <div v-if="draftLoading" class="mb-repair__loading" role="status" aria-live="polite">
                <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
                <span>{{ t("repair.reportLoading", "Preparing a redacted draft...") }}</span>
            </div>
            <div v-else-if="!hasDraft" class="mb-repair__note">
                {{ t("repair.reportNoDraft", "The report draft is not available yet.") }}
            </div>
            <template v-else>
            <v-textarea
                v-model="draftTitle"
                :label="t('repair.reportTitle', 'Issue title')"
                :hint="t('repair.reportTitleHint', 'Review the title before submitting.')"
                persistent-hint
                rows="1"
                auto-grow
                density="compact"
                variant="outlined"
            />
            <div v-for="field in fields" :key="field.key" class="mb-issue-report__field">
                <v-textarea
                    v-model="field.value"
                    :label="fieldLabel(field)"
                    :readonly="field.required"
                    :hint="field.required ? t('repair.reportRequired', 'Included because it identifies this failure.') : t('repair.reportOptional', 'Optional; clear it to remove it from the draft.')"
                    persistent-hint
                    rows="2"
                    auto-grow
                    density="compact"
                    variant="outlined"
                />
            </div>
            <v-textarea
                :model-value="reportMarkdown()"
                :label="t('repair.reportBodyPreview', 'Submission body preview')"
                :hint="t('repair.reportBodyHint', 'This is the exact reviewed body sent to the bridge when you explicitly submit.')"
                persistent-hint
                readonly
                rows="5"
                auto-grow
                density="compact"
                variant="outlined"
            />
            <v-divider class="my-2" />
            <div v-if="status" class="mb-repair__note text-body-2" role="status" aria-live="polite">{{ status }}</div>
            <v-alert v-if="bridgeError" type="error" variant="tonal" density="compact" class="mb-3">
                {{ bridgeError }}
            </v-alert>
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
                <v-btn
                    :prepend-icon="mdiSend"
                    color="primary"
                    variant="flat"
                    :loading="submitting"
                    :disabled="reportState.status !== 'ready'"
                    @click="submitReport"
                >
                    {{ t("repair.reportSubmit", "Submit reviewed report") }}
                </v-btn>
            </div>
            <v-alert type="info" variant="tonal" density="compact" class="mt-3">
                {{ t("repair.reportNoAutoSend", "Submission requires this explicit action. The report body stays on this computer until you choose to submit it.") }}
            </v-alert>
            <div v-if="submittedUrl" class="mb-repair__note text-body-2 mt-2">
                <a :href="submittedUrl" target="_blank" rel="noopener noreferrer">
                    {{ t("repair.reportOpenSubmitted", "Open the submitted issue") }}
                </a>
            </div>
            </template>
            <v-alert
                v-if="reportState.status === 'offline'"
                type="warning"
                variant="tonal"
                density="compact"
                class="mt-3"
            >
                {{ t("repair.reportOffline", "Issue reporting is unavailable while this build is offline.") }}
                <span v-if="reportState.reason"> {{ reportState.reason }}</span>
            </v-alert>
            <v-alert
                v-else-if="reportState.status === 'not-signed-in'"
                type="info"
                variant="tonal"
                density="compact"
                class="mt-3"
            >
                {{ t("repair.reportNotSignedIn", "You are not signed in. The draft remains local and is never submitted automatically.") }}
                <span v-if="reportState.reason"> {{ reportState.reason }}</span>
            </v-alert>
            <v-alert v-else type="success" variant="tonal" density="compact" class="mt-3">
                {{ t("repair.reportReady", "The draft is ready to review. Nothing is submitted automatically.") }}
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
