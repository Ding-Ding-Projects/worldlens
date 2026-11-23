<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import NbtValueEditor from "./NbtValueEditor.vue";
import type { DocumentInfo, NbtEditorBridge, NodeView } from "./nbtEditorBridge.js";
import { fieldInfo, humanizeKey } from "./nbtFieldCatalogue.js";

/**
 * One compound (or list) as labelled fields with tailored controls, nested groups indented
 * beneath it, up to a few levels deep. Used by the item editor, where an item is a handful of
 * values plus groups such as `components`, `minecraft:enchantments` and its `levels`.
 *
 * List members have no names, so they are labelled by position ("Line 1" for text lines,
 * "Entry 1" otherwise). Deeper than `maxDepth`, a group is counted and left to the tree.
 */
const props = withDefaults(
    defineProps<{
        bridge: NbtEditorBridge;
        doc: DocumentInfo;
        node: NodeView;
        path: readonly string[];
        revision: number;
        depth?: number | undefined;
        maxDepth?: number | undefined;
        disabled?: boolean | undefined;
    }>(),
    { depth: 0, maxDepth: 3, disabled: false },
);
const emit = defineEmits<{ commit: [id: number, text: string]; flip: [id: number, on: boolean] }>();
const { t } = useI18n();
const level = computed(() => props.depth ?? 0);
const deepest = computed(() => props.maxDepth ?? 3);

const members = shallowRef<readonly NodeView[]>([]);
const failure = ref<string | null>(null);

async function load(): Promise<void> {
    const page = await props.bridge.children(props.doc.docId, props.node.id, 0, 500);
    if (!page.ok) {
        failure.value = page.message;
        return;
    }
    failure.value = null;
    members.value = page.value.nodes;
}
watch(
    () => [props.node.id, props.revision] as const,
    () => void load(),
    { immediate: true },
);

const isGroup = (n: NodeView) => n.kind === "compound" || n.kind === "list";
const isArray = (n: NodeView) =>
    n.kind === "byteArray" || n.kind === "intArray" || n.kind === "longArray";
const childPath = () => [...props.path, props.node.name ?? ""];

function labelOf(n: NodeView, i: number): string {
    if (n.name !== null && n.name !== "")
        return fieldInfo(n, childPath()).label || humanizeKey(n.name);
    return n.kind === "string"
        ? t("nbt.group.line", { n: i + 1 }, "Line {n}")
        : t("nbt.group.entry", { n: i + 1 }, "Entry {n}");
}
</script>

<template>
    <div class="wl-group" :class="`wl-group--d${level}`">
        <p v-if="failure" class="wl-group__note wl-group__note--error" role="alert">
            {{ failure }}
        </p>
        <template v-for="(m, i) in members" :key="m.id">
            <div v-if="!isGroup(m) && !isArray(m)" class="wl-group__row" :data-field="m.name ?? ''">
                <div class="wl-group__label">
                    <span class="wl-group__name">{{ labelOf(m, i) }}</span>
                    <span v-if="m.name" class="wl-group__key">{{ m.name }}</span>
                </div>
                <NbtValueEditor
                    :node="m"
                    :label="labelOf(m, i)"
                    :info="fieldInfo(m, childPath())"
                    :disabled="disabled"
                    @commit="(text: string) => emit('commit', m.id, text)"
                    @flip="(on: boolean) => emit('flip', m.id, on)"
                />
            </div>
            <div v-else-if="isArray(m)" class="wl-group__row">
                <span class="wl-group__name">{{ labelOf(m, i) }}</span>
                <span class="wl-group__note">{{ m.summary }}</span>
            </div>
            <section v-else class="wl-group__nested" :aria-label="labelOf(m, i)">
                <h4 class="wl-group__title">{{ labelOf(m, i) }}</h4>
                <NbtGroupFields
                    v-if="level + 1 < deepest"
                    :bridge="bridge"
                    :doc="doc"
                    :node="m"
                    :path="childPath()"
                    :revision="revision"
                    :depth="level + 1"
                    :max-depth="deepest"
                    :disabled="disabled"
                    @commit="(id: number, text: string) => emit('commit', id, text)"
                    @flip="(id: number, on: boolean) => emit('flip', id, on)"
                />
                <p v-else class="wl-group__note">
                    {{ t("nbt.group.deeper", { summary: m.summary }, "{summary}, in the tree.") }}
                </p>
            </section>
        </template>
        <p v-if="members.length === 0 && !failure" class="wl-group__note">
            {{ t("nbt.group.empty", "Empty.") }}
        </p>
    </div>
</template>

<style scoped>
.wl-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.wl-group--d1,
.wl-group--d2,
.wl-group--d3 {
    padding-inline-start: 12px;
    border-inline-start: 2px solid rgba(var(--v-theme-on-surface), 0.08);
}
.wl-group__row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
}
.wl-group__label {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1 1 160px;
}
.wl-group__name {
    font:
        400 14px/20px Roboto,
        sans-serif;
}
.wl-group__key {
    font:
        400 11px/14px "Roboto Mono",
        monospace;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-group__title {
    margin: 8px 0 2px;
    font:
        500 13px/18px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-group__note {
    margin: 0;
    font:
        400 12px/16px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-group__note--error {
    color: rgb(var(--v-theme-error));
}
</style>
