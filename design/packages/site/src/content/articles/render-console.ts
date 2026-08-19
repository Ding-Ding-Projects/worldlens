import type { Article } from "../types.js";
import { RENDER_CONSOLE_DOC_URL, repoFile } from "../links.js";

export const renderConsole: Article = {
    id: "render-console",
    title: "The render console",
    summary:
        "A bounded, searchable render log that keeps the first useful failure, says what it dropped, and does not yank a reader back to the bottom while the engine is still talking.",
    category: "application",
    status: "shipped",
    statusNote:
        "The console is mounted by the render screen on the default branch and is covered by component and model tests that run in the workspace gate.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Every line shows a written level beside its theme colour, so colour is helpful but never the only signal.",
                        "The view follows new output only when it was already at the bottom; a detached reader stays detached until Jump to latest is chosen.",
                        "The 10,000-line cap is visible through a dropped-line count, and advice can open the exact setting it names.",
                        "Copy and Markdown export preserve timestamps, levels and text from the visible selection.",
                        "The visible ring is not the history: every render stream is retained outside the component, restored after navigation, reattach and restart, and marked with an interruption annotation when a run stops early.",
                        "Complete and filtered export carries UTF-8 schema/version, render id, provenance, timestamps, levels, annotations and filter metadata in plain text, Markdown, JSON, JSONL, CSV, TSV and HTML.",
                    ],
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
                        { term: "cap", description: "10,000 lines by default; callers can lower or raise it for a bounded surface." },
                        { term: "height", description: "A responsive clamp keeps the console usable at narrow windows and large text scales." },
                        { term: "search", description: "The shared local field and adjacent regex builder; plain text is the default." },
                        { term: "retention", description: "An explicit, inspectable policy; the on-screen ring cap never deletes retained history by itself." },
                        { term: "privacy", description: "Local-only history with the existing console redaction policy applied before durable storage and export." },
                    ],
                },
            ],
        },
        {
            id: "queue-persistence",
            title: "Render-task queue persistence",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "The engine owns a versioned persistence schema; schema version 1 stores the server and CLI render-task queue durably.",
                        "The CLI uses the resolved core.data directory and stores the queue at core.data/tasks.dat.",
                        "After startup, queue state is reconciled after maps are available so pending work can be resumed without reviving terminal tasks.",
                        "Periodic and shutdown saves are coalesced. Each save uses a unique staging file and an atomic rename so readers see a complete file.",
                        "Console history appends recover the last complete record after torn writes, storage refusal, restart, reattach and interrupted renders; incomplete records are never presented as completed runs.",
                    ],
                },
            ],
        },
        {
            id: "retention-and-deletion",
            title: "Retention, pruning and deletion",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Retention is configured separately from the bounded visible ring and reports what automatic pruning removed.",
                        "Selection-aware copy/export and bulk export report their exact scope; bulk deletion is a separate action behind destructive confirmation.",
                        "Secrets and path-sensitive values are redacted before durable history or export, while the live console remains unchanged.",
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
                        "Dropped lines are reported rather than presented as if the visible slice were complete.",
                        "Invalid regex matches nothing, never everything.",
                        "A missing advice target is reported as unavailable instead of silently opening a nearby setting.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "Engine output is inserted as text, not HTML, so a log line cannot inject markup. Copy and export stay local, and regex evaluation uses the same bounded engine as the other settings searches.",
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
                        "The component and model suites cover selection, level labels, follow/detach behaviour, dropped-line accounting, advice navigation, reduced motion, copy/export and invalid patterns. Durable-history coverage includes partial writes, storage refusal, Unicode and zero-width regex, large retained logs, interrupted renders, restart/reattach restore, retention/pruning, redaction and destructive deletion confirmation; the packaged acceptance proof reopens a completed render and searches a line outside the visible ring. The source article is ",
                        { link: "docs/render-console.md", href: RENDER_CONSOLE_DOC_URL, external: true },
                        ".",
                    ],
                },
                {
                    kind: "code",
                    language: "text",
                    code: "pnpm exec vitest run packages/ui/src/components/console --silent",
                    caption: "Focused console verification",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "live-render-speed",
            reason: "The live priority, quota and throughput controls that sit beside this console.",
        },
        { articleId: "render-in-actions", reason: "The same progress model when a render runs in GitHub Actions." },
        { articleId: "viewer-remote-mode", reason: "How the finished map is served once rendering completes." },
        { articleId: "regex-builder-surfaces", reason: "The full builder behind the console's search field." },
        { articleId: "automatic-repair", reason: "What happens next when the run this console is watching fails to start." },
    ],
    sources: [
        { label: "RenderConsole.vue", href: repoFile("design/packages/ui/src/components/console/RenderConsole.vue") },
        { label: "consoleModel.ts", href: repoFile("design/packages/ui/src/components/console/consoleModel.ts") },
        { label: "Render console reference", href: RENDER_CONSOLE_DOC_URL },
    ],
};
