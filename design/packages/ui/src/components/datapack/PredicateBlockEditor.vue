<script setup lang="ts">
/** One predicate block and, for groups, the blocks inside it. Recursive. */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VCombobox, VSelect, VSlider, VSwitch, VTextField } from "vuetify/components";
import { ITEM_IDS } from "../mcserver/commandBuilderData.js";
import type { PredicateBlock } from "./datapackModel.js";

const props = defineProps<{ block: PredicateBlock; depth?: number }>();
const emit = defineEmits<{ remove: [] }>();
const { t } = useI18n();
void ITEM_IDS;

const KINDS: { value: PredicateBlock["kind"]; title: string }[] = [
    { value: "all", title: "All of" },
    { value: "any", title: "Any of" },
    { value: "not", title: "Not" },
    { value: "weather", title: "Weather" },
    { value: "chance", title: "Random chance" },
    { value: "biome", title: "In biome" },
    { value: "time", title: "Time of day" },
    { value: "score", title: "Score" },
];
const BIOMES = [
    "plains",
    "forest",
    "desert",
    "taiga",
    "jungle",
    "swamp",
    "savanna",
    "badlands",
    "ocean",
    "river",
    "snowy_plains",
    "mushroom_fields",
    "dark_forest",
    "cherry_grove",
    "meadow",
    "deep_dark",
];

function fresh(kind: PredicateBlock["kind"]): PredicateBlock {
    switch (kind) {
        case "all":
        case "any":
            return { kind, children: [] };
        case "not":
            return { kind, child: null };
        case "weather":
            return { kind, raining: true, thundering: false };
        case "chance":
            return { kind, chance: 0.5 };
        case "biome":
            return { kind, biome: "plains" };
        case "time":
            return { kind, min: 0, max: 12000 };
        case "score":
            return { kind, objective: "", min: 1, max: 100 };
    }
}
const adding = ref<PredicateBlock["kind"] | null>(null);
function onAdd(kind: PredicateBlock["kind"] | null): void {
    if (kind) addChild(kind);
    adding.value = null;
}
function addChild(kind: PredicateBlock["kind"]): void {
    const b = props.block;
    if (b.kind === "all" || b.kind === "any") b.children.push(fresh(kind));
    else if (b.kind === "not") b.child = fresh(kind);
}
const group = (b: PredicateBlock): boolean =>
    b.kind === "all" || b.kind === "any" || b.kind === "not";
</script>

<template>
    <div
        class="wl-pb"
        :class="group(block) ? 'is-group' : 'is-leaf'"
        :style="{ marginLeft: `${(depth ?? 0) ? 20 : 0}px` }"
    >
        <div class="wl-pb__head">
            <strong>{{ KINDS.find((k) => k.value === block.kind)?.title }}</strong>
            <v-btn
                v-if="(depth ?? 0) > 0"
                size="x-small"
                variant="text"
                :aria-label="t('datapack.pred.remove', 'Remove this block')"
                @click="emit('remove')"
                >✕</v-btn
            >
        </div>
        <template v-if="block.kind === 'weather'">
            <v-switch
                v-model="block.raining"
                color="primary"
                hide-details
                density="compact"
                :label="t('datapack.pred.raining', 'Raining')"
            />
            <v-switch
                v-model="block.thundering"
                color="primary"
                hide-details
                density="compact"
                :label="t('datapack.pred.thunder', 'Thundering')"
            />
        </template>
        <v-slider
            v-else-if="block.kind === 'chance'"
            v-model="block.chance"
            :min="0"
            :max="1"
            :step="0.01"
            thumb-label
            :label="
                t(
                    'datapack.pred.chance',
                    { pct: Math.round(block.chance * 100) },
                    '{pct}% of the time',
                )
            "
            hide-details
        />
        <v-combobox
            v-else-if="block.kind === 'biome'"
            v-model="block.biome"
            :items="BIOMES"
            :label="t('datapack.pred.biome', 'Biome')"
            density="compact"
            variant="outlined"
            hide-details
        />
        <v-slider
            v-else-if="block.kind === 'time'"
            v-model="block.max"
            :min="block.min"
            :max="24000"
            :step="100"
            thumb-label
            :label="
                t(
                    'datapack.pred.time',
                    { from: block.min, to: block.max },
                    'Ticks {from} to {to} of the day',
                )
            "
            hide-details
        />
        <div v-else-if="block.kind === 'score'" class="wl-pb__row">
            <v-text-field
                v-model="block.objective"
                :label="t('datapack.pred.objective', 'Scoreboard objective')"
                density="compact"
                variant="outlined"
                hide-details
            />
            <v-text-field
                v-model.number="block.min"
                type="number"
                :label="t('datapack.pred.min', 'At least')"
                density="compact"
                variant="outlined"
                hide-details
            />
            <v-text-field
                v-model.number="block.max"
                type="number"
                :label="t('datapack.pred.max', 'At most')"
                density="compact"
                variant="outlined"
                hide-details
            />
        </div>
        <template v-if="block.kind === 'all' || block.kind === 'any'">
            <PredicateBlockEditor
                v-for="(c, i) in block.children"
                :key="i"
                :block="c"
                :depth="(depth ?? 0) + 1"
                @remove="block.children.splice(i, 1)"
            />
        </template>
        <PredicateBlockEditor
            v-if="block.kind === 'not' && block.child"
            :block="block.child"
            :depth="(depth ?? 0) + 1"
            @remove="block.child = null"
        />
        <v-select
            v-if="
                block.kind === 'all' ||
                block.kind === 'any' ||
                (block.kind === 'not' && !block.child)
            "
            :model-value="adding"
            :items="KINDS"
            :label="t('datapack.pred.add', 'Add a block')"
            density="compact"
            variant="outlined"
            hide-details
            class="wl-pb__add"
            @update:model-value="onAdd"
        />
    </div>
</template>

<style scoped>
.wl-pb {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 14px;
    margin-top: 6px;
}
.wl-pb.is-group {
    background: rgba(var(--v-theme-tertiary), 0.12);
    border-left: 0;
}
.wl-pb.is-leaf {
    background: rgba(var(--v-theme-secondary), 0.12);
}
.wl-pb__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font:
        500 13px Roboto,
        sans-serif;
}
.wl-pb__row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
.wl-pb__add {
    max-width: 220px;
}
</style>
