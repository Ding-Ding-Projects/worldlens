import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function executableLines(source) {
  return source.replaceAll("\r\n", "\n").split("\n").map((text, index) => ({ text: text.trim(), index }))
    .filter(({ text }) => text.length > 0 && !/^rem(?:\s|$)/i.test(text) && !/^::/.test(text));
}

function lineIndex(lines, pattern, label) {
  const found = lines.findIndex(({ text }) => pattern.test(text));
  assert.notEqual(found, -1, `${label} is missing from executable batch lines`);
  return found;
}

function countLines(lines, pattern) {
  return lines.filter(({ text }) => pattern.test(text)).length;
}

export function assertBuildContract({ build, fetcher, installer, portableScript, manifest, readme }) {
  const buildLines = executableLines(build);
  const fetcherLines = executableLines(fetcher);
  const failures = [];
  const check = (fn, message) => {
    try { fn(); } catch (error) { failures.push(`${message}: ${error.message}`); }
  };

  check(() => lineIndex(buildLines, /^if \/i "%~1"=="--run" \($/, "--run parser"), "--run parser");
  check(() => lineIndex(buildLines, /^if \/i "%~1"=="\/run" \($/, "/run parser"), "/run parser");
  check(() => lineIndex(buildLines, /^if defined RUN_AFTER_BUILD /, "RUN_AFTER_BUILD"), "RUN_AFTER_BUILD");
  check(() => lineIndex(buildLines, /^call :validate_silent$/, "SILENT validation"), "SILENT validation");
  check(() => lineIndex(buildLines, /^if "%RUN_MODE%"=="1" if "%SILENT_MODE%"=="1" goto :run_silent_conflict$/, "run plus silent rejection"), "run plus silent rejection");

  check(() => {
    assert.equal(countLines(buildLines, /^call "%ROOT%download-dependencies\.bat" %FETCH_ARGS%$/), 1, "fetcher must be called exactly once");
    const fetch = lineIndex(buildLines, /^call "%ROOT%download-dependencies\.bat" %FETCH_ARGS%$/, "fetcher invocation");
    const stop = lineIndex(buildLines, /^if errorlevel 1 goto :dependency_failed$/, "fetcher failure stop");
    assert.ok(stop > fetch, "fetcher failure must stop before later build steps");
  }, "dependency fetcher routing");

  check(() => {
    assert.match(fetcher, /winget install --id OpenJS\.NodeJS\.LTS --version 24\.19\.0/);
    assert.match(fetcher, /winget install --id Git\.Git --version 2\.55\.0\.3/);
    assert.match(fetcher, /winget install --id GitHub\.cli --version 2\.98\.0/);
    assert.match(fetcher, /acquire-portable-tool\.ps1/);
    assert.match(portableScript, /Get-FileHash/);
    assert.match(portableScript, /finally/);
    assert.match(manifest, /bb819d6eb8f5bfda294bbc83a7e4ec6539da67c4233d54b0d655b9248b15e29d/);
    assert.match(manifest, /b12919e609b4fa1176ba8a155b49f761419a0c7cc97b42e6be09874a3f760ab6/);
    assert.match(fetcher, /scripts\\toolchain-manifest\.json/);
    assert.match(fetcher, /toolchain-probe\.mjs" manifest/);
  }, "pinned fresh-machine tool acquisition");
  check(() => {
    assert.doesNotMatch(fetcher, /api\.adoptium\.net\/v3\/assets\/latest/);
    assert.doesNotMatch(portableScript, /api\.adoptium\.net\/v3\/assets\/latest/);
    assert.match(manifest, /jdk-25\.0\.4\+7/);
    assert.match(manifest, /7caab7db43bf4b94a2e6252c699e70d90084f9aa7c943cd3414761fd540937ae/);
  }, "committed Java release and digest");

  check(() => {
    lineIndex(fetcherLines, /^node "%ROOT%scripts\\verify-submodules\.mjs" --init --repo "%ROOT%\."$/, "submodule initialization");
    lineIndex(fetcherLines, /^if not "%SUBMODULE_RESULT%"=="0" goto :submodule_failed$/, "submodule failure stop");
  }, "submodule initialization and verification");

  check(() => {
    const prepare = lineIndex(buildLines, /^node "%ROOT%scripts\\build-receipt\.mjs" prepare /, "receipt prepare");
    const buildStep = lineIndex(buildLines, /^node "%NPM_CLI%" exec .* pnpm build$/, "workspace build");
    const finalize = lineIndex(buildLines, /^node "%ROOT%scripts\\build-receipt\.mjs" finalize /, "receipt finalize");
    const verify = lineIndex(buildLines, /^node "%ROOT%scripts\\build-receipt\.mjs" verify /, "receipt verify");
    const launch = lineIndex(buildLines, /^:launch$/, "launch label");
    assert.ok(prepare < buildStep && buildStep < finalize && finalize < verify && verify < launch, "receipt order is not prepare, build, finalize, verify, launch");
    lineIndex(buildLines, /^if errorlevel 1 goto :receipt_verify_failed$/, "receipt verification failure stop");
  }, "fresh source-bound artifact receipt");

  check(() => lineIndex(buildLines, /^if "%RUN_MODE%"=="1" goto :launch$/, "run handoff"), "explicit launch handoff");
  check(() => {
    const silent = lineIndex(buildLines, /^if "%SILENT_MODE%"=="1" exit \/b 0$/, "silent no-launch");
    const launch = lineIndex(buildLines, /^:launch$/, "launch label");
    assert.ok(silent < launch, "silent return must precede launch label");
  }, "silent no-launch");
  check(() => assert.match(readme, /\.\\build\.bat --run/), "README copy-and-paste command");
  check(() => {
    assert.doesNotMatch(installer, /set "PNPM_VERSION=10\.33\.0"/);
    assert.match(installer, /design[\\\/]package\.json/);
    assert.match(installer, /set "POWERSHELL_EXE=pwsh"/);
    assert.match(installer, /set "POWERSHELL_EXE=powershell\.exe"/);
    assert.match(installer, /%POWERSHELL_EXE% -NoProfile/);
  }, "installer fresh-toolchain handoff");

  if (failures.length > 0) throw new Error(`Build contract failed:\n- ${failures.join("\n- ")}`);
}

function sources() {
  return {
    build: readFileSync(join(repoRoot, "build.bat"), "utf8"),
    fetcher: readFileSync(join(repoRoot, "download-dependencies.bat"), "utf8"),
    installer: readFileSync(join(repoRoot, "build-installer.bat"), "utf8"),
    portableScript: readFileSync(join(repoRoot, "scripts", "acquire-portable-tool.ps1"), "utf8"),
    manifest: readFileSync(join(repoRoot, "scripts", "toolchain-manifest.json"), "utf8"),
    readme: readFileSync(join(repoRoot, "README.md"), "utf8"),
  };
}

test("the fresh Windows build contract is complete", () => {
  assert.doesNotThrow(() => assertBuildContract(sources()));
});

test("commented or removed executable claims turn the contract red", () => {
  const baseline = sources();
  const cases = [
    ["copy command", { ...baseline, readme: baseline.readme.replaceAll(".\\build.bat --run", ".\\build.bat") }],
    ["run parser", { ...baseline, build: baseline.build.replace('if /i "%~1"=="--run" (', 'rem if /i "%~1"=="--run" (') }],
    ["fetcher call", { ...baseline, build: baseline.build.replace('call "%ROOT%download-dependencies.bat" %FETCH_ARGS%', 'rem dependency fetcher removed') }],
    ["submodule initialization", { ...baseline, fetcher: baseline.fetcher.replace('node "%ROOT%scripts\\verify-submodules.mjs" --init --repo "%ROOT%."', 'rem submodule init removed') }],
    ["artifact receipt", { ...baseline, build: baseline.build.replace('node "%ROOT%scripts\\build-receipt.mjs" verify --repo "%ROOT%." --receipt "%RECEIPT_FILE%"', 'rem receipt verify removed') }],
    ["run handoff", { ...baseline, build: baseline.build.replace('if "%RUN_MODE%"=="1" goto :launch', 'rem run handoff removed') }],
    ["silent no-launch", { ...baseline, build: baseline.build.replace('if "%SILENT_MODE%"=="1" exit /b 0', 'rem silent no-launch removed') }],
  ];
  for (const [name, broken] of cases) assert.throws(() => assertBuildContract(broken), /Build contract failed:/, `${name} mutation did not turn the contract red`);
});

test("the fetcher dry-run reports cold and warm user-scoped profiles without mutating them", () => {
  const root = mkdtempSync(join(tmpdir(), "worldlens-build-contract-"));
  try {
    const run = (localAppData) => spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", "download-dependencies.bat --silent"], {
      cwd: repoRoot, encoding: "utf8", env: { ...process.env, LOCALAPPDATA: localAppData, WORLDLENS_FETCH_DRY_RUN: "1" },
    });
    const cold = run(join(root, "cold"));
    assert.equal(cold.status, 0, cold.stderr);
    assert.match(`${cold.stdout}${cold.stderr}`, /cold user-scoped toolchain profile/);
    const warmRoot = join(root, "warm");
    mkdirSync(join(warmRoot, "worldlens-toolchain", "node"), { recursive: true });
    writeFileSync(join(warmRoot, "worldlens-toolchain", "node", "node.exe"), "probe");
    const warm = run(warmRoot);
    assert.equal(warm.status, 0, warm.stderr);
    assert.match(`${warm.stdout}${warm.stderr}`, /warm user-scoped toolchain profile/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("invalid SILENT values are rejected before dependency acquisition", () => {
  for (const value of ["false", "yes", "-1", "2"]) {
    const result = spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", "build.bat --silent"], {
      cwd: repoRoot, encoding: "utf8", env: { ...process.env, SILENT: value, WORLDLENS_FETCH_DRY_RUN: "1" },
    });
    assert.equal(result.status, 2, `${value}: ${result.stdout}${result.stderr}`);
    assert.match(`${result.stdout}${result.stderr}`, /SILENT must be unset, 0 or 1/);
  }
});

test("run aliases and silent conflict are rejected before dependency acquisition", () => {
  for (const args of ["--run --silent", "/run /s"]) {
    const result = spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", `build.bat ${args}`], {
      cwd: repoRoot, encoding: "utf8", env: { ...process.env, WORLDLENS_FETCH_DRY_RUN: "1" },
    });
    assert.equal(result.status, 2, `${args}: ${result.stdout}${result.stderr}`);
    assert.match(`${result.stdout}${result.stderr}`, /cannot be combined/);
  }
});
