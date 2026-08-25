<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose, mdiContentCopy, mdiDelete, mdiPlus, mdiSend } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VBtnToggle,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VCheckbox,
    VCombobox,
    VChip,
    VDialog,
    VDivider,
    VList,
    VListItem,
    VMenu,
    VSelect,
    VSwitch,
    VTable,
    VTextField,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import CoordinateField from "./CoordinateField.vue";
import TargetSelectorField from "./TargetSelectorField.vue";
import {
    ATTRIBUTE_IDS,
    BLOCK_IDS,
    EFFECT_IDS,
    ENCHANTMENT_IDS,
    ENTITY_TYPE_IDS,
    EXECUTE_CLAUSE_KINDS,
    GAMERULE_IDS,
    ITEM_IDS,
    PARTICLE_IDS,
    SOUND_IDS,
} from "./commandBuilderData.js";
import {
    COMMAND_FORMS,
    buildCommand,
    buildExecuteCommand,
    formById,
    makeCoord3,
    makeExecuteClause,
    makeTargetSelector,
    makeTwoCornerSelection,
    selectTwoCorner,
    resetTwoCornerSelection,
    selectorError,
    type Coord3,
    type CoordinatePickMode,
    type CommandForm,
    type ExecuteClause,
    type ExecuteClauseKind,
    type FieldKind,
    type TargetSelector,
} from "./commandBuilderModel.js";
import { addPreset, loadHistory, loadPresets, pushHistory, removePreset, saveHistory, savePresets, type CommandHistoryEntry, type CommandPreset } from "./commandBuilderHistory.js";
import { playersList } from "./mcserverBridge.js";
import { mapPickPoint, setMapCoordinatePicking } from "../../stores/bluemap.js";

/**
 * The Minecraft command builder: pick a command from a searchable list, fill in every
 * argument through a real control (never a text box standing in for a control that could
 * exist), watch the exact command text build up live, and hand the finished text back to
 * whoever opened this dialog - the server console's own send box, or a map-supplied position.
 *
 * `/execute` is its own tab: an ordered, reorderable list of real subcommand clauses plus the
 * command it finally runs, built with this same component recursively for that inner command.
 */
const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        /** Absent when opened from a surface with no known managed server to send to (e.g. the map). */
        serverId?: string;
        /** A world point supplied by the map, pre-filling every position field opened after it. */
        initialPoint?: { x: number; y: number; z: number } | null;
    }>(),
    { initialPoint: null },
);
const emit = defineEmits<{ "update:modelValue": [value: boolean]; "use-command": [text: string] }>();
const { t } = useI18n();

const open = computed<boolean>({ get: () => props.modelValue, set: (v) => emit("update:modelValue", v) });

const ID_LISTS: Partial<Record<FieldKind, readonly string[]>> = {
    itemId: ITEM_IDS,
    blockId: BLOCK_IDS,
    entityId: ENTITY_TYPE_IDS,
    enchantmentId: ENCHANTMENT_IDS,
    effectId: EFFECT_IDS,
    particleId: PARTICLE_IDS,
    soundId: SOUND_IDS,
    attributeId: ATTRIBUTE_IDS,
    gameruleId: GAMERULE_IDS,
};

// -- command list search -----------------------------------------------------------------

const listQuery = ref("");
const listRegex = ref(false);
const listFlags = ref("i");
const listSample = computed(() => COMMAND_FORMS.map((f) => `${f.label} - ${f.summary}`).join("\n"));

const filteredForms = computed<readonly CommandForm[]>(() => {
    const query = listQuery.value.trim();
    if (query === "") return COMMAND_FORMS;
    if (!listRegex.value) {
        const needle = query.toLowerCase();
        return COMMAND_FORMS.filter((f) => f.label.toLowerCase().includes(needle) || f.summary.toLowerCase().includes(needle) || f.group.toLowerCase().includes(needle));
    }
    try {
        const pattern = new RegExp(query, listFlags.value);
        return COMMAND_FORMS.filter((f) => pattern.test(f.label) || pattern.test(f.summary));
    } catch {
        return [];
    }
});

const activeFormId = ref<string>("give");
const activeForm = computed<CommandForm | undefined>(() => formById(activeFormId.value));
const showExecute = ref(false);

// -- known players (from the running server, plus whatever selectors already name) --------

const knownPlayers = ref<string[]>([]);
onMounted(async () => {
    if (!props.serverId) return;
    const result = await playersList(props.serverId);
    if (result.ok) knownPlayers.value = (result.value ?? []).map((p) => p.name);
});

// -- field values for the active form ------------------------------------------------------

const values = reactive<Record<string, unknown>>({});
const regionPickMode = ref<CoordinatePickMode>("manual");
const regionSelection = ref(makeTwoCornerSelection());
const isRegionCommand = computed(() => activeFormId.value === "fill" || activeFormId.value === "clone");

function defaultValueFor(kind: FieldKind): unknown {
    switch (kind) {
        case "target":
            return makeTargetSelector("p");
        case "playerName":
            return "";
        case "coord3":
            return props.initialPoint ? makeCoord3(props.initialPoint.x, props.initialPoint.y, props.initialPoint.z) : makeCoord3();
        case "int":
            return 1;
        case "float":
            return 0;
        case "bool":
            return false;
        default:
            return "";
    }
}

function resetValuesForForm(form: CommandForm | undefined): void {
    for (const key of Object.keys(values)) delete values[key];
    if (!form) return;
    for (const field of form.fields) {
        values[field.key] = defaultValueFor(field.kind);
    }
}
watch(activeFormId, () => {
    resetValuesForForm(activeForm.value);
    regionPickMode.value = "manual";
    regionSelection.value = resetTwoCornerSelection();
    setMapCoordinatePicking(false);
}, { immediate: true });

function toggleRegionPick(enabled: boolean): void {
    regionPickMode.value = enabled ? "map" : "manual";
    if (!enabled) regionSelection.value = resetTwoCornerSelection();
    setMapCoordinatePicking(enabled);
}

watch(mapPickPoint, (point) => {
    if (!point || !isRegionCommand.value || regionPickMode.value !== "map") return;
    const next = selectTwoCorner(regionSelection.value, makeCoord3(point.x, point.y, point.z));
    regionSelection.value = next;
    if (next.corner1) values.from = next.corner1;
    if (next.corner2) values.to = next.corner2;
    mapPickPoint.value = null;
}, { flush: "sync" });

const built = computed(() => (activeForm.value ? buildCommand(activeForm.value.id, values) : { text: "", errors: ["No command selected."] }));

// -- /execute chain --------------------------------------------------------------------------

const executeClauses = ref<ExecuteClause[]>([]);
const executeRunText = ref("");
const executeBuilt = computed(() => buildExecuteCommand(executeClauses.value, executeRunText.value));

function addExecuteClause(kind: ExecuteClauseKind): void {
    executeClauses.value = [...executeClauses.value, makeExecuteClause(kind)];
}
function removeExecuteClause(id: string): void {
    executeClauses.value = executeClauses.value.filter((c) => c.id !== id);
}
function moveExecuteClause(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= executeClauses.value.length) return;
    const next = [...executeClauses.value];
    const [item] = next.splice(index, 1);
    if (item) next.splice(target, 0, item);
    executeClauses.value = next;
}
function patchClause(id: string, patch: Partial<ExecuteClause>): void {
    executeClauses.value = executeClauses.value.map((c) => (c.id === id ? { ...c, ...patch } : c));
}
function useBuiltAsRun(): void {
    if (built.value.text) executeRunText.value = built.value.text.replace(/^\//, "");
}

// -- final text, honest disabled reasons ------------------------------------------------------

const finalResult = computed(() => (showExecute.value ? executeBuilt.value : built.value));
const sendReason = computed<string | null>(() => {
    if (finalResult.value.errors.length > 0) return finalResult.value.errors.join(" ");
    if (!finalResult.value.text.trim()) return t("mcserver.commandBuilder.nothingBuilt", "Nothing has been built yet.");
    if (!props.serverId) return t("mcserver.commandBuilder.noConnectedServer", "No server is connected here - copy the command instead.");
    return null;
});

async function copyCommand(): Promise<void> {
    try {
        await navigator.clipboard.writeText(finalResult.value.text);
    } catch {
        // Clipboard access can be refused by the platform; the preview text is still selectable.
    }
}

function useCommand(): void {
    if (sendReason.value) return;
    history.value = [...pushHistory(history.value, finalResult.value.text, Date.now())];
    saveHistory(history.value);
    emit("use-command", finalResult.value.text);
    open.value = false;
}

// -- presets and history ---------------------------------------------------------------------

const presets = ref<CommandPreset[]>([]);
const history = ref<CommandHistoryEntry[]>([]);
onMounted(() => {
    presets.value = [...loadPresets()];
    history.value = [...loadHistory()];
});

const presetName = ref("");
function saveAsPreset(): void {
    if (!presetName.value.trim() || finalResult.value.errors.length > 0) return;
    presets.value = [...addPreset(presets.value, presetName.value, finalResult.value.text)];
    savePresets(presets.value);
    presetName.value = "";
}
function deletePreset(id: string): void {
    presets.value = [...removePreset(presets.value, id)];
    savePresets(presets.value);
}
function loadFromHistoryOrPreset(text: string): void {
    // Free-form history/preset replay bypasses the form model - it is shown and copyable/sendable
    // as-is, honestly labelled as a saved command rather than pretending to re-populate every
    // control it came from.
    replayText.value = text;
}
const replayText = ref<string | null>(null);
</script>

<template>
    <VDialog v-model="open" max-width="900" persistent scrollable>
        <VCard class="wl-mcserver-cmdbuilder">
            <VCardTitle class="d-flex align-center">
                <span>{{ t("mcserver.commandBuilder.title", "Minecraft command builder") }}</span>
                <VBtn :icon="mdiClose" variant="text" size="small" class="ml-auto" :aria-label="t('common.close', 'Close')" @click="open = false" />
            </VCardTitle>
            <VDivider />
            <VCardText style="max-height: 70vh">
                <VAlert v-if="!serverId" type="info" variant="tonal" density="compact" class="mb-3">
                    {{ t("mcserver.commandBuilder.noServerBanner", "No managed server is connected here, so this command can be composed and copied but not sent. Open the command builder from a server's console to send it directly.") }}
                </VAlert>
                <div class="d-flex align-center wl-mcserver-cmdbuilder__mode">
                    <VBtn :variant="!showExecute ? 'tonal' : 'text'" size="small" @click="showExecute = false">{{ t("mcserver.commandBuilder.simpleCommand", "Command") }}</VBtn>
                    <VBtn :variant="showExecute ? 'tonal' : 'text'" size="small" @click="showExecute = true">{{ t("mcserver.commandBuilder.executeChain", "/execute chain") }}</VBtn>
                </div>

                <template v-if="!showExecute">
                    <ConfigSearchField
                        v-model="listQuery"
                        v-model:regex="listRegex"
                        v-model:flags="listFlags"
                        :label="t('mcserver.commandBuilder.searchCommands', 'Search commands')"
                        :sample="listSample"
                        class="mb-2"
                    />
                    <div class="wl-mcserver-cmdbuilder__layout">
                        <VList density="compact" class="wl-mcserver-cmdbuilder__list" nav>
                            <VListItem
                                v-for="form in filteredForms"
                                :key="form.id"
                                :active="form.id === activeFormId"
                                :title="form.label"
                                :subtitle="form.summary"
                                @click="activeFormId = form.id"
                            />
                            <VListItem v-if="filteredForms.length === 0">
                                {{ t("mcserver.commandBuilder.noCommandsMatch", "No commands match that search.") }}
                            </VListItem>
                        </VList>

                        <div v-if="activeForm" class="wl-mcserver-cmdbuilder__form">
                            <div class="text-body-2 text-medium-emphasis">{{ activeForm.summary }}</div>
                            <div v-if="isRegionCommand" class="d-flex align-center ga-2 flex-wrap mt-2 mb-2">
                                <VBtnToggle
                                    :model-value="regionPickMode"
                                    mandatory
                                    density="compact"
                                    variant="outlined"
                                    divided
                                    @update:model-value="(mode) => toggleRegionPick(mode === 'map')"
                                >
                                    <VBtn value="manual" size="small">{{ t("mcserver.commandBuilder.manualCoordinates", "Manual coordinates") }}</VBtn>
                                    <VBtn value="map" size="small">{{ t("mcserver.commandBuilder.pickFromMap", "Pick two corners from map") }}</VBtn>
                                </VBtnToggle>
                                <span v-if="regionPickMode === 'map'" class="text-caption text-medium-emphasis">
                                    {{ regionSelection.corner2 ? t("mcserver.commandBuilder.twoCornersPicked", "Two corners picked") : regionSelection.corner1 ? t("mcserver.commandBuilder.pickSecondCorner", "Pick corner 2 on the map") : t("mcserver.commandBuilder.pickFirstCorner", "Pick corner 1 on the map") }}
                                </span>
                            </div>
                            <template v-for="field in activeForm.fields" :key="field.key">
                                <TargetSelectorField
                                    v-if="field.kind === 'target'"
                                    v-model="values[field.key] as TargetSelector"
                                    :label="field.label"
                                    :known-players="knownPlayers"
                                />
                                <VCombobox
                                    v-else-if="field.kind === 'playerName'"
                                    :model-value="values[field.key] as string"
                                    :items="knownPlayers"
                                    :label="field.label"
                                    density="compact"
                                    class="mb-2"
                                    @update:model-value="(v) => (values[field.key] = String(v ?? ''))"
                                />
                                <VCombobox
                                    v-else-if="ID_LISTS[field.kind]"
                                    :model-value="values[field.key] as string"
                                    :items="ID_LISTS[field.kind]"
                                    :label="field.label"
                                    density="compact"
                                    class="mb-2"
                                    @update:model-value="(v) => (values[field.key] = String(v ?? ''))"
                                />
                                <CoordinateField v-else-if="field.kind === 'coord3'" v-model="values[field.key] as Coord3" :label="field.label" />
                                <VTextField
                                    v-else-if="field.kind === 'int' || field.kind === 'float'"
                                    :model-value="values[field.key] as number"
                                    type="number"
                                    :step="field.kind === 'float' ? 'any' : 1"
                                    :min="field.min"
                                    :max="field.max"
                                    :label="field.label"
                                    density="compact"
                                    class="mb-2"
                                    @update:model-value="(v) => (values[field.key] = Number(v))"
                                />
                                <VSwitch
                                    v-else-if="field.kind === 'bool'"
                                    :model-value="values[field.key] as boolean"
                                    :label="field.label"
                                    density="compact"
                                    class="mb-2"
                                    @update:model-value="(v) => (values[field.key] = !!v)"
                                />
                                <VSelect
                                    v-else-if="field.kind === 'enum'"
                                    :model-value="values[field.key] as string"
                                    :items="[...(field.options ?? [])]"
                                    :label="field.label"
                                    density="compact"
                                    class="mb-2"
                                    @update:model-value="(v) => (values[field.key] = v)"
                                />
                                <VTextField
                                    v-else
                                    :model-value="values[field.key] as string"
                                    :label="field.label"
                                    density="compact"
                                    class="mb-2"
                                    @update:model-value="(v) => (values[field.key] = v)"
                                />
                            </template>
                        </div>
                    </div>
                </template>

                <template v-else>
                    <div class="text-body-2 text-medium-emphasis">
                        {{ t("mcserver.commandBuilder.executeHelp", "Build the subcommand chain in order, then say what to run at the end.") }}
                    </div>
                    <div class="wl-mcserver-cmdbuilder__execute-add">
                        <VMenu>
                            <template #activator="{ props: menuProps }">
                                <VBtn v-bind="menuProps" :prepend-icon="mdiPlus" size="small" variant="tonal">{{ t("mcserver.commandBuilder.addClause", "Add clause") }}</VBtn>
                            </template>
                            <VList>
                                <VListItem v-for="kind in EXECUTE_CLAUSE_KINDS" :key="kind" @click="addExecuteClause(kind)">{{ kind }}</VListItem>
                            </VList>
                        </VMenu>
                    </div>
                    <VTable density="compact" class="wl-mcserver-cmdbuilder__chain">
                        <tbody>
                            <tr v-for="(clause, index) in executeClauses" :key="clause.id">
                                <td style="width: 90px">
                                    <VBtn :disabled="index === 0" icon size="x-small" variant="text" @click="moveExecuteClause(index, -1)">↑</VBtn>
                                    <VBtn :disabled="index === executeClauses.length - 1" icon size="x-small" variant="text" @click="moveExecuteClause(index, 1)">↓</VBtn>
                                </td>
                                <td style="width: 90px" class="font-weight-medium">{{ clause.kind }}</td>
                                <td>
                                    <TargetSelectorField
                                        v-if="clause.kind === 'as' || clause.kind === 'at'"
                                        :model-value="clause.target ?? makeTargetSelector('e')"
                                        :label="clause.kind"
                                        :known-players="knownPlayers"
                                        @update:model-value="(v) => patchClause(clause.id, { target: v })"
                                    />
                                    <CoordinateField
                                        v-else-if="clause.kind === 'positioned'"
                                        :model-value="clause.coord ?? makeCoord3()"
                                        :label="t('mcserver.commandBuilder.position', 'Position')"
                                        @update:model-value="(v) => patchClause(clause.id, { coord: v })"
                                    />
                                    <div v-else-if="clause.kind === 'rotated'" class="d-flex ga-2">
                                        <VTextField
                                            :model-value="clause.rotationYaw"
                                            type="number"
                                            label="yaw"
                                            density="compact"
                                            hide-details
                                            style="max-width: 100px"
                                            @update:model-value="(v) => patchClause(clause.id, { rotationYaw: Number(v) })"
                                        />
                                        <VTextField
                                            :model-value="clause.rotationPitch"
                                            type="number"
                                            label="pitch"
                                            density="compact"
                                            hide-details
                                            style="max-width: 100px"
                                            @update:model-value="(v) => patchClause(clause.id, { rotationPitch: Number(v) })"
                                        />
                                    </div>
                                    <CoordinateField
                                        v-else-if="clause.kind === 'facing'"
                                        :model-value="clause.facingCoord ?? makeCoord3()"
                                        :label="t('mcserver.commandBuilder.facingPoint', 'Facing point')"
                                        @update:model-value="(v) => patchClause(clause.id, { facingCoord: v })"
                                    />
                                    <VTextField
                                        v-else-if="clause.kind === 'align'"
                                        :model-value="clause.axes"
                                        :label="t('mcserver.commandBuilder.axes', 'Axes (any of x, y, z)')"
                                        density="compact"
                                        hide-details
                                        @update:model-value="(v) => patchClause(clause.id, { axes: v })"
                                    />
                                    <VSelect
                                        v-else-if="clause.kind === 'anchored'"
                                        :model-value="clause.anchor"
                                        :items="['eyes', 'feet']"
                                        density="compact"
                                        hide-details
                                        @update:model-value="(v) => patchClause(clause.id, { anchor: v as never })"
                                    />
                                    <VTextField
                                        v-else-if="clause.kind === 'in'"
                                        :model-value="clause.dimension"
                                        :label="t('mcserver.commandBuilder.dimension', 'Dimension id (e.g. minecraft:the_nether)')"
                                        density="compact"
                                        hide-details
                                        @update:model-value="(v) => patchClause(clause.id, { dimension: v })"
                                    />
                                    <div v-else-if="clause.kind === 'if' || clause.kind === 'unless'">
                                        <div class="d-flex ga-2 align-center mb-1">
                                            <VSelect
                                                :model-value="clause.conditionKind"
                                                :items="['entity', 'block', 'score']"
                                                density="compact"
                                                hide-details
                                                style="max-width: 140px"
                                                @update:model-value="(v) => patchClause(clause.id, { conditionKind: v as never })"
                                            />
                                            <VCheckbox
                                                :model-value="clause.negate ?? false"
                                                :label="t('mcserver.commandBuilder.negate', 'Negate (unless)')"
                                                density="compact"
                                                hide-details
                                                @update:model-value="(v) => patchClause(clause.id, { negate: !!v })"
                                            />
                                        </div>
                                        <TargetSelectorField
                                            v-if="clause.conditionKind === 'entity' || clause.conditionKind === 'score'"
                                            :model-value="clause.target ?? makeTargetSelector('e')"
                                            :label="t('mcserver.commandBuilder.conditionTarget', 'Target')"
                                            :known-players="knownPlayers"
                                            @update:model-value="(v) => patchClause(clause.id, { target: v })"
                                        />
                                        <template v-if="clause.conditionKind === 'block'">
                                            <CoordinateField
                                                :model-value="clause.coord ?? makeCoord3()"
                                                :label="t('mcserver.commandBuilder.position', 'Position')"
                                                @update:model-value="(v) => patchClause(clause.id, { coord: v })"
                                            />
                                            <VCombobox
                                                :model-value="clause.blockId"
                                                :items="BLOCK_IDS"
                                                :label="t('mcserver.commandBuilder.block', 'Block')"
                                                density="compact"
                                                hide-details
                                                @update:model-value="(v) => patchClause(clause.id, { blockId: String(v ?? '') })"
                                            />
                                        </template>
                                        <div v-if="clause.conditionKind === 'score'" class="d-flex ga-2">
                                            <VTextField
                                                :model-value="clause.scoreObjective"
                                                :label="t('mcserver.commandBuilder.scoreObjective', 'Score objective')"
                                                density="compact"
                                                hide-details
                                                @update:model-value="(v) => patchClause(clause.id, { scoreObjective: v })"
                                            />
                                            <VTextField
                                                :model-value="clause.scoreRange"
                                                :label="t('mcserver.commandBuilder.scoreRange', 'Range (e.g. 1.., ..5)')"
                                                density="compact"
                                                hide-details
                                                @update:model-value="(v) => patchClause(clause.id, { scoreRange: v })"
                                            />
                                        </div>
                                    </div>
                                    <div v-else-if="clause.kind === 'store'" class="d-flex ga-2 flex-wrap">
                                        <VSelect
                                            :model-value="clause.storeTarget"
                                            :items="['result', 'success']"
                                            density="compact"
                                            hide-details
                                            style="max-width: 140px"
                                            @update:model-value="(v) => patchClause(clause.id, { storeTarget: v as never })"
                                        />
                                        <TargetSelectorField
                                            :model-value="clause.target ?? makeTargetSelector('e')"
                                            :label="t('mcserver.commandBuilder.storeTarget', 'Store into')"
                                            :known-players="knownPlayers"
                                            @update:model-value="(v) => patchClause(clause.id, { target: v })"
                                        />
                                        <VTextField
                                            :model-value="clause.scoreObjective"
                                            :label="t('mcserver.commandBuilder.scoreObjective', 'Score objective')"
                                            density="compact"
                                            hide-details
                                            @update:model-value="(v) => patchClause(clause.id, { scoreObjective: v })"
                                        />
                                    </div>
                                </td>
                                <td style="width: 40px">
                                    <VBtn :icon="mdiDelete" size="x-small" variant="text" :aria-label="t('common.remove', 'Remove')" @click="removeExecuteClause(clause.id)" />
                                </td>
                            </tr>
                        </tbody>
                    </VTable>

                    <VBtn v-if="built.text" size="small" variant="text" class="mt-2" @click="useBuiltAsRun">
                        {{ t("mcserver.commandBuilder.useCommandTabAsRun", "Use the Command tab's built command as `run`") }}
                    </VBtn>
                    <VTextField
                        v-model="executeRunText"
                        :label="t('mcserver.commandBuilder.runCommand', 'Command to run (without the leading slash)')"
                        density="compact"
                        class="mt-2"
                        hint="e.g. give @s minecraft:diamond 1"
                        persistent-hint
                    />
                </template>

                <VDivider class="my-3" />
                <div class="wl-mcserver-cmdbuilder__preview">
                    <span class="text-caption text-medium-emphasis">{{ t("mcserver.commandBuilder.preview", "Command preview") }}</span>
                    <code class="wl-mcserver-cmdbuilder__preview-text">{{ finalResult.text || t("mcserver.commandBuilder.emptyPreview", "(nothing built yet)") }}</code>
                </div>
                <VAlert v-if="finalResult.errors.length > 0" type="warning" variant="tonal" density="compact" class="mt-2">
                    <div v-for="(err, i) in finalResult.errors" :key="i">{{ err }}</div>
                </VAlert>

                <VDivider class="my-3" />
                <div class="d-flex ga-2 align-center flex-wrap">
                    <VTextField v-model="presetName" :label="t('mcserver.commandBuilder.presetName', 'Save as favourite (name)')" density="compact" hide-details style="max-width: 260px" />
                    <VBtn size="small" variant="tonal" :disabled="!presetName.trim() || finalResult.errors.length > 0" @click="saveAsPreset">
                        {{ t("mcserver.commandBuilder.savePreset", "Save favourite") }}
                    </VBtn>
                </div>
                <div v-if="presets.length > 0" class="wl-mcserver-cmdbuilder__chips mt-2">
                    <VChip v-for="preset in presets" :key="preset.id" size="small" closable class="mr-1 mb-1" @click="loadFromHistoryOrPreset(preset.text)" @click:close="deletePreset(preset.id)">
                        {{ preset.name }}
                    </VChip>
                </div>
                <div v-if="history.length > 0" class="mt-2">
                    <span class="text-caption text-medium-emphasis">{{ t("mcserver.commandBuilder.history", "Recent commands") }}</span>
                    <div class="wl-mcserver-cmdbuilder__chips">
                        <VChip v-for="(entry, i) in history.slice(0, 10)" :key="i" size="small" variant="outlined" class="mr-1 mb-1" @click="loadFromHistoryOrPreset(entry.text)">
                            {{ entry.text }}
                        </VChip>
                    </div>
                </div>
                <VAlert v-if="replayText" type="info" variant="tonal" density="compact" class="mt-2">
                    <div class="d-flex align-center ga-2">
                        <code class="flex-grow-1">{{ replayText }}</code>
                        <VBtn size="small" variant="tonal" @click="emit('use-command', replayText as string), (open = false)">{{ t("mcserver.commandBuilder.useThis", "Use this") }}</VBtn>
                        <VBtn size="small" variant="text" @click="replayText = null">{{ t("common.dismiss", "Dismiss") }}</VBtn>
                    </div>
                </VAlert>
            </VCardText>
            <VDivider />
            <VCardActions>
                <VBtn variant="text" @click="open = false">{{ t("common.cancel", "Cancel") }}</VBtn>
                <VBtn :prepend-icon="mdiContentCopy" variant="text" :disabled="!finalResult.text" @click="copyCommand">{{ t("mcserver.commandBuilder.copy", "Copy") }}</VBtn>
                <VBtn color="primary" variant="tonal" :prepend-icon="mdiSend" :disabled="!!sendReason" :title="sendReason ?? undefined" @click="useCommand">
                    {{ t("mcserver.commandBuilder.useCommand", "Use this command") }}
                </VBtn>
            </VCardActions>
        </VCard>
    </VDialog>
</template>

<style scoped>
.wl-mcserver-cmdbuilder__mode {
    gap: 8px;
    margin-bottom: 12px;
}
.wl-mcserver-cmdbuilder__layout {
    display: flex;
    gap: 16px;
    align-items: flex-start;
}
.wl-mcserver-cmdbuilder__list {
    flex: 0 0 260px;
    max-height: 420px;
    overflow-y: auto;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 8px;
}
.wl-mcserver-cmdbuilder__form {
    flex: 1 1 auto;
    min-width: 0;
}
.wl-mcserver-cmdbuilder__preview-text {
    display: block;
    padding: 8px 10px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    border-radius: 6px;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: 4px;
}
.wl-mcserver-cmdbuilder__chips {
    display: flex;
    flex-wrap: wrap;
}
.wl-mcserver-cmdbuilder__execute-add {
    margin-bottom: 8px;
}
</style>
