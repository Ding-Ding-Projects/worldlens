<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtnToggle, VBtn, VCombobox, VSwitch, VTextField, VExpansionPanels, VExpansionPanel, VExpansionPanelTitle, VExpansionPanelText, VSelect, VChip } from "vuetify/components";
import { ENTITY_TYPE_IDS, SELECTOR_SORTS } from "./commandBuilderData.js";
import { selectorError, selectorToken, type SelectorArgs, type SelectorKind, type TargetSelector } from "./commandBuilderModel.js";

/**
 * Every real Minecraft target in one control: the four entity selectors, `@s`, or a picked
 * player name - and every selector argument as its own control, never a raw bracketed string
 * the user has to type. The "advanced arguments" panel starts collapsed because most commands
 * only need a bare `@p`, but nothing in it is hidden away: it is one click, not a text box.
 */
const props = defineProps<{ modelValue: TargetSelector; label: string; knownPlayers: readonly string[] }>();
const emit = defineEmits<{ "update:modelValue": [value: TargetSelector] }>();
const { t } = useI18n();

const KIND_OPTIONS: { value: SelectorKind; label: string; hint: string }[] = [
    { value: "p", label: "@p", hint: "Nearest player" },
    { value: "a", label: "@a", hint: "All players" },
    { value: "r", label: "@r", hint: "Random player" },
    { value: "e", label: "@e", hint: "All entities" },
    { value: "s", label: "@s", hint: "The command's executor" },
    { value: "name", label: "Named player", hint: "A specific player by name" },
];

function setKind(kind: SelectorKind): void {
    emit("update:modelValue", { ...props.modelValue, kind });
}
function setPlayerName(name: string): void {
    emit("update:modelValue", { ...props.modelValue, playerName: name });
}
function patchArgs(patch: Partial<SelectorArgs>): void {
    emit("update:modelValue", { ...props.modelValue, args: { ...props.modelValue.args, ...patch } });
}

const nameError = computed(() => (props.modelValue.kind === "name" ? selectorError(props.modelValue) : null));
const preview = computed(() => selectorToken(props.modelValue));

const newTag = ref("");
function addTag(): void {
    const value = newTag.value.trim();
    if (!value) return;
    patchArgs({ tags: [...(props.modelValue.args.tags ?? []), value] });
    newTag.value = "";
}
function removeTag(index: number): void {
    const tags = [...(props.modelValue.args.tags ?? [])];
    tags.splice(index, 1);
    patchArgs({ tags });
}

const newScoreObjective = ref("");
const newScoreRange = ref("");
function addScore(): void {
    if (!newScoreObjective.value.trim() || !newScoreRange.value.trim()) return;
    patchArgs({ scores: [...(props.modelValue.args.scores ?? []), { objective: newScoreObjective.value.trim(), range: newScoreRange.value.trim() }] });
    newScoreObjective.value = "";
    newScoreRange.value = "";
}
function removeScore(index: number): void {
    const scores = [...(props.modelValue.args.scores ?? [])];
    scores.splice(index, 1);
    patchArgs({ scores });
}
</script>

<template>
    <fieldset class="wl-mcserver-target">
        <legend class="text-caption text-medium-emphasis">{{ label }}</legend>
        <VBtnToggle
            :model-value="modelValue.kind"
            mandatory
            density="compact"
            variant="outlined"
            divided
            class="wl-mcserver-target__kinds"
            @update:model-value="(kind) => setKind(kind as SelectorKind)"
        >
            <VBtn v-for="opt in KIND_OPTIONS" :key="opt.value" :value="opt.value" size="small" :title="opt.hint">{{ opt.label }}</VBtn>
        </VBtnToggle>

        <VCombobox
            v-if="modelValue.kind === 'name'"
            :model-value="modelValue.playerName"
            :items="knownPlayers"
            :label="t('mcserver.commandBuilder.playerName', 'Player name (pick a known name or type one)')"
            density="compact"
            hide-details="auto"
            :error-messages="nameError ? [nameError] : []"
            @update:model-value="(v) => setPlayerName(String(v ?? ''))"
        />

        <VExpansionPanels v-else variant="accordion" class="wl-mcserver-target__advanced">
            <VExpansionPanel :title="t('mcserver.commandBuilder.selectorAdvanced', 'Selector arguments (optional)')">
                <VExpansionPanelTitle>{{ t("mcserver.commandBuilder.selectorAdvanced", "Selector arguments (optional)") }}</VExpansionPanelTitle>
                <VExpansionPanelText>
                    <div class="wl-mcserver-target__row">
                        <VCombobox
                            :model-value="modelValue.args.type ?? ''"
                            :items="ENTITY_TYPE_IDS"
                            :label="t('mcserver.commandBuilder.selectorType', 'Entity type')"
                            density="compact"
                            hide-details
                            style="min-width: 220px"
                            @update:model-value="(v) => patchArgs({ type: String(v ?? '') || undefined })"
                        />
                        <VSwitch
                            :model-value="modelValue.args.typeExclude ?? false"
                            :label="t('mcserver.commandBuilder.exclude', 'Exclude')"
                            density="compact"
                            hide-details
                            @update:model-value="(v) => patchArgs({ typeExclude: !!v })"
                        />
                    </div>
                    <VTextField
                        :model-value="modelValue.args.distance ?? ''"
                        :label="t('mcserver.commandBuilder.distance', 'Distance range (e.g. 5, ..10, 3..10)')"
                        density="compact"
                        hide-details
                        @update:model-value="(v) => patchArgs({ distance: v || undefined })"
                    />
                    <div class="wl-mcserver-target__row">
                        <VTextField
                            :model-value="modelValue.args.limit ?? ''"
                            type="number"
                            :label="t('mcserver.commandBuilder.limit', 'Limit')"
                            density="compact"
                            hide-details
                            style="max-width: 140px"
                            @update:model-value="(v) => patchArgs({ limit: v === '' ? null : Number(v) })"
                        />
                        <VSelect
                            :model-value="modelValue.args.sort ?? ''"
                            :items="[{ title: t('mcserver.commandBuilder.sortNone', '(none)'), value: '' }, ...SELECTOR_SORTS.map((s) => ({ title: s, value: s }))]"
                            :label="t('mcserver.commandBuilder.sort', 'Sort')"
                            density="compact"
                            hide-details
                            style="min-width: 160px"
                            @update:model-value="(v) => patchArgs({ sort: (v || undefined) as never })"
                        />
                    </div>
                    <div class="wl-mcserver-target__row">
                        <VTextField
                            :model-value="modelValue.args.gamemode ?? ''"
                            :label="t('mcserver.commandBuilder.gamemode', 'Game mode')"
                            density="compact"
                            hide-details
                            @update:model-value="(v) => patchArgs({ gamemode: v || undefined })"
                        />
                        <VSwitch
                            :model-value="modelValue.args.gamemodeExclude ?? false"
                            :label="t('mcserver.commandBuilder.exclude', 'Exclude')"
                            density="compact"
                            hide-details
                            @update:model-value="(v) => patchArgs({ gamemodeExclude: !!v })"
                        />
                    </div>
                    <div class="wl-mcserver-target__row">
                        <VTextField
                            :model-value="modelValue.args.team ?? ''"
                            :label="t('mcserver.commandBuilder.team', 'Team')"
                            density="compact"
                            hide-details
                            @update:model-value="(v) => patchArgs({ team: v || undefined })"
                        />
                        <VSwitch
                            :model-value="modelValue.args.teamExclude ?? false"
                            :label="t('mcserver.commandBuilder.exclude', 'Exclude')"
                            density="compact"
                            hide-details
                            @update:model-value="(v) => patchArgs({ teamExclude: !!v })"
                        />
                    </div>

                    <div class="wl-mcserver-target__row">
                        <VTextField v-model="newTag" :label="t('mcserver.commandBuilder.addTag', 'Add tag')" density="compact" hide-details @keydown.enter.prevent="addTag" />
                        <VBtn size="small" variant="tonal" @click="addTag">{{ t("mcserver.commandBuilder.add", "Add") }}</VBtn>
                    </div>
                    <div class="wl-mcserver-target__chips">
                        <VChip v-for="(tag, index) in modelValue.args.tags ?? []" :key="index" size="small" closable @click:close="removeTag(index)">{{ tag }}</VChip>
                    </div>

                    <div class="wl-mcserver-target__row">
                        <VTextField v-model="newScoreObjective" :label="t('mcserver.commandBuilder.scoreObjective', 'Score objective')" density="compact" hide-details style="max-width: 160px" />
                        <VTextField v-model="newScoreRange" :label="t('mcserver.commandBuilder.scoreRange', 'Range (e.g. 1.., ..5)')" density="compact" hide-details style="max-width: 160px" />
                        <VBtn size="small" variant="tonal" @click="addScore">{{ t("mcserver.commandBuilder.add", "Add") }}</VBtn>
                    </div>
                    <div class="wl-mcserver-target__chips">
                        <VChip v-for="(score, index) in modelValue.args.scores ?? []" :key="index" size="small" closable @click:close="removeScore(index)">
                            {{ score.objective }}={{ score.range }}
                        </VChip>
                    </div>

                    <div class="wl-mcserver-target__row">
                        <VTextField
                            :model-value="modelValue.args.x ?? ''"
                            type="number"
                            label="x"
                            density="compact"
                            hide-details
                            style="max-width: 90px"
                            @update:model-value="(v) => patchArgs({ x: v === '' ? null : Number(v) })"
                        />
                        <VTextField
                            :model-value="modelValue.args.y ?? ''"
                            type="number"
                            label="y"
                            density="compact"
                            hide-details
                            style="max-width: 90px"
                            @update:model-value="(v) => patchArgs({ y: v === '' ? null : Number(v) })"
                        />
                        <VTextField
                            :model-value="modelValue.args.z ?? ''"
                            type="number"
                            label="z"
                            density="compact"
                            hide-details
                            style="max-width: 90px"
                            @update:model-value="(v) => patchArgs({ z: v === '' ? null : Number(v) })"
                        />
                    </div>
                    <div class="wl-mcserver-target__row">
                        <VTextField
                            :model-value="modelValue.args.dx ?? ''"
                            type="number"
                            label="dx"
                            density="compact"
                            hide-details
                            style="max-width: 90px"
                            @update:model-value="(v) => patchArgs({ dx: v === '' ? null : Number(v) })"
                        />
                        <VTextField
                            :model-value="modelValue.args.dy ?? ''"
                            type="number"
                            label="dy"
                            density="compact"
                            hide-details
                            style="max-width: 90px"
                            @update:model-value="(v) => patchArgs({ dy: v === '' ? null : Number(v) })"
                        />
                        <VTextField
                            :model-value="modelValue.args.dz ?? ''"
                            type="number"
                            label="dz"
                            density="compact"
                            hide-details
                            style="max-width: 90px"
                            @update:model-value="(v) => patchArgs({ dz: v === '' ? null : Number(v) })"
                        />
                    </div>
                    <VTextField
                        :model-value="modelValue.args.nbt ?? ''"
                        :label="t('mcserver.commandBuilder.selectorNbt', 'NBT match (optional, advanced - raw text)')"
                        density="compact"
                        hide-details
                        @update:model-value="(v) => patchArgs({ nbt: v || undefined })"
                    />
                </VExpansionPanelText>
            </VExpansionPanel>
        </VExpansionPanels>

        <div class="wl-mcserver-target__preview text-caption text-medium-emphasis">{{ preview }}</div>
    </fieldset>
</template>

<style scoped>
.wl-mcserver-target {
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 8px;
    padding: 8px 12px 12px;
    margin: 0 0 8px;
}
.wl-mcserver-target__kinds {
    margin-bottom: 8px;
    flex-wrap: wrap;
}
.wl-mcserver-target__row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 6px;
    flex-wrap: wrap;
}
.wl-mcserver-target__chips {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 4px;
}
.wl-mcserver-target__preview {
    margin-top: 8px;
    font-family: monospace;
}
</style>
