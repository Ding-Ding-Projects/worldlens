import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function assertBuildContract({ build, fetcher, readme }) {
  const failures = [];
  const requireMatch = (condition, message) => {
    if (!condition) failures.push(message);
  };

  requireMatch(
    /if \/i "%~1"=="--run"\s*\(/.test(build),
    "--run parser is missing",
  );
  requireMatch(
    /if \/i "%~1"=="\/run"\s*\(/.test(build),
    "/run parser alias is missing",
  );
  requireMatch(
    /if defined RUN_AFTER_BUILD/.test(build),
    "RUN_AFTER_BUILD=1 is not parsed",
  );
  requireMatch(
    /if "%RUN_MODE%"=="1" if "%SILENT_MODE%"=="1" goto :run_silent_conflict/.test(build),
    "run and silent conflict is not rejected before acquisition",
  );
  requireMatch(
    /call "%ROOT%download-dependencies\.bat"/.test(build),
    "build does not call the canonical root dependency fetcher",
  );
  requireMatch(
    /call "%ROOT%download-dependencies\.bat" --silent/.test(build) &&
      /call "%ROOT%download-dependencies\.bat"\s*\)/.test(build),
    "dependency fetcher has no explicit silent and interactive routes",
  );
  requireMatch(
    /winget install --id OpenJS\.NodeJS\.LTS/.test(fetcher) &&
      /\$v='v22\.20\.0'/.test(fetcher) &&
      /Get-FileHash/.test(fetcher) &&
      /portable Node SHA-256 mismatch/.test(fetcher),
    "fresh-machine Node acquisition is not pinned and digest-verified",
  );
  requireMatch(
    /winget install --id Git\.Git/.test(fetcher) &&
      /MinGit-2\.55\.0\.3/.test(fetcher),
    "fresh-machine Git acquisition is incomplete",
  );
  requireMatch(
    /winget install --id GitHub\.cli/.test(fetcher) &&
      /gh_2\.97\.0_windows/.test(fetcher),
    "fresh-machine GitHub CLI acquisition is incomplete",
  );
  requireMatch(
    /scripts\\bootstrap\.mjs/.test(fetcher) &&
      /ensure-build-java\.ps1/.test(fetcher),
    "the committed bootstrap and Java provisioning are not invoked",
  );
  requireMatch(
    /WORLDLENS_FETCH_DRY_RUN/.test(fetcher) && /DRY RUN/.test(fetcher),
    "the safe fetcher dry-run path is missing",
  );
  requireMatch(
    /if not "%ARTIFACT_RESULT%"=="0" goto :artifact_failed/.test(build),
    "launch is not blocked by artifact verification",
  );
  requireMatch(
    /if "%RUN_MODE%"=="1" goto :launch/.test(build),
    "explicit run mode does not reach the launch route",
  );
  requireMatch(
    /if "%SILENT_MODE%"=="1" exit \/b 0[\s\S]*?:launch/.test(build),
    "silent mode does not prove no launch before the launch label",
  );
  requireMatch(
    /\.\\build\.bat --run/.test(readme),
    "README does not contain the copy-and-paste build-and-run command",
  );

  if (failures.length > 0) {
    throw new Error(`Build contract failed:\n- ${failures.join("\n- ")}`);
  }
}

function sources() {
  return {
    build: readFileSync(join(repoRoot, "build.bat"), "utf8"),
    fetcher: readFileSync(join(repoRoot, "download-dependencies.bat"), "utf8"),
    readme: readFileSync(join(repoRoot, "README.md"), "utf8"),
  };
}

test("the fresh Windows build contract is complete", () => {
  assert.doesNotThrow(() => assertBuildContract(sources()));
});

test("the hand-written contract turns red for each deliberately removed claim", () => {
  const baseline = sources();
  const cases = [
    ["copy command", { ...baseline, readme: baseline.readme.replace(".\\build.bat --run", ".\\build.bat") }],
    ["run parser", { ...baseline, build: baseline.build.replace('if /i "%~1"=="--run" (', 'if /i "%~1"=="--not-run" (') }],
    ["fetcher call", { ...baseline, build: baseline.build.replace('call "%ROOT%download-dependencies.bat"', 'rem dependency fetcher removed') }],
    ["fresh Node proof", { ...baseline, fetcher: baseline.fetcher.replace("portable Node SHA-256 mismatch", "portable Node SHA-256 proof removed") }],
    ["artifact guard", { ...baseline, build: baseline.build.replace('if not "%ARTIFACT_RESULT%"=="0" goto :artifact_failed', 'rem artifact guard removed') }],
    ["run handoff", { ...baseline, build: baseline.build.replace('if "%RUN_MODE%"=="1" goto :launch', 'rem run handoff removed') }],
    ["silent no-launch", { ...baseline, build: baseline.build.replace('if "%SILENT_MODE%"=="1" exit /b 0', 'rem silent no-launch removed') }],
  ];
  for (const [name, broken] of cases) {
    assert.throws(
      () => assertBuildContract(broken),
      /Build contract failed:/,
      `${name} mutation did not turn the contract red`,
    );
  }
});

test("the fetcher dry-run reports cold and warm user-scoped profiles without mutating them", () => {
  const root = mkdtempSync(join(tmpdir(), "worldlens-build-contract-"));
  try {
    const run = (localAppData) =>
      spawnSync(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/c", "download-dependencies.bat --silent"],
        {
          cwd: repoRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            LOCALAPPDATA: localAppData,
            WORLDLENS_FETCH_DRY_RUN: "1",
          },
        },
      );
    const cold = run(join(root, "cold"));
    assert.equal(cold.status, 0, cold.stderr);
    assert.match(`${cold.stdout}${cold.stderr}`, /cold user-scoped toolchain profile/);

    const warmRoot = join(root, "warm");
    mkdirSync(join(warmRoot, "worldlens-toolchain", "node"), { recursive: true });
    writeFileSync(join(warmRoot, "worldlens-toolchain", "node", "node.exe"), "probe");
    const warm = run(warmRoot);
    assert.equal(warm.status, 0, warm.stderr);
    assert.match(`${warm.stdout}${warm.stderr}`, /warm user-scoped toolchain profile/);
    assert.equal(readFileSync(join(warmRoot, "worldlens-toolchain", "node", "node.exe"), "utf8"), "probe");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
