<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VBtnToggle, VDialog, VCard, VCardActions, VCardText } from "vuetify/components";
import { describeChange } from "./nbtEditorModel.js";
import type { DiffOutcome, HistoryEntry } from "./nbtEditorBridge.js";

/**
 * The project's history: every save, newest first, with a semantic diff (what changed in the
 * data, by name) and a restore that writes an old version back as a new entry. Nothing here
 * rewrites history, so a restore can itself be undone by restoring again.
 */
const props = defineProps<{
    entries: readonly HistoryEntry[];
    scope: "file" | "project";
    diff: (DiffOutcome & { sha: string; against: "parent" | "current" }) | null;
    busy?: boolean | undefined;
    /** A reason restoring is unavailable right now (a running server, unsaved edits). */
    restoreBlocked?: string | null | undefined;
    hasDocument: boolean;
}>();
const emit = defineEmits<{
    scope: [scope: "file" | "project"];
    diff: [entry: HistoryEntry, against: "parent" | "current"];
    restore: [entry: HistoryEntry];
    "close-diff": [];
}>();
const { t } = useI18n();

const confirming = ref<HistoryEntry | null>(null);

function when(seconds: number): string {
    return new Date(seconds * 1000).toLocaleString(undefined, { hour12: false });
}

function confirmRestore(): void {
    const entry = confirming.value;
    confirming.value = null;
    if (entry !== null) emit("restore", entry);
}
</script>

<template>
    <aside class="wl-nbt-history" :aria-label="t('nbt.history.label', 'History')">
        <div class="wl-nbt-history__head">
            <h2>{{ t('nbt.history.title', 'History') }}</h2>
            <span class="wl-nbt-history__sub">{{ t('nbt.history.repo', 'project Git repository') }}</span>
        </div>
        <v-btn-toggle
            :model-value="scope"
            mandatory
            density="comfortable"
            variant="outlined"
            divided
            :aria-label="t('nbt.history.scope', 'History scope')"
            @update:model-value="(v: 'file' | 'project') => emit('scope', v)"
        >
            <v-btn value="file" size="small">{{ t('nbt.history.thisFile', 'This file') }}</v-btn>
            <v-btn value="project" size="small">{{ t('nbt.history.wholeProject', 'Whole project') }}</v-btn>
        </v-btn-toggle>

        <div v-if="diff" class="wl-nbt-diff" role="region" :aria-label="t('nbt.history.diff', 'Changes in this version')">
            <div class="wl-nbt-diff__head">
                <strong>{{ diff.against === 'current' ? t('nbt.history.vsNow', 'This version compared with now') : diff.isFirst ? t('nbt.history.firstVersion', 'First recorded version') : t('nbt.history.vsPrevious', 'Changes in this version') }}</strong>
                <button type="button" class="wl-nbt-link" @click="emit('close-diff')">{{ t('nbt.dialog.done', 'Done') }}</button>
            </div>
            <p v-if="diff.changes.length === 0" class="wl-nbt-history__sub">{{ t('nbt.history.noDifference', 'No differences.') }}</p>
            <div v-for="(change, i) in diff.changes" :key="i" class="wl-nbt-diff__line" :class="`is-${change.change}`">
                <template v-if="change.change === 'changed'">
                    <div class="is-removed">- {{ change.path || '(root)' }}: {{ change.before }}</div>
                    <div class="is-added">+ {{ change.path || '(root)' }}: {{ change.after }}</div>
                </template>
                <div v-else-if="change.change === 'added'" class="is-added">+ {{ change.path || '(root)' }}: {{ change.after }}</div>
                <div v-else class="is-removed">- {{ change.path || '(root)' }}: {{ change.before }}</div>
            </div>
            <p v-if="diff.truncated" class="wl-nbt-history__sub">{{ t('nbt.history.truncated', 'Only the first changes are shown.') }}</p>
        </div>

        <p v-if="entries.length === 0" class="wl-nbt-history__sub">
            {{ t('nbt.history.empty', 'Nothing is recorded yet. The first save records the file as it was, then your change.') }}
        </p>
        <ol class="wl-nbt-commits">
            <li v-for="entry in entries" :key="entry.sha" class="wl-nbt-commit">
                <span class="wl-nbt-commit__msg">{{ entry.message }}</span>
                <span class="wl-nbt-commit__meta">{{ entry.shortSha }} &middot; {{ when(entry.time) }}<template v-if="scope === 'project' && entry.files[0]"> &middot; {{ entry.files[0] }}</template></span>
                <span class="wl-nbt-commit__actions">
                    <v-btn size="small" variant="outlined" rounded="pill" :disabled="!!busy" @click="emit('diff', entry, 'parent')">{{ t('nbt.history.diffButton', 'Diff') }}</v-btn>
                    <v-btn v-if="hasDocument && scope === 'file'" size="small" variant="text" rounded="pill" :disabled="!!busy" @click="emit('diff', entry, 'current')">{{ t('nbt.history.vsNowButton', 'Compare with now') }}</v-btn>
                    <v-btn
                        v-if="hasDocument && scope === 'file'"
                        size="small"
                        variant="outlined"
                        rounded="pill"
                        :disabled="busy || !!restoreBlocked"
                        :title="restoreBlocked ?? undefined"
                        @click="confirming = entry"
                    >{{ t('nbt.history.restore', 'Restore') }}</v-btn>
                </span>
            </li>
        </ol>

        <v-dialog :model-value="confirming !== null" max-width="460" @update:model-value="(v: boolean) => !v && (confirming = null)">
            <v-card v-if="confirming" :title="t('nbt.history.confirmTitle', 'Restore this version?')">
                <v-card-text>
                    {{ t('nbt.history.confirmBody', { sha: confirming.shortSha }, 'The file is replaced with the version recorded as {sha}. The restore is saved as a new entry, so nothing in the history is lost.') }}
                </v-card-text>
                <v-card-actions>
                    <v-btn variant="text" @click="confirming = null">{{ t('nbt.dialog.cancel', 'Cancel') }}</v-btn>
                    <v-btn color="primary" variant="flat" @click="confirmRestore">{{ t('nbt.history.restore', 'Restore') }}</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </aside>
</template>

<style scoped>
.wl-nbt-history { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow: auto; padding: 14px; border-radius: 16px; background: rgb(var(--v-theme-surface-container, var(--v-theme-surface))); }
.wl-nbt-history__head { display: flex; align-items: center; gap: 8px; }
.wl-nbt-history__head h2 { margin: 0; font-size: 15px; font-weight: 500; }
.wl-nbt-history__sub { margin: 0; font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-nbt-history__head .wl-nbt-history__sub { margin-left: auto; }
.wl-nbt-diff { font: 12px/1.6 "Roboto Mono", ui-monospace, monospace; background: rgb(var(--v-theme-surface-container-high, var(--v-theme-surface))); border-radius: 10px; padding: 10px; overflow-wrap: anywhere; }
.wl-nbt-diff__head { display: flex; justify-content: space-between; gap: 8px; font-family: Roboto, sans-serif; margin-bottom: 6px; }
.is-added { color: rgb(var(--v-theme-success, var(--v-theme-primary))); }
.is-removed { color: rgb(var(--v-theme-error)); }
.wl-nbt-commits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.wl-nbt-commit { display: flex; flex-direction: column; gap: 2px; border-left: 3px solid rgb(var(--v-theme-primary)); padding: 4px 10px; }
.wl-nbt-commit__msg { font-size: 13px; overflow-wrap: anywhere; }
.wl-nbt-commit__meta { font: 11px "Roboto Mono", monospace; color: rgb(var(--v-theme-on-surface-variant)); overflow-wrap: anywhere; }
.wl-nbt-commit__actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.wl-nbt-link { background: none; border: 0; color: rgb(var(--v-theme-primary)); cursor: pointer; text-decoration: underline; min-height: 28px; }
</style>
