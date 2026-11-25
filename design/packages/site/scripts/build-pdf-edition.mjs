/**
 * Build the phone-size PDF edition of the documentation.
 *
 *   node scripts/build-pdf-edition.mjs [--out <dir>] [--version <tag>] [--browser <path>]
 *
 * Writes `worldlens-docs-<version>.pdf` and `worldlens-docs-<version>.inventory.json` to
 * the output directory. The inventory file is the build's own statement of what the PDF
 * must contain; `verify-pdf-edition.mjs` reads the PDF back and checks it against that
 * statement.
 *
 * The content comes from the same reviewed sources as the hosted site: the structured
 * articles are loaded through Vite from `src/content/articles`, the server articles from
 * `scripts/server-articles.mjs`, and the reference documents from the repository `docs/`
 * directory. The page is rendered from an in-memory string with every network request
 * blocked, so a remote asset cannot slip in unnoticed.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    PHONE_PAGE,
    assembleHtml,
    assertInventoryMatches,
    assertLinksResolve,
    articleAnchor,
    buildIndex,
    expectedInventory,
    markdownTitle,
    renderArticle,
    renderMarkdownDocument,
} from "./pdf-edition-lib.mjs";
import { SERVER_ARTICLES } from "./server-articles.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const repoRoot = resolve(siteRoot, "../../..");

function option(name, fallback) {
    const at = process.argv.indexOf(`--${name}`);
    return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

function listMarkdown(directory, base) {
    if (!existsSync(directory)) return [];
    const found = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = join(directory, entry.name);
        if (entry.isDirectory()) found.push(...listMarkdown(full, base));
        else if (/\.md$/iu.test(entry.name)) found.push(relative(base, full).replace(/\\/gu, "/"));
    }
    return found.sort((a, b) => a.localeCompare(b, "en"));
}

function readDocs(paths) {
    return paths.map((path) => ({ path, source: readFileSync(resolve(repoRoot, path), "utf8") }));
}

async function loadSiteArticles() {
    const { createServer } = await import("vite");
    const server = await createServer({
        root: siteRoot,
        configFile: false,
        logLevel: "error",
        appType: "custom",
        server: { middlewareMode: true, fs: { strict: false } },
        optimizeDeps: { noDiscovery: true },
    });
    try {
        const module = await server.ssrLoadModule("/src/content/articles/index.ts");
        return module.articles;
    } finally {
        await server.close();
    }
}

async function launchBrowser(chromium, explicitPath) {
    const candidates = [explicitPath, process.env.PDF_EDITION_BROWSER].filter(Boolean);
    if (candidates.length) return chromium.launch({ executablePath: candidates[0] });
    try {
        return await chromium.launch();
    } catch (bundledError) {
        for (const channel of ["chrome", "msedge"]) {
            try {
                return await chromium.launch({ channel });
            } catch {
                /* try the next installed browser */
            }
        }
        throw bundledError;
    }
}

export async function main() {
    const outDir = resolve(option("out", join(siteRoot, "pdf-out")));
    const packageVersion = JSON.parse(readFileSync(join(siteRoot, "package.json"), "utf8")).version;
    const version = option("version", process.env.PDF_EDITION_VERSION ?? `v${packageVersion}`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/u.test(version)) throw new Error(`Unsafe version label: ${version}`);
    const commit =
        process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
    const date = new Date().toISOString().slice(0, 10);

    const articles = await loadSiteArticles();
    const wikiPaths = ["wiki", "docs/wiki"].flatMap((dir) =>
        listMarkdown(resolve(repoRoot, dir), repoRoot),
    );
    const wikiSet = new Set(wikiPaths);
    const docPaths = listMarkdown(resolve(repoRoot, "docs"), repoRoot).filter((path) => !wikiSet.has(path));
    const docs = readDocs(docPaths);
    const wiki = readDocs(wikiPaths);
    const serverArticlePaths = SERVER_ARTICLES.map((entry) => entry.path);

    const index = buildIndex({ articles, docs, wiki });
    const expected = expectedInventory({ articles, serverArticlePaths, docs, wiki });
    const ctx = { index };

    const rendered = [];
    const articleHtml = articles.map((article) => {
        rendered.push(`article:${article.id}`);
        return renderArticle(article, ctx);
    });
    const renderMd = (list, kind) =>
        list.map((entry) => {
            rendered.push(`${kind}:${entry.path}`);
            return renderMarkdownDocument(entry.source, entry.path, ctx).html;
        });
    const docHtml = renderMd(docs, "document");
    const wikiHtml = renderMd(wiki, "wiki");
    assertInventoryMatches(expected, rendered);

    const titles = new Map([...docs, ...wiki].map((entry) => [entry.path, markdownTitle(entry.source, entry.path)]));
    const logo = readFileSync(join(siteRoot, "src/assets/worldlens-logo.png"));
    const html = assembleHtml({
        version,
        commit,
        date,
        logoDataUri: `data:image/png;base64,${logo.toString("base64")}`,
        articles,
        articleHtml: articleHtml.join("\n"),
        docs,
        docHtml: docHtml.join("\n"),
        wiki,
        wikiHtml: wikiHtml.join("\n"),
        titles,
    });
    const idCount = assertLinksResolve(html);

    const { chromium } = await import("@playwright/test");
    const browser = await launchBrowser(chromium, option("browser"));
    const blocked = [];
    try {
        const context = await browser.newContext({ viewport: { width: PHONE_PAGE.widthPx, height: PHONE_PAGE.heightPx } });
        await context.route("**/*", (route) => {
            const url = route.request().url();
            if (/^(data|about|blob):/u.test(url)) return route.continue();
            blocked.push(url);
            return route.abort();
        });
        const page = await context.newPage();
        await page.setContent(html, { waitUntil: "load", timeout: 600_000 });
        await mkdir(outDir, { recursive: true });
        const pdfPath = join(outDir, `worldlens-docs-${version}.pdf`);
        await page.pdf({
            path: pdfPath,
            width: `${PHONE_PAGE.widthPx}px`,
            height: `${PHONE_PAGE.heightPx}px`,
            margin: { top: "22px", bottom: "30px", left: "16px", right: "16px" },
            printBackground: true,
            outline: true,
            tagged: true,
            displayHeaderFooter: true,
            headerTemplate: "<span></span>",
            footerTemplate:
                '<div style="width:100%;font-size:8px;text-align:center;color:#49454f"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        });
        if (blocked.length) throw new Error(`The PDF render requested ${blocked.length} network resources, first: ${blocked[0]}`);
        const inventory = {
            version,
            commit,
            generated: date,
            pageWidthPx: PHONE_PAGE.widthPx,
            pageHeightPx: PHONE_PAGE.heightPx,
            idCount,
            counts: {
                articles: articles.length,
                documents: docs.length,
                wiki: wiki.length,
                serverArticles: serverArticlePaths.length,
            },
            entries: expected.entries,
            serverArticlePaths,
        };
        await writeFile(join(outDir, `worldlens-docs-${version}.inventory.json`), `${JSON.stringify(inventory, null, 2)}\n`);
        const bytes = statSync(pdfPath).size;
        console.log(
            `PDF edition written: ${pdfPath} (${bytes} bytes; ${articles.length} articles, ${docs.length} documents, ${wiki.length} wiki pages)`,
        );
    } finally {
        await browser.close();
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(`PDF edition build failed: ${error.stack ?? error}`);
        process.exit(1);
    });
}

export { articleAnchor };
