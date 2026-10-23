import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const serverConfigurationEditor: Article = {
    id: "server-configuration-editor",
    title: "Server configuration editor",
    summary:
        "Every configuration file of a managed server described as typed fields and edited with real controls, applied only against the exact file version the change was made from.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "Describe, discover and apply have focused proof and the discover channel is registered in the main process and the bridge allowlist on the integrated tree. Editing a real Paper or Purpur server and the packaged Windows application remain unverified.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                { kind: "list", items: [
                        "Properties, YAML, JSON and TOML files are parsed into a tree; each leaf renders by its actual type as a switch, number, text, selector, nested object, list or record table.",
                        "Unknown fields and comments survive a save, and null, booleans and numbers keep their distinction.",
                        "Discover walks the server folder to a bounded depth and entry count without following symbolic links; when unavailable, the editor keeps its known files and says so.",
                        "Record tables cover ops.json, whitelist.json, banned-players.json and banned-ips.json with typed columns.",
                        "Apply sends the expected file hash; a changed file returns a stale-document conflict and keeps the draft. Reset resets the draft, never a live server.",
                    ] },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                { kind: "paragraph", content: "Describe, discover and apply use the same server transport the rest of server management uses, so SSH and container servers are edited the same way. Discovery limits default to depth 8 and 10,000 entries and are not adjustable from the renderer." },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                { kind: "list", items: [
                        "A path that is not a plain relative file name is refused before the transport is touched.",
                        "An unparseable file is reported as not describable with the original unchanged.",
                        "A change without the expected hash is refused.",
                        "Discovery that reaches its bounds reports truncated rather than complete.",
                    ] },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                { kind: "paragraph", content: "All reads and writes pass through the server's transport with the capabilities its record allows; adopted servers keep exactly what their owner consented to. Traversal and absolute paths are rejected, and nothing edits a file outside the server folder." },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                { kind: "paragraph", content: "On the integrated tree the discovery and JSON parsing tests, the server-management IPC wiring tests and the editor UI tests pass. Not verified here: a real Paper or Purpur server and the packaged Windows application." },
            ],
        },
    ],
    suggested: [
        {
            articleId: "mcserver-hosting",
            reason: "The servers whose files this editor describes and applies.",
        },
        {
            articleId: "config-rich-controls",
            reason: "The twelve-kind control renderer the typed fields reuse.",
        },
        {
            articleId: "server-generation",
            reason: "Where a freshly generated server arrives before its files are edited here.",
        },
    ],
    sources: [
        {
            label: "docs/server-configuration-editor.md",
            href: repoFile("docs/server-configuration-editor.md"),
        },
        {
            label: "packages/app/src/main/mcserver/config/describe.ts",
            href: repoFile("design/packages/app/src/main/mcserver/config/describe.ts"),
        },
        {
            label: "packages/ui/src/components/mcserver/ServerConfigEditor.vue",
            href: repoFile("design/packages/ui/src/components/mcserver/ServerConfigEditor.vue"),
        },
    ],
};
