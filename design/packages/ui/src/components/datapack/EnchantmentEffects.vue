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
import { VBtn, VCombobox, VSelect, VSlider, VSwitch, VTextField } from "vuetify/components";
import { ATTRIBUTE_IDS, BLOCK_IDS, EFFECT_IDS, ENTITY_TYPE_IDS, PARTICLE_IDS, SOUND_IDS } from "../mcserver/commandBuilderData.js";
import {
    VALUE_EFFECT_COMPONENTS,
    newAction,
    newAttribute,
    newEffect,
    parseObject,
    readEffects,
    writeEffects,
    type LevelValueEffect,
} from "./worldgenParts.js";

const props = withDefaults(defineProps<{ text: string; namespace?: string }>(), { namespace: "my_pack" });
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
function addAction(kind: Parameters<typeof newAction>[0]): void {
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
const entities = [...ENTITY_TYPE_IDS];
const sounds = [...SOUND_IDS];
const particles = [...PARTICLE_IDS];
const blocks = [...BLOCK_IDS];
type When = "always" | "chance" | "is_sneaking" | "is_sprinting" | "is_on_fire" | "is_swimming" | "is_baby";
const whenOf = (a: NonNullable<LevelValueEffect["action"]>): When => a.flag ?? (a.chance !== undefined ? "chance" : "always");
const whenItems = computed(() => [
    { value: "always", title: t("datapack.ench.always", "Every time") },
    { value: "chance", title: t("datapack.ench.sometimes", "Only sometimes") },
    { value: "is_sneaking", title: t("datapack.ench.sneaking", "Only while sneaking") },
    { value: "is_sprinting", title: t("datapack.ench.sprinting", "Only while sprinting") },
    { value: "is_on_fire", title: t("datapack.ench.onFire", "Only while on fire") },
    { value: "is_swimming", title: t("datapack.ench.swimming", "Only while swimming") },
    { value: "is_baby", title: t("datapack.ench.baby", "Only for a baby") },
]);
function setWhen(i: number, w: When): void {
    if (w === "always") changeAction(i, { chance: undefined, flag: undefined });
    else if (w === "chance") changeAction(i, { chance: 0.5, flag: undefined });
    else changeAction(i, { chance: undefined, flag: w });
}
const attributes = [...ATTRIBUTE_IDS];
function changeAttribute(i: number, patch: Partial<NonNullable<LevelValueEffect["attribute"]>>): void {
    const e = effects.value?.[i];
    if (!e?.attribute) return;
    change(i, { attribute: { ...e.attribute, ...patch } });
}
function addAttribute(): void {
    const ns = props.namespace;
    emit("update:text", writeEffects(props.text, [...(effects.value ?? []), newAttribute(ns)]));
}
const actionTitle = (kind: string): string =>
    ({
        ignite: t("datapack.ench.ignite", "After an attack: set on fire"),
        apply_mob_effect: t("datapack.ench.applyEffect", "After an attack: give an effect"),
        summon_entity: t("datapack.ench.summon", "After an attack: summon"),
        explode: t("datapack.ench.explode", "After an attack: explode"),
        run_function: t("datapack.ench.runFunction", "After an attack: run a function"),
        play_sound: t("datapack.ench.playSound", "After an attack: play a sound"),
        damage_item: t("datapack.ench.damageItem", "After an attack: wear the item"),
        spawn_particles: t("datapack.ench.particles", "After an attack: show particles"),
        replace_block: t("datapack.ench.replaceBlock", "After an attack: place a block"),
    })[kind] ?? kind;
const interactions = computed(() => [
    { value: "none", title: t("datapack.ench.biNone", "Breaks no blocks") },
    { value: "block", title: t("datapack.ench.biBlock", "Breaks blocks, they drop") },
    { value: "mob", title: t("datapack.ench.biMob", "Like a mob explosion (follows mob griefing)") },
    { value: "tnt", title: t("datapack.ench.biTnt", "Like TNT (follows the TNT rule)") },
    { value: "trigger", title: t("datapack.ench.biTrigger", "Only presses buttons and the like") },
]);
</script>

<template>
    <section class="wl-ee" :aria-label="t('datapack.ench.title', 'Effects by level')">
        <h3 class="wl-ee__title">{{ t("datapack.ench.title", "Effects by level") }}</h3>
        <p v-if="effects === null" class="wl-ee__note">{{ t("datapack.wg.invalid", "Fix the JSON below to edit this here.") }}</p>
        <template v-else>
            <p v-if="!effects.length" class="wl-ee__note">{{ t("datapack.ench.none", "No effects yet. Without one the enchantment does nothing.") }}</p>
            <div v-for="(e, i) in effects" :key="i" class="wl-ee__row">
                <strong>{{ e.action ? actionTitle(e.action.kind) : e.attribute ? t("datapack.ench.attribute", "While equipped: change an attribute") : short(e.component) }}</strong>
                <template v-if="e.editable && e.attribute">
                    <v-combobox :model-value="e.attribute.attribute" :items="attributes" :label="t('datapack.ench.which', 'Attribute')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: string | null) => v && changeAttribute(i, { attribute: v.includes(':') ? v : `minecraft:${v}` })" />
                    <v-select
                        :model-value="e.attribute.operation"
                        :items="[
                            { value: 'add_value', title: t('datapack.ench.addValue', 'Add a number') },
                            { value: 'add_multiplied_base', title: t('datapack.ench.addBase', 'Add a share of the base') },
                            { value: 'add_multiplied_total', title: t('datapack.ench.addTotal', 'Multiply the total') },
                        ]"
                        :label="t('datapack.ench.how', 'How')"
                        density="comfortable"
                        variant="outlined"
                        hide-details
                        @update:model-value="(v: 'add_value' | 'add_multiplied_base' | 'add_multiplied_total') => changeAttribute(i, { operation: v })"
                    />
                    <v-slider :model-value="e.base" :min="-2" :max="10" :step="0.05" thumb-label hide-details :label="t('datapack.ench.base', 'At level 1')" @update:model-value="(v: number) => change(i, { base: v })" />
                    <v-slider :model-value="e.perLevel" :min="-1" :max="5" :step="0.05" thumb-label hide-details :label="t('datapack.ench.per', 'More per level')" @update:model-value="(v: number) => change(i, { perLevel: v })" />
                </template>
                <template v-else-if="e.editable && e.action">
                    <v-select :model-value="e.action.enchanted" :items="parties" :label="t('datapack.ench.carrier', 'Whose enchantment')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: 'attacker' | 'victim') => changeAction(i, { enchanted: v })" />
                    <v-select :model-value="e.action.affected" :items="parties" :label="t('datapack.ench.target', 'Acts on')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: 'attacker' | 'victim') => changeAction(i, { affected: v })" />
                    <v-combobox v-if="e.action.kind === 'apply_mob_effect'" :model-value="e.action.mobEffect" :items="mobEffects" :label="t('datapack.ench.mobEffect', 'Effect')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: string | null) => v && changeAction(i, { mobEffect: v.includes(':') ? v : `minecraft:${v}` })" />
                    <v-slider v-if="e.action.kind === 'apply_mob_effect'" :model-value="e.action.amplifier" :min="0" :max="9" :step="1" thumb-label hide-details :label="t('datapack.ench.amplifier', 'Strength (0 is level I)')" @update:model-value="(v: number) => changeAction(i, { amplifier: v })" />
                    <v-combobox v-if="e.action.kind === 'summon_entity'" :model-value="e.action.entity" :items="entities" :label="t('datapack.ench.entity', 'What appears')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: string | null) => v && changeAction(i, { entity: v.includes(':') ? v : `minecraft:${v}` })" />
                    <v-text-field v-if="e.action.kind === 'run_function'" :model-value="e.action.target" :label="t('datapack.ench.function', 'Function (namespace:path)')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: string) => changeAction(i, { target: v })" />
                    <v-combobox v-if="e.action.kind === 'play_sound'" :model-value="e.action.target" :items="sounds" :label="t('datapack.ench.sound', 'Sound')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: string | null) => v && changeAction(i, { target: v.includes(':') ? v : `minecraft:${v}` })" />
                    <v-combobox v-if="e.action.kind === 'replace_block'" :model-value="e.action.target" :items="blocks" :label="t('datapack.ench.block', 'Block placed at the one hit')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: string | null) => v && changeAction(i, { target: v.includes(':') ? v : `minecraft:${v}` })" />
                    <v-combobox v-if="e.action.kind === 'spawn_particles'" :model-value="e.action.target" :items="particles" :label="t('datapack.ench.particle', 'Particle')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: string | null) => v && changeAction(i, { target: v.includes(':') ? v : `minecraft:${v}` })" />
                    <template v-if="e.action.kind === 'explode'">
                        <v-select :model-value="e.action.blockInteraction" :items="interactions" :label="t('datapack.ench.blocks', 'What it does to blocks')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: 'none' | 'block' | 'mob' | 'tnt' | 'trigger') => changeAction(i, { blockInteraction: v })" />
                        <v-switch :model-value="e.action.createFire === true" :label="t('datapack.ench.createFire', 'Starts fires')" color="primary" density="compact" hide-details @update:model-value="(v: boolean | null) => changeAction(i, { createFire: v === true })" />
                    </template>
                    <template v-if="!['summon_entity', 'run_function', 'play_sound', 'spawn_particles', 'replace_block'].includes(e.action.kind)">
                        <v-slider :model-value="e.base" :min="0" :max="e.action.kind === 'explode' ? 16 : 60" :step="0.5" thumb-label hide-details :label="e.action.kind === 'ignite' ? t('datapack.ench.fire', 'Burns for (seconds) at level 1') : e.action.kind === 'explode' ? t('datapack.ench.radius', 'Radius (blocks) at level 1') : e.action.kind === 'damage_item' ? t('datapack.ench.wear', 'Durability used at level 1') : t('datapack.ench.length', 'Lasts (seconds) at level 1')" @update:model-value="(v: number) => change(i, { base: v })" />
                        <v-slider :model-value="e.perLevel" :min="0" :max="e.action.kind === 'explode' ? 4 : 30" :step="0.5" thumb-label hide-details :label="e.action.kind === 'explode' ? t('datapack.ench.perRadius', 'Radius more per level') : t('datapack.ench.perSecond', 'Seconds more per level')" @update:model-value="(v: number) => change(i, { perLevel: v })" />
                    </template>
                    <v-select :model-value="whenOf(e.action)" :items="whenItems" :label="t('datapack.ench.when', 'When')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: When) => setWhen(i, v)" />
                    <v-slider v-if="e.action.chance !== undefined" :model-value="Math.round(e.action.chance * 100)" :min="1" :max="100" :step="1" thumb-label hide-details :label="t('datapack.ench.chance', 'Chance (%)')" @update:model-value="(v: number) => changeAction(i, { chance: v / 100 })" />
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
                <v-btn variant="text" rounded="pill" @click="addAction('summon_entity')">{{ t("datapack.ench.addSummon", "Add: summon (lightning by default)") }}</v-btn>
                <v-btn variant="text" rounded="pill" @click="addAction('explode')">{{ t("datapack.ench.addExplode", "Add: explode") }}</v-btn>
                <v-btn variant="text" rounded="pill" @click="addAttribute">{{ t("datapack.ench.addAttribute", "Add: change an attribute while equipped") }}</v-btn>
                <v-btn variant="text" rounded="pill" @click="addAction('spawn_particles')">{{ t("datapack.ench.addParticles", "Add: show particles") }}</v-btn>
                <v-btn variant="text" rounded="pill" @click="addAction('replace_block')">{{ t("datapack.ench.addBlock", "Add: place a block (cobweb)") }}</v-btn>
                <v-btn variant="text" rounded="pill" @click="addAction('damage_item')">{{ t("datapack.ench.addWear", "Add: wear the item") }}</v-btn>
                <v-btn variant="text" rounded="pill" @click="addAction('run_function')">{{ t("datapack.ench.addFunction", "Add: run a function") }}</v-btn>
                <v-btn variant="text" rounded="pill" @click="addAction('play_sound')">{{ t("datapack.ench.addSound", "Add: play a sound") }}</v-btn>
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
