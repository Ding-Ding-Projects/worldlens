import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { verifyHostingRuntime } from './stage-hosting-runtime.mjs';
test('hosting receipt verifies bytes and rejects missing and tampered runtime files', () => {
    const root = mkdtempSync(join(tmpdir(), 'hosting receipt '));
    try {
        const names = ['node/win32-x64/node.exe','node/linux-x64/bin/node','bots/auth-worker.mjs','bots/node_modules/mineflayer/index.js','bots/node_modules/prismarine-auth/index.js'];
        const files = names.map(path => {
            mkdirSync(join(root, path, '..'), { recursive: true });
            writeFileSync(join(root,path), path);
            return { path, sha256:createHash('sha256').update(path).digest('hex') };
        });
        const receipt = {schemaVersion:1,nodeVersion:'22.20.0',files};
        const save = () => writeFileSync(join(root,'receipt.json'),JSON.stringify(receipt));
        save(); assert.equal(verifyHostingRuntime(root).files.length,5);
        assert.throws(()=>verifyHostingRuntime(root, {pins:{platforms:{unexpected:true}}}),/archive provenance/);
        receipt.files.push(receipt.files[0]); save(); assert.throws(()=>verifyHostingRuntime(root),/Duplicate runtime receipt path/);
        receipt.files.pop(); save();
        const target=join(root,names[0]); const bytes=readFileSync(target);
        writeFileSync(target,'tamper'); assert.throws(()=>verifyHostingRuntime(root),/integrity mismatch/);
        writeFileSync(target,bytes); rmSync(target); assert.throws(()=>verifyHostingRuntime(root),/ENOENT/);
        writeFileSync(target,bytes); receipt.files.pop(); save(); assert.throws(()=>verifyHostingRuntime(root),/Missing hosting runtime receipt entry/);
        receipt.files.push({path:'../escape',sha256:'a'.repeat(64)}); save(); assert.throws(()=>verifyHostingRuntime(root),/Invalid runtime receipt path/);
    } finally { rmSync(root,{recursive:true,force:true}); }
});
