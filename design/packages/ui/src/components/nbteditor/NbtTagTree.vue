<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiChevronDown, mdiChevronRight, mdiDotsVertical } from "@mdi/js";
import { VBtn, VIcon, VList, VListItem, VMenu } from "vuetify/components";
import NbtValueEditor from "./NbtValueEditor.vue";
import { KIND_CHIP, KIND_HUE, isContainer, treeKeyAction, visibleWindow, rowLabel, type Row, type TagAction, type TreeCache } from "./nbtEditorModel.js";
import type { NodeView } from "./nbtEditorBridge.js";

/**
 * The tag tree: a virtualised list that follows the ARIA tree pattern.
 *
 * Only the rows in view (plus a margin) are in the document, so a chunk with a hundred
 * thousand tags scrolls as smoothly as one with ten. `aria-posinset` and `aria-setsize` keep
 * screen readers correct about the rows that are not rendered. One row is the tab stop; the
 * arrow keys move between rows, and a row's own controls are reachable with Tab.
 */
const props = defineProps<{
    rows: readonly Row[];
    cache: TreeCache;
    selectedId: number | null;
    matches: ReadonlySet<number>;
    disabled?: boolean | undefined;
}>();

const emit = defineEmits<{
    select: [id: number];
    toggle: [id: number];
    commit: [id: number, text: string];
    flip: [id: number, on: boolean];
    "edit-array": [id: number];
    more: [parentId: number];
    action: [name: TagAction, id: number];
}>();

const { t } = useI18n();
/** Taller on a narrow screen so every row control is a full-size touch target. */
const rowHeight = ref(38);
const NARROW = "(max-width: 720px)";
function measureRows(): void {
    rowHeight.value = typeof matchMedia === "function" && matchMedia(NARROW).matches ? 48 : 38;
}

const scroller = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewport = ref(600);
const focusIndex = ref(0);
const editors = new Map<number, InstanceType<typeof NbtValueEditor>>();

const windowed = computed(() => visibleWindow(props.rows.length, scrollTop.value, viewport.value, rowHeight.value));
const slice = computed(() => props.rows.slice(windowed.value.start, windowed.value.end).map((row, i) => ({ row, index: windowed.value.start + i })));

let observer: ResizeObserver | null = null;
onMounted(() => {
    measureRows();
    if (scroller.value !== null) {
        viewport.value = scroller.value.clientHeight || 600;
        if (typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(() => {
                measureRows();
                viewport.value = scroller.value?.clientHeight || 600;
            });
            observer.observe(scroller.value);
        }
    }
});
onBeforeUnmount(() => observer?.disconnect());

function onScroll(): void {
    scrollTop.value = scroller.value?.scrollTop ?? 0;
}

function node(id: number): NodeView | undefined {
    return props.cache.nodes.get(id);
}

/** Keep the roving tab stop on the selected row when the selection changes from outside. */
watch(
    () => props.selectedId,
    (id) => {
        if (id === null) return;
        const at = props.rows.findIndex((r) => r.type === "node" && r.id === id);
        if (at >= 0) focusIndex.value = at;
    },
    { immediate: true },
);

function reveal(index: number): void {
    const el = scroller.value;
    if (el === null) return;
    const top = index * rowHeight.value;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight.value > el.scrollTop + el.clientHeight) el.scrollTop = top + rowHeight.value - el.clientHeight;
    scrollTop.value = el.scrollTop;
}

async function focusRow(index: number): Promise<void> {
    focusIndex.value = Math.max(0, Math.min(props.rows.length - 1, index));
    reveal(focusIndex.value);
    await nextTick();
    scroller.value?.querySelector<HTMLElement>(`[data-row-index="${focusIndex.value}"]`)?.focus();
    const row = props.rows[focusIndex.value];
    if (row?.type === "node") emit("select", row.id);
}

function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [role='menu']") !== null) return;
    const action = treeKeyAction(props.rows, focusIndex.value, event.key, event.ctrlKey || event.metaKey, (id) => props.cache.parent.get(id) ?? null);
    if (action === null) return;
    if (props.disabled && (action.type === "remove" || action.type === "paste")) return;
    event.preventDefault();
    switch (action.type) {
        case "focus":
            void focusRow(action.index);
            break;
        case "expand":
        case "collapse":
            emit("toggle", action.id);
            break;
        case "more":
            emit("more", action.parentId);
            break;
        case "edit": {
            const n = node(action.id);
            if (n === undefined) break;
            if (n.kind === "byteArray" || n.kind === "intArray" || n.kind === "longArray") emit("edit-array", action.id);
            else if (isContainer(n.kind)) emit("toggle", action.id);
            else editors.get(action.id)?.focus();
            break;
        }
        case "remove":
            emit("action", "remove", action.id);
            break;
        case "copy":
            emit("action", "copy", action.id);
            break;
        case "paste":
            emit("action", "paste", action.id);
            break;
    }
}

function register(id: number, el: unknown): void {
    if (el === null || el === undefined) editors.delete(id);
    else editors.set(id, el as InstanceType<typeof NbtValueEditor>);
}

const ACTIONS: readonly { id: TagAction; label: string; fallback: string; container?: boolean; editsOnly?: boolean }[] = [
    { id: "add", label: "nbt.action.add", fallback: "Add tag", container: true, editsOnly: true },
    { id: "rename", label: "nbt.action.rename", fallback: "Rename", editsOnly: true },
    { id: "duplicate", label: "nbt.action.duplicate", fallback: "Duplicate", editsOnly: true },
    { id: "up", label: "nbt.action.up", fallback: "Move up", editsOnly: true },
    { id: "down", label: "nbt.action.down", fallback: "Move down", editsOnly: true },
    { id: "snbt", label: "nbt.action.snbt", fallback: "Edit as SNBT" },
    { id: "copy", label: "nbt.action.copy", fallback: "Copy as SNBT" },
    { id: "paste", label: "nbt.action.paste", fallback: "Paste SNBT here", editsOnly: true },
    { id: "remove", label: "nbt.action.remove", fallback: "Remove", editsOnly: true },
];

function actionsFor(kind: NodeView["kind"], isRoot: boolean) {
    return ACTIONS.filter((a) => (a.container !== true || isContainer(kind)) && !(isRoot && ["rename", "duplicate", "up", "down", "remove"].includes(a.id)));
}

const rootId = computed(() => {
    const first = props.rows[0];
    return first?.type === "node" ? first.id : -1;
});

defineExpose({ focusRow });
</script>

<template>
    <div
        ref="scroller"
        class="wl-nbt-tree"
        role="tree"
        :aria-label="t('nbt.tree.label', 'Tag tree')"
        @scroll.passive="onScroll"
        @keydown="onKeydown"
    >
        <div :style="{ height: `${windowed.padTop}px` }" aria-hidden="true" />
        <template v-for="{ row, index } in slice" :key="row.type === 'node' ? row.id : `more-${row.parentId}`">
            <div
                v-if="row.type === 'node' && node(row.id)"
                class="wl-nbt-row"
                :class="{ 'is-selected': selectedId === row.id, 'is-match': matches.has(row.id) }"
                role="treeitem"
                :data-row-index="index"
                :aria-level="row.level"
                :aria-posinset="row.position"
                :aria-setsize="row.setSize"
                :aria-expanded="row.hasChildren ? (row.expanded ? 'true' : 'false') : undefined"
                :aria-selected="selectedId === row.id ? 'true' : 'false'"
                :tabindex="focusIndex === index ? 0 : -1"
                :style="{ paddingInlineStart: `${8 + (row.level - 1) * 22}px`, height: `${rowHeight}px` }"
                @click="emit('select', row.id); focusIndex = index"
            >
                <button
                    v-if="row.hasChildren"
                    type="button"
                    class="wl-nbt-caret"
                    tabindex="-1"
                    :aria-label="(row.expanded ? t('nbt.tree.collapse', 'Collapse') : t('nbt.tree.expand', 'Expand')) + ' ' + rowLabel(node(row.id)!, row.position)"
                    @click.stop="emit('toggle', row.id)"
                >
                    <v-icon :icon="row.expanded ? mdiChevronDown : mdiChevronRight" size="18" />
                </button>
                <span v-else class="wl-nbt-caret wl-nbt-caret--none" aria-hidden="true" />
                <span
                    class="wl-nbt-chip"
                    :style="{ '--wl-hue': KIND_HUE[node(row.id)!.kind] }"
                    :title="node(row.id)!.listKind && node(row.id)!.listKind !== 'end' ? `${KIND_CHIP[node(row.id)!.kind]} of ${node(row.id)!.listKind}` : KIND_CHIP[node(row.id)!.kind]"
                >{{ KIND_CHIP[node(row.id)!.kind] }}</span>
                <span class="wl-nbt-name" :title="rowLabel(node(row.id)!, row.position)">{{ rowLabel(node(row.id)!, row.position) }}</span>
                <NbtValueEditor
                    :ref="(el: unknown) => register(row.id, el)"
                    :node="node(row.id)!"
                    :label="rowLabel(node(row.id)!, row.position)"
                    :disabled="disabled"
                    @commit="(text: string) => emit('commit', row.id, text)"
                    @flip="(on: boolean) => emit('flip', row.id, on)"
                    @edit-array="emit('edit-array', row.id)"
                />
                <v-menu location="bottom end">
                    <template #activator="{ props: menuProps }">
                        <v-btn
                            v-bind="menuProps"
                            :icon="mdiDotsVertical"
                            variant="text"
                            size="small"
                            density="comfortable"
                            tabindex="-1"
                            :aria-label="t('nbt.tree.actions', { name: rowLabel(node(row.id)!, row.position) }, 'Actions for {name}')"
                            @click.stop
                        />
                    </template>
                    <v-list density="compact">
                        <v-list-item
                            v-for="a in actionsFor(node(row.id)!.kind, row.id === rootId)"
                            :key="a.id"
                            :title="t(a.label, a.fallback)"
                            :disabled="!!(disabled && a.editsOnly === true)"
                            @click="emit('action', a.id, row.id)"
                        />
                    </v-list>
                </v-menu>
            </div>
            <div
                v-else-if="row.type === 'more'"
                class="wl-nbt-row wl-nbt-row--more"
                role="treeitem"
                :data-row-index="index"
                :aria-level="row.level"
                :tabindex="focusIndex === index ? 0 : -1"
                :style="{ paddingInlineStart: `${8 + (row.level - 1) * 22}px`, height: `${rowHeight}px` }"
                @click="emit('more', row.parentId); focusIndex = index"
            >
                <button type="button" class="wl-nbt-link" tabindex="-1" @click.stop="emit('more', row.parentId)">
                    {{ t('nbt.tree.more', { count: row.remaining }, 'Show {count} more') }}
                </button>
            </div>
        </template>
        <div :style="{ height: `${windowed.padBottom}px` }" aria-hidden="true" />
    </div>
</template>

<style scoped>
.wl-nbt-tree {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    border-radius: 16px;
    padding: 8px 6px;
    font: 400 13px "Roboto Mono", ui-monospace, monospace;
}
.wl-nbt-row { display: flex; align-items: center; gap: 8px; padding-inline-end: 8px; border-radius: 8px; box-sizing: border-box; }
.wl-nbt-row:hover { background: rgba(var(--v-theme-primary), 0.08); }
.wl-nbt-row.is-selected { background: rgba(var(--v-theme-primary), 0.16); }
.wl-nbt-row.is-match:not(.is-selected) { background: rgba(var(--v-theme-primary), 0.12); box-shadow: inset 3px 0 0 rgb(var(--v-theme-primary)); }
.wl-nbt-row:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: -3px; }
.wl-nbt-caret { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; color: rgb(var(--v-theme-on-surface-variant)); cursor: pointer; padding: 0; flex: none; }
.wl-nbt-caret--none { cursor: default; }
.wl-nbt-chip {
    flex: none; min-width: 58px; text-align: center; font-size: 10px; font-weight: 500; padding: 2px 6px; border-radius: 6px;
    background: color-mix(in srgb, var(--wl-hue) 24%, rgb(var(--v-theme-surface)));
    color: color-mix(in srgb, var(--wl-hue) 55%, rgb(var(--v-theme-on-surface)));
}
/* A tag name is the thing being edited, so it keeps its full width and the value box gives way.
   Only a name longer than most of the row is shortened, and then its full text is in the title. */
.wl-nbt-name { flex: 0 0 auto; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgb(var(--v-theme-on-surface)); }
.wl-nbt-link { background: none; border: 0; color: rgb(var(--v-theme-primary)); font-size: 12px; cursor: pointer; text-decoration: underline; min-height: 30px; padding: 0 4px; }
@media (prefers-reduced-motion: no-preference) { .wl-nbt-row { transition: background 0.16s; } }
@media (max-width: 720px) {
    .wl-nbt-row { flex-wrap: nowrap; }
    .wl-nbt-caret { width: 40px; height: 40px; }
    .wl-nbt-chip { min-width: 46px; }
}
</style>
