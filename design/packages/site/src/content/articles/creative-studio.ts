import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const creativeStudio: Article = {
    id: "creative-studio",
    title: "Creative appearance studio",
    summary:
        "A local non-destructive composition surface for the app mark and other appearance targets, with layers, typography, masks, effects, presets and rollback.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The versioned creative document, logo pipeline, renderer, appearance-store integration and focused tests are present. The integrated packaged editor capture remains pending and is not presented as complete evidence.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "The studio edits the app logo or any registered appearance target through the same store that applies ordinary appearance changes.",
                        "Versioned documents support raster, vector, text, gradient and group layers with visibility, selection, ordering, masks, effects and blend controls.",
                        "Crop, safe area, guides, grid, snapping, transforms, typography, gradients, shadows and colour adjustments preview from the document being edited.",
                        "Presets, undo and history keep edits reversible, and reset restores the shipped mark without changing installed identity.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Creative document",
                            description:
                                "A bounded versioned composition containing layers, selections, transforms, effects, presets and history metadata.",
                        },
                        {
                            term: "Appearance target",
                            description:
                                "The exact rendered element or app mark whose style the studio changes.",
                        },
                        {
                            term: "Unsupported property",
                            description:
                                "A visible property retained with a capability explanation when the renderer cannot apply it.",
                        },
                    ],
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Malformed, oversized, animated, script-bearing or decompression-bomb image input is rejected without replacing the previous valid document.",
                        "Schema migration, duplicate ids, cycles, invalid masks, unsafe SVG and out-of-range geometry fail before application.",
                        "A failed conversion or renderer update keeps the prior valid mark active and records the reason.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "Images and documents are processed locally with bounded bytes, pixels, frames, layers, history and nesting. The source is never uploaded, network-fetched, logged or placed in exports, and stable package identity remains independent of the chosen display mark.",
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Packaged editor proof remains pending",
                    content:
                        "Focused adapter, document, logo-pipeline and renderer tests cover validation and rollback. The full built Windows creative editor interaction and capture remain pending in the final smoke wave.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "appearance-editor",
            reason: "The core appearance editor supplies the target and typography controls around this studio.",
        },
        {
            articleId: "contract-appearance-editors",
            reason: "The appearance contract defines the complete property and state coverage expected from an editor.",
        },
        {
            articleId: "file-converter",
            reason: "Local conversion documents the same bounded image input and output validation boundary.",
        },
    ],
    sources: [
        {
            label: "design/docs/features/appearance/creative-studio.md",
            href: repoFile("design/docs/features/appearance/creative-studio.md"),
        },
        {
            label: "packages/ui/src/components/appearance/creative/CreativeStudio.vue",
            href: repoFile(
                "design/packages/ui/src/components/appearance/creative/CreativeStudio.vue",
            ),
        },
        {
            label: "packages/ui/src/components/appearance/creative/creativeDocument.ts",
            href: repoFile(
                "design/packages/ui/src/components/appearance/creative/creativeDocument.ts",
            ),
        },
    ],
};
