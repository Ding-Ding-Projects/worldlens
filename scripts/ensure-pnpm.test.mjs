import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

test("fresh isolated pnpm acquisition verifies the committed tarball integrity and CLI version", () => {
  const localAppData = mkdtempSync(join(tmpdir(), "worldlens-pnpm-fixture-"));
  try {
    const result = spawnSync(process.execPath, ["scripts/ensure-pnpm.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, LOCALAPPDATA: localAppData },
      timeout: 120_000,
    });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    const cli = result.stdout.trim();
    assert.match(cli, /pnpm[\\/]bin[\\/]pnpm\.(?:cjs|js)$/);
    const receipt = JSON.parse(readFileSync(join(localAppData, "worldlens-toolchain", "pnpm", "pnpm-10.33.0.receipt.json"), "utf8"));
    assert.equal(receipt.package.sha256, "bfcc1bcbad279b13a516c446a75b3c58b6904b45d57a1951411015e50b751a80");
    assert.match(receipt.installedTreeSha256, /^[0-9a-f]{64}$/);
    const version = spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8" });
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stdout.trim(), "10.33.0");
    writeFileSync(cli, "process.stdout.write('10.33.0\\n')\nTAMPERED = true\n");
    const repaired = spawnSync(process.execPath, ["scripts/ensure-pnpm.mjs"], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, LOCALAPPDATA: localAppData }, timeout: 120_000,
    });
    assert.equal(repaired.status, 0, `${repaired.stdout}${repaired.stderr}`);
    assert.equal(repaired.stdout.trim(), cli);
    assert.doesNotMatch(readFileSync(cli, "utf8"), /TAMPERED/);
  } finally {
    rmSync(localAppData, { recursive: true, force: true });
  }
});
