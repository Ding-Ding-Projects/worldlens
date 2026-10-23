import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const mapDrawingAndCommands: Article = {
    id: "map-drawing-and-commands",
    title: "Map drawing and commands",
    summary:
        "Draw marker geometry and command operands directly on the map with one shared point, rectangle, circle, polygon and path picker, with an equivalent keyboard route.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "Spatial selection, marker geometry and command builder logic have focused proof on the integrated tree and the viewer and UI packages typecheck and build. Real terrain interaction in the packaged viewer, the served viewer shell conversion and captures of the tools remain unverified.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                { kind: "list", items: [
                        "The map toolbar gains Markers, Draw area, Commands and Bots, kept apart from view controls. Picking suspends camera gestures only for that mode.",
                        "Escape cancels the current pick and restores focus, Enter confirms valid geometry, Backspace removes the last vertex, and a coordinate table gives the same result from the keyboard.",
                        "Marker studio keeps its POI, line, shape and extrude model and its one worldlens:studio set; non-POI geometry is now drawn, with the JSON field as the numeric alternative.",
                        "A drawn region becomes two coordinate arguments and a path becomes ordered point operands for the command builder, whose preview shows the exact command, target and geometry first.",
                    ] },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                { kind: "paragraph", content: "Points take one vertex, rectangles and circles two, polygons at least three, paths between two and 128. Marker limits are unchanged: 500 markers per map, 160-character labels, 4,000-character notes, Y within plus or minus 2,048 and X/Z within 30,000,000." },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                { kind: "list", items: [
                        "A selection with too few vertices for its kind cannot be confirmed; the table shows what is missing.",
                        "A selection on a different dimension from the active map is refused rather than reprojected.",
                        "Without a selected server the command tools stay visible and disabled with the reason while the drawing tools keep working.",
                        "A stale marker revision from a hosted viewer returns a conflict that keeps the local draft.",
                    ] },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                { kind: "paragraph", content: "Drawing produces coordinates only. Nothing executes by selecting geometry; a command still passes through the main-process preview and execution path with its own authorisation and confirmation. Marker content is a person's own and is never published without the hosting sign-in." },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                { kind: "paragraph", content: "On the integrated tree the spatial selection, marker geometry, annotation client and marker studio tests pass, the viewer and UI packages typecheck and the UI build completes. Not verified here: real terrain interaction in the packaged viewer, the served viewer shell conversion, localisation of every new string and captures of the drawing tools." },
            ],
        },
    ],
    suggested: [
        {
            articleId: "bots-and-commands",
            reason: "Where a drawn region goes: the command graph, preview and dispatch it feeds.",
        },
        {
            articleId: "project-canvas",
            reason: "The project workspace the map and its tools live in.",
        },
        {
            articleId: "mcserver-hosting",
            reason: "The server a command on the map is sent to.",
        },
    ],
    sources: [
        {
            label: "docs/map-drawing-and-commands.md",
            href: repoFile("docs/map-drawing-and-commands.md"),
        },
        {
            label: "docs/marker-studio.md",
            href: repoFile("docs/marker-studio.md"),
        },
        {
            label: "packages/ui/src/components/markers/spatialSelection.ts",
            href: repoFile("design/packages/ui/src/components/markers/spatialSelection.ts"),
        },
    ],
};
