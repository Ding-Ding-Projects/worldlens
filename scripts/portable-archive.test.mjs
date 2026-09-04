import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('framework archive path verifies bytes before extraction with unavailable cmdlets', { skip: process.platform !== 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'worldlens-archive-proof-'));
  try {
    const helper = resolve('scripts/portable-archive.ps1');
    const input = join(root, 'input');
    mkdirSync(input);
    writeFileSync(join(input, 'payload.txt'), 'actual fixture bytes');
    const script = join(root, 'check.ps1');
    writeFileSync(script, `param([string]$Helper,[string]$Root)
$ErrorActionPreference='Stop'
. $Helper
function Get-FileHash { throw 'Unavailable cmdlet must not be called' }
function Expand-Archive { throw 'Unavailable cmdlet must not be called' }
[void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem')
$archive=Join-Path $Root 'fixture.zip'
[IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $Root 'input'),$archive)
$digest=Get-PortableArchiveSha256 $archive
$rejected=$false
try { Expand-VerifiedPortableArchive $archive (Join-Path $Root 'rejected') ('0'*64) } catch { $rejected=$true }
if (-not $rejected -or [IO.Directory]::Exists((Join-Path $Root 'rejected'))) { throw 'Digest mismatch extracted bytes' }
Expand-VerifiedPortableArchive $archive (Join-Path $Root 'output') $digest
Write-Output $digest
`, 'utf8');
    const ps = join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const result = spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, helper, root], { encoding:'utf8', timeout:30000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), createHash('sha256').update(readFileSync(join(root,'fixture.zip'))).digest('hex'));
    assert.equal(readFileSync(join(root,'output/payload.txt'),'utf8'),'actual fixture bytes');
  } finally { rmSync(root,{recursive:true,force:true}); }
});
