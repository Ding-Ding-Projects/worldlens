/** Strict offline HTML subset. This validates source; it never executes or silently strips it. */
const ELEMENTS = new Set(['details', 'summary', 'b', 'strong', 'em', 'i', 'code', 'kbd', 'br', 'hr', 'span', 'p', 'a', 'img']);
const VOID = new Set(['br', 'hr', 'img']);
const GLOBAL_ATTRIBUTES = new Set(['id', 'title']);
const ATTRIBUTES = { details: new Set(['open']), a: new Set(['href']), img: new Set(['src', 'alt', 'width', 'height']) };

/** A fresh state belongs to one article, across its Markdown HTML fragments. */
export function htmlState() { return { stack: [], ids: new Set(), tags: 0 }; }

export function inspectHtml(source, state) {
    const links = [], anchors = [];
    let cursor = 0;
    while (cursor < source.length) {
        const start = source.indexOf('<', cursor);
        if (start < 0) break;
        if (source.startsWith('<!--', start)) {
            const end = source.indexOf('-->', start + 4);
            if (end < 0 || /[<>]|--/.test(source.slice(start + 4, end))) return { ok: false };
            cursor = end + 3; continue;
        }
        let end = start + 1, quote = '';
        for (; end < source.length; end++) {
            const c = source[end];
            if (quote) { if (c === quote) quote = ''; }
            else if (c === '"' || c === "'") quote = c;
            else if (c === '>') break;
        }
        if (end === source.length || end - start > 4096 || ++state.tags > 50000) return { ok: false };
        const tag = source.slice(start + 1, end);
        const match = /^(\/)?([a-z][a-z0-9]*)([\s\S]*)$/i.exec(tag);
        if (!match) return { ok: false };
        const closing = Boolean(match[1]), name = match[2].toLowerCase();
        if (!ELEMENTS.has(name)) return { ok: false };
        let rest = match[3];
        if (closing) {
            if (rest.trim() || VOID.has(name) || state.stack.pop() !== name) return { ok: false };
            cursor = end + 1; continue;
        }
        const attrs = new Map();
        let selfClosing = false;
        while (rest.length) {
            if (/^\s*\/\s*$/.test(rest)) { selfClosing = true; rest = ''; break; }
            if (/^\s*$/.test(rest)) break;
            const attribute = /^\s+([a-z][a-z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/i.exec(rest);
            if (!attribute) return { ok: false };
            const key = attribute[1].toLowerCase(), value = attribute[2] ?? attribute[3];
            if (attrs.has(key) || (!GLOBAL_ATTRIBUTES.has(key) && !ATTRIBUTES[name]?.has(key))) return { ok: false };
            if (value === undefined && !(name === 'details' && key === 'open')) return { ok: false };
            if (value !== undefined && (value.length > 2048 || /[&<>\u0000-\u001f\u007f]/u.test(value))) return { ok: false };
            if (key === 'id' && !/^[\p{L}][\p{L}\p{N}_.:-]{0,159}$/u.test(value ?? '')) return { ok: false };
            if ((key === 'width' || key === 'height') && !/^[1-9][0-9]{0,3}$/.test(value ?? '')) return { ok: false };
            if (key === 'open' && value !== undefined && value !== '' && value !== 'open') return { ok: false };
            attrs.set(key, value ?? ''); rest = rest.slice(attribute[0].length);
        }
        if (selfClosing && !VOID.has(name)) return { ok: false };
        if (!VOID.has(name)) state.stack.push(name);
        if (state.stack.length > 64) return { ok: false };
        if (attrs.has('id')) {
            const id = attrs.get('id');
            if (state.ids.has(id)) return { ok: false };
            state.ids.add(id); anchors.push(id);
        }
        if (name === 'a' && attrs.has('href')) links.push({ type: 'link', href: attrs.get('href'), label: attrs.get('title') || 'HTML link' });
        if (name === 'img') {
            if (!attrs.has('src') || !attrs.has('alt')) return { ok: false };
            links.push({ type: 'image', href: attrs.get('src'), label: attrs.get('alt') });
        }
        cursor = end + 1;
    }
    return { ok: true, links, anchors };
}
