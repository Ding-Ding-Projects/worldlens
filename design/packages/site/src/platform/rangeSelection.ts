/**
 * Multi-select for any ordered list, table or grid.
 *
 * Every collection on this site is supposed to support bulk actions, and a bulk
 * action is only as good as the selection that feeds it. Per-row checkboxes alone
 * mean forty clicks to act on forty rows, which is the interface failing to do its
 * job rather than the visitor being slow. This module is the shared answer: an
 * anchor, a selected set, and the range arithmetic that turns one plain click plus
 * one shift click into a forty-row selection.
 *
 * It is deliberately a pure model. There is no `document`, no `window`, and no
 * event listener anywhere in this file, so it can be tested exhaustively without a
 * DOM and cannot quietly grow an assumption about how the caller renders a row. The
 * caller owns the checkbox, the focus ring and the ARIA state; this owns *which
 * rows are chosen*, and the two halves meet at `activate` and `handleKey`.
 *
 * There are no user-facing strings here either. A count is a number and a scope is
 * a discriminant; the words a visitor reads about them belong to the surface that
 * renders them, in whichever language mode is active.
 *
 * `TId` must be something a `Set` compares usefully - a string, a number, or a
 * stable object reference held for as long as the row exists. `null` is reserved by
 * this module to mean "no anchor", so it must never be used as an id.
 */

/**
 * The list the model ranges over, supplied fresh on every call.
 *
 * Nothing here caches the order, because the order is not this module's to know:
 * the caller's filter, sort or search query can change between two clicks, and a
 * range computed against a remembered list would select rows that are no longer
 * where the visitor saw them. Passing the order in each time makes that impossible
 * by construction rather than by remembering to invalidate a cache.
 */
export interface RangeSelectionActivation<TId> {
    /** The row the visitor actually acted on. */
    readonly id: TId;
    /** Every row currently shown, in the order the list is currently showing them. */
    readonly order: readonly TId[];
    readonly shiftKey?: boolean;
    readonly ctrlKey?: boolean;
    readonly metaKey?: boolean;
}

/**
 * A key press reduced to the four fields this model reads.
 *
 * Shaped so a real `KeyboardEvent` satisfies it structurally and can be handed
 * straight in, while the type itself names no DOM type at all - which is what keeps
 * the keyboard path testable in a plain Node environment and stops a DOM assumption
 * arriving through the back door of an event object.
 */
export interface SelectionKeyEvent {
    readonly key: string;
    readonly shiftKey?: boolean;
    readonly ctrlKey?: boolean;
    readonly metaKey?: boolean;
}

/**
 * What a key press means, decided without touching any state.
 *
 * Exposed separately from applying it so a caller can ask "would this key do
 * anything?" - to decide whether to call `preventDefault`, or to render the binding
 * in a help surface - without the question mutating the selection as a side effect.
 */
export type SelectionIntent =
    | {
          readonly kind: "extend";
          readonly edge: "previous" | "next" | "first" | "last";
          /** True when the range should be added to the existing selection rather than replace it. */
          readonly additive: boolean;
      }
    | { readonly kind: "toggle" }
    | { readonly kind: "selectAllShown" };

export interface SelectionKeyContext<TId> {
    /** Every row currently shown, in display order. */
    readonly order: readonly TId[];
    /**
     * The row that currently holds roving focus, when the caller is tracking it
     * separately from this model. Omitted or null means "use the model's own idea",
     * which is what makes a keyboard extend continue from wherever the last pointer
     * activation left off instead of restarting somewhere else.
     */
    readonly focused?: TId | null;
}

export interface SelectionKeyOutcome<TId> {
    readonly intent: SelectionIntent;
    /**
     * The row that should hold roving focus once the caller has re-rendered. The
     * model does not move focus - it cannot, it has no DOM - but it is the only
     * thing that knows which row a range just grew onto, so it reports it.
     */
    readonly focused: TId | null;
    /** True when the selected set or the anchor actually moved. */
    readonly changed: boolean;
}

/**
 * Which rows a select-all covers, stated by the caller rather than assumed here.
 *
 * A select-all is the one action in a selection model that can quietly betray a
 * visitor. "Select all" while a filter is active can mean the twelve rows on screen
 * or the four hundred rows behind the filter, and those two produce very different
 * consequences from the same word on the same button. Making the scope a
 * discriminated union means there is no default to fall into: a caller cannot reach
 * this function without having decided, in code that a reviewer can read, which set
 * it is asking for. The hidden rows must be handed over explicitly in the
 * `existing` case, so the model can never select something the caller did not
 * itself enumerate - and therefore can never select something the visitor cannot
 * see unless the surface deliberately said so.
 */
export type SelectAllScope<TId> =
    | { readonly scope: "shown"; readonly shown: readonly TId[] }
    | { readonly scope: "existing"; readonly existing: readonly TId[] };

/**
 * The two numbers a bulk-action preview needs, which are not the same number.
 *
 * A selection survives a filter change - the visitor chose those rows and a query
 * edit should not silently unchoose them - so "42 selected" and "42 rows on screen
 * are selected" routinely disagree. A preview that states only the first is lying
 * about what the button will touch, and a preview that states only the second is
 * lying about what will be deleted. Both are reported, plus the difference, so the
 * surface can say the honest thing in whatever wording it likes.
 */
export interface SelectionCounts {
    /** Everything selected, including rows the active filter is hiding. */
    readonly selected: number;
    /** Selected *and* currently shown - what a visitor can actually see ticked. */
    readonly selectedShown: number;
    /** How many rows the filter is showing at all. */
    readonly shown: number;
    /** Selected but hidden. Non-zero is exactly the case a preview must mention. */
    readonly hiddenSelected: number;
}

export interface RangeSelection<TId> {
    /**
     * Where a shift range measures from. Null before the first activation, and
     * after `clear`.
     */
    readonly anchor: TId | null;
    /** The far end of the current range - where the next keyboard extend grows from. */
    readonly lead: TId | null;
    readonly size: number;
    isSelected(id: TId): boolean;
    /** Selected ids in the order they were selected. */
    selected(): readonly TId[];
    /** Selected ids in the given display order, for an export that has to read sensibly. */
    selectedIn(order: readonly TId[]): readonly TId[];
    counts(shown: readonly TId[]): SelectionCounts;
    /** The pointer path: a click, with whatever modifiers were held. */
    activate(activation: RangeSelectionActivation<TId>): void;
    /** The keyboard path, driven by the same anchor as the pointer path. */
    handleKey(
        event: SelectionKeyEvent,
        context: SelectionKeyContext<TId>,
    ): SelectionKeyOutcome<TId> | null;
    selectAll(scope: SelectAllScope<TId>): void;
    /** Flip every currently shown row, leaving hidden selections exactly as they were. */
    invert(shown: readonly TId[]): void;
    clear(): void;
    /** Drop selected ids that no longer exist, after a delete or a reload. */
    retain(existing: readonly TId[]): void;
    subscribe(listener: () => void): () => void;
}

/**
 * Decide what a key press means. Pure: same input, same answer, no state read.
 *
 * Arrow keys map onto a single axis because that is what this model is - an ordered
 * sequence. A grid that wants Shift+Down to move a whole row rather than one cell
 * has genuinely different arithmetic and should compute its own target id and call
 * `activate` with `shiftKey` directly, rather than have this function pretend to
 * know a column count it was never told.
 *
 * Returning null means "not a selection key", which is the signal a caller needs to
 * decide whether to leave the browser's own handling alone.
 */
export function describeSelectionKey(event: SelectionKeyEvent): SelectionIntent | null {
    const shift = event.shiftKey === true;
    const accelerator = event.ctrlKey === true || event.metaKey === true;

    if (shift) {
        const edge = arrowEdge(event.key);
        if (edge !== null) return { kind: "extend", edge, additive: accelerator };
        if (event.key === "Home") return { kind: "extend", edge: "first", additive: accelerator };
        if (event.key === "End") return { kind: "extend", edge: "last", additive: accelerator };
        // Shift with anything else - Shift+Space in particular - is left unhandled
        // rather than guessed at. A binding this module invents is a binding nothing
        // documents and no surface teaches, which is worse than none.
        return null;
    }

    // Space and Enter toggle rather than replace, because the keyboard has no way to
    // express "click without modifiers versus click with Ctrl" on the row that
    // already has focus, and toggling is the half a keyboard visitor cannot otherwise
    // reach. Ctrl+Space is accepted as the same thing: it is what a visitor arriving
    // from a file manager will press, and refusing it would only be pedantry.
    if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
        return { kind: "toggle" };
    }

    if (accelerator && (event.key === "a" || event.key === "A")) {
        // Scoped to what is shown, always. Ctrl+A pressed inside a filtered list means
        // "all of these", and a visitor who wanted the four hundred rows behind the
        // filter has a button that says so.
        return { kind: "selectAllShown" };
    }

    // Home and End without Shift move focus and nothing else. Focus is the caller's
    // to move, so this returns null rather than helpfully collapsing the selection.
    return null;
}

export function createRangeSelection<TId>(): RangeSelection<TId> {
    const selected = new Set<TId>();
    const listeners = new Set<() => void>();

    /**
     * The row a shift range measures from, and the far end it currently reaches.
     *
     * The anchor is the whole trick. A shift activation must *not* move it: the
     * range is recomputed from the same fixed point every time, so shift-clicking
     * row 30 and then row 20 selects rows 20-30 rather than 20-30 plus the 20-30
     * that a moved anchor would have left behind. When the anchor follows the
     * pointer, a visitor correcting an overshoot finds the selection growing
     * instead of shrinking, has no way to shrink it, and reaches for the clear
     * button - which is exactly the "forty clicks" failure the feature exists to
     * remove. Every file manager and mail client has trained this expectation for
     * thirty years and it is not negotiable.
     */
    let anchor: TId | null = null;
    let lead: TId | null = null;

    /**
     * The selection as it stood when the anchor was set.
     *
     * An additive range (Ctrl+Shift) has to add its range to the selection that
     * existed *before* the range run began, not to the selection the previous
     * shift click produced - otherwise shrinking a range leaves the rows it used to
     * cover behind and the same compounding bug reappears through the additive
     * door. Recomputing from this fixed base each time makes shrink and grow
     * symmetric.
     */
    let anchorBase: ReadonlySet<TId> = new Set<TId>();

    function emit(): void {
        for (const listener of [...listeners]) listener();
    }

    /**
     * Replace the selected set, reporting whether anything a caller cares about moved.
     *
     * Compared rather than assumed: re-running a range that lands on the same rows
     * is a normal thing for a visitor to do with the pointer, and it should not
     * wake every subscriber and re-render the list.
     */
    function commit(next: ReadonlySet<TId>, cursorMoved: boolean): boolean {
        const same = next.size === selected.size && [...next].every((id) => selected.has(id));
        if (same && !cursorMoved) return false;
        selected.clear();
        for (const id of next) selected.add(id);
        emit();
        return true;
    }

    /** The inclusive slice of `order` between the anchor and `id`, or null when it cannot be drawn. */
    function rangeFrom(order: readonly TId[], id: TId): readonly TId[] | null {
        if (anchor === null) return null;
        const from = order.indexOf(anchor);
        const to = order.indexOf(id);
        if (from < 0 || to < 0) return null;
        return from <= to ? order.slice(from, to + 1) : order.slice(to, from + 1);
    }

    function activate(activation: RangeSelectionActivation<TId>): boolean {
        const { id, order } = activation;
        const shift = activation.shiftKey === true;
        const accelerator = activation.ctrlKey === true || activation.metaKey === true;

        if (shift) {
            const range = rangeFrom(order, id);
            if (range !== null) {
                const next = accelerator ? new Set(anchorBase) : new Set<TId>();
                for (const member of range) next.add(member);
                const leadMoved = lead !== id;
                lead = id;
                // The anchor is deliberately untouched here. See its declaration.
                return commit(next, leadMoved);
            }
            /*
             * The anchor has been filtered away, or removed, or was never set - the
             * three cases are indistinguishable from here and want the same answer.
             *
             * There is no honest range to draw: measuring from index 0 would select
             * rows the visitor never pointed at, and measuring from the activated row
             * to itself while pretending a range happened is a lie about what the
             * gesture did. Throwing would turn a filter edit into a crash. So the
             * shift is treated as the plain activation it effectively is: select the
             * one row, and put the anchor there, which re-establishes a valid anchor
             * so the visitor's very next shift click works normally. The gesture costs
             * one extra click and nothing is silently selected.
             */
        }

        if (!shift && accelerator) {
            const next = new Set(selected);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            // A toggle moves the anchor, because the row just touched is where the
            // visitor is; the next shift click should measure from there.
            const anchorMoved = anchor !== id || lead !== id;
            anchor = id;
            lead = id;
            anchorBase = new Set(next);
            return commit(next, anchorMoved);
        }

        const next = new Set<TId>([id]);
        const anchorMoved = anchor !== id || lead !== id;
        anchor = id;
        lead = id;
        anchorBase = new Set(next);
        return commit(next, anchorMoved);
    }

    function selectAll(scope: SelectAllScope<TId>): boolean {
        const ids = scope.scope === "shown" ? scope.shown : scope.existing;
        const next = new Set(selected);
        for (const id of ids) next.add(id);
        // Neither scope moves the anchor: a select-all is not a position, and a
        // visitor who selects everything and then shift-clicks expects the range to
        // measure from the row they last touched.
        return commit(next, false);
    }

    function invert(shown: readonly TId[]): boolean {
        const next = new Set(selected);
        for (const id of shown) {
            if (next.has(id)) next.delete(id);
            else next.add(id);
        }
        // Only the shown rows flip. Inverting the hidden ones would select rows the
        // visitor cannot see from a button that describes what is on screen, which is
        // the same dishonesty the select-all scope exists to prevent.
        return commit(next, false);
    }

    /** Where a keyboard extend should land, given whatever row currently has focus. */
    function edgeTarget(
        edge: "previous" | "next" | "first" | "last",
        order: readonly TId[],
        focused: TId | null,
    ): TId | null {
        if (order.length === 0) return null;
        if (edge === "first") return order[0] ?? null;
        if (edge === "last") return order[order.length - 1] ?? null;
        const index = focused === null ? -1 : order.indexOf(focused);
        if (index < 0) {
            // Focus is somewhere this list does not know about - it has not been set
            // yet, or the filter has hidden it. Entering from the top on a downward
            // press and from the bottom on an upward one is what a list does when
            // focus arrives from outside, and it never skips silently over rows.
            return edge === "next" ? (order[0] ?? null) : (order[order.length - 1] ?? null);
        }
        const step = edge === "next" ? 1 : -1;
        const clamped = Math.min(order.length - 1, Math.max(0, index + step));
        return order[clamped] ?? null;
    }

    return {
        get anchor() {
            return anchor;
        },
        get lead() {
            return lead;
        },
        get size() {
            return selected.size;
        },
        isSelected(id) {
            return selected.has(id);
        },
        selected() {
            return [...selected];
        },
        selectedIn(order) {
            return order.filter((id) => selected.has(id));
        },
        counts(shown) {
            const shownSet = new Set(shown);
            let selectedShown = 0;
            for (const id of selected) if (shownSet.has(id)) selectedShown += 1;
            return {
                selected: selected.size,
                selectedShown,
                shown: shown.length,
                hiddenSelected: selected.size - selectedShown,
            };
        },
        activate(activation) {
            activate(activation);
        },
        handleKey(event, context) {
            const intent = describeSelectionKey(event);
            if (intent === null) return null;
            const order = context.order;
            /*
             * Focus falls back through the model's own state before the list's first
             * row. The caller may be tracking roving focus itself, in which case its
             * answer wins; when it is not, the lead is the right answer, because the
             * lead is where the last activation - pointer or keyboard - left the
             * visitor. Reading the same lead for both paths is what stops the mouse
             * and the keyboard developing two different ideas of where the visitor is.
             *
             * When none of them has an answer it stays null rather than guessing at
             * the first row, so `edgeTarget` can apply its own entering-from-outside
             * rule and a first Shift+Down lands on the first row instead of skipping
             * it.
             */
            const focused = context.focused ?? lead ?? anchor ?? null;

            switch (intent.kind) {
                case "selectAllShown":
                    return {
                        intent,
                        focused,
                        changed: selectAll({ scope: "shown", shown: order }),
                    };
                case "toggle": {
                    if (focused === null) return { intent, focused: null, changed: false };
                    // Routed through the very same activation the pointer uses, with
                    // the modifier a Ctrl+click would have carried, so the two paths
                    // cannot drift apart as either one is edited later.
                    const changed = activate({ id: focused, order, ctrlKey: true });
                    return { intent, focused, changed };
                }
                case "extend": {
                    const target = edgeTarget(intent.edge, order, focused);
                    if (target === null) return { intent, focused, changed: false };
                    const changed = activate({
                        id: target,
                        order,
                        shiftKey: true,
                        ctrlKey: intent.additive,
                    });
                    return { intent, focused: target, changed };
                }
            }
        },
        selectAll(scope) {
            selectAll(scope);
        },
        invert(shown) {
            invert(shown);
        },
        clear() {
            const anchorMoved = anchor !== null || lead !== null;
            anchor = null;
            lead = null;
            anchorBase = new Set<TId>();
            commit(new Set<TId>(), anchorMoved);
        },
        retain(existing) {
            const keep = new Set(existing);
            const next = new Set([...selected].filter((id) => keep.has(id)));
            // An anchor pointing at a row that no longer exists is not an error - a
            // shift activation degrades gracefully when it cannot find it - but
            // clearing it here means the degrade never has to happen for a row the
            // caller has already told us is gone.
            const anchorMoved =
                (anchor !== null && !keep.has(anchor)) || (lead !== null && !keep.has(lead));
            if (anchor !== null && !keep.has(anchor)) anchor = null;
            if (lead !== null && !keep.has(lead)) lead = null;
            anchorBase = new Set([...anchorBase].filter((id) => keep.has(id)));
            commit(next, anchorMoved);
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

function arrowEdge(key: string): "previous" | "next" | null {
    if (key === "ArrowUp" || key === "ArrowLeft") return "previous";
    if (key === "ArrowDown" || key === "ArrowRight") return "next";
    return null;
}
