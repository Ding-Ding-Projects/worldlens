/** Offline source preparation only. No renderer, build, acquisition or package production. */
import { readFile, readdir, lstat, realpath, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, extname, sep, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { objectSource, git } from './immutable-source.mjs';
import { createRepositoryResolver } from './repository-resolver.mjs';
import { headingText, headingSlug, legacyHeadingSlug, uniqueHeadingId, headingAliases, ambiguousHeadingAliases } from './heading-anchors.mjs';
import { htmlState, inspectHtml } from './html-policy.mjs';

export const WIKI_REVISION = '0b66c19306add3a090fc70ad08f1d785b49794f7';
const LIMITS = { files: 10000, articleBytes: 4 * 1024 * 1024, totalBytes: 512 * 1024 * 1024 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (root, file) => { const p = relative(root, file); return p === '' || (!p.startsWith('..' + sep) && p !== '..' && !p.startsWith(sep)); };
const route = (kind, file) => '/' + kind + '/' + file.replace(/\.md$/i, '').split('/').map(encodeURIComponent).join('/');

async function safeFile(root, name) {
    const file = resolve(root, name);
    if (!inside(root, file)) throw new Error('path-outside-source');
    let current = root;
    for (const part of relative(root, file).split(sep).filter(Boolean)) {
        current = resolve(current, part);
        if ((await lstat(current)).isSymbolicLink()) throw new Error('symlink');
    }
    if (!(await lstat(file)).isFile()) throw new Error('not-a-file');
    return file;
}

async function inventory(root) {
    if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== resolve(root)) throw new Error('symlink-source');
    const files = [];
    const walk = async (directory, prefix = '') => {
        for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
            if (entry.name === '.git') continue;
            const name = prefix + entry.name;
            if (entry.isSymbolicLink()) throw new Error('symlink');
            if (entry.isDirectory()) await walk(resolve(directory, entry.name), name + '/');
            else if (entry.isFile()) files.push(name);
            else throw new Error('unsupported-file-type');
            if (files.length > LIMITS.files) throw new Error('file-limit');
        }
    };
    await walk(root);
    return files;
}

/** Lexer is supplied from the project's already-declared marked dependency. */
export async function prepareContent({ docsRoot, wikiRoot, docsRevision, wikiRevision, marked, sources, repositoryResolver }) {
    const roots = { docs: resolve(docsRoot), wiki: resolve(wikiRoot) };
    const articles = [], assets = new Map(), diagnostics = [];
    const routes = new Map();
    if (repositoryResolver) sources = {...sources, supplemental:repositoryResolver.source};
    const localTarget = (article, href) => {
        const split = href.indexOf('#');
        const file = decodeURIComponent(split < 0 ? href : href.slice(0, split));
        const anchor = decodeURIComponent(split < 0 ? '' : href.slice(split + 1));
        if (file.includes('\\') || /[\u0000-\u001f\u007f]/.test(file) || file.startsWith('/') || file.includes('?')) throw new Error('unsupported-path');
        const owningPath = repositoryResolver && article.kind === 'docs' ? 'docs/' + article.path : article.path;
        const normalized = file === '' ? owningPath : posix.normalize(posix.join(posix.dirname(owningPath),file));
        if (normalized === '..' || normalized.startsWith('../')) throw new Error('path-outside-source');
        const kind = repositoryResolver && article.kind !== 'wiki' ? (normalized.startsWith('docs/') ? 'docs' : 'supplemental') : article.kind;
        return {kind, target:repositoryResolver && kind === 'docs' ? normalized.slice(5) : normalized, anchor};
    };
    const articleName = (kind, target) => [target, ...(!extname(target) ? [target+'.md',target+'/README.md'] : [])]
        .find(name => /\.md$/i.test(name) && sources?.[kind]?.files.includes(name));
    let totalBytes = 0;
    const read = async (kind, name, article = false) => {
        const file = sources ? null : await safeFile(roots[kind], name);
        const size = sources ? sources[kind].size(name) : (await lstat(file)).size;
        if (totalBytes + size > LIMITS.totalBytes || (article && size > LIMITS.articleBytes)) throw new Error('byte-limit');
        const bytes = sources ? sources[kind].read(name) : await readFile(file);
        totalBytes += bytes.length;
        if (totalBytes > LIMITS.totalBytes || (article && bytes.length > LIMITS.articleBytes)) throw new Error('byte-limit');
        return bytes;
    };
    const queue = [];
    for (const kind of ['docs','wiki']) for (const name of sources ? sources[kind].files : await inventory(roots[kind])) {
        if (/\.md$/i.test(name)) queue.push({kind,name});
    }
    const queued = new Set(queue.map(({kind,name})=>kind+'/'+name));
    for (const {kind,name} of queue) {
            const bytes = await read(kind, name, true);
            const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            const destination = route(kind, name);
            const key = (kind + '/' + name.replace(/\.md$/i, '')).normalize('NFC').toLowerCase();
            if (routes.has(key)) throw new Error('colliding-routes');
            const article = { kind, path: name, route: destination, revision: kind === 'wiki' ? wikiRevision : docsRevision,
                oid: sources?.[kind]?.entry?.(name)?.oid,
                sha256: hash(bytes), title: name.replace(/\.md$/i, ''), text, anchors: [], headings: [], anchorAliases: {}, links: [], externalLinks: [], sourceLinks: [] };
            const used = new Set(), legacyUsed = new Set();
            const html = htmlState();
            const tokens = marked.lexer(text, { gfm: true });
            marked.walkTokens(tokens, token => {
                if (token.type === 'heading') {
                    const plain = headingText(token.tokens || [{type:'text',text:token.text}]);
                    const id = uniqueHeadingId(headingSlug(plain),used);
                    const legacyPlain = token.text.replace(/<[^>]*>/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');
                    const legacyId = uniqueHeadingId(legacyHeadingSlug(legacyPlain),legacyUsed);
                    article.anchors.push(id);
                    article.headings.push({id,legacyId,depth:token.depth,text:plain});
                    if (token.depth === 1 && article.title === name.replace(/\.md$/i, '')) article.title = plain;
                }
                if (token.type === 'text' && /\[\[[^]*?\]\]/.test(token.text)) diagnostics.push({ route: destination, code: 'unsupported-wiki-link' });
                if (token.type === 'image' || token.type === 'link') article.links.push({ href: token.href, type: token.type, label: token.text });
                if (token.type === 'html') {
                    const checked = inspectHtml(token.text, html);
                    if (!checked.ok) diagnostics.push({ route: destination, code: 'unsupported-html' });
                    else {
                        article.links.push(...checked.links);
                        for (const id of checked.anchors) {
                            if (used.has(id)) diagnostics.push({ route: destination, code: 'duplicate-anchor' });
                            used.add(id); article.anchors.push(id);
                        }
                    }
                }
            });
            if (html.stack.length) diagnostics.push({ route: destination, code: 'unclosed-html' });
            article.anchorAliases = headingAliases(article.headings,article.anchors);
            article.ambiguousAnchors = ambiguousHeadingAliases(article.headings,article.anchors);
            articles.push(article); routes.set(key, article);
            if (repositoryResolver && kind !== 'wiki') for (const link of article.links) {
                if (link.type !== 'link' || /^[\u0009-\u000d\u0020]|[\u0009-\u000d\u0020]$/.test(link.href) || /^[a-z][a-z0-9+.-]*:/i.test(link.href) || link.href.startsWith('//')) continue;
                try {
                    const resolved = localTarget(article,link.href), next = articleName(resolved.kind,resolved.target);
                    if (next && !queued.has(resolved.kind+'/'+next)) {
                        if (queue.length >= LIMITS.files) throw new Error('file-limit');
                        queued.add(resolved.kind+'/'+next); queue.push({kind:resolved.kind,name:next});
                    }
                } catch (error) { if (error.message === 'file-limit') throw error; }
            }
    }
    const byPath = new Map(articles.map(a => [a.kind + '/' + a.path, a]));
    for (const article of articles) {
        for (const link of article.links) {
            const href = link.href;
            // Browsers trim edge ASCII whitespace before interpreting a URL scheme.
            // Reject it before classification so a matching filename cannot disguise one.
            if (/^[\u0009-\u000d\u0020]|[\u0009-\u000d\u0020]$/.test(href)) {
                diagnostics.push({ route: article.route, code: 'unsafe-url' }); continue;
            }
            if (/^(?:https?:|mailto:)/i.test(href)) {
                if (link.type === 'image') {
                    try {
                        const pinned = repositoryResolver?.historicalImage(href);
                        if (!pinned) { diagnostics.push({route:article.route,code:'remote-asset',href}); continue; }
                        const key = 'historical/' + pinned.revision + '/' + pinned.path;
                        if (!assets.has(key)) {
                            if (totalBytes + pinned.size > LIMITS.totalBytes) throw new Error('byte-limit');
                            const bytes = pinned.read(); totalBytes += bytes.length;
                            if (totalBytes > LIMITS.totalBytes) throw new Error('byte-limit');
                            assets.set(key,{path:key,sha256:hash(bytes),bytes:bytes.length,base64:bytes.toString('base64'),source:{href,revision:pinned.revision,path:pinned.path,oid:pinned.oid}});
                        }
                        link.target = '/assets/' + key.split('/').map(encodeURIComponent).join('/');
                    } catch(error) { if (error.message === 'byte-limit') throw error; diagnostics.push({route:article.route,code:'historical-image-unavailable',href}); }
                }
                else article.externalLinks.push({ ...link, label: link.label + ' (external)', requiresActivation: true });
                continue;
            }
            if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) { diagnostics.push({ route: article.route, code: 'unsafe-url' }); continue; }
            let target, anchor, targetKind;
            try { ({target,anchor,kind:targetKind} = localTarget(article,href)); }
            catch { diagnostics.push({route:article.route,code:'unsafe-path'}); continue; }
            let destination = byPath.get(targetKind + '/' + target);
            if (!destination && !extname(target)) destination = byPath.get(targetKind + '/' + target + '.md') || byPath.get(targetKind + '/' + target + '/README.md');
            if (destination && link.type === 'link') {
                if (anchor && destination.ambiguousAnchors.includes(anchor)) {
                    diagnostics.push({route:article.route,code:'ambiguous-anchor',target:destination.route,anchor}); continue;
                }
                if (anchor && Object.hasOwn(destination.anchorAliases,anchor)) anchor = destination.anchorAliases[anchor];
                if (anchor && !destination.anchors.includes(anchor)) diagnostics.push({ route: article.route, code: 'missing-anchor', target: destination.route, anchor });
                link.target = destination.route + (anchor ? '#' + encodeURIComponent(anchor) : '');
                continue;
            }
            if (targetKind === 'supplemental' && link.type === 'link' && !/\.md$/i.test(target)) {
                try {
                    const reference = repositoryResolver.reference(target);
                    article.externalLinks.push({...link,...reference}); link.sourceReference = reference;
                } catch { diagnostics.push({route:article.route,code:'missing-or-unsafe-source-reference',target}); }
                continue;
            }
            if (/\.md$/i.test(target) || !extname(target)) { diagnostics.push({ route: article.route, code: 'missing-article', target }); continue; }
            const key = targetKind + '/' + target;
            try {
                if (!assets.has(key)) {
                    const bytes = await read(targetKind, target);
                    // Active documents may load remote resources. They require a reviewed renderer adapter.
                    if (!/\.(?:png|jpe?g|gif|webp|avif|ico|pdf|txt|json|zip)$/i.test(target)) throw new Error('unsupported-asset');
                    assets.set(key, { path: key, sha256: hash(bytes), bytes: bytes.length, base64: bytes.toString('base64'),
                        source: { revision: targetKind === 'wiki' ? wikiRevision : docsRevision, path: targetKind === 'docs' ? 'docs/' + target : target,
                            oid: sources?.[targetKind]?.entry?.(target)?.oid } });
                }
                link.target = '/assets/' + key.split('/').map(encodeURIComponent).join('/');
            } catch (error) { if (error.message === 'byte-limit') throw error; diagnostics.push({ route: article.route, code: error.message === 'unsupported-asset' ? error.message : 'missing-or-unsafe-asset', target }); }
        }
        article.sourceLinks.push({ label: 'Source (external)', href: article.kind === 'wiki'
            ? 'https://github.com/Ding-Ding-Projects/worldlens/wiki/' + encodeURIComponent(article.path.replace(/\.md$/i, '')) + '/' + encodeURIComponent(wikiRevision)
            : 'https://github.com/Ding-Ding-Projects/worldlens/blob/' + encodeURIComponent(docsRevision) + '/' + (article.kind === 'docs' ? 'docs/' : '') + article.path.split('/').map(encodeURIComponent).join('/'), requiresActivation: true });
    }
    const manifest = { schemaVersion: 1, purpose: 'offline-content-preparation', revisions: { docs: docsRevision, wiki: wikiRevision },
        articles, assets: [...assets.values()].sort((a,b) => a.path.localeCompare(b.path, 'en')) };
    return { ok: diagnostics.length === 0, manifest, diagnostics, summary: { articles: articles.length, docs: articles.filter(a=>a.kind==='docs').length, wiki: articles.filter(a=>a.kind==='wiki').length, supplemental: articles.filter(a=>a.kind==='supplemental').length, assets: assets.size, sourceBytes: totalBytes } };
}

export async function writeOutsideCheckout(file, value, repositoryRoot, wikiRoot) {
    const parent = await realpath(dirname(resolve(file)));
    if (inside(await realpath(repositoryRoot), parent) || inside(await realpath(wikiRoot), parent)) throw new Error('output-must-be-outside-source-checkouts');
    await writeFile(resolve(parent, file.split(/[\\/]/).at(-1)), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}

async function main(args) {
    const allowed = new Set(['--repository', '--wiki', '--toolchain', '--report', '--output', '--wiki-revision']);
    const options = {};
    for (let i=0;i<args.length;i+=2) { if (!allowed.has(args[i]) || !args[i+1] || options[args[i]]) throw new Error('invalid-arguments'); options[args[i]]=args[i+1]; }
    if (!options['--repository'] || !options['--wiki'] || !options['--report']) throw new Error('repository-wiki-and-report-required');
    const repository = resolve(options['--repository']), wiki = resolve(options['--wiki']);
    const wikiRevision = options['--wiki-revision'] || WIKI_REVISION;
    const docsRevision = git(repository, ['rev-parse', 'HEAD']);
    const sources = { docs: objectSource(repository, docsRevision, 'docs'), wiki: objectSource(wiki, wikiRevision) };
    const require = createRequire(resolve(options['--toolchain'] || repository, 'design/packages/viewer/package.json'));
    const marked = require('marked').marked;
    const result = await prepareContent({ docsRoot: resolve(repository, 'docs'), wikiRoot: wiki, docsRevision, wikiRevision, marked, sources, repositoryResolver:createRepositoryResolver(repository,docsRevision) });
    const report = { schemaVersion: 1, purpose: 'content-inventory-only', ok: result.ok, summary: result.summary, revisions: result.manifest.revisions,
        sourceMode: 'committed-object-tree', contentHash: hash(JSON.stringify(result.manifest)), articles: result.manifest.articles.map(({kind,path,route,sha256,anchors})=>({kind,path,route,sha256,anchors})), diagnostics: result.diagnostics };
    await writeOutsideCheckout(options['--report'], report, repository, wiki);
    if (result.ok && options['--output']) await writeOutsideCheckout(options['--output'], result.manifest, repository, wiki);
    console.log(JSON.stringify({ ok: result.ok, ...result.summary, diagnostics: result.diagnostics.length, bundleWritten: result.ok && Boolean(options['--output']) }));
    if (!result.ok) process.exitCode=1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(() => { console.error('Content preparation failed; no delivery claim. Check source roots, installed parser, pinned wiki, output destination and input bounds.'); process.exitCode=1; });
