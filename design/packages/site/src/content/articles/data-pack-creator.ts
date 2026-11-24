import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const dataPackCreator: Article = {
    id: "data-pack-creator",
    title: "Data pack creator",
    summary:
        "Make or open a Java Edition data pack: recipes on a crafting grid, functions, tags, advancements, loot tables, predicates, biomes, every other registry as checked JSON, and version overlays, checked for the chosen version and saved as a .zip.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "On the default branch with unit and component tests on 2026-11-23. Not yet driven in the packaged application, and exported packs have not yet been loaded in a running game.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Pick the game version first. It sets the pack format (26.1 reads 101.1, 1.21.11 reads 94.1, back to 1.20.5 at 41), the folder names (singular from 1.21) and how ingredients are written (plain ids from 1.21.2).",
                        "Recipes: crafting (shaped or any order) on a 3 by 3 grid you paint with a brush item, furnace, blast furnace, smoker and campfire with cooking time and experience sliders, stonecutter, and smithing table.",
                        "Functions: commands one per line, each checked as you type, with the command builder to add lines and switches to run on load or every tick.",
                        "Tags for items or blocks, advancements with icon, frame, trigger item, parent and rewards, and loot tables with picks per open, weights and count ranges.",
                        "Predicates snapped together as blocks, and biomes with climate, colours, spawns and a climate graph of every biome in the pack.",
                        "More parts covers every other registry a pack can add to: item modifiers, enchantments, damage types, armour trims, banner patterns, paintings, chat types, jukebox songs, goat horns, dimensions, noise settings, density functions, features, structures, structure sets, jigsaw pools, processor lists and cave carvers. Each starts from a small file the game reads and is edited as JSON, checked as you type.",
                        "Version overlays let one pack carry files for other versions, written into pack.mcmeta in the style the chosen version reads.",
                        "Open a pack (.zip) reads an existing pack: functions and tags open in their editors, every other registry file opens under More parts, and anything else is kept and written back unchanged. A search over every part and file name sits above the list, with the regex builder beside it.",
                        "Check and export lists every problem by place. Save as .zip is enabled once there are none; put the file in the world's datapacks folder and run /reload.",
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
                    content: [
                        "Pack info sets the namespace used in every id (for example my_pack:tick) and the description shown in the game's pack list. Every other choice is a typed control: version and recipe type selects, item pickers that also accept a #tag or an id from a mod, sliders for cooking time, experience, weights and counts, and switches for load, tick, announce and hidden.",
                    ],
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The draft lives in this profile's browser storage until it is exported or cleared; if storage is blocked the editor still works but the draft is not kept. The command check knows the first word of each command, not every argument, so a line can pass here and still be rejected by the game. A part's JSON is checked for being JSON, not against the game's schema, so the game may still reject a field. Visual editors for the parts under More parts, arranging advancements by dragging, and saving straight into a world or an appliance are not built yet.",
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
                    content: [
                        "Nothing leaves the computer: files are built in memory and written as a plain .zip with relative paths only, so it cannot extract outside its folder. Functions run with full operator rights once the pack is enabled, so only add packs you have read.",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Unit tests cover registry part templates, folders and reopening, overlays in both styles, pack.mcmeta for both format styles, shaped pattern trimming, ingredient shapes before and after 1.21.2, folder names before and after 1.21, the checks, CRC-32 and the archive layout. Component tests cover painting the grid, the problem list, keeping the draft and adding functions.",
                    ],
                },
            ],
        },
    ],
    suggested: [
        { articleId: "nbt-editor", reason: "Edit the world files a data pack works on." },
        {
            articleId: "server-configuration-editor",
            reason: "Turn a pack on for a managed server.",
        },
    ],
    sources: [{ label: "docs/data-pack-creator.md", href: repoFile("docs/data-pack-creator.md") }],
};
