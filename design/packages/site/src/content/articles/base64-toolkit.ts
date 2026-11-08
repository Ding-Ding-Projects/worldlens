import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const base64Toolkit: Article = {
    id: "base64-toolkit",
    title: "Base64 toolkit",
    summary:
        "Encode and decode text and files locally, with every alphabet and option, exact error positions, same-name file round trips, a safe preview, and undo. Try it on this page.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The desktop job, its streaming file route and this page's tool are built and covered by focused tests. A packaged Windows interaction capture is still pending.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                { kind: "tool", tool: "base64" },
                {
                    kind: "list",
                    items: [
                        "Standard (RFC 4648 section 4), URL-safe (section 5) and MIME (76 characters per line with CRLF) alphabets, any line length, and padding on or off.",
                        "Strict decoding refuses anything outside the alphabet and names the exact character and position. Lenient decoding ignores whitespace, accepts both alphabets and missing padding.",
                        "UTF-8, UTF-16 LE, UTF-16 BE and Latin-1 text, with byte counts on both sides.",
                        "Drop a file on Encode to get name.ext.base64.txt. Drop that file on Decode to get name.ext back. The desktop app writes beside the source and never overwrites; this page downloads under the same names.",
                        "Decoded bytes preview as an image, audio, video, text or a hex dump, chosen from the bytes themselves.",
                        "Every copy, save and file conversion is recorded by name, size and SHA-256, with unlimited undo and redo.",
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
                        { term: "Alphabet", description: "Standard, URL-safe or MIME. Choosing MIME sets the line length to 76." },
                        { term: "Line length", description: "Characters per line when encoding. 0 means one line." },
                        { term: "Padding", description: "Adds = so the length is a multiple of four. URL-safe output usually leaves it off." },
                        { term: "Strict decoding", description: "On by default for text. Files are always decoded leniently, so wrapped or URL-safe files work." },
                        { term: "Keep inputs", description: "Desktop only. Off by default: nothing typed is written to disk, and undo lasts for the session. On: undo survives a restart." },
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
                        "Empty input, characters outside the alphabet, wrong padding and text that the chosen encoding cannot hold each get their own message. A failed decode never shows partial output.",
                        "A desktop file conversion that is cancelled, fails or does not pass its SHA-256 round trip leaves nothing behind.",
                        "This page reads files up to 256 MB in memory and says so beyond that; the desktop app streams files of any size.",
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
                        "Nothing leaves the device. Decoded content is never run: SVG and HTML show as a hex dump, media plays from a local blob URL in a plain element, and nothing is placed in a frame or opened automatically. History stores names, sizes and hashes, never the payload, unless the person turns on keeping inputs.",
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Shared tests check every alphabet, option and length remainder against Node's encoder, the RFC 4648 test vectors (removing padding turns them red), strict offsets, every text encoding, naming order, safe preview kinds and a ZIP read back by Python.",
                        "Desktop tests stream a 128 MB file in bounded memory and prove the same-folder round trip, numbered names, pause, cancel and clean failure.",
                        "Screen tests prove undo across a restart, the exact error mark and a preview that never renders SVG markup.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Packaged proof remains pending",
                    content: "The screenshots so far come from the built interface without the desktop bridge. A capture of the packaged Windows app converting a real file is still to be recorded.",
                },
            ],
        },
    ],
    suggested: [
        { articleId: "file-converter", reason: "The converter handles other formats with the same local, bounded approach." },
        { articleId: "regex-builder-surfaces", reason: "Search fields across the app use the same regex builder." },
    ],
    sources: [
        { label: "docs/base64.md", href: repoFile("docs/base64.md") },
        { label: "packages/shared/src/base64.ts", href: repoFile("design/packages/shared/src/base64.ts") },
        { label: "packages/app/src/main/base64/files.ts", href: repoFile("design/packages/app/src/main/base64/files.ts") },
    ],
};
