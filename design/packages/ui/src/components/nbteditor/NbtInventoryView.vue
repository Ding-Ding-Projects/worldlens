<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VBtnToggle } from "vuetify/components";
import NbtGroupFields from "./NbtGroupFields.vue";
import NbtValueEditor from "./NbtValueEditor.vue";
import type { DocumentInfo, NbtEditorBridge, NodeView } from "./nbtEditorBridge.js";
import { readableResource, type FieldInfo } from "./nbtFieldCatalogue.js";
import {
    ARMOR_SLOTS,
    ENDER,
    EQUIPMENT_KEYS,
    HOTBAR,
    MAIN,
    itemHue,
    itemMonogram,
    newItemSnbt,
    type SlotPlace,
} from "./nbtInventoryModel.js";

/**
 * A player's inventory, ender chest and equipment as slots, with the picked stack's fields beside.
 *
 * Works on player data and on the single-player player inside an older `level.dat`. Each stack's
 * own values (id, count, damage, and every component or legacy tag value) are edited with the
 * same tailored controls as the tree, through `NbtGroupFields`; an empty slot offers to put an
 * item there in the file's own layout (components and `count` from 1.20.5, `Count` before).
 *
 * Design: `design/design-sources/nbt-editor-full/Inventory.dc.html`.
 */
const props = defineProps<{
    bridge: NbtEditorBridge;
    doc: DocumentInfo;
    revision: number;
    disabled?: boolean | undefined;
}>();
const emit = defineEmits<{
    commit: [id: number, text: string];
    flip: [id: number, on: boolean];
    add: [parentId: number, name: string, snbt: string];
}>();
const { t } = useI18n();

interface Stack {
    readonly node: NodeView;
    readonly id: string;
    readonly count: number;
}

const which = ref<"inventory" | "ender">("inventory");
const lists = shallowRef<{
    inventory: NodeView | null;
    ender: NodeView | null;
    equipment: NodeView | null;
    dataVersion: number | null;
}>({ inventory: null, ender: null, equipment: null, dataVersion: null });
const stacks = shallowRef<{
    inventory: Map<number, Stack>;
    ender: Map<number, Stack>;
    equipment: Map<number, Stack>;
}>({ inventory: new Map(), ender: new Map(), equipment: new Map() });
const picked = ref<number>(0);
const failure = ref<string | null>(null);
const newId = ref("minecraft:stone");
const newCount = ref(1);

async function kids(id: number): Promise<readonly NodeView[]> {
    const page = await props.bridge.children(props.doc.docId, id, 0, 500);
    if (!page.ok) throw new Error(page.message);
    return page.value.nodes;
}

async function readStacks(list: NodeView | null, keyed: boolean): Promise<Map<number, Stack>> {
    const out = new Map<number, Stack>();
    if (list === null) return out;
    for (const item of await kids(list.id)) {
        if (item.kind !== "compound") continue;
        const fields = await kids(item.id);
        const slotNode = fields.find((f) => f.name === "Slot");
        const slot = keyed
            ? Number(Object.entries(EQUIPMENT_KEYS).find(([, k]) => k === item.name)?.[0] ?? NaN)
            : Number(slotNode?.text ?? NaN);
        if (!Number.isFinite(slot)) continue;
        const id = fields.find((f) => f.name === "id")?.text ?? "";
        const count = Number(
            fields.find((f) => f.name === "count" || f.name === "Count")?.text ?? "1",
        );
        out.set(slot, { node: item, id, count });
    }
    return out;
}

async function load(): Promise<void> {
    failure.value = null;
    try {
        let base = await kids(props.doc.root.id);
        const data = base.find((n) => n.name === "Data" && n.kind === "compound");
        if (data !== undefined) {
            const player = (await kids(data.id)).find(
                (n) => n.name === "Player" && n.kind === "compound",
            );
            if (player !== undefined) base = await kids(player.id);
        }
        const inventory = base.find((n) => n.name === "Inventory" && n.kind === "list") ?? null;
        const ender = base.find((n) => n.name === "EnderItems" && n.kind === "list") ?? null;
        const equipment = base.find((n) => n.name === "equipment" && n.kind === "compound") ?? null;
        const dv = Number(base.find((n) => n.name === "DataVersion")?.text ?? NaN);
        lists.value = { inventory, ender, equipment, dataVersion: Number.isFinite(dv) ? dv : null };
        if (inventory === null) throw new Error(t("nbt.inv.none", "This file has no inventory."));
        const [inv, end, eq] = await Promise.all([
            readStacks(inventory, false),
            readStacks(ender, false),
            readStacks(equipment, true),
        ]);
        stacks.value = { inventory: inv, ender: end, equipment: eq };
    } catch (error) {
        failure.value = error instanceof Error ? error.message : String(error);
    }
}
watch(
    () => [props.doc.docId, props.revision] as const,
    () => void load(),
    { immediate: true },
);

function stackAt(place: SlotPlace): Stack | null {
    if (place.area === "ender") return stacks.value.ender.get(place.slot) ?? null;
    if (place.area === "armor")
        return (
            stacks.value.inventory.get(place.slot) ?? stacks.value.equipment.get(place.slot) ?? null
        );
    return stacks.value.inventory.get(place.slot) ?? null;
}

const places = computed(() =>
    which.value === "ender"
        ? { armor: [], main: ENDER, hotbar: [] }
        : { armor: ARMOR_SLOTS, main: MAIN, hotbar: HOTBAR },
);
const pickedPlace = computed<SlotPlace>(
    () =>
        [...places.value.armor, ...places.value.main, ...places.value.hotbar].find(
            (p) => p.slot === picked.value,
        ) ?? (places.value.main[0] as SlotPlace),
);
const pickedStack = computed(() => stackAt(pickedPlace.value));

function slotLabel(place: SlotPlace): string {
    const s = stackAt(place);
    return s === null
        ? t("nbt.inv.emptySlot", { slot: place.label }, "{slot}: empty")
        : `${place.label}: ${readableResource(s.id)}${s.count > 1 ? ` × ${s.count}` : ""}`;
}

function slotStyle(place: SlotPlace): Record<string, string> {
    const s = stackAt(place);
    return s === null ? {} : { background: `hsl(${itemHue(s.id)} 45% 38%)`, color: "#fff" };
}

/** Where a new stack goes: the equipment compound for armour on 1.21.5+, else the list. */
const addTarget = computed(() => {
    const place = pickedPlace.value;
    if (place.area === "ender") return lists.value.ender;
    if (place.area === "armor" && lists.value.equipment !== null) return lists.value.equipment;
    return lists.value.inventory;
});

const countInfo: FieldInfo = {
    label: "Count",
    about: null,
    plainType: "Whole number",
    control: { type: "stepper", min: 1, max: 99, step: 1 },
};
const countNode = computed<NodeView>(() => ({
    id: -1,
    kind: "int",
    name: "count",
    text: String(newCount.value),
    summary: "",
    childCount: 0,
    listKind: null,
    isBool: false,
    valueLength: 0,
}));

function putItem(): void {
    const target = addTarget.value;
    if (target === null) return;
    const place = pickedPlace.value;
    const keyed = target === lists.value.equipment;
    const snbt = newItemSnbt(
        keyed ? null : place.slot,
        newId.value.trim(),
        newCount.value,
        lists.value.dataVersion,
    );
    emit("add", target.id, keyed ? (EQUIPMENT_KEYS[place.slot] ?? "offhand") : "", snbt);
}
</script>

<template>
    <div class="wl-inv">
        <p v-if="failure" class="wl-inv__note wl-inv__note--error" role="alert">{{ failure }}</p>
        <div v-else class="wl-inv__body">
            <section class="wl-inv__card" :aria-label="t('nbt.inv.slots', 'Slots')">
                <v-btn-toggle
                    v-model="which"
                    mandatory
                    density="comfortable"
                    rounded="pill"
                    variant="outlined"
                    color="secondary"
                    :aria-label="t('nbt.inv.which', 'Which inventory')"
                >
                    <v-btn value="inventory">{{ t("nbt.inv.inventory", "Inventory") }}</v-btn>
                    <v-btn value="ender" :disabled="lists.ender === null">{{
                        t("nbt.inv.ender", "Ender chest")
                    }}</v-btn>
                </v-btn-toggle>
                <div class="wl-inv__layout">
                    <div
                        v-if="places.armor.length"
                        class="wl-inv__armor"
                        role="group"
                        :aria-label="t('nbt.inv.armor', 'Armour and off hand')"
                    >
                        <button
                            v-for="p in places.armor"
                            :key="p.slot"
                            type="button"
                            class="wl-inv__slot"
                            :class="{ 'is-picked': picked === p.slot }"
                            :aria-pressed="picked === p.slot ? 'true' : 'false'"
                            :aria-label="slotLabel(p)"
                            :title="slotLabel(p)"
                            :style="slotStyle(p)"
                            @click="picked = p.slot"
                        >
                            <span aria-hidden="true">{{
                                stackAt(p) ? itemMonogram(stackAt(p)!.id) : ""
                            }}</span>
                            <span
                                v-if="(stackAt(p)?.count ?? 0) > 1"
                                class="wl-inv__count"
                                aria-hidden="true"
                                >{{ stackAt(p)?.count }}</span
                            >
                        </button>
                    </div>
                    <div class="wl-inv__grids">
                        <div
                            class="wl-inv__grid"
                            role="group"
                            :aria-label="
                                which === 'ender'
                                    ? t('nbt.inv.ender', 'Ender chest')
                                    : t('nbt.inv.main', 'Main inventory')
                            "
                        >
                            <button
                                v-for="p in places.main"
                                :key="p.slot"
                                type="button"
                                class="wl-inv__slot"
                                :class="{ 'is-picked': picked === p.slot }"
                                :aria-pressed="picked === p.slot ? 'true' : 'false'"
                                :aria-label="slotLabel(p)"
                                :title="slotLabel(p)"
                                :style="slotStyle(p)"
                                @click="picked = p.slot"
                            >
                                <span aria-hidden="true">{{
                                    stackAt(p) ? itemMonogram(stackAt(p)!.id) : ""
                                }}</span>
                                <span
                                    v-if="(stackAt(p)?.count ?? 0) > 1"
                                    class="wl-inv__count"
                                    aria-hidden="true"
                                    >{{ stackAt(p)?.count }}</span
                                >
                            </button>
                        </div>
                        <div
                            v-if="places.hotbar.length"
                            class="wl-inv__grid wl-inv__grid--hotbar"
                            role="group"
                            :aria-label="t('nbt.inv.hotbar', 'Hotbar')"
                        >
                            <button
                                v-for="p in places.hotbar"
                                :key="p.slot"
                                type="button"
                                class="wl-inv__slot"
                                :class="{ 'is-picked': picked === p.slot }"
                                :aria-pressed="picked === p.slot ? 'true' : 'false'"
                                :aria-label="slotLabel(p)"
                                :title="slotLabel(p)"
                                :style="slotStyle(p)"
                                @click="picked = p.slot"
                            >
                                <span aria-hidden="true">{{
                                    stackAt(p) ? itemMonogram(stackAt(p)!.id) : ""
                                }}</span>
                                <span
                                    v-if="(stackAt(p)?.count ?? 0) > 1"
                                    class="wl-inv__count"
                                    aria-hidden="true"
                                    >{{ stackAt(p)?.count }}</span
                                >
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <section class="wl-inv__card wl-inv__item" :aria-label="t('nbt.inv.item', 'Item')">
                <template v-if="pickedStack">
                    <h3 class="wl-inv__title">{{ readableResource(pickedStack.id) }}</h3>
                    <p class="wl-inv__note">{{ pickedPlace.label }} · {{ pickedStack.id }}</p>
                    <NbtGroupFields
                        :bridge="bridge"
                        :doc="doc"
                        :node="pickedStack.node"
                        :path="[]"
                        :max-depth="5"
                        :revision="revision"
                        :disabled="disabled"
                        @commit="(id: number, text: string) => emit('commit', id, text)"
                        @flip="(id: number, on: boolean) => emit('flip', id, on)"
                    />
                </template>
                <template v-else>
                    <h3 class="wl-inv__title">
                        {{
                            t("nbt.inv.emptyTitle", { slot: pickedPlace.label }, "{slot} is empty")
                        }}
                    </h3>
                    <label class="wl-inv__field">
                        <span>{{ t("nbt.inv.newId", "Item") }}</span>
                        <input
                            v-model="newId"
                            class="wl-inv__input"
                            spellcheck="false"
                            :aria-describedby="'wl-inv-readable'"
                        />
                        <span id="wl-inv-readable" class="wl-inv__note">{{
                            readableResource(newId)
                        }}</span>
                    </label>
                    <div class="wl-inv__row">
                        <span>{{ t("nbt.inv.count", "Count") }}</span>
                        <NbtValueEditor
                            :node="countNode"
                            :label="t('nbt.inv.count', 'Count')"
                            :info="countInfo"
                            @commit="(text: string) => (newCount = Number(text))"
                        />
                    </div>
                    <v-btn
                        color="primary"
                        variant="flat"
                        rounded="pill"
                        :disabled="
                            disabled ||
                            addTarget === null ||
                            !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(newId.trim())
                        "
                        @click="putItem"
                    >
                        {{ t("nbt.inv.put", "Put it here") }}
                    </v-btn>
                    <p
                        v-if="!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(newId.trim())"
                        class="wl-inv__note"
                    >
                        {{ t("nbt.inv.idHint", "An item id looks like minecraft:stone.") }}
                    </p>
                </template>
            </section>
        </div>
    </div>
</template>

<style scoped>
.wl-inv {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: auto;
    padding: 4px 2px 16px;
}
.wl-inv__body {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
}
.wl-inv__card {
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    border-radius: 24px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}
.wl-inv__item {
    flex: 2 1 320px;
}
.wl-inv__layout {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
}
.wl-inv__armor {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.wl-inv__grids {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.wl-inv__grid {
    display: grid;
    grid-template-columns: repeat(9, 48px);
    gap: 6px;
}
.wl-inv__slot {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 10px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
    background: rgb(var(--v-theme-surface-container-high, var(--v-theme-surface)));
    color: rgb(var(--v-theme-on-surface));
    font:
        700 13px Roboto,
        sans-serif;
    cursor: pointer;
    padding: 0;
}
.wl-inv__slot.is-picked {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 1px;
}
.wl-inv__slot:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
.wl-inv__count {
    position: absolute;
    right: 3px;
    bottom: 1px;
    font:
        700 11px "Roboto Mono",
        monospace;
}
.wl-inv__title {
    margin: 0;
    font:
        400 20px/28px Roboto,
        sans-serif;
}
.wl-inv__note {
    margin: 0;
    font:
        400 12px/16px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-inv__note--error {
    color: rgb(var(--v-theme-error));
    font-size: 13px;
}
.wl-inv__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font:
        500 12px Roboto,
        sans-serif;
}
.wl-inv__input {
    height: 44px;
    border-radius: 8px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.38);
    background: transparent;
    color: rgb(var(--v-theme-on-surface));
    padding: 0 12px;
    font:
        400 14px "Roboto Mono",
        monospace;
}
.wl-inv__input:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
.wl-inv__row {
    display: flex;
    align-items: center;
    gap: 12px;
}
@media (max-width: 720px) {
    .wl-inv__grid {
        grid-template-columns: repeat(9, minmax(32px, 1fr));
    }
    .wl-inv__slot {
        width: auto;
        min-width: 32px;
        height: 44px;
    }
}
</style>
