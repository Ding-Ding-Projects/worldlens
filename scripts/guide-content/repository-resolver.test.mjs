import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {objectSource,git} from './immutable-source.mjs';
import {createRepositoryResolver,HISTORICAL_IMAGES} from './repository-resolver.mjs';
import {prepareContent} from './prepare.mjs';
const {marked}=createRequire(resolve(process.env.GUIDE_TOOLCHAIN_ROOT||'.','design/packages/viewer/package.json'))('marked');
async function fixture(run){
 const root=await mkdtemp(join(tmpdir(),'guide-root-'));
 const command=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const write=async(path,text)=>{await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),text);};
 try{
  command('init','-q');command('config','user.name','Fixture');command('config','user.email','fixture@example.invalid');
  await run({root,command,write,save:()=>{command('add','.');command('commit','-qm','Fixture');return command('rev-parse','HEAD');},
   prepare:revision=>prepareContent({docsRoot:join(root,'docs'),wikiRoot:join(root,'wiki'),docsRevision:revision,wikiRevision:revision,marked,
    sources:{docs:objectSource(root,revision,'docs'),wiki:{files:[],size(){throw Error();},read(){throw Error();}}},repositoryResolver:createRepositoryResolver(root,revision)})});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('recursively retains pinned supplemental articles, cycles, assets and explicit source references',()=>fixture(async({root,write,save,prepare})=>{
 await write('docs/Home.md','# Home\n[Guide](../guide/Start.md#start)\n[Code](../src/example.ts)\n[Directory](../src/)');
 await write('guide/Start.md','# Start\n[Next](Next.md)\n[Home](../docs/Home.md)\n![Image](image.png)');
 await write('guide/Next.md','# Next\n[Start](Start.md)\nComplete final paragraph.');
 await write('guide/image.png',Buffer.from([1,2,3]));await write('src/example.ts','export const value = 1;');
 const revision=save();await write('guide/Next.md','# Changed');await write('guide/untracked.md','# Untracked');
 const result=await prepare(revision);assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
 assert.equal(result.summary.supplemental,2);assert.equal(result.manifest.articles.length,3);
 assert.match(result.manifest.articles.find(a=>a.path==='guide/Next.md').text,/Complete final paragraph/);
 assert.equal(result.manifest.articles[0].links[0].target,'/supplemental/guide/Start#start');
 assert.equal(result.manifest.assets[0].base64,'AQID');
 for(const ref of result.manifest.articles[0].externalLinks){assert.equal(ref.revision,revision);assert.equal(ref.requiresConnectivity,true);assert.match(ref.oid,/^[a-f0-9]{40}$/);assert.ok(ref.href.includes(revision));}
 assert.equal(result.manifest.articles[0].externalLinks[1].type,'tree');
}));
test('retains genuine escapes, missing targets and newly reached unsafe HTML as diagnostics',()=>fixture(async({write,save,prepare})=>{
 await write('docs/Home.md','# Home\n[Escape](../../outside.md)\n[Missing](../absent.ts)\n[Guide](../guide.md)');
 await write('guide.md','# Guide\n<script>alert(1)</script>\n![Missing](missing.png)');
 const result=await prepare(save());assert.equal(result.ok,false);
 for(const code of ['unsafe-path','missing-or-unsafe-source-reference','unsupported-html','missing-or-unsafe-asset'])assert.ok(result.diagnostics.some(d=>d.code===code),code);
}));
test('supplemental symlinks cannot supply content',()=>fixture(async({root,write,save,prepare})=>{
 await write('docs/Home.md','# Home\n[Guide](../guide.md)');await write('outside.txt','# Not an article');await symlink('outside.txt',join(root,'guide.md'));
 await assert.rejects(prepare(save()),/unsupported-source-mode/);
}));
test('historical image adapter rejects unreviewed URLs and unavailable exact pins',()=>fixture(async({root,write,save})=>{
 await write('docs/Home.md','# Home');const resolver=createRepositoryResolver(root,save());
 assert.equal(resolver.historicalImage('https://example.org/image.png'),null);
 for(const [url] of HISTORICAL_IMAGES){assert.equal(resolver.historicalImage(url+'?changed=1'),null);assert.throws(()=>resolver.historicalImage(url));}
}));
test('reviewed historical images resolve only to their exact locally pinned blobs',()=>{
 const root=resolve(process.env.GUIDE_TOOLCHAIN_ROOT||'.');
 const resolver=createRepositoryResolver(root,git(root,['rev-parse','HEAD']));
 for(const [url,pin] of HISTORICAL_IMAGES){const image=resolver.historicalImage(url);assert.equal(image.oid,pin.oid);assert.equal(image.revision,pin.revision);assert.equal(image.read().length,image.size);}
});
test('source references use the parent submodule pin rather than its current HEAD',()=>fixture(async({root,write,command,save})=>{
 await write('docs/Home.md','# Home');
 await write('.gitmodules','[submodule "vendor/BlueMap"]\npath = vendor/BlueMap\nurl = https://github.com/BlueMap-Minecraft/BlueMap\n');save();
 const nested=join(root,'.git/modules/vendor/BlueMap');await mkdir(nested,{recursive:true});
 const sub=(...args)=>execFileSync('git',args,{cwd:nested,encoding:'utf8'}).trim();
 sub('init','-q');sub('config','user.name','Fixture');sub('config','user.email','fixture@example.invalid');
 await writeFile(join(nested,'example.ts'),'export const original = true;');sub('add','.');sub('commit','-qm','Original');
 const pin=sub('rev-parse','HEAD'),blob=sub('rev-parse','HEAD:example.ts');
 await writeFile(join(nested,'example.ts'),'export const replacement = true;');sub('add','.');sub('commit','-qm','Replacement');
 command('update-index','--add','--cacheinfo','160000,'+pin+',vendor/BlueMap');command('commit','-qm','Pin');
 const resolver=createRepositoryResolver(root,command('rev-parse','HEAD'));
 const reference=resolver.reference('vendor/BlueMap/example.ts');
 assert.equal(reference.revision,pin);assert.equal(reference.oid,blob);assert.ok(reference.href.includes('/'+pin+'/'));
 await write('.gitmodules','[submodule "vendor/BlueMap"]\npath = vendor/BlueMap\nurl = https://example.org/unreviewed\n');
 command('add','.gitmodules');command('commit','-qm','Different origin');
 assert.throws(()=>createRepositoryResolver(root,command('rev-parse','HEAD')).reference('vendor/BlueMap/example.ts'),/unreviewed-source-origin/);
 command('checkout','HEAD~1','--','.gitmodules');
 command('commit','-qm','Restore origin');
 command('update-index','--cacheinfo','160000,'+'1'.repeat(40)+',vendor/BlueMap');command('commit','-qm','Unavailable pin');
 assert.throws(()=>createRepositoryResolver(root,command('rev-parse','HEAD')).reference('vendor/BlueMap/example.ts'));
}));
