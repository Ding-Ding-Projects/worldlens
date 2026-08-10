<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCodeBrackets, mdiMagnify, mdiRegex } from "@mdi/js";
import { VBtn, VIcon, VMenu, VTextField, VTooltip } from "vuetify/components";
import MenuRegexBuilder from "./MenuRegexBuilder.vue";
import { compilePattern } from "./regex";

/**
 * Search field for the menu surfaces, with the full regex builder anchored to this exact
 * field rather than parked in a distant dialog.
 *
 * Plain text is the default; the query only becomes a pattern once the user turns regex on.
 * The field's text *is* the pattern, so the query, the builder's raw editor, the flags and
 * the validation state cannot drift apart: there is one string, edited from two places.
 *
 * Replaces upstream `Menu/TextInput.vue`, and keeps its one piece of real behaviour:
 * keydown is stopped so typing does not drive the WASD/arrow camera controls.
 */
const props = withDefaults(
    defineProps<{
        modelValue: string;
        /** True when the query is treated as a regular expression. */
        regex?: boolean;
        /** Active flags, as a plain string such as "i" or "gim". */
        flags?: string;
        label?: string;
        placeholder?: string;
        /** Real corpus the builder previews against (one candidate per line). */
        sample?: string;
    }>(),
    { regex: false, flags: "i", label: "", placeholder: "", sample: "" },
);

const emit = defineEmits<{
    "update:modelValue": [value: string];
    "update:regex": [value: boolean];
    "update:flags": [value: string];
}>();

const { t } = useI18n();

const anchor = ref<HTMLElement | null>(null);
const builderOpen = ref(false);

const query = computed<string>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const flags = computed<string>({
    get: () => props.flags,
    set: (value) => emit("update:flags", value),
});

const error = computed(() => {
    if (!props.regex || !props.modelValue) return null;
    return compilePattern(props.modelValue, props.flags).error;
});

function toggleRegex(): void {
    emit("update:regex", !props.regex);
}

/**
 * Opening the builder turns regex mode on: the field's text becomes the pattern, so
 * inserting `\d` into a plain-text query would otherwise silently corrupt it. Closing the
 * builder leaves the mode alone; the user turns it back off with the regex toggle, and the
 * literal query is unchanged either way.
 */
function openBuilder(): void {
    if (!props.regex) emit("update:regex", true);
    builderOpen.value = !builderOpen.value;
}

// Vuetify restores focus to a focusable activator; ours is the wrapper, so do it by hand.
watch(builderOpen, (open) => {
    if (open) return;
    void nextTick(() => anchor.value?.querySelector("input")?.focus());
});
</script>

<template>
    <div ref="anchor" class="mb-menu-search">
        <v-text-field
            v-model="query"
            :label="label ?? ''"
            :placeholder="placeholder ?? ''"
            :prepend-inner-icon="mdiMagnify"
            :error-messages="error ? [error] : []"
            :aria-invalid="error ? 'true' : 'false'"
            density="compact"
            variant="outlined"
            hide-details="auto"
            clearable
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            @keydown.stop
        >
            <template #append-inner>
                <v-btn
                    class="mb-menu-search__toggle"
                    icon
                    :color="regex ? 'primary' : undefined"
                    :aria-pressed="regex ? 'true' : 'false'"
                    :aria-label="t('regexBuilder.toggle', 'Use a regular expression')"
                    variant="text"
                    size="small"
                    density="comfortable"
                    @click.stop="toggleRegex"
                >
                    <!-- VBtn ignores the `icon` path when the default slot is used, and the
                         tooltip has to be a child for `activator="parent"`. -->
                    <v-icon :icon="mdiRegex" />
                    <v-tooltip
                        activator="parent"
                        location="bottom"
                        :text="t('regexBuilder.toggle', 'Use a regular expression')"
                    />
                </v-btn>
                <v-btn
                    class="mb-menu-search__builder"
                    icon
                    :aria-label="t('regexBuilder.open', 'Open the regex builder')"
                    :aria-expanded="builderOpen ? 'true' : 'false'"
                    variant="text"
                    size="small"
                    density="comfortable"
                    @click.stop="openBuilder"
                >
                    <v-icon :icon="mdiCodeBrackets" />
                    <v-tooltip
                        activator="parent"
                        location="bottom"
                        :text="t('regexBuilder.open', 'Open the regex builder')"
                    />
                </v-btn>
            </template>
        </v-text-field>

        <v-menu
            v-model="builderOpen"
            :activator="anchor ?? undefined"
            :close-on-content-click="false"
            location="bottom start"
            origin="auto"
            offset="4"
        >
            <MenuRegexBuilder v-model:pattern="query" v-model:flags="flags" :sample="sample ?? ''" />
        </v-menu>
    </div>
</template>

<style>
/*
 * The prototype's own search box, which it draws directly above this menu's rows: 44px tall,
 * a 12px corner, filled in the container tint with a hairline around it, a leading glyph in
 * the variant colour and the regex affordance at the trailing end. Nothing about the field's
 * *behaviour* is touched - the anchored builder, the error message, the invalid state and the
 * focus ring are Vuetify's and are what make a field usable rather than pretty, and
 * `prototypeSurface.scss` says at length why those must stay Vuetify's.
 */
.mb-menu-search {
    padding: 8px 12px;
}

/*
 * 12px is `corner-md`, which is the prototype's search-box corner exactly and the same corner
 * every row below it takes - a field and the list it filters reading as one control is most of
 * what makes this panel look designed rather than assembled.
 *
 * Three classes deep for the reason that recurs through this directory: `prototypeSurface.scss`
 * reaches `.mb-shell-layer .v-field` at two, and it is imported after every component's style
 * block, so a two-class rule here would tie and lose. The corner happens to be the same 12px
 * in both, but the fill and the height below it are not stated there at all and would simply
 * have gone missing had the whole rule been outranked.
 */
.v-application .mb-menu-search .v-field {
    border-radius: var(--md-sys-shape-corner-md);
    /*
     * The prototype's box is filled `surface-container` with a hairline, not the transparent
     * well Vuetify's outlined variant leaves. Filled rather than transparent matters here for
     * the same reason the drawer itself is opaque: this field can sit a few pixels above a
     * terrain render, and a transparent input with a 1px outline over trees is not an input.
     * The outlined variant is kept rather than swapped for `filled`, because its notched
     * outline is what carries the error ring this field puts a bad pattern in.
     */
    background: rgb(var(--v-theme-surface-container));

    /*
     * The prototype's box is 44px. 48 is the next step up on the 4dp rhythm and is also the
     * drawer's own row height, so the field and the first row beneath it are the same size
     * rather than four pixels apart - and it is what actually contains the two 40x40 trailing
     * targets below without them touching the outline.
     */
    min-block-size: 48px;
}

/*
 * Both trailing affordances are real 40x40 targets rather than the 34px `size="small"` alone
 * would leave them at. They are the only controls in the drawer a person reaches for while
 * already typing, so they are the last place to save four pixels.
 *
 * The `.v-application` prefix is what carries the size into bilingual mode. `copy/bilingual.css`
 * releases every button's fixed height so a second language can push the box down -
 * `html[data-language-mode="bilingual"] .v-btn { height: auto; min-height: 36px }` at (0,2,1),
 * which out-ranks a two-class rule here and would leave these two at 36px. Neither of them
 * carries a label at all, so there is no second line to grow them back: they would simply have
 * been four pixels short in one language mode, on the two controls that open the search and
 * the regex builder.
 */
.v-application .mb-menu-search .mb-menu-search__toggle,
.v-application .mb-menu-search .mb-menu-search__builder {
    margin-inline-start: 2px;
    inline-size: 40px;
    block-size: 40px;
}
</style>
