<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import NbtValueEditor from "./NbtValueEditor.vue";
import type { DocumentInfo, NbtEditorBridge, NodeView, ProjectFile } from "./nbtEditorBridge.js";
import { buildSections, filterSections, pickBase, type FormSection } from "./nbtFormModel.js";

/**
 * The open file as a form: named sections, one tailored control per value.
 *
 * Built for world settings (`level.dat` before and after 26.1, and the files 26.1 split out of it:
 * `game_rules.dat`, `weather.dat`, `world_clocks.dat`), and useful for any flat NBT file. Each
 * control is the same `NbtValueEditor` the tree uses and sends the same edit, so the form and the
 * tree are two views of one document with one undo stack. Lists, arrays and deeper groups are
 * counted and left to the tree rather than flattened into a page nobody can read.
 *
 * Design: `design/design-sources/nbt-editor-full/LevelDat.dc.html`.
 */
const props = defineProps<{
    bridge: NbtEditorBridge;
    doc: DocumentInfo;
    /** Bumped by the screen after every edit, undo or redo, so values are read again. */
    revision: number;
    disabled?: boolean | undefined;
    /** Project files, to offer the 26.1 split files beside a level.dat that no longer holds them. */
    files?: readonly ProjectFile[] | undefined;
}>();
const emit = defineEmits<{
    commit: [id: number, text: string];
    flip: [id: number, on: boolean];
    "open-file": [relative: string];
    "show-tree": [];
}>();
const { t } = useI18n();

const sections = shallowRef<FormSection[]>([]);
const loading = ref(true);
const failure = ref<string | null>(null);
const query = ref("");
const regex = ref(false);
const flags = ref("i");

const PAGE = 500;
const MAX_GROUPS = 24;

async function childrenOf(id: number): Promise<readonly NodeView[]> {
    const page = await props.bridge.children(props.doc.docId, id, 0, PAGE);
    if (!page.ok) throw new Error(page.message);
    return page.value.nodes;
}

async function load(): Promise<void> {
    failure.value = null;
    try {
        const top = await childrenOf(props.doc.root.id);
        const base = pickBase(top);
        const members = base === null ? top : await childrenOf(base.id);
        const basePath = base === null ? [] : [base.name ?? "Data"];
        const groups: { node: NodeView; children: readonly NodeView[] }[] = [];
        for (const node of members.filter((n) => n.kind === "compound").slice(0, MAX_GROUPS)) {
            groups.push({ node, children: await childrenOf(node.id) });
        }
        sections.value = buildSections(members, basePath, groups);
    } catch (error) {
        failure.value = error instanceof Error ? error.message : String(error);
    } finally {
        loading.value = false;
    }
}

watch(
    () => [props.doc.docId, props.revision] as const,
    () => void load(),
    { immediate: true },
);

const matcher = computed<((text: string) => boolean) | null>(() => {
    const q = query.value.slice(0, 512);
    if (q.trim() === "") return null;
    if (!regex.value) {
        const needle = q.toLowerCase();
        return (text) => text.toLowerCase().includes(needle);
    }
    try {
        const re = new RegExp(q, flags.value.replace(/[^imsu]/g, ""));
        return (text) => re.test(text.slice(0, 4096));
    } catch {
        return () => false;
    }
});

const shown = computed(() => filterSections(sections.value, matcher.value));
const sample = computed(() =>
    sections.value.flatMap((s) => s.fields.map((f) => f.info.label)).join("\n"),
);

/** 26.1 moved these out of level.dat; offer them when this level.dat no longer holds them. */
const related = computed(() => {
    if (!/level\.dat$/i.test(props.doc.path)) return [];
    const holds = (names: readonly string[]) =>
        sections.value.some((s) => names.includes(s.id.replace(/^group:/, "").toLowerCase()));
    const wanted = [
        {
            file: "data/minecraft/game_rules.dat",
            label: t("nbt.form.related.rules", "Game rules"),
            present: holds(["gamerules", "game_rules"]),
        },
        {
            file: "data/minecraft/weather.dat",
            label: t("nbt.form.related.weather", "Weather"),
            present: false,
        },
        {
            file: "data/minecraft/world_clocks.dat",
            label: t("nbt.form.related.clocks", "World clocks"),
            present: false,
        },
    ];
    const listed = new Set((props.files ?? []).map((f) => f.relativePath.replace(/\\/g, "/")));
    return wanted.filter((w) => !w.present && listed.has(w.file));
});
</script>

<template>
    <div class="wl-nbt-form">
        <div class="wl-nbt-form__bar">
            <config-search-field
                v-model="query"
                v-model:regex="regex"
                v-model:flags="flags"
                :label="t('nbt.form.search', 'Find a setting')"
                :sample="sample"
                density="compact"
            />
        </div>

        <p v-if="loading" class="wl-nbt-form__note" role="status">
            {{ t("nbt.form.loading", "Reading the file…") }}
        </p>
        <p v-else-if="failure" class="wl-nbt-form__note wl-nbt-form__note--error" role="alert">
            {{ failure }}
        </p>

        <section
            v-if="related.length > 0"
            class="wl-nbt-form__card wl-nbt-form__related"
            :aria-label="t('nbt.form.related.title', 'Settings kept in other files')"
        >
            <p class="wl-nbt-form__note">
                {{
                    t(
                        "nbt.form.related.body",
                        "From Minecraft 26.1 these settings live in their own files in this world:",
                    )
                }}
            </p>
            <div class="wl-nbt-form__related-actions">
                <v-btn
                    v-for="r in related"
                    :key="r.file"
                    variant="tonal"
                    rounded="pill"
                    size="small"
                    @click="emit('open-file', r.file)"
                    >{{ r.label }}</v-btn
                >
            </div>
        </section>

        <p v-if="!loading && !failure && shown.length === 0" class="wl-nbt-form__note">
            {{
                query
                    ? t("nbt.form.noMatch", "No setting matches that search.")
                    : t(
                          "nbt.form.empty",
                          "This file has no values to show as a form. The tree shows everything in it.",
                      )
            }}
        </p>

        <section
            v-for="s in shown"
            :key="s.id"
            class="wl-nbt-form__card"
            :aria-labelledby="`wl-form-${s.id}`"
        >
            <h3 :id="`wl-form-${s.id}`" class="wl-nbt-form__title">{{ s.title }}</h3>
            <div
                v-for="f in s.fields"
                :key="f.node.id"
                class="wl-nbt-form__row"
                :data-field="f.node.name ?? ''"
            >
                <div class="wl-nbt-form__label">
                    <span class="wl-nbt-form__name">{{ f.info.label }}</span>
                    <span class="wl-nbt-form__key">{{ f.node.name }}</span>
                    <span v-if="f.info.about" class="wl-nbt-form__about">{{ f.info.about }}</span>
                </div>
                <NbtValueEditor
                    :node="f.node"
                    :label="f.info.label"
                    :info="f.info"
                    :disabled="disabled"
                    @commit="(text: string) => emit('commit', f.node.id, text)"
                    @flip="(on: boolean) => emit('flip', f.node.id, on)"
                />
            </div>
            <p v-if="s.elsewhere > 0" class="wl-nbt-form__note">
                {{
                    t(
                        "nbt.form.elsewhere",
                        { count: s.elsewhere },
                        "{count} more (lists and groups) are in the tree.",
                    )
                }}
                <button type="button" class="wl-nbt-form__link" @click="emit('show-tree')">
                    {{ t("nbt.form.openTree", "Open the tree") }}
                </button>
            </p>
        </section>
    </div>
</template>

<style scoped>
.wl-nbt-form {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 2px 16px;
}
.wl-nbt-form__bar {
    position: sticky;
    top: 0;
    z-index: 1;
    background: rgb(var(--v-theme-surface));
    padding-bottom: 4px;
}
.wl-nbt-form__card {
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    border-radius: 24px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.wl-nbt-form__title {
    margin: 0 0 6px;
    font:
        500 16px/24px Roboto,
        sans-serif;
}
.wl-nbt-form__row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    padding: 4px 0;
    border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.wl-nbt-form__row:first-of-type {
    border-top: 0;
}
.wl-nbt-form__label {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1 1 200px;
}
.wl-nbt-form__name {
    font:
        400 15px/20px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface));
}
.wl-nbt-form__key {
    font:
        400 11px/16px "Roboto Mono",
        monospace;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-nbt-form__about {
    font:
        400 12px/16px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-nbt-form__note {
    margin: 0;
    font:
        400 13px/18px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-nbt-form__note--error {
    color: rgb(var(--v-theme-error));
}
.wl-nbt-form__related-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
}
.wl-nbt-form__link {
    background: none;
    border: 0;
    padding: 0 4px;
    min-height: 30px;
    color: rgb(var(--v-theme-primary));
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
}
.wl-nbt-form__link:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
@media (max-width: 720px) {
    .wl-nbt-form__row {
        flex-wrap: wrap;
    }
}
</style>
