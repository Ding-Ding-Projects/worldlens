import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, plainText, safeHref } from "./providerMarkdown.js";

describe("provider Markdown", () => {
    it("parses the shapes release notes use", () => {
        const blocks = parseMarkdown(["## What's new :sparkles:", "", "- **Fast** tiles", "- [x] done", "- [ ] later", "", "1. one", "2. two", "", "> quoted", "", "```ts", "const a = 1;", "```", "", "| A | B |", "| --- | --- |", "| 1 | 2 |", "", "---"].join("\n"));
        expect(blocks.map((b) => b.kind)).toEqual(["heading", "list", "list", "quote", "code", "table", "rule"]);
        expect(plainText(blocks)).toContain("What's new ✨");
        const tasks = blocks[1]!.kind === "list" ? blocks[1]!.items.map((i) => i.checked) : [];
        expect(tasks).toEqual([null, true, false]);
    });

    it("keeps raw HTML as text, never as markup", () => {
        const blocks = parseMarkdown('<img src=x onerror="alert(1)"> <script>alert(2)</script>');
        expect(blocks).toEqual([{ kind: "paragraph", children: [{ kind: "text", text: '<img src=x onerror="alert(1)"> <script>alert(2)</script>' }] }]);
    });

    it("keeps only safe links and resolves relative ones against the base", () => {
        expect(safeHref("javascript:alert(1)")).toBeNull();
        expect(safeHref("data:text/html,x")).toBeNull();
        expect(safeHref("//evil.example/x")).toBeNull();
        expect(safeHref("docs/a.md")).toBeNull();
        expect(safeHref("docs/a.md", "https://github.com/o/r/blob/main/")).toBe("https://github.com/o/r/blob/main/docs/a.md");
        expect(safeHref("https://example.com/a b")).toBe("https://example.com/a%20b");
        const nodes = parseInline("[click](javascript:alert(1)) and https://example.com/x.");
        expect(nodes.some((n) => n.kind === "link" && n.href.startsWith("javascript"))).toBe(false);
        expect(nodes.find((n) => n.kind === "link")).toMatchObject({ href: "https://example.com/x" });
    });

    it("never fetches images: they become links naming the image", () => {
        const [node] = parseInline("![map](https://example.com/m.png)");
        expect(node).toEqual({ kind: "image", href: "https://example.com/m.png", alt: "map" });
    });

    it("handles emphasis, code and escapes without eating words", () => {
        expect(parseInline("snake_case_name stays").map((n) => n.kind)).toEqual(["text"]);
        expect(parseInline("`a*b*c` and \\*not\\*").map((n) => n.kind)).toEqual(["code", "text"]);
        expect(parseInline("**bold** *it* ~~gone~~").map((n) => n.kind)).toEqual(["strong", "text", "em", "text", "del"]);
    });
});
