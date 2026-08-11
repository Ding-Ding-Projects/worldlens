/**
 * The remembered collapse of the project editor's structure column.
 *
 * Two things are worth asserting and one of them is easy to get wrong: that "not stored" and
 * "stored as anything other than true" both mean showing, because the safe direction here is
 * the tree being visible - a collapsed column nobody asked for reads as a missing feature
 * rather than as a preference.
 */

import { describe, expect, it } from "vitest";
import {
    NAVIGATOR_COLLAPSE_KEY,
    readNavigatorCollapsed,
    writeNavigatorCollapsed,
} from "./navigatorCollapse.js";

/** A store that behaves like `localStorage` for the two methods this module uses. */
function memoryStore(seed: Record<string, string> = {}): Storage {
    const map = new Map(Object.entries(seed));
    return {
        get length() {
            return map.size;
        },
        clear: () => map.clear(),
        getItem: (key: string) => map.get(key) ?? null,
        key: (index: number) => [...map.keys()][index] ?? null,
        removeItem: (key: string) => void map.delete(key),
        setItem: (key: string, value: string) => void map.set(key, value),
    } as Storage;
}

/** A store that throws on every access, as a partitioned or locked-down one does. */
function hostileStore(): Storage {
    const boom = (): never => {
        throw new Error("storage is not available here");
    };
    return {
        get length(): number {
            return boom();
        },
        clear: boom,
        getItem: boom,
        key: boom,
        removeItem: boom,
        setItem: boom,
    } as unknown as Storage;
}

describe("the project editor's remembered structure column", () => {
    it("shows the tree when nothing has been stored", () => {
        expect(readNavigatorCollapsed(memoryStore())).toBe(false);
    });

    it("round-trips a collapse and an expand", () => {
        const store = memoryStore();
        writeNavigatorCollapsed(true, store);
        expect(store.getItem(NAVIGATOR_COLLAPSE_KEY)).toBe("true");
        expect(readNavigatorCollapsed(store)).toBe(true);

        writeNavigatorCollapsed(false, store);
        expect(store.getItem(NAVIGATOR_COLLAPSE_KEY)).toBe("false");
        expect(readNavigatorCollapsed(store)).toBe(false);
    });

    it("treats any other stored value as showing rather than as collapsed", () => {
        for (const value of ["", "1", "yes", "TRUE", "collapsed", "null"]) {
            expect(readNavigatorCollapsed(memoryStore({ [NAVIGATOR_COLLAPSE_KEY]: value }))).toBe(
                false,
            );
        }
    });

    it("keeps nothing when the store is null, and still answers", () => {
        writeNavigatorCollapsed(true, null);
        expect(readNavigatorCollapsed(null)).toBe(false);
    });

    it("survives a store that throws on every access", () => {
        const store = hostileStore();
        expect(() => writeNavigatorCollapsed(true, store)).not.toThrow();
        expect(readNavigatorCollapsed(store)).toBe(false);
    });
});
