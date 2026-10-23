import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const managedHosting: Article = {
    id: "managed-hosting",
    title: "Hosting a verified map with authentication",
    summary:
        "One provenance-verified render becomes an exported hosting context, then a container image you build, save or upload, behind a protected administrator sign-in.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The hosting registrar, protected access store, build-facts wiring and bridge inventory have focused proof on the integrated tree. No real Docker build, registry sign-in, deployment or packaged Windows flow has run, and deployment is an explicit unavailable state in this build.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                { kind: "list", items: [
                        "Export refuses any render whose workspace lacks a completed, provenance-verified output manifest. Source commit, runtime bundle hash and container base image come from the build, never from the renderer.",
                        "An exported context carries the map, the managed host runtime bundle, a health script and a generated Dockerfile, with a receipt over every file. Build, save, upload and deploy re-check the context against that receipt first.",
                        "Prepare access stores a salted memory-hard verifier and an opaque credential reference only. Prepared on this device, provisioned on the destination and sign-in verified stay three separate states.",
                        "Docker Hub sign-in uses the device flow. Only the one-time code and the fixed activation address reach the panel; CLI output is never shown or logged.",
                        "Deploy needs a configured HTTPS origin and trusted TLS files. This build has no settings surface for them, so deployment answers with that exact reason while every other operation keeps working.",
                    ] },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                { kind: "paragraph", content: "Inputs are resolved in the main process: the build's recorded 40-character source commit, dist/managed-host.mjs hashed on first use, and node:22-slim pinned to the manifest-list digest read from Docker Hub on 2026-10-23. Access verifiers live under managed-hosting/access in the app data folder, encrypted with the operating-system safe storage." },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                { kind: "list", items: [
                        "A development build without a recorded source commit cannot export, and the message says so.",
                        "A context not exported through this workflow, or whose files no longer match the receipt, is refused by every later operation.",
                        "Registry sign-in requires a native Docker credential store and expires after ten minutes without confirmation.",
                        "Upload accepts only a confirmed Docker Hub destination.",
                        "Deployment to any target is unavailable until a hosting origin and TLS files can be configured.",
                    ] },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                { kind: "paragraph", content: "Account preparation is consumed over standard input only. Container deployment, when configurable, runs read-only with all capabilities dropped and no-new-privileges. Reachability and health are never reported as authentication, and every hosting request must come from the application's own main frame." },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                { kind: "paragraph", content: "On the integrated tree the hosting registrar, protected access, build-facts and bridge inventory tests pass and the app and bridge packages typecheck. Not verified here: a real Docker build, save, upload or sign-in, any deployment, LAN reachability, and the packaged Windows application." },
            ],
        },
    ],
    suggested: [
        {
            articleId: "hosted-mode",
            reason: "The same authenticated viewer, served from the container image CI publishes rather than from an export of one render.",
        },
        {
            articleId: "container-image",
            reason: "Where the published image comes from, and why an exported context pins its own base image instead.",
        },
        {
            articleId: "render-identity",
            reason: "The render identities and verification a context is exported from.",
        },
    ],
    sources: [
        {
            label: "docs/managed-hosting.md",
            href: repoFile("docs/managed-hosting.md"),
        },
        {
            label: "packages/app/src/main/managedHosting/register.ts",
            href: repoFile("design/packages/app/src/main/managedHosting/register.ts"),
        },
        {
            label: "packages/app/src/main/managedHosting/wiring.ts",
            href: repoFile("design/packages/app/src/main/managedHosting/wiring.ts"),
        },
    ],
};
