/**
 * Pure helpers for the phone-size PDF edition of the documentation.
 *
 * Nothing here touches a browser, the network or the file system beyond what a caller
 * hands in, so the assembly rules (anchors, link rewriting, inventory equality) can be
 * unit tested without rendering a PDF.
 *
 * The edition has three parts, all generated from the same reviewed sources the site uses:
 *   Part 1  the site's structured articles (`src/content/articles`)
 *   Part 2  the repository reference documents (`docs/**` Markdown), which include the
 *           server articles the site renders from `scripts/server-articles.mjs`
 *   Part 3  any repository wiki folder (`wiki/` or `docs/wiki/`) when one exists
 *
 * Heading levels are fixed so the PDF outline has a predictable shape:
 *   h1 = cover, contents and part titles, h2 = one entry per article, h3 and below = sections.
 */

export const PHONE_PAGE = Object.freeze({ widthPx: 390, heightPx: 844 });
export const REPO_BLOB_PREFIX = /^https:\/\/github\.com\/Ding-Ding-Projects\/worldlens\/(?:blob|tree)\/main\//u;

export function escapeHtml(text) {
    return String(text)
        .replace(/&/gu, "&amp;")
        .replace(/</gu, "&lt;")
        .replace(/>/gu, "&gt;")
        .replace(/"/gu, "&quot;");
}

/** GitHub-style heading slug, with a fallback so a heading of symbols still has an id. */
export function slug(text) {
    const value = String(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .trim()
        .replace(/\s+/gu, "-");
    return value || "section";
}

/** Anchor for a structured site article. */
export function articleAnchor(id) {
    return `a-${slug(id)}`;
}

/** Anchor for a repository document, stable for a given repository-relative path. */
export function docAnchor(path) {
    return `d-${slug(path.replace(/\.md$/iu, "").replace(/[\\/]+/gu, "--"))}`;
}

export function normalizePath(path) {
    const parts = [];
    for (const part of path.replace(/\\/gu, "/").split("/")) {
        if (part === "" || part === ".") continue;
        if (part === "..") parts.pop();
        else parts.push(part);
    }
    return parts.join("/");
}

/**
 * Turn an href found in an article into either an in-document anchor or null.
 * `fromPath` is the repository-relative path of the containing document, or "" for a
 * structured article. `index.docs` maps repository paths to their anchors and
 * `index.headings` maps `<anchor>` to the set of heading ids inside that document.
 */
export function resolveInternalHref(href, fromPath, index) {
    if (!href) return null;
    let target = href;
    let fragment = "";
    const hash = target.indexOf("#");
    if (hash >= 0) {
        fragment = target.slice(hash + 1);
        target = target.slice(0, hash);
    }
    let path;
    if (target === "") {
        if (!fromPath) return null;
        path = fromPath;
    } else if (REPO_BLOB_PREFIX.test(target)) {
        path = normalizePath(target.replace(REPO_BLOB_PREFIX, ""));
    } else if (/^[a-z][a-z0-9+.-]*:/iu.test(target)) {
        return null;
    } else if (target.startsWith("/")) {
        return null;
    } else {
        const base = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/") + 1) : "";
        path = normalizePath(base + target);
    }
    path = path.replace(/\/$/u, "");
    const anchor = index.docs.get(path) ?? index.docs.get(`${path}/README.md`);
    if (!anchor) return null;
    if (fragment && index.headings.get(anchor)?.has(fragment)) return `${anchor}--${fragment}`;
    return anchor;
}

/* ------------------------------ structured articles ------------------------------ */

function renderInline(content, ctx) {
    if (Array.isArray(content)) return content.map((part) => renderInline(part, ctx)).join("");
    if (typeof content === "string") return escapeHtml(content);
    if ("code" in content) return `<code>${escapeHtml(content.code)}</code>`;
    if ("strong" in content) return `<strong>${escapeHtml(content.strong)}</strong>`;
    if ("em" in content) return `<em>${escapeHtml(content.em)}</em>`;
    if ("link" in content) {
        const internal = resolveInternalHref(content.href, "", ctx.index);
        if (internal) return `<a href="#${internal}">${escapeHtml(content.link)}</a>`;
        return `<a href="${escapeHtml(content.href)}" class="ext">${escapeHtml(content.link)}</a>`;
    }
    return "";
}

function renderBlock(block, ctx) {
    switch (block.kind) {
        case "paragraph":
            return `<p>${renderInline(block.content, ctx)}</p>`;
        case "list": {
            const tag = block.ordered ? "ol" : "ul";
            return `<${tag}>${block.items.map((item) => `<li>${renderInline(item, ctx)}</li>`).join("")}</${tag}>`;
        }
        case "table":
            return `<table><caption>${escapeHtml(block.caption)}</caption><thead><tr>${block.columns
                .map((column) => `<th>${escapeHtml(column)}</th>`)
                .join("")}</tr></thead><tbody>${block.rows
                .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, ctx)}</td>`).join("")}</tr>`)
                .join("")}</tbody></table>`;
        case "code":
            return `<figure>${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}<pre><code>${escapeHtml(
                block.code,
            )}</code></pre></figure>`;
        case "definitions":
            return `<dl>${block.items
                .map((item) => `<dt>${escapeHtml(item.term)}</dt><dd>${renderInline(item.description, ctx)}</dd>`)
                .join("")}</dl>`;
        case "callout":
            return `<aside class="callout ${escapeHtml(block.tone)}"><strong>${escapeHtml(block.title)}</strong><div>${renderInline(
                block.content,
                ctx,
            )}</div></aside>`;
        case "tool":
            return `<aside class="callout note"><strong>Interactive tool</strong><div>The ${escapeHtml(
                block.tool,
            )} tool runs in the hosted documentation site and cannot run inside a PDF.</div></aside>`;
        default:
            return "";
    }
}

export function renderArticle(article, ctx) {
    const anchor = articleAnchor(article.id);
    const sections = article.sections
        .map(
            (section) =>
                `<section><h3 id="${anchor}--${slug(section.id)}">${escapeHtml(section.title)}</h3>${section.blocks
                    .map((block) => renderBlock(block, ctx))
                    .join("")}</section>`,
        )
        .join("");
    const suggested = article.suggested
        .map((entry) => {
            const target = ctx.index.articles.get(entry.articleId);
            const label = ctx.index.articleTitles.get(entry.articleId) ?? entry.articleId;
            return `<li>${target ? `<a href="#${target}">${escapeHtml(label)}</a>` : escapeHtml(label)}: ${escapeHtml(entry.reason)}</li>`;
        })
        .join("");
    const sources = article.sources
        .map((source) => {
            const internal = resolveInternalHref(source.href, "", ctx.index);
            return `<li><a href="${internal ? `#${internal}` : escapeHtml(source.href)}">${escapeHtml(source.label)}</a></li>`;
        })
        .join("");
    return `<article class="doc" id="${anchor}"><h2>${escapeHtml(article.title)}</h2>
<p class="status"><strong>${escapeHtml(article.status)}</strong>: ${escapeHtml(article.statusNote)}</p>
<p class="summary">${escapeHtml(article.summary)}</p>${sections}${
        suggested ? `<h3 id="${anchor}--next">Suggested next articles</h3><ul>${suggested}</ul>` : ""
    }${sources ? `<h3 id="${anchor}--sources">Sources</h3><ul>${sources}</ul>` : ""}</article>`;
}

/* ------------------------------ Markdown documents ------------------------------ */

function renderMdInline(text, ctx, fromPath) {
    const stash = [];
    const keep = (html) => {
        stash.push(html);
        return `\u0000${stash.length - 1}\u0000`;
    };
    let out = text.replace(/`([^`]+)`/gu, (_m, code) => keep(`<code>${escapeHtml(code)}</code>`));
    out = out.replace(/!\[([^\]]*)\]\([^)]*\)/gu, (_m, alt) => keep(escapeHtml(alt ? `[image: ${alt}]` : "[image]")));
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu, (_m, label, href) => {
        const internal = resolveInternalHref(href, fromPath, ctx.index);
        const labelHtml = escapeHtml(label).replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>");
        if (internal) return keep(`<a href="#${internal}">${labelHtml}</a>`);
        if (/^https?:\/\//iu.test(href)) return keep(`<a href="${escapeHtml(href)}" class="ext">${labelHtml}</a>`);
        // A relative link to a file that is not part of the edition: keep the words, drop the dead link.
        return keep(labelHtml);
    });
    out = escapeHtml(out)
        .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
        .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/gu, "$1<em>$2</em>");
    return out.replace(/\u0000(\d+)\u0000/gu, (_m, i) => stash[Number(i)]);
}

/** Collect heading ids for a Markdown document (used before rendering so links can target them). */
export function markdownHeadingIds(source) {
    const ids = new Set();
    const seen = new Map();
    let fence = null;
    for (const line of source.replace(/\r\n?/gu, "\n").split("\n")) {
        const marker = /^\s*(`{3,}|~{3,})/u.exec(line);
        if (marker) {
            if (!fence) fence = marker[1][0];
            else if (marker[1][0] === fence) fence = null;
            continue;
        }
        if (fence) continue;
        const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line);
        if (!heading) continue;
        const base = slug(heading[2].replace(/[`*_]/gu, ""));
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        ids.add(count ? `${base}-${count}` : base);
    }
    return ids;
}

export function markdownTitle(source, fallback) {
    const match = /^#\s+(.+?)\s*$/mu.exec(source.replace(/\r\n?/gu, "\n"));
    return match ? match[1].replace(/[`*_]/gu, "") : fallback;
}

function splitRow(line) {
    return line
        .trim()
        .replace(/^\|/u, "")
        .replace(/\|$/u, "")
        .split(/(?<!\\)\|/u)
        .map((cell) => cell.trim().replace(/\\\|/gu, "|"));
}

export function renderMarkdownDocument(source, path, ctx) {
    const anchor = ctx.index.docs.get(path);
    const lines = source.replace(/\r\n?/gu, "\n").split("\n");
    const seen = new Map();
    const html = [];
    let title = null;
    let paragraph = [];
    let list = null;
    let fence = null;
    let code = [];
    const flushParagraph = () => {
        if (paragraph.length) html.push(`<p>${renderMdInline(paragraph.join(" "), ctx, path)}</p>`);
        paragraph = [];
    };
    const flushList = () => {
        if (list) html.push(`<${list.tag}>${list.items.map((item) => `<li>${renderMdInline(item, ctx, path)}</li>`).join("")}</${list.tag}>`);
        list = null;
    };
    const flush = () => {
        flushParagraph();
        flushList();
    };
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const marker = /^\s*(`{3,}|~{3,})/u.exec(line);
        if (fence) {
            if (marker && marker[1][0] === fence) {
                html.push(`<figure><pre><code>${escapeHtml(code.join("\n"))}</code></pre></figure>`);
                fence = null;
                code = [];
            } else code.push(line);
            continue;
        }
        if (marker) {
            flush();
            fence = marker[1][0];
            continue;
        }
        if (!line.trim()) {
            flush();
            continue;
        }
        if (/^\s*!\[[^\]]*\]\([^)]*\)\s*$/u.test(line)) {
            flush();
            continue;
        }
        const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line);
        if (heading) {
            flush();
            const text = heading[2].replace(/[`*_]/gu, "");
            const base = slug(text);
            const count = seen.get(base) ?? 0;
            seen.set(base, count + 1);
            const id = count ? `${base}-${count}` : base;
            if (heading[1].length === 1 && title === null) {
                title = text;
                continue;
            }
            // A second top-level heading must not become an article-level (h2) outline entry.
            const level = heading[1].length === 1 ? 3 : Math.min(6, heading[1].length + 1);
            html.push(`<h${level} id="${anchor}--${id}">${renderMdInline(heading[2], ctx, path)}</h${level}>`);
            continue;
        }
        if (/^\s*\|/u.test(line) && /^\s*\|?\s*:?-{2,}/u.test(lines[i + 1] ?? "")) {
            flush();
            const header = splitRow(line);
            i += 2;
            const rows = [];
            while (i < lines.length && /^\s*\|/u.test(lines[i])) {
                rows.push(splitRow(lines[i]));
                i += 1;
            }
            i -= 1;
            html.push(
                `<table><thead><tr>${header.map((c) => `<th>${renderMdInline(c, ctx, path)}</th>`).join("")}</tr></thead><tbody>${rows
                    .map((row) => `<tr>${row.map((c) => `<td>${renderMdInline(c, ctx, path)}</td>`).join("")}</tr>`)
                    .join("")}</tbody></table>`,
            );
            continue;
        }
        const bullet = /^\s*[-*+]\s+(.*)$/u.exec(line);
        const numbered = /^\s*\d+[.)]\s+(.*)$/u.exec(line);
        if (bullet || numbered) {
            flushParagraph();
            const tag = bullet ? "ul" : "ol";
            if (list && list.tag !== tag) flushList();
            list ??= { tag, items: [] };
            list.items.push((bullet ?? numbered)[1]);
            continue;
        }
        if (list && /^\s{2,}\S/u.test(line)) {
            list.items[list.items.length - 1] += ` ${line.trim()}`;
            continue;
        }
        if (/^\s*>\s?/u.test(line)) {
            flush();
            html.push(`<blockquote>${renderMdInline(line.replace(/^\s*>\s?/u, ""), ctx, path)}</blockquote>`);
            continue;
        }
        if (/^\s*([-*_])(\s*\1){2,}\s*$/u.test(line)) {
            flush();
            continue;
        }
        flushList();
        paragraph.push(line.trim());
    }
    if (fence) html.push(`<figure><pre><code>${escapeHtml(code.join("\n"))}</code></pre></figure>`);
    flush();
    const resolvedTitle = title ?? ctx.index.docTitles.get(path) ?? path;
    return {
        title: resolvedTitle,
        html: `<article class="doc" id="${anchor}"><h2>${escapeHtml(resolvedTitle)}</h2><p class="source">Source: <code>${escapeHtml(
            path,
        )}</code></p>${html.join("\n")}</article>`,
    };
}

/* ------------------------------ inventory and assembly ------------------------------ */

/**
 * Build the link index and the expected inventory.
 * `articles`: the site's structured articles. `serverArticlePaths`: the site's
 * server-article source paths. `docs`: [{ path, source }] for each repository document.
 * `wiki`: same shape for any wiki folder.
 */
export function buildIndex({ articles, docs, wiki }) {
    const index = {
        articles: new Map(),
        articleTitles: new Map(),
        docs: new Map(),
        docTitles: new Map(),
        headings: new Map(),
    };
    for (const article of articles) {
        const anchor = articleAnchor(article.id);
        if ([...index.articles.values()].includes(anchor)) throw new Error(`Duplicate article id ${article.id}`);
        index.articles.set(article.id, anchor);
        index.articleTitles.set(article.id, article.title);
    }
    for (const entry of [...docs, ...wiki]) {
        const anchor = docAnchor(entry.path);
        if ([...index.docs.values()].includes(anchor)) throw new Error(`Duplicate document anchor for ${entry.path}`);
        index.docs.set(entry.path, anchor);
        index.docTitles.set(entry.path, markdownTitle(entry.source, entry.path));
        index.headings.set(anchor, markdownHeadingIds(entry.source));
    }
    return index;
}

/** The set of things the PDF must contain, in reading order. */
export function expectedInventory({ articles, serverArticlePaths, docs, wiki }) {
    const entries = [];
    for (const article of articles) entries.push({ part: 1, kind: "article", key: article.id, title: article.title });
    for (const entry of docs) {
        entries.push({ part: 2, kind: "document", key: entry.path, title: markdownTitle(entry.source, entry.path) });
    }
    for (const entry of wiki) {
        entries.push({ part: 3, kind: "wiki", key: entry.path, title: markdownTitle(entry.source, entry.path) });
    }
    const documented = new Set(docs.map((entry) => entry.path));
    const missingServer = serverArticlePaths.filter((path) => !documented.has(path));
    return { entries, missingServer };
}

export const PART_TITLES = Object.freeze({
    1: "Part 1. Site articles",
    2: "Part 2. Reference documents",
    3: "Part 3. Wiki pages",
});

/** Throws when the assembled HTML links to an id that does not exist, or an id repeats. */
export function assertLinksResolve(html) {
    const ids = new Set();
    for (const match of html.matchAll(/\sid="([^"]+)"/gu)) {
        if (ids.has(match[1])) throw new Error(`Duplicate id in PDF edition: ${match[1]}`);
        ids.add(match[1]);
    }
    const broken = [];
    for (const match of html.matchAll(/\shref="#([^"]+)"/gu)) if (!ids.has(match[1])) broken.push(match[1]);
    if (broken.length) throw new Error(`PDF edition has ${broken.length} internal links with no target, first: ${broken[0]}`);
    return ids.size;
}

/**
 * Compare what was rendered against what the sources say should be there.
 * `renderedKeys` is the list of `${kind}:${key}` strings actually written into the HTML.
 */
export function assertInventoryMatches(expected, renderedKeys) {
    const want = expected.entries.map((entry) => `${entry.kind}:${entry.key}`);
    const missing = want.filter((key) => !renderedKeys.includes(key));
    const extra = renderedKeys.filter((key) => !want.includes(key));
    if (expected.missingServer.length) {
        throw new Error(`Server articles missing from the document set: ${expected.missingServer.join(", ")}`);
    }
    if (missing.length || extra.length) {
        throw new Error(
            `PDF inventory differs from the site inventory (${missing.length} missing, ${extra.length} extra). First missing: ${missing[0] ?? "none"}`,
        );
    }
}

const STYLE = `
@page { size: ${PHONE_PAGE.widthPx}px ${PHONE_PAGE.heightPx}px; }
* { box-sizing: border-box; }
html { font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans CJK TC", "Microsoft JhengHei", sans-serif; color: #1c1b1f; background: #fff; }
body { margin: 0; overflow-wrap: anywhere; }
h1 { font-size: 22px; margin: 0 0 10px; page-break-before: always; }
h1.first { page-break-before: avoid; }
h2 { font-size: 18px; margin: 0 0 8px; page-break-before: always; break-after: avoid; color: #3b2a8c; }
h3 { font-size: 15px; margin: 16px 0 6px; break-after: avoid; }
h4, h5, h6 { font-size: 13px; margin: 12px 0 4px; break-after: avoid; }
p, li, dd, blockquote { margin: 0 0 8px; }
ul, ol { padding-left: 20px; margin: 0 0 8px; }
a { color: #3b2a8c; }
code { font: 11px/1.35 ui-monospace, "Cascadia Mono", Consolas, monospace; background: #f2eff7; padding: 0 2px; border-radius: 3px; }
pre { margin: 0 0 10px; padding: 8px; background: #f2eff7; border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; break-inside: auto; }
pre code { background: none; padding: 0; }
figure { margin: 0; }
figcaption { font-size: 11px; color: #49454f; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 11px; margin: 0 0 10px; }
th, td { border: 1px solid #cac4d0; padding: 3px 4px; vertical-align: top; text-align: left; word-break: break-word; }
th { background: #e8def8; }
caption { text-align: left; font-weight: 600; padding-bottom: 3px; }
dt { font-weight: 700; margin-top: 6px; }
dd { margin-left: 12px; }
blockquote { border-left: 3px solid #cac4d0; padding-left: 8px; color: #49454f; }
.callout { border-left: 4px solid #3b2a8c; background: #f5f1fb; padding: 6px 8px; margin: 0 0 10px; border-radius: 4px; }
.callout.warning { border-color: #b3261e; background: #fcefee; }
.callout.not-implemented { border-color: #7d5700; background: #fff6e0; }
.status, .source, .summary { font-size: 11px; color: #49454f; }
.cover { min-height: 780px; display: flex; flex-direction: column; justify-content: center; }
.cover h1 { font-size: 28px; page-break-before: avoid; }
.cover img { width: 72px; height: 72px; margin-bottom: 14px; }
nav.toc ol, nav.toc ul { list-style: none; padding-left: 0; }
nav.toc li { margin: 0 0 4px; }
nav.toc .part { font-weight: 700; margin-top: 10px; }
`;

export function assembleHtml({ version, commit, date, logoDataUri, articles, articleHtml, docs, docHtml, wiki, wikiHtml, titles }) {
    const toc = (heading, list, anchorOf) =>
        list.length
            ? `<li class="part"><a href="#part-${heading.part}">${escapeHtml(PART_TITLES[heading.part])}</a> (${list.length})</li>${list
                  .map((entry) => `<li><a href="#${anchorOf(entry)}">${escapeHtml(entry.title)}</a></li>`)
                  .join("")}`
            : "";
    const tocHtml = `<nav class="toc" id="contents"><h1>Contents</h1><ul>${toc({ part: 1 }, articles, (entry) => articleAnchor(entry.id))}${toc(
        { part: 2 },
        docs.map((entry) => ({ ...entry, title: titles.get(entry.path) })),
        (entry) => docAnchor(entry.path),
    )}${toc({ part: 3 }, wiki.map((entry) => ({ ...entry, title: titles.get(entry.path) })), (entry) => docAnchor(entry.path))}</ul></nav>`;
    const part = (n, body, count) =>
        count ? `<h1 id="part-${n}">${escapeHtml(PART_TITLES[n])}</h1>${body}` : "";
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=${PHONE_PAGE.widthPx}"><title>WorldLens documentation (phone edition) ${escapeHtml(
        version,
    )}</title><style>${STYLE}</style></head><body>
<section class="cover"><img alt="" src="${logoDataUri}"><h1 class="first" id="cover">WorldLens documentation</h1><p>Phone edition for release ${escapeHtml(
        version,
    )}</p><p>Commit <code>${escapeHtml(commit)}</code><br>Generated ${escapeHtml(date)}</p><p>Every article and reference document from the documentation site, in one file built for a phone screen. Use the contents page or your reader's bookmarks to jump to any article. This edition supplements the hosted site and the interactive tools there do not run in a PDF.</p><p><a href="#contents">Open the contents</a></p></section>
${tocHtml}
${part(1, articleHtml, articles.length)}
${part(2, docHtml, docs.length)}
${part(3, wikiHtml, wiki.length)}
</body></html>`;
}
