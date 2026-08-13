# Structures

The structure files a world already holds, and a render of each one.

A world saved with structure blocks carries its own `.nbt` files under
`generated/<namespace>/structures`, and older worlds keep them in `structures/`. Nothing in
this application had ever looked at them.

## Finding them

The main process scans the world folder on demand. A missing folder is "none found" rather
than an error, because a world with no structure blocks is an ordinary world.

They are listed grouped by the namespace that owns them, so `minecraft:` and a datapack's
own structures do not read as one undifferentiated pile.

## Rendering one

Each structure gets its own render, reusing the render pipeline a world render already goes
through rather than a second renderer written beside it. A finished render becomes a row in
a searchable **Rendered structures** list, which is the part that stops a render being a
thing you did once and cannot find again.

A row in that list means the tiles exist. On a build with no renderer wired up, pressing
Render records **nothing**: a row written there would claim tiles that are not on disk,
which is the one thing this list must never do.

## Dropping a file in

A `.nbt`, `.schem`, `.schematic` or `.litematic` file dropped onto the Structures page is
parsed, wrapped in the smallest real world that can hold it, and rendered through the same
pipeline. Every accepted and rejected file is named with its reason: dropping five files
where three are not structures reports two accepted and three refused, because silently
rendering the two it liked is how you conclude the other three worked.

There is a **Choose a file** button beside the drop zone. A drop-only feature is unreachable
by keyboard and by anybody whose pointer cannot drag.

## Deleting a rendered structure

Behind the two-key gate. Deleting the record removes the only route this application keeps
back to those tiles, which is the same loss a saved map entry is gated for. The source
`.nbt` on disk is never touched, and the gate says so.

## When the store cannot be read

It reports the failure and refuses to write over what it could not read. It never answers an
unreadable read with an empty list.

## Verification

| Area | File |
|---|---|
| Name and id derivation, grouping, search | `structureModel.test.ts` |
| The surface, both empty states, bulk scope | `StructureList.test.ts` |
| Drop classification and refusal messages | `dropModel.test.ts` |
| The drop zone, drag state, keyboard route | `DropRenderZone.test.ts` |

## Suggested articles

- [Render in Actions](render-in-actions.md) - rendering a whole world elsewhere
- [Super confirmation](super-confirmation.md) - the gate on deleting a render record
