import { describe, expect, it } from "vitest";
import {
    addCreativeLayer,
    createCreativeDocument,
    createCreativeLayer,
    exportCreativeDocument,
    groupCreativeLayers,
    importCreativeDocument,
    redoCreative,
    undoCreative,
    updateCreativeLayer,
    validateCreativeAssetBytes,
    validateCreativeDocument,
    setCreativeCanvas,
    duplicateCreativeLayers,
} from "./creativeDocument.js";
import { renderCreativePreviewText } from "./creativeRenderer.js";

describe("creative appearance document", () => {
    it("creates a bounded versioned empty document with append-only creation history", () => {
        const document = createCreativeDocument({ width: 1200, height: 630, background: "#101114" });
        expect(document.format).toBe("worldlens-creative-appearance");
        expect(document.version).toBe(2);
        expect(document.history).toHaveLength(1);
        expect(document.history[0]?.action).toBe("document created");
        expect(validateCreativeDocument(document)).toBe(true);
    });

    it("keeps controls and the SVG preview on the same state", () => {
        let document = createCreativeDocument();
        document = addCreativeLayer(document, createCreativeLayer("vector"));
        const layer = document.layers[0];
        expect(layer?.kind).toBe("vector");
        const before = renderCreativePreviewText(document);
        document = updateCreativeLayer(document, layer!.id, { opacity: 0.42, x: 220 }, "adjust preview");
        const after = renderCreativePreviewText(document);
        expect(after).toContain('opacity="0.42"');
        expect(after).toContain('x="220"');
        expect(after).not.toBe(before);
    });

    it("supports append-only undo and redo without erasing history", () => {
        let document = createCreativeDocument();
        document = addCreativeLayer(document, createCreativeLayer("text"));
        const withLayer = document;
        document = updateCreativeLayer(document, document.layers[0]!.id, { name: "Headline" }, "rename");
        expect(document.layers[0]!.name).toBe("Headline");
        const undone = undoCreative(document);
        expect(undone.layers[0]!.name).toBe(withLayer.layers[0]!.name);
        expect(undone.history).toHaveLength(document.history.length);
        expect(redoCreative(undone).layers[0]!.name).toBe("Headline");
    });

    it("groups selected layers with a real parent relationship", () => {
        let document = createCreativeDocument();
        document = addCreativeLayer(document, createCreativeLayer("text"));
        document = addCreativeLayer(document, createCreativeLayer("vector"));
        const ids = document.layers.map((layer) => layer.id);
        document = groupCreativeLayers(document, ids);
        const group = document.layers.find((layer) => layer.kind === "group");
        expect(group).toBeDefined();
        expect(document.layers.filter((layer) => layer.parentId === group!.id)).toHaveLength(2);
    });

    it("remaps nested parent IDs when duplicating a group", () => {
        let document = createCreativeDocument();
        document = addCreativeLayer(document, createCreativeLayer("group"));
        const groupId = document.layers[0]!.id;
        document = addCreativeLayer(document, createCreativeLayer("text"));
        const childId = document.layers[1]!.id;
        document = updateCreativeLayer(document, childId, { parentId: groupId }, "nest child");
        document = duplicateCreativeLayers(document, [groupId]);
        const groups = document.layers.filter((layer) => layer.kind === "group");
        expect(groups).toHaveLength(2);
        const copy = groups[1]!;
        expect(document.layers.some((layer) => layer.parentId === copy.id)).toBe(true);
    });

    it("round trips export and import without trusting arbitrary JSON", () => {
        let document = createCreativeDocument();
        document = addCreativeLayer(document, createCreativeLayer("gradient"));
        const roundTrip = importCreativeDocument(exportCreativeDocument(document)).document;
        expect(roundTrip.layers[0]!.kind).toBe("gradient");
        expect(() => importCreativeDocument("{\"format\":\"worldlens-creative-appearance\",\"version\":999}")).toThrow(/supported bounded format/);
    });

    it("migrates version 1 canvas, layers, history, and presets without blanking them", () => {
        let document = createCreativeDocument();
        document = addCreativeLayer(document, createCreativeLayer("text"));
        const legacy = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
        legacy.version = 1;
        delete (legacy.canvas as Record<string, unknown>).crop;
        delete (legacy.canvas as Record<string, unknown>).grid;
        delete (legacy.canvas as Record<string, unknown>).guides;
        delete (legacy.canvas as Record<string, unknown>).safeArea;
        delete legacy.logo;
        for (const layer of legacy.layers as Record<string, unknown>[]) { delete layer.locked; delete layer.scaleX; delete layer.scaleY; }
        const result = importCreativeDocument(JSON.stringify(legacy));
        expect(result.warnings[0]).toContain("version 1");
        expect(result.document.layers).toHaveLength(1);
        expect(result.document.history).toHaveLength(document.history.length);
        expect(validateCreativeDocument(result.document)).toBe(true);
    });

    it("rejects scripts and decompression-style oversized assets before state changes", () => {
        const png = new Uint8Array(24);
        png.set([0x89, 0x50, 0x4e, 0x47], 0);
        new DataView(png.buffer).setUint32(16, 100);
        new DataView(png.buffer).setUint32(20, 100);
        expect(validateCreativeAssetBytes(png).format).toBe("png");
        expect(() => validateCreativeAssetBytes(new TextEncoder().encode("<svg><script>alert(1)</script></svg>"), "image/svg+xml")).toThrow(/supported/);
        expect(() => validateCreativeAssetBytes(new Uint8Array(8 * 1024 * 1024 + 1))).toThrow(/8 MB/);
    });

    it("fails closed on duplicate ids, orphan parents, cycles, invalid stops, and unsafe geometry", () => {
        let document = createCreativeDocument();
        document = addCreativeLayer(document, createCreativeLayer("gradient"));
        const duplicate = { ...JSON.parse(JSON.stringify(document)) as typeof document, layers: [document.layers[0]!, { ...document.layers[0]!, name: "duplicate" }] };
        expect(validateCreativeDocument(duplicate)).toBe(false);
        const orphan = { ...JSON.parse(JSON.stringify(document)) as typeof document, layers: [{ ...document.layers[0]!, parentId: "missing" }] };
        expect(validateCreativeDocument(orphan)).toBe(false);
        const badStops = { ...JSON.parse(JSON.stringify(document)) as typeof document, layers: [{ ...document.layers[0]!, stops: [{ offset: 3, color: "not-a-colour" }] }] };
        expect(validateCreativeDocument(badStops)).toBe(false);
        const badAsset = { ...JSON.parse(JSON.stringify(document)) as typeof document, layers: [{ ...document.layers[0]!, kind: "raster", dataUrl: "data:image/png;base64,not-a-real-png" } as never] };
        expect(validateCreativeDocument(badAsset)).toBe(false);
        const badCrop = { ...document, canvas: { ...document.canvas, crop: { top: 500, right: 600, bottom: 400, left: 500 } } };
        expect(validateCreativeDocument(badCrop)).toBe(false);
    });

    it("renders masks, effects, clipping, gradients, and safe text as real SVG state", () => {
        let document = createCreativeDocument();
        document = addCreativeLayer(document, createCreativeLayer("vector"));
        const id = document.layers[0]!.id;
        document = updateCreativeLayer(document, id, {
            mask: { enabled: true, kind: "ellipse", x: 1, y: 2, width: 100, height: 80, feather: 4 },
            clipped: true,
            effects: { ...document.layers[0]!.effects, blur: 4, outerGlow: { radius: 8, color: "#ffffff" } },
        }, "mask and effects");
        const rendered = renderCreativePreviewText(document);
        expect(rendered).toContain("creative-mask-");
        expect(rendered).toContain("filter:blur(4px)");
        expect(rendered).toContain("drop-shadow");
    });

    it("applies x and y once, around the layer center, when transforming geometry", () => {
        let document = createCreativeDocument();
        document = addCreativeLayer(document, createCreativeLayer("vector"));
        const id = document.layers[0]!.id;
        document = updateCreativeLayer(document, id, { x: 128, y: 192, rotation: 12, scaleX: 1.5, scaleY: 0.5 }, "transform geometry");
        const rendered = renderCreativePreviewText(document);
        expect(rendered).toContain('x="128"');
        expect(rendered).toContain('y="192"');
        expect(rendered).toContain('translate(308 282) scale(1.5 0.5) rotate(12) translate(-308 -282)');
        expect(rendered).not.toContain('translate(436 474)');
    });

    it("renders crop, rulers, guides, grid, safe area, clipping, and inner glow state", () => {
        let document = createCreativeDocument();
        document = setCreativeCanvas(document, {
            crop: { top: 10, right: 20, bottom: 30, left: 40 },
            rulers: true,
            guides: [{ id: "guide-a", axis: "x", position: 100 }],
            grid: { enabled: true, size: 20, snap: true },
            safeArea: { enabled: true, inset: 24 },
        }, "canvas guides");
        document = addCreativeLayer(document, createCreativeLayer("vector"));
        document = updateCreativeLayer(document, document.layers[0]!.id, {
            mask: { enabled: true, kind: "rectangle", x: 0, y: 0, width: 100, height: 100, feather: 2 },
            effects: { ...document.layers[0]!.effects, innerGlow: { radius: 5, color: "#ffffff" } },
        }, "inner glow");
        const rendered = renderCreativePreviewText(document);
        expect(rendered).toContain('viewBox="40 10 964 728"');
        expect(rendered).toContain("creative-grid");
        expect(rendered).toContain("guide-a");
        expect(rendered).toContain("creative-inner-glow-");
        expect(rendered).toContain('mask="url(#creative-mask-');
        expect(rendered).toContain("#ffcc00");
    });
});
