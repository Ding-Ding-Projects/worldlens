import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const serverGeneration: Article = {
    id: "server-generation",
    title: "Generating a world and project from a server",
    summary:
        "Generate and start project creates a local Java server, lets it generate a world, inspects the real folder and writes a durable project, through one main-process coordinator the dialog only observes.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The coordinator, registrar, capability and protected-field logic have focused proof on the integrated tree and the registrar is wired into the main entry. No generation against a downloaded server jar and no packaged Windows dialog has run yet.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                { kind: "list", items: [
                        "The dialog collects name, edition and flavour, catalogue version, seed kept as text, world name, memory, port, download consent and explicit EULA acceptance, then sends one request with an operation id.",
                        "Stages are named: creating the server, generating, inspecting, creating the project, complete; interrupted, failed and cancelled are separate terminal stages with a message.",
                        "Progress is pushed to the window that started the operation, and a reopened dialog reads the saved operation back. The same operation id is idempotent and never starts a second server.",
                        "Capability descriptors come from the server's own data-generator report, each with type, default, bounds and an availability reason; the dialog renders only what the server declares.",
                        "Cancel requests a safe stop and reports what already happened. It never claims rollback because the dialog closed.",
                    ] },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                { kind: "paragraph", content: "Operation records live under generation-operations and acquired reports under generation-reports in the app data folder. Generated projects are written beside the world with the id generated-<operation id> and the server id recorded. Protected keys such as the RCON password, management secret, level name and port are never accepted from the request." },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                { kind: "list", items: [
                        "Unknown fields, invalid ids, protected properties and oversized payloads are refused before any server exists.",
                        "A failure inside the operation keeps the retained server and operation records for recovery and says so.",
                        "A different project already in the generated folder stops project creation with destination-exists and offers a retry against the verified output.",
                        "A flavour or version without a data-generator report leaves the capability list empty rather than invented.",
                    ] },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                { kind: "paragraph", content: "Only the application's own main frame may invoke the generation channels. The renderer never supplies file-system roots, service functions or registry records, and nothing here accepts the EULA on a person's behalf." },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                { kind: "paragraph", content: "On the integrated tree the generation registrar, coordinator, capability, protected-field, console-command and inventory tests pass under the lane's own vitest configuration and the app package typechecks. Not verified here: an actual generation run, Bedrock or non-vanilla inventories, and the packaged Windows dialog." },
            ],
        },
    ],
    suggested: [
        {
            articleId: "mcserver-hosting",
            reason: "The server creation path this coordinator reuses for its first stage.",
        },
        {
            articleId: "server-configuration-editor",
            reason: "Where the generated server's files are edited afterwards with typed controls.",
        },
        {
            articleId: "minecraft-version-catalogue",
            reason: "The version rows the dialog's version selector is built from.",
        },
    ],
    sources: [
        {
            label: "docs/server-generation.md",
            href: repoFile("docs/server-generation.md"),
        },
        {
            label: "packages/app/src/main/mcserver/generation/coordinator.ts",
            href: repoFile("design/packages/app/src/main/mcserver/generation/coordinator.ts"),
        },
        {
            label: "packages/app/src/main/mcserver/generation/register.ts",
            href: repoFile("design/packages/app/src/main/mcserver/generation/register.ts"),
        },
    ],
};
