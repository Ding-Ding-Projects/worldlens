import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import {
    STRUCTURE_STORAGE_KEY,
    reloadStructureStore,
    setDiscoveredStructures,
    setStructurePersistence,
    structureStore,
} from "./structureStore.js";

import {
    deriveStructureId,
    deriveStructureName,
    groupByNamespace,
    renderedStructureSearchText,
    structureSearchText,
    type RenderedStructure,
    type StructureFile,
} from "./structureModel.js";

function file(overrides: Partial<StructureFile> = {}): StructureFile {
    return {
        id: "minecraft:nether_bridge_gate",
        name: "nether bridge gate",
        namespace: "minecraft",
        path: "world/generated/minecraft/structures/nether_bridge_gate.nbt",
        sizeBytes: 1024,
        ...overrides,
    };
}

describe("deriveStructureName", () => {
    it("strips the .nbt extension", () => {
        expect(deriveStructureName("nether_bridge_gate.nbt")).toBe("nether bridge gate");
    });

    it("replaces underscores with spaces", () => {
        expect(deriveStructureName("boss_arena_v2.nbt")).toBe("boss arena v2");
    });

    it("leaves a filename with no extension alone, apart from underscores", () => {
        expect(deriveStructureName("boss_arena")).toBe("boss arena");
    });

    it("trims incidental whitespace left behind by the replacement", () => {
        expect(deriveStructureName("_gate_.nbt")).toBe("gate");
    });
});

describe("deriveStructureId", () => {
    it("combines the namespace and the raw filename, extension stripped", () => {
        expect(deriveStructureId("minecraft", "nether_bridge_gate.nbt")).toBe(
            "minecraft:nether_bridge_gate",
        );
    });

    it("keeps two structures with the same display name apart if their filenames differ", () => {
        const a = deriveStructureId("minecraft", "Gate.nbt");
        const b = deriveStructureId("minecraft", "gate.nbt");
        expect(a).not.toBe(b);
    });

    it("gives structures in different namespaces different ids even with the same filename", () => {
        const a = deriveStructureId("minecraft", "gate.nbt");
        const b = deriveStructureId("mymodpack", "gate.nbt");
        expect(a).not.toBe(b);
    });
});

describe("groupByNamespace", () => {
    it("groups files under their namespace", () => {
        const files = [
            file({ id: "a", namespace: "minecraft", name: "village plains" }),
            file({ id: "b", namespace: "mymodpack", name: "boss arena" }),
            file({ id: "c", namespace: "minecraft", name: "desert temple" }),
        ];
        const groups = groupByNamespace(files);
        expect(groups.map((g) => g.namespace)).toEqual(["minecraft", "mymodpack"]);
        expect(groups[0]?.files.map((f) => f.id)).toEqual(["c", "a"]);
        expect(groups[1]?.files.map((f) => f.id)).toEqual(["b"]);
    });

    it("alphabetises namespaces and, within a namespace, files by name", () => {
        const files = [
            file({ id: "z", namespace: "zzz", name: "z structure" }),
            file({ id: "a", namespace: "aaa", name: "a structure" }),
        ];
        const groups = groupByNamespace(files);
        expect(groups.map((g) => g.namespace)).toEqual(["aaa", "zzz"]);
    });

    it("returns nothing for an empty list", () => {
        expect(groupByNamespace([])).toEqual([]);
    });
});

describe("structureSearchText", () => {
    it("covers the name, the namespace and the path", () => {
        const text = structureSearchText(file());
        expect(text).toContain("nether bridge gate");
        expect(text).toContain("minecraft");
        expect(text).toContain("world/generated/minecraft/structures/nether_bridge_gate.nbt");
    });
});

describe("renderedStructureSearchText", () => {
    it("covers the name and the data root", () => {
        const rendered: RenderedStructure = {
            id: "r1",
            structureId: "minecraft:gate",
            name: "gate",
            dataRoot: "renders/gate",
            renderedAt: "2026-01-01T00:00:00.000Z",
        };
        const text = renderedStructureSearchText(rendered);
        expect(text).toContain("gate");
        expect(text).toContain("renders/gate");
    });
});

/* -------------------------------------------------------------------------- */
/* The guard nothing was proving                                              */
/* -------------------------------------------------------------------------- */

describe("an unreadable store is never written over", () => {
    /**
     * Found by breaking it rather than by reading it.
     *
     * The store already refused to persist while `failure` was set, with a comment
     * explaining exactly why - and deleting that condition kept every test green. A guard
     * nobody has watched fail proves nothing, and this one guards the difference between
     * "I could not parse your structures" and "your structures are gone", which is the same
     * failure one step further along and no longer recoverable.
     */
    it("keeps the unparseable bytes on disk instead of replacing them with an empty list", async () => {
        const written: string[] = [];
        const store = new Map<string, string>([[STRUCTURE_STORAGE_KEY, "{not json"]]);
        vi.stubGlobal("localStorage", {
            get length() {
                return store.size;
            },
            clear: () => store.clear(),
            getItem: (key: string) => store.get(key) ?? null,
            key: (index: number) => [...store.keys()][index] ?? null,
            removeItem: (key: string) => void store.delete(key),
            setItem: (key: string, value: string) => {
                written.push(value);
                store.set(key, value);
            },
        } as Storage);

        reloadStructureStore();
        expect(structureStore.failure).not.toBeNull();

        // Persistence is on, and the state is now mutated. A store that wrote here would
        // replace the bytes it could not read with an empty list.
        setStructurePersistence(true);
        setDiscoveredStructures([
            { id: "minecraft:hut", name: "Hut", namespace: "minecraft", path: "/w/hut.nbt", sizeBytes: 12 },
        ]);
        await nextTick();

        expect(written).toEqual([]);
        expect(store.get(STRUCTURE_STORAGE_KEY)).toBe("{not json");

        setStructurePersistence(false);
        vi.unstubAllGlobals();
    });
});
