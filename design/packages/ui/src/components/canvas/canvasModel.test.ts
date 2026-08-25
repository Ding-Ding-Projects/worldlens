import { describe, expect, it } from "vitest";

import {
    ALLOWED_EDGES,
    NODE_HEIGHT,
    NODE_KINDS,
    NODE_WIDTH,
    STEP_FOR_NODE,
    boundsOf,
    canConnect,
    createLayout,
    defaultLayout,
    moveNode,
    nodeAt,
    selectNode,
} from "./canvasModel.js";
import { WIZARD_STEPS } from "../world/wizardSteps.js";

describe("the project canvas layout", () => {
    it("places one node for every kind, and no more", () => {
        const kinds = defaultLayout().map((node) => node.kind);
        expect([...kinds].sort()).toEqual([...NODE_KINDS].sort());
        expect(new Set(kinds).size).toBe(NODE_KINDS.length);
    });

    /**
     * The point of the fork being visible: options and storage both hang off identity, and if they
     * shared a row the two wires would cross and the shape would read as a chain.
     */
    it("stacks the two nodes that fork off identity", () => {
        const nodes = defaultLayout();
        const options = nodes.find((node) => node.kind === "options");
        const storage = nodes.find((node) => node.kind === "storage");
        expect(options?.x).toBe(storage?.x);
        expect(options?.z).not.toBe(storage?.z);
    });

    it("moves only the node it was asked to move", () => {
        const before = createLayout();
        const after = moveNode(before, "identity", 999, -42);
        const moved = after.nodes.find((node) => node.kind === "identity");
        expect(moved).toEqual({ kind: "identity", x: 999, z: -42 });
        for (const node of after.nodes) {
            if (node.kind === "identity") continue;
            expect(node).toEqual(before.nodes.find((other) => other.kind === node.kind));
        }
    });

    it("selects and clears selection", () => {
        const layout = createLayout();
        expect(layout.selected).toBeNull();
        expect(selectNode(layout, "options").selected).toBe("options");
        expect(selectNode(selectNode(layout, "options"), null).selected).toBeNull();
    });

    it("hit-tests a node's box and nothing outside it", () => {
        const layout = createLayout();
        const world = layout.nodes.find((node) => node.kind === "world");
        if (!world) throw new Error("the world node is missing from the default layout");
        expect(nodeAt(layout, world.x + 1, world.z + 1)).toBe("world");
        expect(nodeAt(layout, world.x + NODE_WIDTH - 1, world.z + NODE_HEIGHT - 1)).toBe("world");
        expect(nodeAt(layout, world.x - 1, world.z - 1)).toBeNull();
    });

    it("bounds every node it was given", () => {
        const bounds = boundsOf(defaultLayout());
        for (const node of defaultLayout()) {
            expect(node.x).toBeGreaterThanOrEqual(bounds.minX);
            expect(node.z).toBeGreaterThanOrEqual(bounds.minZ);
            expect(node.x + NODE_WIDTH).toBeLessThanOrEqual(bounds.maxX);
            expect(node.z + NODE_HEIGHT).toBeLessThanOrEqual(bounds.maxZ);
        }
    });
});

describe("which wires the canvas will draw", () => {
    it("allows exactly the dependencies the project has", () => {
        for (const [from, to] of ALLOWED_EDGES) {
            expect(canConnect(from, to).allowed).toBe(true);
        }
    });

    /**
     * A refusal that does not say what would have been right reads as broken software. Each of
     * these asserts the reason names a way forward, not merely that the attempt failed.
     */
    it("refuses a backwards wire and names the direction that works", () => {
        const verdict = canConnect("dimension", "world");
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain("Drag from world instead");
    });

    it("refuses an unrelated wire and names what the source does connect to", () => {
        const verdict = canConnect("world", "render");
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain("dimension");
    });

    it("refuses a self-connection", () => {
        expect(canConnect("options", "options")).toEqual({
            allowed: false,
            reason: "A options node cannot feed itself.",
        });
    });

    it("says plainly that the render node ends the project", () => {
        const verdict = canConnect("render", "world");
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain("where a project ends");
    });

    it("reaches every node from the world node", () => {
        const reached = new Set(["world"]);
        let grew = true;
        while (grew) {
            grew = false;
            for (const [from, to] of ALLOWED_EDGES) {
                if (reached.has(from) && !reached.has(to)) {
                    reached.add(to);
                    grew = true;
                }
            }
        }
        expect([...reached].sort()).toEqual([...NODE_KINDS].sort());
    });
});

/**
 * The guard on the one-model rule.
 *
 * This file is allowed to own layout and nothing else. If a node kind ever stopped mapping onto a
 * real wizard step, that would be the first sign the canvas had started keeping answers of its own
 * - which is the failure that makes two creation surfaces disagree about the same project.
 */
describe("the canvas keeps no project truth of its own", () => {
    it("maps every node kind onto a real wizard step", () => {
        for (const kind of NODE_KINDS) {
            const step = STEP_FOR_NODE[kind];
            expect(WIZARD_STEPS).toContain(step);
        }
    });

    it("keeps dimension governed by the identity step it belongs to", () => {
        expect(STEP_FOR_NODE.dimension).toBe("identity");
        expect(STEP_FOR_NODE.identity).toBe("identity");
    });

    it("exposes no field that could hold an answer", () => {
        const layout = createLayout();
        const nodeFields = new Set(layout.nodes.flatMap((node) => Object.keys(node)));
        expect([...nodeFields].sort()).toEqual(["kind", "x", "z"]);
        expect(Object.keys(layout).sort()).toEqual(["nodes", "selected", "view"]);
    });
});
