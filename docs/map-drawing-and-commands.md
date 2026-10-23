# Map drawing and commands

Draw a marker's geometry directly on the map instead of typing coordinates, and pick the points,
rectangles, polygons and paths a server command needs from the same surface.

## Behaviour

The map toolbar gains **Markers**, **Draw area**, **Commands** and **Bots**, kept apart from the view
controls. A shared spatial picker supplies point, rectangle, circle, polygon and path selections,
each bound to the map's dimension. Picking suspends camera gestures only for that mode. Escape
cancels the current pick and restores focus, Enter confirms valid geometry, Backspace removes the
last vertex, and an explicit coordinate table gives the same result from the keyboard.

Marker studio keeps its model: POI, line, shape and extrude markers with bounded coordinates, stable
ordering, safe unknown fields and the one `worldlens:studio` set. Primary editing of non-POI
geometry now happens by drawing; the JSON geometry field remains as the numeric alternative. Marker
rows show kind, label and visibility, and an authenticated hosted viewer reads the same logical
document the local project stores.

The command builder on the map uses the selected server's discovered graph (see
[Discovered commands and bots](./bots-and-commands.md)). A region drawn on the map becomes two
coordinate arguments; a path becomes ordered point operands. The preview shows the exact command,
target and affected geometry before anything is dispatched.

## Configuration

Point selections take one vertex, rectangles and circles two, polygons at least three, paths at
least two and at most 128. Marker limits are unchanged: 500 markers per map, 160-character labels,
4,000-character notes, Y within plus or minus 2,048 and X/Z within 30,000,000.

## Failure modes

- A selection with too few vertices for its kind cannot be confirmed; Enter does nothing and the
  table shows what is missing.
- A selection on a different dimension from the active map is refused rather than reprojected.
- When no server is selected, the command tools stay visible and disabled with the reason, and the
  drawing tools keep working for markers.
- A stale marker revision from a hosted viewer returns a conflict that keeps the local draft.

## Security considerations

Drawing produces coordinates only. Nothing is executed by selecting geometry: a command still goes
through the main-process preview and execution path with its own authorisation and confirmation.
Marker content is a person's own; it is never published without the hosting workflow's sign-in.

## Verification

On the integrated tree: the spatial selection, marker geometry, annotation client and marker studio
tests pass, the viewer and UI packages typecheck, and the UI build completes. Not verified here: real
terrain interaction in the packaged viewer, the served viewer shell conversion, localisation of every
new string, and captures of the drawing tools.

## Sources and suggested articles

- `design/packages/ui/src/components/markers/SpatialPicker.vue`
- `design/packages/ui/src/components/markers/spatialSelection.ts`
- `design/packages/ui/src/components/mcserver/CommandBuilder.vue`
- [Marker studio](./marker-studio.md), [Discovered commands and bots](./bots-and-commands.md)
