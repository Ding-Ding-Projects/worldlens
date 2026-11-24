<script setup lang="ts">
/**
 * The data pack creator: recipes on a crafting grid, functions built line by line (or with the
 * command builder), function tags for load and tick, item and block tags, advancements and loot
 * tables, all as typed controls. Every edit is checked for the chosen version and the result
 * downloads as a .zip that goes straight into a world's `datapacks` folder.
 *
 * The draft is kept in this browser profile until it is exported or cleared.
 * Design: `design/design-sources/datapacks-and-chunks/DataPack.dc.html`.
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    VBtn,
    VBtnToggle,
    VCombobox,
    VRangeSlider,
    VSelect,
    VSlider,
    VSwitch,
    VTextField,
    VTextarea,
} from "vuetify/components";
import CommandBuilder from "../mcserver/CommandBuilder.vue";
import PredicateBlockEditor from "./PredicateBlockEditor.vue";
import FunctionEditor from "./FunctionEditor.vue";
import { BLOCK_IDS, ITEM_IDS } from "../mcserver/commandBuilderData.js";
import {
    PACK_VERSIONS,
    emptyPack,
    lineProblem,
    newAdvancement,
    newFunction,
    newLootTable,
    newPredicate,
    newBiome,
    packFromFiles,
    isPackText,
    newRecipe,
    newTag,
    packFiles,
    packProblems,
    slug,
    type DataPack,
    type RecipeKind,
} from "./datapackModel.js";
import { zipStore } from "./zipStore.js";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { NEW_PART_KINDS, newPart, partError, partKind, type PackPart } from "./datapackParts.js";
import { readZip } from "./zipRead.js";

const { t } = useI18n();
const STORE = "worldlens-datapack-draft";

function readDraft(): DataPack {
    try {
        const raw = localStorage.getItem(STORE);
        if (raw) return { ...emptyPack(), predicates: [], biomes: [], ...(JSON.parse(raw) as Partial<DataPack>) };
    } catch {
        /* a bad or missing draft starts empty */
    }
    return emptyPack();
}
const pack = ref<DataPack>(readDraft());
watch(
    pack,
    (value) => {
        try {
            localStorage.setItem(STORE, JSON.stringify(value));
        } catch {
            /* storage can be full or blocked; the editor keeps working */
        }
    },
    { deep: true },
);

type Section =
    | "pack"
    | "overlays"
    | "recipes"
    | "functions"
    | "tags"
    | "advancements"
    | "lootTables"
    | "predicates"
    | "biomes"
    | "parts";
const section = ref<Section>("recipes");
const pick = ref(0);
watch(section, () => (pick.value = 0));

const sections = computed(() => [
    { id: "pack" as const, label: t("datapack.section.pack", "Pack info"), count: null },
    {
        id: "recipes" as const,
        label: t("datapack.section.recipes", "Recipes"),
        count: pack.value.recipes.length,
    },
    {
        id: "functions" as const,
        label: t("datapack.section.functions", "Functions"),
        count: pack.value.functions.length,
    },
    {
        id: "tags" as const,
        label: t("datapack.section.tags", "Tags"),
        count: pack.value.tags.length,
    },
    {
        id: "advancements" as const,
        label: t("datapack.section.advancements", "Advancements"),
        count: pack.value.advancements.length,
    },
    {
        id: "lootTables" as const,
        label: t("datapack.section.lootTables", "Loot tables"),
        count: pack.value.lootTables.length,
    },
    {
        id: "predicates" as const,
        label: t("datapack.section.predicates", "Predicates"),
        count: (pack.value.predicates ?? []).length,
    },
    {
        id: "biomes" as const,
        label: t("datapack.section.biomes", "Biomes"),
        count: (pack.value.biomes ?? []).length,
    },
    {
        id: "parts" as const,
        label: t("datapack.section.parts", "More parts"),
        count: (pack.value.parts ?? []).length,
    },
    {
        id: "overlays" as const,
        label: t("datapack.section.overlays", "Version overlays"),
        count: (pack.value.overlays ?? []).length,
    },
]);

/* Search over the sections and every entry's name, with the shared regex builder. */
const query = ref("");
const queryRegex = ref(false);
const queryFlags = ref("i");
const queryTest = computed<(text: string) => boolean>(() => {
    const q = query.value.slice(0, 512);
    if (q.trim() === "") return () => true;
    if (!queryRegex.value) {
        const needle = q.trim().toLowerCase();
        return (text) => text.toLowerCase().includes(needle);
    }
    try {
        const re = new RegExp(q, queryFlags.value.replace(/[^imsu]/g, ""));
        return (text) => re.test(text);
    } catch {
        return () => false;
    }
});
function entriesOf(id: Section): { name: string }[] {
    if (id === "pack" || id === "overlays") return [];
    if (id === "predicates") return pack.value.predicates ?? [];
    if (id === "biomes") return pack.value.biomes ?? [];
    if (id === "parts") return pack.value.parts ?? [];
    return pack.value[id] as { name: string }[];
}
const shownSections = computed(() =>
    sections.value.filter(
        (s) => queryTest.value(s.label) || entriesOf(s.id).some((e) => queryTest.value(e.name)),
    ),
);
const searchSample = computed(() =>
    sections.value.flatMap((s) => [s.label, ...entriesOf(s.id).map((e) => e.name)]).join("\n"),
);
/** Entries of the open section that match the search, with their real index. */
const shownItems = computed(() =>
    items.value
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => query.value.trim() === "" || queryTest.value(it.name) || queryTest.value(sections.value.find((x) => x.id === section.value)?.label ?? "")),
);

/* More parts: every other registry, edited as checked JSON. */
const newKind = ref(NEW_PART_KINDS[0]!.id);
const partKindItems = computed(() =>
    NEW_PART_KINDS.map((k) => ({ value: k.id, title: t(`datapack.part.${k.id}`, k.label) })),
);
const part = computed<PackPart | undefined>(() =>
    section.value === "parts" ? (pack.value.parts ?? [])[pick.value] : undefined,
);
const partProblem = computed(() => (part.value ? partError(part.value) : null));
function formatPart(): void {
    if (!part.value || partProblem.value !== null) return;
    part.value.text = `${JSON.stringify(JSON.parse(part.value.text), null, 2)}\n`;
}
function resetPart(): void {
    if (!part.value) return;
    part.value.text = newPart(part.value.kind, part.value.name, pack.value.namespace).text;
}

/* Overlays: folders whose files replace the base ones on some versions. */
function addOverlay(): void {
    const list = (pack.value.overlays ??= []);
    let directory = "overlay";
    for (let n = 2; list.some((o) => o.directory === directory); n++) directory = `overlay_${n}`;
    list.push({ directory, oldest: Math.min(PACK_VERSIONS.length - 1, 1), newest: 0 });
}

const items = computed(() => {
    if (section.value === "pack" || section.value === "overlays") return [];
    if (section.value === "parts") return (pack.value.parts ??= []);
    if (section.value === "predicates") return (pack.value.predicates ??= []);
    if (section.value === "biomes") return (pack.value.biomes ??= []);
    return pack.value[section.value] as { name: string }[];
});
function add(): void {
    const s = section.value;
    if (s === "pack" || s === "overlays") return;
    if (s === "parts") {
        const list = (pack.value.parts ??= []);
        let name = `new_${newKind.value}`;
        for (let n = 2; list.some((i) => i.name === name && i.kind === newKind.value); n++)
            name = `new_${newKind.value}_${n}`;
        list.push(newPart(newKind.value, name, pack.value.namespace));
        pick.value = list.length - 1;
        return;
    }
    const base = {
        recipes: "new_recipe",
        functions: "new_function",
        tags: "new_tag",
        advancements: "new_advancement",
        lootTables: "new_loot_table",
        predicates: "new_predicate",
        biomes: "new_biome",
    }[s];
    let name = base;
    for (let n = 2; items.value.some((i) => i.name === name); n++) name = `${base}_${n}`;
    const made = {
        recipes: newRecipe,
        functions: newFunction,
        tags: newTag,
        advancements: newAdvancement,
        lootTables: newLootTable,
        predicates: newPredicate,
        biomes: newBiome,
    }[s](name);
    (items.value as unknown[]).push(made);
    pick.value = items.value.length - 1;
}
const currentName = computed({
    get: () => items.value[pick.value]?.name ?? "",
    set: (name: string) => {
        const item = items.value[pick.value];
        if (item) item.name = name;
    },
});
function removeCurrent(): void {
    const s = section.value;
    if (s === "pack" || s === "overlays") return;
    (items.value as unknown[]).splice(pick.value, 1);
    pick.value = Math.max(0, pick.value - 1);
}
const recipe = computed(() =>
    section.value === "recipes" ? pack.value.recipes[pick.value] : undefined,
);
const fn = computed(() =>
    section.value === "functions" ? pack.value.functions[pick.value] : undefined,
);
const tag = computed(() => (section.value === "tags" ? pack.value.tags[pick.value] : undefined));
const adv = computed(() =>
    section.value === "advancements" ? pack.value.advancements[pick.value] : undefined,
);
const biome = computed(() => (section.value === "biomes" ? (pack.value.biomes ?? [])[pick.value] : undefined));
/** The climate graph: temperature across (-0.5 to 2), rainfall up (0 to 1). */
const climate = computed(() =>
    (pack.value.biomes ?? []).map((b, i) => ({
        i,
        name: b.name,
        x: 20 + ((Math.min(2, Math.max(-0.5, b.temperature)) + 0.5) / 2.5) * 560,
        y: 200 - Math.min(1, Math.max(0, b.downfall)) * 180,
        colour: b.skyColor,
    })),
);
const predicate = computed(() =>
    section.value === "predicates" ? (pack.value.predicates ?? [])[pick.value] : undefined,
);
const loot = computed(() =>
    section.value === "lootTables" ? pack.value.lootTables[pick.value] : undefined,
);

const recipeKinds = computed<{ value: RecipeKind; title: string }[]>(() => [
    { value: "shaped", title: t("datapack.kind.shaped", "Crafting (shaped)") },
    { value: "shapeless", title: t("datapack.kind.shapeless", "Crafting (any order)") },
    { value: "smelting", title: t("datapack.kind.smelting", "Furnace") },
    { value: "blasting", title: t("datapack.kind.blasting", "Blast furnace") },
    { value: "smoking", title: t("datapack.kind.smoking", "Smoker") },
    { value: "campfire_cooking", title: t("datapack.kind.campfire", "Campfire") },
    { value: "stonecutting", title: t("datapack.kind.stonecutting", "Stonecutter") },
    { value: "smithing_transform", title: t("datapack.kind.smithing", "Smithing table") },
]);
const categories = ["building", "redstone", "equipment", "misc", "food", "blocks"];
const isGrid = computed(
    () => recipe.value?.kind === "shaped" || recipe.value?.kind === "shapeless",
);
const isCooking = computed(() =>
    ["smelting", "blasting", "smoking", "campfire_cooking"].includes(recipe.value?.kind ?? ""),
);
const brush = ref("minecraft:diamond");
function paint(i: number, erase = false): void {
    if (recipe.value) recipe.value.grid[i] = erase ? "" : brush.value;
}
const shortName = (id: string): string => id.replace(/^#?minecraft:/, "").replace(/_/g, " ");

const tagOptions = computed(() =>
    tag.value?.registry === "block" ? [...BLOCK_IDS] : [...ITEM_IDS],
);
const newLine = ref("");
const builderOpen = ref(false);
function addLine(text: string): void {
    const line = text.trim().replace(/^\//, "");
    if (fn.value && line !== "") fn.value.lines.push(line);
    newLine.value = "";
    builderOpen.value = false;
}
const functionText = computed({
    get: () => fn.value?.lines.join("\n") ?? "",
    set: (v: string) => {
        if (fn.value) fn.value.lines = v.split("\n");
    },
});
const lineChecks = computed(() =>
    (fn.value?.lines ?? [])
        .map((l, i) => ({ n: i + 1, problem: lineProblem(l) }))
        .filter((x) => x.problem !== null),
);

const problems = computed(() => packProblems(pack.value));
const files = computed(() => packFiles(pack.value));
const preview = ref("pack.mcmeta");
const previewText = computed(
    () => files.value.get(preview.value) ?? files.value.get("pack.mcmeta") ?? "",
);
const exported = ref("");
const opened = ref("");

/** Base64 in chunks, so a large structure file does not overflow the call stack. */
function toBase64(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(out);
}

async function openZip(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
        const entries = await readZip(new Uint8Array(await file.arrayBuffer()));
        const text = new Map([...entries].filter(([k]) => isPackText(k)).map(([k, v]) => [k, new TextDecoder().decode(v)]));
        const { pack: loaded, kept } = packFromFiles(text);
        const root = [...text.keys()].find((k) => k.endsWith("pack.mcmeta"))?.replace(/pack\.mcmeta$/, "") ?? "";
        loaded.extraBinary = Object.fromEntries(
            [...entries].filter(([k]) => !isPackText(k) && k.startsWith(root)).map(([k, v]) => [k.slice(root.length), toBase64(v)]),
        );
        pack.value = loaded;
        section.value = "pack";
        opened.value = t("datapack.opened", { name: file.name, kept }, "Opened {name}. Functions and tags are editable; {kept} other file(s) are kept exactly as they were.");
    } catch (error) {
        opened.value = error instanceof Error ? error.message : String(error);
    }
}

/** Each drop's real chance per pick: its weight over the pool's total. */
const lootChances = computed(() => {
    const entries = loot.value?.entries ?? [];
    const total = entries.reduce((n, e) => n + Math.max(0, e.weight), 0);
    return entries.map((e) => (total === 0 ? 0 : e.weight / total));
});

/** The pack's advancements as a tree: roots on top, children under their parent. */
const advTree = computed(() => {
    const list = pack.value.advancements;
    const byName = new Map(list.map((a, i) => [a.name, i]));
    const depth = (i: number, seen = new Set<number>()): number => {
        const parent = byName.get(list[i]!.parent);
        if (parent === undefined || seen.has(parent)) return 0;
        seen.add(i);
        return depth(parent, seen) + 1;
    };
    const rows = new Map<number, number>();
    const nodes = list.map((a, i) => {
        const d = depth(i);
        const col = rows.get(d) ?? 0;
        rows.set(d, col + 1);
        return { i, name: a.title || a.name, frame: a.frame, x: 16 + col * 150, y: 16 + d * 70 };
    });
    const edges = list.flatMap((a, i) => {
        const p = byName.get(a.parent);
        return p === undefined ? [] : [{ from: nodes[p]!, to: nodes[i]! }];
    });
    const width = Math.max(320, ...nodes.map((n) => n.x + 150));
    const height = Math.max(100, ...nodes.map((n) => n.y + 60));
    return { nodes, edges, width, height };
});

/** The pack's files as an indented tree, for the side panel. */
const fileTree = computed(() => {
    const out: { label: string; path: string | null; depth: number }[] = [];
    const seen = new Set<string>();
    for (const path of [...files.value.keys()].sort()) {
        const parts = path.split("/");
        parts.forEach((part, d) => {
            const key = parts.slice(0, d + 1).join("/");
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ label: d === parts.length - 1 ? part : `${part}/`, path: d === parts.length - 1 ? path : null, depth: d });
        });
    }
    return out;
});

function exportZip(): void {
    const all = new Map<string, string | Uint8Array>(files.value);
    for (const [path, b64] of Object.entries(pack.value.extraBinary ?? {})) all.set(path, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    const bytes = zipStore(all);
    const name = `${slug(pack.value.namespace)}.zip`;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    exported.value = t(
        "datapack.exported",
        { name },
        "Saved {name}. Put it in the world's datapacks folder, then run /reload in game.",
    );
}
function clearDraft(): void {
    pack.value = emptyPack();
    exported.value = "";
}
const versionItems = PACK_VERSIONS.map((v, i) => ({
    value: i,
    title: `${v.label} (format ${v.major}${v.minor ? `.${v.minor}` : ""})`,
}));
</script>

<template>
    <div class="wl-dp">
        <section
            class="wl-dp__card wl-dp__nav"
            :aria-label="t('datapack.contents', 'What the pack holds')"
        >
            <h2 class="wl-dp__title">{{ pack.namespace }}</h2>
            <label class="wl-dp__open">
                <input type="file" accept=".zip,application/zip" class="wl-dp__file-input" :aria-label="t('datapack.openZip', 'Open a pack (.zip)')" @change="openZip" />
                <span>{{ t("datapack.openZip", "Open a pack (.zip)") }}</span>
            </label>
            <p v-if="opened" class="wl-dp__note" role="status">{{ opened }}</p>
            <v-select
                v-model="pack.versionIndex"
                :items="versionItems"
                :label="t('datapack.version', 'Works with')"
                density="comfortable"
                variant="outlined"
                hide-details
            />
            <config-search-field
                v-model="query"
                v-model:regex="queryRegex"
                v-model:flags="queryFlags"
                :label="t('datapack.search', 'Find a part or file')"
                :sample="searchSample"
                density="compact"
            />
            <div
                role="listbox"
                :aria-label="t('datapack.contents', 'What the pack holds')"
                class="wl-dp__list"
            >
                <p v-if="!shownSections.length" class="wl-dp__note">
                    {{ t("datapack.searchNone", "Nothing in this pack matches that.") }}
                </p>
                <button
                    v-for="s in shownSections"
                    :key="s.id"
                    type="button"
                    role="option"
                    class="wl-dp__item"
                    :aria-selected="section === s.id ? 'true' : 'false'"
                    @click="section = s.id"
                >
                    <span>{{ s.label }}</span
                    ><span v-if="s.count !== null" class="wl-dp__count">{{ s.count }}</span>
                </button>
            </div>
        </section>

        <section
            class="wl-dp__card wl-dp__main"
            :aria-label="sections.find((s) => s.id === section)?.label"
        >
            <template v-if="section === 'pack'">
                <v-text-field
                    v-model="pack.namespace"
                    :label="t('datapack.namespace', 'Namespace')"
                    :hint="
                        t(
                            'datapack.namespaceHint',
                            'Lowercase letters, numbers, _ . and -. Used in every id, like my_pack:tick.',
                        )
                    "
                    persistent-hint
                    variant="outlined"
                />
                <v-textarea
                    v-model="pack.description"
                    :label="t('datapack.description', 'Description shown in the pack list')"
                    rows="2"
                    auto-grow
                    variant="outlined"
                />
            </template>
            <template v-else-if="section === 'overlays'">
                <p class="wl-dp__note">
                    {{
                        t(
                            "datapack.overlays.note",
                            "An overlay is a folder beside data/ whose files replace the base ones on the versions you pick, so one pack can work across versions. Its files come along when a pack is opened and are saved back.",
                        )
                    }}
                </p>
                <p v-if="!(pack.overlays ?? []).length" class="wl-dp__note">
                    {{ t("datapack.overlays.none", "No overlays. Every version reads the base files.") }}
                </p>
                <div v-for="(o, i) in pack.overlays ?? []" :key="i" class="wl-dp__row">
                    <v-text-field
                        v-model="o.directory"
                        :label="t('datapack.overlays.folder', 'Folder name')"
                        density="comfortable"
                        variant="outlined"
                        hide-details
                        class="wl-dp__grow"
                    />
                    <v-select
                        v-model="o.oldest"
                        :items="versionItems"
                        :label="t('datapack.overlays.oldest', 'From')"
                        density="comfortable"
                        variant="outlined"
                        hide-details
                    />
                    <v-select
                        v-model="o.newest"
                        :items="versionItems"
                        :label="t('datapack.overlays.newest', 'Up to')"
                        density="comfortable"
                        variant="outlined"
                        hide-details
                    />
                    <v-btn
                        variant="text"
                        rounded="pill"
                        color="error"
                        :aria-label="t('datapack.overlays.remove', { name: o.directory }, 'Remove overlay {name}')"
                        @click="(pack.overlays ?? []).splice(i, 1)"
                        >{{ t("datapack.remove", "Remove") }}</v-btn
                    >
                </div>
                <div class="wl-dp__row">
                    <v-btn variant="tonal" rounded="pill" @click="addOverlay">{{
                        t("datapack.overlays.add", "Add an overlay")
                    }}</v-btn>
                </div>
            </template>
            <template v-else>
                <div class="wl-dp__row">
                    <v-btn-toggle
                        v-if="shownItems.length"
                        v-model="pick"
                        mandatory
                        density="comfortable"
                        rounded="pill"
                        variant="outlined"
                        class="wl-dp__wrap"
                        :aria-label="t('datapack.entries', 'Entries')"
                    >
                        <v-btn v-for="{ it, i } in shownItems" :key="i" :value="i" size="small">{{
                            it.name
                        }}</v-btn>
                    </v-btn-toggle>
                    <v-select
                        v-if="section === 'parts'"
                        v-model="newKind"
                        :items="partKindItems"
                        :label="t('datapack.part.kind', 'Kind of part')"
                        density="comfortable"
                        variant="outlined"
                        hide-details
                        class="wl-dp__kind"
                    />
                    <v-btn variant="tonal" rounded="pill" @click="add">{{
                        t("datapack.add", "Add")
                    }}</v-btn>
                </div>
                <p v-if="!items.length" class="wl-dp__note">
                    {{ t("datapack.empty", "Nothing here yet. Add one to start.") }}
                </p>
                <div v-if="items.length" class="wl-dp__row">
                    <v-text-field
                        v-model="currentName"
                        :label="t('datapack.name', 'File name')"
                        density="comfortable"
                        variant="outlined"
                        hide-details
                        class="wl-dp__grow"
                    />
                    <v-btn variant="text" rounded="pill" color="error" @click="removeCurrent">{{
                        t("datapack.remove", "Remove")
                    }}</v-btn>
                </div>

                <template v-if="recipe">
                    <div class="wl-dp__row">
                        <v-select
                            v-model="recipe.kind"
                            :items="recipeKinds"
                            :label="t('datapack.recipeKind', 'Made in')"
                            density="comfortable"
                            variant="outlined"
                            hide-details
                        />
                        <v-select
                            v-if="
                                !isCooking &&
                                recipe.kind !== 'stonecutting' &&
                                recipe.kind !== 'smithing_transform'
                            "
                            v-model="recipe.category"
                            :items="categories"
                            :label="t('datapack.category', 'Recipe book tab')"
                            density="comfortable"
                            variant="outlined"
                            hide-details
                        />
                    </div>
                    <div v-if="isGrid" class="wl-dp__craft">
                        <div
                            class="wl-dp__grid"
                            role="grid"
                            :aria-label="
                                t(
                                    'datapack.grid',
                                    'Crafting grid. Click to place the brush item, right-click to empty.',
                                )
                            "
                        >
                            <button
                                v-for="(slot, i) in recipe.grid"
                                :key="i"
                                type="button"
                                class="wl-dp__slot"
                                :aria-label="
                                    t(
                                        'datapack.slot',
                                        {
                                            n: i + 1,
                                            item: slot
                                                ? shortName(slot)
                                                : t('datapack.emptySlot', 'empty'),
                                        },
                                        'Slot {n}: {item}',
                                    )
                                "
                                @click="paint(i)"
                                @contextmenu.prevent="paint(i, true)"
                                @keydown.delete.prevent="paint(i, true)"
                            >
                                {{ slot ? shortName(slot) : "" }}
                            </button>
                        </div>
                        <div class="wl-dp__brush">
                            <v-combobox
                                v-model="brush"
                                :items="[...ITEM_IDS]"
                                :label="t('datapack.brush', 'Brush item (or #tag)')"
                                density="comfortable"
                                variant="outlined"
                                hide-details
                            />
                            <p class="wl-dp__note">
                                {{
                                    t(
                                        "datapack.brushHint",
                                        "Click a slot to place it; right-click or Delete empties a slot.",
                                    )
                                }}
                            </p>
                        </div>
                    </div>
                    <div v-else class="wl-dp__row">
                        <v-combobox
                            v-if="recipe.kind === 'smithing_transform'"
                            v-model="recipe.template"
                            :items="[...ITEM_IDS]"
                            :label="t('datapack.template', 'Template')"
                            density="comfortable"
                            variant="outlined"
                            hide-details
                        />
                        <v-combobox
                            v-model="recipe.input"
                            :items="[...ITEM_IDS]"
                            :label="
                                recipe.kind === 'smithing_transform'
                                    ? t('datapack.base', 'Base item')
                                    : t('datapack.input', 'Input')
                            "
                            density="comfortable"
                            variant="outlined"
                            hide-details
                        />
                        <v-combobox
                            v-if="recipe.kind === 'smithing_transform'"
                            v-model="recipe.addition"
                            :items="[...ITEM_IDS]"
                            :label="t('datapack.addition', 'Addition')"
                            density="comfortable"
                            variant="outlined"
                            hide-details
                        />
                    </div>
                    <div class="wl-dp__row">
                        <v-combobox
                            v-model="recipe.result"
                            :items="[...ITEM_IDS]"
                            :label="t('datapack.result', 'Makes')"
                            density="comfortable"
                            variant="outlined"
                            hide-details
                            class="wl-dp__grow"
                        />
                        <v-text-field
                            v-if="!isCooking && recipe.kind !== 'smithing_transform'"
                            v-model.number="recipe.count"
                            type="number"
                            min="1"
                            max="99"
                            :label="t('datapack.count', 'How many')"
                            density="comfortable"
                            variant="outlined"
                            hide-details
                            class="wl-dp__num"
                        />
                    </div>
                    <template v-if="isCooking">
                        <v-slider
                            v-model="recipe.cookingTime"
                            :min="20"
                            :max="1200"
                            :step="10"
                            thumb-label
                            :label="
                                t(
                                    'datapack.cookTime',
                                    { s: (recipe.cookingTime / 20).toFixed(1) },
                                    'Cooking time ({s} s)',
                                )
                            "
                            hide-details
                        />
                        <v-slider
                            v-model="recipe.experience"
                            :min="0"
                            :max="5"
                            :step="0.05"
                            thumb-label
                            :label="t('datapack.xp', 'Experience')"
                            hide-details
                        />
                    </template>
                </template>

                <template v-if="fn">
                    <div class="wl-dp__row">
                        <v-switch
                            v-model="fn.onLoad"
                            color="primary"
                            hide-details
                            :label="t('datapack.onLoad', 'Run when the pack loads')"
                        />
                        <v-switch
                            v-model="fn.onTick"
                            color="primary"
                            hide-details
                            :label="t('datapack.onTick', 'Run every tick')"
                        />
                    </div>
                    <function-editor v-model="functionText" />
                    <ul v-if="lineChecks.length" class="wl-dp__problems" role="list">
                        <li v-for="c in lineChecks" :key="c.n">
                            {{ t("datapack.lineN", { n: c.n }, "Line {n}") }}: {{ c.problem }}
                        </li>
                    </ul>
                    <div class="wl-dp__row">
                        <v-btn variant="tonal" rounded="pill" @click="builderOpen = true">{{
                            t("datapack.buildCommand", "Build a command…")
                        }}</v-btn>
                    </div>
                    <CommandBuilder v-model="builderOpen" @use-command="addLine" />
                </template>

                <template v-if="tag">
                    <v-btn-toggle
                        v-model="tag.registry"
                        mandatory
                        density="comfortable"
                        rounded="pill"
                        variant="outlined"
                        :aria-label="t('datapack.tagOf', 'Tag of')"
                    >
                        <v-btn value="item">{{ t("datapack.items", "Items") }}</v-btn>
                        <v-btn value="block">{{ t("datapack.blocks", "Blocks") }}</v-btn>
                    </v-btn-toggle>
                    <v-combobox
                        v-model="tag.values"
                        :items="tagOptions"
                        multiple
                        chips
                        closable-chips
                        :label="t('datapack.values', 'Values')"
                        variant="outlined"
                    />
                    <v-switch
                        v-model="tag.replace"
                        color="primary"
                        hide-details
                        :label="
                            t(
                                'datapack.replace',
                                'Replace the same tag from other packs instead of adding to it',
                            )
                        "
                    />
                </template>

                <template v-if="adv">
                    <svg
                        class="wl-dp__tree"
                        :viewBox="`0 0 ${advTree.width} ${advTree.height}`"
                        :width="advTree.width"
                        role="group"
                        :aria-label="t('datapack.advTree', 'Advancement tree; choose one to edit it')"
                    >
                        <line v-for="(e, k) in advTree.edges" :key="'e' + k" :x1="e.from.x + 65" :y1="e.from.y + 40" :x2="e.to.x + 65" :y2="e.to.y" class="wl-dp__edge" />
                        <g
                            v-for="n in advTree.nodes"
                            :key="n.i"
                            class="wl-dp__node"
                            :class="{ 'is-on': n.i === pick }"
                            tabindex="0"
                            role="button"
                            :aria-label="n.name"
                            :aria-pressed="n.i === pick ? 'true' : 'false'"
                            @click="pick = n.i"
                            @keydown.enter.prevent="pick = n.i"
                            @keydown.space.prevent="pick = n.i"
                        >
                            <rect :x="n.x" :y="n.y" width="130" height="40" :rx="n.frame === 'challenge' ? 20 : n.frame === 'goal' ? 14 : 6" />
                            <text :x="n.x + 65" :y="n.y + 25" text-anchor="middle">{{ n.name.length > 16 ? n.name.slice(0, 15) + "…" : n.name }}</text>
                        </g>
                    </svg>
                    <div class="wl-dp__row">
                        <v-text-field
                            v-model="adv.title"
                            :label="t('datapack.advTitle', 'Title')"
                            density="comfortable"
                            variant="outlined"
                            hide-details
                            class="wl-dp__grow"
                        />
                        <v-combobox
                            v-model="adv.icon"
                            :items="[...ITEM_IDS]"
                            :label="t('datapack.icon', 'Icon')"
                            density="comfortable"
                            variant="outlined"
                            hide-details
                        />
                    </div>
                    <v-text-field
                        v-model="adv.description"
                        :label="t('datapack.advDescription', 'Description')"
                        density="comfortable"
                        variant="outlined"
                        hide-details
                    />
                    <v-btn-toggle
                        v-model="adv.frame"
                        mandatory
                        density="comfortable"
                        rounded="pill"
                        variant="outlined"
                        :aria-label="t('datapack.frame', 'Frame')"
                    >
                        <v-btn value="task">{{ t("datapack.task", "Task") }}</v-btn>
                        <v-btn value="goal">{{ t("datapack.goal", "Goal") }}</v-btn>
                        <v-btn value="challenge">{{ t("datapack.challenge", "Challenge") }}</v-btn>
                    </v-btn-toggle>
                    <v-combobox
                        v-model="adv.triggerItem"
                        :items="['', ...ITEM_IDS]"
                        :label="
                            t(
                                'datapack.trigger',
                                'Granted when the player gets (empty: straight away)',
                            )
                        "
                        density="comfortable"
                        variant="outlined"
                        hide-details
                    />
                    <div class="wl-dp__row">
                        <v-select
                            v-model="adv.parent"
                            :items="[
                                '',
                                ...pack.advancements.filter((a) => a !== adv).map((a) => a.name),
                            ]"
                            :label="t('datapack.parent', 'Comes after (empty starts a new tab)')"
                            density="comfortable"
                            variant="outlined"
                            hide-details
                        />
                        <v-select
                            v-model="adv.rewardFunction"
                            :items="['', ...pack.functions.map((f) => f.name)]"
                            :label="t('datapack.reward', 'Runs function')"
                            density="comfortable"
                            variant="outlined"
                            hide-details
                        />
                    </div>
                    <v-slider
                        v-model="adv.experience"
                        :min="0"
                        :max="500"
                        :step="5"
                        thumb-label
                        :label="t('datapack.rewardXp', 'Experience reward')"
                        hide-details
                    />
                    <div class="wl-dp__row">
                        <v-switch
                            v-model="adv.announce"
                            color="primary"
                            hide-details
                            :label="t('datapack.announce', 'Announce in chat')"
                        />
                        <v-switch
                            v-model="adv.hidden"
                            color="primary"
                            hide-details
                            :label="t('datapack.hidden', 'Hidden until earned')"
                        />
                    </div>
                </template>

                <template v-if="part">
                    <p class="wl-dp__note">
                        {{ t(`datapack.part.${part.kind}`, partKind(part.kind)?.label ?? part.kind) }}
                        <span v-if="part.namespace">
                            ·
                            {{
                                t(
                                    "datapack.part.namespace",
                                    { namespace: part.namespace },
                                    "kept under {namespace}, where it was opened from",
                                )
                            }}
                        </span>
                    </p>
                    <v-textarea
                        v-model="part.text"
                        :label="t('datapack.part.json', 'The file, as JSON')"
                        :error-messages="partProblem ?? []"
                        rows="14"
                        auto-grow
                        variant="outlined"
                        spellcheck="false"
                        class="wl-dp__json"
                    />
                    <div class="wl-dp__row">
                        <v-btn
                            variant="tonal"
                            rounded="pill"
                            :disabled="partProblem !== null"
                            @click="formatPart"
                            >{{ t("datapack.part.format", "Tidy the layout") }}</v-btn
                        >
                        <span v-if="partProblem !== null" class="wl-dp__note">{{
                            t("datapack.part.formatWhy", "Tidying needs valid JSON first.")
                        }}</span>
                        <v-btn variant="text" rounded="pill" @click="resetPart">{{
                            t("datapack.part.reset", "Start again from the template")
                        }}</v-btn>
                    </div>
                </template>
                <template v-if="biome">
                    <svg viewBox="0 0 600 220" width="100%" class="wl-dp__climate" role="group" :aria-label="t('datapack.climate', 'Climate graph: warmer to the right, wetter higher; choose a biome to edit it')">
                        <text x="20" y="215" class="wl-dp__axis">{{ t("datapack.cold", "cold") }}</text>
                        <text x="580" y="215" text-anchor="end" class="wl-dp__axis">{{ t("datapack.hot", "hot") }}</text>
                        <text x="24" y="16" class="wl-dp__axis">{{ t("datapack.wet", "wet") }}</text>
                        <g v-for="c in climate" :key="c.i" class="wl-dp__node" :class="{ 'is-on': c.i === pick }" tabindex="0" role="button" :aria-label="c.name" @click="pick = c.i" @keydown.enter.prevent="pick = c.i">
                            <circle :cx="c.x" :cy="c.y" r="12" :fill="c.colour" />
                            <text :x="c.x + 16" :y="c.y + 4">{{ c.name }}</text>
                        </g>
                    </svg>
                    <v-slider v-model="biome.temperature" :min="-0.5" :max="2" :step="0.05" thumb-label :label="t('datapack.temperature', 'Temperature')" hide-details />
                    <v-slider v-model="biome.downfall" :min="0" :max="1" :step="0.05" thumb-label :label="t('datapack.downfall', 'Rainfall')" hide-details />
                    <p class="wl-dp__note">{{ t("datapack.biomeNote", "Colours are written in the effects block. From 1.21.11 some biome colours also come from environment attributes, so check them in game.") }}</p>
                    <v-switch v-model="biome.precipitation" color="primary" hide-details :label="t('datapack.precipitation', 'Rain or snow falls here')" />
                    <div class="wl-dp__row">
                        <label v-for="f in (['skyColor', 'fogColor', 'waterColor', 'waterFogColor'] as const)" :key="f" class="wl-dp__colour">
                            <input v-model="biome[f]" type="color" />
                            <span>{{ { skyColor: t("datapack.sky", "Sky"), fogColor: t("datapack.fog", "Fog"), waterColor: t("datapack.water", "Water"), waterFogColor: t("datapack.waterFog", "Underwater fog") }[f] }} {{ biome[f] }}</span>
                        </label>
                    </div>
                </template>

                <template v-if="predicate">
                    <p class="wl-dp__note">{{ t("datapack.pred.help", "Snap conditions together. Groups hold other blocks; the pack writes the game's predicate file.") }}</p>
                    <predicate-block-editor :block="predicate.root" />
                </template>

                <template v-if="loot">
                    <v-btn-toggle
                        v-model="loot.kind"
                        mandatory
                        density="comfortable"
                        rounded="pill"
                        variant="outlined"
                        :aria-label="t('datapack.lootKind', 'Used for')"
                    >
                        <v-btn value="chest">{{ t("datapack.chest", "Chest") }}</v-btn>
                        <v-btn value="block">{{ t("datapack.block", "Block drop") }}</v-btn>
                        <v-btn value="entity">{{ t("datapack.entity", "Mob drop") }}</v-btn>
                    </v-btn-toggle>
                    <v-range-slider
                        :model-value="[loot.rollsMin, loot.rollsMax]"
                        :min="1"
                        :max="10"
                        :step="1"
                        thumb-label
                        :label="t('datapack.rolls', 'Picks per open')"
                        hide-details
                        @update:model-value="
                            (v: number[]) => {
                                loot!.rollsMin = v[0] ?? 1;
                                loot!.rollsMax = v[1] ?? 1;
                            }
                        "
                    />
                    <div v-for="(e, i) in loot.entries" :key="i" class="wl-dp__row wl-dp__drop">
                        <div class="wl-dp__chance" :aria-label="t('datapack.chance', { pct: (lootChances[i]! * 100).toFixed(1) }, 'Chance per pick: {pct}%')">
                            <span class="wl-dp__bar" :style="{ width: `${Math.round(lootChances[i]! * 100)}%` }" />
                            <span class="wl-dp__pct">{{ (lootChances[i]! * 100).toFixed(1) }}%</span>
                        </div>
                        <v-combobox
                            v-model="e.item"
                            :items="[...ITEM_IDS]"
                            :label="t('datapack.drop', 'Item')"
                            density="compact"
                            variant="outlined"
                            hide-details
                            class="wl-dp__grow"
                        />
                        <v-slider
                            v-model="e.weight"
                            :min="1"
                            :max="100"
                            :step="1"
                            thumb-label
                            :label="t('datapack.weight', 'Weight')"
                            hide-details
                            class="wl-dp__grow"
                        />
                        <v-range-slider
                            :model-value="[e.min, e.max]"
                            :min="1"
                            :max="64"
                            :step="1"
                            thumb-label
                            :label="t('datapack.howMany', 'Count')"
                            hide-details
                            class="wl-dp__grow"
                            @update:model-value="
                                (v: number[]) => {
                                    e.min = v[0] ?? 1;
                                    e.max = v[1] ?? 1;
                                }
                            "
                        />
                        <v-btn
                            variant="text"
                            size="small"
                            :aria-label="t('datapack.removeDrop', { n: i + 1 }, 'Remove drop {n}')"
                            @click="loot.entries.splice(i, 1)"
                            >✕</v-btn
                        >
                    </div>
                    <v-btn
                        variant="tonal"
                        rounded="pill"
                        @click="
                            loot.entries.push({
                                item: 'minecraft:diamond',
                                weight: 1,
                                min: 1,
                                max: 1,
                            })
                        "
                        >{{ t("datapack.addDrop", "Add a drop") }}</v-btn
                    >
                </template>
            </template>
        </section>

        <section
            class="wl-dp__card wl-dp__side"
            :aria-label="t('datapack.check', 'Check and export')"
        >
            <h2 class="wl-dp__title">{{ t("datapack.check", "Check and export") }}</h2>
            <p v-if="problems.length === 0" class="wl-dp__note">
                {{ t("datapack.allGood", "No problems found for this version.") }}
            </p>
            <ul
                v-else
                class="wl-dp__problems"
                role="list"
                :aria-label="t('datapack.problems', 'Problems')"
            >
                <li v-for="(p, i) in problems" :key="i">
                    <strong>{{ p.where }}</strong
                    >: {{ p.message }}
                </li>
            </ul>
            <ul class="wl-dp__files" role="tree" :aria-label="t('datapack.files', 'Files in the pack')">
                <li v-for="f in fileTree" :key="f.label + f.depth + (f.path ?? '')" role="treeitem" :style="{ paddingLeft: `${8 + f.depth * 12}px` }">
                    <button v-if="f.path" type="button" class="wl-dp__file" :aria-current="preview === f.path ? 'true' : undefined" @click="preview = f.path">{{ f.label }}</button>
                    <span v-else class="wl-dp__folder">{{ f.label }}</span>
                </li>
            </ul>
            <v-select
                v-model="preview"
                :items="[...files.keys()]"
                :label="t('datapack.preview', 'Preview a file')"
                density="compact"
                variant="outlined"
                hide-details
            />
            <pre
                class="wl-dp__pre"
                tabindex="0"
                :aria-label="t('datapack.previewText', 'File contents')"
                >{{ previewText }}</pre>
            <div class="wl-dp__row">
                <v-btn
                    color="primary"
                    rounded="pill"
                    :disabled="problems.length > 0"
                    @click="exportZip"
                    >{{ t("datapack.export", "Save as .zip") }}</v-btn
                >
                <v-btn variant="text" rounded="pill" @click="clearDraft">{{
                    t("datapack.clear", "Start over")
                }}</v-btn>
            </div>
            <p v-if="problems.length > 0" class="wl-dp__note">
                {{ t("datapack.fixFirst", "Fix the problems above to save the pack.") }}
            </p>
            <p class="wl-dp__note" aria-live="polite">{{ exported }}</p>
        </section>
    </div>
</template>

<style scoped>
.wl-dp {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
    padding: 4px 2px 16px;
}
.wl-dp__card {
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    border-radius: 24px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}
.wl-dp__nav {
    flex: 1 1 240px;
}
.wl-dp__main {
    flex: 3 1 480px;
}
.wl-dp__side {
    flex: 1 1 300px;
}
.wl-dp__title {
    margin: 0;
    font:
        500 16px/24px Roboto,
        sans-serif;
    word-break: break-all;
}
.wl-dp__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.wl-dp__item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    border: 0;
    border-radius: 22px;
    background: transparent;
    color: inherit;
    font:
        500 14px/20px Roboto,
        sans-serif;
    text-align: left;
    cursor: pointer;
}
.wl-dp__item:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
}
.wl-dp__item[aria-selected="true"] {
    background: rgb(var(--v-theme-secondary-container, var(--v-theme-secondary)));
    color: rgb(var(--v-theme-on-secondary-container, var(--v-theme-on-secondary)));
}
.wl-dp__item:focus-visible,
.wl-dp__slot:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
.wl-dp__count {
    font:
        500 12px/16px Roboto,
        sans-serif;
    padding: 2px 8px;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.08);
}
.wl-dp__row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
}
.wl-dp__wrap {
    flex-wrap: wrap;
    height: auto !important;
}
.wl-dp__kind {
    min-width: 14rem;
    flex: 0 1 18rem;
}
.wl-dp__json :deep(textarea) {
    font-family: var(--wl-font-mono, ui-monospace, "Cascadia Code", Consolas, monospace);
    font-size: 0.875rem;
    line-height: 1.45;
}
.wl-dp__grow {
    flex: 1 1 200px;
    min-width: 0;
}
.wl-dp__num {
    flex: 0 0 120px;
}
.wl-dp__craft {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: flex-start;
}
.wl-dp__grid {
    display: grid;
    grid-template-columns: repeat(3, 64px);
    gap: 6px;
}
.wl-dp__slot {
    width: 64px;
    height: 64px;
    border-radius: 10px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
    background: rgba(var(--v-theme-on-surface), 0.06);
    color: inherit;
    font:
        500 10px/12px Roboto,
        sans-serif;
    padding: 2px;
    overflow-wrap: anywhere;
    cursor: pointer;
}
.wl-dp__brush {
    flex: 1 1 220px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.wl-dp__mono :deep(textarea) {
    font-family: "Roboto Mono", monospace;
    font-size: 13px;
}
.wl-dp__problems {
    margin: 0;
    padding-left: 18px;
    font:
        400 13px/20px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-error));
}
.wl-dp__pre {
    margin: 0;
    max-height: 260px;
    overflow: auto;
    padding: 12px;
    border-radius: 12px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font:
        400 12px/18px "Roboto Mono",
        monospace;
    white-space: pre-wrap;
    word-break: break-all;
}
.wl-dp__note {
    margin: 0;
    font:
        400 13px/18px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-dp__tree { max-width: 100%; height: auto; background: rgba(var(--v-theme-on-surface), 0.04); border-radius: 16px; }
.wl-dp__edge { stroke: rgb(var(--v-theme-on-surface-variant)); stroke-width: 2; }
.wl-dp__node rect { fill: rgb(var(--v-theme-surface)); stroke: rgb(var(--v-theme-primary)); stroke-width: 1.5; }
.wl-dp__node.is-on rect { fill: rgb(var(--v-theme-secondary-container, var(--v-theme-secondary))); stroke-width: 3; }
.wl-dp__node text { fill: rgb(var(--v-theme-on-surface)); font: 500 12px Roboto, sans-serif; }
.wl-dp__node { cursor: pointer; outline: none; }
.wl-dp__node:focus-visible rect { stroke-width: 4; }
.wl-dp__chance { position: relative; flex: 1 1 100%; height: 18px; border-radius: 9px; background: rgba(var(--v-theme-on-surface), 0.08); overflow: hidden; }
.wl-dp__bar { position: absolute; inset: 0 auto 0 0; background: rgb(var(--v-theme-primary)); border-radius: 9px; }
.wl-dp__pct { position: relative; padding-left: 8px; font: 500 11px/18px Roboto, sans-serif; mix-blend-mode: difference; color: #fff; }
.wl-dp__files { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow: auto; font: 400 12px/18px "Roboto Mono", monospace; }
.wl-dp__file { border: 0; background: transparent; color: inherit; font: inherit; padding: 2px 6px; border-radius: 6px; cursor: pointer; text-align: left; }
.wl-dp__file[aria-current="true"] { background: rgb(var(--v-theme-secondary-container, var(--v-theme-secondary))); }
.wl-dp__file:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); }
.wl-dp__folder { color: rgb(var(--v-theme-on-surface-variant)); }
.wl-dp__open { display: inline-flex; align-items: center; min-height: 40px; padding: 0 16px; border-radius: 20px; border: 1px solid rgb(var(--v-theme-outline, var(--v-theme-on-surface))); cursor: pointer; font: 500 14px Roboto, sans-serif; position: relative; align-self: flex-start; }
.wl-dp__open:focus-within { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.wl-dp__file-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.wl-dp__climate { background: linear-gradient(90deg, rgba(80, 140, 255, 0.18), rgba(255, 170, 60, 0.18)); border-radius: 16px; }
.wl-dp__axis { fill: rgb(var(--v-theme-on-surface-variant)); font: 400 11px Roboto, sans-serif; }
.wl-dp__climate .wl-dp__node text { fill: rgb(var(--v-theme-on-surface)); font: 500 12px Roboto, sans-serif; }
.wl-dp__climate .is-on circle { stroke: rgb(var(--v-theme-primary)); stroke-width: 3; }
.wl-dp__colour { display: inline-flex; align-items: center; gap: 8px; font: 400 13px Roboto, sans-serif; }
.wl-dp__colour input { width: 44px; height: 44px; border: 0; padding: 0; background: transparent; cursor: pointer; }
.wl-dp__drop {
    padding: 8px 0;
    border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}
</style>
