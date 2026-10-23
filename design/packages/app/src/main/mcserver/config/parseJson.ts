import { detectEol, detectTrailingNewline, hashOf, type ConfigDocument, type EntryNode } from './document.js';
import { fail, ok, type ConfigAnswer } from './answer.js';

/** JSON never passes through YAML, whose accepted syntax and output differ. */
export function parseJson(sourceText: string): ConfigAnswer<ConfigDocument> {
    try {
        const root: unknown = JSON.parse(sourceText);
        if (root === null || typeof root !== 'object') return fail('parse-error', 'Configuration JSON must contain an object or array.');
        if (!isJsonValue(root)) return fail('parse-error', 'JSON contains a number that cannot be represented safely.');
        const nodes: EntryNode[] = [];
        const walk = (value: unknown, path: string[]) => {
            if (path.length === 0 && Array.isArray(value)) {
                nodes.push({ kind: 'entry', path, value, raw: sourceText });
            } else if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
                for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
            } else nodes.push({ kind: 'entry', path, value, raw: JSON.stringify(value) });
        };
        walk(root, []);
        return ok({ format: 'json', sourceText, encoding: 'utf8', eol: detectEol(sourceText), trailingNewline: detectTrailingNewline(sourceText), nodes, hash: hashOf(sourceText) });
    } catch { return fail('parse-error', 'Invalid JSON configuration.'); }
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));
    if (typeof value !== 'object' || seen.has(value)) return false;
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
    seen.add(value);
    const valid = Object.values(value).every(child => isJsonValue(child, seen));
    seen.delete(value);
    return valid;
}

export function setJsonValue(document: ConfigDocument, path: readonly string[], value: unknown, expectedHash: string): ConfigAnswer<ConfigDocument> {
    if (document.hash !== expectedHash) return fail('stale-document', 'Configuration changed since it was read.');
    if (!isJsonValue(value)) return fail('invalid-value', 'The value must be losslessly representable as JSON.');
    let root: unknown;
    try { root = JSON.parse(document.sourceText); } catch { return fail('parse-error', 'Invalid JSON configuration.'); }
    if (path.length === 0) {
        if (value === null || typeof value !== 'object') return fail('invalid-value', 'The root must remain an object or array.');
        root = value;
    } else {
        let parent = root;
        for (let index = 0; index < path.length; index++) {
            const segment = path[index]!;
            if (parent === null || typeof parent !== 'object' || !Object.hasOwn(parent, segment)) return fail('not-found', 'The configuration path does not exist.');
            if (index === path.length - 1) Object.defineProperty(parent, segment, { value, enumerable: true, writable: true, configurable: true });
            else parent = (parent as Record<string, unknown>)[segment];
        }
    }
    const indent = document.sourceText.match(/\n([ \t]+)"/)?.[1] ?? '  ';
    const next = JSON.stringify(root, null, indent).replace(/\n/g, document.eol) + (document.trailingNewline ? document.eol : '');
    return parseJson(next);
}
