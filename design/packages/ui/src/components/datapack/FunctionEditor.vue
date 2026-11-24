<script setup lang="ts">
/**
 * The data pack studio's function editor: a plain textarea over a highlighted copy of the same
 * text (commands, selectors, ids, numbers, comments, macro lines and problems in their own
 * colours), with suggestions for the word at the cursor. Typing stays a real textarea, so undo,
 * selection, screen readers and IME work as usual.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { BLOCK_IDS, ENTITY_TYPE_IDS, ITEM_IDS } from "../mcserver/commandBuilderData.js";
import { COMMAND_ROOTS, lineProblem } from "./datapackModel.js";

const model = defineModel<string>({ required: true });
const { t } = useI18n();
const area = ref<HTMLTextAreaElement | null>(null);
const caret = ref(0);

interface Piece {
    readonly text: string;
    readonly kind: "cmd" | "sel" | "id" | "num" | "str" | "comment" | "macro" | "bad" | "plain";
}

/** Splits one line into coloured pieces. */
function highlightLine(line: string): Piece[] {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("#")) return [{ text: line, kind: "comment" }];
    if (trimmed.startsWith("$")) return [{ text: line, kind: "macro" }];
    const bad = lineProblem(line) !== null;
    const out: Piece[] = [];
    const re =
        /(\s+)|("(?:[^"\\]|\\.)*"?)|(@[aeprsn](?:\[[^\]]*\]?)?)|(-?\d+(?:\.\d+)?[bdfls]?\b|~-?\d*(?:\.\d+)?|\^-?\d*(?:\.\d+)?)|([a-z0-9_.-]+:[a-z0-9_./-]+)|(\S+)/gi;
    let first = true;
    for (const m of line.matchAll(re)) {
        if (m[1]) out.push({ text: m[1], kind: "plain" });
        else if (m[2]) out.push({ text: m[2], kind: "str" });
        else if (m[3]) out.push({ text: m[3], kind: "sel" });
        else if (m[4]) out.push({ text: m[4], kind: "num" });
        else if (m[5]) out.push({ text: m[5], kind: "id" });
        else if (m[6]) {
            const word = m[6];
            const isCmd = (first || word === "run") && COMMAND_ROOTS.has(word);
            out.push({ text: word, kind: first && bad ? "bad" : isCmd ? "cmd" : "plain" });
        }
        if (!m[1]) first = false;
        if (m[6] === "run") first = true;
    }
    return out;
}

const lines = computed(() => model.value.split("\n").map(highlightLine));

/** The word being typed and what could complete it. */
const current = computed(() => {
    const before = model.value.slice(0, caret.value);
    const lineStart = before.lastIndexOf("\n") + 1;
    const lineText = before.slice(lineStart);
    const word = /[^\s]*$/.exec(lineText)?.[0] ?? "";
    const firstWord = lineText.trimStart() === word || /\brun\s+[^\s]*$/.test(lineText);
    if (word.length === 0) return { word, options: [] as string[] };
    const pool = firstWord
        ? [...COMMAND_ROOTS]
        : word.startsWith("@")
          ? ["@a", "@e", "@p", "@r", "@s", "@n"]
          : [...ITEM_IDS, ...BLOCK_IDS, ...ENTITY_TYPE_IDS];
    const needle = word.toLowerCase();
    const options = [...new Set(pool)]
        .filter(
            (o) =>
                o.toLowerCase().startsWith(needle) ||
                o.toLowerCase().startsWith(`minecraft:${needle}`),
        )
        .filter((o) => o !== word)
        .slice(0, 8);
    return { word, options };
});

function track(): void {
    caret.value = area.value?.selectionStart ?? 0;
}
function accept(option: string): void {
    const start = caret.value - current.value.word.length;
    model.value = model.value.slice(0, start) + option + model.value.slice(caret.value);
    const next = start + option.length;
    requestAnimationFrame(() => {
        area.value?.focus();
        area.value?.setSelectionRange(next, next);
        caret.value = next;
    });
}
function key(e: KeyboardEvent): void {
    if (e.key === "Tab" && current.value.options.length > 0 && !e.shiftKey) {
        e.preventDefault();
        accept(current.value.options[0]!);
    }
}
const scrollTop = ref(0);
</script>

<template>
    <div class="wl-fn">
        <div class="wl-fn__frame">
            <pre
                class="wl-fn__shade"
                aria-hidden="true"
                :style="{ transform: `translateY(${-scrollTop}px)` }"
            ><template v-for="(l, i) in lines" :key="i"><span v-for="(p, j) in l" :key="j" :class="`wl-fn__${p.kind}`">{{ p.text }}</span>{{ "\n" }}</template></pre>
            <textarea
                ref="area"
                v-model="model"
                class="wl-fn__input"
                spellcheck="false"
                :aria-label="t('datapack.lines', 'Commands, one per line')"
                @keyup="track"
                @click="track"
                @input="track"
                @keydown="key"
                @scroll="scrollTop = ($event.target as HTMLTextAreaElement).scrollTop"
            />
        </div>
        <div
            v-if="current.options.length"
            class="wl-fn__suggest"
            role="listbox"
            :aria-label="t('datapack.suggest', 'Suggestions; Tab takes the first')"
        >
            <button
                v-for="o in current.options"
                :key="o"
                type="button"
                role="option"
                class="wl-fn__chip"
                @mousedown.prevent="accept(o)"
            >
                {{ o }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.wl-fn {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.wl-fn__frame {
    position: relative;
    height: 260px;
    border-radius: 12px;
    overflow: hidden;
    background: rgba(var(--v-theme-on-surface), 0.06);
    border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
}
.wl-fn__shade,
.wl-fn__input {
    margin: 0;
    padding: 12px;
    font:
        400 13px/20px "Roboto Mono",
        monospace;
    white-space: pre-wrap;
    word-break: break-all;
    tab-size: 4;
}
.wl-fn__shade {
    position: absolute;
    inset: 0 0 auto 0;
    pointer-events: none;
    color: rgb(var(--v-theme-on-surface));
}
.wl-fn__input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    resize: none;
    border: 0;
    background: transparent;
    color: transparent;
    caret-color: rgb(var(--v-theme-on-surface));
    outline: none;
    overflow: auto;
}
.wl-fn__frame:focus-within {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
.wl-fn__cmd {
    color: rgb(var(--v-theme-primary));
    font-weight: 600;
}
.wl-fn__sel {
    color: rgb(var(--v-theme-tertiary, var(--v-theme-secondary)));
}
.wl-fn__id {
    color: rgb(var(--v-theme-secondary));
}
.wl-fn__num {
    color: #c77d2e;
}
.wl-fn__str {
    color: #3f8f4a;
}
.wl-fn__comment {
    color: rgb(var(--v-theme-on-surface-variant));
    font-style: italic;
}
.wl-fn__macro {
    color: #8a5cc2;
}
.wl-fn__bad {
    color: rgb(var(--v-theme-error));
    text-decoration: wavy underline;
}
.wl-fn__suggest {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.wl-fn__chip {
    min-height: 32px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
    background: transparent;
    color: inherit;
    font:
        400 12px "Roboto Mono",
        monospace;
    cursor: pointer;
}
</style>
