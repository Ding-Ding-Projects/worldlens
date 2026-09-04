<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VSelect } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";

export interface GhEntityPickerItem {
    readonly title: string;
    /**
     * The second line beneath the title. Read in four places in this file and folded into
     * the Vuetify item beneath, and never declared here -- so the component read a field its
     * own type said did not exist, and a caller passing one was refused by the type it was
     * passing to.
     */
    readonly subtitle?: string | undefined;
    readonly value: string;
    readonly searchText?: string | undefined;
    readonly props?: { readonly disabled?: boolean | undefined } | undefined;
}

const props = withDefaults(
    defineProps<{
        modelValue?: string | null | undefined;
        items: readonly GhEntityPickerItem[];
        searchLabel: string;
        selectLabel: string;
        selectedLabel: string;
        emptyMessage: string;
        noMatchMessage: string;
        hint?: string | undefined;
        disabled?: boolean | undefined;
        disabledReason?: string | null | undefined;
        dataTestBase: string;
    }>(),
    {
        modelValue: null,
        hint: "",
        disabled: false,
        disabledReason: null,
    },
);

const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();
const { t } = useI18n();

/** Each picker instance owns this whole quartet; no hidden state is shared with a sibling. */
const query = ref("");
const regex = ref(false);
const flags = ref("i");
const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));

function haystack(item: GhEntityPickerItem): string {
    return [item.title, item.subtitle ?? "", item.value, item.searchText ?? ""].join(" ");
}

const shown = computed(() =>
    props.items
        .filter((item) => matcher.value.test(haystack(item)))
        // Vuetify reads the row's second line and its disabled state out of `props`, so the
        // subtitle is folded in here rather than asked of every caller.
        .map((item) => ({
            ...item,
            props: {
                ...(item.props ?? {}),
                ...(item.subtitle === undefined || item.subtitle === ""
                    ? {}
                    : { subtitle: item.subtitle }),
            },
        })),
);
const sample = computed(() => props.items.map(haystack).join("\n"));

const summary = computed(() =>
    t(
        "settings.github.picker.summary",
        { shown: String(shown.value.length), total: String(props.items.length) },
        "Showing {shown} of {total} choices loaded from GitHub CLI.",
    ),
);
const selectedTitle = computed(() => {
    const value = props.modelValue?.trim() ?? "";
    if (value === "") return null;
    return props.items.find((item) => item.value === value)?.title ?? value;
});
</script>

<template>
    <div class="mb-gh-entity-picker" :data-test="dataTestBase">
        <ConfigSearchField
            v-model="query"
            v-model:regex="regex"
            v-model:flags="flags"
            :label="searchLabel"
            :sample="sample"
            :summary="summary"
            density="compact"
            :data-test="`${dataTestBase}-search`"
        />
        <VSelect
            v-if="shown.length > 0"
            :items="shown"
            :model-value="modelValue ?? null"
            :label="selectLabel"
            :hint="hint ?? ''"
            :persistent-hint="(hint ?? '') !== ''"
            :disabled="disabled === true"
            :title="disabledReason ?? ''"
            variant="outlined"
            density="compact"
            hide-details="auto"
            :data-test="`${dataTestBase}-select`"
            @update:model-value="(value: string | null) => emit('update:modelValue', value)"
        />
        <p
            v-else
            class="text-medium-emphasis"
            role="status"
            :data-test="`${dataTestBase}-${items.length === 0 ? 'empty' : 'no-match'}`"
        >
            {{ items.length === 0 ? emptyMessage : noMatchMessage }}
        </p>
        <p
            class="text-medium-emphasis mb-gh-entity-picker__selected"
            role="status"
            aria-live="polite"
            :data-test="`${dataTestBase}-selected`"
        >
            {{
                selectedTitle === null
                    ? t("settings.github.picker.noneSelected", "No value selected.")
                    : t(
                          "settings.github.picker.selected",
                          { label: selectedLabel, value: selectedTitle },
                          "{label}: {value}",
                      )
            }}
        </p>
        <p
            v-if="disabledReason"
            class="text-medium-emphasis"
            role="status"
            :data-test="`${dataTestBase}-disabled-reason`"
        >
            {{ disabledReason }}
        </p>
    </div>
</template>

<style scoped>
.mb-gh-entity-picker {
    display: grid;
    gap: 8px;
    min-inline-size: 0;
}

.mb-gh-entity-picker__selected {
    overflow-wrap: anywhere;
}
</style>
