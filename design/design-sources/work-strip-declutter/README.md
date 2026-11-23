# Work strip, decluttered

Design boards for moving general-purpose tools out of the Work tab strip, made on 2026-11-23.

| Board           | What it shows                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Strip.dc.html` | The Add a job catalogue grouped by purpose, with a Now / Before toggle against the old flat list of 29 jobs.                          |
| `Tools.dc.html` | The **Built-in tools** tab: a list of tools on the left and the picked tool beside it.                                                |

Every board has tweaks for theme (dark, light, high contrast) and, on the two hub boards, which tool is picked.

## What goes where

- **Stays in the strip**, grouped by BlueMap workflow: Worlds (Get a world off a server, Convert, NBT editor, Structures, CoreProtect inspector), Rendering (Projects, GitHub runners, Renders), Finished maps (Maps and servers, Minecraft servers, Publish to Pages, Watch it live, Remote hosting, Docker hosting, Hosted instances, Screenshots), Keeping a copy (Backups, World repository). Make a map and Project canvas stay loose.
- **Built-in tools**: Docs, File converter, Base64, Drawing board, Authenticator, Locks, Support Tickets, Browser downloads, Ollama, Virtual disks, and the Memory console in builds that have one.

Minecraft servers stays in the strip because the Servers rail destination opens it and it is where a map's server lives.

## Rules the build follows

- Every tool keeps its command palette row and its old page id. Revealing an old id opens the hub with that tool picked.
- A workspace saved by an older build is folded once: the first tab that showed a hub's tool becomes the hub, in the same place, group and pin; other tool tabs of that hub close; the hub opens on whichever tool was in front.
- The hub's tool list is a navigation list, not a second tab strip, so it carries no tab-strip contract of its own.
