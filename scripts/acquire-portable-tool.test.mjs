import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

const root = process.cwd();
const script = join(root, "scripts", "acquire-portable-tool.ps1");

function run(localAppData) {
  const temp = join(localAppData, "temp");
  mkdirSync(temp, { recursive: true });
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Tool", "node", "-DryRun"], {
    cwd: root,
    encoding: "utf8",
    env: {
      SystemRoot: process.env.SystemRoot,
      ComSpec: process.env.ComSpec,
      Path: `${process.env.SystemRoot}\\System32`,
      LOCALAPPDATA: localAppData,
      APPDATA: join(localAppData, "appdata"),
      USERPROFILE: join(localAppData, "profile"),
      TEMP: temp,
      TMP: temp,
    },
  });
}

test("sanitized cold and warm portable dry-runs do not mutate the host", () => {
  const localAppData = mkdtempSync(join(tmpdir(), "worldlens-portable-fixture-"));
  try {
    const cold = run(localAppData);
    assert.equal(cold.status, 0, cold.stderr);
    assert.match(`${cold.stdout}${cold.stderr}`, /cold user-scoped destination/);
    const destination = join(localAppData, "worldlens-toolchain", "node");
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, "prior.txt"), "prior destination");
    const warm = run(localAppData);
    assert.equal(warm.status, 0, warm.stderr);
    assert.match(`${warm.stdout}${warm.stderr}`, /warm user-scoped destination/);
    assert.equal(readFileSync(join(destination, "prior.txt"), "utf8"), "prior destination");
    assert.deepEqual(
      readdirSync(join(localAppData, "worldlens-toolchain"), { withFileTypes: true }).map((entry) => entry.name),
      ["node"],
    );
  } finally {
    rmSync(localAppData, { recursive: true, force: true });
  }
});

test("portable acquisition source contains digest failure, rollback, recovery, and final cleanup paths", () => {
  const source = readFileSync(script, "utf8");
  assert.match(source, /SHA-256 mismatch/);
  assert.match(source, /rollback/);
  assert.match(source, /Move-Item -LiteralPath \$rollback -Destination \$destination/);
  assert.match(source, /finally/);
  assert.match(source, /Remove-Item -LiteralPath \$staging/);
});
