/**
 * Read the PDF edition back and check it against its inventory.
 *
 *   node scripts/verify-pdf-edition.mjs [--dir <dir>] [--version <tag>]
 *
 * Checks: every page is phone size, the outline lists exactly the inventory (one level-2
 * entry per article, in order, under the part titles), the document has a linked contents
 * page, and every internal link resolves to a real destination inside the file.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from "pdf-lib";

import { PART_TITLES, PHONE_PAGE } from "./pdf-edition-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const POINTS_PER_PX = 0.75;
const TOLERANCE_POINTS = 1.5;

function text(object) {
    if (object instanceof PDFString || object instanceof PDFHexString) return object.decodeText();
    return "";
}

function lookup(doc, object) {
    return object instanceof PDFRef ? doc.context.lookup(object) : object;
}

/** Name tree lookup (`/Names` leaves and `/Kids`), returning the destination object. */
function namedDestinations(doc) {
    const result = new Map();
    const catalog = doc.catalog;
    const legacy = lookup(doc, catalog.get(PDFName.of("Dests")));
    if (legacy instanceof PDFDict) {
        for (const [key, value] of legacy.entries()) result.set(key.decodeText?.() ?? String(key).replace(/^\//u, ""), value);
    }
    const names = lookup(doc, catalog.get(PDFName.of("Names")));
    const root = names instanceof PDFDict ? lookup(doc, names.get(PDFName.of("Dests"))) : undefined;
    const walk = (node) => {
        if (!(node instanceof PDFDict)) return;
        const leaves = lookup(doc, node.get(PDFName.of("Names")));
        if (leaves instanceof PDFArray) {
            for (let i = 0; i + 1 < leaves.size(); i += 2) result.set(text(lookup(doc, leaves.get(i))), leaves.get(i + 1));
        }
        const kids = lookup(doc, node.get(PDFName.of("Kids")));
        if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i += 1) walk(lookup(doc, kids.get(i)));
    };
    walk(root);
    return result;
}

function destinationPageRef(doc, dest) {
    const value = lookup(doc, dest);
    if (value instanceof PDFDict) return destinationPageRef(doc, value.get(PDFName.of("D")));
    if (value instanceof PDFArray && value.size() > 0) {
        const first = value.get(0);
        return first instanceof PDFRef ? first : null;
    }
    return null;
}

function readOutline(doc) {
    const outlines = lookup(doc, doc.catalog.get(PDFName.of("Outlines")));
    if (!(outlines instanceof PDFDict)) return [];
    const walk = (node, depth) => {
        const items = [];
        let ref = node.get(PDFName.of("First"));
        while (ref) {
            const item = lookup(doc, ref);
            if (!(item instanceof PDFDict)) break;
            items.push({ title: text(lookup(doc, item.get(PDFName.of("Title")))), depth, children: walk(item, depth + 1) });
            ref = item.get(PDFName.of("Next"));
        }
        return items;
    };
    return walk(outlines, 1);
}

/** Pure check of an outline tree against the inventory; exported for tests. */
export function checkOutline(outline, inventory) {
    const problems = [];
    // Chromium re-flows whitespace when it writes outline titles, and where a title wraps
    // depends on the fonts of the machine that rendered it, so compare without whitespace.
    const squash = (value) => value.replace(/\s+/gu, "");
    const partTitles = Object.values(PART_TITLES).map(squash);
    const partNodes = outline.filter((node) => partTitles.includes(squash(node.title)));
    const articleTitles = partNodes.flatMap((part) => part.children.map((child) => child.title));
    const want = inventory.entries.map((entry) => entry.title);
    if (articleTitles.length !== want.length) {
        problems.push(
            `outline has ${articleTitles.length} article entries, inventory has ${want.length}; top-level outline entries: ${outline
                .map((node) => `${JSON.stringify(node.title)} (${node.children.length})`)
                .join(", ")}`,
        );
    }
    for (let i = 0; i < Math.min(want.length, articleTitles.length); i += 1) {
        if (squash(articleTitles[i]) !== squash(want[i])) {
            problems.push(`outline entry ${i + 1} is "${articleTitles[i]}", inventory says "${want[i]}"`);
            break;
        }
    }
    if (!outline.some((node) => squash(node.title) === "Contents")) problems.push("outline has no Contents entry");
    return problems;
}

export function checkPageSizes(sizes) {
    const wantW = PHONE_PAGE.widthPx * POINTS_PER_PX;
    const wantH = PHONE_PAGE.heightPx * POINTS_PER_PX;
    const bad = sizes.filter((s) => Math.abs(s.width - wantW) > TOLERANCE_POINTS || Math.abs(s.height - wantH) > TOLERANCE_POINTS);
    return bad.length ? [`${bad.length} pages are not ${wantW} x ${wantH} pt (first: ${bad[0].width} x ${bad[0].height})`] : [];
}

export async function verifyPdf(bytes, inventory) {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const problems = [];
    const pages = doc.getPages();
    if (pages.length === 0) problems.push("the PDF has no pages");
    problems.push(...checkPageSizes(pages.map((page) => page.getSize())));
    const outline = readOutline(doc);
    problems.push(...checkOutline(outline, inventory));

    const pageRefs = new Set(pages.map((page) => page.ref.toString()));
    const named = namedDestinations(doc);
    let internal = 0;
    let external = 0;
    let unresolved = 0;
    let firstUnresolved = "";
    pages.forEach((page, pageIndex) => {
        const annots = lookup(doc, page.node.get(PDFName.of("Annots")));
        if (!(annots instanceof PDFArray)) return;
        for (let i = 0; i < annots.size(); i += 1) {
            const annot = lookup(doc, annots.get(i));
            if (!(annot instanceof PDFDict)) continue;
            if (lookup(doc, annot.get(PDFName.of("Subtype")))?.toString() !== "/Link") continue;
            const action = lookup(doc, annot.get(PDFName.of("A")));
            if (action instanceof PDFDict && lookup(doc, action.get(PDFName.of("S")))?.toString() === "/URI") {
                external += 1;
                continue;
            }
            let dest = annot.get(PDFName.of("Dest"));
            if (!dest && action instanceof PDFDict) dest = action.get(PDFName.of("D"));
            let value = lookup(doc, dest);
            if (value instanceof PDFString || value instanceof PDFHexString) value = named.get(text(value));
            else if (value instanceof PDFName) value = named.get(value.decodeText());
            internal += 1;
            const ref = value ? destinationPageRef(doc, value) : null;
            if (!ref || !pageRefs.has(ref.toString())) {
                unresolved += 1;
                firstUnresolved ||= `page ${pageIndex + 1} link ${i + 1}`;
            }
        }
    });
    if (internal === 0) problems.push("the PDF has no internal links");
    if (unresolved) problems.push(`${unresolved} internal links do not resolve to a page (first: ${firstUnresolved})`);
    const contentsLinks = inventory.entries.length;
    if (internal < contentsLinks) {
        problems.push(`expected at least ${contentsLinks} internal links (the contents page alone needs one per entry), found ${internal}`);
    }
    return {
        problems,
        facts: { pages: pages.length, outlineTopLevel: outline.length, internalLinks: internal, externalLinks: external, bytes: bytes.length },
    };
}

async function main() {
    const argv = process.argv.slice(2);
    const get = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
    const dir = resolve(get("dir") ?? join(here, "..", "pdf-out"));
    const inventoryName = get("version")
        ? `worldlens-docs-${get("version")}.inventory.json`
        : readdirSync(dir).find((name) => name.endsWith(".inventory.json"));
    if (!inventoryName) throw new Error(`No inventory file in ${dir}`);
    const inventory = JSON.parse(readFileSync(join(dir, inventoryName), "utf8"));
    const pdfName = inventoryName.replace(/\.inventory\.json$/u, ".pdf");
    const { problems, facts } = await verifyPdf(readFileSync(join(dir, pdfName)), inventory);
    console.log(`PDF edition ${pdfName}: ${JSON.stringify(facts)}`);
    console.log(
        `inventory: ${inventory.counts.articles} articles, ${inventory.counts.documents} documents, ${inventory.counts.wiki} wiki pages`,
    );
    if (problems.length) {
        for (const problem of problems) console.error(`FAIL: ${problem}`);
        process.exit(1);
    }
    console.log("PDF edition verified: page size, outline, contents links and internal links all check out.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(`PDF edition verification failed: ${error.stack ?? error}`);
        process.exit(1);
    });
}
