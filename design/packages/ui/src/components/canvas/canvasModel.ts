/**
 * The node-graph canvas's own state, and deliberately nothing else.
 *
 * The canvas is a second presentation of the map-creation flow, not a second copy of it. Every
 * answer a person gives - the world folder, the dimension, the map id, every option, the storage
 * directory, the run flags - lives in the wizard model returned by `createMapWizard()` and is read
 * and written straight through it. This file owns only what the wizard has no opinion about:
 * where the boxes sit, which one is selected, and how far the view is zoomed.
 *
 * That split is the whole design. Two creation surfaces that each keep their own copy of the
 * project would disagree about validation, defaults, and what a finished project is, and the
 * disagreement would surface as a bug report from somebody who switched modes half way through.
 * Keeping project truth in exactly one place makes switching modes a rendering decision rather
 * than a migration.
 *
 * The geometry helpers come from `../config/maskCanvasView.js`, which the render-mask editor
 * already uses. They are plain coordinate arithmetic over a centre and a scale, with no idea what
 * is being drawn, so a node graph and a world mask can share them without either bending to the
 * other.
 */

import {
    type PixelRect,
    type ViewState,
    fitView,
    panView,
    pixelDeltaToWorld,
    pointerToWorld,
    worldToPixel,
    zoomView,
} from "../config/maskCanvasView.js";

export type { PixelRect, ViewState };
export { fitView, panView, pixelDeltaToWorld, pointerToWorld, worldToPixel, zoomView };

/**
 * The six node kinds, in the order a project is built.
 *
 * Five of them correspond to a step in `WIZARD_STEPS`; `dimension` is the exception and is
 * deliberate. The wizard keeps dimension choice inside its `identity` step, but "one world feeding
 * several dimensions" is exactly the shape a linear wizard cannot draw, and it is the clearest
 * reason for this surface to exist at all. It is still governed by `problemsFor("identity")`, so
 * splitting it visually costs nothing in validation.
 */
export const NODE_KINDS = ["world", "dimension", "identity", "options", "storage", "render"] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

/**
 * Which wizard step owns each node's answers, so a node can ask the shared model for its problems
 * rather than deciding for itself whether it is complete. `dimension` maps to `identity` for the
 * reason above.
 */
export const STEP_FOR_NODE: Readonly<Record<NodeKind, "world" | "identity" | "options" | "storage" | "review">> =
    Object.freeze({
        world: "world",
        dimension: "identity",
        identity: "identity",
        options: "options",
        storage: "storage",
        render: "review",
    });

/**
 * The edges the project genuinely has.
 *
 * A wire here is a real dependency in the wizard model, not decoration: a dimension cannot be
 * chosen before a world has been inspected, options attach to a named map, and the render needs
 * somewhere to write. Anything not in this list is refused by `canConnect` with the reason, so the
 * canvas cannot express a project the model could not build.
 */
export const ALLOWED_EDGES: readonly (readonly [NodeKind, NodeKind])[] = Object.freeze([
    ["world", "dimension"],
    ["dimension", "identity"],
    ["identity", "options"],
    ["identity", "storage"],
    ["options", "render"],
    ["storage", "render"],
] as const);

export interface NodePlacement {
    readonly kind: NodeKind;
    /** Canvas coordinates, in the same space the view helpers call "world". */
    readonly x: number;
    readonly z: number;
}

export interface CanvasLayout {
    readonly nodes: readonly NodePlacement[];
    readonly selected: NodeKind | null;
    readonly view: ViewState;
}

/** Roughly a node's footprint, used for fitting the view and for hit testing. */
export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 160;
const COLUMN_GAP = 120;
const ROW_GAP = 60;

/**
 * The starting arrangement: left to right in build order, with the two nodes that hang off
 * `identity` stacked so the fork is visible at a glance rather than implied by wire crossings.
 */
export function defaultLayout(): readonly NodePlacement[] {
    const column = (index: number): number => index * (NODE_WIDTH + COLUMN_GAP);
    const row = (index: number): number => index * (NODE_HEIGHT + ROW_GAP);
    return Object.freeze([
        { kind: "world", x: column(0), z: row(0) },
        { kind: "dimension", x: column(1), z: row(0) },
        { kind: "identity", x: column(2), z: row(0) },
        { kind: "options", x: column(3), z: row(-1) },
        { kind: "storage", x: column(3), z: row(1) },
        { kind: "render", x: column(4), z: row(0) },
    ] as const);
}

export function createLayout(rect?: PixelRect): CanvasLayout {
    const nodes = defaultLayout();
    return {
        nodes,
        selected: null,
        view: rect ? fitView(boundsOf(nodes), rect) : { centerX: 0, centerZ: 0, blocksPerPixel: 1 },
    };
}

/** The bounding box of every node, padded by one node so edge nodes are not flush to the frame. */
export function boundsOf(nodes: readonly NodePlacement[]): {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
} {
    if (nodes.length === 0) return { minX: 0, maxX: NODE_WIDTH, minZ: 0, maxZ: NODE_HEIGHT };
    const xs = nodes.map((node) => node.x);
    const zs = nodes.map((node) => node.z);
    return {
        minX: Math.min(...xs) - NODE_WIDTH / 2,
        maxX: Math.max(...xs) + NODE_WIDTH * 1.5,
        minZ: Math.min(...zs) - NODE_HEIGHT / 2,
        maxZ: Math.max(...zs) + NODE_HEIGHT * 1.5,
    };
}

export interface ConnectionVerdict {
    readonly allowed: boolean;
    /** Empty when allowed; otherwise the exact reason, in words a person can act on. */
    readonly reason: string;
}

/**
 * Whether a wire may be drawn, and if not, why.
 *
 * A refusal always says something specific. "Invalid connection" tells somebody they were wrong
 * without telling them what would be right, which reads as the software being broken rather than
 * the attempt being wrong.
 */
export function canConnect(from: NodeKind, to: NodeKind): ConnectionVerdict {
    if (from === to) {
        return { allowed: false, reason: `A ${from} node cannot feed itself.` };
    }
    const allowed = ALLOWED_EDGES.some(([a, b]) => a === from && b === to);
    if (allowed) return { allowed: true, reason: "" };
    const backwards = ALLOWED_EDGES.some(([a, b]) => a === to && b === from);
    if (backwards) {
        return {
            allowed: false,
            reason: `${to} feeds ${from}, not the other way round. Drag from ${to} instead.`,
        };
    }
    const targets = ALLOWED_EDGES.filter(([a]) => a === from).map(([, b]) => b);
    if (targets.length === 0) {
        return { allowed: false, reason: `Nothing connects out of a ${from} node; it is where a project ends.` };
    }
    return {
        allowed: false,
        reason: `A ${from} node connects to ${targets.join(" or ")}, not to ${to}.`,
    };
}

export function moveNode(layout: CanvasLayout, kind: NodeKind, x: number, z: number): CanvasLayout {
    return {
        ...layout,
        nodes: layout.nodes.map((node) => (node.kind === kind ? { ...node, x, z } : node)),
    };
}

export function selectNode(layout: CanvasLayout, kind: NodeKind | null): CanvasLayout {
    return { ...layout, selected: kind };
}

/**
 * The node under a point, topmost first.
 *
 * Iterated in reverse so a node drawn later - and therefore on top - wins an overlap, which is
 * what somebody clicking the visible box expects.
 */
export function nodeAt(layout: CanvasLayout, x: number, z: number): NodeKind | null {
    for (let index = layout.nodes.length - 1; index >= 0; index -= 1) {
        const node = layout.nodes[index];
        if (!node) continue;
        if (x >= node.x && x <= node.x + NODE_WIDTH && z >= node.z && z <= node.z + NODE_HEIGHT) {
            return node.kind;
        }
    }
    return null;
}
