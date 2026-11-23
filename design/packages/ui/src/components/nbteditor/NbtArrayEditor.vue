<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VCard, VCardActions, VCardText, VDialog } from "vuetify/components";
import { validateScalar } from "./nbtEditorModel.js";
import type { ArrayEdit, ArrayPage, TagKind } from "./nbtEditorBridge.js";

/**
 * The grid editor for byte, int and long arrays: a page of numbered cells, each checked
 * against the array's element type, with add and remove. Arrays can hold thousands of values
 * (a chunk's block states, a heightmap), so a page is fetched at a time rather than all of it.
 */
const props = defineProps<{
    open: boolean;
    title: string;
    /** Fetches one page of values from the main process. */
    load: (offset: number, limit: number) => Promise<ArrayPage | null>;
    /** Sends one edit; resolves true when it was applied. */
    edit: (operation: ArrayEdit) => Promise<boolean>;
    disabled?: boolean | undefined;
}>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const PAGE = 128;
const offset = ref(0);
const page = ref<ArrayPage | null>(null);
const drafts = ref<string[]>([]);
const status = ref("");

const elementKind = computed<TagKind>(() => (page.value?.kind === "byteArray" ? "byte" : page.value?.kind === "longArray" ? "long" : "int"));
const total = computed(() => page.value?.total ?? 0);
const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE)));
const pageNumber = computed(() => Math.floor(offset.value / PAGE) + 1);

async function refresh(): Promise<void> {
    const result = await props.load(offset.value, PAGE);
    if (result === null) return;
    if (result.total > 0 && offset.value >= result.total) {
        offset.value = Math.max(0, (Math.ceil(result.total / PAGE) - 1) * PAGE);
        return refresh();
    }
    page.value = result;
    drafts.value = [...result.values];
}

watch(
    () => props.open,
    (open) => {
        if (open) {
            offset.value = 0;
            status.value = "";
            void refresh();
        }
    },
);

function cellError(i: number): string | null {
    const original = page.value?.values[i];
    return drafts.value[i] === original ? null : validateScalar(elementKind.value, drafts.value[i] ?? "");
}

async function commit(i: number): Promise<void> {
    if (drafts.value[i] === page.value?.values[i] || cellError(i) !== null) return;
    const ok = await props.edit({ op: "arraySet", at: offset.value + i, text: drafts.value[i] ?? "" });
    status.value = ok ? "" : t("nbt.array.refused", "That value was not accepted.");
    await refresh();
}

async function insertAt(index: number): Promise<void> {
    await props.edit({ op: "arrayInsert", at: index, text: "0" });
    await refresh();
}

async function removeAt(i: number): Promise<void> {
    await props.edit({ op: "arrayRemove", at: offset.value + i });
    await refresh();
}

async function go(delta: number): Promise<void> {
    offset.value = Math.max(0, Math.min((pages.value - 1) * PAGE, offset.value + delta * PAGE));
    await refresh();
}
</script>

<template>
    <v-dialog :model-value="open" max-width="860" scrollable @update:model-value="(v: boolean) => !v && emit('close')">
        <v-card :title="title">
            <v-card-text>
                <p class="wl-nbt-array-meta">
                    {{ t('nbt.array.meta', { count: total, kind: elementKind, from: total === 0 ? 0 : offset + 1, to: Math.min(total, offset + PAGE) }, '{count} values, {kind} each. Showing {from} to {to}.') }}
                </p>
                <p v-if="status" class="wl-nbt-array-error" role="alert">{{ status }}</p>
                <div class="wl-nbt-array-grid" role="group" :aria-label="t('nbt.array.grid', 'Array values')">
                    <div v-for="(value, i) in drafts" :key="offset + i" class="wl-nbt-cell">
                        <span class="wl-nbt-cell__index">{{ offset + i }}</span>
                        <input
                            v-model="drafts[i]"
                            class="wl-nbt-cell__input"
                            :class="{ 'is-invalid': cellError(i) !== null }"
                            :aria-label="t('nbt.array.cell', { index: offset + i }, 'Value {index}')"
                            :aria-invalid="cellError(i) !== null ? 'true' : 'false'"
                            :title="cellError(i) ?? undefined"
                            :disabled="disabled"
                            spellcheck="false"
                            autocomplete="off"
                            @keydown.enter.prevent="commit(i)"
                            @blur="commit(i)"
                        />
                        <button type="button" class="wl-nbt-cell__x" :disabled="disabled" :aria-label="t('nbt.array.remove', { index: offset + i }, 'Remove value {index}')" @click="removeAt(i)">&times;</button>
                    </div>
                </div>
            </v-card-text>
            <v-card-actions>
                <v-btn variant="text" :disabled="!!disabled" @click="insertAt(offset + drafts.length)">{{ t('nbt.array.add', 'Add a value') }}</v-btn>
                <v-btn variant="text" :disabled="pageNumber <= 1" @click="go(-1)">{{ t('nbt.array.previous', 'Previous') }}</v-btn>
                <span class="wl-nbt-array-page" aria-live="polite">{{ pageNumber }} / {{ pages }}</span>
                <v-btn variant="text" :disabled="pageNumber >= pages" @click="go(1)">{{ t('nbt.array.next', 'Next') }}</v-btn>
                <v-btn color="primary" variant="flat" @click="emit('close')">{{ t('nbt.dialog.done', 'Done') }}</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style scoped>
.wl-nbt-array-meta { margin: 0 0 8px; font-size: 13px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-nbt-array-error { margin: 0 0 8px; font-size: 13px; color: rgb(var(--v-theme-error)); }
.wl-nbt-array-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px; }
.wl-nbt-cell { display: flex; align-items: center; gap: 4px; }
.wl-nbt-cell__index { flex: none; min-width: 34px; text-align: right; font: 11px "Roboto Mono", monospace; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-nbt-cell__input { flex: 1; min-width: 0; height: 30px; border-radius: 6px; border: 1px solid rgba(var(--v-theme-on-surface), 0.28); background: transparent; color: rgb(var(--v-theme-on-surface)); padding: 0 6px; font: 13px "Roboto Mono", monospace; }
.wl-nbt-cell__input.is-invalid { border-color: rgb(var(--v-theme-error)); }
.wl-nbt-cell__input:focus-visible, .wl-nbt-cell__x:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 1px; }
.wl-nbt-cell__x { flex: none; width: 28px; height: 28px; border: 0; background: transparent; color: rgb(var(--v-theme-on-surface-variant)); cursor: pointer; font-size: 18px; border-radius: 14px; }
.wl-nbt-array-page { margin: 0 6px; font-size: 13px; }
@media (max-width: 720px) {
    .wl-nbt-array-grid { grid-template-columns: 1fr; }
    .wl-nbt-cell__input { height: 44px; }
    .wl-nbt-cell__x { width: 44px; height: 44px; }
}
</style>
