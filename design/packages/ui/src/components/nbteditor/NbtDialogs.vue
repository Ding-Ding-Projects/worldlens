<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDialog, VSelect, VSwitch, VTextField, VTextarea } from "vuetify/components";
import { KIND_CHIP, KIND_ORDER, describeChange, isArray, isContainer, rangeHint, validateScalar } from "./nbtEditorModel.js";
import type { NbtChange, TagKind } from "./nbtEditorBridge.js";

/**
 * The editor's small dialogs, kept together because each is a form with one job: add a tag,
 * rename a tag, edit a subtree as SNBT, and write a commit message for a save.
 */
const props = defineProps<{
    /** Which dialog is open; null for none. */
    dialog: "add" | "rename" | "snbt" | "save" | null;
    /** The container an Add targets, so a list can lock the type. */
    parentKind?: TagKind | null | undefined;
    listKind?: TagKind | "end" | null | undefined;
    currentName?: string | undefined;
    snbtText?: string | undefined;
    snbtTruncated?: boolean | undefined;
    /** An error from the main process to show inside the open dialog. */
    error?: string | null | undefined;
    suggestedMessage?: string | undefined;
    changes?: readonly NbtChange[] | undefined;
    changesTruncated?: boolean | undefined;
    backup?: boolean | undefined;
    busy?: boolean | undefined;
}>();

const emit = defineEmits<{
    close: [];
    add: [value: { kind: TagKind; name: string; text: string }];
    rename: [name: string];
    snbt: [text: string];
    save: [message: string];
    "update:backup": [value: boolean];
}>();

const { t } = useI18n();

const kind = ref<TagKind>("int");
const name = ref("");
const valueText = ref("");
const snbt = ref("");
const message = ref("");

const inList = computed(() => props.parentKind === "list");
const lockedKind = computed<TagKind | null>(() => (inList.value && props.listKind && props.listKind !== "end" ? props.listKind : null));

watch(
    () => props.dialog,
    (open) => {
        if (open === "add") {
            kind.value = lockedKind.value ?? "int";
            name.value = "";
            valueText.value = "";
        } else if (open === "rename") name.value = props.currentName ?? "";
        else if (open === "snbt") snbt.value = props.snbtText ?? "";
        else if (open === "save") message.value = props.suggestedMessage ?? "";
    },
);
watch(
    () => props.snbtText,
    (text) => {
        if (props.dialog === "snbt") snbt.value = text ?? "";
    },
);
watch(
    () => props.suggestedMessage,
    (text) => {
        if (props.dialog === "save" && message.value === "") message.value = text ?? "";
    },
);

const kindItems = computed(() => KIND_ORDER.map((k) => ({ value: k, title: `${KIND_CHIP[k]}` })));
const needsValue = computed(() => !isContainer(kind.value) && !isArray(kind.value));
const valueError = computed(() => (valueText.value === "" || !needsValue.value ? null : validateScalar(kind.value, valueText.value)));
const nameError = computed(() => (inList.value || name.value.length > 0 ? null : t("nbt.dialog.nameRequired", "A tag needs a name.")));
const canAdd = computed(() => (inList.value || name.value.length > 0) && valueError.value === null && props.busy !== true);
const open = computed(() => props.dialog !== null);

function onOpenChange(value: boolean): void {
    if (!value) emit("close");
}
</script>

<template>
    <v-dialog :model-value="open" max-width="560" scrollable @update:model-value="onOpenChange">
        <v-card v-if="dialog === 'add'" :title="t('nbt.dialog.addTitle', 'Add a tag')">
            <v-card-text class="wl-nbt-form">
                <v-select
                    v-model="kind"
                    :items="kindItems"
                    :label="t('nbt.dialog.type', 'Type')"
                    :disabled="lockedKind !== null"
                    :hint="lockedKind !== null ? t('nbt.dialog.listLocked', { kind: lockedKind }, 'This list only holds {kind} tags.') : ''"
                    persistent-hint
                    density="comfortable"
                />
                <v-text-field
                    v-if="!inList"
                    v-model="name"
                    :label="t('nbt.dialog.name', 'Name')"
                    :error-messages="nameError"
                    autofocus
                    spellcheck="false"
                    density="comfortable"
                    @keydown.enter="canAdd && emit('add', { kind, name, text: valueText })"
                />
                <v-text-field
                    v-if="needsValue"
                    v-model="valueText"
                    :label="t('nbt.dialog.value', 'Value (optional)')"
                    :hint="rangeHint(kind)"
                    :error-messages="valueError"
                    persistent-hint
                    spellcheck="false"
                    density="comfortable"
                    @keydown.enter="canAdd && emit('add', { kind, name, text: valueText })"
                />
                <p v-if="error" class="wl-nbt-dialog-error" role="alert">{{ error }}</p>
            </v-card-text>
            <v-card-actions>
                <v-btn variant="text" @click="emit('close')">{{ t('nbt.dialog.cancel', 'Cancel') }}</v-btn>
                <v-btn color="primary" variant="flat" :disabled="!canAdd" @click="emit('add', { kind, name, text: valueText })">{{ t('nbt.dialog.add', 'Add') }}</v-btn>
            </v-card-actions>
        </v-card>

        <v-card v-else-if="dialog === 'rename'" :title="t('nbt.dialog.renameTitle', 'Rename tag')">
            <v-card-text class="wl-nbt-form">
                <v-text-field
                    v-model="name"
                    :label="t('nbt.dialog.name', 'Name')"
                    autofocus
                    spellcheck="false"
                    density="comfortable"
                    @keydown.enter="emit('rename', name)"
                />
                <p v-if="error" class="wl-nbt-dialog-error" role="alert">{{ error }}</p>
            </v-card-text>
            <v-card-actions>
                <v-btn variant="text" @click="emit('close')">{{ t('nbt.dialog.cancel', 'Cancel') }}</v-btn>
                <v-btn color="primary" variant="flat" @click="emit('rename', name)">{{ t('nbt.dialog.rename', 'Rename') }}</v-btn>
            </v-card-actions>
        </v-card>

        <v-card v-else-if="dialog === 'snbt'" :title="t('nbt.dialog.snbtTitle', 'Edit as SNBT')">
            <v-card-text class="wl-nbt-form">
                <p class="wl-nbt-hint">
                    {{ t('nbt.dialog.snbtHint', 'The text form the game\'s commands use. Applying it replaces this tag and everything under it. Nothing changes if the text is not valid.') }}
                </p>
                <v-textarea
                    v-model="snbt"
                    :label="t('nbt.dialog.snbt', 'SNBT')"
                    rows="14"
                    auto-grow
                    spellcheck="false"
                    class="wl-nbt-mono"
                    :readonly="!!snbtTruncated"
                    :error-messages="error ?? null"
                />
                <p v-if="snbtTruncated" class="wl-nbt-dialog-error" role="alert">
                    {{ t('nbt.dialog.snbtTruncated', 'This tag is too large to edit as text. Edit the tags inside it instead.') }}
                </p>
            </v-card-text>
            <v-card-actions>
                <v-btn variant="text" @click="emit('close')">{{ t('nbt.dialog.cancel', 'Cancel') }}</v-btn>
                <v-btn color="primary" variant="flat" :disabled="!!(snbtTruncated || busy)" @click="emit('snbt', snbt)">{{ t('nbt.dialog.apply', 'Apply') }}</v-btn>
            </v-card-actions>
        </v-card>

        <v-card v-else-if="dialog === 'save'" :title="t('nbt.dialog.saveTitle', 'Save and record')">
            <v-card-text class="wl-nbt-form">
                <v-text-field
                    v-model="message"
                    :label="t('nbt.dialog.message', 'What changed (optional)')"
                    :placeholder="suggestedMessage"
                    autofocus
                    density="comfortable"
                    @keydown.enter="emit('save', message)"
                />
                <div v-if="changes && changes.length > 0" class="wl-nbt-changes" role="list" :aria-label="t('nbt.dialog.pending', 'Changes to save')">
                    <div v-for="(change, i) in changes.slice(0, 40)" :key="i" class="wl-nbt-change" :class="`is-${change.change}`" role="listitem">{{ describeChange(change) }}</div>
                    <div v-if="changes.length > 40 || changesTruncated" class="wl-nbt-hint">{{ t('nbt.dialog.moreChanges', 'and more') }}</div>
                </div>
                <v-switch
                    :model-value="backup"
                    :label="t('nbt.dialog.backup', 'Back up the file before saving')"
                    color="primary"
                    density="comfortable"
                    hide-details
                    @update:model-value="(v: unknown) => emit('update:backup', v === true)"
                />
                <p v-if="error" class="wl-nbt-dialog-error" role="alert">{{ error }}</p>
            </v-card-text>
            <v-card-actions>
                <v-btn variant="text" @click="emit('close')">{{ t('nbt.dialog.cancel', 'Cancel') }}</v-btn>
                <v-btn color="primary" variant="flat" :disabled="!!busy" @click="emit('save', message)">{{ t('nbt.dialog.save', 'Save') }}</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style scoped>
.wl-nbt-form { display: flex; flex-direction: column; gap: 8px; }
.wl-nbt-hint { margin: 0; font-size: 13px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-nbt-dialog-error { margin: 0; color: rgb(var(--v-theme-error)); font-size: 13px; }
.wl-nbt-mono :deep(textarea) { font-family: "Roboto Mono", ui-monospace, monospace; font-size: 12px; }
.wl-nbt-changes { max-height: 220px; overflow: auto; border-radius: 10px; padding: 8px 10px; background: rgba(var(--v-theme-on-surface), 0.06); font: 12px/1.6 "Roboto Mono", ui-monospace, monospace; }
.wl-nbt-change.is-added { color: rgb(var(--v-theme-success, var(--v-theme-primary))); }
.wl-nbt-change.is-removed { color: rgb(var(--v-theme-error)); }
</style>
