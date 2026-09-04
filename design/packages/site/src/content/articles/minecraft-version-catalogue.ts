import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const minecraftVersionCatalogue: Article = {
    id: "minecraft-version-catalogue",
    title: "The complete Minecraft version catalogue",
    summary:
        "A paginated Mojang-backed catalogue that keeps every release and snapshot, groups exact rows into families, and remains useful with a stale cache.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "Complete release and snapshot retention, family grouping, pagination, cache validation and Wiki links have focused proof. The final integrated packaged wizard capture remains pending.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "The wizard reads Mojang's canonical manifest through the main process and keeps every release and snapshot entry.",
                        "Exact rows are grouped into collapsible stability and family sections, with counts derived from the rows rather than typed into labels.",
                        "The renderer shows 500 rows per page while search and cache retain the complete catalogue.",
                        "Rows without a published server download remain visible and disabled with the exact reason and a Wiki link built from the version name.",
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
                            term: "Catalogue revision",
                            description:
                                "The fetched timestamp and digest identifying the raw canonical manifest used for the cached rows.",
                        },
                        {
                            term: "Family",
                            description:
                                "A collapsible group of exact version rows such as a release line or snapshot week.",
                        },
                        {
                            term: "Stale cache",
                            description:
                                "A last valid catalogue retained for offline use while the newest refresh is unavailable or incomplete.",
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
                        "Malformed records, duplicate identifiers, invalid timestamps and unsafe URLs are rejected before rendering.",
                        "An expired refresh can fail without erasing the last valid rows, and one flavour can report its own failure without making other flavours look fresh.",
                        "A large catalogue is paginated instead of mounting thousands of controls at once.",
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
                        "Only validated HTTPS URLs from the canonical manifest are stored. Cache reads validate schema, timestamps, duplicates and digests before data reaches the UI, and the catalogue does not execute or download a server until the separate wizard flow asks for it.",
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
                    title: "Packaged wizard proof remains pending",
                    content:
                        "Focused catalogue tests cover all-row retention, pagination, grouping, cache and offline behavior. The built Windows wizard interaction and capture are pending in the integrated smoke matrix.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "mcserver-hosting",
            reason: "The server wizard consumes these version rows before starting a server.",
        },
        {
            articleId: "world-reading",
            reason: "World decoding uses version identity and format boundaries.",
        },
        {
            articleId: "release-downloads",
            reason: "The release surface explains how versioned downloads are verified.",
        },
    ],
    sources: [
        {
            label: "docs/minecraft-version-catalogue.md",
            href: repoFile("docs/minecraft-version-catalogue.md"),
        },
        {
            label: "packages/app/src/main/mcserver/catalogue.ts",
            href: repoFile("design/packages/app/src/main/mcserver/catalogue.ts"),
        },
        {
            label: "packages/ui/src/components/mcserver/VersionCatalogue.vue",
            href: repoFile("design/packages/ui/src/components/mcserver/VersionCatalogue.vue"),
        },
    ],
};
