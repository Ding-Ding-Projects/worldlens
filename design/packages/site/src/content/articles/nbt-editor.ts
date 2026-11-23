import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const nbtEditor: Article = {
    id: "nbt-editor",
    title: "NBT editor with a history for every project",
    summary:
        "Edit level.dat, player data, region chunks and any NBT file with typed controls, search, undo and redo, and a local Git history of every save that you can diff and restore.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "On the default branch and driven in the built application on 2026-11-23: a real level.dat was opened, a value changed, saved, and recorded as a new commit beside its baseline. LZ4 region chunks and Bedrock LevelDB worlds are not supported.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        { strong: "Readable by default. " },
                        "Known fields show their meaning (Spawn X, Game mode, Keep inventory on death), a plain type (Whole number, Yes or no, Time of day, Colour) and a readable value (Creative, 12:00, 6 min 2 s, Diamond Pickaxe). Each value gets a control that fits it: switches, selects by name, bounded steppers, sliders, a time-of-day slider, minutes and seconds for durations, and a colour picker for dye and potion colours. Game names shows the raw keys and types.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "Choose a world folder with the browse button or open any NBT file. The file list groups level.dat, player data, region files with their chunks, data files and structures.",
                        "Every tag type has a coloured chip and a typed control: numbers checked against their type's range, bytes that look like on and off shown as switches, strings, and a grid for arrays.",
                        "Search names and values with the adjacent regex builder, add, rename, duplicate, move and delete tags, copy and paste as SNBT, and undo or redo.",
                        "Save and record shows what changed, backs the file up, writes it, and records a commit in the project's own Git repository. History shows each version with Diff, Compare with now and Restore.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "Each project's history lives in the application's data folder, never inside the world. Backups before saving are on by default. Compression and byte order are detected and kept when the file is written.",
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
                        "A world that a running server has open is refused, and nothing is written.",
                        "A file that changed on disk after it was opened is refused instead of overwritten.",
                        "LZ4 chunks and external chunk files are listed and explained but cannot be opened.",
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
                        "Writes are atomic. A file opened and saved without changes is never rewritten. Restore is a new commit, so no earlier version is ever lost.",
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "Unit tests cover byte-exact round trips, every tag type, SNBT, semantic diffs and history against a real temporary repository. In the built application a real level.dat was edited and recorded. Not verified: the running-server check on platforms where the session lock is only advisory.",
                },
            ],
        },
    ],
    suggested: [
        { articleId: "backups", reason: "Whole-world backups beside the per-file history here." },
        {
            articleId: "world-reading",
            reason: "How Worldlens reads the same world files this editor changes.",
        },
    ],
    sources: [{ label: "docs/nbt-editor.md", href: repoFile("docs/nbt-editor.md") }],
};
