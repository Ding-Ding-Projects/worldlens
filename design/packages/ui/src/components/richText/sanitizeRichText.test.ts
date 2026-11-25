/**
 * @vitest-environment jsdom
 *
 * What formatted text may contain when it is stored and shown.
 */

import { describe, expect, it } from "vitest";

import {
    isEmptyRichText,
    looksLikeHtml,
    plainTextToHtml,
    richTextToPlain,
    sanitizeRichText,
    stripTagsToText,
    toEditorHtml,
} from "./sanitizeRichText.js";

describe("sanitizeRichText", () => {
    it("keeps ordinary formatting", () => {
        const html = '<p>A <strong>bold</strong> <em>word</em></p><ul><li>one</li></ul><a href="https://example.org/">link</a>';
        expect(sanitizeRichText(html)).toBe(html);
    });

    it("keeps tables", () => {
        expect(sanitizeRichText("<table><tbody><tr><td>cell</td></tr></tbody></table>")).toContain("<td>cell</td>");
    });

    it("removes scripts, handlers, script URLs, frames, forms and styles", () => {
        const hostile =
            '<p onclick="a()">x</p><script>b()</script><img src="x" onerror="c()"><a href="javascript:d()">y</a>' +
            '<iframe src="https://example.invalid"></iframe><form action="/z"><input name="q"></form><style>p{}</style>' +
            '<svg onload="e()"></svg><div data-secret="1">z</div>';
        const out = sanitizeRichText(hostile);
        expect(out).not.toMatch(/<script|onclick|onerror|onload|javascript:|<iframe|<form|<input|<style|<svg|data-secret/i);
        expect(out).toContain("x");
        expect(out).toContain("z");
    });

    it("returns an empty string for an empty value", () => {
        expect(sanitizeRichText("")).toBe("");
    });
});

describe("legacy plain notes", () => {
    it("recognises markup and plain text", () => {
        expect(looksLikeHtml("<p>x</p>")).toBe(true);
        expect(looksLikeHtml("Two lines\nand a < b")).toBe(false);
    });

    it("turns plain text into escaped paragraphs, one per line", () => {
        expect(plainTextToHtml("a & b\r\nc < d")).toBe("<p>a &amp; b</p><p>c &lt; d</p>");
    });

    it("gives the editor paragraphs for plain text and cleaned markup for formatted text", () => {
        expect(toEditorHtml("one\ntwo")).toBe("<p>one</p><p>two</p>");
        expect(toEditorHtml('<p onclick="x()">kept</p>')).toBe("<p>kept</p>");
        expect(toEditorHtml("")).toBe("");
    });

    it("reads formatted text as the words a search should match", () => {
        expect(richTextToPlain("<p>Spawn <strong>base</strong></p><ul><li>Chest</li></ul>")).toContain("Spawn base");
        expect(richTextToPlain("<p>Spawn <strong>base</strong></p>")).not.toContain("<");
        expect(richTextToPlain("plain & simple")).toBe("plain & simple");
    });

    it("tells an empty editor from one with content", () => {
        expect(isEmptyRichText("<p><br></p>")).toBe(true);
        expect(isEmptyRichText("<p>words</p>")).toBe(false);
        expect(isEmptyRichText("<p><img src=\"a\"></p>")).toBe(false);
    });

    it("strips tags and decodes the entities a note can hold", () => {
        expect(stripTagsToText("<p>a &amp; b &lt;c&gt;</p><script>x()</script>")).toBe("a & b <c>");
    });
});
