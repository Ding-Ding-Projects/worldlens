import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const mountBrowser: Article = {
    id: "mount-browser",
    title: "Browsing a mounted folder from a browser tab",
    summary:
        "The replacement for the native folder picker a hosted deployment cannot draw: a list of the folders the operator mounted, confined the same way every other path in the deployment is confined, with three distinct empty states so a search that hides everything never looks like a folder that has nothing in it.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The listing logic, the picker component, the two channels that connect them and the path field that opens it are all on the default branch with their own test files, and the confinement is the same one the hosted-mode article describes. Two guards were watched fail on purpose and then pass again: removing the per-entry check lets an escaping symlink into the listing, and deciding the host by whether the mount methods exist sends a desktop down the hosted path. What is missing is a capture: nobody has photographed the rendered picker against a real container, so this stays ported-unverified rather than shipped.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The hosted-mode article already says that a container has no desktop to draw a ",
                        "native folder dialog on, and that the capability policy refuses ",
                        { code: "dialog:*" },
                        " and ",
                        { code: "config:pick*" },
                        " with a sentence pointing at ",
                        "the folders the operator mounted. That sentence had nothing behind it until this: ",
                        "a listing function that walks one mounted folder at a time, and a picker component ",
                        "that turns the result into something a person can click through.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Opening the picker asks for nothing and shows the mounted folders themselves, each ",
                        "labelled with whether the deployment may write to it. Choosing one lists what is ",
                        "inside, folders before files, both in the order a person reads a list rather than by ",
                        "byte. From there the picker offers ",
                        { code: "Up" },
                        " and ",
                        { code: "All mounted folders" },
                        " to move around, and a search field built from the same shared component every ",
                        "other search bar in the application uses, so it carries the anchored regex builder ",
                        "for free rather than as a separate feature someone has to remember to add.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "In folder mode, choosing is choosing the folder currently open. In file mode, a ",
                        "file has to be selected first and an extension filter (set by the caller, matched ",
                        "case-insensitively) decides which files even appear as choosable. A folder appears ",
                        "in both modes regardless of the extension filter, because moving through folders is ",
                        "how a file gets found in the first place.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A listing larger than 2,000 entries is cut rather than fully resolved, because ",
                        "confining every entry costs a filesystem round trip and a folder full of region ",
                        "files could otherwise turn one click into tens of thousands of them. The cut is ",
                        "reported back as ",
                        { code: "truncated" },
                        " rather than silently dropped, so the picker can say a folder holds more than it ",
                        "is showing instead of quietly pretending the folder is smaller than it is.",
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
                        "There is nothing to configure separately from what hosted-mode's own configuration ",
                        "already sets. The folders on offer are exactly the operator's mounted roots: the ",
                        "same ",
                        { code: "WORLDLENS_MOUNTS" },
                        "-declared list that backs every other confined path in a deployment, read once ",
                        "through the same ",
                        { code: "MountRoots" },
                        " object the rest of the hosted server uses.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "What the caller chooses is how the picker presents that list, not which folders are ",
                        "in it: ",
                        { code: "mode" },
                        " picks between returning a folder and returning a file, ",
                        { code: "extensions" },
                        " narrows which files are choosable in file mode, and ",
                        { code: "writableOnly" },
                        " drops any read-only root from the offered list. A save dialog sets ",
                        "writableOnly; an open dialog for reading a world does not, because reading from a ",
                        "read-only mount is exactly what a read-only mount is for.",
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
                        "Asking for a root id the deployment does not have is refused by name: ",
                        { code: 'There is no mounted folder called "<id>" in this deployment.' },
                        " Asking for a path that resolves inside a different root than the one named is ",
                        "refused too, rather than quietly answering with the other root's contents, because ",
                        "a caller that gets back the wrong root's listing has no way to notice it happened.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A folder that exists but cannot be read comes back as ",
                        { code: "That folder could not be read." },
                        ", distinct from a folder that reads fine and is genuinely empty, distinct again ",
                        "from a folder with entries that a search has filtered down to nothing. The picker ",
                        "renders each of those three as its own sentence rather than one blank state, because ",
                        "otherwise a search that hides everything looks exactly like a folder with nothing in ",
                        "it, and a person cannot tell which one they are looking at.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A build with neither ",
                        { code: "list" },
                        " nor ",
                        { code: "browse" },
                        " wired up resolves the bridge to ",
                        { code: "null" },
                        " rather than exposing half of it, and the picker says plainly that this build cannot ",
                        "list mounted folders. A hosted deployment against an older server that never ",
                        "registered those two channels therefore falls back to the ordinary refusal, which ",
                        "at least says what is wrong, rather than to an empty browser that says nothing.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Every entry a listing returns is confined on its own, not just the folder being ",
                        "listed. A directory can contain a symlink pointing anywhere on the host, so ",
                        "confining only the folder and trusting its contents would happily print the names ",
                        "of files that sit outside every mount. Each entry is resolved through the same ",
                        { code: "realpath" },
                        "-before-compare check the rest of hosted mode uses, and anything that resolves ",
                        "outside the root is dropped from the list rather than shown and then refused when ",
                        "somebody tries to open it: a name in a list is already information, so the ",
                        "confinement has to happen before the name is ever handed back.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The root id is checked as well as the path. A caller naming root ",
                        { code: "A" },
                        " with a path that happens to resolve inside root ",
                        { code: "B" },
                        " is refused, rather than quietly getting ",
                        { code: "B" },
                        "'s contents back labelled as ",
                        { code: "A" },
                        ". Without that check the id would be decorative, and two mounts with different ",
                        "writability could effectively become one.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "This is a browsing surface rather than a text field mainly because typing a path ",
                        "means guessing at a filesystem laid out by whoever ran the container, and every ",
                        "wrong guess would come back as a refusal that reads as broken software. The server ",
                        "already refuses a path that escapes a mount regardless of how it arrived, so a typed ",
                        "path was never the security problem; being asked to already know the answer was the ",
                        "usability one.",
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
                        "The listing function has its own test file covering confinement of the folder being ",
                        "listed and of each entry inside it, the root id mismatch refusal, the unreadable-",
                        "folder message, the 2,000-entry cap and its ",
                        { code: "truncated" },
                        " flag, and the folders-before-files reading order. The picker component has its own ",
                        "test file covering the three distinct empty states, the folder and file modes, the ",
                        "extension filter, the writable-only filter and the null-bridge fallback message.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "What has not been exercised is the seam between them. No channel handler answers ",
                        { code: "mounts.list" },
                        " or ",
                        { code: "mounts.browse" },
                        " on either the desktop's IPC transport or the hosted HTTP transport, so a test that ",
                        "injects a bridge proves the component and a test that calls the function proves the ",
                        "listing, but nothing yet proves the real bridge resolver finds a real handler on ",
                        "either side. Wiring that channel, and capturing the picker open against a real ",
                        "mounted folder, are the two things left before this can say shipped.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "hosted-mode",
            reason: "The container this replaces a native dialog for, and the confinement rules this reuses.",
        },
        {
            articleId: "regex-builder-surfaces",
            reason: "The shared search field this picker's folder search is built from, and the guard that keeps it there.",
        },
        {
            articleId: "world-discovery",
            reason: "The other place mounted folders already show up: finding a world to open in the first place.",
        },
    ],
    sources: [
        {
            label: "packages/app/src/hosted/mountBrowse.ts",
            href: repoFile("design/packages/app/src/hosted/mountBrowse.ts"),
        },
        {
            label: "packages/app/src/hosted/mountBrowse.test.ts",
            href: repoFile("design/packages/app/src/hosted/mountBrowse.test.ts"),
        },
        {
            label: "packages/ui/src/components/mounts/MountRootBrowser.vue",
            href: repoFile("design/packages/ui/src/components/mounts/MountRootBrowser.vue"),
        },
        {
            label: "packages/ui/src/components/mounts/mountBrowserHost.ts",
            href: repoFile("design/packages/ui/src/components/mounts/mountBrowserHost.ts"),
        },
        {
            label: "packages/ui/src/components/mounts/MountRootBrowser.test.ts",
            href: repoFile("design/packages/ui/src/components/mounts/MountRootBrowser.test.ts"),
        },
    ],
};
