import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { prepareContent, writeOutsideCheckout } from './prepare.mjs';
const require = createRequire(resolve(process.env.GUIDE_TOOLCHAIN_ROOT || '.', 'design/packages/viewer/package.json'));
const { marked } = require('marked');
async function fixture(run) {
    const root = await mkdtemp(join(tmpdir(), 'guide-content-'));
    const docsRoot = join(root, 'repo', 'docs'), wikiRoot = join(root, 'wiki');
    await mkdir(docsRoot, {recursive:true}); await mkdir(wikiRoot);
    const prepare = () => prepareContent({docsRoot, wikiRoot, docsRevision:'fixture-docs', wikiRevision:'fixture-wiki', marked});
    try { await run({root, docsRoot, wikiRoot, prepare}); } finally { await rm(root, {recursive:true, force:true}); }
}
test('retains complete nested content, reference images, duplicate headings and distinct routes deterministically', () => fixture(async ({docsRoot,wikiRoot,prepare}) => {
    await mkdir(join(docsRoot,'nested'));
    await writeFile(join(docsRoot,'Home.md'), '# Home\n\n[Article](nested/Article.md#section-1)\n[External](https://example.org/)\n');
    await writeFile(join(docsRoot,'nested/Article.md'), '# Article\n## Section\n## Section\n\nFull final paragraph.\n![image][pic]\n\n[pic]: ../image.png\n');
    await writeFile(join(docsRoot,'image.png'), Buffer.from([1,2,3]));
    await writeFile(join(wikiRoot,'Home.md'), '# Wiki\n[Self](Home)\n');
    const first=await prepare(), second=await prepare();
    assert.equal(first.ok,true); assert.deepEqual(first,second);
    assert.equal(first.manifest.articles.length,3);
    assert.deepEqual(first.manifest.articles[1].anchors,['article','section','section-1']);
    assert.match(first.manifest.articles[1].text,/Full final paragraph/);
    assert.equal(first.manifest.articles[0].links[0].target,'/docs/nested/Article#section-1');
    assert.equal(first.manifest.articles[0].externalLinks[0].requiresActivation,true);
    assert.equal(first.manifest.articles[2].route,'/wiki/Home');
    assert.equal(first.manifest.assets[0].base64,'AQID');
}));
for (const [label, text, code] of [
    ['missing image','![missing](missing.png)','missing-or-unsafe-asset'],
    ['external image','![remote](https://example.org/image.png)','remote-asset'],
    ['external protocol image','![remote](//example.org/image.png)','unsafe-url'],
    ['traversal','![outside](../outside.png)','unsafe-path'],
    ['encoded traversal','![outside](%2e%2e/outside.png)','unsafe-path'],
    ['missing article','[missing](missing.md)','missing-article'],
    ['missing anchor','[missing](#absent)','missing-anchor'],
    ['active HTML','<iframe src="https://example.org/"></iframe>','unsupported-html'],
    ['active asset','![active](image.svg)','unsupported-asset'],
]) test('rejects '+label, () => fixture(async ({docsRoot,prepare}) => {
    await writeFile(join(docsRoot,'Home.md'),'# Home\n\n'+text);
    await writeFile(join(docsRoot,'image.svg'),'<svg/>');
    const result=await prepare(); assert.equal(result.ok,false); assert.ok(result.diagnostics.some(d=>d.code===code));
}));
test('rejects symlinks and case-folded route collisions', () => fixture(async ({docsRoot,root,prepare}) => {
    await writeFile(join(root,'outside.md'),'# Outside');
    await symlink(join(root,'outside.md'),join(docsRoot,'linked.md'));
    await assert.rejects(prepare,/symlink/);
    await rm(join(docsRoot,'linked.md'));
    await writeFile(join(docsRoot,'Home.md'),'# First'); await writeFile(join(docsRoot,'home.md'),'# Second');
    await assert.rejects(prepare,/colliding-routes/);
}));
test('ignores link-looking code and refuses output within either source or an existing destination', () => fixture(async ({root,docsRoot,wikiRoot,prepare}) => {
    await writeFile(join(docsRoot,'Home.md'),'# Home\n\n```md\n![example](missing.png)\n```');
    assert.equal((await prepare()).ok,true);
    await assert.rejects(writeOutsideCheckout(join(docsRoot,'bundle.json'),{},join(root,'repo'),wikiRoot),/outside/);
    await assert.rejects(writeOutsideCheckout(join(wikiRoot,'bundle.json'),{},join(root,'repo'),wikiRoot),/outside/);
    const output=join(root,'bundle.json'); await writeOutsideCheckout(output,{ok:true},join(root,'repo'),wikiRoot);
    assert.equal(JSON.parse(await readFile(output,'utf8')).ok,true);
    await assert.rejects(writeOutsideCheckout(output,{},join(root,'repo'),wikiRoot),/EEXIST/);
}));
test('rejects oversized articles before reading their payload and rejects malformed UTF-8', () => fixture(async ({docsRoot,prepare}) => {
    await writeFile(join(docsRoot,'Home.md'),'x'.repeat(4*1024*1024+1));
    await assert.rejects(prepare,/byte-limit/);
    await writeFile(join(docsRoot,'Home.md'),Buffer.from([0xff]));
    await assert.rejects(prepare,/encoded data/);
}));
test('reports unsupported wiki syntax rather than losing navigation', () => fixture(async ({wikiRoot,prepare}) => {
    await writeFile(join(wikiRoot,'Home.md'),'# Home\n[[Other page]]');
    const result=await prepare(); assert.equal(result.ok,false);
    assert.ok(result.diagnostics.some(d=>d.code==='unsupported-wiki-link'));
}));
test('allocates heading ids globally across natural and generated suffixes', () => fixture(async ({docsRoot,prepare}) => {
    await writeFile(join(docsRoot,'Home.md'),'# A\n## A\n## A-1\n## A\n');
    const result=await prepare();
    assert.equal(result.ok,true);
    assert.deepEqual(result.manifest.articles[0].anchors,['a','a-1','a-1-1','a-2']);
}));
test('CLI bundles only tracked committed bytes despite dirty, untracked and ignored documentation', async () => {
    const { execFileSync, spawnSync } = await import('node:child_process');
    await fixture(async ({root,docsRoot,wikiRoot}) => {
        const repository=join(root,'repo');
        const git=(cwd,args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
        for (const cwd of [repository,wikiRoot]) {
            git(cwd,['init','-q']); git(cwd,['config','user.name','Fixture']); git(cwd,['config','user.email','fixture@example.invalid']);
        }
        await writeFile(join(docsRoot,'Home.md'),'# Original\nCommitted text.\n![image](image.png)');
        await writeFile(join(docsRoot,'image.png'),Buffer.from([1,2,3]));
        await writeFile(join(repository,'.gitignore'),'docs/ignored.md\n');
        await writeFile(join(wikiRoot,'Home.md'),'# Wiki\nPinned text.');
        for (const cwd of [repository,wikiRoot]) { git(cwd,['add','.']); git(cwd,['commit','-qm','Fixture']); }
        const docsRevision=git(repository,['rev-parse','HEAD']), wikiRevision=git(wikiRoot,['rev-parse','HEAD']);
        await writeFile(join(docsRoot,'Home.md'),'# Changed\nUncommitted text.');
        await writeFile(join(docsRoot,'image.png'),Buffer.from([4,5,6]));
        await writeFile(join(wikiRoot,'Home.md'),'# Modified wiki');
        await writeFile(join(docsRoot,'untracked.md'),'# Untracked');
        await writeFile(join(docsRoot,'ignored.md'),'# Ignored');
        const output=join(root,'bundle.json'), report=join(root,'report.json');
        const result=spawnSync(process.execPath,[resolve('scripts/guide-content/prepare.mjs'),'--repository',repository,'--wiki',wikiRoot,'--wiki-revision',wikiRevision,'--toolchain',resolve(process.env.GUIDE_TOOLCHAIN_ROOT||'.'),'--report',report,'--output',output],{encoding:'utf8'});
        assert.equal(result.status,0,result.stderr);
        const bundle=JSON.parse(await readFile(output,'utf8'));
        assert.equal(bundle.revisions.docs,docsRevision);
        assert.equal(bundle.articles.filter(a=>a.kind==='docs').length,1);
        assert.equal(bundle.articles[0].text,'# Original\nCommitted text.\n![image](image.png)');
        assert.equal(bundle.articles[0].revision,docsRevision);
        assert.equal(bundle.assets[0].base64,'AQID');
        assert.equal(bundle.articles.find(a=>a.kind==='wiki').text,'# Wiki\nPinned text.');
        assert.ok(bundle.articles.find(a=>a.kind==='wiki').sourceLinks[0].href.endsWith('/'+wikiRevision));
    });
});
test('CLI ignores replacement refs and inherited object/config routing', async () => {
    const { execFileSync, spawnSync } = await import('node:child_process');
    await fixture(async ({root,docsRoot,wikiRoot}) => {
        const repository=join(root,'repo');
        const git=(cwd,args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
        for (const cwd of [repository,wikiRoot]) {
            git(cwd,['init','-q']); git(cwd,['config','user.name','Fixture']); git(cwd,['config','user.email','fixture@example.invalid']);
        }
        await writeFile(join(docsRoot,'Home.md'),'# Original');
        await writeFile(join(wikiRoot,'Home.md'),'# Wiki');
        for (const cwd of [repository,wikiRoot]) { git(cwd,['add','.']); git(cwd,['commit','-qm','Original']); }
        const original=git(repository,['rev-parse','HEAD']), wikiRevision=git(wikiRoot,['rev-parse','HEAD']);
        await writeFile(join(docsRoot,'Home.md'),'# Replacement');
        git(repository,['add','.']); git(repository,['commit','-qm','Replacement']);
        const replacement=git(repository,['rev-parse','HEAD']);
        git(repository,['update-ref','HEAD',original]); git(repository,['replace',original,replacement]);
        for (const contaminated of [false,true]) {
            const output=join(root,`replacement-${contaminated}.json`), report=join(root,`replacement-report-${contaminated}.json`);
            const env={...process.env};
            if(contaminated) Object.assign(env,{GIT_DIR:join(root,'absent'),GIT_WORK_TREE:wikiRoot,GIT_OBJECT_DIRECTORY:join(root,'absent'),GIT_ALTERNATE_OBJECT_DIRECTORIES:join(root,'absent'),GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.repositoryformatversion',GIT_CONFIG_VALUE_0:'99',GIT_CONFIG_PARAMETERS:"'core.repositoryformatversion=99'",GIT_NO_REPLACE_OBJECTS:'0',GIT_NO_LAZY_FETCH:'0'});
            const result=spawnSync(process.execPath,[resolve('scripts/guide-content/prepare.mjs'),'--repository',repository,'--wiki',wikiRoot,'--wiki-revision',wikiRevision,'--toolchain',resolve(process.env.GUIDE_TOOLCHAIN_ROOT||'.'),'--report',report,'--output',output],{encoding:'utf8',env});
            assert.equal(result.status,0,result.stderr);
            const bundle=JSON.parse(await readFile(output,'utf8'));
            assert.equal(bundle.revisions.docs,original);
            assert.equal(bundle.articles.find(a=>a.kind==='docs').text,'# Original');
        }
    });
});
