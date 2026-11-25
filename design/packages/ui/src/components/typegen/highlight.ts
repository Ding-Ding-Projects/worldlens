/**
 * A small language-neutral syntax colourer for generated code.
 *
 * Generated models share one lexical shape across every target: line and block comments,
 * quoted strings, numbers, a handful of keywords and capitalised type names. One tokenizer
 * covers all of them without shipping a grammar per language. It returns plain tokens, never
 * markup, so the screen renders them as text nodes and nothing generated can inject HTML.
 */

export type TokenClass = "comment" | "string" | "number" | "keyword" | "type" | "plain";

export interface Token {
    readonly text: string;
    readonly cls: TokenClass;
}

const KEYWORDS = new Set(
    (
        "abstract as async await bool boolean break case catch char class const constructor continue data def default " +
        "defmodule defstruct do double else elif end enum export extends extern false fileprivate final finally float fn for " +
        "from fun func function get guard if impl implements import in init int interface internal is lazy let long map " +
        "module mut namespace new nil none null object of open optional override package private protected pub public " +
        "readonly record require return sealed self set static string struct super switch this throw throws trait true try " +
        "type typealias typedef undefined union unsafe use using val var void where while with yield"
    ).split(" "),
);

const TOKEN_PATTERN =
    /\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|#[^\n]*|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b|[A-Za-z_][A-Za-z0-9_]*|\s+|[\s\S]/g;

/** Past this many lines the output is shown uncoloured, to keep typing responsive. */
export const MAX_HIGHLIGHT_LINES = 4000;

function classify(piece: string): TokenClass {
    const first = piece.charAt(0);
    if (piece.startsWith("//") || piece.startsWith("/*") || (first === "#" && piece.length > 0)) return "comment";
    if (first === '"' || first === "'" || first === "`") return "string";
    if (first >= "0" && first <= "9") return "number";
    if (/^[A-Za-z_]/.test(piece)) {
        if (KEYWORDS.has(piece)) return "keyword";
        if (first >= "A" && first <= "Z") return "type";
    }
    return "plain";
}

/** Splits one line into coloured tokens. A block comment is coloured on the line it starts. */
export function tokenizeLine(line: string): readonly Token[] {
    const tokens: Token[] = [];
    for (const match of line.matchAll(TOKEN_PATTERN)) {
        const text = match[0];
        const cls = classify(text);
        const last = tokens[tokens.length - 1];
        if (last && last.cls === cls && cls === "plain") tokens[tokens.length - 1] = { text: last.text + text, cls };
        else tokens.push({ text, cls });
    }
    return tokens;
}

/** Every line of the code with its tokens; long output comes back as one plain token per line. */
export function highlight(code: string): readonly (readonly Token[])[] {
    const lines = code.split("\n");
    if (lines.length > MAX_HIGHLIGHT_LINES) return lines.map((line) => [{ text: line, cls: "plain" as const }]);
    return lines.map(tokenizeLine);
}
