<script setup lang="ts">
import { computed, h, type VNode } from "vue";
import { useI18n } from "vue-i18n";
import { parseMarkdown, type Block, type Inline } from "./providerMarkdown.js";

/**
 * The one renderer for provider-authored text: release notes, issue and pull-request bodies,
 * commit messages and README previews. It renders Markdown as Vue nodes built from a parsed
 * tree, never as HTML, so nothing in the text can run with the app's privileges. Links open
 * outside the app; images are never fetched and show as links naming the image.
 *
 * An empty source says so plainly instead of leaving an empty box that reads as a failure.
 */
const props = withDefaults(
    defineProps<{
        source: string | null | undefined;
        /** Names the region for assistive technology, such as "Release notes for 1.2.0". */
        label: string;
        /** Where relative links point, such as a repository's blob URL. */
        base?: string | null;
        /** Shown when the source is empty. */
        emptyText?: string | null;
    }>(),
    { base: null, emptyText: null },
);

const { t } = useI18n();
const blocks = computed(() => parseMarkdown(props.source ?? "", { base: props.base }));

function inline(nodes: readonly Inline[]): (VNode | string)[] {
    return nodes.map((n) => {
        switch (n.kind) {
            case "text":
                return n.text;
            case "code":
                return h("code", n.text);
            case "strong":
                return h("strong", inline(n.children));
            case "em":
                return h("em", inline(n.children));
            case "del":
                return h("del", inline(n.children));
            case "link":
                return h("a", { href: n.href, target: "_blank", rel: "noopener noreferrer nofollow" }, inline(n.children));
            case "image": {
                const label = t("providerText.image", { alt: n.alt || t("providerText.imageNoAlt", "no description") }, "Image: {alt}");
                return n.href
                    ? h("a", { href: n.href, target: "_blank", rel: "noopener noreferrer nofollow", class: "wl-ptext__image" }, label)
                    : h("span", { class: "wl-ptext__image" }, label);
            }
        }
    });
}

function block(b: Block, key: number): VNode {
    switch (b.kind) {
        case "heading":
            // Provider headings sit inside the host's own heading; they start two levels down.
            return h(`h${Math.min(6, b.level + 2)}`, { key, class: "wl-ptext__heading" }, inline(b.children));
        case "paragraph":
            return h("p", { key }, inline(b.children));
        case "code":
            return h("pre", { key, class: "wl-ptext__pre", tabindex: 0, "aria-label": b.language ? t("providerText.code", { language: b.language }, "{language} code") : undefined }, [h("code", b.text)]);
        case "quote":
            return h("blockquote", { key }, b.children.map(block));
        case "rule":
            return h("hr", { key });
        case "list":
            return h(
                b.ordered ? "ol" : "ul",
                { key, ...(b.ordered && b.start !== 1 ? { start: b.start } : {}) },
                b.items.map((item, i) =>
                    h("li", { key: i, class: item.checked === null ? undefined : "wl-ptext__task" }, [
                        ...(item.checked === null
                            ? []
                            : [h("span", { class: "wl-ptext__box", role: "img", "aria-label": item.checked ? t("providerText.done", "done") : t("providerText.notDone", "not done") }, item.checked ? "☑" : "☐"), " "]),
                        ...item.children.map((c, j) => (c.kind === "paragraph" && item.children.length === 1 ? h("span", { key: j }, inline(c.children)) : block(c, j))),
                    ]),
                ),
            );
        case "table":
            return h("div", { key, class: "wl-ptext__table-wrap", tabindex: 0 }, [
                h("table", [h("thead", [h("tr", b.head.map((c, i) => h("th", { key: i, scope: "col" }, inline(c))))]), h("tbody", b.rows.map((r, i) => h("tr", { key: i }, r.map((c, j) => h("td", { key: j }, inline(c))))))]),
            ]);
    }
}

const Rendered = () => blocks.value.map(block);
</script>

<template>
    <section class="wl-ptext" role="region" :aria-label="label" data-test="provider-text">
        <p v-if="blocks.length === 0" class="wl-ptext__empty">{{ emptyText ?? t("providerText.empty", "No notes were provided.") }}</p>
        <Rendered v-else />
    </section>
</template>

<style scoped>
.wl-ptext { font-size: var(--md-sys-typescale-body-medium-size, 14px); line-height: 1.55; overflow-wrap: anywhere; min-width: 0; }
.wl-ptext :deep(p) { margin: 0 0 0.6em; }
.wl-ptext :deep(.wl-ptext__heading) { margin: 0.9em 0 0.4em; font-size: var(--md-sys-typescale-title-small-size, 14px); font-weight: 600; }
.wl-ptext :deep(ul), .wl-ptext :deep(ol) { margin: 0 0 0.6em; padding-left: 1.4em; }
.wl-ptext :deep(.wl-ptext__task) { list-style: none; margin-left: -1.2em; }
.wl-ptext :deep(code) { font-family: "Roboto Mono", ui-monospace, monospace; font-size: 0.92em; padding: 0 4px; border-radius: 4px; background: rgba(var(--v-theme-on-surface), 0.08); }
.wl-ptext :deep(.wl-ptext__pre) { margin: 0 0 0.8em; padding: 10px 12px; border-radius: 8px; overflow: auto; background: rgba(var(--v-theme-on-surface), 0.06); }
.wl-ptext :deep(.wl-ptext__pre code) { padding: 0; background: none; }
.wl-ptext :deep(blockquote) { margin: 0 0 0.6em; padding-left: 12px; border-left: 3px solid rgb(var(--v-theme-outline-variant, var(--v-theme-on-surface-variant))); color: rgb(var(--v-theme-on-surface-variant)); }
.wl-ptext :deep(a) { color: rgb(var(--v-theme-primary)); }
.wl-ptext :deep(.wl-ptext__table-wrap) { overflow-x: auto; margin: 0 0 0.8em; }
.wl-ptext :deep(table) { border-collapse: collapse; }
.wl-ptext :deep(th), .wl-ptext :deep(td) { border: 1px solid rgba(var(--v-theme-on-surface), 0.16); padding: 4px 8px; text-align: left; }
.wl-ptext :deep(hr) { border: 0; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.16); margin: 0.8em 0; }
.wl-ptext__empty { margin: 0; color: rgb(var(--v-theme-on-surface-variant)); font-style: italic; }
</style>
