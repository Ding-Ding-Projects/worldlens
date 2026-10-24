import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { verifyHostingRuntime, stageHostingRuntime, assertHostingRuntimeProvenance, extractNodeRuntimeArchive } from './stage-hosting-runtime.mjs';
test('runtime ZIP extraction selects the executable and license on Unix', () => {
    const root = mkdtempSync(join(tmpdir(), 'hosting ZIP '));
    try {
        const archive = join(root, 'runtime.zip');
        // Three harmless files: the runtime, its license, and an excluded sibling.
        writeFileSync(archive, Buffer.from('UEsDBBQAAAAIAIW1V10z0WgKEQAAAA8AAAAcAAAAbm9kZS1maXh0dXJlLXdpbi14NjQvTElDRU5TRUvLrCgpLUpVyMlMTs0rTgUAUEsDBBQAAAAIAIW1V12NyacLFAAAABIAAAAdAAAAbm9kZS1maXh0dXJlLXdpbi14NjQvbm9kZS5leGVLy6woKS1KVUitSE0uLUlMykkFAFBLAwQUAAAACACFtVddyUPjDxkAAAAXAAAAJAAAAG5vZGUtZml4dHVyZS13aW4teDY0L3VucmVxdWVzdGVkLnR4dMstLS5RKErNTczMUyjNS60oKUpMLklNAQBQSwECFAAUAAAACACFtVddM9FoChEAAAAPAAAAHAAAAAAAAAAAAAAAAAAAAAAAbm9kZS1maXh0dXJlLXdpbi14NjQvTElDRU5TRVBLAQIUABQAAAAIAIW1V12NyacLFAAAABIAAAAdAAAAAAAAAAAAAAAAAEsAAABub2RlLWZpeHR1cmUtd2luLXg2NC9ub2RlLmV4ZVBLAQIUABQAAAAIAIW1V13JQ+MPGQAAABcAAAAkAAAAAAAAAAAAAAAAAJoAAABub2RlLWZpeHR1cmUtd2luLXg2NC91bnJlcXVlc3RlZC50eHRQSwUGAAAAAAMAAwDnAAAA9QAAAAAA', 'base64'));
        const output = join(root, 'extracted'); mkdirSync(output);
        const unzip = process.platform === 'win32'
            ? resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '../../..', 'usr/bin/unzip.exe')
            : 'unzip';
        extractNodeRuntimeArchive(archive, output, 'node-fixture-win-x64', 'node.exe', {
            platform: 'linux',
            run(command, args) { assert.equal(command, 'unzip'); execFileSync(unzip, args); },
        });
        assert.equal(readFileSync(join(output, 'node-fixture-win-x64/node.exe'), 'utf8'), 'fixture executable');
        assert.equal(readFileSync(join(output, 'node-fixture-win-x64/LICENSE'), 'utf8'), 'fixture license');
        assert.equal(existsSync(join(output, 'node-fixture-win-x64/unrequested.txt')), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
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

// Explicit integration mode uses only the reviewed archives and npm lock; it never
// starts a bot session or contacts authentication services.
test('independent acquisition rejects self-consistent forged runtime receipts and rederives before rebinding', { skip: process.env.WORLDLENS_RUNTIME_STAGING_INTEGRATION !== '1', timeout: 5 * 60 * 1000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), 'hosting provenance '));
    const trap = mkdtempSync(join(tmpdir(), 'npm override '));
    const previousNpm = process.env.npm_execpath;
    process.env.npm_execpath = join(trap, 'npm-cli.js');
    writeFileSync(process.env.npm_execpath, 'throw new Error(\"Untrusted npm override must not execute\");');
    try {
        await stageHostingRuntime(root);
        const extra = join(root, 'bots', 'node_modules', 'mineflayer', 'injected.js');
        writeFileSync(extra, 'module.exports = {};');
        await assert.rejects(assertHostingRuntimeProvenance(root), /Unexpected hosting runtime files/);
        rmSync(extra);
        for (const path of ['bots/auth-worker.mjs', 'node/win32-x64/node.exe', 'bots/node_modules/mineflayer/index.js']) {
            const target = join(root, path);
            const original = readFileSync(target);
            const receiptPath = join(root, 'receipt.json');
            const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
            const independent = { sourceCommit: receipt.sourceCommit, archives: receipt.archives, botLockSha256: receipt.botLockSha256, workerSha256: receipt.workerSha256 };
            writeFileSync(target, 'forged runtime bytes');
            receipt.files.find(entry => entry.path === path).sha256 = createHash('sha256').update('forged runtime bytes').digest('hex');
            writeFileSync(receiptPath, JSON.stringify(receipt));
            // This documents why a mutable output receipt is not a provenance authority.
            verifyHostingRuntime(root);
            await assert.rejects(assertHostingRuntimeProvenance(root), /Hosting provenance mismatch/);
            const unchanged = JSON.parse(readFileSync(receiptPath, 'utf8'));
            assert.deepEqual({ sourceCommit: unchanged.sourceCommit, archives: unchanged.archives, botLockSha256: unchanged.botLockSha256, workerSha256: unchanged.workerSha256 }, independent);
            await stageHostingRuntime(root);
            assert.deepEqual(readFileSync(target), original);
        }
    } finally {
        if (previousNpm === undefined) delete process.env.npm_execpath; else process.env.npm_execpath = previousNpm;
        rmSync(trap, { recursive: true, force: true });
        rmSync(root, { recursive: true, force: true });
    }
});
