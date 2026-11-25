<script setup lang="ts">
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertCircleOutline, mdiBackupRestore, mdiCheckCircleOutline, mdiDeleteSweep, mdiRestart } from "@mdi/js";
import { VAlert, VBtn, VIcon, VProgressLinear, VRadio, VRadioGroup } from "vuetify/components";
import PathField from "../PathField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import type { DataFolderKind, DataFolderMoveMode } from "./dataFoldersBridge.js";
import type { DataFoldersStore } from "./dataFoldersStore.js";

/**
 * One chosen folder: where it is now, where it would go, how the existing data is treated, and
 * what happened.
 *
 * Every control here is a real typed control. The folder is a path field with a native browse
 * button (never a typed-path-only box), the treatment of existing data is a radio group, and
 * the one button that changes anything states, beside itself, the exact reason when it is not
 * available. Nothing moves until Apply, and Apply asks the main process, which validates again.
 */
const props = defineProps<{
    store: DataFoldersStore;
    kind: DataFolderKind;
    /** The default location written with its environment variable, when there is one. */
    defaultToken?: string | null;
}>();

const { t } = useI18n();
const uid = useId();
const draft = computed(() => props.store.drafts[props.kind]);
const info = computed(() => props.store.status.value?.[props.kind] ?? null);
const busy = computed(() => props.store.busyKind.value === props.kind);
const blocked = computed(() => props.store.applyBlockedReason(props.kind).value);
const canApply = computed(() => blocked.value === null);

/**
 * The localized sentence for a refusal or blocking code, or the main process's own sentence
 * for a code with none (the free-space refusal carries numbers). Every key is written out so
 * the catalogue check can see each call site.
 */
function reasonText(code: string, message: string): string {
    switch (code) {
        case "no-bridge":
            return t("dataFolders.reason.no-bridge", message);
        case "busy":
            return t("dataFolders.reason.busy", message);
        case "empty":
            return t("dataFolders.reason.empty", message);
        case "checking":
            return t("dataFolders.reason.checking", message);
        case "not-absolute":
            return t("dataFolders.reason.not-absolute", message);
        case "same-as-current":
            return t("dataFolders.reason.same-as-current", message);
        case "inside-install-folder":
            return t("dataFolders.reason.inside-install-folder", message);
        case "contains-install-folder":
            return t("dataFolders.reason.contains-install-folder", message);
        case "system-folder":
            return t("dataFolders.reason.system-folder", message);
        case "inside-other-folder":
            return t("dataFolders.reason.inside-other-folder", message);
        case "contains-other-folder":
            return t("dataFolders.reason.contains-other-folder", message);
        case "not-a-folder":
            return t("dataFolders.reason.not-a-folder", message);
        case "not-creatable":
            return t("dataFolders.reason.not-creatable", message);
        case "not-writable":
            return t("dataFolders.reason.not-writable", message);
        case "not-empty":
            return t("dataFolders.reason.not-empty", message);
        default:
            return message;
    }
}

const blockedText = computed(() => (blocked.value === null ? "" : reasonText(blocked.value.code, blocked.value.message)));

const isProfile = computed(() => props.kind === "profile");
const fieldName = computed(() =>
    isProfile.value
        ? t("dataFolders.profile.field", "profile folder")
        : t("dataFolders.save.field", "save folder"),
);
const title = computed(() =>
    isProfile.value ? t("dataFolders.profile.title", "Profile folder") : t("dataFolders.save.title", "Save folder"),
);
const help = computed(() =>
    isProfile.value
        ? t(
              "dataFolders.profile.help",
              "Your settings, consent choices, accounts and history. It is kept as a version history of its own, so every change can be looked back on. A new location is used after a restart.",
          )
        : t(
              "dataFolders.save.help",
              "Where rendered maps are saved by default. The change applies straight away, and maps you already have are copied across if you ask.",
          ),
);

const path = computed<string>({
    get: () => draft.value.folder.value,
    set: (value) => props.store.setFolder(props.kind, value),
});

const mode = computed<DataFolderMoveMode>({
    get: () => draft.value.mode.value,
    set: (value) => props.store.setMode(props.kind, value),
});

const fieldError = computed(() => {
    const validation = draft.value.validation.value;
    return validation !== null && !validation.ok ? reasonText(validation.code, validation.message) : null;
});

const freeText = computed(() => {
    const validation = draft.value.validation.value;
    if (validation === null || !validation.ok || validation.freeBytes === null) return null;
    return t("dataFolders.freeSpace", { size: formatBytes(validation.freeBytes) }, "{size} free on that drive.");
});

const percent = computed(() => {
    const progress = props.store.progress.value;
    if (!busy.value || progress === null || progress.kind !== props.kind || progress.filesTotal === 0) return null;
    return Math.round((progress.filesDone / progress.filesTotal) * 100);
});

const progressText = computed(() => {
    const progress = props.store.progress.value;
    if (!busy.value) return null;
    if (progress === null || progress.kind !== props.kind) {
        return t("dataFolders.progress.starting", "Getting ready...");
    }
    const named = { done: progress.filesDone, total: progress.filesTotal };
    if (progress.phase === "verifying") {
        return t("dataFolders.progress.verifying", named, "Checking each copied file: {done} of {total}");
    }
    if (progress.phase === "measuring") return t("dataFolders.progress.measuring", "Measuring what will be copied...");
    return t("dataFolders.progress.copying", named, "Copying: {done} of {total} files");
});

const result = computed(() => draft.value.result.value);
const resultText = computed(() => {
    const answer = result.value;
    if (answer === null) return null;
    if (!answer.ok) return answer.message;
    const detail =
        answer.copiedFiles > 0
            ? t(
                  "dataFolders.result.copied",
                  { files: answer.copiedFiles, size: formatBytes(answer.copiedBytes) },
                  "{files} files ({size}) were copied and checked one by one.",
              )
            : t("dataFolders.result.nothingCopied", "Nothing was copied.");
    const history =
        answer.historyIntact === true
            ? t("dataFolders.result.historyIntact", "The version history arrived intact.")
            : "";
    return [answer.message, detail, history].filter((part) => part !== "").join(" ");
});

const pending = computed(() => (isProfile.value ? info.value?.pendingFolder ?? null : null));
const unreachable = computed(() => (isProfile.value ? info.value?.unreachable ?? null : null));
const removable = computed(() => info.value?.removableOldFolder ?? null);

const modeHelpId = `${uid}-mode`;

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
}

function onSubmit(event: Event): void {
    event.preventDefault();
    void props.store.apply(props.kind);
}
</script>

<template>
    <form
        class="mb-data-folder"
        :data-kind="kind"
        :aria-labelledby="`${uid}-title`"
        novalidate
        @submit="onSubmit"
    >
        <h3 :id="`${uid}-title`" class="mb-data-folder__title">{{ title }}</h3>
        <p class="mb-data-folder__help text-medium-emphasis">{{ help }}</p>

        <dl class="mb-data-folder__facts">
            <div>
                <dt>{{ t("dataFolders.current", "In use now") }}</dt>
                <dd class="mb-data-folder__path" data-test="current-folder">{{ info?.current ?? "-" }}</dd>
            </div>
            <div>
                <dt>{{ t("dataFolders.default", "Default") }}</dt>
                <dd class="mb-data-folder__path" data-test="default-folder">
                    {{ info?.default ?? "-" }}
                    <span v-if="defaultToken" class="text-medium-emphasis">({{ defaultToken }})</span>
                </dd>
            </div>
        </dl>

        <v-alert v-if="unreachable !== null" type="warning" variant="tonal" density="compact" data-test="unreachable">
            <p>
                {{
                    t(
                        "dataFolders.unreachable",
                        { folder: unreachable },
                        "The folder you chose, {folder}, cannot be reached, so the default folder is in use for now. Reconnect it and restart to use it again, or go back to the default for good.",
                    )
                }}
            </p>
            <div class="mb-data-folder__actions">
                <v-btn
                    variant="tonal"
                    size="small"
                    :prepend-icon="mdiRestart"
                    :disabled="busy"
                    @click="store.restart()"
                >
                    {{ t("dataFolders.restartToRetry", "Restart and try again") }}
                </v-btn>
                <v-btn
                    variant="tonal"
                    size="small"
                    :prepend-icon="mdiBackupRestore"
                    :disabled="busy"
                    @click="store.forgetUnreachable()"
                >
                    {{ t("dataFolders.useDefaultForGood", "Use the default for good") }}
                </v-btn>
            </div>
        </v-alert>

        <v-alert v-if="pending !== null" type="info" variant="tonal" density="compact" data-test="pending">
            <p>
                {{
                    t(
                        "dataFolders.pending",
                        { folder: pending },
                        "{folder} will be used the next time the app starts. Until then the current folder stays in use.",
                    )
                }}
            </p>
            <div class="mb-data-folder__actions">
                <v-btn variant="tonal" size="small" :prepend-icon="mdiRestart" @click="store.restart()">
                    {{ t("dataFolders.restartNow", "Restart now") }}
                </v-btn>
            </div>
        </v-alert>

        <PathField
            v-model="path"
            :field="fieldName"
            :label="t('dataFolders.newFolder', 'New folder')"
            semantic="folder"
            :disabled="busy || !store.available"
            :error="fieldError"
        />
        <p v-if="freeText !== null" class="mb-data-folder__note text-medium-emphasis" data-test="free-space">
            {{ freeText }}
        </p>

        <v-radio-group
            v-model="mode"
            :label="t('dataFolders.mode.label', 'What happens to the data already there')"
            :disabled="busy || !store.available"
            hide-details="auto"
            :aria-describedby="modeHelpId"
        >
            <v-radio value="move" :label="t('dataFolders.mode.move', 'Move it: copy everything, check it, then offer to remove the old folder')" />
            <v-radio value="copy" :label="t('dataFolders.mode.copy', 'Copy it: keep the old folder exactly as it is')" />
            <v-radio
                value="fresh"
                :label="t('dataFolders.mode.fresh', 'Start fresh, or use what is already in that folder (nothing is copied)')"
            />
        </v-radio-group>
        <p :id="modeHelpId" class="mb-data-folder__note text-medium-emphasis">
            {{
                t(
                    "dataFolders.mode.note",
                    "Nothing is ever overwritten, and the old folder is kept until you remove it yourself.",
                )
            }}
        </p>

        <div class="mb-data-folder__actions">
            <v-btn type="submit" color="primary" variant="flat" :disabled="!canApply" :loading="busy">
                {{ t("dataFolders.apply", "Apply") }}
            </v-btn>
            <v-btn
                variant="tonal"
                :prepend-icon="mdiBackupRestore"
                :disabled="busy || !store.available || info === null || info.current === info.default"
                @click="store.useDefault(kind)"
            >
                {{ t("dataFolders.reset", "Reset to default") }}
            </v-btn>
            <v-btn v-if="busy" variant="text" color="error" @click="store.cancel()">
                {{ t("dataFolders.cancel", "Cancel") }}
            </v-btn>
        </div>
        <p
            v-if="info !== null && info.current === info.default && !busy"
            class="mb-data-folder__why text-medium-emphasis"
            data-test="reset-reason"
        >
            {{ t("dataFolders.resetUnavailable", "Reset is unavailable: this folder is already the default.") }}
        </p>
        <p
            v-if="!canApply && !busy"
            class="mb-data-folder__why text-medium-emphasis"
            data-test="apply-reason"
            aria-live="polite"
        >
            {{ t("dataFolders.whyDisabled", { reason: blockedText }, "Apply is unavailable: {reason}") }}
        </p>

        <div v-if="busy" class="mb-data-folder__progress" data-test="progress">
            <v-progress-linear
                :model-value="percent ?? 0"
                :indeterminate="percent === null"
                color="primary"
                height="8"
                rounded
                :aria-label="t('dataFolders.progress.label', 'Folder change progress')"
            />
            <p aria-live="polite">{{ progressText }}</p>
        </div>

        <v-alert
            v-if="result !== null"
            :type="result.ok ? 'success' : 'error'"
            variant="tonal"
            density="compact"
            data-test="result"
        >
            <template #prepend>
                <v-icon :icon="result.ok ? mdiCheckCircleOutline : mdiAlertCircleOutline" aria-hidden="true" />
            </template>
            <p>{{ resultText }}</p>
            <p v-if="result.ok && result.skipped.length > 0" class="text-medium-emphasis">
                {{
                    t(
                        "dataFolders.result.skipped",
                        { count: result.skipped.length },
                        "{count} items were left out on purpose: caches, locks and logs that are rebuilt on their own.",
                    )
                }}
            </p>
        </v-alert>

        <div v-if="removable !== null" class="mb-data-folder__removal" data-test="removal">
            <p>
                {{
                    t(
                        "dataFolders.removal.explain",
                        { folder: removable },
                        "The old folder {folder} is still on disk. Once you are happy with the new one, you can remove it. The new folder is compared with it first, and nothing is removed if they differ.",
                    )
                }}
            </p>
            <ConfigSuperConfirm
                :title="t('dataFolders.removal.title', 'Remove the old folder')"
                :action="t('dataFolders.removal.action', 'Permanently delete the old folder after proving the new one holds everything.')"
                :affected="[removable]"
                :confirm-label="t('dataFolders.removal.confirm', 'Remove the old folder')"
                @confirm="store.removeOld(kind)"
            >
                <template #activator="{ props: activatorProps }">
                    <v-btn v-bind="activatorProps" color="error" variant="tonal" :prepend-icon="mdiDeleteSweep">
                        {{ t("dataFolders.removal.button", "Remove the old folder...") }}
                    </v-btn>
                </template>
            </ConfigSuperConfirm>
        </div>
        <p v-if="draft.removalMessage.value" class="mb-data-folder__note" role="status" data-test="removal-message">
            {{ draft.removalMessage.value }}
        </p>
    </form>
</template>

<style scoped>
.mb-data-folder {
    display: grid;
    gap: 10px;
}
.mb-data-folder__title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
}
.mb-data-folder__help,
.mb-data-folder__note,
.mb-data-folder__why {
    margin: 0;
    font-size: 0.875rem;
}
.mb-data-folder__facts {
    display: grid;
    gap: 6px;
    margin: 0;
}
.mb-data-folder__facts dt {
    font-size: 0.75rem;
    opacity: 0.75;
}
.mb-data-folder__facts dd {
    margin: 0;
}
.mb-data-folder__path {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    overflow-wrap: anywhere;
}
.mb-data-folder__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-start: 6px;
}
.mb-data-folder__removal {
    display: grid;
    gap: 8px;
    padding-block-start: 8px;
    border-block-start: 1px solid rgba(var(--v-theme-outline), 0.32);
}
.mb-data-folder__progress {
    display: grid;
    gap: 4px;
}
.mb-data-folder__progress p {
    margin: 0;
    font-size: 0.875rem;
}
</style>
