<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VBtnToggle, VBtn } from "vuetify/components";
import type { DocumentInfo, NbtEditorBridge, NodeView } from "./nbtEditorBridge.js";
import { readableResource } from "./nbtFieldCatalogue.js";
import {
    biomeAt,
    biomeIndices,
    blockAt,
    blockIndices,
    heightsFrom,
    lightAt,
} from "./nbtChunkModel.js";
import { blockColour, parsePalette, splitTopLevel, topLevelFields } from "./nbtStructureModel.js";

/**
 * One chunk as layers: surface height, biomes, blocks and light at a chosen height, and the
 * chunk's block entities. A picture of what the NBT means; values are still edited in the tree
 * and form, which this view never gets ahead of (it reads again after every edit).
 *
 * Design: `design/design-sources/nbt-editor-full/Chunk.dc.html`.
 */
const props = defineProps<{ bridge: NbtEditorBridge; doc: DocumentInfo; revision: number }>();
const emit = defineEmits<{ "show-tree": [] }>();
const { t } = useI18n();

type Layer = "height" | "biome" | "blocks" | "light";
const layer = ref<Layer>("height");
const heightKind = ref("MOTION_BLOCKING");
const failure = ref<string | null>(null);
const minY = ref(-64);
const sectionsY = shallowRef<{ y: number; node: NodeView }[]>([]);
const heightmaps = shallowRef<Map<string, NodeView>>(new Map());
const heights = shallowRef<number[]>([]);
const blockY = ref(64);
const section = shallowRef<{
    blocks: number[];
    palette: string[];
    biomes: number[];
    biomePalette: string[];
    light: number[] | null;
} | null>(null);
const blockEntities = shallowRef<{ id: string; pos: string }[]>([]);
const status = ref("");

async function kids(id: number): Promise<readonly NodeView[]> {
    const page = await props.bridge.children(props.doc.docId, id, 0, 500);
    if (!page.ok) throw new Error(page.message);
    return page.value.nodes;
}
async function longs(id: number): Promise<string[]> {
    const out: string[] = [];
    for (;;) {
        const page = await props.bridge.arrayPage(props.doc.docId, id, out.length, 2048);
        if (!page.ok) throw new Error(page.message);
        out.push(...page.value.values);
        if (page.value.values.length === 0 || out.length >= page.value.total) return out;
    }
}
async function snbtOf(id: number): Promise<string> {
    const a = await props.bridge.snbt(props.doc.docId, id, false);
    if (!a.ok) throw new Error(a.message);
    return a.value.text;
}

async function load(): Promise<void> {
    failure.value = null;
    try {
        let top = await kids(props.doc.root.id);
        const level = top.find((n) => n.name === "Level" && n.kind === "compound");
        if (level !== undefined) top = await kids(level.id);
        const sections = top.find(
            (n) => (n.name === "sections" || n.name === "Sections") && n.kind === "list",
        );
        if (sections === undefined)
            throw new Error(t("nbt.chunk.notOne", "This is not a chunk with sections."));
        const yPos = top.find((n) => n.name === "yPos");
        minY.value = yPos ? Number(yPos.text) * 16 : -64;
        status.value = top.find((n) => n.name === "Status")?.text ?? "";
        const list: { y: number; node: NodeView }[] = [];
        for (const s of await kids(sections.id)) {
            const y = (await kids(s.id)).find((n) => n.name === "Y");
            if (y !== undefined) list.push({ y: Number(y.text), node: s });
        }
        sectionsY.value = list.sort((a, b) => a.y - b.y);
        const hm = top.find((n) => n.name === "Heightmaps" && n.kind === "compound");
        heightmaps.value = new Map(
            (hm ? await kids(hm.id) : [])
                .filter((n) => n.kind === "longArray")
                .map((n) => [n.name ?? "", n]),
        );
        if (!heightmaps.value.has(heightKind.value))
            heightKind.value = [...heightmaps.value.keys()][0] ?? "MOTION_BLOCKING";
        const be = top.find(
            (n) => (n.name === "block_entities" || n.name === "TileEntities") && n.kind === "list",
        );
        blockEntities.value = be
            ? splitTopLevel(await snbtOf(be.id)).map((raw) => {
                  const f = topLevelFields(raw);
                  return {
                      id: (f.get("id") ?? "?").replace(/^["']|["']$/g, ""),
                      pos: `${f.get("x") ?? "?"}, ${f.get("y") ?? "?"}, ${f.get("z") ?? "?"}`,
                  };
              })
            : [];
        await loadHeights();
        await loadSection();
    } catch (error) {
        failure.value = error instanceof Error ? error.message : String(error);
    }
}

async function loadHeights(): Promise<void> {
    const node = heightmaps.value.get(heightKind.value);
    const height = Math.max(16, sectionsY.value.length * 16);
    heights.value = node ? heightsFrom(await longs(node.id), height, minY.value) : [];
}

async function loadSection(): Promise<void> {
    const sy = Math.floor(blockY.value / 16);
    const s = sectionsY.value.find((x) => x.y === sy);
    if (s === undefined) {
        section.value = null;
        return;
    }
    const fields = await kids(s.node.id);
    const states = fields.find((n) => n.name === "block_states" && n.kind === "compound");
    const biomes = fields.find((n) => n.name === "biomes" && n.kind === "compound");
    const lightNode = fields.find((n) => n.name === "BlockLight" && n.kind === "byteArray");
    let palette: string[] = ["minecraft:air"];
    let blocks: number[] = new Array<number>(4096).fill(0);
    if (states) {
        const sf = await kids(states.id);
        const p = sf.find((n) => n.name === "palette");
        if (p) palette = parsePalette(await snbtOf(p.id)).map((e) => e.name);
        const d = sf.find((n) => n.name === "data" && n.kind === "longArray");
        blocks = blockIndices(d ? await longs(d.id) : [], palette.length);
    }
    let biomePalette: string[] = [];
    let biomeData: number[] = new Array<number>(64).fill(0);
    if (biomes) {
        const bf = await kids(biomes.id);
        const p = bf.find((n) => n.name === "palette");
        if (p)
            biomePalette = splitTopLevel(await snbtOf(p.id)).map((v) =>
                v.replace(/^["']|["']$/g, ""),
            );
        const d = bf.find((n) => n.name === "data" && n.kind === "longArray");
        biomeData = biomeIndices(d ? await longs(d.id) : [], biomePalette.length);
    }
    const light = lightNode ? (await longs(lightNode.id)).map(Number) : null;
    section.value = { blocks, palette, biomes: biomeData, biomePalette, light };
}

watch(
    () => [props.doc.docId, props.revision] as const,
    () => void load(),
    { immediate: true },
);
watch(heightKind, () => void loadHeights());
watch(
    () => Math.floor(blockY.value / 16),
    () => void loadSection(),
);

const yRange = computed(() => {
    const ys = sectionsY.value.map((s) => s.y);
    return ys.length === 0
        ? { min: -64, max: 319 }
        : { min: Math.min(...ys) * 16, max: Math.max(...ys) * 16 + 15 };
});

function biomeColour(id: string): string {
    if (/ocean|river/.test(id)) return "hsl(215 55% 45%)";
    if (/desert|beach|badlands/.test(id)) return "hsl(45 60% 60%)";
    if (/snow|frozen|ice/.test(id)) return "hsl(200 30% 88%)";
    if (/forest|jungle|taiga/.test(id)) return "hsl(125 40% 30%)";
    if (/nether|basalt|crimson|warped/.test(id)) return "hsl(0 45% 35%)";
    if (/end/.test(id)) return "hsl(55 25% 75%)";
    return "hsl(95 40% 45%)";
}

const cells = computed(() => {
    const out: { label: string; bg: string; text: string }[] = [];
    const hs = heights.value;
    const lo = hs.length ? Math.min(...hs) : 0;
    const hi = hs.length ? Math.max(...hs) : 1;
    const s = section.value;
    const yIn = ((blockY.value % 16) + 16) % 16;
    for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
            if (layer.value === "height") {
                const h = hs[z * 16 + x];
                const pct =
                    h === undefined || hi === lo
                        ? 50
                        : Math.round(15 + ((h - lo) / (hi - lo)) * 75);
                out.push({
                    label: t(
                        "nbt.chunk.cellHeight",
                        { x, z, h: h ?? "?" },
                        "x {x}, z {z}: surface at y {h}",
                    ),
                    bg: `color-mix(in srgb, rgb(var(--v-theme-primary)) ${pct}%, rgb(var(--v-theme-surface)))`,
                    text: h === undefined ? "" : String(h),
                });
            } else if (s === null) {
                out.push({
                    label: t(
                        "nbt.chunk.cellNone",
                        { x, z },
                        "x {x}, z {z}: no section at this height",
                    ),
                    bg: "transparent",
                    text: "",
                });
            } else if (layer.value === "biome") {
                const id = s.biomePalette[biomeAt(s.biomes, x, yIn, z)] ?? "?";
                out.push({
                    label: `x ${x}, z ${z}: ${readableResource(id)}`,
                    bg: biomeColour(id),
                    text: "",
                });
            } else if (layer.value === "blocks") {
                const id = s.palette[blockAt(s.blocks, x, yIn, z)] ?? "minecraft:air";
                const c = blockColour(id);
                out.push({
                    label: `x ${x}, z ${z}: ${readableResource(id)}`,
                    bg: c === "transparent" ? "transparent" : c,
                    text: "",
                });
            } else {
                const l = s.light === null ? 0 : lightAt(s.light, x, yIn, z);
                out.push({
                    label: t("nbt.chunk.cellLight", { x, z, l }, "x {x}, z {z}: block light {l}"),
                    bg: `color-mix(in srgb, #F2C14E ${Math.round((l / 15) * 90)}%, rgb(var(--v-theme-surface)))`,
                    text: String(l),
                });
            }
        }
    }
    return out;
});
</script>

<template>
    <div class="wl-chunk">
        <p v-if="failure" class="wl-chunk__note wl-chunk__note--error" role="alert">
            {{ failure }}
        </p>
        <div v-else class="wl-chunk__body">
            <section
                class="wl-chunk__card wl-chunk__main"
                :aria-label="t('nbt.chunk.layers', 'Chunk layers')"
            >
                <div class="wl-chunk__bar">
                    <v-btn-toggle
                        v-model="layer"
                        mandatory
                        density="comfortable"
                        rounded="pill"
                        variant="outlined"
                        color="secondary"
                        :aria-label="t('nbt.chunk.layer', 'Layer')"
                    >
                        <v-btn value="height">{{ t("nbt.chunk.height", "Height") }}</v-btn>
                        <v-btn value="biome">{{ t("nbt.chunk.biome", "Biome") }}</v-btn>
                        <v-btn value="blocks">{{ t("nbt.chunk.blocks", "Blocks") }}</v-btn>
                        <v-btn value="light">{{ t("nbt.chunk.light", "Light") }}</v-btn>
                    </v-btn-toggle>
                    <v-btn-toggle
                        v-if="layer === 'height' && heightmaps.size > 1"
                        v-model="heightKind"
                        mandatory
                        density="compact"
                        rounded="pill"
                        variant="outlined"
                        :aria-label="t('nbt.chunk.heightmap', 'Heightmap')"
                    >
                        <v-btn
                            v-for="name in [...heightmaps.keys()]"
                            :key="name"
                            :value="name"
                            size="small"
                            >{{ name.toLowerCase().replace(/_/g, " ") }}</v-btn
                        >
                    </v-btn-toggle>
                    <span class="wl-chunk__note">{{
                        status
                            ? t(
                                  "nbt.chunk.status",
                                  {
                                      s: readableResource(
                                          status.includes(":") ? status : `minecraft:${status}`,
                                      ),
                                  },
                                  "Generation step: {s}",
                              )
                            : ""
                    }}</span>
                </div>
                <div
                    class="wl-chunk__grid"
                    role="grid"
                    :aria-label="t('nbt.chunk.grid', 'Chunk, west to east and north to south')"
                >
                    <span
                        v-for="(c, i) in cells"
                        :key="i"
                        role="gridcell"
                        class="wl-chunk__cell"
                        :style="{ background: c.bg }"
                        :aria-label="c.label"
                        :title="c.label"
                        >{{ c.text }}</span
                    >
                </div>
                <label v-if="layer !== 'height'" class="wl-chunk__slider">
                    <span>{{ t("nbt.chunk.atY", { y: blockY }, "At y {y}") }}</span>
                    <input
                        v-model.number="blockY"
                        type="range"
                        :min="yRange.min"
                        :max="yRange.max"
                        step="1"
                        :aria-label="t('nbt.chunk.height', 'Height')"
                    />
                </label>
            </section>
            <section
                class="wl-chunk__card wl-chunk__side"
                :aria-label="t('nbt.chunk.blockEntities', 'Block entities')"
            >
                <h3 class="wl-chunk__title">
                    {{ t("nbt.chunk.blockEntities", "Block entities") }} ({{
                        blockEntities.length
                    }})
                </h3>
                <ul class="wl-chunk__list">
                    <li v-for="(b, i) in blockEntities" :key="i">
                        <span>{{ readableResource(b.id) }}</span
                        ><span class="wl-chunk__mono">{{ b.pos }}</span>
                    </li>
                </ul>
                <p v-if="blockEntities.length === 0" class="wl-chunk__note">
                    {{
                        t(
                            "nbt.chunk.noBlockEntities",
                            "No chests, signs or other block entities in this chunk.",
                        )
                    }}
                </p>
                <p class="wl-chunk__note">
                    {{
                        t(
                            "nbt.chunk.entitiesNote",
                            "Since 1.17 mobs and items are stored in the entities folder's region files; open that region to edit them.",
                        )
                    }}
                </p>
                <v-btn variant="tonal" rounded="pill" @click="emit('show-tree')">{{
                    t("nbt.chunk.editInTree", "Edit values in the tree")
                }}</v-btn>
            </section>
        </div>
    </div>
</template>

<style scoped>
.wl-chunk {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: auto;
    padding: 4px 2px 16px;
}
.wl-chunk__body {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
}
.wl-chunk__card {
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    border-radius: 24px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}
.wl-chunk__main {
    flex: 3 1 420px;
}
.wl-chunk__side {
    flex: 1 1 260px;
}
.wl-chunk__bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}
.wl-chunk__grid {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    gap: 2px;
    max-width: 480px;
    aspect-ratio: 1;
}
.wl-chunk__cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    aspect-ratio: 1;
    border-radius: 3px;
    font:
        500 9px "Roboto Mono",
        monospace;
    color: rgb(var(--v-theme-on-surface));
    box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.06);
}
.wl-chunk__slider {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 480px;
    font:
        500 12px Roboto,
        sans-serif;
}
.wl-chunk__slider input {
    accent-color: rgb(var(--v-theme-primary));
}
.wl-chunk__title {
    margin: 0;
    font:
        500 15px/22px Roboto,
        sans-serif;
}
.wl-chunk__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 320px;
    overflow: auto;
}
.wl-chunk__list li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font:
        400 13px Roboto,
        sans-serif;
    min-height: 32px;
    align-items: center;
}
.wl-chunk__mono {
    font:
        400 12px "Roboto Mono",
        monospace;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-chunk__note {
    margin: 0;
    font:
        400 12px/16px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-chunk__note--error {
    color: rgb(var(--v-theme-error));
    font-size: 13px;
}
</style>
