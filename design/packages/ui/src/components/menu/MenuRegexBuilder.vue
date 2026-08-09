<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VChip,
    VChipGroup,
    VDivider,
    VTextarea,
} from "vuetify/components";
import {
    MAX_MATCHES,
    MAX_PATTERN_LENGTH,
    MAX_SAMPLE_LENGTH,
    SUPPORTED_FLAGS,
    evaluatePattern,
} from "./regex";

/**
 * Anchored regex builder for the menu search bars.
 *
 * Engine: the host runtime's own `RegExp` (ECMAScript), evaluated locally on this thread,
 * which is the same engine the search bar filters with, so a preview here cannot disagree
 * with the result there. Nothing is transmitted or persisted.
 */
const props = defineProps<{
    pattern: string;
    flags: string;
    /** Real corpus from the calling search surface, used as the default sample text. */
    sample: string;
}>();

const emit = defineEmits<{
    "update:pattern": [value: string];
    "update:flags": [value: string];
}>();

const { t } = useI18n();

const patternWrap = ref<HTMLElement | null>(null);
const sampleText = ref(props.sample);
const copyState = ref("");

watch(
    () => props.sample,
    (value) => {
        sampleText.value = value;
    },
);

const pattern = computed<string>({
    get: () => props.pattern,
    set: (value) => emit("update:pattern", value.slice(0, MAX_PATTERN_LENGTH)),
});

const selectedFlags = computed<string[]>({
    get: () => [...props.flags],
    set: (value) => emit("update:flags", value.join("")),
});

const evaluation = computed(() => evaluatePattern(props.pattern, props.flags, sampleText.value));

const captureNames = computed(() => {
    const names = new Set<string>();
    for (const match of evaluation.value.matches) {
        for (const name of Object.keys(match.named)) names.add(name);
    }
    return [...names];
});

interface Token {
    label: string;
    before: string;
    after?: string;
    hint: string;
}

interface TokenGroup {
    title: string;
    tokens: Token[];
}

const tokenGroups = computed<TokenGroup[]>(() => [
    {
        title: t("regexBuilder.group.classes", "Character classes"),
        tokens: [
            { label: "[abc]", before: "[", after: "]", hint: "any one of these characters" },
            { label: "[^abc]", before: "[^", after: "]", hint: "any character except these" },
            { label: "\\d", before: "\\d", hint: "any digit" },
            { label: "\\w", before: "\\w", hint: "any word character" },
            { label: "\\s", before: "\\s", hint: "any whitespace" },
            { label: ".", before: ".", hint: "any character except a line break" },
        ],
    },
    {
        title: t("regexBuilder.group.anchors", "Anchors"),
        tokens: [
            { label: "^", before: "^", hint: "start of text, or of a line with flag m" },
            { label: "$", before: "$", hint: "end of text, or of a line with flag m" },
            { label: "\\b", before: "\\b", hint: "word boundary" },
            { label: "\\B", before: "\\B", hint: "not a word boundary" },
        ],
    },
    {
        title: t("regexBuilder.group.groups", "Groups"),
        tokens: [
            { label: "( )", before: "(", after: ")", hint: "capturing group" },
            { label: "(?: )", before: "(?:", after: ")", hint: "group without capturing" },
            { label: "(?<n> )", before: "(?<name>", after: ")", hint: "named capturing group" },
            { label: "\\1", before: "\\1", hint: "back-reference to group 1" },
        ],
    },
    {
        title: t("regexBuilder.group.alternation", "Alternation"),
        tokens: [{ label: "|", before: "|", hint: "match the left side or the right side" }],
    },
    {
        title: t("regexBuilder.group.quantifiers", "Quantifiers"),
        tokens: [
            { label: "*", before: "*", hint: "zero or more" },
            { label: "+", before: "+", hint: "one or more" },
            { label: "?", before: "?", hint: "zero or one" },
            { label: "{2,5}", before: "{2,5}", hint: "between two and five" },
            { label: "*?", before: "*?", hint: "zero or more, as few as possible" },
        ],
    },
]);

function patternElement(): HTMLTextAreaElement | null {
    return patternWrap.value?.querySelector("textarea") ?? null;
}

function replaceSelection(before: string, after: string, transform?: (value: string) => string) {
    const element = patternElement();
    const current = props.pattern;

    if (!element) {
        emit("update:pattern", (current + before + after).slice(0, MAX_PATTERN_LENGTH));
        return;
    }

    const start = element.selectionStart ?? current.length;
    const end = element.selectionEnd ?? start;
    const selected = transform ? transform(current.slice(start, end)) : current.slice(start, end);
    const next = current.slice(0, start) + before + selected + after + current.slice(end);

    emit("update:pattern", next.slice(0, MAX_PATTERN_LENGTH));

    const caret = start + before.length + selected.length;
    void nextTick(() => {
        element.focus();
        element.setSelectionRange(caret, caret);
    });
}

function insertToken(token: Token): void {
    replaceSelection(token.before, token.after ?? "");
}

/** Escapes every ECMAScript metacharacter in the current selection (or the whole pattern). */
function escapeSelection(): void {
    const element = patternElement();
    if (element && element.selectionStart !== element.selectionEnd) {
        replaceSelection("", "", (value) => value.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&"));
        return;
    }
    emit("update:pattern", props.pattern.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&"));
}

async function copy(value: string, what: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(value);
        // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n compiles
        // the fallback as a message too and consumes `{what}` as its own named parameter, so
        // a later `replace` finds nothing left to substitute. Named args also spare the
        // pattern text a second mangling, since `replace` reads `$&` in a copied regex as a
        // substitution of its own.
        copyState.value = t("regexBuilder.copied", { what }, "Copied {what}");
    } catch {
        copyState.value = t("regexBuilder.copyFailed", "Could not reach the clipboard");
    }
}
</script>

<template>
    <v-card
        class="mb-regex-builder"
        role="dialog"
        :aria-label="t('regexBuilder.title', 'Regex builder')"
        max-width="420"
    >
        <v-card-text class="mb-regex-builder__body">
            <h3 class="mb-regex-builder__heading">{{ t("regexBuilder.title", "Regex builder") }}</h3>
            <p class="mb-regex-builder__engine">
                {{
                    t(
                        "regexBuilder.engine",
                        "ECMAScript RegExp, evaluated locally. Escape a literal with a backslash.",
                    )
                }}
            </p>

            <div ref="patternWrap">
                <v-textarea
                    v-model="pattern"
                    class="mb-regex-builder__pattern"
                    :label="t('regexBuilder.pattern', 'Pattern')"
                    :counter="MAX_PATTERN_LENGTH"
                    :maxlength="MAX_PATTERN_LENGTH"
                    rows="2"
                    auto-grow
                    density="compact"
                    variant="outlined"
                    spellcheck="false"
                    autocapitalize="off"
                    autocomplete="off"
                    hide-details="auto"
                    @keydown.stop
                />
            </div>

            <fieldset class="mb-regex-builder__flags">
                <legend>{{ t("regexBuilder.flags", "Flags") }}</legend>
                <v-chip-group v-model="selectedFlags" multiple column selected-class="text-primary">
                    <v-chip
                        v-for="flag in SUPPORTED_FLAGS"
                        :key="flag"
                        :value="flag"
                        size="small"
                        filter
                        variant="outlined"
                    >
                        {{ flag }}
                    </v-chip>
                </v-chip-group>
            </fieldset>

            <v-divider class="my-2" />

            <fieldset
                v-for="group in tokenGroups"
                :key="group.title"
                class="mb-regex-builder__tokens"
            >
                <legend>{{ group.title }}</legend>
                <v-btn
                    v-for="token in group.tokens"
                    :key="token.label"
                    size="small"
                    variant="tonal"
                    density="comfortable"
                    :title="token.hint"
                    :aria-label="`${token.label}: ${token.hint}`"
                    @click="insertToken(token)"
                >
                    {{ token.label }}
                </v-btn>
            </fieldset>

            <fieldset class="mb-regex-builder__tokens">
                <legend>{{ t("regexBuilder.group.literals", "Literals") }}</legend>
                <v-btn size="small" variant="tonal" density="comfortable" @click="escapeSelection">
                    {{ t("regexBuilder.escape", "Escape selection") }}
                </v-btn>
            </fieldset>

            <v-divider class="my-2" />

            <v-textarea
                v-model="sampleText"
                :label="t('regexBuilder.sample', 'Sample text')"
                :maxlength="MAX_SAMPLE_LENGTH"
                rows="3"
                density="compact"
                variant="outlined"
                spellcheck="false"
                hide-details="auto"
                @keydown.stop
            />

            <v-alert
                v-if="evaluation.error"
                type="error"
                density="compact"
                variant="tonal"
                class="mt-2"
                role="alert"
            >
                {{ evaluation.error }}
            </v-alert>

            <div class="mb-regex-builder__results" aria-live="polite">
                <p class="mb-regex-builder__summary">
                    <template v-if="!pattern">
                        {{ t("regexBuilder.noPattern", "No pattern yet.") }}
                    </template>
                    <template v-else-if="evaluation.error">
                        {{ t("regexBuilder.invalid", "Pattern is not valid, so nothing matches.") }}
                    </template>
                    <template v-else>
                        {{
                            t(
                                "regexBuilder.matchCount",
                                { count: evaluation.matches.length },
                                "{count} matches in the sample",
                            )
                        }}
                        <template v-if="evaluation.truncated">
                            {{
                                t(
                                    "regexBuilder.truncated",
                                    { max: MAX_MATCHES },
                                    "(stopped at {max})",
                                )
                            }}
                        </template>
                        <template v-if="evaluation.timedOut">
                            {{ t("regexBuilder.timedOut", "(stopped: pattern is too slow)") }}
                        </template>
                    </template>
                </p>

                <ol v-if="evaluation.matches.length" class="mb-regex-builder__matches">
                    <li v-for="(match, index) in evaluation.matches.slice(0, 12)" :key="index">
                        <code>{{ match.text || t("regexBuilder.empty", "(empty match)") }}</code>
                        <span class="mb-regex-builder__at">@{{ match.index }}</span>
                        <span v-if="match.groups.length" class="mb-regex-builder__groups">
                            {{ match.groups.map((g) => g ?? "-").join(" | ") }}
                        </span>
                    </li>
                </ol>

                <p v-if="captureNames.length" class="mb-regex-builder__summary">
                    {{ t("regexBuilder.namedGroups", "Named groups") }}:
                    {{ captureNames.join(", ") }}
                </p>
            </div>

            <div class="mb-regex-builder__actions">
                <v-btn
                    size="small"
                    variant="text"
                    :prepend-icon="mdiContentCopy"
                    @click="copy(pattern, t('regexBuilder.pattern', 'Pattern'))"
                >
                    {{ t("regexBuilder.copyPattern", "Copy pattern") }}
                </v-btn>
                <v-btn
                    size="small"
                    variant="text"
                    :prepend-icon="mdiContentCopy"
                    @click="copy(flags, t('regexBuilder.flags', 'Flags'))"
                >
                    {{ t("regexBuilder.copyFlags", "Copy flags") }}
                </v-btn>
            </div>
            <p class="mb-regex-builder__summary" aria-live="polite">{{ copyState }}</p>
        </v-card-text>
    </v-card>
</template>

<style>
/* ===========================================================================
 * This panel has to state its own surface, and that is not a stylistic choice.
 *
 * Vuetify's `useTeleport` appends `.v-overlay-container` to `<body>`, a sibling of `#app` -
 * `motion.scss` documents the same fact for the reduced-motion kill switch it puts out of
 * reach. So this card is outside `.v-application` *and* outside `.mb-shell-layer`, which
 * means every rule in `prototypeSurface.scss` that gives the application its card, its list
 * row, its button and its field misses it entirely. Left alone it renders in stock Vuetify:
 * a 4px corner, a Material 2 three-shadow elevation and an upper-cased button label, opened
 * from a field that is none of those things.
 *
 * That is why the block below spends the `md3.scss` tokens directly rather than reaching for
 * the shared classes. It is not a second opinion about what a card is; it is the same opinion
 * in the one place the shared sheet cannot be heard.
 * ------------------------------------------------------------------------- */
.mb-regex-builder.v-card {
    max-height: min(70vh, 640px);
    overflow-y: auto;

    /*
     * M3 puts a menu's container one step above the surface it opens over, which is what
     * stops an anchored panel from reading as a hole in the page behind it. Opaque, and
     * stated: this panel can be opened from the map menu, and everything that opens over a
     * terrain render in this application paints its own surface.
     */
    background: rgb(var(--v-theme-surface-container-high));
    color: rgb(var(--v-theme-on-surface));

    /*
     * The step between M3's menu corner (4dp, sized for a strip of commands) and its dialog
     * corner (28dp, sized for a full-screen decision). This is a 420px panel that declares
     * `role="dialog"` and is anchored like a menu, and `corner-lg` is both the scale step
     * that suits it and a hair off the 14px every card in the application already uses.
     */
    border-radius: var(--md-sys-shape-corner-lg);
    border: 1px solid rgb(var(--v-theme-outline-variant));

    /* M3's own elevation for a menu, from the two-shadow ladder rather than Vuetify's M2
       umbra/penumbra/ambient triple - which is the reason a stock Vuetify overlay looks
       heavier and muddier than an M3 one at the same nominal level. */
    box-shadow: var(--md-sys-elevation-shadow-level2);
}

.mb-regex-builder__body {
    padding: 12px 16px 16px;
}

/*
 * The panel's own headline, at M3's title-medium - the same ramp the drawer's header takes,
 * because they are the same kind of thing. The prose under it drops two full steps to
 * body-small, so "Regex builder" and "ECMAScript RegExp, evaluated locally" are told apart
 * by size and colour rather than by being read.
 */
.mb-regex-builder__heading {
    font-size: var(--md-sys-typescale-title-medium-size);
    line-height: var(--md-sys-typescale-title-medium-line-height);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    letter-spacing: var(--md-sys-typescale-title-medium-tracking);
    margin-block-end: 2px;
}

.mb-regex-builder__engine,
.mb-regex-builder__summary {
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    letter-spacing: var(--md-sys-typescale-body-small-tracking);
    margin-block: 4px;
    color: rgb(var(--v-theme-on-surface-variant));
}

/*
 * The token buttons and the flag chips, which are the panel's whole vocabulary and are
 * pressed far more often than anything else in it. Outside the shell layer they keep
 * Vuetify's Material 2 shape and upper-cased label, and a `\d` rendered upper-case is a
 * different pattern from the one on the button - so the label casing here is correctness
 * rather than taste. 40x40 is this project's floor for a target, and a row of eleven
 * 28px chips is exactly the case it was written for.
 *
 * The compound `.mb-regex-builder.v-card` at the front is what makes the floor survive
 * bilingual mode, and it is not decoration. `copy/bilingual.css` sizes every button and chip
 * in the application as `html[data-language-mode="bilingual"] .v-btn { height: auto;
 * min-height: 36px }` so a two-line label can push the box down - correct, and at (0,2,1) it
 * out-ranks a two-class rule here. A logical `min-block-size` and a physical `min-height`
 * cascade against each other as one property, so the 40px floor below would simply have
 * become 36px the moment somebody switched language, on the smallest targets in the whole
 * application: a one-character flag chip has no second line to grow it back. That exact
 * conflict has already been fixed once in this repository, on `MenuChoice.vue`'s segmented
 * buttons, which is why it is worth naming rather than leaving to be rediscovered.
 */
.mb-regex-builder.v-card .v-btn {
    border-radius: var(--md-sys-shape-corner-full);
    min-block-size: 40px;
    min-inline-size: 40px;
    font-size: var(--md-sys-typescale-label-large-size);
    font-weight: var(--md-sys-typescale-label-large-weight);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
    text-transform: none;
}

/*
 * M3 draws a filter chip at 32dp. These are drawn at 40, because this project's own floor for
 * a hit target is 40x40 and a one-character flag chip is the smallest thing in the whole
 * application to aim at - the case that floor exists for. `corner-sm` is M3's chip corner.
 *
 * Three deep for the bilingual reason given over the button rule above; a flag chip is the
 * single worst place in the application for a 40px floor to quietly become 36px.
 */
.mb-regex-builder.v-card .v-chip {
    border-radius: var(--md-sys-shape-corner-sm);
    min-block-size: 40px;
    font-size: var(--md-sys-typescale-label-large-size);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
}

.mb-regex-builder .v-field {
    border-radius: var(--md-sys-shape-corner-md);
}

.mb-regex-builder .v-divider {
    border-color: rgb(var(--v-theme-outline-variant));
    opacity: 1;
}

.mb-regex-builder .v-alert {
    border-radius: var(--md-sys-shape-corner-md);
}

.mb-regex-builder__pattern textarea,
.mb-regex-builder .mb-regex-builder__matches code {
    font-family: "Roboto Mono", ui-monospace, monospace;
}

.mb-regex-builder__flags,
.mb-regex-builder__tokens {
    border: none;
    padding: 0;
    margin: 4px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
}

/*
 * Each fieldset's legend is a section label for the row of tokens under it, so it takes the
 * same uppercase label-medium in the primary role that `mb-section-label` gives every other
 * heading in the design. Spelled out rather than classed, for the teleport reason at the top
 * of this block: `.v-application .mb-section-label` cannot reach a card inside
 * `.v-overlay-container`.
 */
.mb-regex-builder__flags legend,
.mb-regex-builder__tokens legend {
    width: 100%;
    padding: 0;
    font-size: var(--md-sys-typescale-label-medium-size);
    line-height: var(--md-sys-typescale-label-medium-line-height);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-primary));
}

.mb-regex-builder__matches {
    margin: 4px 0 0 1.2em;
    padding: 0;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    max-height: 9em;
    overflow-y: auto;
}

.mb-regex-builder__at,
.mb-regex-builder__groups {
    margin-inline-start: 6px;
    color: rgb(var(--v-theme-on-surface-variant));
}

.mb-regex-builder__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-block-start: 4px;
}
</style>
