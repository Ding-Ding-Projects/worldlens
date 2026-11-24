<script setup lang="ts">
/**
 * The visual editor for an item modifier part: one card per step, typed fields for the
 * common functions, and any other function kept as it was and named. Every change is
 * written straight back into the part's JSON, so the JSON view and this editor never disagree.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VCombobox, VRangeSlider, VSelect, VSlider, VSwitch, VTextField } from "vuetify/components";
import {
    STEP_KINDS,
    newStep,
    readModifier,
    writeModifier,
    type ModifierStep,
    type StepKind,
} from "./itemModifier.js";

const props = defineProps<{ text: string }>();
const emit = defineEmits<{ "update:text": [text: string] }>();
const { t } = useI18n();

const steps = computed(() => readModifier(props.text));

function commit(next: ModifierStep[]): void {
    emit("update:text", writeModifier(next));
}
function change(i: number, patch: Partial<ModifierStep>): void {
    const list = [...(steps.value ?? [])];
    list[i] = { ...list[i]!, ...patch } as ModifierStep;
    commit(list);
}
function move(i: number, by: number): void {
    const list = [...(steps.value ?? [])];
    const [step] = list.splice(i, 1);
    list.splice(i + by, 0, step!);
    commit(list);
}
function remove(i: number): void {
    const list = [...(steps.value ?? [])];
    list.splice(i, 1);
    commit(list);
}
const adding = ref<StepKind>("set_count");
function add(): void {
    commit([...(steps.value ?? []), newStep(adding.value)]);
}

const label = (kind: string): string =>
    ({
        set_count: t("datapack.mod.set_count", "Set how many"),
        set_damage: t("datapack.mod.set_damage", "Set durability"),
        enchant_with_levels: t("datapack.mod.enchant_with_levels", "Enchant as if with levels"),
        enchant_randomly: t("datapack.mod.enchant_randomly", "Enchant at random"),
        set_name: t("datapack.mod.set_name", "Rename"),
        set_lore: t("datapack.mod.set_lore", "Set lore"),
        furnace_smelt: t("datapack.mod.furnace_smelt", "Smelt it"),
        explosion_decay: t("datapack.mod.explosion_decay", "Lose some to explosions"),
    })[kind] ?? kind;

const kindItems = computed(() => STEP_KINDS.map((k) => ({ value: k, title: label(k) })));
</script>

<template>
    <section class="wl-mod" :aria-label="t('datapack.mod.title', 'Item modifier steps')">
        <p v-if="steps === null" class="wl-mod__note">
            {{ t("datapack.mod.invalid", "Fix the JSON below to edit these steps here.") }}
        </p>
        <template v-else>
            <p v-if="!steps.length" class="wl-mod__note">
                {{ t("datapack.mod.empty", "No steps yet. Add one to change the item.") }}
            </p>
            <ol class="wl-mod__list">
                <li v-for="(s, i) in steps" :key="i" class="wl-mod__step">
                    <div class="wl-mod__head">
                        <strong>{{ i + 1 }}. {{ s.kind === "other" ? s.name : label(s.kind) }}</strong>
                        <span class="wl-mod__tools">
                            <v-btn
                                size="small"
                                variant="text"
                                :disabled="i === 0"
                                :aria-label="t('datapack.mod.up', { n: i + 1 }, 'Move step {n} up')"
                                @click="move(i, -1)"
                                >↑</v-btn
                            >
                            <v-btn
                                size="small"
                                variant="text"
                                :disabled="i === steps.length - 1"
                                :aria-label="t('datapack.mod.down', { n: i + 1 }, 'Move step {n} down')"
                                @click="move(i, 1)"
                                >↓</v-btn
                            >
                            <v-btn
                                size="small"
                                variant="text"
                                color="error"
                                :aria-label="t('datapack.mod.remove', { n: i + 1 }, 'Remove step {n}')"
                                @click="remove(i)"
                                >{{ t("datapack.remove", "Remove") }}</v-btn
                            >
                        </span>
                    </div>
                    <template v-if="s.kind === 'set_count'">
                        <v-range-slider
                            :model-value="[s.min, s.max]"
                            :min="s.add ? -64 : 0"
                            :max="64"
                            :step="1"
                            thumb-label
                            hide-details
                            :label="t('datapack.mod.count', 'How many')"
                            @update:model-value="(v: number[]) => change(i, { min: v[0] ?? 0, max: v[1] ?? 0 })"
                        />
                        <v-switch
                            :model-value="s.add"
                            :label="t('datapack.mod.add', 'Add to what is there instead of replacing it')"
                            color="primary"
                            hide-details
                            density="compact"
                            @update:model-value="(v: boolean | null) => change(i, { add: v === true })"
                        />
                    </template>
                    <template v-else-if="s.kind === 'set_damage'">
                        <v-slider
                            :model-value="s.damage"
                            :min="s.add ? -1 : 0"
                            :max="1"
                            :step="0.05"
                            thumb-label
                            hide-details
                            :label="t('datapack.mod.damage', 'Durability left (1 is new)')"
                            @update:model-value="(v: number) => change(i, { damage: v })"
                        />
                        <v-switch
                            :model-value="s.add"
                            :label="t('datapack.mod.add', 'Add to what is there instead of replacing it')"
                            color="primary"
                            hide-details
                            density="compact"
                            @update:model-value="(v: boolean | null) => change(i, { add: v === true })"
                        />
                    </template>
                    <v-range-slider
                        v-else-if="s.kind === 'enchant_with_levels'"
                        :model-value="[s.min, s.max]"
                        :min="1"
                        :max="50"
                        :step="1"
                        thumb-label
                        hide-details
                        :label="t('datapack.mod.levels', 'Enchanting levels')"
                        @update:model-value="(v: number[]) => change(i, { min: v[0] ?? 0, max: v[1] ?? 0 })"
                    />
                    <v-text-field
                        v-else-if="s.kind === 'set_name'"
                        :model-value="s.name"
                        :label="t('datapack.mod.name', 'Name shown on the item')"
                        density="comfortable"
                        variant="outlined"
                        hide-details
                        @update:model-value="(v: string) => change(i, { name: v })"
                    />
                    <v-combobox
                        v-else-if="s.kind === 'set_lore'"
                        :model-value="s.lines"
                        :label="t('datapack.mod.lore', 'Lore lines, one per chip')"
                        multiple
                        chips
                        closable-chips
                        density="comfortable"
                        variant="outlined"
                        hide-details
                        @update:model-value="(v: string[]) => change(i, { lines: v })"
                    />
                    <p v-else-if="s.kind === 'other'" class="wl-mod__note">
                        {{
                            t(
                                "datapack.mod.kept",
                                "No editor for this one yet. It is kept exactly as written; change it in the JSON below.",
                            )
                        }}
                    </p>
                </li>
            </ol>
            <div class="wl-mod__add">
                <v-select
                    v-model="adding"
                    :items="kindItems"
                    :label="t('datapack.mod.kind', 'New step')"
                    density="comfortable"
                    variant="outlined"
                    hide-details
                />
                <v-btn variant="tonal" rounded="pill" @click="add">{{ t("datapack.mod.addStep", "Add step") }}</v-btn>
            </div>
        </template>
    </section>
</template>

<style scoped>
.wl-mod {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.wl-mod__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.wl-mod__step {
    border: 1px solid rgb(var(--v-theme-outline-variant, var(--v-theme-outline)));
    border-radius: 16px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.wl-mod__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
}
.wl-mod__tools {
    display: flex;
    gap: 2px;
}
.wl-mod__add {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}
.wl-mod__add > :first-child {
    flex: 1 1 14rem;
}
.wl-mod__note {
    margin: 0;
    color: rgb(var(--v-theme-on-surface-variant, var(--v-theme-on-surface)));
}
</style>
