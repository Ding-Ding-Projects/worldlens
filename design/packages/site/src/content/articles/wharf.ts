import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const wharf: Article = {
    id: "wharf",
    title: "Wharf, the deployment application",
    summary:
        "A second desktop application that puts a container image on a machine, locally or over SSH, with a browsed folder picker instead of a path field.",
    category: "delivery",
    status: "ported-unverified",
    statusNote:
        "The deployment path, the ownership boundary, the folder refusals and the Windows handling are on the default branch with tests, and the application has been launched and photographed. The installer, the lifecycle surfaces and this repository's universal feature contracts are not built yet.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "It deploys a container image to a machine. That is the whole scope: not a Docker ",
                        "client, not a way to inspect somebody else's containers, not a shell.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Those exclusions are the design rather than missing features. Every destructive ",
                        "operation works only on containers carrying its own ownership labels, so the set of ",
                        "things it can break is exactly the set of things it made. A tool that can stop any ",
                        "container on the host is one that will eventually stop the wrong one, and once it ",
                        "can, every other safeguard becomes a matter of the interface being careful.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The flow is: choose a machine, choose an image, choose the folder, see the plan, ",
                        "deploy. The plan is not a preview somebody may skip - the deploy control stays ",
                        "disabled until one has been shown, and the plan is how it becomes usable.",
                    ],
                },
            ],
        },
        {
            id: "main-folder",
            title: "The main folder",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The control worth arguing about. Choosing the folder an application will use is ",
                        "the most dangerous thing a deployment tool offers, and it does not look dangerous: ",
                        "a free-text field accepting a host path is how a graphical tool produces a bind ",
                        "mount of the entire filesystem, and the person who typed it was filling in a box.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "So there is no text field. A path becomes a mount only by being browsed to in the ",
                        "platform's own file picker, checked against the refusal list for that host's own ",
                        "platform, and confirmed with both sides written out. \"Use this folder\" is not a ",
                        "confirmation; naming the host path, the container path and the access is.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The container side is checked too, and that one is nastier. Mounting over a system ",
                        "directory does not fail loudly: the container starts and then behaves inexplicably, ",
                        "because the image's own files at that path have been replaced.",
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
                        "Nothing is configured in a file. Hosts, images and folders are chosen in the interface, and the record of what has been deployed lives beside the application data.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Connections use the system SSH client and the user own known-hosts file, not a private store this application invents. A host somebody has already verified in a terminal is therefore already known here, because being asked to trust a key twice teaches people to click through the question.",
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
                        "A floating tag is refused, and the refusal says why it matters rather than stating ",
                        "a rule: a tag can be moved under you, so what was deployed and what was reviewed ",
                        "would not have to be the same thing.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Every problem is reported rather than the first, because somebody correcting a ",
                        "form wants to see all of it. The plan is re-checked at deploy rather than trusted ",
                        "from the interface, so a caller that showed one plan and sent another cannot deploy ",
                        "the second under the first's confirmation.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A port that is not answering is reported as not answering. Creating a container is ",
                        "not running it, and running it is not listening, so a deployment with a port says ",
                        "whether that port is answering rather than only that something was deployed.",
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
                        "Its containers carry its own ownership labels, never another application labels. Sharing a namespace would mean each application listing the other containers, offering to stop them, and being right to by its own labels.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The bridge between the interface and the process that does the work is five channels, and none of them accepts a path the interface composed. Images must be pinned to a digest, enforced in the process rather than by the form. Connections are public-key only, a changed host key stops the connection rather than being accepted, and no operation accepts a raw container identifier: only ones returned from the ownership-filtered listing.",
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
                        "The ownership boundary is pinned by a test that spells both literals out rather than reading them from the constant it checks, and it has been watched fail in both directions that matter. The folder refusals are tested from both sides, because a list that refused an ordinary home directory would be one people work around rather than one they trust.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The application was launched on an off-screen desktop and photographed, which is how the capture in the gallery was taken.",
                    ],
                },
            ],
        },
        {
            id: "windows",
            title: "Windows hosts",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Detected rather than assumed, because three things differ there and each fails in ",
                        "a way that does not look like an operating-system problem. Quoting has no complete ",
                        "answer when the login shell may be either of two that disagree about it. The POSIX ",
                        "port probe reads a path that does not exist on Windows, so a service that started ",
                        "perfectly reports as not listening and the deployment rolls back a container that ",
                        "worked. And a refused-directories list written for the wrong platform is not a ",
                        "weaker guard but an absent one.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "hosted-mode",
            reason: "The application this is most likely to be deploying.",
        },
        {
            articleId: "container-image",
            reason: "Where the images it deploys come from, and why they carry a digest.",
        },
    ],
    sources: [
        { label: "docs/wharf.md", href: repoFile("docs/wharf.md") },
        {
            label: "packages/wharf/src/main/fleet.ts",
            href: repoFile("design/packages/wharf/src/main/fleet.ts"),
        },
        {
            label: "packages/dockhand/src/mounts.ts",
            href: repoFile("design/packages/dockhand/src/mounts.ts"),
        },
    ],
};
