<script setup lang="ts">
/**
 * An enchantment's value effects by level: which effect, add or multiply, the value at level
 * one and how much more per level, and "after an attack" actions: set on fire, or give a mob
 * effect, with who carries the enchantment and who it acts on. Effects of any other shape
 * (requirements, other actions) are listed by name and kept as written.
 * Design: `design-sources/datapacks-and-chunks/RegistryForms.dc.html`.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VCombobox, VSelect, VSlider } from "vuetify/components";
import { EFFECT_IDS } from "../mcserver/commandBuilderData.js";
import {
    VALUE_EFFECT_COMPONENTS,
    newAction,
    newEffect,
    parseObject,
    readEffects,
    writeEffects,
    type LevelValueEffect,
} from "./worldgenParts.js";

const props = defineProps<{ text: string }>();
const emit = defineEmits<{ "update:text": [text: string] }>();
const { t } = useI18n();

const doc = computed(() => parseObject(props.text));
const effects = computed(() => (doc.value === null ? null : readEffects(doc.value)));
const short = (id: string): string => id.replace(/^minecraft:/, "").replace(/_/g, " ");
function change(i: number, patch: Partial<LevelValueEffect>): void {
    if (!effects.value) return;
    emit("update:text", writeEffects(props.text, effects.value.map((e, k) => (k === i ? { ...e, ...patch } : e))));
}
function remove(i: number): void {
    if (!effects.value) return;
    emit("update:text", writeEffects(props.text, effects.value.filter((_, k) => k !== i)));
}
const adding = ref<string>(VALUE_EFFECT_COMPONENTS[0]);
function add(): void {
    emit("update:text", writeEffects(props.text, [...(effects.value ?? []), newEffect(adding.value)]));
}
const componentItems = VALUE_EFFECT_COMPONENTS.map((c) => ({ value: c, title: short(c) }));
function addAction(kind: "ignite" | "apply_mob_effect"): void {
    emit("update:text", writeEffects(props.text, [...(effects.value ?? []), newAction(kind)]));
}
function changeAction(i: number, patch: Partial<NonNullable<LevelValueEffect["action"]>>): void {
    const e = effects.value?.[i];
    if (!e?.action) return;
    change(i, { action: { ...e.action, ...patch } });
}
const parties = computed(() => [
    { value: "attacker", title: t("datapack.ench.attacker", "The attacker") },
    { value: "victim", title: t("datapack.ench.victim", "The one hit") },
]);
const mobEffects = [...EFFECT_IDS];
</script>

<template>
    <section class="wl-ee" :aria-label="t('datapack.ench.title', 'Effects by level')">
        <h3 class="wl-ee__title">{{ t("datapack.ench.title", "Effects by level") }}</h3>
        <p v-if="effects === null" class="wl-ee__note">{{ t("datapack.wg.invalid", "Fix the JSON below to edit this here.") }}</p>
        <template v-else>
            <p v-if="!effects.length" class="wl-ee__note">{{ t("datapack.ench.none", "No effects yet. Without one the enchantment does nothing.") }}</p>
            <div v-for="(e, i) in effects" :key="i" class="wl-ee__row">
                <strong>{{ e.action ? (e.action.kind === "ignite" ? t("datapack.ench.ignite", "After an attack: set on fire") : t("datapack.ench.applyEffect", "After an attack: give an effect")) : short(e.component) }}</strong>
                <template v-if="e.editable && e.action">
                    <v-select :model-value="e.action.enchanted" :items="parties" :label="t('datapack.ench.carrier', 'Whose enchantment')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: 'attacker' | 'victim') => changeAction(i, { enchanted: v })" />
                    <v-select :model-value="e.action.affected" :items="parties" :label="t('datapack.ench.target', 'Acts on')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: 'attacker' | 'victim') => changeAction(i, { affected: v })" />
                    <v-combobox v-if="e.action.kind === 'apply_mob_effect'" :model-value="e.action.mobEffect" :items="mobEffects" :label="t('datapack.ench.mobEffect', 'Effect')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: string | null) => v && changeAction(i, { mobEffect: v.includes(':') ? v : `minecraft:${v}` })" />
                    <v-slider v-if="e.action.kind === 'apply_mob_effect'" :model-value="e.action.amplifier" :min="0" :max="9" :step="1" thumb-label hide-details :label="t('datapack.ench.amplifier', 'Strength (0 is level I)')" @update:model-value="(v: number) => changeAction(i, { amplifier: v })" />
                    <v-slider :model-value="e.base" :min="0" :max="60" :step="0.5" thumb-label hide-details :label="e.action.kind === 'ignite' ? t('datapack.ench.fire', 'Burns for (seconds) at level 1') : t('datapack.ench.length', 'Lasts (seconds) at level 1')" @update:model-value="(v: number) => change(i, { base: v })" />
                    <v-slider :model-value="e.perLevel" :min="0" :max="30" :step="0.5" thumb-label hide-details :label="t('datapack.ench.perSecond', 'Seconds more per level')" @update:model-value="(v: number) => change(i, { perLevel: v })" />
                </template>
                <template v-else-if="e.editable">
                    <v-select
                        :model-value="e.operation"
                        :items="[
                            { value: 'add', title: t('datapack.ench.add', 'Add') },
                            { value: 'multiply', title: t('datapack.ench.multiply', 'Multiply') },
                        ]"
                        :label="t('datapack.ench.how', 'How')"
                        density="comfortable"
                        variant="outlined"
                        hide-details
                        @update:model-value="(v: 'add' | 'multiply') => change(i, { operation: v })"
                    />
                    <v-slider :model-value="e.base" :min="-10" :max="20" :step="0.5" thumb-label hide-details :label="t('datapack.ench.base', 'At level 1')" @update:model-value="(v: number) => change(i, { base: v })" />
                    <v-slider :model-value="e.perLevel" :min="-5" :max="10" :step="0.5" thumb-label hide-details :label="t('datapack.ench.per', 'More per level')" @update:model-value="(v: number) => change(i, { perLevel: v })" />
                </template>
                <span v-else class="wl-ee__note">{{ t("datapack.ench.kept", "Has conditions or actions with no editor yet; kept as written.") }}</span>
                <v-btn size="small" variant="text" color="error" :aria-label="t('datapack.ench.remove', { name: short(e.component) }, 'Remove effect {name}')" @click="remove(i)">{{ t("datapack.remove", "Remove") }}</v-btn>
            </div>
            <div class="wl-ee__add">
                <v-select v-model="adding" :items="componentItems" :label="t('datapack.ench.new', 'New effect')" density="comfortable" variant="outlined" hide-details />
                <v-btn variant="tonal" rounded="pill" @click="add">{{ t("datapack.ench.addEffect", "Add effect") }}</v-btn>
            </div>
            <div class="wl-ee__add">
                <v-btn variant="text" rounded="pill" @click="addAction('ignite')">{{ t("datapack.ench.addIgnite", "Add: set the one hit on fire") }}</v-btn>
                <v-btn variant="text" rounded="pill" @click="addAction('apply_mob_effect')">{{ t("datapack.ench.addMobEffect", "Add: give the one hit an effect") }}</v-btn>
            </div>
        </template>
    </section>
</template>

<style scoped>
.wl-ee {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.wl-ee__title {
    margin: 0;
    font: var(--md-sys-typescale-title-small, 500 0.875rem/1.25rem sans-serif);
}
.wl-ee__row {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) repeat(auto-fit, minmax(min(100%, 160px), 1fr));
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    border-radius: 16px;
    background: rgb(var(--v-theme-surface-container-high, var(--v-theme-surface-variant)));
}
.wl-ee__add {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
}
.wl-ee__add > :first-child {
    flex: 1 1 14rem;
}
.wl-ee__note {
    margin: 0;
    color: rgb(var(--v-theme-on-surface-variant, var(--v-theme-on-surface)));
}
</style>
