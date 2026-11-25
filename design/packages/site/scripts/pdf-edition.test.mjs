import { test } from "node:test";
import assert from "node:assert/strict";

import { PDFDocument, PDFName } from "pdf-lib";

import {
    PHONE_PAGE,
    assertInventoryMatches,
    assertLinksResolve,
    buildIndex,
    docAnchor,
    expectedInventory,
    renderMarkdownDocument,
    resolveInternalHref,
} from "./pdf-edition-lib.mjs";
import { checkOutline, checkPageSizes, verifyPdf } from "./verify-pdf-edition.mjs";

const article = (id, title) => ({
    id,
    title,
    summary: "s",
    category: "application",
    status: "shipped",
    statusNote: "n",
    sections: [{ id: "behaviour", title: "Behaviour", blocks: [{ kind: "paragraph", content: "text" }] }],
    suggested: [],
    sources: [],
});

const docs = [
    { path: "docs/alpha.md", source: "# Alpha\n\nSee [beta](./beta.md#setup) and [gone](./missing.md).\n\n## Setup\n\ntext\n" },
    { path: "docs/sub/beta.md", source: "# Beta\n\n## Setup\n\nBack to [alpha](../alpha.md).\n" },
];

test("anchors are stable and derived only from the path", () => {
    assert.equal(docAnchor("docs/sub/beta.md"), "d-docs--sub--beta");
    assert.equal(docAnchor("docs/sub/beta.md"), docAnchor("docs/sub/beta.md"));
    assert.throws(
        () =>
            buildIndex({
                articles: [],
                docs: [
                    { path: "docs/a b.md", source: "# A" },
                    { path: "docs/a-b.md", source: "# B" },
                ],
                wiki: [],
            }),
        /Duplicate document anchor/u,
    );
});

test("internal links resolve to anchors, repository URLs included", () => {
    const index = buildIndex({ articles: [article("one", "One")], docs, wiki: [] });
    // docs/beta.md does not exist (the file is docs/sub/beta.md), so the link has no target.
    assert.equal(resolveInternalHref("./beta.md#setup", "docs/alpha.md", index), null);
    assert.equal(resolveInternalHref("sub/beta.md#setup", "docs/alpha.md", index), "d-docs--sub--beta--setup");
    assert.equal(resolveInternalHref("../alpha.md", "docs/sub/beta.md", index), "d-docs--alpha");
    assert.equal(
        resolveInternalHref("https://github.com/Ding-Ding-Projects/worldlens/blob/main/docs/alpha.md", "", index),
        "d-docs--alpha",
    );
    assert.equal(resolveInternalHref("https://example.com/x", "", index), null);
    assert.equal(resolveInternalHref("sub/beta.md#nope", "docs/alpha.md", index), "d-docs--sub--beta");
});

test("Markdown rendering rewrites live links and drops dead relative ones", () => {
    const index = buildIndex({ articles: [], docs, wiki: [] });
    const { html, title } = renderMarkdownDocument(docs[1].source, "docs/sub/beta.md", { index });
    assert.equal(title, "Beta");
    assert.match(html, /href="#d-docs--alpha"/u);
    const alpha = renderMarkdownDocument(docs[0].source, "docs/alpha.md", { index }).html;
    assert.doesNotMatch(alpha, /missing\.md/u);
    assert.match(alpha, /gone/u);
});

test("assertLinksResolve fails on a missing target and a repeated id", () => {
    assert.equal(assertLinksResolve('<h2 id="a"></h2><a href="#a">x</a>'), 1);
    assert.throws(() => assertLinksResolve('<a href="#nowhere">x</a>'), /no target/u);
    assert.throws(() => assertLinksResolve('<h2 id="a"></h2><h2 id="a"></h2>'), /Duplicate id/u);
});

test("inventory equality fails when an article or server article is missing", () => {
    const articles = [article("one", "One"), article("two", "Two")];
    const expected = expectedInventory({ articles, serverArticlePaths: ["docs/alpha.md"], docs, wiki: [] });
    const all = ["article:one", "article:two", "document:docs/alpha.md", "document:docs/sub/beta.md"];
    assertInventoryMatches(expected, all);
    assert.throws(() => assertInventoryMatches(expected, all.filter((key) => key !== "article:two")), /1 missing/u);
    assert.throws(() => assertInventoryMatches(expected, [...all, "article:ghost"]), /1 extra/u);
    const noServer = expectedInventory({ articles, serverArticlePaths: ["docs/not-there.md"], docs, wiki: [] });
    assert.throws(() => assertInventoryMatches(noServer, all), /Server articles missing/u);
});

test("page size check accepts phone pages and rejects others", () => {
    const good = { width: PHONE_PAGE.widthPx * 0.75, height: PHONE_PAGE.heightPx * 0.75 };
    assert.deepEqual(checkPageSizes([good, good]), []);
    assert.equal(checkPageSizes([good, { width: 612, height: 792 }]).length, 1);
});

test("outline check compares titles in order and tolerates re-flowed whitespace", () => {
    const inventory = { entries: [{ title: "One, two" }, { title: "Three" }] };
    const outline = (titles) => [
        { title: "Contents", depth: 1, children: [] },
        { title: "Part 1. Site articles", depth: 1, children: titles.map((title) => ({ title, depth: 2, children: [] })) },
    ];
    assert.deepEqual(checkOutline(outline(["One,two", "Three"]), inventory), []);
    assert.equal(checkOutline(outline(["One, two"]), inventory).length > 0, true);
    assert.equal(checkOutline(outline(["Three", "One, two"]), inventory).length > 0, true);
});

async function tinyPdf(destinationIsRealPage) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([PHONE_PAGE.widthPx * 0.75, PHONE_PAGE.heightPx * 0.75]);
    const target = destinationIsRealPage ? page.ref : doc.context.register(doc.context.obj({}));
    const annotation = doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [10, 10, 100, 30],
        Border: [0, 0, 0],
        Dest: [target, PDFName.of("Fit")],
    });
    page.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(annotation)]));
    return doc.save();
}

test("the verifier refuses a PDF whose internal link has no destination page", async () => {
    const inventory = { entries: [] };
    const broken = await verifyPdf(await tinyPdf(false), inventory);
    assert.ok(broken.problems.some((problem) => /do not resolve/u.test(problem)), broken.problems.join("; "));
    const fine = await verifyPdf(await tinyPdf(true), inventory);
    assert.ok(!fine.problems.some((problem) => /do not resolve/u.test(problem)), fine.problems.join("; "));
    assert.equal(fine.facts.pages, 1);
    assert.equal(fine.facts.internalLinks, 1);
});
