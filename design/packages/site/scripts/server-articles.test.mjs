import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadServerArticles, markdownArticle } from "./server-articles.mjs";
import { buildCanonicalRuntime, mergeServerArticleCatalog } from "./archive-site-plugin.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
test("production runtime includes each independently required current server article", () => {
    const articles = loadServerArticles(root);
    assert.deepEqual(articles.map((article) => article.id), ["mcserver-hosting", "mcserver-adoption-ownership", "mcserver-ssh-process-lifecycle"]);
    const runtime = buildCanonicalRuntime(root);
    for (const article of articles) assert.ok(runtime.includes(JSON.stringify(article)), `${article.id} is missing from production runtime`);
    assert.ok(runtime.includes("Forced termination is unsupported"));
    assert.ok(runtime.includes("## 廣東話") || runtime.includes('"heading":"廣東話"'));
});
test("complete paragraphs, tables, lists and fenced code survive conversion", () => {
    const article = markdownArticle("# Example\n\nIntro\nsecond line\n\n## Settings\n\n| Name | Value |\n| --- | --- |\n| a | b |\n\n- One\n- Two\n\n```sh\necho '# Literal heading'\n```\n\n## 廣東話\n\n完整內容。", "example");
    assert.equal(article.lede, "Intro\nsecond line");
    assert.equal(article.sections[1].blocks[0].v, "| Name | Value |\n| --- | --- |\n| a | b |");
    assert.equal(article.sections[1].blocks[0].t, "code");
    assert.equal(article.sections[1].blocks[1].t, "ul");
    assert.deepEqual(article.sections[1].blocks[1].items, ["One", "Two"]);
    assert.equal(article.sections[1].blocks[2].t, "code");
    assert.equal(article.sections[1].blocks[2].v, "echo '# Literal heading'");
    assert.equal(article.sections[2].blocks[0].v, "完整內容。");
    assert.deepEqual(markdownArticle("# Ordered\n\n1. First\n2. Second", "ordered").sections[0].blocks[0], { t: "ol", items: ["First", "Second"] });
});
test("all 59 originals survive and incomplete or duplicate merged catalogues fail", () => {
    const archive = JSON.parse(readFileSync(resolve(root, "archive/content/articles.json"), "utf8"));
    const current = loadServerArticles(root);
    const merged = mergeServerArticleCatalog(archive, current);
    assert.equal(merged.count, 62);
    assert.deepEqual(merged.articles.slice(0, 59), archive.articles);
    assert.throws(() => mergeServerArticleCatalog(archive, current.slice(1)), /exactly 62/u);
    assert.throws(() => mergeServerArticleCatalog(archive, [{ ...current[0], id: archive.articles[0].id }, ...current.slice(1)]), /id duplicates/u);
    assert.throws(() => mergeServerArticleCatalog(archive, [{ ...current[0], title: archive.articles[0].title }, ...current.slice(1)]), /title duplicates/u);
});
test("malformed source fails rather than silently dropping the article", () => {
    assert.throws(() => markdownArticle("Missing title", "bad"), /initial title/u);
    assert.throws(() => markdownArticle("# Example\n```\nunclosed", "bad"), /unclosed code fence/u);
});
