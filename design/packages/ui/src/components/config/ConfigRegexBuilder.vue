<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiBackspaceOutline, mdiClose, mdiContentCopy, mdiRegex } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VCheckbox, VChip, VDivider, VIcon, VTextarea } from "vuetify/components";
import {
    MAX_EVAL_MS,
    MAX_MATCHES,
    MAX_PATTERN_LENGTH,
    MAX_SAMPLE_LENGTH,
    SUPPORTED_FLAGS,
    escapeLiteral,
    evaluatePattern,
} from "./regexEngine.js";

/**
 * The full regex builder for the settings search bars.
 *
 * It is anchored beside the field that opened it, and it is bound to that field:
 * the pattern and flags are two-way props, so typing in the raw editor changes
 * the search immediately and typing in the search bar changes the editor.
 *
 * The engine is stated in the interface, not only in a comment, because a
 * builder whose dialect a user has to guess is a builder they cannot trust:
 * ECMAScript `RegExp`, evaluated locally on this thread, which is the same
 * engine `createSettingMatcher` filters settings with. Nothing is transmitted
 * and nothing is persisted.
 */
const props = defineProps<{
    pattern: string;
    flags: string;
    /** Real text from the surface that opened this, one candidate per line. */
    sample: string;
}>();

const emit = defineEmits<{ "update:pattern": [value: string]; "update:flags": [value: string] }>();

const { t } = useI18n();

const patternWrap = ref<HTMLElement | null>(null);
const sampleText = ref(props.sample);
const copyState = ref("");

/**
 * Keeps ordinary typing in the pattern and sample fields from leaking out to whatever
 * hosts this popover, without also swallowing Escape.
 *
 * A bare `@keydown.stop` did both: `ConfigSearchField.vue` opens this builder in a
 * `v-menu`, and `VMenu` closes on Escape through a window-level listener it attaches for
 * itself rather than one this component owns, so stopping every key here meant Escape
 * never reached it and the popover looked unresponsive to the one key every other overlay
 * in this app answers to. Matches the fix already applied to `markers/RegexBuilder.vue`,
 * the marker search field's own builder.
 */
function stopUnlessEscape(event: KeyboardEvent): void {
    if (event.key !== "Escape") event.stopPropagation();
}

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

const namedGroups = computed(() => {
    const names = new Set<string>();
    for (const match of evaluation.value.matches) {
        for (const group of match.groups) {
            if (!/^\d+$/.test(group.name)) names.add(group.name);
        }
    }
    return [...names];
});

interface Token {
    readonly label: string;
    readonly before: string;
    readonly after?: string;
    readonly hint: string;
    /** The one- or two-word name the design prints beside the token on its chip. */
    readonly short: string;
}

interface TokenGroup {
    readonly title: string;
    readonly tokens: readonly Token[];
}

const tokenGroups = computed<TokenGroup[]>(() => [
    {
        title: t("config.regex.group.classes", "Character classes"),
        tokens: [
            { label: "[abc]", before: "[", after: "]", hint: t("config.regex.hint.set", "any one of these characters"), short: t("config.regex.short.anyOf", "any of") },
            { label: "[^abc]", before: "[^", after: "]", hint: t("config.regex.hint.notSet", "any character except these"), short: t("config.regex.short.noneOf", "none of") },
            { label: "\\d", before: "\\d", hint: t("config.regex.hint.digit", "any digit"), short: t("config.regex.short.digit", "digit") },
            { label: "\\w", before: "\\w", hint: t("config.regex.hint.word", "any word character"), short: t("config.regex.short.word", "word") },
            { label: "\\s", before: "\\s", hint: t("config.regex.hint.space", "any whitespace"), short: t("config.regex.short.space", "space") },
            { label: ".", before: ".", hint: t("config.regex.hint.any", "any character except a line break"), short: t("config.regex.short.anyChar", "any") },
        ],
    },
    {
        title: t("config.regex.group.anchors", "Anchors"),
        tokens: [
            { label: "^", before: "^", hint: t("config.regex.hint.start", "start of text, or of a line with flag m"), short: t("config.regex.short.start", "start") },
            { label: "$", before: "$", hint: t("config.regex.hint.end", "end of text, or of a line with flag m"), short: t("config.regex.short.end", "end") },
            { label: "\\b", before: "\\b", hint: t("config.regex.hint.boundary", "word boundary"), short: t("config.regex.short.edge", "edge") },
            { label: "\\B", before: "\\B", hint: t("config.regex.hint.notBoundary", "not a word boundary"), short: t("config.regex.short.notEdge", "not edge") },
        ],
    },
    {
        title: t("config.regex.group.groups", "Groups"),
        tokens: [
            { label: "( )", before: "(", after: ")", hint: t("config.regex.hint.capture", "capturing group"), short: t("config.regex.short.group", "group") },
            { label: "(?: )", before: "(?:", after: ")", hint: t("config.regex.hint.noCapture", "group without capturing"), short: t("config.regex.short.silent", "silent") },
            { label: "(?<n> )", before: "(?<name>", after: ")", hint: t("config.regex.hint.named", "named capturing group"), short: t("config.regex.short.named", "named") },
            { label: "\\1", before: "\\1", hint: t("config.regex.hint.backref", "back-reference to group 1"), short: t("config.regex.short.again", "again") },
            { label: "(?= )", before: "(?=", after: ")", hint: t("config.regex.hint.lookahead", "followed by"), short: t("config.regex.short.ahead", "ahead") },
            { label: "(?! )", before: "(?!", after: ")", hint: t("config.regex.hint.negLookahead", "not followed by"), short: t("config.regex.short.notAhead", "not ahead") },
        ],
    },
    {
        title: t("config.regex.group.alternation", "Alternation"),
        tokens: [
            {
                label: "|",
                before: "|",
                hint: t("config.regex.hint.or", "match the left side or the right side"),
                short: t("config.regex.short.or", "or"),
            },
        ],
    },
    {
        title: t("config.regex.group.quantifiers", "Quantifiers"),
        tokens: [
            { label: "*", before: "*", hint: t("config.regex.hint.star", "zero or more"), short: t("config.regex.short.zeroPlus", "0+") },
            { label: "+", before: "+", hint: t("config.regex.hint.plus", "one or more"), short: t("config.regex.short.onePlus", "1+") },
            { label: "?", before: "?", hint: t("config.regex.hint.opt", "zero or one"), short: t("config.regex.short.optional", "optional") },
            { label: "{2,5}", before: "{2,5}", hint: t("config.regex.hint.range", "between two and five"), short: t("config.regex.short.exactly", "2 to 5") },
            { label: "*?", before: "*?", hint: t("config.regex.hint.lazy", "zero or more, as few as possible"), short: t("config.regex.short.lazy", "lazy") },
        ],
    },
]);

function patternElement(): HTMLTextAreaElement | null {
    return patternWrap.value?.querySelector("textarea") ?? null;
}

function replaceSelection(before: string, after: string, transform?: (value: string) => string): void {
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

/** Escapes every metacharacter in the selection, or in the whole pattern. */
function escapeSelection(): void {
    const element = patternElement();
    if (element && element.selectionStart !== element.selectionEnd) {
        replaceSelection("", "", escapeLiteral);
        return;
    }
    emit("update:pattern", escapeLiteral(props.pattern));
}

/** Every literal string a token button can insert, longest first, for the backspace below. */
const insertedPieces = computed(() =>
    [...new Set(tokenGroups.value.flatMap((group) => group.tokens.flatMap((token) => [token.before + (token.after ?? ""), token.before, token.after ?? ""])))]
        .filter((piece) => piece.length > 0)
        .sort((a, b) => b.length - a.length),
);

/**
 * Removes the last token rather than the last character.
 *
 * A pattern built from the chips is a sequence of tokens, so the one-press undo is the last
 * token: `(?<name>` goes in one press and comes out in one. An escaped character (`\.`) is
 * one token too, and anything typed by hand falls back to a single character.
 */
function deleteLastToken(): void {
    const current = props.pattern;
    if (current === "") return;
    const piece = insertedPieces.value.find((candidate) => current.endsWith(candidate));
    const escaped = /\\.$/u.test(current) ? 2 : 0;
    const cut = Math.max(piece?.length ?? 0, escaped, 1);
    emit("update:pattern", current.slice(0, current.length - cut));
}

/** The flag's own letter beside what it does, so neither has to be guessed from the other. */
function flagLabel(flag: string): string {
    const names: Record<string, string> = {
        g: t("config.regex.flag.g", "every match"),
        i: t("config.regex.flag.i", "ignore case"),
        m: t("config.regex.flag.m", "multiline"),
        s: t("config.regex.flag.s", "dot matches newline"),
        u: t("config.regex.flag.u", "Unicode"),
        y: t("config.regex.flag.y", "sticky"),
    };
    return `${names[flag] ?? flag} (${flag})`;
}

async function copy(value: string, what: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(value);
        // `t(key, named, fallback)` throughout this file, never `t(key, fallback).replace(...)`:
        // vue-i18n compiles the message itself, so it consumes `{what}` and the limit numbers
        // as its own named parameters and a later `replace` finds nothing left to substitute.
        copyState.value = t("config.regex.copied", { what }, "Copied {what} exactly as it is written.");
    } catch {
        copyState.value = t("config.regex.copyFailed", "Could not reach the clipboard.");
    }
}
</script>

<template>
    <v-card
        class="mb-config-regex"
        role="dialog"
        :aria-label="t('config.regex.title', 'Regex builder')"
        variant="flat"
    >
        <v-card-text class="mb-config-regex__body">
            <header class="mb-config-regex__head">
                <v-icon :icon="mdiRegex" size="20" color="primary" aria-hidden="true" />
                <h3 class="mb-config-regex__heading">{{ t("config.regex.title", "Regex builder") }}</h3>
                <span class="mb-config-regex__anchored">
                    {{ t("config.regex.anchored", "anchored to the field it belongs to") }}
                </span>
            </header>
            <p class="mb-config-regex__lead">
                {{
                    t(
                        "config.regex.engine",
                        "ECMAScript RegExp, the same engine the search itself runs, evaluated on this machine. Nothing is sent anywhere.",
                    )
                }}
            </p>

            <div ref="patternWrap">
                <v-textarea
                    v-model="pattern"
                    class="mb-config-regex__pattern"
                    :label="t('config.regex.pattern', 'Pattern')"
                    :counter="MAX_PATTERN_LENGTH"
                    :maxlength="MAX_PATTERN_LENGTH"
                    rows="1"
                    auto-grow
                    density="compact"
                    variant="outlined"
                    color="primary"
                    spellcheck="false"
                    autocapitalize="off"
                    autocomplete="off"
                    hide-details="auto"
                    @keydown="stopUnlessEscape"
                >
                    <template #append-inner>
                        <v-btn
                            :icon="mdiBackspaceOutline"
                            :disabled="pattern === ''"
                            :aria-label="t('config.regex.backspace', 'Delete the last token')"
                            variant="text"
                            size="small"
                            density="comfortable"
                            @click="deleteLastToken"
                        />
                        <v-btn
                            :icon="mdiClose"
                            :disabled="pattern === ''"
                            :aria-label="t('config.regex.clear', 'Clear the pattern')"
                            variant="text"
                            size="small"
                            density="comfortable"
                            @click="emit('update:pattern', '')"
                        />
                    </template>
                </v-textarea>
            </div>

            <!--
                One wrapping row of assist chips, as the design draws it, with each family of
                tokens still announced as its own group so the classes, anchors, groups,
                alternation and quantifiers stay told apart for assistive technology.
            -->
            <div class="mb-config-regex__tokens">
                <div
                    v-for="group in tokenGroups"
                    :key="group.title"
                    role="group"
                    :aria-label="group.title"
                    class="mb-config-regex__group"
                >
                    <v-chip
                        v-for="token in group.tokens"
                        :key="token.label"
                        class="mb-config-regex__token"
                        variant="outlined"
                        :title="token.hint"
                        :aria-label="`${token.label}: ${token.hint}`"
                        @click="insertToken(token)"
                    >
                        <code class="mb-config-regex__tok">{{ token.label }}</code>
                        <span class="mb-config-regex__tokHint">{{ token.short }}</span>
                    </v-chip>
                </div>
                <div role="group" :aria-label="t('config.regex.group.literals', 'Literals')" class="mb-config-regex__group">
                    <v-chip class="mb-config-regex__token" variant="outlined" @click="escapeSelection">
                        <code class="mb-config-regex__tok">\</code>
                        <span class="mb-config-regex__tokHint">{{ t("config.regex.escape", "Escape the selection") }}</span>
                    </v-chip>
                </div>
            </div>

            <div class="mb-config-regex__flagRow">
                <fieldset class="mb-config-regex__flags">
                    <legend class="mb-config-regex__sr">{{ t("config.regex.flags", "Flags") }}</legend>
                    <v-checkbox
                        v-for="flag in SUPPORTED_FLAGS"
                        :key="flag"
                        v-model="selectedFlags"
                        :value="flag"
                        :label="flagLabel(flag)"
                        color="primary"
                        density="compact"
                        hide-details
                        class="mb-config-regex__flag"
                    />
                </fieldset>
                <span class="mb-config-regex__live" aria-live="polite">
                    <template v-if="!pattern">{{ t("config.regex.noPattern", "No pattern yet.") }}</template>
                    <template v-else-if="evaluation.error">
                        {{ t("config.regex.invalid", "The pattern is not valid, so nothing matches.") }}
                    </template>
                    <template v-else>
                        {{
                            t(
                                "config.regex.matchCount",
                                { count: evaluation.matches.length },
                                "{count} matches in the sample",
                            )
                        }}
                    </template>
                </span>
            </div>

            <v-divider class="mb-config-regex__rule" />

            <v-textarea
                v-model="sampleText"
                :label="t('config.regex.sample', 'Sample text')"
                :maxlength="MAX_SAMPLE_LENGTH"
                rows="3"
                density="compact"
                variant="outlined"
                spellcheck="false"
                hide-details="auto"
                @keydown="stopUnlessEscape"
            />

            <v-alert v-if="evaluation.error" type="error" density="compact" variant="tonal" class="mt-2" role="alert">
                {{ evaluation.error }}
            </v-alert>

            <div class="mb-config-regex__results">
                <p
                    v-if="pattern && !evaluation.error && (evaluation.truncated || evaluation.timedOut || evaluation.sampleTruncated)"
                    class="mb-config-regex__meta"
                >
                    <template v-if="evaluation.truncated">
                        {{ t("config.regex.truncated", { max: MAX_MATCHES }, "(stopped at {max})") }}
                    </template>
                    <template v-if="evaluation.timedOut">
                        {{
                            t(
                                "config.regex.timedOut",
                                { ms: MAX_EVAL_MS },
                                "(stopped after {ms} ms: the pattern is too slow)",
                            )
                        }}
                    </template>
                    <template v-if="evaluation.sampleTruncated">
                        {{
                            t(
                                "config.regex.sampleCut",
                                { n: MAX_SAMPLE_LENGTH },
                                "(only the first {n} characters were scanned)",
                            )
                        }}
                    </template>
                </p>

                <ol v-if="evaluation.matches.length" class="mb-config-regex__matches">
                    <li v-for="(match, index) in evaluation.matches.slice(0, 12)" :key="index">
                        <code>{{ match.text || t("config.regex.empty", "(empty match)") }}</code>
                        <span class="mb-config-regex__at">@{{ match.index }}</span>
                        <span v-if="match.groups.length" class="mb-config-regex__groups">
                            {{ match.groups.map((group) => `${group.name}=${group.value ?? "-"}`).join(" | ") }}
                        </span>
                    </li>
                </ol>

                <p v-if="namedGroups.length" class="mb-config-regex__meta">
                    {{ t("config.regex.namedGroups", "Named groups") }}: {{ namedGroups.join(", ") }}
                </p>
            </div>

            <div class="mb-config-regex__actions">
                <v-btn size="small" variant="text" :prepend-icon="mdiContentCopy" @click="copy(pattern, t('config.regex.pattern', 'Pattern'))">
                    {{ t("config.regex.copyPattern", "Copy the pattern") }}
                </v-btn>
                <v-btn size="small" variant="text" :prepend-icon="mdiContentCopy" @click="copy(flags, t('config.regex.flags', 'Flags'))">
                    {{ t("config.regex.copyFlags", "Copy the flags") }}
                </v-btn>
            </div>
            <p class="mb-config-regex__meta" aria-live="polite">{{ copyState }}</p>

            <p class="mb-config-regex__meta">
                {{
                    t(
                        "config.regex.limits",
                        {
                            pattern: MAX_PATTERN_LENGTH,
                            sample: MAX_SAMPLE_LENGTH,
                            matches: MAX_MATCHES,
                            ms: MAX_EVAL_MS,
                        },
                        "Limits: {pattern} characters of pattern, {sample} of sample, {matches} matches, {ms} ms per run.",
                    )
                }}
            </p>
        </v-card-text>
    </v-card>
</template>

<style>
/*
 * Fix for issue #175: clicking this builder's opener crashed the renderer in a
 * packaged build. This card is the content of an anchored `<v-menu>`
 * (`ConfigSearchField.vue`), and Vuetify's `connectedLocationStrategy` watches
 * this exact element with a `ResizeObserver` to keep the popover positioned as
 * its content changes size (`locationStrategies.ts`). A `max-height` capped,
 * `overflow-y: auto` card whose content nearly fills that cap is the textbook
 * setup for a scrollbar-toggle layout loop: the scrollbar's own width narrows
 * the content box, which can push wrapped text (`.mb-config-regex__meta`,
 * `.mb-config-regex__row legend`) down by a line, growing past the cap and
 * showing the scrollbar — which was the very thing that freed the width the
 * text needed to fit *without* it, so removing the scrollbar reflows the text
 * back to fitting, hiding it again, and around again. Each cycle re-fires the
 * `ResizeObserver`, each firing re-measures and repositions the popover, and
 * Vuetify's own flip-loop guard only catches an alternating `flipped` boolean
 * (see `locationStrategies.js`'s `CircularBuffer` check) — it has no signal for
 * a plain native scrollbar/width oscillation, so nothing there stops this one.
 * On a real machine that pegs the render thread in a tight synchronous loop
 * with no yield point, which is indistinguishable from a hang and is exactly
 * what a "Target crashed" report looks like from the outside.
 *
 * `scrollbar-gutter: stable` reserves the scrollbar's track unconditionally, so
 * whether the content currently needs to scroll or not, the available content
 * width never changes when the scrollbar appears or disappears. That removes
 * the only thing that was flipping back and forth, without changing the visual
 * layout in the case that never had a scrollbar at all (the reserved gutter is
 * empty space, not a rendered scrollbar).
 */
.mb-config-regex.v-card {
    box-sizing: border-box;
    inline-size: min(620px, calc(100vw - 16px));
    max-height: min(70vh, 640px);
    overflow-y: auto;
    scrollbar-gutter: stable;

    /*
     * The design's builder card: the surface-container role one step above the page it
     * opens over, an outline-variant hairline, the 16px large corner and a level-3 lift.
     * Stated here because this card is teleported out of `.v-application`, so nothing in
     * the shared sheets reaches it.
     */
    background: rgb(var(--v-theme-surface-container));
    color: rgb(var(--v-theme-on-surface));
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-large);
    box-shadow: var(--md-sys-elevation-shadow-level3);
}

.mb-config-regex__body {
    padding: 16px 20px 16px;
}

.mb-config-regex__head {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mb-config-regex__heading {
    flex: 1 1 auto;
    margin: 0;
    font-size: var(--md-sys-typescale-title-small-size);
    line-height: var(--md-sys-typescale-title-small-line-height);
    font-weight: var(--md-sys-typescale-title-medium-weight);
}

.mb-config-regex__anchored {
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
}

.mb-config-regex__lead {
    margin: 4px 0 12px;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    color: rgb(var(--v-theme-on-surface-variant));
}

.mb-config-regex__meta {
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    margin-block: 4px;
    color: rgb(var(--v-theme-on-surface-variant));
}

/* The pattern field: a monospace outlined field on the plain surface, drawn in primary. */
.mb-config-regex__pattern .v-field {
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-surface));
}

.mb-config-regex__pattern textarea,
.mb-config-regex .mb-config-regex__matches code,
.mb-config-regex__tok {
    font-family: "Roboto Mono", ui-monospace, monospace;
}

.mb-config-regex__pattern textarea {
    font-size: var(--md-sys-typescale-body-large-size);
}

.mb-config-regex__tokens {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-start: 12px;
}

.mb-config-regex__group {
    display: contents;
}

/* Assist chips: 32dp, the small corner, an outline-variant border, the token in primary. */
.mb-config-regex .mb-config-regex__token.v-chip {
    block-size: 32px;
    border-radius: var(--md-sys-shape-corner-small);
    border-color: rgb(var(--v-theme-outline-variant));
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: var(--md-sys-typescale-label-medium-size);
    gap: 8px;
}

.mb-config-regex__tok {
    color: rgb(var(--v-theme-primary));
    margin-inline-end: 8px;
}

.mb-config-regex__flagRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-block-start: 12px;
}

.mb-config-regex__flags {
    display: flex;
    flex-wrap: wrap;
    gap: 0 4px;
    border: none;
    margin: 0;
    padding: 0;
    flex: 1 1 auto;
    min-inline-size: 0;
}

.mb-config-regex__flag.v-input {
    flex: 0 0 auto;
}

.mb-config-regex__flag .v-label {
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-on-surface-variant));
    opacity: 1;
}

.mb-config-regex__live {
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-primary));
}

.mb-config-regex__sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

.mb-config-regex__rule {
    margin-block: 12px;
    border-color: rgb(var(--v-theme-outline-variant));
    opacity: 1;
}

.mb-config-regex__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-block-start: 4px;
}

.mb-config-regex__actions .v-btn {
    text-transform: none;
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
}

.mb-config-regex__matches {
    margin: 4px 0 0 1.2em;
    padding: 0;
    font-size: var(--md-sys-typescale-body-small-size);
    max-height: 9em;
    overflow-y: auto;
}

.mb-config-regex__at,
.mb-config-regex__groups {
    margin-inline-start: 6px;
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
