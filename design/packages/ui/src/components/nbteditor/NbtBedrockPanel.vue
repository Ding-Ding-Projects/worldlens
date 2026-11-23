<script setup lang="ts">
/**
 * A Bedrock world's records, read from its LevelDB `db` folder: players, world records and each
 * chunk's records, searchable, with the NBT ones openable (read-only) in the editor.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VBtnToggle, VTextField } from "vuetify/components";
import type { BedrockRecord } from "./nbtEditorBridge.js";

const props = defineProps<{
    records: readonly BedrockRecord[];
    problems: readonly string[];
    openKey: string | null;
}>();
const emit = defineEmits<{ open: [key: string] }>();
const { t } = useI18n();

const group = ref<"nbt" | "all">("nbt");
const query = ref("");
const LIMIT = 500;
const shown = computed(() => {
    const q = query.value.trim().toLowerCase();
    return props.records.filter(
        (r) => (group.value === "all" || r.nbt) && (q === "" || r.label.toLowerCase().includes(q)),
    );
});
const size = (n: number): string => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
</script>

<template>
    <section class="wl-bedrock" :aria-label="t('nbt.bedrock.title', 'Bedrock world records')">
        <h3 class="wl-bedrock__title">{{ t("nbt.bedrock.title", "Bedrock world records") }}</h3>
        <p class="wl-bedrock__note">
            {{
                t(
                    "nbt.bedrock.note",
                    "Read from the world's db folder. Records open read-only for now.",
                )
            }}
        </p>
        <v-btn-toggle
            v-model="group"
            mandatory
            density="compact"
            rounded="pill"
            variant="outlined"
            :aria-label="t('nbt.bedrock.show', 'Show')"
        >
            <v-btn value="nbt" size="small">{{ t("nbt.bedrock.nbtOnly", "NBT records") }}</v-btn>
            <v-btn value="all" size="small">{{ t("nbt.bedrock.all", "Everything") }}</v-btn>
        </v-btn-toggle>
        <v-text-field
            v-model="query"
            :label="t('nbt.bedrock.search', 'Search records')"
            density="compact"
            variant="outlined"
            hide-details
            clearable
        />
        <p class="wl-bedrock__note">
            {{
                t(
                    "nbt.bedrock.count",
                    { shown: Math.min(shown.length, LIMIT), total: records.length },
                    "Showing {shown} of {total}",
                )
            }}
        </p>
        <ul class="wl-bedrock__list" role="list">
            <li v-for="r in shown.slice(0, LIMIT)" :key="r.key">
                <button
                    type="button"
                    class="wl-bedrock__item"
                    :disabled="!r.nbt"
                    :aria-current="r.key === openKey ? 'true' : undefined"
                    @click="emit('open', r.key)"
                >
                    <span>{{ r.label }}</span
                    ><span class="wl-bedrock__size">{{
                        r.nbt ? size(r.size) : t("nbt.bedrock.binary", "not NBT")
                    }}</span>
                </button>
            </li>
        </ul>
        <ul v-if="problems.length" class="wl-bedrock__problems" role="list">
            <li v-for="p in problems" :key="p">{{ p }}</li>
        </ul>
    </section>
</template>

<style scoped>
.wl-bedrock {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
}
.wl-bedrock__title {
    margin: 0;
    font:
        500 14px/20px Roboto,
        sans-serif;
}
.wl-bedrock__note {
    margin: 0;
    font:
        400 12px/16px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-bedrock__list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 420px;
    overflow: auto;
}
.wl-bedrock__item {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 40px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: inherit;
    font:
        400 13px Roboto,
        sans-serif;
    text-align: left;
    cursor: pointer;
}
.wl-bedrock__item:hover:not(:disabled) {
    background: rgba(var(--v-theme-on-surface), 0.06);
}
.wl-bedrock__item:disabled {
    cursor: default;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-bedrock__item[aria-current="true"] {
    background: rgb(var(--v-theme-secondary-container, var(--v-theme-secondary)));
}
.wl-bedrock__item:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
.wl-bedrock__size {
    font:
        400 12px "Roboto Mono",
        monospace;
    color: rgb(var(--v-theme-on-surface-variant));
    white-space: nowrap;
}
.wl-bedrock__problems {
    margin: 0;
    padding-left: 18px;
    color: rgb(var(--v-theme-error));
    font:
        400 12px/16px Roboto,
        sans-serif;
}
</style>
