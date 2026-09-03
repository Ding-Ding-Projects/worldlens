import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const localModelTooling: Article = {
    id: "local-model-tooling",
    title: "Managing local model tooling",
    summary:
        "A local model workspace for runtime health, exhaustive catalogue refresh, conservative hardware-fit evidence, batch pulls, chat sessions and allowlisted harnesses.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The local model client, catalogue, fit assessment, chat surface and allowlisted harness records are implemented with focused proof. Live runtime and packaged Windows interaction evidence remain pending and are named here rather than implied.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "The workspace checks the local runtime, lists installed models, refreshes the complete official catalogue and reconciles both sets without hiding either one.",
                        "Each variant receives a conservative Runs well, Runs with limits, Unlikely or Unknown assessment backed by hardware, storage and model evidence.",
                        "The cart schedules local pulls only. It reports exact tags, sizes, disk estimates, bounded parallelism, cancellation, retry and partial outcomes.",
                        "Chat supports streamed local responses, parameters, retry, cancellation, multiple sessions, redacted export and capability-aware attachments.",
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
                            term: "Verified refresh",
                            description:
                                "A paginated catalogue read with a recorded revision or response identity, timestamp, page count and completeness result.",
                        },
                        {
                            term: "Fit evidence",
                            description:
                                "The measured RAM, GPU, usable VRAM, disk, architecture and exact model facts used to derive a variant's verdict.",
                        },
                        {
                            term: "Harness profile",
                            description:
                                "An allowlisted local launch description with selected executable, arguments, directory and redacted environment keys.",
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
                        "A missing, stopped, unhealthy or offline runtime keeps local records and bundled help available while naming the exact recovery path.",
                        "A stale or incomplete catalogue never becomes a fresh success claim. Offline mode shows the last verified catalogue and current installed state.",
                        "A failed pull, invalid response, incompatible model or failed harness health check remains a distinct outcome and triggers rollback where a profile mutation was attempted.",
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
                        "Runtime calls are restricted to the documented local API, response bodies are bounded and validated, chat data stays local, and harness launches accept only registered executable and argument shapes. Secrets and private paths are excluded from logs, exports, captures and public records.",
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
                    title: "Service and packaged evidence remain pending",
                    content:
                        "Fixture-backed API, catalogue, fit, harness and UI tests cover the declared shapes. A live local runtime, packaged Windows smoke path and final capture remain pending in the integrated candidate.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "file-converter",
            reason: "The local converter shares the bundled-first offline adapter boundary.",
        },
        {
            articleId: "runtime-settings",
            reason: "Runtime settings document the shared local settings, history and accommodation surfaces.",
        },
        {
            articleId: "release-pipeline",
            reason: "Release construction and evidence are documented separately from local model operation.",
        },
    ],
    sources: [
        { label: "docs/ollama.md", href: repoFile("docs/ollama.md") },
        {
            label: "docs/contracts/file-converter-ollama-completeness.md",
            href: repoFile("docs/contracts/file-converter-ollama-completeness.md"),
        },
        {
            label: "packages/app/src/main/ollama/client.ts",
            href: repoFile("design/packages/app/src/main/ollama/client.ts"),
        },
    ],
};
