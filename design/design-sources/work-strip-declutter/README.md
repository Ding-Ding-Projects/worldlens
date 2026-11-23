# Work strip, decluttered

Design boards for moving general-purpose tools out of the Work tab strip, made on 2026-11-23.

| Board | What it shows |
| --- | --- |
| `Strip.dc.html` | The Add a job catalogue grouped by purpose, with a Now / Before toggle against the old flat list of 29 jobs. |
| `Tools.dc.html` | The **Built-in tools** tab: a list of tools on the left, the picked tool on the right, and a button that opens the picked tool as its own tab. |
| `Other.dc.html` | The **Other tools** tab: Minecraft tools that are not about making, viewing or hosting a map (NBT editor, Convert). |

Every board has tweaks for theme (dark, light, high contrast) and, on the two hub boards, which tool is picked.

## What goes where

- **Stays in the strip** (map work): Make a map, Project canvas, Projects, GitHub runners, Renders, Structures, Maps and servers, Minecraft servers, Publish to Pages, Watch it live, Remote hosting, Docker hosting, Hosted instances, Backups, World repository, Get a world off a server, Screenshots, CoreProtect inspector.
- **Built-in tools**: Docs, File converter, Base64, Drawing board, Authenticator, Locks, Support Tickets, Browser downloads, Ollama, Virtual disks, and the Memory console in builds that have one.
- **Other tools**: NBT editor, Convert.

Minecraft servers stays in the strip because the Servers rail destination opens it and it is where a map's server lives.

## Rules the build follows

- Every tool keeps its command palette row and its old page id. Revealing an old id opens the hub with that tool picked.
- A workspace saved by an older build keeps any tool tab it already had open; nothing the user arranged is closed.
- The hub's tool list is a navigation list, not a second tab strip, so it carries no tab-strip contract of its own.
