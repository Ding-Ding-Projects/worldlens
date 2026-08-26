# The project canvas, a node-graph view of map creation

A second presentation of map creation, alongside the linear step-by-step wizard: the same
project drawn as six connected boxes instead of shown one step at a time.

The code is `design/packages/ui/src/components/canvas/`. `WorldScreen.vue` owns the toggle
between the two presentations.

## Behaviour

A wizard can only show one step at a time, so a shape such as "one world feeds several
dimensions, and options and storage both hang off the map rather than off the world" has to
be held in someone's head rather than seen. The canvas exists to draw that shape.

It is a second way to look at one project, never a second project. `WorldScreen.vue` builds
the wizard model once, with `createMapWizard()`, keeps the linear wizard mounted under
`v-show` rather than tearing it down, and hands the identical model object to the canvas as a
prop. Both presentations read and write through that one object, so switching between them
mid-project is a rendering decision rather than a migration: there is nothing to carry across,
because there was only ever one set of answers.

**Six node kinds:** `world`, `dimension`, `identity`, `options`, `storage` and `render`. Five
of them line up with a step in the linear wizard; `dimension` is the exception, because the
wizard keeps dimension choice inside its `identity` step while "one world, several dimensions"
is exactly the shape a linear wizard cannot draw. Splitting it into its own box costs nothing
in validation - it is still governed by the same step's own completeness check.

A node never decides for itself whether it is complete. Its problem badge asks the shared
model's `problemsFor(step)`, and the badge's count and tooltip are the model's own words,
never a number the node worked out on its own.

Options render through `ConfigField`, the identical component the linear wizard's options
step already uses, so a setting gets its real control rather than a hand-rolled text box. A
wire between two nodes is a real dependency read from the model's own allowed-edge list, not
decoration, and an attempted connection the model does not allow is refused with a specific
reason naming the correct direction or the correct target.

Searching for a node marks the matching nodes rather than hiding the rest, because hiding a
node would hide part of the project's own shape. With a node selected, arrow keys nudge it and
Shift plus an arrow key moves it further, so the canvas does not require a pointer. Every node
is wrapped in the application's shared appearance-target component, so "Edit appearance..."
and the toy-lock commands are already present without this feature implementing either.

## Configuration

A toggle on the world screen switches between "Steps" and "Canvas". The wizard is the default
presentation; the canvas is a deliberate choice for someone who wants to see the project's
shape rather than answer one question at a time.

The canvas keeps exactly three things of its own: where each of the six boxes sits, which one
is selected, and how far the view is panned and zoomed. It cannot hold a project answer -
that would be a second copy of the truth the wizard already keeps, and the two copies would be
free to disagree.

## Failure modes

A wire cannot be dragged between two ports by hand. Every wire shown is derived from the
model's allowed-edge list against the current node positions; there is no gesture that draws
or removes one, so someone expecting to connect two nodes by dragging between them finds
nothing to grab.

An attempted connection the model does not allow is refused with a reason rather than silently
drawn or silently ignored. A node with no answer yet shows honest placeholder text instead of
an empty box.

## Security considerations

The canvas makes no network request of its own and reads no file directly. Every
filesystem-facing answer, such as a world path or a storage directory, goes through the same
wizard model and the same host the linear wizard already uses. Switching presentations changes
nothing about what a started render actually requests, because both presentations build that
request from the one shared model.

## Verification

`canvasModel.test.ts` covers the layout: one node per kind, the options/storage fork stacked
rather than sharing a row, moving only the requested node, hit-testing a node's exact box,
every allowed edge accepted, a backwards or unrelated wire refused with a reason naming the
correct move, every node reachable from `world` by walking the edges, and an exact-key check
proving the layout can hold no project answer of its own.

`CanvasNode.shape.test.ts` is asserted against the component's own template text rather than a
mounted instance, because mounting only proves that whatever renders today renders without
throwing - it does not prove that nobody has added a bespoke input standing in for one option.
It checks that options render through `ConfigField`, that no bespoke input, select, switch or
slider appears anywhere in the template, that the node wraps itself in the appearance-target
component, and that the problem badge comes from the shared model's own words.

Nobody has launched the packaged application and looked at the canvas yet. There is no
screenshot, no recording, and no confirmation that panning, zooming and dragging feel right on
a real screen. Wire dragging between ports is unimplemented, not merely uncaptured.

## Suggested articles

- [Appearance editors](appearance-editors.md) - what gives every node its "Edit appearance..." command and toy locks
- [The regex builder and the search bars it reaches](regex-builder.md) - the node search field reuses this same search bar
- [Editing a project](project-editor.md) - what a finished project holds once either presentation has written one
