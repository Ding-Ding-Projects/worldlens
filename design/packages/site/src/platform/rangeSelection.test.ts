import { describe, expect, it, vi } from "vitest";

import {
    createRangeSelection,
    describeSelectionKey,
    type RangeSelection,
} from "./rangeSelection.js";

/**
 * A five-row list standing in for whatever the surface actually shows. Every test
 * that needs a filter simply passes a shorter array, because that is exactly what a
 * filtered surface does - the model is never told a filter exists, only what is on
 * screen right now.
 */
const ALL = ["a", "b", "c", "d", "e"] as const;

function selectionOf(): RangeSelection<string> {
    return createRangeSelection<string>();
}

/** Selection read back in display order, which is what an assertion can compare against. */
function shown(selection: RangeSelection<string>, order: readonly string[] = ALL): string[] {
    return [...selection.selectedIn(order)];
}

describe("pointer activation", () => {
    it("selects a single row and puts the anchor on it", () => {
        const selection = selectionOf();
        selection.activate({ id: "c", order: ALL });
        expect(shown(selection)).toEqual(["c"]);
        expect(selection.anchor).toBe("c");
        expect(selection.lead).toBe("c");
    });

    it("replaces the selection on a second plain activation", () => {
        const selection = selectionOf();
        selection.activate({ id: "c", order: ALL });
        selection.activate({ id: "e", order: ALL });
        expect(shown(selection)).toEqual(["e"]);
        expect(selection.anchor).toBe("e");
    });

    it("selects the inclusive range forwards from the anchor", () => {
        const selection = selectionOf();
        selection.activate({ id: "b", order: ALL });
        selection.activate({ id: "d", order: ALL, shiftKey: true });
        expect(shown(selection)).toEqual(["b", "c", "d"]);
    });

    it("selects the inclusive range backwards from the anchor", () => {
        const selection = selectionOf();
        selection.activate({ id: "d", order: ALL });
        selection.activate({ id: "b", order: ALL, shiftKey: true });
        expect(shown(selection)).toEqual(["b", "c", "d"]);
    });

    it("leaves the anchor where it was after a shift activation", () => {
        const selection = selectionOf();
        selection.activate({ id: "b", order: ALL });
        selection.activate({ id: "e", order: ALL, shiftKey: true });
        expect(selection.anchor).toBe("b");
        expect(selection.lead).toBe("e");
    });

    it("re-ranges from the same anchor instead of accumulating", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        selection.activate({ id: "d", order: ALL, shiftKey: true });
        expect(shown(selection)).toEqual(["a", "b", "c", "d"]);
        // The correction a visitor makes after overshooting: the range must shrink,
        // not grow by a second copy of itself.
        selection.activate({ id: "b", order: ALL, shiftKey: true });
        expect(shown(selection)).toEqual(["a", "b"]);
    });

    it("re-ranges across the anchor without keeping the old side", () => {
        const selection = selectionOf();
        selection.activate({ id: "c", order: ALL });
        selection.activate({ id: "e", order: ALL, shiftKey: true });
        selection.activate({ id: "a", order: ALL, shiftKey: true });
        expect(shown(selection)).toEqual(["a", "b", "c"]);
    });

    it("toggles one row and moves the anchor onto it", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        selection.activate({ id: "d", order: ALL, ctrlKey: true });
        expect(shown(selection)).toEqual(["a", "d"]);
        expect(selection.anchor).toBe("d");
        // The moved anchor is what the next shift range measures from.
        selection.activate({ id: "e", order: ALL, shiftKey: true });
        expect(shown(selection)).toEqual(["d", "e"]);
    });

    it("toggles a selected row back off", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        selection.activate({ id: "b", order: ALL, ctrlKey: true });
        selection.activate({ id: "b", order: ALL, ctrlKey: true });
        expect(shown(selection)).toEqual(["a"]);
        expect(selection.anchor).toBe("b");
    });

    it("treats the meta key as the toggle modifier too", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        selection.activate({ id: "c", order: ALL, metaKey: true });
        expect(shown(selection)).toEqual(["a", "c"]);
    });

    it("adds a range to the existing selection when shift is held with the accelerator", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        selection.activate({ id: "c", order: ALL, ctrlKey: true });
        selection.activate({ id: "e", order: ALL, shiftKey: true, ctrlKey: true });
        expect(shown(selection)).toEqual(["a", "c", "d", "e"]);
        // Shrinking an additive range must be symmetric with growing it: the rows it
        // no longer covers go, the rows selected before the run began stay.
        selection.activate({ id: "d", order: ALL, shiftKey: true, ctrlKey: true });
        expect(shown(selection)).toEqual(["a", "c", "d"]);
    });
});

describe("a fresh order on every activation", () => {
    it("ranges over the order the list is showing now, not the one it showed before", () => {
        const selection = selectionOf();
        selection.activate({ id: "b", order: ALL });
        const reordered = ["c", "b", "a", "d", "e"] as const;
        selection.activate({ id: "d", order: reordered, shiftKey: true });
        expect(shown(selection, reordered)).toEqual(["b", "a", "d"]);
    });

    it("ranges only over the rows the filter is showing", () => {
        const selection = selectionOf();
        const filtered = ["a", "c", "e"] as const;
        selection.activate({ id: "a", order: filtered });
        selection.activate({ id: "e", order: filtered, shiftKey: true });
        // `b` and `d` are hidden, so a range across them must not pick them up.
        expect(shown(selection)).toEqual(["a", "c", "e"]);
    });
});

describe("an anchor that is no longer there", () => {
    it("degrades a shift activation to a plain one and re-establishes the anchor", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        const filtered = ["c", "d", "e"] as const;
        selection.activate({ id: "e", order: filtered, shiftKey: true });
        expect(shown(selection)).toEqual(["e"]);
        expect(selection.anchor).toBe("e");
        // And the very next shift activation works normally from the new anchor.
        selection.activate({ id: "c", order: filtered, shiftKey: true });
        expect(shown(selection)).toEqual(["c", "d", "e"]);
    });

    it("degrades a shift activation made before any anchor exists", () => {
        const selection = selectionOf();
        selection.activate({ id: "d", order: ALL, shiftKey: true });
        expect(shown(selection)).toEqual(["d"]);
        expect(selection.anchor).toBe("d");
    });

    it("degrades rather than throwing when the activated row is not in the order", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        expect(() => selection.activate({ id: "z", order: ALL, shiftKey: true })).not.toThrow();
        expect(selection.selected()).toEqual(["z"]);
    });
});

describe("describeSelectionKey", () => {
    it("reads the extend keys", () => {
        expect(describeSelectionKey({ key: "ArrowDown", shiftKey: true })).toEqual({
            kind: "extend",
            edge: "next",
            additive: false,
        });
        expect(describeSelectionKey({ key: "ArrowUp", shiftKey: true })).toEqual({
            kind: "extend",
            edge: "previous",
            additive: false,
        });
        expect(describeSelectionKey({ key: "Home", shiftKey: true })).toEqual({
            kind: "extend",
            edge: "first",
            additive: false,
        });
        expect(describeSelectionKey({ key: "End", shiftKey: true })).toEqual({
            kind: "extend",
            edge: "last",
            additive: false,
        });
        expect(describeSelectionKey({ key: "ArrowDown", shiftKey: true, ctrlKey: true })).toEqual({
            kind: "extend",
            edge: "next",
            additive: true,
        });
    });

    it("reads toggle and select-all, and ignores everything else", () => {
        expect(describeSelectionKey({ key: " " })).toEqual({ kind: "toggle" });
        expect(describeSelectionKey({ key: "Enter" })).toEqual({ kind: "toggle" });
        expect(describeSelectionKey({ key: "a", ctrlKey: true })).toEqual({
            kind: "selectAllShown",
        });
        expect(describeSelectionKey({ key: "A", metaKey: true })).toEqual({
            kind: "selectAllShown",
        });
        expect(describeSelectionKey({ key: "a" })).toBeNull();
        expect(describeSelectionKey({ key: "ArrowDown" })).toBeNull();
        expect(describeSelectionKey({ key: "Home" })).toBeNull();
        expect(describeSelectionKey({ key: " ", shiftKey: true })).toBeNull();
        expect(describeSelectionKey({ key: "Escape" })).toBeNull();
    });

    it("does not read any state, so the same event answers the same twice", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        const event = { key: "ArrowDown", shiftKey: true } as const;
        expect(describeSelectionKey(event)).toEqual(describeSelectionKey(event));
        expect(shown(selection)).toEqual(["a"]);
    });
});

describe("keyboard equivalence", () => {
    it("extends by one from the anchor on Shift+Arrow", () => {
        const selection = selectionOf();
        selection.activate({ id: "b", order: ALL });
        const first = selection.handleKey({ key: "ArrowDown", shiftKey: true }, { order: ALL });
        expect(first?.focused).toBe("c");
        expect(shown(selection)).toEqual(["b", "c"]);
        selection.handleKey({ key: "ArrowDown", shiftKey: true }, { order: ALL });
        expect(shown(selection)).toEqual(["b", "c", "d"]);
        // Still measured from `b`, so coming back up shrinks rather than compounds.
        selection.handleKey({ key: "ArrowUp", shiftKey: true }, { order: ALL });
        expect(shown(selection)).toEqual(["b", "c"]);
        expect(selection.anchor).toBe("b");
    });

    it("enters the list from the near end when nothing is focused yet", () => {
        const down = selectionOf();
        down.handleKey({ key: "ArrowDown", shiftKey: true }, { order: ALL });
        expect(shown(down)).toEqual(["a"]);

        const up = selectionOf();
        up.handleKey({ key: "ArrowUp", shiftKey: true }, { order: ALL });
        expect(shown(up)).toEqual(["e"]);
    });

    it("clamps at both ends instead of wrapping", () => {
        const selection = selectionOf();
        selection.activate({ id: "e", order: ALL });
        const outcome = selection.handleKey({ key: "ArrowDown", shiftKey: true }, { order: ALL });
        expect(outcome?.focused).toBe("e");
        expect(shown(selection)).toEqual(["e"]);
        expect(outcome?.changed).toBe(false);
    });

    it("extends to the ends on Shift+Home and Shift+End", () => {
        const selection = selectionOf();
        selection.activate({ id: "c", order: ALL });
        selection.handleKey({ key: "Home", shiftKey: true }, { order: ALL });
        expect(shown(selection)).toEqual(["a", "b", "c"]);
        selection.handleKey({ key: "End", shiftKey: true }, { order: ALL });
        expect(shown(selection)).toEqual(["c", "d", "e"]);
        expect(selection.anchor).toBe("c");
    });

    it("toggles the focused row on Space and on Enter", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        selection.handleKey({ key: " " }, { order: ALL, focused: "c" });
        expect(shown(selection)).toEqual(["a", "c"]);
        selection.handleKey({ key: "Enter" }, { order: ALL, focused: "c" });
        expect(shown(selection)).toEqual(["a"]);
        // A keyboard toggle moves the anchor exactly as a Ctrl+click does.
        expect(selection.anchor).toBe("c");
    });

    it("selects everything currently shown on Ctrl+A, and nothing that is hidden", () => {
        const selection = selectionOf();
        const filtered = ["b", "d"] as const;
        selection.handleKey({ key: "a", ctrlKey: true }, { order: filtered });
        expect(shown(selection)).toEqual(["b", "d"]);
        expect(selection.size).toBe(2);
    });

    it("reports null for a key it does not own, so the caller can leave it alone", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        expect(selection.handleKey({ key: "Escape" }, { order: ALL })).toBeNull();
        expect(selection.handleKey({ key: "ArrowDown" }, { order: ALL })).toBeNull();
        expect(shown(selection)).toEqual(["a"]);
    });

    it("shares one anchor between the pointer and the keyboard", () => {
        const selection = selectionOf();
        // Pointer sets the anchor, keyboard extends from it, pointer re-ranges from
        // the same one. Two anchors would show up here as a range measured twice.
        selection.activate({ id: "b", order: ALL });
        selection.handleKey({ key: "ArrowDown", shiftKey: true }, { order: ALL });
        selection.activate({ id: "e", order: ALL, shiftKey: true });
        expect(shown(selection)).toEqual(["b", "c", "d", "e"]);
        expect(selection.anchor).toBe("b");
    });

    it("takes the caller's focus over its own lead when it is given one", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        // The caller moved roving focus to `d` with a plain arrow key of its own.
        selection.handleKey({ key: "ArrowDown", shiftKey: true }, { order: ALL, focused: "d" });
        expect(shown(selection)).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("adds a keyboard range to the existing selection on Ctrl+Shift+Arrow", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        selection.activate({ id: "c", order: ALL, ctrlKey: true });
        selection.handleKey({ key: "ArrowDown", shiftKey: true, ctrlKey: true }, { order: ALL });
        expect(shown(selection)).toEqual(["a", "c", "d"]);
    });
});

describe("select-all scopes", () => {
    it("selects a different set for shown than for existing while a filter is active", () => {
        const filtered = ["a", "b"] as const;

        const scoped = selectionOf();
        scoped.selectAll({ scope: "shown", shown: filtered });
        expect(scoped.selected()).toEqual(["a", "b"]);

        const everything = selectionOf();
        everything.selectAll({ scope: "existing", existing: ALL });
        expect(everything.selected()).toEqual(["a", "b", "c", "d", "e"]);

        expect(scoped.size).not.toBe(everything.size);
    });

    it("keeps rows the filter is hiding when selecting all shown", () => {
        const selection = selectionOf();
        selection.selectAll({ scope: "existing", existing: ALL });
        selection.selectAll({ scope: "shown", shown: ["a"] });
        // Select-all adds; it is not a "replace the selection with these" button.
        expect(selection.size).toBe(5);
    });

    it("leaves the anchor alone", () => {
        const selection = selectionOf();
        selection.activate({ id: "c", order: ALL });
        selection.selectAll({ scope: "shown", shown: ALL });
        expect(selection.anchor).toBe("c");
        selection.activate({ id: "d", order: ALL, shiftKey: true });
        expect(shown(selection)).toEqual(["c", "d"]);
    });
});

describe("invert", () => {
    it("flips the shown rows only", () => {
        const selection = selectionOf();
        selection.selectAll({ scope: "shown", shown: ["a", "c"] });
        selection.invert(["a", "b", "c"]);
        expect(shown(selection)).toEqual(["b"]);
    });

    it("never touches a selected row the filter is hiding", () => {
        const selection = selectionOf();
        selection.selectAll({ scope: "shown", shown: ["a", "e"] });
        selection.invert(["a", "b"]);
        // `e` was selected and is not shown, so it is neither dropped nor counted in.
        expect(shown(selection)).toEqual(["b", "e"]);
    });
});

describe("counts", () => {
    it("splits selected from selected-and-shown", () => {
        const selection = selectionOf();
        selection.selectAll({ scope: "existing", existing: ALL });
        expect(selection.counts(["a", "b"])).toEqual({
            selected: 5,
            selectedShown: 2,
            shown: 2,
            hiddenSelected: 3,
        });
    });

    it("reports zero hidden when the filter shows everything selected", () => {
        const selection = selectionOf();
        selection.activate({ id: "b", order: ALL });
        expect(selection.counts(ALL)).toEqual({
            selected: 1,
            selectedShown: 1,
            shown: 5,
            hiddenSelected: 0,
        });
    });

    it("counts an empty selection against an empty list", () => {
        expect(selectionOf().counts([])).toEqual({
            selected: 0,
            selectedShown: 0,
            shown: 0,
            hiddenSelected: 0,
        });
    });
});

describe("degenerate lists", () => {
    it("does nothing on an empty list rather than throwing", () => {
        const selection = selectionOf();
        expect(selection.handleKey({ key: "ArrowDown", shiftKey: true }, { order: [] })).toEqual({
            intent: { kind: "extend", edge: "next", additive: false },
            focused: null,
            changed: false,
        });
        expect(selection.handleKey({ key: " " }, { order: [] })?.changed).toBe(false);
        selection.selectAll({ scope: "shown", shown: [] });
        selection.invert([]);
        expect(selection.size).toBe(0);
        expect(selection.anchor).toBeNull();
    });

    it("handles a single-row list from both the pointer and the keyboard", () => {
        const one = ["only"] as const;
        const selection = selectionOf();
        selection.activate({ id: "only", order: one });
        expect(selection.selected()).toEqual(["only"]);
        selection.activate({ id: "only", order: one, shiftKey: true });
        expect(selection.selected()).toEqual(["only"]);
        selection.handleKey({ key: "ArrowDown", shiftKey: true }, { order: one });
        expect(selection.selected()).toEqual(["only"]);
        selection.handleKey({ key: "Home", shiftKey: true }, { order: one });
        expect(selection.selected()).toEqual(["only"]);
        selection.handleKey({ key: " " }, { order: one });
        expect(selection.selected()).toEqual([]);
    });
});

describe("housekeeping", () => {
    it("clears the selection and the anchor together", () => {
        const selection = selectionOf();
        selection.activate({ id: "b", order: ALL });
        selection.activate({ id: "d", order: ALL, shiftKey: true });
        selection.clear();
        expect(selection.selected()).toEqual([]);
        expect(selection.anchor).toBeNull();
        expect(selection.lead).toBeNull();
    });

    it("drops ids that no longer exist and forgets an anchor that went with them", () => {
        const selection = selectionOf();
        selection.activate({ id: "b", order: ALL });
        selection.activate({ id: "d", order: ALL, shiftKey: true });
        selection.retain(["a", "d", "e"]);
        expect(shown(selection)).toEqual(["d"]);
        expect(selection.anchor).toBeNull();
        // With no anchor left, the next shift activation degrades to a plain one.
        selection.activate({ id: "e", order: ALL, shiftKey: true });
        expect(shown(selection)).toEqual(["e"]);
    });

    it("keeps an anchor that survived the retain", () => {
        const selection = selectionOf();
        selection.activate({ id: "b", order: ALL });
        selection.retain(["b", "c"]);
        expect(selection.anchor).toBe("b");
    });

    it("returns the selection in display order for an export", () => {
        const selection = selectionOf();
        selection.activate({ id: "e", order: ALL });
        selection.activate({ id: "a", order: ALL, ctrlKey: true });
        expect(selection.selected()).toEqual(["e", "a"]);
        expect(selection.selectedIn(ALL)).toEqual(["a", "e"]);
    });

    it("notifies subscribers on a real change and not on a no-op", () => {
        const selection = selectionOf();
        const listener = vi.fn();
        const unsubscribe = selection.subscribe(listener);

        selection.activate({ id: "b", order: ALL });
        expect(listener).toHaveBeenCalledTimes(1);

        // The same plain activation again: same set, same anchor, nothing to tell anyone.
        selection.activate({ id: "b", order: ALL });
        expect(listener).toHaveBeenCalledTimes(1);

        selection.activate({ id: "d", order: ALL, shiftKey: true });
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        selection.clear();
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("reports whether a key press changed anything", () => {
        const selection = selectionOf();
        selection.activate({ id: "a", order: ALL });
        expect(
            selection.handleKey({ key: "ArrowDown", shiftKey: true }, { order: ALL })?.changed,
        ).toBe(true);
        expect(
            selection.handleKey({ key: "a", ctrlKey: true }, { order: ["a", "b"] })?.changed,
        ).toBe(false);
    });
});
