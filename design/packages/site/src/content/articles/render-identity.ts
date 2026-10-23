import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const renderIdentity: Article = {
    id: "render-identity",
    title: "Render identity and workspace leases",
    summary:
        "Run id, project id and effective map id kept distinct, upstream map-id normalisation resolved before any write, and a per-render workspace lease so two processes never write one render.",
    category: "engine",
    status: "ported-unverified",
    statusNote:
        "Map identity, workspace lease and promotion logic have focused proof on the integrated tree under the lane's own vitest configuration. A packaged render against a real world and a recovery applied to a real legacy workspace remain unverified.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                { kind: "list", items: [
                        "The Java engine normalises map ids as upstream BlueMap's sanitiseMapId does; the orchestrator resolves that once before any configuration or session is written.",
                        "Two maps whose ids collide at the engine's output id are refused with the colliding id named, instead of the second overwriting the first.",
                        "A workspace lease file naming lease id, owning process and render id is acquired before a render starts; a second start for the same render fails as already running.",
                        "Recovery of an older workspace is read-only, derives identities only from matching source configuration and never adopts them from output.",
                    ] },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                { kind: "paragraph", content: "Nothing to configure. Lease files are named .render-workspace-<render id>.lock inside the render storage directory and are at most 4 KiB." },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                { kind: "list", items: [
                        "Colliding effective map ids are refused before work starts.",
                        "A lease file that is a symbolic link, oversized, malformed or from an older format is reported as unavailable and left for manual diagnosis.",
                        "A release whose lease id no longer matches the file stops, because the file now belongs to someone else.",
                    ] },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                { kind: "paragraph", content: "Links anywhere inside a retained workspace, including parent directories, are rejected during recovery. Identity is never read from output a previous process produced, so a tampered output folder cannot rename a map." },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                { kind: "paragraph", content: "On the integrated tree the map identity, workspace lease and promotion tests pass under the lane's own vitest configuration and the app package typechecks. Not verified here: a packaged render against a real world and a recovery proposal applied to a real legacy workspace." },
            ],
        },
    ],
    suggested: [
        {
            articleId: "java-render-path",
            reason: "The engine whose map-id normalisation this resolves ahead of time.",
        },
        {
            articleId: "managed-hosting",
            reason: "What a verified render with a stable identity can be exported into.",
        },
        {
            articleId: "render-engine-choice",
            reason: "Where a project picks the engine whose output id rules apply.",
        },
    ],
    sources: [
        {
            label: "docs/render-identity.md",
            href: repoFile("docs/render-identity.md"),
        },
        {
            label: "packages/app/src/main/render/mapIdentity.ts",
            href: repoFile("design/packages/app/src/main/render/mapIdentity.ts"),
        },
        {
            label: "packages/app/src/main/render/workspaceLease.ts",
            href: repoFile("design/packages/app/src/main/render/workspaceLease.ts"),
        },
    ],
};
