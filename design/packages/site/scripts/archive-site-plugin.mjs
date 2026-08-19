import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const VIRTUAL_ID = "virtual:worldlens-archive-runtime";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;
const EXPECTED_ARTICLE_COUNT = 59;

const ARTICLE_KEYS = ["cat", "id", "lede", "sections", "title"];
const SECTION_KEYS = ["blocks", "heading", "level"];
const VALUE_BLOCK_KEYS = ["t", "v"];
const LIST_BLOCK_KEYS = ["items", "t"];
const MALFORMED_REQUEST_BODY = "Bad Request\n";

const MIME_TYPES = {
    ".gif": "image/gif",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".txt": "text/plain; charset=utf-8",
};

const GALLERY_CATEGORY_REGISTRY = JSON.parse(
    readFileSync(new URL("../src/content/gallery-categories.json", import.meta.url), "utf8"),
);

function humanScreenshotTitle(file) {
    const stem = file.replace(/\.png$/iu, "").replaceAll("_", ".");
    const title = stem.split("-").filter(Boolean).join(" ");
    return title ? title[0].toUpperCase() + title.slice(1) : file;
}

function screenshotCategory(file, groupId) {
    const byEvidence = GALLERY_CATEGORY_REGISTRY.find((category) =>
        Array.isArray(category.evidenceGroups) && category.evidenceGroups.includes(groupId),
    );
    if (byEvidence) return byEvidence.label;
    const lower = file.toLowerCase();
    const semantic = GALLERY_CATEGORY_REGISTRY.find((category) =>
        Array.isArray(category.prefixes) && category.prefixes.some((prefix) => lower.startsWith(prefix)),
    );
    return semantic?.label || GALLERY_CATEGORY_REGISTRY.at(-1)?.label || "Other real captures";
}

function screenshotViewport(...values) {
    const match = /\b(\d{3,4})\s*(?:x|×|by)\s*(\d{3,4})\b/iu.exec(values.join(" "));
    return match ? `${match[1]} × ${match[2]}` : "Not recorded";
}

function screenshotTheme(...values) {
    const text = values.join(" ").toLowerCase();
    if (/\b(?:high[- ]?)?contrast\b/u.test(text)) return "High contrast";
    const dark = /\bdark\b/u.test(text);
    const light = /\blight\b/u.test(text);
    if (dark && light) return "Light and dark";
    if (dark) return "Dark";
    if (light) return "Light";
    return "Not recorded";
}

function firstSentence(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    const sentence = /^(.+?[.!?])(?:\s|$)/u.exec(trimmed);
    return sentence ? sentence[1] : trimmed;
}

export function buildScreenshotCatalog(packageRoot) {
    const screenshotRoot = resolve(packageRoot, "../../..", "docs", "screenshots");
    const inventory = JSON.parse(
        readFileSync(join(screenshotRoot, "evidence-inventory.json"), "utf8"),
    );
    const manifest = JSON.parse(readFileSync(join(screenshotRoot, "manifest.json"), "utf8"));
    const manifestByFile = new Map(
        (Array.isArray(manifest.captures) ? manifest.captures : [])
            .filter((entry) => entry && entry.kind === "capture" && typeof entry.file === "string")
            .map((entry) => [entry.file, entry]),
    );
    const records = [];
    const seen = new Set();
    for (const group of Array.isArray(inventory.groups) ? inventory.groups : []) {
        for (const target of Array.isArray(group.targets) ? group.targets : []) {
            const match = /^docs\/screenshots\/([^/]+\.png)$/iu.exec(String(target));
            if (!match) continue;
            const file = match[1];
            if (seen.has(file)) throw new Error(`Screenshot evidence inventory repeats ${file}`);
            seen.add(file);
            const source = manifestByFile.get(file);
            const captionPath = join(screenshotRoot, file.replace(/\.png$/iu, ".caption.txt"));
            const sidecar = existsSync(captionPath) ? readFileSync(captionPath, "utf8").trim() : "";
            const description = String(
                source?.surface || firstSentence(sidecar) || humanScreenshotTitle(file),
            );
            const state = String(
                source?.caption ||
                    sidecar ||
                    `${group.reproducibility}; captured by ${group.authority}.`,
            );
            const category = screenshotCategory(file, group.id);
            const proof = String(
                group.uiSourceDigestNote || "No additional proof note is recorded.",
            );
            const exactSourceCommit =
                group.sourceCommits && typeof group.sourceCommits === "object"
                    ? group.sourceCommits[target]
                    : null;
            const manifestCommit =
                typeof manifest.commit === "string" && /^[0-9a-f]{40}$/iu.test(manifest.commit)
                    ? manifest.commit
                    : null;
            records.push({
                cat: category,
                src: `assets/captures/${file}`,
                file,
                title: humanScreenshotTitle(file),
                caption: description,
                description,
                state: `${state} Evidence group: ${group.id}. Reproducibility: ${group.reproducibility}.`,
                alt: description,
                theme: screenshotTheme(file, description, state),
                viewport: screenshotViewport(file, description, state),
                commit: `${typeof exactSourceCommit === "string" && /^[0-9a-f]{40}$/iu.test(exactSourceCommit) ? exactSourceCommit : manifestCommit || "Not pinned to a candidate commit"}; ${group.authority}; ${proof}`,
                capturedAt: String(
                    source?.capturedAt || "Not recorded for this individual capture",
                ),
            });
        }
    }

    const pngFiles = readdirSync(screenshotRoot)
        .filter((file) => file.toLowerCase().endsWith(".png"))
        .sort();
    const catalogFiles = records.map((record) => record.file).sort();
    if (JSON.stringify(catalogFiles) !== JSON.stringify(pngFiles)) {
        const missing = pngFiles.filter((file) => !seen.has(file));
        const extra = catalogFiles.filter((file) => !pngFiles.includes(file));
        throw new Error(
            `Screenshot gallery inventory mismatch: missing ${missing.join(", ") || "none"}; extra ${extra.join(", ") || "none"}`,
        );
    }
    return records;
}

function assertRecord(value, label) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
}

function assertExactKeys(value, expectedKeys, label) {
    const actualKeys = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    const missing = expected.filter((key) => !actualKeys.includes(key));
    const unexpected = actualKeys.filter((key) => !expected.includes(key));
    if (missing.length > 0 || unexpected.length > 0) {
        const details = [];
        if (missing.length > 0) details.push(`missing ${missing.join(", ")}`);
        if (unexpected.length > 0) details.push(`unexpected ${unexpected.join(", ")}`);
        throw new Error(`${label} has an invalid schema (${details.join("; ")})`);
    }
}

function assertString(value, label) {
    if (typeof value !== "string") throw new Error(`${label} must be a string`);
}

function assertTrimmedNonBlankString(value, label) {
    assertString(value, label);
    const trimmed = value.trim();
    if (trimmed.length === 0) throw new Error(`${label} must not be blank`);
    if (trimmed !== value) throw new Error(`${label} must not have leading or trailing whitespace`);
    return trimmed;
}

function validateArticleBlock(block, label) {
    assertRecord(block, label);
    assertString(block.t, `${label}.t`);
    if (block.t === "p" || block.t === "code") {
        assertExactKeys(block, VALUE_BLOCK_KEYS, label);
        assertString(block.v, `${label}.v`);
        return;
    }
    if (block.t === "ul" || block.t === "ol") {
        assertExactKeys(block, LIST_BLOCK_KEYS, label);
        if (!Array.isArray(block.items)) throw new Error(`${label}.items must be an array`);
        for (const [itemIndex, item] of block.items.entries()) {
            assertString(item, `${label}.items[${itemIndex}]`);
        }
        return;
    }
    throw new Error(`${label}.t has unsupported block type ${JSON.stringify(block.t)}`);
}

function validateArticleCatalog(articleCatalog) {
    assertRecord(articleCatalog, "Canonical archive article catalog");
    assertExactKeys(articleCatalog, ["articles", "count"], "Canonical archive article catalog");
    if (!Number.isInteger(articleCatalog.count) || articleCatalog.count < 0) {
        throw new Error("Canonical archive article catalog count must be a non-negative integer");
    }
    if (!Array.isArray(articleCatalog.articles)) {
        throw new Error("Canonical archive article catalog articles must be an array");
    }
    if (articleCatalog.count !== articleCatalog.articles.length) {
        throw new Error(
            `Canonical archive article count mismatch: declared ${articleCatalog.count}, found ${articleCatalog.articles.length}`,
        );
    }
    if (articleCatalog.count !== EXPECTED_ARTICLE_COUNT) {
        throw new Error(
            `Canonical archive must contain exactly ${EXPECTED_ARTICLE_COUNT} articles; found ${articleCatalog.count}`,
        );
    }

    const ids = new Set();
    const titles = new Set();
    for (const [articleIndex, article] of articleCatalog.articles.entries()) {
        const label = `Canonical archive article[${articleIndex}]`;
        assertRecord(article, label);
        assertExactKeys(article, ARTICLE_KEYS, label);
        const id = assertTrimmedNonBlankString(article.id, `${label}.id`);
        const title = assertTrimmedNonBlankString(article.title, `${label}.title`);
        const normalizedId = id.normalize("NFKC").toLocaleLowerCase("en-US");
        const normalizedTitle = title.normalize("NFKC").toLocaleLowerCase("en-US");
        if (ids.has(normalizedId)) throw new Error(`${label}.id duplicates ${JSON.stringify(id)}`);
        if (titles.has(normalizedTitle)) {
            throw new Error(`${label}.title duplicates ${JSON.stringify(title)}`);
        }
        ids.add(normalizedId);
        titles.add(normalizedTitle);

        assertString(article.cat, `${label}.cat`);
        assertString(article.lede, `${label}.lede`);
        if (!Array.isArray(article.sections)) throw new Error(`${label}.sections must be an array`);
        for (const [sectionIndex, section] of article.sections.entries()) {
            const sectionLabel = `${label}.sections[${sectionIndex}]`;
            assertRecord(section, sectionLabel);
            assertExactKeys(section, SECTION_KEYS, sectionLabel);
            assertString(section.heading, `${sectionLabel}.heading`);
            if (!Number.isInteger(section.level) || section.level < 1 || section.level > 6) {
                throw new Error(`${sectionLabel}.level must be an integer from 1 through 6`);
            }
            if (!Array.isArray(section.blocks)) {
                throw new Error(`${sectionLabel}.blocks must be an array`);
            }
            for (const [blockIndex, block] of section.blocks.entries()) {
                validateArticleBlock(block, `${sectionLabel}.blocks[${blockIndex}]`);
            }
        }
    }
}

function selfCheckCatalog() {
    return {
        count: EXPECTED_ARTICLE_COUNT,
        articles: Array.from({ length: EXPECTED_ARTICLE_COUNT }, (_unused, index) => ({
            id: `self-check-${index}`,
            title: `Self-check article ${index}`,
            cat: "self-check",
            lede: "Validator fixture",
            sections: [
                {
                    heading: "Self-check section",
                    level: 2,
                    blocks: [{ t: "p", v: "Validator fixture block" }],
                },
            ],
        })),
    };
}

function runArticleCatalogValidatorSelfChecks() {
    validateArticleCatalog(selfCheckCatalog());
    const mutations = [
        ["top-level schema", (catalog) => ({ ...catalog, extra: true }), "unexpected extra"],
        [
            "declared count mismatch",
            (catalog) => ({ ...catalog, count: catalog.count - 1 }),
            "article count mismatch",
        ],
        [
            "expected count mismatch",
            (catalog) => ({ count: catalog.count - 1, articles: catalog.articles.slice(1) }),
            `exactly ${EXPECTED_ARTICLE_COUNT} articles`,
        ],
        [
            "article schema",
            (catalog) => {
                catalog.articles[0].sections = "not-an-array";
                return catalog;
            },
            ".sections must be an array",
        ],
        [
            "section schema",
            (catalog) => {
                catalog.articles[0].sections[0].level = 0;
                return catalog;
            },
            ".level must be an integer",
        ],
        [
            "block schema",
            (catalog) => {
                catalog.articles[0].sections[0].blocks[0].t = "iframe";
                return catalog;
            },
            "unsupported block type",
        ],
        [
            "blank id",
            (catalog) => {
                catalog.articles[0].id = "   ";
                return catalog;
            },
            ".id must not be blank",
        ],
        [
            "duplicate id",
            (catalog) => {
                catalog.articles[1].id = catalog.articles[0].id.toUpperCase();
                return catalog;
            },
            ".id duplicates",
        ],
        [
            "blank title",
            (catalog) => {
                catalog.articles[0].title = "\t";
                return catalog;
            },
            ".title must not be blank",
        ],
        [
            "duplicate title",
            (catalog) => {
                catalog.articles[1].title = catalog.articles[0].title.toUpperCase();
                return catalog;
            },
            ".title duplicates",
        ],
    ];
    for (const [label, mutate, expectedMessage] of mutations) {
        const candidate = mutate(selfCheckCatalog());
        let rejection = null;
        try {
            validateArticleCatalog(candidate);
        } catch (error) {
            rejection = error;
        }
        if (!(rejection instanceof Error) || !rejection.message.includes(expectedMessage)) {
            const actual = rejection instanceof Error ? rejection.message : "no rejection";
            throw new Error(
                `Canonical archive article validator self-check for ${label} expected ${JSON.stringify(expectedMessage)}; got ${actual}`,
            );
        }
    }
}

runArticleCatalogValidatorSelfChecks();

function replaceSection(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    if (start < 0) throw new Error(`Archive runtime transform could not find ${label} start`);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (end < 0) throw new Error(`Archive runtime transform could not find ${label} end`);
    return source.slice(0, start) + replacement + source.slice(end);
}

function canonicalLogic(indexSource, articles, screenshots) {
    const match = indexSource.match(
        /<script type="text\/x-dc"[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>\s*<\/body>/u,
    );
    if (!match) throw new Error("Canonical archive index is missing its data-dc-script logic");

    let logic = match[1];
    const articleFetch =
        /\n\s{4}fetch\("content\/articles\.json"\)[\s\S]*?\.catch\(\(\) => this\.setState\(\{ loaded:true \}\)\);/u;
    if (!articleFetch.test(logic)) {
        throw new Error(
            "Canonical archive logic no longer contains the expected article acquisition block",
        );
    }
    logic = logic.replace(
        articleFetch,
        `\n    this.setState({ articles:${JSON.stringify(articles)}, loaded:true });`,
    );
    const screenshotCatalog =
        /\n    const shotsAll = \[[\s\S]*?\n    \];(?=\n    const shotCategoryDescriptions =)/u;
    if (!screenshotCatalog.test(logic)) {
        throw new Error("Canonical archive logic no longer contains the screenshot catalog block");
    }
    logic = logic.replace(
        screenshotCatalog,
        `\n    const shotsAll = ${JSON.stringify(screenshots)};`,
    );
    if (!logic.includes("const ARCHIVE_SCREENSHOT_COUNT = 0;")) {
        throw new Error("Canonical archive logic no longer contains the screenshot count marker");
    }
    logic = logic.replace(
        "const ARCHIVE_SCREENSHOT_COUNT = 0;",
        `const ARCHIVE_SCREENSHOT_COUNT = ${screenshots.length};`,
    );
    logic = logic.replace(
        "class Component extends DCLogic",
        "class Component extends StreamableLogic",
    );
    if (!logic.includes("class Component extends StreamableLogic")) {
        throw new Error("Canonical archive logic class could not be bound to the local runtime");
    }
    return logic;
}

export function buildCanonicalRuntime(packageRoot) {
    const archiveRoot = resolve(packageRoot, "archive");
    const indexSource = readFileSync(resolve(packageRoot, "index.html"), "utf8").replace(
        /\r\n?/gu,
        "\n",
    );
    const supportSource = readFileSync(resolve(archiveRoot, "support.js"), "utf8").replace(
        /\r\n?/gu,
        "\n",
    );
    const articleCatalog = JSON.parse(
        readFileSync(resolve(archiveRoot, "content", "articles.json"), "utf8"),
    );
    validateArticleCatalog(articleCatalog);

    const logic = canonicalLogic(
        indexSource,
        articleCatalog.articles,
        buildScreenshotCatalog(packageRoot),
    );
    let runtime = supportSource;
    runtime = replaceSection(
        runtime,
        "  function evalDcLogic(src) {",
        "\n\n  // src/component.ts",
        `  function evalDcLogic(_source) {\n${logic}\n    return Component;\n  }`,
        "logic evaluator",
    );

    const externalStart = '        new Function("React", "module", "exports", "require", code)(';
    const externalIndex = runtime.indexOf(externalStart);
    if (externalIndex < 0) throw new Error("Archive runtime external evaluator was not found");
    const externalEndMarker = "\n        );";
    const externalEnd = runtime.indexOf(externalEndMarker, externalIndex);
    if (externalEnd < 0) throw new Error("Archive runtime external evaluator end was not found");
    runtime =
        runtime.slice(0, externalIndex) +
        '        throw new Error("External runtime modules are disabled in the production site");' +
        runtime.slice(externalEnd + externalEndMarker.length);

    runtime = replaceSection(
        runtime,
        "  function loadReactUmd() {",
        "\n  function init() {",
        `  function loadReactUmd() {\n    if (window.React && window.ReactDOM) return Promise.resolve();\n    return Promise.reject(new Error("The locally bundled React runtime did not load"));\n  }`,
        "React loader",
    );
    runtime = replaceSection(
        runtime,
        "    const notifyHost = () => {",
        "\n    const streams = createStreamTracker();",
        "    const notifyHost = () => {};",
        "design-host notifier",
    );
    runtime = replaceSection(
        runtime,
        "    function postDesignMode(mode) {",
        "\n    function setDesignDocMode(mode) {",
        "    function postDesignMode(_mode) {}",
        "design-mode notifier",
    );

    runtime = runtime
        .replaceAll(
            "https://unpkg.com/react@18.3.1/umd/react.production.min.js",
            "./vendor/react.production.min.js",
        )
        .replaceAll(
            "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js",
            "./vendor/react-dom.production.min.js",
        )
        .replaceAll("https://unpkg.com/@babel/standalone@7.29.0/babel.min.js", "")
        .replace(/\bfetch\(/gu, "offlineFetch(");

    runtime =
        `function offlineFetch(_input) {\n` +
        `  return Promise.reject(new Error("Runtime network access is disabled; this site is self-contained"));\n` +
        `}\nwindow.__resources = window.__resources || Object.create(null);\n` +
        runtime;

    const forbidden = ["unpkg.com", "new Function(", "postMessage(", "fetch("];
    for (const marker of forbidden) {
        if (runtime.includes(marker)) {
            throw new Error(
                `Production archive runtime still contains forbidden marker: ${marker}`,
            );
        }
    }
    return runtime;
}

function publicFiles(packageRoot) {
    const archiveRoot = resolve(packageRoot, "archive");
    const screenshotRoot = resolve(packageRoot, "../../..", "docs", "screenshots");
    const groups = ["assets", "vendor"];
    const archiveFiles = groups.flatMap((group) =>
        readdirSync(join(archiveRoot, group), { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => ({
                fileName: `${group}/${entry.name}`,
                absolutePath: join(archiveRoot, group, entry.name),
            })),
    );
    const screenshotFiles = readdirSync(screenshotRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
        .map((entry) => ({
            fileName: `assets/captures/${entry.name}`,
            absolutePath: join(screenshotRoot, entry.name),
        }));
    return [...archiveFiles, ...screenshotFiles];
}

function createArchiveMiddleware(files, prefix, readAsset = readFileSync) {
    return (request, response, next) => {
        const encodedPath = String(request.url ?? "").split("?")[0];
        let requestPath;
        try {
            requestPath = decodeURIComponent(encodedPath);
        } catch {
            response.statusCode = 400;
            response.setHeader("Content-Type", "text/plain; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("Content-Length", String(MALFORMED_REQUEST_BODY.length));
            response.end(MALFORMED_REQUEST_BODY);
            return;
        }

        const relative = requestPath.startsWith(prefix)
            ? requestPath.slice(prefix.length)
            : requestPath.replace(/^\//u, "");
        const file = files.find((candidate) => candidate.fileName === relative);
        if (!file) return next();
        response.statusCode = 200;
        response.setHeader(
            "Content-Type",
            MIME_TYPES[extname(file.absolutePath).toLowerCase()] ?? "application/octet-stream",
        );
        response.setHeader("Cache-Control", "no-store");
        response.end(readAsset(file.absolutePath));
    };
}

function selfCheckResponse() {
    const capture = { body: undefined, endCalls: 0, headers: new Map() };
    capture.response = {
        statusCode: 0,
        setHeader(name, value) {
            capture.headers.set(name.toLowerCase(), String(value));
        },
        end(body) {
            capture.body = body;
            capture.endCalls += 1;
        },
    };
    return capture;
}

function runArchiveMiddlewareSelfChecks() {
    const files = [{ fileName: "assets/fixture.txt", absolutePath: "/fixture.txt" }];
    let reads = 0;
    const middleware = createArchiveMiddleware(files, "/worldlens/", (absolutePath) => {
        reads += 1;
        if (absolutePath !== "/fixture.txt") {
            throw new Error("Archive middleware self-check routed the wrong asset path");
        }
        return "fixture body";
    });

    const asset = selfCheckResponse();
    let assetNextCalls = 0;
    middleware({ url: "/worldlens/assets/fixture%2Etxt?cache=1" }, asset.response, () => {
        assetNextCalls += 1;
    });
    if (
        asset.response.statusCode !== 200 ||
        asset.body !== "fixture body" ||
        asset.endCalls !== 1 ||
        assetNextCalls !== 0 ||
        reads !== 1 ||
        asset.headers.get("content-type") !== MIME_TYPES[".txt"] ||
        asset.headers.get("cache-control") !== "no-store"
    ) {
        throw new Error("Archive middleware self-check did not route a normal encoded asset");
    }

    const malformed = selfCheckResponse();
    let malformedNextCalls = 0;
    middleware({ url: "/worldlens/assets/%E0%A4%A" }, malformed.response, () => {
        malformedNextCalls += 1;
    });
    if (
        malformed.response.statusCode !== 400 ||
        malformed.body !== MALFORMED_REQUEST_BODY ||
        malformed.endCalls !== 1 ||
        malformedNextCalls !== 0 ||
        reads !== 1 ||
        malformed.headers.get("content-type") !== "text/plain; charset=utf-8" ||
        malformed.headers.get("cache-control") !== "no-store" ||
        malformed.headers.get("content-length") !== String(MALFORMED_REQUEST_BODY.length)
    ) {
        throw new Error("Archive middleware self-check did not contain a malformed request URL");
    }
}

runArchiveMiddlewareSelfChecks();

export function canonicalArchiveSitePlugin(packageRoot, base) {
    const files = publicFiles(packageRoot);
    return {
        name: "worldlens-canonical-archive-site",
        enforce: "pre",
        resolveId(id) {
            if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
            return null;
        },
        load(id) {
            if (id === RESOLVED_VIRTUAL_ID) return buildCanonicalRuntime(packageRoot);
            return null;
        },
        transformIndexHtml(html) {
            const logicScript =
                /(<script type="text\/x-dc"[^>]*data-dc-script[^>]*>)[\s\S]*?(<\/script>\s*<\/body>)/u;
            if (!logicScript.test(html)) {
                throw new Error("Canonical archive index is missing its production logic trigger");
            }
            return html.replace(logicScript, "$1class Component extends DCLogic {}$2");
        },
        buildStart() {
            for (const file of files) {
                this.emitFile({
                    type: "asset",
                    fileName: file.fileName,
                    source: readFileSync(file.absolutePath),
                });
            }
        },
        configureServer(server) {
            const prefix = base.endsWith("/") ? base : `${base}/`;
            server.middlewares.use(createArchiveMiddleware(files, prefix));
        },
    };
}
