/**
 * The guard behind the rich text rule.
 *
 * Every field where a person formats text uses the one `RichTextField` (the bundled TinyMCE).
 * This test reads the whole package and fails in each direction a drift can take: a listed
 * field that lost its editor, an editor that is not listed, a new multi-line box nobody has
 * classified, a hand-rolled `contenteditable` editor, another rich text library, or any
 * reference to a Tiny host. A guard that scanned only for what it expected to find would stay
 * green while a new editor went unnoticed, so the list in `richTextInventory.ts` is written by
 * hand and compared with what the source really contains.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PLAIN_TEXT_BOXES, RICH_TEXT_FIELDS } from "./richTextInventory.js";
import { TINYMCE_PINNED_VERSION } from "./tinymceLoader.js";

const sourceRoot = fileURLToPath(new URL("../..", import.meta.url));
const packageRoot = fileURLToPath(new URL("../../..", import.meta.url));

function sourceFiles(dir: string): string[] {
    const found: string[] = [];
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
        else if (name.endsWith(".ts") || name.endsWith(".vue")) found.push(path);
    }
    return found;
}

interface SourceFile {
    readonly path: string;
    readonly text: string;
}

/** Every non-test source file: the product code the rule governs. */
const product: SourceFile[] = sourceFiles(sourceRoot)
    .filter((path) => !/\.test\.ts$/.test(path) && !path.endsWith("changelogData.generated.ts"))
    .map((path) => ({
        path: relative(sourceRoot, path).replace(/\\/g, "/"),
        text: readFileSync(path, "utf8"),
    }));

/** Files that name a forbidden thing only to forbid it. */
const rulebook = new Set(["components/richText/richTextInventory.ts"]);

function countMatches(text: string, pattern: RegExp): number {
    return [...text.matchAll(pattern)].length;
}

describe("the listed rich text fields really carry the editor", () => {
    it("lists at least the marker note, so the list cannot go vacuous", () => {
        expect(RICH_TEXT_FIELDS.map((entry) => entry.id)).toContain("marker-note");
    });

    for (const entry of RICH_TEXT_FIELDS) {
        it(`${entry.id} mounts RichTextField with data-test="${entry.dataTest}"`, () => {
            const file = product.find((candidate) => candidate.path === entry.file);
            expect(file, `${entry.file} is not in the package`).toBeDefined();
            const tags = [...file!.text.matchAll(/<RichTextField\b[\s\S]*?\/>/g)].map((m) => m[0]);
            expect(
                tags.some((tag) => tag.includes(`data-test="${entry.dataTest}"`)),
                `${entry.file} lost the RichTextField that ${entry.id} names`,
            ).toBe(true);
        });
    }

    it("lists every place an editor is mounted", () => {
        const mounted = product
            .filter((file) => file.path !== "components/richText/RichTextField.vue")
            .map((file) => ({ path: file.path, count: countMatches(file.text, /<RichTextField\b/g) }))
            .filter((entry) => entry.count > 0)
            .map((entry) => `${entry.path} x${entry.count}`)
            .sort();
        const listed = RICH_TEXT_FIELDS.reduce<Record<string, number>>((all, entry) => {
            all[entry.file] = (all[entry.file] ?? 0) + 1;
            return all;
        }, {});
        const expected = Object.entries(listed)
            .map(([path, count]) => `${path} x${count}`)
            .sort();
        expect(mounted, "an editor is mounted that richTextInventory.ts does not list").toEqual(expected);
    });
});

describe("every other multi-line box is classified", () => {
    const opening = /<(?:v-?textarea|textarea)\b/gi;
    const counted = product
        .filter((file) => !file.path.startsWith("components/richText/"))
        .map((file) => ({ path: file.path, count: countMatches(file.text, opening) }))
        .filter((entry) => entry.count > 0);

    it("matches the hand-written list file by file and count by count", () => {
        const actual = Object.fromEntries(counted.map((entry) => [entry.path, entry.count]));
        const listed = Object.fromEntries(PLAIN_TEXT_BOXES.map((entry) => [entry.file, entry.count]));
        expect(
            actual,
            "a multi-line text box was added, removed or moved. If it holds formatted text it must be a " +
                "RichTextField; otherwise classify it in richTextInventory.ts with the reason it stays plain.",
        ).toEqual(listed);
    });

    it("gives every plain box a reason, so no entry is a bare exemption", () => {
        for (const entry of PLAIN_TEXT_BOXES) {
            expect(entry.reason.length, entry.file).toBeGreaterThan(20);
        }
    });

    it("never lists a file twice", () => {
        const files = PLAIN_TEXT_BOXES.map((entry) => entry.file);
        expect(new Set(files).size).toBe(files.length);
    });
});

describe("no second editor and no Tiny host", () => {
    it("never hand-rolls a contenteditable editor", () => {
        const offenders = product
            .filter((file) => !rulebook.has(file.path))
            .filter((file) => /\bcontenteditable\s*=|:contenteditable|\.contentEditable\b|\bdesignMode\b/i.test(file.text))
            .map((file) => file.path);
        expect(offenders).toEqual([]);
    });

    it("never calls execCommand to format text by hand", () => {
        const offenders = product
            .filter((file) => /\bexecCommand\s*\(/.test(file.text))
            .map((file) => file.path);
        expect(offenders).toEqual([]);
    });

    it("never imports another rich text library", () => {
        const library =
            /from\s+["'](?:quill|ckeditor5?|@ckeditor\/[^"']*|lexical|@lexical\/[^"']*|slate(?:-[a-z]+)?|draft-js|prosemirror-[a-z]+|@tiptap\/[^"']*|tiptap|trix|summernote|jodit|froala-editor|suneditor)["']/;
        const offenders = product.filter((file) => library.test(file.text)).map((file) => file.path);
        expect(offenders).toEqual([]);
    });

    it("declares no other rich text library as a dependency", () => {
        const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
        const forbidden = names.filter((name) =>
            /^(quill|ckeditor5?|@ckeditor\/.*|lexical|@lexical\/.*|slate.*|draft-js|prosemirror-.*|@tiptap\/.*|tiptap|trix|summernote|jodit|froala-editor|suneditor|@tinymce\/.*)$/.test(name),
        );
        expect(forbidden).toEqual([]);
    });

    it("never refers to Tiny Cloud, its CDN or an API key", () => {
        const offenders = product
            .filter((file) => !rulebook.has(file.path))
            .filter((file) => /tiny\.cloud|cdn\.tiny|tinymce\.com\/|\bapiKey\b|\bapi_key\b/i.test(file.text))
            .map((file) => file.path);
        expect(offenders).toEqual([]);
    });
});

describe("TinyMCE is bundled at one exact version", () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
        dependencies: Record<string, string>;
    };

    it("pins the package to the version the loader names, with no range", () => {
        expect(manifest.dependencies.tinymce).toBe(TINYMCE_PINNED_VERSION);
    });

    it("pins the Cantonese language pack too, with no range", () => {
        expect(manifest.dependencies["tinymce-i18n"]).toMatch(/^\d+\.\d+\.\d+$/);
    });
});
