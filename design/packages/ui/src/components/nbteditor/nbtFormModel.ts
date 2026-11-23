/**
 * The form view's layout: which fields go in which section, and how a search narrows them.
 *
 * A world settings file is a flat compound of a few dozen values (or, from 26.1, several small
 * files: `level.dat`, `game_rules.dat`, `weather.dat`, `world_clocks.dat`). Shown as a tree it is
 * a list of keys; shown as a form it is the World settings page from the design
 * (`design/design-sources/nbt-editor-full/LevelDat.dc.html`): named sections, a control per value.
 * This module decides the sections; `NbtFormView.vue` draws them with `NbtValueEditor`.
 *
 * Pure, so the grouping and the filter are unit tests.
 */
import type { NodeView } from "./nbtEditorBridge.js";
import { fieldInfo, normalizeKey, readableValue, type FieldInfo } from "./nbtFieldCatalogue.js";

export interface FormField {
    readonly node: NodeView;
    readonly path: readonly string[];
    readonly info: FieldInfo;
}

export interface FormSection {
    readonly id: string;
    readonly title: string;
    readonly fields: readonly FormField[];
    /** Members that are lists, arrays or deeper groups: edited in the tree, counted here. */
    readonly elsewhere: number;
}

const SECTION_OF: Readonly<Record<string, string>> = {
    levelname: "world",
    gametype: "world",
    difficulty: "world",
    difficultylocked: "world",
    locked: "world",
    hardcore: "world",
    allowcommands: "world",
    initialized: "world",
    wasmodded: "world",
    dataversion: "about",
    version: "about",
    lastplayed: "about",
    sizeondisk: "about",
    serverbrands: "about",
    spawnx: "spawn",
    spawny: "spawn",
    spawnz: "spawn",
    spawnangle: "spawn",
    daytime: "time",
    time: "time",
    raining: "time",
    thundering: "time",
    raintime: "time",
    thundertime: "time",
    clearweathertime: "time",
    wanderingtraderspawnchance: "time",
    wanderingtraderspawndelay: "time",
};

const SECTION_TITLES: Readonly<Record<string, string>> = {
    world: "World",
    spawn: "Spawn",
    time: "Time and weather",
    border: "World border",
    other: "Other values",
    about: "About this file",
};

const ORDER = ["world", "spawn", "time", "border", "other", "about"];

function sectionFor(name: string): string {
    const key = normalizeKey(name);
    if (key.startsWith("border")) return "border";
    return SECTION_OF[key] ?? "other";
}

function isScalar(node: NodeView): boolean {
    return !["compound", "list", "byteArray", "intArray", "longArray"].includes(node.kind);
}

/**
 * Sections for a base compound's members, plus one section per child compound (game rules,
 * `difficulty_settings`, `Version`, ...), each holding that compound's own values.
 */
export function buildSections(
    base: readonly NodeView[],
    basePath: readonly string[],
    groups: readonly { readonly node: NodeView; readonly children: readonly NodeView[] }[],
): FormSection[] {
    const buckets = new Map<string, FormField[]>();
    let elsewhere = 0;
    for (const node of base) {
        if (!isScalar(node)) {
            if (node.kind !== "compound") elsewhere += 1;
            continue;
        }
        const id = sectionFor(node.name ?? "");
        const list = buckets.get(id) ?? [];
        list.push({ node, path: basePath, info: fieldInfo(node, basePath) });
        buckets.set(id, list);
    }
    const sections: FormSection[] = ORDER.filter((id) => (buckets.get(id)?.length ?? 0) > 0).map(
        (id) => ({
            id,
            title: SECTION_TITLES[id] ?? id,
            fields: buckets.get(id) ?? [],
            elsewhere: id === "other" ? elsewhere : 0,
        }),
    );
    if (elsewhere > 0 && !sections.some((s) => s.id === "other")) {
        sections.push({
            id: "other",
            title: SECTION_TITLES["other"] ?? "Other values",
            fields: [],
            elsewhere,
        });
    }
    for (const group of groups) {
        const path = [...basePath, group.node.name ?? ""];
        const fields = group.children
            .filter(isScalar)
            .map((node) => ({ node, path, info: fieldInfo(node, path) }));
        const nested = group.children.length - fields.length;
        if (fields.length === 0 && nested === 0) continue;
        const name = group.node.name ?? "";
        sections.push({
            id: `group:${name}`,
            title: fieldInfo(group.node, basePath).label || name,
            fields,
            elsewhere: nested,
        });
    }
    // The file's own metadata reads best last, after every group.
    const about = sections.findIndex((s) => s.id === "about");
    if (about >= 0) sections.push(...sections.splice(about, 1));
    return sections;
}

/** Narrow sections by a plain or regex query over label, game key and readable value. */
export function filterSections(
    sections: readonly FormSection[],
    match: ((text: string) => boolean) | null,
): FormSection[] {
    if (match === null) return [...sections];
    return sections
        .map((s) => ({
            ...s,
            fields: s.fields.filter(
                (f) =>
                    match(f.info.label) ||
                    match(f.node.name ?? "") ||
                    match(readableValue(f.node, f.info)),
            ),
            elsewhere: 0,
        }))
        .filter((s) => s.fields.length > 0 || match(s.title));
}

/** The compound the form starts from: `Data` in a classic `level.dat`, otherwise the root. */
export function pickBase(rootChildren: readonly NodeView[]): NodeView | null {
    return rootChildren.find((child) => child.kind === "compound" && child.name === "Data") ?? null;
}
