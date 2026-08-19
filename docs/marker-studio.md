# Marker studio

Markers you make yourself, on a map you rendered yourself.

## Issue #70 status — authoring is still partial

Issue #70 remains **open and unverified**. The current studio is a useful local POI editor,
not yet the requested first-class BlueMap marker authoring surface. Source currently covers
one local `StudioMarker` shape (`label`, `detail`, integer `x/y/z`, colour and visibility),
map-aware placement from the camera, local persistence, text/regex search, and bulk deletion
through the existing confirmation surface. The viewer bridge mirrors those POIs into one
namespaced `worldlens:studio` marker set.

The following issue requirements are **not** represented by the current source boundary:

- marker-set create/edit/duplicate/delete, including preservation of unknown fields and order;
- POI, line, shape, and extrude authoring against the real BlueMap schema;
- direct map placement and drawing for geometry beyond one camera-position POI;
- complete style, icon and label controls, preview-before-save, import/export, and VS Code handoff;
- local version-history records and undo/restore for every mutation;
- concurrent-file and collision handling, cross-dimension edit safeguards, and the full
  accessibility/localization/reduced-motion matrix;
- packaged-viewer proof and a real capture for each edited marker type.

This article therefore documents the currently shipped POI studio without treating it as
completion of Issue #70. No tests, packaged interaction, or captures are claimed by the
records-only update that added this status section.

Every marker this application could previously show came from somebody else: a BlueMap
marker file, or a live server's API. It filtered them, searched them and laid them over a
map, and offered no way to create one. A map of your own world opened on *"This marker set
has nothing in it"* with nothing underneath it that could put something in. That sentence
is the whole reason this exists.

## Yours, kept apart from the server's

Studio markers live in their own set and are never merged into one loaded from a file or a
server. That is not tidiness. A marker file is refetched and replaced wholesale, so a marker
of yours folded into it would vanish at the next poll with nothing to explain it. Kept
apart, they survive, and the interface can always answer "did I make this, or did the
server?" which is the question somebody asks the moment two markers disagree.

## Making one

The form opens at wherever the camera is, because that is what "add a marker" means when
you are looking at a place. Typing three coordinates read off another screen is the thing
this saves you.

| Field | Notes |
|---|---|
| Name | Required. A list of blanks is not a list. |
| X, Y, Z | Rounded to a block, so what is stored matches the F3 screen it came from |
| Note | Optional. Shown when the marker is opened. |
| Colour | Six hex digits. Functional data colour, not chrome. |

Validation reports **every** problem at once rather than one per submit, and a refusal keeps
the form open so nothing typed is lost to it. Y is bounded to what a world builds to; X and
Z are bounded only by the world border, because a far-out X is an ordinary coordinate rather
than a typo.

## Which map a marker belongs to

The map you were looking at when you made it. A marker made in the nether belongs to the
nether and does not appear over the overworld. The map id is read off the running viewer
rather than assumed, because a panel that guessed would file a marker somewhere it is never
seen again.

## Deleting

Bulk deletion goes through the two-key super-confirmation gate. These are markers you made
by hand and nothing here restores them, so the count preview alone was not enough.
Select-all covers what is currently **shown**, never reaching past an active filter: the
count previewed is the set acted on.

## When the store cannot be read

It says so, and it refuses to write. An unreadable read never renders as "you have no
markers", because that invites you to make them all again on top of the ones still sitting
there. Nothing has been overwritten, and the message says that too.

## Where they live

Local browser storage on this computer. No network request is made, and nothing is sent
anywhere.

## Verification

| Area | File |
|---|---|
| Validation, rounding, search text, viewer shape | `markerStudio.test.ts` |
| Store, persistence, fail-closed reads | same file |
| The surface, driven as a person drives it | `MarkerStudio.test.ts` |
| Markers reaching the actual map | `useStudioMarkerLayer.test.ts` |

The files above are source-level evidence that the current POI studio exists; they are not a
packaged-artifact verdict. Issue #70 stays open until the broader authoring implementation and
its focused runtime evidence are supplied.

## Suggested articles

- [Toy locks](toy-locks.md) - the same fail-closed storage discipline
- [Super confirmation](super-confirmation.md) - the gate in front of bulk deletion
- [Regex builder](regex-builder.md) - the search on the studio list
