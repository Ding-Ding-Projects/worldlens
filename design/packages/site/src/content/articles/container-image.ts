import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const containerImage: Article = {
    id: "container-image",
    title: "The container image",
    summary:
        "Published to the registry on every push, for both architectures, with build-time assertions that stop a broken image being published.",
    category: "delivery",
    status: "shipped",
    statusNote:
        "Building and publishing are on the default branch, and a real multi-architecture manifest has been pushed and inspected. Two images are built from this repository and they serve different things.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Two images are built here and they do different things. One renders worlds and ",
                        "serves the map viewer: a map, and nothing else. The other serves the application ",
                        "itself. Picking the wrong one is easy, which is why the difference is stated ",
                        "wherever either is mentioned.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Both architectures are published, because the machines these get deployed to are ",
                        "mixed. The expensive half of the build - installing dependencies and compiling - ",
                        "is pinned to the builder's own architecture, because the dependency graph contains ",
                        "no native modules and its output is therefore architecture-independent JavaScript.",
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
                        "The image is built from the repository root, because it needs both the package workspace and the vendored webapp source. Two folders are declared as volumes: one for the configuration and one for the world. The working directory at run time is the data directory, and that is the one sharp edge worth knowing, because a relative path in a mounted map configuration resolves against it rather than against the configuration folder.",
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
                        "That optimisation is only safe while the graph stays free of native modules, so ",
                        "the runtime stage carries one assertion only the target architecture can make: it ",
                        "runs the entry script on that platform's own Node. That turns the day it stops ",
                        "being true into a build failure rather than a published image that dies on first ",
                        "run.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The image could not be built from a clean checkout at all until recently. The ",
                        "vendored webapp's built output is ignored upstream - it is a build output, not ",
                        "tracked content - so copying it in only ever succeeded on a machine that had ",
                        "already built it. Every local verification was really a build against a warm tree, ",
                        "which is exactly why nothing in CI had tried. The webapp is now built inside the ",
                        "image, and its prebuilt copy is excluded from the build context outright, so a warm ",
                        "machine and a clean checkout produce the same image.",
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
                        "The registry login uses the workflow's own token rather than the shared ",
                        "release-token chain every other job uses. That chain exists so API calls can fall ",
                        "back to a broader token; one that can publish a release does not thereby carry ",
                        "permission to publish packages, and reaching for a wider long-lived credential to ",
                        "fix a scope error trades a correct narrow token for a wrong wide one.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A pull request builds and stops. It never logs in and never pushes, in two ",
                        "separate steps rather than one conditional, so that path cannot reach a registry ",
                        "even if a condition were mis-edited later. The floating tag moves only on a push ",
                        "to the default branch.",
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
                        "Every run publishes a version tag and a commit tag, and records the digest in its ",
                        "own summary. The digest is the reference that matters: both this project's ",
                        "container manager and its sibling deployment application refuse an image that is ",
                        "not pinned to a digest, so a floating tag is not a usable answer to the question of ",
                        "which image a run produced.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The published manifest was inspected afterwards and carries both architectures.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "hosted-mode",
            reason: "The other image built here, and what makes it a separate artifact rather than a flag.",
        },
        {
            articleId: "install",
            reason: "Installing on your own computer instead of running a container.",
        },
    ],
    sources: [
        { label: "design/packages/cli/Dockerfile", href: repoFile("design/packages/cli/Dockerfile") },
        { label: "docs/container-image.md", href: repoFile("docs/container-image.md") },
        { label: ".github/workflows/ci.yml", href: repoFile(".github/workflows/ci.yml") },
    ],
};
