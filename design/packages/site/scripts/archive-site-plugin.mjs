import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const VIRTUAL_ID = "virtual:worldlens-archive-runtime";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

const MIME_TYPES = {
    ".gif": "image/gif",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".txt": "text/plain; charset=utf-8",
};

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
    const indexSource = readFileSync(resolve(packageRoot, "index.html"), "utf8");
    const supportSource = readFileSync(resolve(archiveRoot, "support.js"), "utf8");
    const articleCatalog = JSON.parse(
        readFileSync(resolve(archiveRoot, "content", "articles.json"), "utf8"),
    );

    if (articleCatalog.count !== 59 || articleCatalog.articles?.length !== 59) {
        throw new Error(
            `Canonical archive must contain exactly 59 articles; found ${articleCatalog.articles?.length ?? 0}`,
        );
    }

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
            server.middlewares.use((request, response, next) => {
                const requestPath = decodeURIComponent((request.url ?? "").split("?")[0]);
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
                response.end(readFileSync(file.absolutePath));
            });
        },
    };
}
