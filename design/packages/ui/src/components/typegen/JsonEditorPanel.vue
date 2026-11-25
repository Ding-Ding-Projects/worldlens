<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiChevronDown,
    mdiChevronRight,
    mdiChevronUp,
    mdiContentCopy,
    mdiContentDuplicate,
    mdiDelete,
    mdiDownload,
    mdiFileTreeOutline,
    mdiFolderOpenOutline,
    mdiPlus,
    mdiRedo,
    mdiSortAlphabeticalAscending,
    mdiTable,
    mdiUndo,
    mdiUnfoldLessHorizontal,
    mdiUnfoldMoreHorizontal,
} from "@mdi/js";
import { VAlert, VBtn, VBtnToggle, VIcon } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    JSON_KINDS,
    JsonHistory,
    addChild,
    defaultFor,
    dropNullsDeep,
    duplicateAt,
    flatten,
    getAt,
    kindOf,
    moveAt,
    parseLenient,
    pathKey,
    pointerOf,
    previewOf,
    removeAt,
    renameKey,
    retype,
    setAt,
    setProperty,
    sortKeysDeep,
    stringify,
    tableFor,
    validateAgainstSchema,
    type EditResult,
    type Json,
    type JsonKind,
    type Path,
    type TreeRow,
} from "./jsonDocModel.js";
import { MAX_INPUT_CHARS } from "./typeGenTypes.js";

/**
 * The structured JSON editor: a tree and a table over one document.
 *
 * The document text belongs to the screen, shared with the Generate surface, so a change here
 * regenerates the types and a change there shows up here. Every edit is a labelled history step
 * that can be undone, redone or jumped back to. Keys, values and kinds are edited with typed
 * controls: a text box for a key or a string, a number box for a number, a switch for a boolean
 * and a select for the kind.
 */
const props = defineProps<{ modelValue: string; schemaText: string }>();
const emit = defineEmits<{ "update:modelValue": [text: string]; "update:schemaText": [text: string] }>();

const { t } = useI18n();

const history = new JsonHistory({});
const root = shallowRef<Json>({});
const tick = ref(0);
const expanded = ref<Set<string>>(new Set([pathKey([])]));
const selected = ref<Path>([]);
const view = ref<"tree" | "table">("tree");
const query = ref("");
const regex = ref(false);
const flags = ref("i");
const notice = ref<{ kind: "success" | "info" | "warning" | "error"; text: string } | null>(null);
const parseError = ref<string | null>(null);
const showHistory = ref(false);
const focusedId = ref<string>(pathKey([]));
const treeRef = ref<HTMLElement | null>(null);
let lastEmitted: string | null = null;

const hasDocument = computed(() => props.modelValue.trim() !== "");
const editable = computed(() => hasDocument.value && parseError.value === null);

function syncFromText(text: string): void {
    if (text === lastEmitted) return;
    if (text.trim() === "") {
        parseError.value = null;
        return;
    }
    const parsed = parseLenient(text);
    if (!parsed.ok) {
        parseError.value = parsed.error;
        return;
    }
    parseError.value = null;
    if (stringify(parsed.value) !== stringify(root.value)) {
        history.record(t("typegen.editor.step.text", "Edited as text"), parsed.value);
        root.value = history.current;
        tick.value += 1;
    }
}
watch(() => props.modelValue, syncFromText, { immediate: true });

function commit(label: string, next: Json): void {
    history.record(label, next);
    root.value = history.current;
    tick.value += 1;
    lastEmitted = stringify(root.value);
    emit("update:modelValue", lastEmitted);
}

function applyEdit(label: string, result: EditResult): void {
    if (!result.ok) {
        notice.value = { kind: "warning", text: result.reason };
        return;
    }
    commit(label, result.root);
    selected.value = result.path;
    focusedId.value = pathKey(result.path);
    for (let depth = 0; depth < result.path.length; depth += 1) expanded.value.add(pathKey(result.path.slice(0, depth)));
    expanded.value = new Set(expanded.value);
}

const canUndo = computed(() => (tick.value, history.canUndo));
const canRedo = computed(() => (tick.value, history.canRedo));
const undoLabel = computed(() => (tick.value, history.undoLabel));
const redoLabel = computed(() => (tick.value, history.redoLabel));
const steps = computed(() => (tick.value, history.list));

function undo(): void {
    root.value = history.undo();
    tick.value += 1;
    lastEmitted = stringify(root.value);
    emit("update:modelValue", lastEmitted);
}
function redo(): void {
    root.value = history.redo();
    tick.value += 1;
    lastEmitted = stringify(root.value);
    emit("update:modelValue", lastEmitted);
}
function jump(index: number): void {
    root.value = history.jump(index);
    tick.value += 1;
    lastEmitted = stringify(root.value);
    emit("update:modelValue", lastEmitted);
}

/* ------------------------------ the tree ------------------------------ */

const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));
const flat = computed(() =>
    flatten(root.value, expanded.value, matcher.value.active && matcher.value.error === null ? matcher.value.test : null),
);
const rows = computed(() => (editable.value ? flat.value.rows : []));
const corpus = computed(() => flatten(root.value, new Set(), null, 400).rows.map((row) => `${row.key ?? ""} ${previewOf(row.value)}`).join("\n"));
const searchSummary = computed(() =>
    matcher.value.active
        ? t("typegen.editor.search.summary", { count: flat.value.matchCount }, "{count} matching entries, with the keys that lead to them.")
        : "",
);

function toggle(row: TreeRow): void {
    const next = new Set(expanded.value);
    if (next.has(row.id)) next.delete(row.id);
    else next.add(row.id);
    expanded.value = next;
}
function expandAll(): void {
    const next = new Set<string>();
    const walk = (value: Json, path: Path): void => {
        if (value !== null && typeof value === "object") {
            next.add(pathKey(path));
            for (const [key, child] of Object.entries(value)) walk(child, [...path, Array.isArray(value) ? Number(key) : key]);
        }
    };
    walk(root.value, []);
    expanded.value = next;
}
function collapseAll(): void {
    expanded.value = new Set([pathKey([])]);
}

function select(row: TreeRow): void {
    selected.value = row.path;
    focusedId.value = row.id;
}

/** Arrow keys walk the tree; left and right fold and unfold, as in any tree control. */
function onRowKey(event: KeyboardEvent, row: TreeRow, index: number): void {
    if ((event.target as HTMLElement).closest("input, select, button")) return;
    const move = (to: number): void => {
        const target = rows.value[Math.max(0, Math.min(rows.value.length - 1, to))];
        if (!target) return;
        focusedId.value = target.id;
        selected.value = target.path;
        void nextTick(() => (treeRef.value?.querySelector(`[data-row-id='${CSS.escape(target.id)}']`) as HTMLElement | null)?.focus());
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "ArrowRight" && row.childCount > 0 && !row.expanded) toggle(row);
    else if (event.key === "ArrowLeft" && row.expanded && row.childCount > 0) toggle(row);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(rows.value.length - 1);
    else return;
    event.preventDefault();
}

const keyLabel = (row: TreeRow): string => (row.key === null ? t("typegen.editor.root", "Document") : String(row.key));
const isObjectKey = (row: TreeRow): boolean => typeof row.key === "string";

function renameRow(row: TreeRow, event: Event): void {
    const input = event.target as HTMLInputElement;
    const result = renameKey(root.value, row.path, input.value);
    if (!result.ok) input.value = String(row.key);
    applyEdit(t("typegen.editor.step.rename", { name: input.value }, "Rename key to {name}"), result);
}
function retypeRow(row: TreeRow, event: Event): void {
    const kind = (event.target as HTMLSelectElement).value as JsonKind;
    commit(t("typegen.editor.step.retype", { kind }, "Change type to {kind}"), setAt(root.value, row.path, retype(row.value, kind)));
}
function setScalar(row: TreeRow, value: Json): void {
    commit(t("typegen.editor.step.value", "Edit value"), setAt(root.value, row.path, value));
}
function setNumber(row: TreeRow, event: Event): void {
    const input = event.target as HTMLInputElement;
    const parsed = Number(input.value);
    if (input.value.trim() === "" || !Number.isFinite(parsed)) {
        input.value = String(row.value);
        notice.value = { kind: "warning", text: t("typegen.editor.badNumber", "That is not a number, so the value was not changed.") };
        return;
    }
    setScalar(row, parsed);
}
function addTo(row: TreeRow, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const kind = select.value as JsonKind;
    select.value = "";
    if (kind) applyEdit(t("typegen.editor.step.add", { kind }, "Add {kind}"), addChild(root.value, row.path, kind));
}
const duplicateRow = (row: TreeRow): void => applyEdit(t("typegen.editor.step.duplicate", "Duplicate"), duplicateAt(root.value, row.path));
const moveRow = (row: TreeRow, delta: -1 | 1): void => applyEdit(t("typegen.editor.step.move", "Move"), moveAt(root.value, row.path, delta));
function deleteRow(row: TreeRow): void {
    if (row.path.length === 0) return;
    commit(t("typegen.editor.step.delete", "Delete"), removeAt(root.value, row.path));
    selected.value = row.path.slice(0, -1);
    focusedId.value = pathKey(selected.value);
}
const canMove = (row: TreeRow, delta: -1 | 1): boolean => {
    const last = row.path[row.path.length - 1];
    if (last === undefined) return false;
    const parent = getAt(root.value, row.path.slice(0, -1));
    if (Array.isArray(parent)) return (last as number) + delta >= 0 && (last as number) + delta < parent.length;
    if (parent !== null && typeof parent === "object" && parent !== undefined) {
        const index = Object.keys(parent).indexOf(last as string);
        return index + delta >= 0 && index + delta < Object.keys(parent).length;
    }
    return false;
};

/* ------------------------------ the table ------------------------------ */

const tablePath = computed<Path>(() => {
    if (tableFor(getAt(root.value, selected.value))) return selected.value;
    return [];
});
const table = computed(() => tableFor(getAt(root.value, tablePath.value)));

function setCell(rowIndex: number, column: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    const rowPath = [...tablePath.value, rowIndex];
    const current = getAt(root.value, [...rowPath, column]);
    let value: Json;
    if (target.type === "checkbox") value = target.checked;
    else if (target.type === "number") {
        const parsed = Number(target.value);
        if (target.value.trim() === "" || !Number.isFinite(parsed)) {
            notice.value = { kind: "warning", text: t("typegen.editor.badNumber", "That is not a number, so the value was not changed.") };
            target.value = String(current ?? "");
            return;
        }
        value = parsed;
    } else value = target.value;
    commit(t("typegen.editor.step.cell", { column }, "Edit {column}"), setProperty(root.value, rowPath, column, value));
}

/* ------------------------------ validation ------------------------------ */

const schema = computed<{ ok: true; value: unknown } | { ok: false; error: string } | null>(() => {
    if (props.schemaText.trim() === "") return null;
    try {
        return { ok: true, value: JSON.parse(props.schemaText) as unknown };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
});
const issues = computed(() => (schema.value?.ok && editable.value ? validateAgainstSchema(root.value, schema.value.value) : []));

function revealPointer(pointer: string): void {
    const path: (string | number)[] = [];
    let node: Json | undefined = root.value;
    for (const part of pointer.split("/").slice(1)) {
        const segment = part.replace(/~1/g, "/").replace(/~0/g, "~");
        const key: string | number = Array.isArray(node) ? Number(segment) : segment;
        path.push(key);
        node = node !== null && typeof node === "object" ? (Array.isArray(node) ? node[key as number] : node[key as string]) : undefined;
    }
    const next = new Set(expanded.value);
    for (let depth = 0; depth < path.length; depth += 1) next.add(pathKey(path.slice(0, depth)));
    expanded.value = next;
    selected.value = path;
    focusedId.value = pathKey(path);
    query.value = "";
    view.value = "tree";
}

/* ------------------------------ files and transforms ------------------------------ */

const fileInput = ref<HTMLInputElement | null>(null);
const schemaInput = ref<HTMLInputElement | null>(null);

async function importFile(event: Event, asSchema: boolean): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_INPUT_CHARS * 2) {
        notice.value = { kind: "error", text: t("typegen.editor.fileTooBig", "That file is larger than the editor accepts, so it was not opened.") };
        return;
    }
    const text = await file.text();
    if (asSchema) {
        emit("update:schemaText", text);
        return;
    }
    const parsed = parseLenient(text);
    if (!parsed.ok) {
        notice.value = { kind: "error", text: t("typegen.editor.importFailed", { reason: parsed.error }, "That file is not valid JSON: {reason}") };
        return;
    }
    commit(t("typegen.editor.step.import", { name: file.name }, "Open {name}"), parsed.value);
    expanded.value = new Set([pathKey([])]);
    selected.value = [];
    notice.value = parsed.repaired
        ? { kind: "info", text: t("typegen.editor.repaired", "Comments, trailing commas or a byte order mark were removed so the file could be read as JSON.") }
        : null;
}

function startDocument(kind: "object" | "array"): void {
    commit(t("typegen.editor.step.new", "New document"), defaultFor(kind));
    expanded.value = new Set([pathKey([])]);
}

function saveFile(): void {
    const url = URL.createObjectURL(new Blob([stringify(root.value)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "document.json";
    anchor.click();
    URL.revokeObjectURL(url);
}
async function copyDocument(): Promise<void> {
    try {
        await navigator.clipboard.writeText(stringify(root.value));
        notice.value = { kind: "success", text: t("typegen.editor.copied", "Copied the document.") };
    } catch {
        notice.value = { kind: "error", text: t("typegen.editor.noClipboard", "The clipboard is not available here. Use Save instead.") };
    }
}

const sortKeys = (): void => commit(t("typegen.editor.step.sort", "Sort keys"), sortKeysDeep(root.value));
const dropNulls = (): void => commit(t("typegen.editor.step.nulls", "Remove nulls"), dropNullsDeep(root.value));

const kindNames = computed<Record<JsonKind, string>>(() => ({
    object: t("typegen.kind.object", "Object"),
    array: t("typegen.kind.array", "Array"),
    string: t("typegen.kind.string", "String"),
    number: t("typegen.kind.number", "Number"),
    boolean: t("typegen.kind.boolean", "Boolean"),
    null: t("typegen.kind.null", "Null"),
}));
const typeItems = computed(() => JSON_KINDS.map((kind) => ({ kind, title: kindNames.value[kind] })));
const kindTitle = (kind: JsonKind): string => typeItems.value.find((item) => item.kind === kind)?.title ?? kind;
</script>

<template>
    <section class="wl-je" data-test="json-editor" :aria-label="t('typegen.editor.label', 'JSON editor')">
        <VAlert v-if="notice" :type="notice.kind" variant="tonal" closable role="status" @click:close="notice = null">{{ notice.text }}</VAlert>

        <div class="wl-je__bar" role="toolbar" :aria-label="t('typegen.editor.toolbar', 'Editor actions')">
            <VBtn variant="text" :prepend-icon="mdiUndo" :disabled="!canUndo" data-test="je-undo" @click="undo">{{ t("typegen.editor.undo", "Undo") }}</VBtn>
            <VBtn variant="text" :prepend-icon="mdiRedo" :disabled="!canRedo" data-test="je-redo" @click="redo">{{ t("typegen.editor.redo", "Redo") }}</VBtn>
            <span class="wl-je__hint" data-test="je-history-hint">
                <template v-if="undoLabel">{{ t("typegen.editor.undoNext", { step: undoLabel }, "Undo takes back: {step}.") }}</template>
                <template v-else>{{ t("typegen.editor.undoNone", "Nothing to undo yet.") }}</template>
                <template v-if="redoLabel"> {{ t("typegen.editor.redoNext", { step: redoLabel }, "Redo brings back: {step}.") }}</template>
            </span>
            <VBtn variant="text" :prepend-icon="mdiFolderOpenOutline" @click="fileInput?.click()">{{ t("typegen.editor.open", "Open file") }}</VBtn>
            <VBtn variant="text" :prepend-icon="mdiDownload" :disabled="!editable" @click="saveFile">{{ t("typegen.editor.save", "Save") }}</VBtn>
            <VBtn variant="text" :prepend-icon="mdiContentCopy" :disabled="!editable" @click="copyDocument">{{ t("typegen.editor.copy", "Copy") }}</VBtn>
            <VBtn variant="text" :prepend-icon="mdiSortAlphabeticalAscending" :disabled="!editable" @click="sortKeys">{{ t("typegen.editor.sort", "Sort keys") }}</VBtn>
            <VBtn variant="text" :disabled="!editable" @click="dropNulls">{{ t("typegen.editor.dropNulls", "Remove nulls") }}</VBtn>
            <VBtn variant="text" :prepend-icon="mdiUnfoldMoreHorizontal" :disabled="!editable" @click="expandAll">{{ t("typegen.editor.expandAll", "Expand all") }}</VBtn>
            <VBtn variant="text" :prepend-icon="mdiUnfoldLessHorizontal" :disabled="!editable" @click="collapseAll">{{ t("typegen.editor.collapseAll", "Collapse all") }}</VBtn>
            <VBtn variant="text" :disabled="steps.length < 2" :aria-expanded="showHistory ? 'true' : 'false'" @click="showHistory = !showHistory">{{ t("typegen.editor.history", "History") }}</VBtn>
            <VBtnToggle v-model="view" mandatory variant="outlined" divided density="compact" :aria-label="t('typegen.editor.view', 'View')">
                <VBtn value="tree" :prepend-icon="mdiFileTreeOutline">{{ t("typegen.editor.view.tree", "Tree") }}</VBtn>
                <VBtn value="table" :prepend-icon="mdiTable">{{ t("typegen.editor.view.table", "Table") }}</VBtn>
            </VBtnToggle>
            <input ref="fileInput" class="wl-je__file" type="file" accept=".json,.jsonc,application/json" tabindex="-1" aria-hidden="true" @change="importFile($event, false)" />
            <input ref="schemaInput" class="wl-je__file" type="file" accept=".json,application/schema+json,application/json" tabindex="-1" aria-hidden="true" @change="importFile($event, true)" />
        </div>

        <ol v-if="showHistory" class="wl-je__steps" :aria-label="t('typegen.editor.history', 'History')">
            <li v-for="step in steps" :key="step.index">
                <button type="button" :aria-current="step.active ? 'step' : undefined" :class="{ 'is-active': step.active }" @click="jump(step.index)">{{ step.label }}</button>
            </li>
        </ol>

        <ConfigSearchField
            v-model="query"
            v-model:regex="regex"
            v-model:flags="flags"
            :label="t('typegen.editor.search', 'Search keys and values')"
            :sample="corpus"
            :summary="searchSummary"
        />

        <div class="wl-je__schema" data-test="je-schema">
            <span v-if="schema === null" class="wl-je__hint">{{ t("typegen.editor.schema.none", "No JSON Schema loaded, so nothing is being validated.") }}</span>
            <span v-else-if="!schema.ok" class="wl-je__bad" role="alert">{{ t("typegen.editor.schema.broken", { reason: schema.error }, "The schema is not valid JSON: {reason}") }}</span>
            <span v-else-if="issues.length === 0" class="wl-je__ok" role="status">{{ t("typegen.editor.schema.ok", "The document satisfies the schema.") }}</span>
            <span v-else class="wl-je__bad" role="status">{{ t("typegen.editor.schema.issues", { count: issues.length }, "{count} problems against the schema.") }}</span>
            <VBtn size="small" variant="text" @click="schemaInput?.click()">{{ t("typegen.editor.schema.load", "Load schema file") }}</VBtn>
            <VBtn v-if="schema !== null" size="small" variant="text" @click="emit('update:schemaText', '')">{{ t("typegen.editor.schema.clear", "Clear schema") }}</VBtn>
        </div>
        <ul v-if="issues.length > 0" class="wl-je__issues" :aria-label="t('typegen.editor.schema.list', 'Schema problems')">
            <li v-for="(issue, index) in issues.slice(0, 50)" :key="index">
                <button type="button" @click="revealPointer(issue.pointer)"><code>{{ issue.pointer || "/" }}</code> {{ issue.message }}</button>
            </li>
        </ul>

        <VAlert v-if="parseError !== null" type="error" variant="tonal" role="alert" data-test="je-parse-error">
            {{ t("typegen.editor.parseError", { reason: parseError }, "The document text is not valid JSON, so the editor is paused: {reason}") }}
        </VAlert>

        <div v-else-if="!hasDocument" class="wl-je__empty" data-test="je-empty">
            <p>{{ t("typegen.editor.empty", "There is no document yet. Open a file, paste JSON in Generate, or start a new one.") }}</p>
            <div class="wl-je__bar">
                <VBtn variant="tonal" @click="startDocument('object')">{{ t("typegen.editor.newObject", "New object") }}</VBtn>
                <VBtn variant="tonal" @click="startDocument('array')">{{ t("typegen.editor.newArray", "New array") }}</VBtn>
            </div>
        </div>

        <template v-else-if="view === 'tree'">
            <ul ref="treeRef" class="wl-je__tree" role="tree" :aria-label="t('typegen.editor.tree', 'JSON tree')" data-test="je-tree">
                <li
                    v-for="(row, index) in rows"
                    :key="row.id"
                    class="wl-je__row"
                    :class="{ 'is-selected': pathKey(selected) === row.id }"
                    role="treeitem"
                    :data-row-id="row.id"
                    :aria-level="row.depth + 1"
                    :aria-expanded="row.childCount > 0 ? (row.expanded ? 'true' : 'false') : undefined"
                    :aria-selected="pathKey(selected) === row.id ? 'true' : 'false'"
                    :tabindex="focusedId === row.id ? 0 : -1"
                    :style="{ paddingInlineStart: `${row.depth * 20 + 4}px` }"
                    @click="select(row)"
                    @keydown="onRowKey($event, row, index)"
                >
                    <button v-if="row.childCount > 0" type="button" class="wl-je__icon" :aria-label="row.expanded ? t('typegen.editor.fold', 'Fold') : t('typegen.editor.unfold', 'Unfold')" @click.stop="toggle(row)">
                        <VIcon :icon="row.expanded ? mdiChevronDown : mdiChevronRight" size="18" />
                    </button>
                    <span v-else class="wl-je__icon" aria-hidden="true"></span>

                    <input
                        v-if="isObjectKey(row)"
                        class="wl-je__key"
                        type="text"
                        :value="row.key"
                        :aria-label="t('typegen.editor.keyOf', { path: pointerOf(row.path) }, 'Key at {path}')"
                        spellcheck="false"
                        @change="renameRow(row, $event)"
                    />
                    <span v-else class="wl-je__key wl-je__key--fixed">{{ keyLabel(row) }}</span>

                    <select class="wl-je__kind" :value="row.kind" :aria-label="t('typegen.editor.kindOf', { path: pointerOf(row.path) || '/' }, 'Type at {path}')" @change="retypeRow(row, $event)">
                        <option v-for="item in typeItems" :key="item.kind" :value="item.kind">{{ item.title }}</option>
                    </select>

                    <input
                        v-if="row.kind === 'string'"
                        class="wl-je__value"
                        type="text"
                        :value="row.value as string"
                        :aria-label="t('typegen.editor.valueOf', { path: pointerOf(row.path) || '/' }, 'Value at {path}')"
                        spellcheck="false"
                        @change="setScalar(row, ($event.target as HTMLInputElement).value)"
                    />
                    <input
                        v-else-if="row.kind === 'number'"
                        class="wl-je__value"
                        type="number"
                        step="any"
                        :value="row.value as number"
                        :aria-label="t('typegen.editor.valueOf', { path: pointerOf(row.path) || '/' }, 'Value at {path}')"
                        @change="setNumber(row, $event)"
                    />
                    <input
                        v-else-if="row.kind === 'boolean'"
                        class="wl-je__check"
                        type="checkbox"
                        role="switch"
                        :checked="row.value === true"
                        :aria-label="t('typegen.editor.valueOf', { path: pointerOf(row.path) || '/' }, 'Value at {path}')"
                        @change="setScalar(row, ($event.target as HTMLInputElement).checked)"
                    />
                    <span v-else class="wl-je__summary">{{ previewOf(row.value) }}</span>

                    <span class="wl-je__actions">
                        <select v-if="row.kind === 'object' || row.kind === 'array'" class="wl-je__add" :aria-label="t('typegen.editor.addTo', { path: pointerOf(row.path) || '/' }, 'Add a child to {path}')" @change="addTo(row, $event)">
                            <option value="">{{ t("typegen.editor.add", "Add…") }}</option>
                            <option v-for="item in typeItems" :key="item.kind" :value="item.kind">{{ item.title }}</option>
                        </select>
                        <template v-if="row.path.length > 0">
                            <button type="button" class="wl-je__icon" :disabled="!canMove(row, -1)" :aria-label="t('typegen.editor.moveUp', 'Move up')" :title="canMove(row, -1) ? t('typegen.editor.moveUp', 'Move up') : t('typegen.editor.atEdge', 'Already at the edge.')" @click.stop="moveRow(row, -1)"><VIcon :icon="mdiChevronUp" size="18" /></button>
                            <button type="button" class="wl-je__icon" :disabled="!canMove(row, 1)" :aria-label="t('typegen.editor.moveDown', 'Move down')" :title="canMove(row, 1) ? t('typegen.editor.moveDown', 'Move down') : t('typegen.editor.atEdge', 'Already at the edge.')" @click.stop="moveRow(row, 1)"><VIcon :icon="mdiChevronDown" size="18" /></button>
                            <button type="button" class="wl-je__icon" :aria-label="t('typegen.editor.duplicateRow', 'Duplicate')" @click.stop="duplicateRow(row)"><VIcon :icon="mdiContentDuplicate" size="18" /></button>
                            <button type="button" class="wl-je__icon" :aria-label="t('typegen.editor.deleteRow', 'Delete')" @click.stop="deleteRow(row)"><VIcon :icon="mdiDelete" size="18" /></button>
                        </template>
                    </span>
                </li>
            </ul>
            <p v-if="flat.truncated" class="wl-je__hint" role="status">{{ t("typegen.editor.truncated", "Showing the first 2000 rows. Fold sections or search to reach the rest.") }}</p>
            <p v-else-if="rows.length === 0 && matcher.active" class="wl-je__hint" role="status">{{ matcher.error ?? t("typegen.editor.noMatch", "Nothing matches that search.") }}</p>
        </template>

        <div v-else class="wl-je__tablewrap" data-test="je-table">
            <template v-if="table">
                <p class="wl-je__hint">{{ t("typegen.editor.table.of", { path: pointerOf(tablePath) || '/' }, "Rows of {path}. Select another array of objects in the tree to show it here.") }}</p>
                <table class="wl-je__table">
                    <thead>
                        <tr>
                            <th scope="col">#</th>
                            <th v-for="column in table.columns" :key="column" scope="col">{{ column }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in table.rows" :key="row.index">
                            <th scope="row">{{ row.index }}</th>
                            <td v-for="(cell, at) in row.cells" :key="at">
                                <input
                                    v-if="cell === undefined || typeof cell === 'string'"
                                    type="text"
                                    :value="cell ?? ''"
                                    :aria-label="`${table.columns[at]} ${row.index}`"
                                    spellcheck="false"
                                    @change="setCell(row.index, table.columns[at] as string, $event)"
                                />
                                <input
                                    v-else-if="typeof cell === 'number'"
                                    type="number"
                                    step="any"
                                    :value="cell"
                                    :aria-label="`${table.columns[at]} ${row.index}`"
                                    @change="setCell(row.index, table.columns[at] as string, $event)"
                                />
                                <input
                                    v-else-if="typeof cell === 'boolean'"
                                    type="checkbox"
                                    role="switch"
                                    :checked="cell"
                                    :aria-label="`${table.columns[at]} ${row.index}`"
                                    @change="setCell(row.index, table.columns[at] as string, $event)"
                                />
                                <span v-else class="wl-je__summary">{{ kindTitle(kindOf(cell)) }} {{ previewOf(cell) }}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </template>
            <p v-else class="wl-je__hint" data-test="je-no-table">{{ t("typegen.editor.table.none", "The table shows an array of objects. This document has none selected, so use the tree, or select an array of objects there first.") }}</p>
        </div>
    </section>
</template>

<style scoped>
.wl-je { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.wl-je__bar { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; }
.wl-je__file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.wl-je__hint { font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); margin: 0; }
.wl-je__ok { color: rgb(var(--v-theme-primary)); font-size: 13px; }
.wl-je__bad { color: rgb(var(--v-theme-error)); font-size: 13px; }
.wl-je__schema { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.wl-je__issues { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; max-height: 160px; overflow: auto; }
.wl-je__issues button, .wl-je__steps button { background: none; border: 0; padding: 4px 6px; text-align: left; cursor: pointer; color: inherit; font: inherit; border-radius: 6px; }
.wl-je__issues button:hover, .wl-je__steps button:hover { background: rgba(var(--v-theme-primary), 0.08); }
.wl-je__steps { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
.wl-je__steps .is-active { background: rgba(var(--v-theme-primary), 0.16); }
.wl-je__empty { padding: 16px; border-radius: var(--md-sys-shape-corner-medium, 12px); background: rgb(var(--v-theme-surface-container-low, var(--v-theme-surface))); }
.wl-je__tree { margin: 0; padding: 4px; list-style: none; max-height: 640px; overflow: auto; border-radius: var(--md-sys-shape-corner-medium, 12px); background: rgb(var(--v-theme-surface-container-lowest, var(--v-theme-background))); }
.wl-je__row { display: flex; align-items: center; gap: 6px; min-height: 36px; padding-block: 2px; border-radius: 8px; outline: none; }
.wl-je__row:hover { background: rgba(var(--v-theme-on-surface), 0.04); }
.wl-je__row.is-selected { background: rgba(var(--v-theme-primary), 0.1); }
.wl-je__row:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
.wl-je__icon { flex: 0 0 auto; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; background: none; border: 0; border-radius: 50%; color: inherit; cursor: pointer; }
.wl-je__icon:hover:not(:disabled) { background: rgba(var(--v-theme-on-surface), 0.08); }
.wl-je__icon:disabled { opacity: 0.35; cursor: default; }
.wl-je__icon:focus-visible, .wl-je__key:focus-visible, .wl-je__value:focus-visible, .wl-je__kind:focus-visible, .wl-je__add:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 1px; }
.wl-je__key, .wl-je__value, .wl-je__kind, .wl-je__add, .wl-je__table input[type="text"], .wl-je__table input[type="number"] { font: 13px "Roboto Mono", monospace; color: inherit; background: transparent; border: 1px solid rgba(var(--v-theme-outline), 0.5); border-radius: 6px; padding: 3px 6px; min-width: 0; }
.wl-je__key { width: 150px; flex: 0 0 auto; }
.wl-je__key--fixed { border-color: transparent; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-je__value { flex: 1 1 160px; }
.wl-je__summary { flex: 1 1 160px; color: rgb(var(--v-theme-on-surface-variant)); font: 13px "Roboto Mono", monospace; }
.wl-je__check { width: 20px; height: 20px; }
.wl-je__actions { display: inline-flex; align-items: center; gap: 2px; margin-inline-start: auto; }
.wl-je__tablewrap { overflow: auto; }
.wl-je__table { border-collapse: collapse; width: 100%; }
.wl-je__table th, .wl-je__table td { border-bottom: 1px solid rgba(var(--v-theme-outline), 0.3); padding: 4px 6px; text-align: left; font-size: 13px; }
@media (max-width: 720px) {
    .wl-je__row { flex-wrap: wrap; }
    .wl-je__key { width: 110px; }
}
@media (prefers-reduced-motion: reduce) { .wl-je__row { transition: none; } }
</style>
