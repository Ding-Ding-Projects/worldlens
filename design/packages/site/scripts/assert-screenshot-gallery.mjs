import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildScreenshotCatalog } from "./archive-site-plugin.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const screenshotRoot = fileURLToPath(new URL("../../../../docs/screenshots/", import.meta.url));
const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(
    /\r\n?/gu,
    "\n",
);
const pluginSource = readFileSync(
    new URL("./archive-site-plugin.mjs", import.meta.url),
    "utf8",
).replace(/\r\n?/gu, "\n");

const requiredMarkers = [
    [
        "metadata field catalogue",
        'shots:[["cat","Category"],["title","Capture titles"],["description","Description"],["state","Recorded state"],["theme","Theme"],["viewport","Viewport"],["commit","Source commit and provenance"]]',
    ],
    [
        "plain-text gallery field",
        'placeholder="Search category, title, state, theme, viewport, or commit"',
    ],
    [
        "adjacent gallery regex builder",
        'onClick="{{ toggleshotsBuilder }}" aria-label="Regex builder for screenshots"',
    ],
    ["dynamic category filters", 'const shotFilters = ["All"].concat(shotCategories).map((f) => {'],
    ["category result grouping", "const shotGroups = shotCategories.map((cat) => ({"],
    ["grouped gallery render", '<sc-for list="{{ shotGroups }}" as="g"'],
    ["honest no-match state", 'const shotsEmpty = "No screenshots match this search in "'],
    ["evidence-backed catalog builder", "export function buildScreenshotCatalog(packageRoot) {"],
    ["catalog injection", "canonicalLogic(indexSource, articles, screenshots)"],
    ["capture asset emission", "fileName: `assets/captures/${entry.name}`"],
];

function missing(indexValue, pluginValue) {
    return requiredMarkers
        .filter(([, marker]) => !(indexValue.includes(marker) || pluginValue.includes(marker)))
        .map(([label]) => label);
}

const catalog = buildScreenshotCatalog(packageRoot);
const pngFiles = readdirSync(screenshotRoot)
    .filter((file) => file.toLowerCase().endsWith(".png"))
    .sort();
const catalogFiles = catalog.map((record) => record.file).sort();

if (JSON.stringify(catalogFiles) !== JSON.stringify(pngFiles)) {
    throw new Error("The published gallery does not cover the exact committed PNG inventory");
}
if (new Set(catalogFiles).size !== catalogFiles.length) {
    throw new Error("The published gallery repeats a committed PNG");
}
for (const record of catalog) {
    for (const key of [
        "cat",
        "src",
        "file",
        "title",
        "caption",
        "description",
        "state",
        "alt",
        "theme",
        "viewport",
        "commit",
        "capturedAt",
    ]) {
        if (typeof record[key] !== "string" || !record[key].trim()) {
            throw new Error(`${record.file} has no searchable ${key}`);
        }
    }
}

const byFile = new Map(catalog.map((record) => [record.file, record]));
for (const retired of ["notifications-toast.png", "notifications-corner.png"]) {
    if (byFile.get(retired)?.cat !== "Historical and retired") {
        throw new Error(`${retired} is not labelled as retired evidence`);
    }
}
for (const current of ["notifications-rail-bell.png", "notifications-history.png"]) {
    if (byFile.get(current)?.cat === "Historical and retired") {
        throw new Error(`${current} is incorrectly labelled as retired evidence`);
    }
}

const baselineMissing = missing(indexSource, pluginSource);
if (baselineMissing.length) {
    throw new Error(`Screenshot gallery wiring is incomplete: ${baselineMissing.join(", ")}`);
}

let mutationCount = 0;
for (const [label, marker] of requiredMarkers) {
    const inIndex = indexSource.includes(marker);
    const inPlugin = pluginSource.includes(marker);
    if (inIndex === inPlugin) {
        throw new Error(
            `${label} must have one exact owner; found ${Number(inIndex) + Number(inPlugin)}`,
        );
    }
    const mutatedIndex = inIndex ? indexSource.replace(marker, "") : indexSource;
    const mutatedPlugin = inPlugin ? pluginSource.replace(marker, "") : pluginSource;
    if (!missing(mutatedIndex, mutatedPlugin).includes(label)) {
        throw new Error(`Screenshot gallery negative guard stayed green after removing ${label}`);
    }
    mutationCount += 1;
}

console.log(
    `Screenshot gallery complete: ${catalog.length} committed PNGs, ${new Set(catalog.map((record) => record.cat)).size} categories, ${requiredMarkers.length} exact wiring boundaries and ${mutationCount} negative mutations.`,
);
