import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const shareHost: Article = {
    id: "share-host",
    title: "Host a finished map in one click",
    summary:
        "When a render finishes, Host the map runs it in a small container on this PC or on a saved SSH host and gives you a working network link with Open and Copy.",
    category: "delivery",
    status: "ported-unverified",
    statusNote:
        "Built and on the default branch. A real local Docker run passed end to end on 2026-11-23: bundled image loaded, map packed, container started, health and access code checked from this PC. Hosting on a real SSH host passed the same checks the same day, and the arm64 image served a map under emulation. Real arm64 hardware has not been run.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                { kind: "list", items: [
                        "A finished render shows three share cards beside Open the map. Host the map opens a guided dialog: where it runs (this PC or a saved SSH host), instance name, a port checked for being free, which maps to include, and switches for starting again with the computer, asking for an access code, and being reachable on the network.",
                        "Five steps report real progress: load the bundled map server image, pack the rendered map, copy it into a private volume, start the container, and check health and the network link.",
                        "The result is the reachable network address with Open and Copy. With an access code switched on, a viewer name and a generated code are shown once, with Copy code.",
                        "Every hosted map appears on the Hosted instances page with health checked from this PC, and Start, Stop, Restart, Update map and Remove.",
                    ] },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                { kind: "paragraph", content: "The map server image is a small static server on an empty root filesystem, built for amd64 and arm64 at build time and shipped inside the application, so hosting never downloads anything when you click. SSH hosts are the ones already saved in the server manager, trusted through the application's own known hosts file. When a personal wording file is loaded, the hosted page's own labels use that wording too; the mapping stays on this computer." },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                { kind: "list", items: [
                        "Docker missing or not running on the chosen machine is named before anything starts.",
                        "A port already in use is offered a free one; a failed step shows the exact command with secrets masked, its exit code and the last lines of output.",
                        "A link that does not answer from this PC is reported as not reachable rather than as ready.",
                    ] },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                { kind: "paragraph", content: "The container runs read-only with every capability dropped. The access code is stored only as a salted scrypt verifier. Only containers this application created and recorded are ever stopped or removed, and Remove names exactly what it deletes and asks for the instance name first. The map is meant for your own network; nothing is exposed to the internet by this feature." },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                { kind: "paragraph", content: "Unit tests cover the hosting plan, packing, port and health checks, the registry and the dialog. A live Docker test on Windows hosted a real map and confirmed 401 without the code and 200 with it. On 2026-11-23 an opt-in live test hosted a map on a real SSH Docker host: image streamed over SSH, map packed there, health and access code checked from this PC, instance removed. The arm64 image served a map under emulation. Not verified: real arm64 hardware, and reaching the link from a second computer." },
            ],
        },
    ],
    suggested: [
        { articleId: "appliance-image", reason: "The same map as a bootable appliance for VMware, VirtualBox, a USB stick or a manual install." },
        { articleId: "live-viewer", reason: "Host a live 3D view of the server with a bot instead of the rendered map." },
        { articleId: "managed-hosting", reason: "The heavier route with an administrator sign-in and HTTPS." },
    ],
    sources: [{ label: "docs/share-host.md", href: repoFile("docs/share-host.md") }],
};
