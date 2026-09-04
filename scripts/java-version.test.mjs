import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

test('Java probe distinguishes release version from exact runtime build', {skip:process.platform !== 'win32'}, () => {
  const root=mkdtempSync(join(tmpdir(),'worldlens-java-banner-'));
  try {
    const script=join(root,'test.ps1');
    writeFileSync(script, `param([string]$Helper)
. $Helper
$good='openjdk version "25.0.4" 2026-07-21 LTS\nOpenJDK Runtime Environment Temurin-25.0.4+7 (build 25.0.4+7-LTS)'
if (-not (Test-CommittedJavaBanner $good '25.0.4+7')) { throw 'Exact LTS runtime rejected' }
if (-not (Test-CommittedJavaBanner ($good.Replace('+7-LTS)', '+7)')) '25.0.4+7')) { throw 'Exact non-LTS runtime rejected' }
foreach ($bad in @($good.Replace('+7-LTS)', '+8-LTS)'), $good.Replace('"25.0.4"','"25.0.3"'), 'openjdk version "25.0.4"', $good.Replace('+7-LTS)', '+70-LTS)'))) {
  if (Test-CommittedJavaBanner $bad '25.0.4+7') { throw 'Inexact runtime accepted' }
}
Write-Output 'PASS'
`,'utf8');
    const result=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-ExecutionPolicy','Bypass','-File',script,resolve('scripts/java-version.ps1')],{encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout.trim(),'PASS');
  } finally {rmSync(root,{recursive:true,force:true});}
});
