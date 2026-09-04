import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const fileConverter: Article = {
    id: "file-converter",
    title: "Converting files locally",
    summary:
        "A bundled-first converter that detects formats from bytes, keeps every adapter visible, processes bounded queues, and validates outputs before offering them.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The converter registry, queue, PDF operations, renderer surface and focused tests are present on the integration candidate. A packaged Windows interaction and capture remain pending, so this article does not claim installer proof.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "The source is selected through a guided file picker and identified from bounded byte signatures rather than its extension.",
                        "The catalogue keeps Documents/PDF, Images, Audio, Video, Archives, Structured Data/Spreadsheets, Code/Text and Binary Encodings visible. Missing adapters stay disabled with their exact reason.",
                        "A durable queue supports pause, resume, cancellation, restart recovery, bounded concurrency and per-file converted, skipped, cancelled or failed results.",
                        "PDF operations include inspect, split, merge, extract, reorder, rotate and metadata. Outputs are reopened and checked before they replace a destination.",
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
                        {
                            term: "Enabled adapter",
                            description:
                                "An adapter with a bundled, verified implementation in the installed application.",
                        },
                        {
                            term: "Unavailable adapter",
                            description:
                                "A known format that remains listed but cannot run because its bundled proof or capability is absent.",
                        },
                        {
                            term: "Lossy conversion",
                            description:
                                "A conversion that may change transparency, metadata, encoding, precision or other declared fields and therefore requires an explicit user action.",
                        },
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
                        "Malformed, encrypted-without-access, unsupported or limit-exceeding input stays untouched and reports the specific boundary.",
                        "A missing bundled adapter is never enabled because a developer machine happens to expose a matching command on PATH.",
                        "An invalid output, failed reopen, cancellation or storage-capacity refusal records its own result and never turns a partial queue green.",
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
                        "Conversion runs locally through bounded adapters with no ambient network requirement. Inputs and outputs are size-limited, temporary writes are isolated and validated, source files remain unchanged, and file paths, content and private metadata are not sent to logs or external services.",
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Packaged proof remains pending",
                    content:
                        "Focused registry, queue and operation tests cover the source contracts. The full built-artifact converter flow, including narrow layout and packaged adapter reachability, remains pending in the UI smoke matrix.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "local-model-tooling",
            reason: "The neighbouring local tooling surface uses the same bundled-first and offline boundaries.",
        },
        {
            articleId: "regex-builder-surfaces",
            reason: "The converter catalogue and its menus use the same search and regex-builder contract.",
        },
        {
            articleId: "release-downloads",
            reason: "The release article explains how packaged outputs are presented and verified.",
        },
    ],
    sources: [
        { label: "docs/file-converter.md", href: repoFile("docs/file-converter.md") },
        {
            label: "docs/contracts/file-converter-ollama-completeness.md",
            href: repoFile("docs/contracts/file-converter-ollama-completeness.md"),
        },
        {
            label: "packages/app/src/main/converter/registry.ts",
            href: repoFile("design/packages/app/src/main/converter/registry.ts"),
        },
    ],
};
