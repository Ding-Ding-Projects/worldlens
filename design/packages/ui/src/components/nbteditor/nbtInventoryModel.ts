/**
 * A player's inventory as slots: where each slot number sits on screen, and what a new item looks
 * like in the data layout this file uses.
 *
 * Player data (`playerdata/<uuid>.dat`, `players/data/<uuid>.dat` from 26.1, or `Data.Player` in an
 * older single-player `level.dat`) keeps `Inventory` and `EnderItems` as lists of item compounds
 * with a `Slot` byte. Hotbar is 0 to 8, the main grid 9 to 35. Armour was slots 100 to 103 and the
 * off hand -106 until 1.21.5 moved them into an `equipment` compound (`head`, `chest`, `legs`,
 * `feet`, `offhand`). Items gained components in 1.20.5, which also renamed `Count` (a byte) to
 * `count` (an int). See `docs/nbt-research.md`.
 *
 * Design: `design/design-sources/nbt-editor-full/Inventory.dc.html`. Pure.
 */

export const ITEM_COMPONENTS_DATA_VERSION = 3837;

export interface SlotPlace {
    readonly slot: number;
    readonly label: string;
    readonly area: "hotbar" | "main" | "armor" | "ender";
}

export const HOTBAR: readonly SlotPlace[] = Array.from({ length: 9 }, (_, i) => ({
    slot: i,
    label: `Hotbar ${i + 1}`,
    area: "hotbar" as const,
}));
export const MAIN: readonly SlotPlace[] = Array.from({ length: 27 }, (_, i) => ({
    slot: i + 9,
    label: `Slot ${i + 9}`,
    area: "main" as const,
}));
export const ENDER: readonly SlotPlace[] = Array.from({ length: 27 }, (_, i) => ({
    slot: i,
    label: `Ender chest ${i + 1}`,
    area: "ender" as const,
}));

/** Armour and off hand in the pre-1.21.5 slot numbers, head first. */
export const ARMOR_SLOTS: readonly SlotPlace[] = [
    { slot: 103, label: "Head", area: "armor" },
    { slot: 102, label: "Chest", area: "armor" },
    { slot: 101, label: "Legs", area: "armor" },
    { slot: 100, label: "Feet", area: "armor" },
    { slot: -106, label: "Off hand", area: "armor" },
];

/** The same places in the 1.21.5+ `equipment` compound. */
export const EQUIPMENT_KEYS: Readonly<Record<number, string>> = {
    103: "head",
    102: "chest",
    101: "legs",
    100: "feet",
    [-106]: "offhand",
};

/** The SNBT for a new stack in a slot, in the file's own layout. */
export function newItemSnbt(
    slot: number | null,
    id: string,
    count: number,
    dataVersion: number | null,
): string {
    const modern = dataVersion === null || dataVersion >= ITEM_COMPONENTS_DATA_VERSION;
    const countPart = modern
        ? `count:${Math.max(1, Math.min(99, count))}`
        : `Count:${Math.max(1, Math.min(64, count))}b`;
    const slotPart = slot === null ? "" : `Slot:${slot}b,`;
    return `{${slotPart}id:"${id.replace(/["\\]/g, "")}",${countPart}}`;
}

/** A short code for a slot's icon: the item's own first letters, so a stack is never blank. */
export function itemMonogram(id: string): string {
    const name = id.replace(/^[a-z0-9_.-]+:/, "");
    const parts = name.split("_").filter((p) => p.length > 0);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
    return ((parts[0] ?? "?")[0]! + (parts[parts.length - 1] ?? "?")[0]!).toUpperCase();
}

/** A stable hue for an item id, so the same item looks the same in every slot. */
export function itemHue(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return h;
}
