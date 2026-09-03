import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const srcRoot = join(root, "packages/ui/src");

const linesPath = process.argv[2];
const raw = readFileSync(linesPath, "utf8").split("\n").filter(Boolean);

function endOfString(text, start) {
    const quote = text[start];
    for (let i = start + 1; i < text.length; i++) {
        const ch = text[i];
        if (ch === "\\") {
            i++;
            continue;
        }
        if (ch === quote) return i;
        if (quote !== "`" && ch === "\n") return -1;
    }
    return -1;
}

function findFallback(text, key) {
    const call = new RegExp(`(?<![\\w$.])\\$?t\\s*\\(\\s*(["'])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1\\s*,`, "g");
    let match;
    while ((match = call.exec(text)) !== null) {
        const literals = [];
        let depth = 1;
        for (let i = match.index + match[0].length; i < text.length && depth > 0; i++) {
            const ch = text[i];
            if (ch === '"' || ch === "'" || ch === "`") {
                const end = endOfString(text, i);
                if (end === -1) break;
                literals.push(text.slice(i + 1, end));
                i = end;
            } else if (ch === "(" || ch === "[" || ch === "{") depth++;
            else if (ch === ")" || ch === "]" || ch === "}") depth--;
        }
        if (literals.length > 0) return literals.at(-1);
    }
    return null;
}

const results = [];
for (const line of raw) {
    const m = line.match(/^([^:]+): (\S+)\s+\(([^)]+)\)/);
    if (!m) {
        console.error("NOMATCH", line);
        continue;
    }
    const [, , key, filesStr] = m;
    const files = filesStr.split(", ");
    let fallback = null;
    let foundFile = null;
    for (const f of files) {
        const text = readFileSync(join(srcRoot, f), "utf8");
        const fb = findFallback(text, key);
        if (fb !== null) {
            fallback = fb;
            foundFile = f;
            break;
        }
    }
    results.push({ key, files, fallback, foundFile });
}

console.log(JSON.stringify(results, null, 2));
