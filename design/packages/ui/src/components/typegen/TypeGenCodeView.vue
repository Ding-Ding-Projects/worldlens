<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { highlight } from "./highlight.js";

/**
 * Generated code with line numbers and syntax colour.
 *
 * The code is split into tokens and rendered as text nodes, never as HTML, so nothing in a
 * generated model can inject markup. The line numbers sit in their own column and are hidden
 * from assistive technology; a screen reader reads the code once, in order. A very long result
 * shows its first lines here and says so, while Copy and Save always carry all of it.
 */
const props = defineProps<{ code: string; label: string }>();

const { t } = useI18n();

/** Rendering thousands of coloured lines on every keystroke is what makes typing stutter. */
const MAX_SHOWN_LINES = 5000;

const lines = computed(() => highlight(props.code));
const shown = computed(() => lines.value.slice(0, MAX_SHOWN_LINES));
const hidden = computed(() => Math.max(0, lines.value.length - MAX_SHOWN_LINES));
</script>

<template>
    <figure class="wl-tg-code" :aria-label="label" role="group">
        <pre class="wl-tg-code__pre" tabindex="0" :aria-label="label"><code><span v-for="(line, index) in shown" :key="index" class="wl-tg-code__line"><span class="wl-tg-code__no" aria-hidden="true">{{ index + 1 }}</span><span class="wl-tg-code__text"><span v-for="(token, at) in line" :key="at" :class="`wl-tok wl-tok--${token.cls}`">{{ token.text }}</span>{{ "\n" }}</span></span></code></pre>
        <figcaption v-if="hidden > 0" class="wl-tg-code__more">
            {{ t("typegen.code.truncated", { count: hidden, shown: MAX_SHOWN_LINES }, "Showing the first {shown} lines. {count} more are left out of this view; Copy and Save include everything.") }}
        </figcaption>
    </figure>
</template>

<style scoped>
.wl-tg-code { margin: 0; min-width: 0; }
.wl-tg-code__pre { margin: 0; max-height: 560px; overflow: auto; padding: 8px 0; border-radius: var(--md-sys-shape-corner-medium, 12px); background: rgb(var(--v-theme-surface-container-lowest, var(--v-theme-background))); font: 13px/20px "Roboto Mono", monospace; tab-size: 4; }
.wl-tg-code__pre:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.wl-tg-code__line { display: flex; min-height: 20px; }
.wl-tg-code__no { flex: 0 0 auto; min-width: 3.5em; padding: 0 12px 0 8px; text-align: right; user-select: none; color: rgb(var(--v-theme-on-surface-variant)); opacity: 0.7; }
.wl-tg-code__text { white-space: pre; padding-right: 16px; }
.wl-tg-code__more { margin-top: 6px; font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-tok--comment { color: rgb(var(--v-theme-on-surface-variant)); font-style: italic; }
.wl-tok--string { color: rgb(var(--v-theme-tertiary, var(--v-theme-primary))); }
.wl-tok--number { color: rgb(var(--v-theme-secondary, var(--v-theme-primary))); }
.wl-tok--keyword { color: rgb(var(--v-theme-primary)); font-weight: 500; }
.wl-tok--type { color: rgb(var(--v-theme-on-surface)); font-weight: 500; }
</style>
