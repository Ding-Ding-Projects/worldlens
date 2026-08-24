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
} from "./creativeDocument.js";
import { renderCreativePreviewText } from "./creativeRenderer.js";

describe("creative appearance document", () => {
    it("creates a bounded versioned empty document with append-only creation history", () => {
        const document = createCreativeDocument({ width: 1200, height: 630, background: "#101114" });
        expect(document.format).toBe("worldlens-creative-appearance");
        expect(document.version).toBe(1);
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

    it("round trips export and import without trusting arbitrary JSON", () => {
        let document = createCreativeDocument();
        document = addCreativeLayer(document, createCreativeLayer("gradient"));
        const roundTrip = importCreativeDocument(exportCreativeDocument(document)).document;
        expect(roundTrip.layers[0]!.kind).toBe("gradient");
        expect(() => importCreativeDocument("{\"format\":\"worldlens-creative-appearance\",\"version\":999}")).toThrow(/supported bounded format/);
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
});
