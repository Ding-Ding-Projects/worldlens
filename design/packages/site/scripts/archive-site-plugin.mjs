import { readFileSync, readdirSync } from "node:fs";
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

function canonicalLogic(indexSource, articles) {
    const match = indexSource.match(
        /<script type="text\/x-dc"[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>\s*<\/body>/u,
    );
    if (!match) throw new Error("Canonical archive index is missing its data-dc-script logic");

    let logic = match[1];
    const articleFetch = /\n\s{4}fetch\("content\/articles\.json"\)[\s\S]*?\.catch\(\(\) => this\.setState\(\{ loaded:true \}\)\);/u;
    if (!articleFetch.test(logic)) {
        throw new Error("Canonical archive logic no longer contains the expected article acquisition block");
    }
    logic = logic.replace(
        articleFetch,
        `\n    this.setState({ articles:${JSON.stringify(articles)}, loaded:true });`,
    );
    logic = logic.replace("class Component extends DCLogic", "class Component extends StreamableLogic");
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

    const logic = canonicalLogic(indexSource, articleCatalog.articles);
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

    const forbidden = ["unpkg.com", "new Function(", 'postMessage(', "fetch("];
    for (const marker of forbidden) {
        if (runtime.includes(marker)) {
            throw new Error(`Production archive runtime still contains forbidden marker: ${marker}`);
        }
    }
    return runtime;
}

function publicFiles(packageRoot) {
    const archiveRoot = resolve(packageRoot, "archive");
    const groups = ["assets", "vendor"];
    return groups.flatMap((group) =>
        readdirSync(join(archiveRoot, group), { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => ({
                fileName: `${group}/${entry.name}`,
                absolutePath: join(archiveRoot, group, entry.name),
            })),
    );
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
    middleware(
        { url: "/worldlens/assets/fixture%2Etxt?cache=1" },
        asset.response,
        () => {
            assetNextCalls += 1;
        },
    );
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
    middleware(
        { url: "/worldlens/assets/%E0%A4%A" },
        malformed.response,
        () => {
            malformedNextCalls += 1;
        },
    );
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
            const logicScript = /(<script type="text\/x-dc"[^>]*data-dc-script[^>]*>)[\s\S]*?(<\/script>\s*<\/body>)/u;
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
