import type { Article } from "../types.js";
import { repoFile, DOCS_INDEX_URL } from "../links.js";

export const projectCanvas: Article = {
    id: "project-canvas",
    title: "The project canvas, a node-graph view of map creation",
    summary:
        "A second presentation of the same map-creation model as the linear wizard: six boxes drawn as a graph rather than five steps shown one at a time, reading and writing the identical answers so switching views mid-project loses nothing.",
    category: "application",
    status: "shipped",
    statusNote:
        "The layout, wiring rules, search, keyboard movement and options rendering are built and covered by tests. Two things are not done yet: no capture exists from the built artifact, and a wire cannot be dragged between two nodes by hand - every wire on screen is drawn from the model's own allowed-edge list rather than from a gesture.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "A linear wizard can only ever show one step at a time, so a shape like ",
                        "\"one world feeds several dimensions, and options and storage both hang off the map rather ",
                        "than off the world\" has to be held in the person's head rather than shown. The canvas ",
                        "exists to draw that shape instead of describing it. It is a second way to look at a ",
                        "project, never a second project: the canvas keeps no answer of its own.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        [
                            { strong: "One model, two presentations." },
                            " The canvas is handed the exact ",
                            { code: "MapWizard" },
                            " object the linear wizard already builds and exposes, returned by ",
                            { code: "createMapWizard()" },
                            ". ",
                            { code: "WorldScreen.vue" },
                            " keeps the wizard mounted under ",
                            { code: "v-show" },
                            " rather than tearing it down when the canvas is shown, and passes that same object ",
                            "into ",
                            { code: "ProjectCanvas" },
                            " as a prop. Reading and writing through one shared object is what makes switching ",
                            "modes half way through a project a rendering decision instead of a migration: there ",
                            "is nothing to carry across because there was only ever one set of answers.",
                        ],
                        [
                            { strong: "Six node kinds, one wizard step behind five of them." },
                            " ",
                            { code: "world" },
                            ", ",
                            { code: "dimension" },
                            ", ",
                            { code: "identity" },
                            ", ",
                            { code: "options" },
                            ", ",
                            { code: "storage" },
                            " and ",
                            { code: "render" },
                            ". ",
                            { code: "dimension" },
                            " is the one exception: the wizard keeps dimension choice inside its ",
                            { code: "identity" },
                            " step, but a world feeding several dimensions is exactly the shape a linear wizard ",
                            "cannot draw, which is the clearest reason this surface exists at all. Splitting it ",
                            "into its own box costs nothing in validation, because it is still governed by ",
                            "the same step's own problems.",
                        ],
                        [
                            { strong: "A node does not decide whether it is complete." },
                            " Its problem badge asks the shared model's ",
                            { code: "problemsFor(step)" },
                            " rather than reimplementing validation, which would then be free to disagree with ",
                            "the wizard's own answer about whether a step is finished. The badge's count and its ",
                            "tooltip text are both the model's own words, never a number the node worked out.",
                        ],
                        [
                            { strong: "Options render through the same control every field always uses." },
                            " ",
                            { code: "CanvasNode.vue" },
                            " draws each option with ",
                            { code: "ConfigField" },
                            ", the identical component the linear wizard's options step uses, so a setting gets ",
                            "its real control - one of thirteen ",
                            { code: "Control" },
                            " kinds, covering switches, numbers, sliders, paths, selects, colours, vectors, ",
                            "lists and key-value tables among the rest - rather than a hand-rolled text box ",
                            "standing in for it. Nothing on this node is a bespoke input, select, switch or ",
                            "slider; that absence is asserted directly against the component's own template.",
                        ],
                        [
                            { strong: "A wire is a real dependency, not decoration." },
                            " ",
                            { code: "ALLOWED_EDGES" },
                            " lists exactly the connections the wizard model can actually build: a dimension ",
                            "cannot be chosen before a world has been inspected, options and storage both attach ",
                            "to a named map rather than to each other, and the render step needs somewhere to ",
                            "write. Every wire the canvas draws comes from walking that same list against the ",
                            "current node positions, so the picture on screen cannot claim a dependency the ",
                            "model does not have.",
                        ],
                        [
                            { strong: "A refused connection always names a way forward." },
                            " ",
                            { code: "canConnect(from, to)" },
                            " never answers with a bare refusal. A backwards attempt is told which direction to ",
                            "drag from instead; an unrelated pair is told what the source node actually connects ",
                            "to; a self-connection and the render node's own dead end each get their own exact ",
                            "sentence. The reasoning is that \"invalid connection\" reads as the software being ",
                            "broken, while naming the correct move reads as the attempt being wrong.",
                        ],
                        [
                            { strong: "Node search marks a match; it never hides the rest." },
                            " Typing into the canvas's search field, which reuses the same regex-capable ",
                            { code: "ConfigSearchField" },
                            " every settings search in this application uses, highlights the nodes whose bundled ",
                            "search text matches and leaves every other node exactly where it was. Hiding a ",
                            "non-matching node would hide part of the project's own shape, which is the one ",
                            "thing this surface exists to show.",
                        ],
                        [
                            { strong: "Keyboard movement, not only a pointer." },
                            " With a node selected, the arrow keys nudge it by a small step and Shift plus an ",
                            "arrow key moves it further, so a canvas that only answered to a pointer would lock ",
                            "out somebody who cannot use one. Selecting, dragging and panning all also work with ",
                            "a pointer: clicking empty canvas pans the view, dragging a node's header moves it, ",
                            "and the wheel zooms.",
                        ],
                        [
                            { strong: "Every node carries appearance editing and the toy locks for free." },
                            " Each node is wrapped in ",
                            { code: "AppearanceTarget" },
                            ", the same wrapper used throughout the application, so \"Edit appearance...\" and ",
                            "the toy-lock commands are already present on every node without ",
                            { code: "CanvasNode.vue" },
                            " implementing either one itself.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Geometry is borrowed, not reinvented",
                    content:
                        "The pan/zoom/fit-to-view arithmetic in canvasModel.ts comes from the same maskCanvasView.js helpers the render-mask editor already uses. They are plain coordinate math over a centre and a scale with no idea what is being drawn, so a node graph and a world mask can share the same code without either one bending to fit the other.",
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
                            term: "Entry point",
                            description:
                                "A toggle on the world screen switches the visible presentation between \"Steps\" (the linear wizard) and \"Canvas\". The wizard is the default because it is the better first meeting with the product; the canvas is a deliberate choice for someone who already wants to see the project's shape.",
                        },
                        {
                            term: "What the canvas owns",
                            description:
                                "Exactly three things, held in a CanvasLayout: where each of the six boxes sits, which one is selected, and how far the view is panned and zoomed. Nothing here can hold an answer - a test asserts the exact three keys on a node and the exact three keys on the layout, so a field that could hold project data would fail that count on sight.",
                        },
                        {
                            term: "Node search",
                            description:
                                "Plain text by default, with the same optional regex mode every search bar in this application offers, matched against a short bundled description of each node kind rather than against the project's live answers.",
                        },
                        {
                            term: "Starting layout",
                            description:
                                "A fixed left-to-right arrangement in build order, with the options and storage nodes stacked in the same column because both hang off identity: stacking them keeps the fork visible rather than letting the two wires cross and read as a single chain.",
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
                        "A dragged wire between two ports does not exist. Every wire on screen is derived from ALLOWED_EDGES against the current node positions; there is no gesture that draws or removes one by hand, so a person expecting to connect two nodes by dragging between them finds nothing to grab.",
                        "An attempted connection the model does not allow is refused with a specific reason rather than silently drawn or silently ignored.",
                        "A node with no answer yet shows its own honest placeholder text (\"No world folder chosen yet\", and the like) instead of an empty box.",
                        "No screenshot or recording of the canvas exists from the built application. Every fact in this article is read from the source and its tests, not observed running.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "The canvas makes no network request of its own and reads no file directly; every filesystem-facing answer (a world path, a storage directory) still goes through the same wizard model and the same host the linear wizard already uses.",
                        "Nothing about switching presentations changes what gets written when a render starts: the request that reaches the render pipeline is built from the one shared wizard object, regardless of which view produced the final answer.",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "list",
                    items: [
                        [
                            { code: "canvasModel.test.ts" },
                            ": one node per kind and no more, the options/storage fork stacked rather than ",
                            "level, moving only the requested node, selecting and clearing selection, hit-testing ",
                            "a node's exact box and nothing outside it, bounding every node, every allowed edge ",
                            "accepted, a backwards wire and an unrelated wire each refused with a reason naming ",
                            "the correct direction or target, a self-connection refused, the render node's dead ",
                            "end named, every node reachable by walking the edges from ",
                            { code: "world" },
                            ", every node kind mapped onto a real wizard step, ",
                            { code: "dimension" },
                            " governed by the ",
                            { code: "identity" },
                            " step, and an exact-key check proving the layout can hold no project answer of its ",
                            "own.",
                        ],
                        [
                            { code: "CanvasNode.shape.test.ts" },
                            ": asserted against the component's own template text rather than a mounted ",
                            "instance, because mounting proves only that whatever renders today renders without ",
                            "throwing - it cannot prove the negative this file exists for, that nobody has added ",
                            "a bespoke input standing in for one option. Checks that options render through ",
                            { code: "ConfigField" },
                            " with the field's own metadata and the shared file, that no bespoke input, select, ",
                            "switch, slider, checkbox, combobox, autocomplete, file input, native input, select ",
                            "or textarea appears anywhere in the template, that the node wraps itself in ",
                            { code: "AppearanceTarget" },
                            " with a stable id, and that the problem badge's count and tooltip come from the ",
                            "shared model's own words rather than from a function this component wrote.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    // A warning rather than the tone that means unbuilt: the canvas is shipped
                    // and this says what it does not cover. Badging it "shipped" while calling
                    // itself unimplemented leaves a reader no way to know which to believe.
                    tone: "warning",
                    title: "No built-artifact evidence yet, and one interaction missing",
                    content:
                        "Everything above is proven by source-level and component-shape tests. Nobody has launched the packaged application and looked at the canvas, so there is no screenshot, no recording, and no confirmation that the pan/zoom/drag interactions feel right on a real screen. Wire dragging between ports is also unimplemented: the wires you see are always derived from the model, never drawn by a person.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "contract-appearance-editors",
            reason: "AppearanceTarget is what gives every node its \"Edit appearance...\" command and toy locks.",
        },
        {
            articleId: "regex-builder-surfaces",
            reason: "The node search field is the same regex-capable search bar every settings surface in this application uses.",
        },
        {
            articleId: "project-editor",
            reason: "The maps, storages and render options a finished project holds once the canvas or the wizard has written one.",
        },
    ],

    sources: [
        {
            label: "packages/ui/src/components/canvas",
            href: repoFile("design/packages/ui/src/components/canvas"),
        },
        {
            label: "packages/ui/src/components/world/WorldScreen.vue",
            href: repoFile("design/packages/ui/src/components/world/WorldScreen.vue"),
        },
        { label: "docs/README.md", href: DOCS_INDEX_URL },
    ],
};
