<script setup lang="ts">
/**
 * The sticker book. Each sticker names the real feature it was earned from, and pressing one opens
 * that feature, so the book doubles as a second route into the catalogue rather than a dead trophy
 * shelf. A sticker that has not been won says so plainly; nothing is hidden or teased.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VIcon } from "vuetify/components";
import type { CatalogueFeatureDefinition } from "../components/shell/index.js";
import { ALL_CATALOGUE_FEATURES, findFeature } from "../components/shell/catalogues.js";
import { KID_FEATURE_LABELS, kidAccessibleName } from "./kidLabels.js";

const props = defineProps<{
    stickers: readonly { id: string; feature: string; kid: string; icon: string; won: boolean; xp: number }[];
}>();
const emit = defineEmits<{ activate: [feature: CatalogueFeatureDefinition] }>();

const { t } = useI18n();

const wonCount = computed(() => props.stickers.filter((sticker) => sticker.won).length);

function open(featureName: string): void {
    const match = ALL_CATALOGUE_FEATURES.find((entry) => entry.nameFallback === featureName);
    const resolved = match ?? findFeature("make.while-it-runs.renders-in-progress");
    if (resolved !== null) emit("activate", resolved);
}
</script>

<template>
    <section class="wl-kid-stickers">
        <h1>{{ t("kid.stickers.title", "Sticker book") }}</h1>
        <p>
            {{
                t(
                    "kid.stickers.progress",
                    { won: String(wonCount), total: String(props.stickers.length) },
                    "{won} of {total} stickers won",
                )
            }}
            · {{ t("kid.stickers.blurb", "Every sticker is a real thing you did.") }}
        </p>
        <ul>
            <li v-for="sticker in props.stickers" :key="sticker.id">
                <button
                    type="button"
                    :class="{ 'is-locked': !sticker.won }"
                    :aria-label="kidAccessibleName(sticker.feature, KID_FEATURE_LABELS)"
                    @click="open(sticker.feature)"
                >
                    <span class="wl-kid-stickers__icon">
                        <v-icon :icon="sticker.icon" size="42" aria-hidden="true" />
                    </span>
                    <strong>{{ sticker.kid }}</strong>
                    <em>{{ sticker.feature }}</em>
                    <span>{{ sticker.won ? t("kid.stickers.won", "Won!") : t("kid.stickers.notYet", "Not yet") }}</span>
                </button>
            </li>
        </ul>
    </section>
</template>

<style scoped>
.wl-kid-stickers { padding: 20px 24px 28px; overflow: auto; }
.wl-kid-stickers h1 { margin: 0; font-size: 34px; font-weight: 800; }
.wl-kid-stickers > p { margin: 8px 0 0; font-size: 16px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-kid-stickers ul { list-style: none; margin: 18px 0 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 13px; }
.wl-kid-stickers button { width: 100%; min-height: 200px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 15px; border: 0; border-radius: var(--wl-kid-radius-lg); background: rgb(var(--v-theme-surface-container-lowest)); box-shadow: var(--wl-kid-press); font: inherit; cursor: pointer; }
.wl-kid-stickers__icon { width: 88px; height: 88px; display: grid; place-items: center; border-radius: 44px; background: rgb(var(--v-theme-tertiary-container)); color: rgb(var(--v-theme-on-tertiary-container)); }
.wl-kid-stickers button.is-locked { opacity: 0.45; }
.wl-kid-stickers strong { font-size: 21px; font-weight: 800; }
.wl-kid-stickers em { font-style: normal; font-size: 15px; color: rgb(var(--v-theme-outline)); }
</style>
