import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const hostedMode: Article = {
    id: "hosted-mode",
    title: "Hosted mode: the interface in a browser",
    summary:
        "The same application the desktop ships, served from a container and opened in a browser tab, with a password in front of it and a boundary around the filesystem.",
    category: "application",
    status: "shipped",
    statusNote:
        "The bridge, the transport, the capability policy, the mount confinement, the session gate and the image are on the default branch with tests, and the container has been run. A permitted channel that nothing has wired yet answers plainly that no handler is registered; that gap is deliberately visible rather than hidden by narrowing the policy.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The desktop application already serves its own renderer over HTTP. The only thing ",
                        "welded to Electron was ",
                        { code: "window.worldlens" },
                        ", the object every one of the interface's calls goes through. That object now ",
                        "comes from a single factory that takes a transport: the preload supplies one backed ",
                        "by IPC, a browser supplies one backed by fetch and a single event stream.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "There is deliberately one factory rather than one per host, so a method added for ",
                        "the desktop is present in a hosted deployment by construction rather than by ",
                        "anybody remembering. That is not a hypothetical worry: the contract type was ",
                        "already being maintained by hand in two files, and they had drifted.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Two decisions in the transport look wrong at a glance and are not. A handler that ",
                        "throws comes back as HTTP 200 carrying an error envelope, because every call site ",
                        "was written against an API where a throwing handler yields a rejection carrying ",
                        "that handler's own words; a 500 would leave the client unable to tell a world with ",
                        "no region files from a server that fell over. And all twenty-two push channels ",
                        "share one stream, because browsers cap connections to one origin at around six and ",
                        "a stream per channel would exhaust the pool and read as a slow server.",
                    ],
                },
            ],
        },
        {
            id: "folders",
            title: "The folders it can reach",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "On a desktop, choosing a folder is a native dialog, and it is a convenience rather ",
                        "than a boundary: the person choosing already has the run of the machine. Neither ",
                        "half survives a container. There is no desktop to draw a dialog on, and the person ",
                        "choosing is on the far side of a network from the filesystem.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "So the operator names the folders they mounted, and every path resolves inside ",
                        "them. That makes the list two things at once: the browsing surface the interface ",
                        "offers instead of a dialog, and the boundary a request cannot argue past.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The case it is written against is a symlink inside a mounted folder that points ",
                        "out of it. Comparing resolved strings never catches that, because the path is ",
                        "inside the root right up until the operating system follows it, so both sides go ",
                        "through ",
                        { code: "realpath" },
                        " before being compared.",
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
                        "Everything comes from the environment, because the thing that starts a container is a run command or a compose file, and both have a natural place for environment variables and an awkward one for arguments. The mounted folders, the password, the grants, the address to listen on and where the deployment keeps its own records are all set that way, and every value is checked before anything listens.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The mount declaration and the flags that put a folder inside the container are written twice, in two similar forms, on purpose. One puts a folder there; the other says which folders the application may touch and what to call them. Neither implies the other, and a folder mounted but not declared is invisible to the application, which is the safe way round.",
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
                        "It refuses to start on a network address with no password, before anything listens. A channel the deployment cannot answer is refused with a reason and, where one exists, the thing to do instead, because a control that silently does nothing reads as broken software rather than as software that knows where it is running.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A channel that reaches past the container is off until an operator turns it on, and an ungranted one names the grant that would allow it. A permitted channel that nothing has wired yet says plainly that no handler is registered, and that gap is left visible rather than hidden by narrowing the policy to whatever happens to be wired.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "What the password does and does not protect",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Said plainly: this is a single-operator remote control surface with a password in ",
                        "front of it. It is not multi-tenant, there are no accounts, and everyone who knows ",
                        "the password is the same person as far as the server is concerned.",
                    ],
                },
                {
                    kind: "list",
                    ordered: false,
                    items: [
                        [
                            "It refuses to start on a network address with no password, before anything ",
                            "listens. Thrown rather than warned: a deployment that warns and starts anyway ",
                            "has started anyway, and the warning scrolls out of a container's log in seconds.",
                        ],
                        [
                            "An unclassified channel is refused, which is the opposite default from the ",
                            "renderer's own capability check. The cost of being wrong there is a hidden ",
                            "button; here it is a hole in a network surface arriving by default.",
                        ],
                        [
                            "The Docker socket, SSH and credentials are each off until an operator grants ",
                            "them, and an ungranted channel names the grant that would allow it.",
                        ],
                        [
                            "The About surface says which folders it can reach and warns when there is no ",
                            "password, because somebody handed the address by a colleague cannot otherwise ",
                            "tell a locked deployment from an open one.",
                        ],
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
                        "The channel inventory is locked to the factory in both directions, with a tripwire ",
                        "for the case where the scanner stops matching and every comparison silently ",
                        "becomes vacuous. The capability policy fails when any reachable channel has no ",
                        "entry, and was watched fail three ways. The mount confinement was watched fail ",
                        "against the naive prefix comparison it replaces.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The container was run rather than only built, which is what found that the image ",
                        "had no git in it while the policy listed local history as available - honest, and ",
                        "a sign the policy was promising something the image could not do.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Measured at 320, 375 and 768 CSS pixels in a real browser against the real ",
                        "container, with zero horizontal overflow at all three.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "container-image",
            reason: "Where this image comes from, and what makes it a different artifact from the other one.",
        },
        {
            articleId: "wharf",
            reason: "The application that puts this on a machine for you.",
        },
        {
            articleId: "embedded-server",
            reason: "The same server, in the desktop application, where it only ever listened on loopback.",
        },
        {
            articleId: "install",
            reason: "The other way to run this: installed on your own computer rather than reached over a network.",
        },
    ],
    sources: [
        {
            label: "docs/hosted-mode.md",
            href: repoFile("docs/hosted-mode.md"),
        },
        {
            label: "packages/bridge/src/factory.ts",
            href: repoFile("design/packages/bridge/src/factory.ts"),
        },
        {
            label: "packages/app/src/hosted/capabilityProfile.ts",
            href: repoFile("design/packages/app/src/hosted/capabilityProfile.ts"),
        },
        {
            label: "packages/app/src/hosted/mountRoots.ts",
            href: repoFile("design/packages/app/src/hosted/mountRoots.ts"),
        },
        {
            label: "packages/app/Dockerfile.hosted",
            href: repoFile("design/packages/app/Dockerfile.hosted"),
        },
    ],
};
