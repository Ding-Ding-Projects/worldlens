import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Explicit delivery inventory: these current articles must reach the production
// archive renderer, independently of the older TypeScript content catalogue.
export const SERVER_ARTICLES = Object.freeze([
    { id: "mcserver-hosting", path: "docs/mcserver-hosting.md" },
    { id: "mcserver-adoption-ownership", path: "docs/server-management/adoption-ownership.md" },
    { id: "mcserver-ssh-process-lifecycle", path: "docs/server-management/ssh-process-lifecycle.md" },
    { id: "mcserver-ssh-process-readiness", path: "docs/server-management/ssh-process-readiness.md" },
    { id: "maintained-viewer-build", path: "docs/build/maintained-viewer.md" },
]);

/** Preserve complete Markdown text in the archive's safe text-only block model.
 * Headings become navigable sections; fenced code and tables retain line breaks.
 * Inline Markdown remains literal text, never executable HTML. */
export function markdownArticle(source, id) {
    const lines = source.replace(/\r\n?/gu, "\n").split("\n");
    const title = /^# (.+)$/u.exec(lines[0] ?? "")?.[1];
    if (!title) throw new Error(`Server article ${id} needs an initial title`);
    const sections = [{ heading: "", level: 2, blocks: [] }];
    let paragraph = [];
    let fence = null;
    let code = [];
    const current = () => sections.at(-1);
    const flush = () => {
        if (paragraph.length) {
            if (paragraph.every((line) => /^\s*\|/u.test(line)))
                current().blocks.push({ t: "code", v: paragraph.join("\n") });
            else if (paragraph.every((line) => /^\s*[-*+]\s+/u.test(line)))
                current().blocks.push({ t: "ul", items: paragraph.map((line) => line.replace(/^\s*[-*+]\s+/u, "")) });
            else if (paragraph.every((line) => /^\s*\d+[.)]\s+/u.test(line)))
                current().blocks.push({ t: "ol", items: paragraph.map((line) => line.replace(/^\s*\d+[.)]\s+/u, "")) });
            else current().blocks.push({ t: "p", v: paragraph.join("\n") });
        }
        paragraph = [];
    };
    for (const line of lines.slice(1)) {
        const marker = /^(\s*)(`{3,}|~{3,})(.*)$/u.exec(line);
        if (fence) {
            if (marker && marker[2][0] === fence[0] && marker[2].length >= fence.length && !marker[3].trim()) {
                current().blocks.push({ t: "code", v: code.join("\n") });
                code = []; fence = null;
            } else code.push(line);
            continue;
        }
        if (marker) { flush(); fence = marker[2]; continue; }
        const heading = /^(#{2,6}) (.+)$/u.exec(line);
        if (heading) { flush(); sections.push({ heading: heading[2], level: heading[1].length, blocks: [] }); continue; }
        if (!line.trim()) { flush(); continue; }
        paragraph.push(line);
    }
    if (fence) throw new Error(`Server article ${id} has an unclosed code fence`);
    flush();
    const introduction = sections[0].blocks.find((block) => block.t === "p")?.v ?? "";
    return { id, title, cat: "application", lede: introduction, sections };
}

export function loadServerArticles(packageRoot) {
    const repositoryRoot = resolve(packageRoot, "../../..");
    return SERVER_ARTICLES.map((entry) => ({ ...markdownArticle(
        readFileSync(resolve(repositoryRoot, entry.path), "utf8"), entry.id,
    ), sourcePath: entry.path }));
}
