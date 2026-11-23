<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiRedo, mdiUndo } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardActions, VCardText, VCheckbox, VDialog, VTab, VTabs } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import NbtArrayEditor from "./NbtArrayEditor.vue";
import NbtDialogs from "./NbtDialogs.vue";
import NbtFilesPanel from "./NbtFilesPanel.vue";
import NbtHistoryPanel from "./NbtHistoryPanel.vue";
import NbtTagTree from "./NbtTagTree.vue";
import { createNbtEditorState, type NbtEditorState } from "./nbtEditorState.js";
import type { TagAction } from "./nbtEditorModel.js";
import { nbtEditorBridge, type ArrayEdit, type NbtEditorBridge, type TagKind } from "./nbtEditorBridge.js";

/**
 * The NBT editor: a project's NBT files and region chunks as a tree you can edit visually,
 * with a local Git history behind every save.
 *
 * Layout. Wide: files | tag tree | history, side by side. Narrow: the same three panes as tabs,
 * so a phone loses no feature, only the side-by-side arrangement. Saving is always an explicit
 * act with a message; nothing is written while a server has the world open.
 */
const props = withDefaults(defineProps<{ initialProject?: string | null | undefined; bridge?: NbtEditorBridge | null | undefined }>(), {
    initialProject: null,
});

const { t } = useI18n();
const bridge = props.bridge === undefined ? nbtEditorBridge() : props.bridge;
const available = bridge !== null;
/** Null only when the desktop bridge is missing, in which case the template never reaches it. */
const editor = (bridge === null ? null : createNbtEditorState(bridge)) as NbtEditorState;

/* ------------------------------------------------------------------ layout */

const narrow = ref(false);
const pane = ref<"files" | "tree" | "history">("tree");
let media: MediaQueryList | null = null;
function syncMedia(): void {
    narrow.value = media?.matches ?? false;
}
onMounted(() => {
    if (typeof matchMedia === "function") {
        media = matchMedia("(max-width: 720px)");
        syncMedia();
        media.addEventListener("change", syncMedia);
    }
    if (props.initialProject && editor) void editor.openProject(props.initialProject);
    window.addEventListener("focus", refreshWorld);
});
onBeforeUnmount(() => {
    media?.removeEventListener("change", syncMedia);
    window.removeEventListener("focus", refreshWorld);
    if (searchTimer !== null) clearTimeout(searchTimer);
});

function refreshWorld(): void {
    const dir = editor?.doc.value?.projectDir ?? editor?.projectDir.value;
    if (editor && dir) void bridge?.worldStatus(dir).then((a) => a.ok && (editor.world.value = a.value));
}

/* ------------------------------------------------------------------ documents */

const doc = computed(() => editor?.doc.value ?? null);
const openRelative = computed(() => {
    const d = doc.value;
    if (d === null) return null;
    return d.location.kind === "chunk" ? d.location.regionPath : d.historyPath;
});
const openChunkIndex = computed(() => (doc.value?.location.kind === "chunk" ? doc.value.location.index : null));
const subtitle = computed(() => {
    const d = doc.value;
    if (d === null) return t("nbt.subtitle.none", "No file open");
    const wrap = d.location.kind === "chunk" ? "" : ` · ${d.bedrock ? "Bedrock header" : d.compression === "none" ? "uncompressed" : d.compression}`;
    return `${d.title}${wrap} · ${d.endianness === "big" ? "big-endian" : "little-endian"}`;
});

/** Anything that would drop unsaved edits asks first. */
const discard = ref<(() => void) | null>(null);
function guarded(action: () => void): void {
    if (editor?.state.value.dirty) discard.value = action;
    else action();
}
function confirmDiscard(): void {
    const action = discard.value;
    discard.value = null;
    action?.();
}

function openProject(dir: string): void {
    guarded(() => void editor?.openProject(dir));
}
function openFile(relative: string): void {
    guarded(() => {
        void editor?.openFile(relative).then(() => (pane.value = "tree"));
    });
}
function pickFile(): void {
    guarded(() => {
        void editor?.pickAndOpen().then(() => (pane.value = "tree"));
    });
}
function openChunk(relative: string, index: number): void {
    guarded(() => {
        void editor?.openChunk(relative, index).then(() => (pane.value = "tree"));
    });
}

/* ------------------------------------------------------------------ search */

let searchTimer: ReturnType<typeof setTimeout> | null = null;
const hitIndex = ref(-1);
const hits = computed(() => editor?.searchResult.value?.hits ?? []);
const matchIds = computed<ReadonlySet<number>>(() => new Set(hits.value.map((h) => h.id)));
const searchError = computed(() => editor?.searchResult.value?.error ?? null);
const searchSummary = computed(() => {
    if (!editor || editor.query.query === "") return "";
    const r = editor.searchResult.value;
    if (r === null) return "";
    if (r.error) return r.error;
    const n = r.hits.length;
    const more = r.truncated ? "+" : "";
    const note = r.timedOut ? ` ${t("nbt.search.timedOut", "(stopped early: too slow)")}` : "";
    return n === 0 ? t("nbt.search.none", "No matches.") : `${n}${more} ${n === 1 ? t("nbt.search.match", "match") : t("nbt.search.matches", "matches")}${note}`;
});
const searchSample = computed(() => hits.value.map((h) => `${h.path} ${h.preview}`).join("\n"));

if (editor) {
    watch(
        () => [editor.query.query, editor.query.regex, editor.query.flags, editor.query.names, editor.query.values, editor.doc.value?.docId],
        () => {
            if (searchTimer !== null) clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                hitIndex.value = -1;
                void editor.runSearch();
            }, 250);
        },
    );
}

function stepHit(delta: 1 | -1): void {
    if (hits.value.length === 0 || !editor) return;
    hitIndex.value = (hitIndex.value + delta + hits.value.length) % hits.value.length;
    const hit = hits.value[hitIndex.value];
    if (hit !== undefined) void editor.reveal(hit.id).then(() => (pane.value = "tree"));
}

/* ------------------------------------------------------------------ editing and dialogs */

type DialogName = "add" | "rename" | "snbt" | "save" | null;
const dialog = ref<DialogName>(null);
const target = ref<number | null>(null);
const dialogError = ref<string | null>(null);
const snbtText = ref("");
const snbtTruncated = ref(false);
const suggested = ref("");
const arrayTarget = ref<number | null>(null);

/** The current error notice's text, read through a function so earlier assignments do not narrow it away. */
function noticeError(): string | null {
    const current = editor.notice.value;
    return current !== null && current.kind === "error" ? current.text : null;
}

function closeDialog(): void {
    dialog.value = null;
    dialogError.value = null;
}

/** Applies an edit and reports whether it was accepted, surfacing a refusal inside the open dialog. */
async function attempt(operation: Parameters<NonNullable<typeof editor>["applyEdit"]>[0]): Promise<boolean> {
    if (!editor) return false;
    editor.notice.value = null;
    const outcome = await editor.applyEdit(operation);
    if (outcome === null) {
        dialogError.value = noticeError();
        return false;
    }
    dialogError.value = null;
    return true;
}

const targetNode = computed(() => (target.value === null || !editor ? null : (editor.cache.nodes.get(target.value) ?? null)));

async function onAction(name: TagAction, id: number): Promise<void> {
    if (!editor) return;
    target.value = id;
    dialogError.value = null;
    switch (name) {
        case "add":
            dialog.value = "add";
            break;
        case "rename":
            dialog.value = "rename";
            break;
        case "duplicate":
            await attempt({ op: "duplicate", id });
            break;
        case "up":
            await attempt({ op: "nudge", id, direction: -1 });
            break;
        case "down":
            await attempt({ op: "nudge", id, direction: 1 });
            break;
        case "remove": {
            const label = editor.cache.nodes.get(id)?.name ?? "tag";
            if (await attempt({ op: "remove", id })) editor.say("info", t("nbt.notice.removed", { name: label }, 'Removed "{name}". Undo brings it back.'));
            break;
        }
        case "copy":
            await editor.copyTag(id);
            break;
        case "paste":
            await editor.pasteTag(id);
            break;
        case "snbt": {
            const result = await editor.ask(bridge!.snbt(editor.doc.value!.docId, id, true));
            if (result === null) break;
            snbtText.value = result.text;
            snbtTruncated.value = result.truncated;
            dialog.value = "snbt";
            break;
        }
    }
}

async function submitAdd(value: { kind: TagKind; name: string; text: string }): Promise<void> {
    if (target.value === null || !editor) return;
    const parent = target.value;
    const kindOfParent = editor.cache.nodes.get(parent)?.kind;
    const ok = await attempt({ op: "add", parentId: parent, kind: value.kind, name: kindOfParent === "list" ? "" : value.name, ...(value.text !== "" ? { text: value.text } : {}) });
    if (ok) {
        await editor.expand(parent);
        closeDialog();
    }
}

async function submitRename(name: string): Promise<void> {
    if (target.value === null) return;
    if (await attempt({ op: "rename", id: target.value, name })) closeDialog();
}

async function submitSnbt(text: string): Promise<void> {
    if (target.value === null) return;
    if (await attempt({ op: "replaceSnbt", id: target.value, text })) closeDialog();
}

async function openSave(): Promise<void> {
    if (!editor) return;
    dialogError.value = null;
    suggested.value = await editor.suggestedMessage();
    await editor.loadPending();
    dialog.value = "save";
}

async function submitSave(message: string): Promise<void> {
    if (!editor) return;
    dialogError.value = null;
    editor.notice.value = null;
    if (await editor.save(message)) closeDialog();
    else dialogError.value = noticeError();
}

const saveBlockedReason = computed(() => (editor && !editor.world.value.writable ? editor.world.value.reason : null));

async function loadArray(offset: number, limit: number) {
    if (!editor || arrayTarget.value === null || !editor.doc.value) return null;
    return await editor.ask(bridge!.arrayPage(editor.doc.value.docId, arrayTarget.value, offset, limit));
}

async function editArray(operation: ArrayEdit): Promise<boolean> {
    if (arrayTarget.value === null) return false;
    return await attempt({ ...operation, id: arrayTarget.value });
}

const arrayTitle = computed(() => {
    const node = arrayTarget.value === null || !editor ? null : editor.cache.nodes.get(arrayTarget.value);
    return node ? `${node.name ?? "array"}` : "";
});

/* ------------------------------------------------------------------ keyboard */

function onRootKeydown(event: KeyboardEvent): void {
    if (!editor) return;
    const inField = (event.target as HTMLElement).closest("input, textarea, select") !== null;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (editor.state.value.dirty) void openSave();
    } else if (mod && !inField && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) void editor.redo();
        else void editor.undo();
    } else if (mod && !inField && event.key.toLowerCase() === "y") {
        event.preventDefault();
        void editor.redo();
    }
}

const regexModel = computed({ get: () => editor?.query.regex ?? false, set: (v: boolean) => editor && (editor.query.regex = v) });
const flagsModel = computed({ get: () => editor?.query.flags ?? "i", set: (v: string) => editor && (editor.query.flags = v) });
const queryModel = computed({ get: () => editor?.query.query ?? "", set: (v: string) => editor && (editor.query.query = v) });
const tagCount = computed(() => doc.value?.root.childCount ?? 0);
</script>

<template>
    <section v-if="!available" class="wl-nbt-screen wl-nbt-screen--unavailable">
        <h1>{{ t('nbt.title', 'NBT editor') }}</h1>
        <v-alert type="info" variant="tonal">{{ t('nbt.unavailable', 'The NBT editor needs the desktop app, because it reads and writes files on this computer.') }}</v-alert>
    </section>

    <section v-else class="wl-nbt-screen" :aria-label="t('nbt.title', 'NBT editor')" @keydown="onRootKeydown">
        <header class="wl-nbt-head">
            <div class="wl-nbt-head__title">
                <h1>{{ t('nbt.title', 'NBT editor') }}</h1>
                <span class="wl-nbt-head__sub">{{ subtitle }}</span>
            </div>
            <div class="wl-nbt-head__tools">
                <div class="wl-nbt-search">
                    <config-search-field
                        v-model="queryModel"
                        v-model:regex="regexModel"
                        v-model:flags="flagsModel"
                        :label="t('nbt.search.label', 'Search tags and values')"
                        :sample="searchSample"
                        density="compact"
                    />
                    <div class="wl-nbt-search__opts">
                        <v-checkbox v-model="editor.query.names" :label="t('nbt.search.names', 'Names')" density="compact" hide-details />
                        <v-checkbox v-model="editor.query.values" :label="t('nbt.search.values', 'Values')" density="compact" hide-details />
                        <v-btn size="small" variant="text" :disabled="hits.length === 0" :aria-label="t('nbt.search.previous', 'Previous match')" @click="stepHit(-1)">&uarr;</v-btn>
                        <v-btn size="small" variant="text" :disabled="hits.length === 0" :aria-label="t('nbt.search.next', 'Next match')" @click="stepHit(1)">&darr;</v-btn>
                        <span class="wl-nbt-search__summary" role="status">{{ searchSummary }}</span>
                    </div>
                </div>
                <v-btn :prepend-icon="mdiUndo" variant="outlined" rounded="pill" :disabled="!editor.state.value.canUndo" @click="editor.undo()">{{ t('nbt.undo', 'Undo') }}</v-btn>
                <v-btn :prepend-icon="mdiRedo" variant="outlined" rounded="pill" :disabled="!editor.state.value.canRedo" @click="editor.redo()">{{ t('nbt.redo', 'Redo') }}</v-btn>
                <v-btn
                    color="primary"
                    variant="flat"
                    rounded="pill"
                    :disabled="!editor.state.value.dirty || editor.busy.value || !!saveBlockedReason"
                    :title="saveBlockedReason ?? undefined"
                    @click="openSave"
                >{{ t('nbt.save', 'Save and record') }}</v-btn>
            </div>
        </header>

        <v-alert v-if="editor.notice.value" :type="editor.notice.value.kind === 'error' ? 'error' : editor.notice.value.kind === 'success' ? 'success' : 'info'" variant="tonal" closable density="comfortable" class="wl-nbt-notice" role="status" @click:close="editor.notice.value = null">
            {{ editor.notice.value.text }}
        </v-alert>
        <v-alert v-if="saveBlockedReason" type="warning" variant="tonal" density="comfortable" class="wl-nbt-notice">
            {{ saveBlockedReason }}
        </v-alert>

        <v-tabs v-if="narrow" v-model="pane" grow density="comfortable" :aria-label="t('nbt.panes', 'Editor sections')">
            <v-tab value="files">{{ t('nbt.files.label', 'Files') }}</v-tab>
            <v-tab value="tree">{{ t('nbt.tree.label', 'Tag tree') }}</v-tab>
            <v-tab value="history">{{ t('nbt.history.title', 'History') }}</v-tab>
        </v-tabs>

        <div class="wl-nbt-body" :class="{ 'is-narrow': narrow }">
            <nbt-files-panel
                v-show="!narrow || pane === 'files'"
                :listing="editor.listing.value"
                :open-path="openRelative"
                :chunk-list="editor.chunks.value"
                :open-chunk-index="openChunkIndex"
                :project-dir="editor.projectDir.value"
                @open-project="openProject"
                @open-file="openFile"
                @show-chunks="(p: string) => editor.showChunks(p)"
                @open-chunk="openChunk"
                @pick-file="pickFile"
            />

            <div v-show="!narrow || pane === 'tree'" class="wl-nbt-center">
                <div v-if="!doc" class="wl-nbt-empty">
                    <p>{{ t('nbt.empty', 'Choose a file from the list, open a region chunk, or open any NBT file.') }}</p>
                </div>
                <nbt-tag-tree
                    v-else
                    :rows="editor.rows.value"
                    :cache="editor.cache"
                    :selected-id="editor.selectedId.value"
                    :matches="matchIds"
                    @select="(id: number) => (editor.selectedId.value = id)"
                    @toggle="(id: number) => editor.toggle(id)"
                    @commit="(id: number, text: string) => attempt({ op: 'setValue', id, text })"
                    @flip="(id: number, on: boolean) => attempt({ op: 'setBool', id, on })"
                    @edit-array="(id: number) => (arrayTarget = id)"
                    @more="(id: number) => editor.showMore(id)"
                    @action="onAction"
                />
            </div>

            <nbt-history-panel
                v-show="!narrow || pane === 'history'"
                :entries="editor.history.value"
                :scope="editor.historyScope.value"
                :diff="editor.diff.value"
                :busy="editor.busy.value"
                :has-document="doc !== null"
                :restore-blocked="saveBlockedReason ?? (editor.state.value.dirty ? t('nbt.history.saveFirst', 'Save or undo your edits before restoring.') : null)"
                @scope="(s: 'file' | 'project') => editor.setHistoryScope(s)"
                @diff="(e, a) => editor.showCommitDiff(e, a)"
                @restore="(e) => editor.restore(e)"
                @close-diff="editor.diff.value = null"
            />
        </div>

        <footer class="wl-nbt-foot" role="status">
            <span>{{ editor.state.value.dirty ? t('nbt.foot.unsaved', { count: editor.state.value.changeCount }, '{count} unsaved changes') : t('nbt.foot.clean', 'No unsaved changes') }}</span>
            <span v-if="doc">{{ t('nbt.foot.tags', { count: tagCount }, '{count} top-level tags') }}</span>
            <span>{{ editor.backupBeforeSave.value ? t('nbt.foot.backupOn', 'Back up before saving: on') : t('nbt.foot.backupOff', 'Back up before saving: off') }}</span>
            <span>{{ t('nbt.foot.worldRule', 'Writes are blocked while the world is open in a running server') }}</span>
        </footer>

        <nbt-dialogs
            :dialog="dialog"
            :parent-kind="targetNode?.kind ?? null"
            :list-kind="targetNode?.listKind ?? null"
            :current-name="targetNode?.name ?? ''"
            :snbt-text="snbtText"
            :snbt-truncated="snbtTruncated"
            :error="dialogError"
            :suggested-message="suggested"
            :changes="editor.pending.value?.changes"
            :changes-truncated="editor.pending.value?.truncated"
            :backup="editor.backupBeforeSave.value"
            :busy="editor.busy.value"
            @close="closeDialog"
            @add="submitAdd"
            @rename="submitRename"
            @snbt="submitSnbt"
            @save="submitSave"
            @update:backup="(v: boolean) => (editor.backupBeforeSave.value = v)"
        />

        <nbt-array-editor
            :open="arrayTarget !== null"
            :title="arrayTitle"
            :load="loadArray"
            :edit="editArray"
            @close="arrayTarget = null"
        />

        <v-dialog :model-value="discard !== null" max-width="440" @update:model-value="(v: boolean) => !v && (discard = null)">
            <v-card :title="t('nbt.discard.title', 'Discard unsaved changes?')">
                <v-card-text>{{ t('nbt.discard.body', 'You have edits that are not saved. Opening something else discards them.') }}</v-card-text>
                <v-card-actions>
                    <v-btn variant="text" @click="discard = null">{{ t('nbt.discard.keep', 'Keep editing') }}</v-btn>
                    <v-btn color="error" variant="flat" @click="confirmDiscard">{{ t('nbt.discard.discard', 'Discard') }}</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </section>
</template>

<style scoped>
.wl-nbt-screen { display: flex; flex-direction: column; gap: 12px; padding: 20px 32px; height: 100%; min-height: 0; box-sizing: border-box; }
.wl-nbt-head { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px; }
.wl-nbt-head__title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wl-nbt-head h1 { margin: 0; font-size: 24px; font-weight: 500; }
.wl-nbt-head__sub { font: 12px "Roboto Mono", ui-monospace, monospace; color: rgb(var(--v-theme-on-surface-variant)); overflow-wrap: anywhere; }
.wl-nbt-head__tools { margin-left: auto; display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
.wl-nbt-search { width: 360px; max-width: 100%; display: flex; flex-direction: column; gap: 0; }
.wl-nbt-search__opts { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 8px; font-size: 12px; }
.wl-nbt-search__summary { font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-nbt-notice { flex: none; }
.wl-nbt-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 240px minmax(0, 1fr) 320px; gap: 16px; }
.wl-nbt-body.is-narrow { grid-template-columns: minmax(0, 1fr); }
.wl-nbt-center { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.wl-nbt-empty { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; border: 2px dashed rgba(var(--v-theme-on-surface), 0.2); border-radius: 16px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-nbt-foot { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); }
@media (max-width: 1100px) {
    .wl-nbt-body:not(.is-narrow) { grid-template-columns: 200px minmax(0, 1fr) 260px; }
}
@media (max-width: 720px) {
    .wl-nbt-screen { padding: 16px; }
    .wl-nbt-head__tools { margin-left: 0; width: 100%; }
    .wl-nbt-search { width: 100%; }
}
</style>
