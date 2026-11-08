/**
 * Parses provider-authored Markdown (release notes, issue and pull-request bodies, commit
 * messages, README previews) into a small tree that `ProviderText.vue` renders as Vue nodes.
 *
 * The isolation is structural: nothing here produces HTML, so nothing in the text can become
 * markup, script, a style or an event handler. Raw HTML in the source is shown as text. Links
 * are kept only for http, https and mailto, or relative paths resolved against a base the
 * caller names. Images are never fetched; they become links that say what the image was.
 */

export type Inline =
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "strong" | "em" | "del"; readonly children: readonly Inline[] }
    | { readonly kind: "code"; readonly text: string }
    | { readonly kind: "link"; readonly href: string; readonly children: readonly Inline[] }
    | { readonly kind: "image"; readonly href: string | null; readonly alt: string };

export type Block =
    | { readonly kind: "heading"; readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly children: readonly Inline[] }
    | { readonly kind: "paragraph"; readonly children: readonly Inline[] }
    | { readonly kind: "code"; readonly language: string; readonly text: string }
    | { readonly kind: "quote"; readonly children: readonly Block[] }
    | { readonly kind: "list"; readonly ordered: boolean; readonly start: number; readonly items: readonly ListItem[] }
    | { readonly kind: "rule" }
    | { readonly kind: "table"; readonly head: readonly (readonly Inline[])[]; readonly rows: readonly (readonly (readonly Inline[])[])[] };

export interface ListItem {
    readonly checked: boolean | null;
    readonly children: readonly Block[];
}

/** GitHub's most common shortcodes. An unknown shortcode stays as typed. */
export const EMOJI: Readonly<Record<string, string>> = {
    tada: "🎉", rocket: "🚀", bug: "🐛", sparkles: "✨", fire: "🔥", warning: "⚠️", white_check_mark: "✅", heavy_check_mark: "✔️",
    x: "❌", memo: "📝", lock: "🔒", zap: "⚡", art: "🎨", wrench: "🔧", hammer: "🔨", package: "📦", books: "📚", book: "📖",
    construction: "🚧", recycle: "♻️", lipstick: "💄", boom: "💥", ambulance: "🚑", arrow_up: "⬆️", arrow_down: "⬇️", heart: "❤️",
    eyes: "👀", thumbsup: "👍", "+1": "👍", thumbsdown: "👎", "-1": "👎", star: "⭐", bulb: "💡", mag: "🔍", truck: "🚚",
    globe_with_meridians: "🌐", pencil2: "✏️", wastebasket: "🗑️", rotating_light: "🚨", checkered_flag: "🏁", test_tube: "🧪",
    dumpling: "🥟", dim_sum: "🥟", tea: "🍵", map: "🗺️", world_map: "🗺️", computer: "💻", floppy_disk: "💾", cd: "💿",
};

export interface ParseOptions {
    /** Where relative links point, such as a repository's blob URL. Null drops relative links. */
    readonly base?: string | null;
}

/** Keeps a link only when it is safe to open outside the app. */
export function safeHref(raw: string, base: string | null = null): string | null {
    const href = raw.trim();
    if (/^(https?:|mailto:)/iu.test(href)) {
        try {
            const url = new URL(href);
            return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" ? url.href : null;
        } catch {
            return null;
        }
    }
    if (/^[a-z][a-z0-9+.-]*:/iu.test(href) || href.startsWith("//")) return null;
    if (!base) return null;
    try {
        const url = new URL(href, base);
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch {
        return null;
    }
}

const emojify = (text: string): string => text.replace(/:([a-z0-9_+-]+):/gu, (whole, name: string) => EMOJI[name] ?? whole);

/** Inline Markdown: code, images, links, autolinks, bold, italic and strikethrough. */
export function parseInline(source: string, options: ParseOptions = {}): Inline[] {
    const base = options.base ?? null;
    const out: Inline[] = [];
    let text = "";
    const flush = (): void => {
        if (text) out.push({ kind: "text", text: emojify(text) });
        text = "";
    };
    let i = 0;
    while (i < source.length) {
        const rest = source.slice(i);
        let m: RegExpExecArray | null;
        if (rest[0] === "\\" && /[\\`*_{}[\]()#+\-.!~|<>]/u.test(rest[1] ?? "")) {
            text += rest[1];
            i += 2;
            continue;
        }
        if ((m = /^(`+)([\s\S]*?[^`])\1(?!`)/u.exec(rest))) {
            flush();
            out.push({ kind: "code", text: m[2]!.replace(/^ (.*) $/u, "$1") });
            i += m[0].length;
            continue;
        }
        if ((m = /^!\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/u.exec(rest))) {
            flush();
            out.push({ kind: "image", href: safeHref(m[2]!, base), alt: m[1]! });
            i += m[0].length;
            continue;
        }
        if ((m = /^\[((?:[^\][]|\[[^\]]*\])*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/u.exec(rest))) {
            flush();
            const href = safeHref(m[2]!, base);
            const children = parseInline(m[1]!, options);
            if (href) out.push({ kind: "link", href, children });
            else out.push(...children);
            i += m[0].length;
            continue;
        }
        if ((m = /^<(https?:\/\/[^\s>]+)>/u.exec(rest)) || (m = /^(https?:\/\/[^\s<]*[^\s<.,:;"')\]])/u.exec(rest))) {
            const href = safeHref(m[1]!);
            if (href && (m[0].startsWith("<") || !/[\w/]$/u.test(text))) {
                flush();
                out.push({ kind: "link", href, children: [{ kind: "text", text: m[1]! }] });
                i += m[0].length;
                continue;
            }
        }
        if ((m = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/u.exec(rest))) {
            flush();
            out.push({ kind: "strong", children: parseInline(m[2]!, options) });
            i += m[0].length;
            continue;
        }
        if ((m = /^~~(?=\S)([\s\S]*?\S)~~/u.exec(rest))) {
            flush();
            out.push({ kind: "del", children: parseInline(m[1]!, options) });
            i += m[0].length;
            continue;
        }
        if ((m = /^([*_])(?=\S)([\s\S]*?\S)\1(?![*_\w])/u.exec(rest)) && !(m[1] === "_" && /\w$/u.test(text))) {
            flush();
            out.push({ kind: "em", children: parseInline(m[2]!, options) });
            i += m[0].length;
            continue;
        }
        text += rest[0];
        i += 1;
    }
    flush();
    return out;
}

const splitRow = (line: string): string[] =>
    line
        .trim()
        .replace(/^\|/u, "")
        .replace(/\|$/u, "")
        .split(/(?<!\\)\|/u)
        .map((cell) => cell.trim().replace(/\\\|/gu, "|"));

/** Block Markdown: headings, fences, quotes, lists with task boxes, rules, tables, paragraphs. */
export function parseMarkdown(source: string, options: ParseOptions = {}): Block[] {
    const lines = source.replace(/\r\n?/gu, "\n").replace(/\t/gu, "    ").split("\n");
    return parseLines(lines, options);
}

function parseLines(lines: readonly string[], options: ParseOptions): Block[] {
    const blocks: Block[] = [];
    let i = 0;
    let paragraph: string[] = [];
    const endParagraph = (): void => {
        if (paragraph.length) blocks.push({ kind: "paragraph", children: parseInline(paragraph.join("\n").trim(), options) });
        paragraph = [];
    };
    while (i < lines.length) {
        const line = lines[i]!;
        let m: RegExpExecArray | null;
        if (/^\s*$/u.test(line)) {
            endParagraph();
            i++;
            continue;
        }
        if ((m = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*).*$/u.exec(line))) {
            endParagraph();
            const fence = m[1]!;
            const body: string[] = [];
            i++;
            while (i < lines.length && !lines[i]!.trimStart().startsWith(fence)) body.push(lines[i++]!);
            i++;
            blocks.push({ kind: "code", language: m[2] ?? "", text: body.join("\n") });
            continue;
        }
        if ((m = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/u.exec(line))) {
            endParagraph();
            blocks.push({ kind: "heading", level: m[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, children: parseInline(m[2]!, options) });
            i++;
            continue;
        }
        if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/u.test(line)) {
            endParagraph();
            blocks.push({ kind: "rule" });
            i++;
            continue;
        }
        if (/^ {0,3}>/u.test(line)) {
            endParagraph();
            const inner: string[] = [];
            while (i < lines.length && /^ {0,3}>/u.test(lines[i]!)) inner.push(lines[i++]!.replace(/^ {0,3}> ?/u, ""));
            blocks.push({ kind: "quote", children: parseLines(inner, options) });
            continue;
        }
        if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/u.test(lines[i + 1]!)) {
            endParagraph();
            const head = splitRow(line).map((c) => parseInline(c, options));
            i += 2;
            const rows: Inline[][][] = [];
            while (i < lines.length && lines[i]!.includes("|") && !/^\s*$/u.test(lines[i]!)) {
                rows.push(splitRow(lines[i++]!).map((c) => parseInline(c, options)));
            }
            blocks.push({ kind: "table", head, rows });
            continue;
        }
        if ((m = /^( {0,3})([-*+]|\d{1,9}[.)])\s+/u.exec(line))) {
            endParagraph();
            const ordered = /\d/u.test(m[2]!);
            const start = ordered ? Number.parseInt(m[2]!, 10) : 1;
            const items: ListItem[] = [];
            const marker = ordered ? /^ {0,3}\d{1,9}[.)]\s+/u : /^ {0,3}[-*+]\s+/u;
            while (i < lines.length && marker.test(lines[i]!)) {
                const first = lines[i]!.replace(marker, "");
                const body: string[] = [first];
                i++;
                while (i < lines.length && (/^\s{2,}\S/u.test(lines[i]!) || (/^\s*$/u.test(lines[i]!) && i + 1 < lines.length && /^\s{2,}\S/u.test(lines[i + 1]!)))) {
                    body.push(lines[i++]!.replace(/^\s{2,4}/u, ""));
                }
                const task = /^\[([ xX])\]\s+/u.exec(body[0]!);
                if (task) body[0] = body[0]!.slice(task[0].length);
                items.push({ checked: task ? task[1] !== " " : null, children: parseLines(body, options) });
            }
            blocks.push({ kind: "list", ordered, start, items });
            continue;
        }
        paragraph.push(line);
        i++;
    }
    endParagraph();
    return blocks;
}

/** The plain words of a tree, for search, copy and a screen-reader fallback. */
export function plainText(blocks: readonly Block[]): string {
    const inline = (nodes: readonly Inline[]): string =>
        nodes.map((n) => (n.kind === "text" || n.kind === "code" ? n.text : n.kind === "image" ? n.alt : inline(n.children))).join("");
    return blocks
        .map((b) => {
            switch (b.kind) {
                case "heading":
                case "paragraph":
                    return inline(b.children);
                case "code":
                    return b.text;
                case "quote":
                    return plainText(b.children);
                case "list":
                    return b.items.map((item) => plainText(item.children)).join("\n");
                case "table":
                    return [b.head, ...b.rows].map((r) => r.map(inline).join(" | ")).join("\n");
                default:
                    return "";
            }
        })
        .filter(Boolean)
        .join("\n\n");
}
