#!/usr/bin/env node
/**
 * One command that makes a fresh clone able to build, test, render and package.
 *
 * Everything this project needs is installed automatically: node dependencies, the
 * Electron binary, a JDK that satisfies upstream's toolchain, Gradle, the BlueMap
 * jars built from the vendored source, and the Playwright browsers the screenshot
 * harness drives. Nothing here asks a question and nothing needs administrator
 * rights.
 *
 * Every step **verifies the dependency actually works** rather than checking that
 * a directory exists. That distinction is not pedantic: Electron shipped a `dist/`
 * folder containing only `locales/`, with no binary and no `path.txt`, and its own
 * installer exited 0 without repairing it because the folder was there. The
 * screenshot harness then failed with "Electron failed to install correctly" and
 * the cause was three layers away. A presence check would have passed.
 *
 * Installs are repository-local or user-scoped. No machine-wide toolchain is
 * upgraded, downgraded or reconfigured, because other projects on this machine
 * depend on those.
 *
 *   node scripts/bootstrap.mjs              # everything
 *   node scripts/bootstrap.mjs --skip-jars  # skip the slow Gradle build
 *   node scripts/bootstrap.mjs --check      # verify only, install nothing
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  JAR_STAMP_NAME,
  assertSafeDeletionTarget,
  classifyGhAuthStatus,
  hasShadowJar,
  jarBuildState,
  parseGhVersion,
  parseHeadCommit,
  selectGhCandidate,
  selectJavaCandidate,
  resetDirectory,
  shadowJarVersion,
  shortCommit,
  verifyElectronArchive,
} from "./bootstrap-helpers.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const designRoot = join(repoRoot, "design");
const vendorRoot = join(repoRoot, "vendor", "BlueMap");
const gradleHome = join(repoRoot, "tools", "oracle", ".gradle");

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const skipJars = args.has("--skip-jars");

/** Upstream pins `JavaLanguageVersion.of(25)` in buildSrc; anything older cannot build it. */
const REQUIRED_JAVA_MAJOR = 25;

/**
 * The sign-in command printed for a reader to run in their own terminal, scopes and all.
 *
 * The scopes are spelled out because gh's own default grant is `repo`, `read:org`, `gist`, and
 * three of the six this repository needs are outside it. Without `workflow` a render dispatch is
 * refused, and without the two project scopes the Projects work is. Worse, the refusal arrives as
 * a 403 that reads as "this account has no write access", which sends the reader looking at
 * repository permissions for a missing scope.
 */
const GH_LOGIN_COMMAND =
  "gh auth login --hostname github.com --git-protocol https " +
  "--scopes repo,workflow,gist,read:org,read:project,project";

/** A courtesy check must never hold a build hostage, so it gets a hard ceiling. */
const UPSTREAM_CHECK_TIMEOUT_MS = 15_000;

const steps = [];
let failed = false;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: options.quiet === true ? "pipe" : "inherit",
    encoding: "utf8",
    shell: false,
    ...options,
  });
  return result;
}

/**
 * Runs a command and returns stdout **and** stderr together.
 *
 * Both streams matter: `java -version` writes its version banner to stderr and
 * exits 0, so reading only stdout reports a perfectly good JDK as absent. This
 * script did exactly that on its first run.
 */
function capture(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    ...options,
  });
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function step(name, fn) {
  process.stdout.write(`\n=== ${name} ===\n`);
  try {
    const outcome = fn();
    steps.push({ name, ...outcome });
    log(`  ${outcome.ok ? "ok" : "FAILED"}: ${outcome.detail}`);
    if (!outcome.ok) failed = true;
  } catch (error) {
    steps.push({ name, ok: false, detail: String(error?.message ?? error) });
    log(`  FAILED: ${String(error?.message ?? error)}`);
    failed = true;
  }
}

/* -------------------------------------------------------------------------- */

function nodeDependencies() {
  if (!checkOnly) {
    const install = runPinnedPnpm(["install"], {
      cwd: designRoot,
      env: { ...process.env, CI: process.env.CI ?? "true" },
    });
    if (install.status !== 0) {
      return {
        ok: false,
        detail: "pinned pnpm install failed; see the output above",
      };
    }
  }
  const present = existsSync(join(designRoot, "node_modules"));
  return present
    ? { ok: true, detail: "workspace dependencies installed" }
    : { ok: false, detail: "design/node_modules is missing" };
}

function pinnedPnpmVersion() {
  const manifest = JSON.parse(
    readFileSync(join(designRoot, "package.json"), "utf8"),
  );
  const match = /^pnpm@([^\s]+)$/.exec(manifest.packageManager ?? "");
  if (match === null)
    throw new Error(
      "design/package.json must pin packageManager as pnpm@<version>",
    );
  return match[1];
}

function runPinnedPnpm(pnpmArgs, options = {}) {
  const npmCli = [
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    join(
      dirname(process.execPath),
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    ),
    join(
      dirname(process.execPath),
      "..",
      "share",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    ),
  ].find((candidate) => existsSync(candidate));
  if (npmCli === undefined) {
    throw new Error(
      "npm CLI is missing beside the active Node runtime; install the Node distribution that provides npm",
    );
  }
  const { quiet = false, ...spawnOptions } = options;
  return spawnSync(
    process.execPath,
    [
      npmCli,
      "exec",
      "--yes",
      `--package=pnpm@${pinnedPnpmVersion()}`,
      "--",
      "pnpm",
      ...pnpmArgs,
    ],
    {
      stdio: quiet ? "pipe" : "inherit",
      encoding: "utf8",
      shell: false,
      ...spawnOptions,
    },
  );
}

/**
 * Electron ships its binary through a postinstall script. Two things go wrong.
 *
 * pnpm 10 no longer reads `onlyBuiltDependencies` from package.json, so if that
 * setting is in the wrong place the postinstall never runs at all. And when the
 * download is interrupted, `dist/` is left partially populated, after which the
 * installer treats it as done and exits 0 forever.
 */
function electronBinary() {
  const pnpmDir = join(designRoot, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir))
    return { ok: false, detail: "dependencies are not installed yet" };

  // Read the directory in-process. Shelling out to `node -e` with a Windows path
  // embedded in the script is a quoting hazard, and it silently reported a
  // perfectly good install as missing.
  const entry = readdirSync(pnpmDir).find((name) =>
    name.startsWith("electron@"),
  );
  if (entry === undefined)
    return { ok: false, detail: "electron is not in the dependency tree" };

  const pkgDir = join(pnpmDir, entry, "node_modules", "electron");
  const distDir = join(pkgDir, "dist");
  const pathFile = join(pkgDir, "path.txt");

  const healthy = () => {
    if (!existsSync(pathFile)) return false;
    const exe = join(distDir, readFileSync(pathFile, "utf8").trim());
    return existsSync(exe) && statSync(exe).size > 1_000_000;
  };

  if (healthy())
    return { ok: true, detail: "electron binary present and non-trivial" };
  if (checkOnly)
    return { ok: false, detail: "electron binary is missing or incomplete" };

  // A partial `dist/` is worse than none, because the installer skips a folder
  // that already exists. Clear it so the download actually happens.
  log("  electron binary incomplete; clearing dist/ and reinstalling");
  assertSafeDeletionTarget(distDir, pkgDir);
  rmSync(distDir, { recursive: true, force: true });
  rmSync(pathFile, { force: true });
  run(process.execPath, ["install.js"], { cwd: pkgDir });
  if (healthy())
    return {
      ok: true,
      detail: "electron binary repaired by its own installer",
    };

  // Electron's installer extracts with `extract-zip`, which on some Windows setups
  // stops partway through a 130 MB archive and takes the whole process with it:
  // no error, no rejection, exit code 0, and a dist/ containing only locales/.
  // The download itself is fine, and the cached zip verifies against electron's
  // own checksums, so the repair is to extract it with something else rather than
  // to download it again.
  log(
    "  the bundled extractor produced no binary; extracting the cached archive directly",
  );
  const zip = findCachedElectronZip();
  if (zip === null) {
    return {
      ok: false,
      detail: "electron binary missing and no cached archive was found",
    };
  }
  log(`  using ${zip}`);
  try {
    const digest = verifyElectronArchive(zip, join(pkgDir, "checksums.json"));
    log(`  verified cached archive SHA-256 ${digest}`);
  } catch (error) {
    return { ok: false, detail: String(error?.message ?? error) };
  }

  // The installer may have recreated another partial locales tree. Extraction
  // starts from an empty directory so the platform extractor cannot collide
  // with those incomplete files.
  resetDirectory(distDir, pkgDir);
  if (!extractZip(zip, distDir)) {
    return {
      ok: false,
      detail: "could not extract the cached electron archive",
    };
  }
  // The installer normally writes this; it points index.js at the executable.
  writeFileSync(
    pathFile,
    process.platform === "win32" ? "electron.exe" : "electron",
    "utf8",
  );

  return healthy()
    ? { ok: true, detail: "electron binary extracted from cache and verified" }
    : {
        ok: false,
        detail: "extraction completed but no usable binary appeared",
      };
}

/** Electron caches downloads under a per-URL hash directory; find the right archive. */
function findCachedElectronZip() {
  const roots = [];
  if (process.platform === "win32") {
    for (const base of [process.env.LOCALAPPDATA, process.env.APPDATA]) {
      if (base) roots.push(join(base, "electron", "Cache"));
    }
  } else if (process.platform === "darwin") {
    if (process.env.HOME)
      roots.push(join(process.env.HOME, "Library", "Caches", "electron"));
    if (process.env.XDG_CACHE_HOME)
      roots.push(join(process.env.XDG_CACHE_HOME, "electron"));
  } else {
    const base =
      process.env.XDG_CACHE_HOME ??
      (process.env.HOME ? join(process.env.HOME, ".cache") : undefined);
    if (base) roots.push(join(base, "electron"));
  }
  const wanted = `electron-v${electronVersion()}-${process.platform}-${process.arch}.zip`;
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const bucket of readdirSync(root)) {
      const candidate = join(root, bucket, wanted);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function electronVersion() {
  const pnpmDir = join(designRoot, "node_modules", ".pnpm");
  const entry = readdirSync(pnpmDir).find((name) =>
    name.startsWith("electron@"),
  );
  return entry === undefined
    ? ""
    : entry.slice("electron@".length).split("_")[0];
}

/** Extracts a zip with whatever the platform reliably provides. */
function extractZip(zipPath, targetDir) {
  if (process.platform === "win32") {
    const script =
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
      `[System.IO.Compression.ZipFile]::ExtractToDirectory(` +
      `'${zipPath.replace(/'/g, "''")}','${targetDir.replace(/'/g, "''")}')`;
    return run("powershell", ["-NoProfile", "-Command", script]).status === 0;
  }
  return run("unzip", ["-q", "-o", zipPath, "-d", targetDir]).status === 0;
}

function parseJavaMajor(output) {
  // Matches `openjdk version "25.0.3"` and the older `"1.8.0_392"` shape.
  const match = /version "(\d+)(?:\.(\d+))?/.exec(output);
  if (match === null) return null;
  const first = Number(match[1]);
  return first === 1 ? Number(match[2] ?? 0) : first;
}

/**
 * Every place a usable JDK might already be, in the order worth trying.
 *
 * This used to be `java` on PATH alone, and the message it printed on failure told the reader to
 * install Temurin or set JAVA_HOME while consulting neither. Worse, the same product had already
 * installed exactly the right JDK: the application provisions Temurin into its own user data
 * directory for end users, at `<userData>/java/temurin-<feature>` per
 * `design/packages/app/src/main/java/installation.ts`. So a machine that had rendered a map an hour
 * earlier, and therefore certainly had a working Java, was told to go and install one. Two halves
 * of one product, one provisioning a toolchain and the other unable to see it.
 *
 * The application's own data directory is Electron's `app.getPath("userData")`, which this script
 * cannot call because it is not running inside Electron. The per-platform convention is stable and
 * is reproduced here rather than guessed: a wrong path simply does not exist and falls through to
 * the next candidate, so the cost of being wrong is one failed stat.
 */
function javaCandidates() {
  const exe = process.platform === "win32" ? "java.exe" : "java";
  const candidates = [{ command: "java", from: "PATH" }];

  const javaHome = process.env.JAVA_HOME;
  if (javaHome !== undefined && javaHome.trim().length > 0) {
    candidates.push({ command: join(javaHome, "bin", exe), from: "JAVA_HOME" });
  }

  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const userData =
    process.platform === "win32"
      ? (process.env.APPDATA ?? join(home, "AppData", "Roaming"))
      : process.platform === "darwin"
        ? join(home, "Library", "Application Support")
        : (process.env.XDG_CONFIG_HOME ?? join(home, ".config"));

  for (const productDirectory of ["worldlens", "material-bluemap"]) {
    candidates.push({
      command: join(
        userData,
        productDirectory,
        "java",
        `temurin-${String(REQUIRED_JAVA_MAJOR)}`,
        "bin",
        exe,
      ),
      from: `the JDK this application provisioned for ${productDirectory}`,
    });
  }

  return candidates;
}

function javaToolchain() {
  /*
   * The first *usable* java, not the first java that answers.
   *
   * Stopping at the first candidate that parses looks equivalent and is not, because the version
   * check happens after the loop rather than inside it. Almost every developer machine and almost
   * every CI image has some java on PATH, so PATH answered first, the loop stopped there, and
   * JAVA_HOME and the JDK this application provisions for itself were never even looked at. The
   * failure then told the reader to set JAVA_HOME while JAVA_HOME was already set to a JDK that
   * would have satisfied it, which is the exact configuration `javaCandidates` was written for.
   *
   * The best candidate seen is remembered anyway, so a machine with nothing new enough is still
   * told which java it does have rather than being told it has none.
   */
  const best = selectJavaCandidate({
    candidates: javaCandidates(),
    requiredMajor: REQUIRED_JAVA_MAJOR,
    readMajor: (candidate) =>
      parseJavaMajor(capture(candidate.command, ["-version"])),
  });
  const major = best?.major ?? null;
  const found = best?.candidate ?? null;
  if (major === null) {
    return {
      ok: false,
      detail:
        `no usable java found. Looked on PATH, at JAVA_HOME, and where this application ` +
        `provisions its own JDK. Install Temurin ${REQUIRED_JAVA_MAJOR} or set JAVA_HOME.`,
    };
  }
  if (found !== null && found.from !== "PATH" && major >= REQUIRED_JAVA_MAJOR) {
    // Gradle reads JAVA_HOME, not this script's idea of where Java is, so a JDK found anywhere
    // else has to be handed on or the jar step fails immediately after this one reported success.
    process.env.JAVA_HOME = resolve(found.command, "..", "..");
  }
  if (major < REQUIRED_JAVA_MAJOR) {
    return {
      ok: false,
      detail: `java ${major} found, but upstream pins JavaLanguageVersion.of(${REQUIRED_JAVA_MAJOR})`,
    };
  }
  return {
    ok: true,
    detail:
      `java ${major} satisfies the required ${REQUIRED_JAVA_MAJOR}` +
      (found === null || found.from === "PATH"
        ? ""
        : `, found via ${found.from}`),
  };
}

/**
 * Builds upstream's renderer and the six server plugins from the vendored source.
 *
 * Gradle downloads itself through the wrapper and caches into a repository-local
 * directory, so nothing lands in the user profile and a second project on this
 * machine is unaffected either way.
 */
function bluemapJars() {
  if (skipJars) return { ok: true, detail: "skipped by --skip-jars" };
  if (!existsSync(join(vendorRoot, "gradlew"))) {
    return {
      ok: false,
      detail:
        "vendor/BlueMap is not checked out. Run: git submodule update --init --recursive",
    };
  }

  const cliJar = join(vendorRoot, "implementations", "cli", "build", "libs");
  const stampFile = join(cliJar, JAR_STAMP_NAME);
  const built = () => hasShadowJar(cliJar);
  // Read the commit from git rather than from any file in the tree, because a file
  // is exactly what a half-finished submodule update leaves behind pointing at the
  // wrong revision. A null answer means git could not resolve the submodule at
  // all, and a stamp can never match that, so the build runs.
  const sourceCommit = parseHeadCommit(
    spawnSync("git", ["-C", vendorRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    }),
  );
  /*
   * How the source is named in every message and in the stamp.
   *
   * A vendored tree with no git metadata beside it, which is what a source archive is, has no
   * commit to report, and saying so is the whole point: the alternative that was here reported
   * git's own error text as the commit, so the build wrote `"commit": "fatal:"` into the
   * provenance file and the next run announced that the jars had been built from `fatal:`.
   */
  const sourceLabel =
    sourceCommit === null
      ? "an unreadable source revision (git could not resolve vendor/BlueMap)"
      : shortCommit(sourceCommit);
  const state = jarBuildState({
    jarDirectory: cliJar,
    stampFile,
    sourceCommit,
  });

  if (state.fresh) {
    return {
      ok: true,
      detail: `BlueMap CLI jar already built from ${sourceLabel}`,
    };
  }
  if (checkOnly) {
    // A stale jar and an absent jar are different problems with different fixes, so
    // the check-only report names which one it found instead of collapsing both into
    // "not built" and sending the reader looking for the wrong thing.
    return {
      ok: false,
      detail:
        state.reason === "stale"
          ? `BlueMap CLI jars are stale: built from ${shortCommit(state.stampCommit)}, source is at ${sourceLabel}`
          : state.reason === "missing-jar"
            ? "BlueMap CLI jar is not built"
            : `BlueMap CLI jar has no readable provenance stamp, so it cannot be shown to match ${sourceLabel}`,
    };
  }
  if (state.reason === "stale") {
    log(
      `  vendored BlueMap moved from ${shortCommit(state.stampCommit)} to ${sourceLabel}, rebuilding`,
    );
  }

  log(
    "  building the BlueMap CLI from vendored source (first run downloads Gradle)",
  );
  const wrapper = process.platform === "win32" ? "cmd.exe" : "./gradlew";
  const wrapperArgs =
    process.platform === "win32"
      ? [
          "/d",
          "/s",
          "/c",
          // The wrapper's absolute path, never the bare name and never a relative one with
          // a backslash in a JS string. `cmd /c gradlew.bat` resolves a bare name against
          // PATH, so with the wrapper sitting in `cwd` and not on PATH it reports "is not
          // recognized as an internal or external command", which reads as a missing Gradle
          // wrapper when the file is right there. Seen on a real machine where
          // `vendor/BlueMap/gradlew.bat` existed and the build failed anyway. A relative
          // ".\gradlew.bat" is the other trap: written with one backslash it is the escape
          // sequence \g, and the argument silently becomes ".gradlew.bat".
          join(vendorRoot, "gradlew.bat"),
          ":cli:shadowJar",
          "--no-daemon",
          "--console=plain",
        ]
      : [":cli:shadowJar", "--no-daemon", "--console=plain"];
  const build = run(wrapper, wrapperArgs, {
    cwd: vendorRoot,
    env: { ...process.env, GRADLE_USER_HOME: gradleHome },
  });
  if (build.status !== 0)
    return { ok: false, detail: "gradle :cli:shadowJar failed" };

  if (!built()) {
    return {
      ok: false,
      detail: "gradle reported success but produced no shadow jar",
    };
  }

  // The stamp is written only after the jar has been verified present, so a failed or
  // interrupted build can never leave behind a claim that the jars match the source.
  const version = shadowJarVersion(cliJar);
  writeFileSync(
    stampFile,
    `${JSON.stringify(
      {
        // Omitted rather than guessed when git could not be read: a stamp with no commit is
        // read back as no provenance at all, which is exactly what this build has, and both
        // this script and the application's own settings screen say so in those words.
        ...(sourceCommit === null ? {} : { commit: sourceCommit }),
        ...(version === null ? {} : { version }),
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );

  return {
    ok: true,
    detail: `BlueMap CLI jar built from ${sourceLabel}`,
  };
}

/**
 * Says loudly, on every run, when the vendored BlueMap pin has fallen behind upstream.
 *
 * It reports and never acts. Advancing the pin changes which third-party source this
 * project compiles and ships, and a supply-chain action wants a person saying yes to it
 * rather than a bootstrap script doing it while nobody is watching. Being told every
 * single build is the loud half of that bargain.
 *
 * The step can never fail the run and can never hang it. A developer with no network,
 * no gh, or an expired token still needs to build, and none of those are reasons to
 * stop. That is also why the report is never rendered as "up to date" when the check
 * could not be made: the step reports what it actually knows.
 */
function bluemapUpstream() {
  const script = join(repoRoot, "scripts", "check-bluemap-upstream.mjs");
  const probe = spawnSync(process.execPath, [script, "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    // A slow or half-open network connection must not hold a build hostage, so the
    // check is given a hard ceiling and its absence is simply reported.
    timeout: UPSTREAM_CHECK_TIMEOUT_MS,
  });
  let report = null;
  try {
    report = JSON.parse(probe.stdout ?? "");
  } catch {
    report = null;
  }
  if (report === null || report.determined !== true) {
    const why =
      report?.message ??
      (probe.error?.code === "ETIMEDOUT"
        ? `no answer within ${UPSTREAM_CHECK_TIMEOUT_MS / 1000}s, which says nothing about whether upstream has moved`
        : "the upstream check produced no usable report, which says nothing about whether upstream has moved");
    return {
      ok: true,
      detail: `upstream not checked: ${why}`,
    };
  }
  if (report.status === "behind") {
    log(
      `  vendored BlueMap is ${report.commitsBehind} commits behind ${report.upstreamRef}.`,
    );
    log(
      "  Advancing it compiles and ships new third-party code, so it is left to you:",
    );
    log("    node scripts/check-bluemap-upstream.mjs --advance");
    return {
      ok: true,
      detail: `behind upstream release ${report.upstreamRef} by ${report.commitsBehind} commits`,
    };
  }
  return {
    ok: true,
    detail: `pin is ${report.status} against upstream release ${report.upstreamRef}`,
  };
}

/**
 * Every place a usable GitHub CLI might already be, in the order worth trying.
 *
 * The Java step above is the reason this list is not just `gh` on PATH. That step used to look
 * only there, and told a machine which had provisioned a perfectly good JDK an hour earlier to go
 * and install one. The same trap is set for gh on Windows, where the winget package installs into
 * `%ProgramFiles%\GitHub CLI` or `%LOCALAPPDATA%\Programs\GitHub CLI` and a shell opened before
 * that install does not yet have either on PATH. The application already resolves exactly those
 * roots in `design/packages/app/src/main/ghcli/executable.ts`, so a bootstrap that reported gh as
 * missing while the app was happily using it would be the two halves of one product disagreeing.
 *
 * `GH_PATH` is honoured because that is the variable gh's own ecosystem uses for an explicitly
 * chosen executable, and somebody who has set it has already said which gh they mean.
 *
 * Unlike the application's resolver this list does include PATH. That resolver deliberately
 * excludes it because it runs credential-bearing commands and must not be redirected by dropping
 * another `gh` earlier on PATH. Nothing here handles a credential: this step reports what is
 * installed, so the developer's own PATH is the right first answer rather than a hazard.
 */
function ghCandidates() {
  const exe = process.platform === "win32" ? "gh.exe" : "gh";
  const candidates = [{ command: "gh", from: "PATH" }];

  const explicit = process.env.GH_PATH;
  if (explicit !== undefined && explicit.trim().length > 0) {
    candidates.push({ command: explicit.trim(), from: "GH_PATH" });
  }

  if (process.platform === "win32") {
    for (const root of [
      process.env["ProgramFiles"],
      process.env["ProgramFiles(x86)"],
    ]) {
      if (root) candidates.push({ command: join(root, "GitHub CLI", exe), from: root });
    }
    if (process.env.LOCALAPPDATA) {
      candidates.push({
        command: join(process.env.LOCALAPPDATA, "Programs", "GitHub CLI", exe),
        from: "the per-user install location",
      });
    }
  } else {
    for (const root of ["/usr/bin", "/usr/local/bin", "/opt/homebrew/bin"]) {
      candidates.push({ command: join(root, exe), from: root });
    }
  }

  return candidates;
}

/**
 * Installs gh with the platform's own package manager, without asking for administrator rights.
 *
 * User-scoped only, on purpose. Every other install in this script lands in the repository or in
 * the user profile, and gh is not worth being the one that demands elevation: a developer who
 * cannot elevate still needs a working checkout, and a machine-wide install is a change to
 * somebody else's toolchain as well as this one. When the user-scoped route is unavailable the
 * step says which command would do it rather than performing a machine-wide install quietly.
 */
function installGhCli() {
  if (process.platform === "win32") {
    return run("winget", [
      "install",
      "--id",
      "GitHub.cli",
      "--source",
      "winget",
      "--scope",
      "user",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ]);
  }
  if (process.platform === "darwin") {
    // Homebrew installs into a prefix the user already owns; the platform's other route on macOS
    // is a machine-wide package installer, which is exactly what this function will not do.
    return run("brew", ["install", "gh"]);
  }
  // Every mainstream Linux package manager writes to /usr and needs root, so there is nothing
  // here that can be run without elevation. The caller reports that rather than pretending.
  return { status: 1, unavailable: true };
}

/**
 * Reports gh in three states, because they need three different things from the reader.
 *
 * gh is not an optional convenience for this repository: it is how every workflow reaches the
 * GitHub API, how the release job publishes, how a private render moves its sealed payload
 * around, and how the application itself authenticates every call it makes. So the step checks
 * that gh is installed AND that somebody is signed in, and never reports one as the other.
 *
 * Being signed out is not a failure. A fresh clone that can build and test is the job of this
 * script, and building needs the executable rather than a credential; only the workflows and the
 * application need an account. So an unauthenticated gh reports the exact command that signs one
 * in and lets the run continue. The command is printed for the reader to run in their own
 * terminal, and is never spawned from here: `gh auth login` suppresses its device-code prompt
 * when stdin is not a terminal, so a spawned one prints nothing and waits forever.
 */
function githubCli() {
  const found = selectGhCandidate({
    candidates: ghCandidates(),
    readVersion: (candidate) => parseGhVersion(capture(candidate.command, ["--version"])),
  });

  if (found === null) {
    if (checkOnly) {
      return {
        ok: false,
        detail:
          "gh is not installed. Looked on PATH, at GH_PATH, and in the conventional install " +
          "locations. Run this script without --check to install it.",
      };
    }
    log("  gh is not installed; installing it for this user only");
    const install = installGhCli();
    if (install.unavailable === true || install.status !== 0) {
      return {
        ok: false,
        detail:
          install.unavailable === true
            ? "gh is not installed, and no package manager on this platform can install it " +
              "without root. Install it from https://cli.github.com and run this again."
            : "gh is not installed, and the user-scoped package install failed. See the output " +
              "above, or install it from https://cli.github.com.",
      };
    }
    // A package manager writes PATH for future shells, not for the process that called it, so a
    // fresh install is found through the install locations rather than through PATH on this run.
    const installed = selectGhCandidate({
      candidates: ghCandidates(),
      readVersion: (candidate) => parseGhVersion(capture(candidate.command, ["--version"])),
    });
    if (installed === null) {
      return {
        ok: false,
        detail:
          "the package manager reported success but no working gh appeared; open a new terminal " +
          "and run this script again",
      };
    }
    return ghAuthenticationState(installed, "installed just now");
  }

  return ghAuthenticationState(found, `found via ${found.candidate.from}`);
}

/** The second and third of the three states, once an executable has been established. */
function ghAuthenticationState(found, provenance) {
  const command = found.candidate.command;
  const probe = spawnSync(command, ["auth", "status", "--json", "hosts"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  const state = classifyGhAuthStatus({
    started: probe.error === undefined,
    output: `${probe.stdout ?? ""}${probe.stderr ?? ""}`,
  });

  if (state === "authenticated") {
    return {
      ok: true,
      detail: `gh ${found.version} is installed and signed in (${provenance})`,
    };
  }
  if (state === "unauthenticated") {
    log("  gh is installed but nobody is signed in. In your own terminal, run:");
    log(`    ${GH_LOGIN_COMMAND}`);
    return {
      ok: true,
      detail:
        `gh ${found.version} is installed but not signed in (${provenance}); ` +
        "sign in with the command printed above before using the workflows",
    };
  }
  // The structured route is what the application reads, so a gh that cannot answer it is
  // reported as its own state rather than folded into "not signed in", which would send the
  // reader to a login command that will not fix an out-of-date CLI.
  return {
    ok: false,
    detail:
      `gh ${found.version} (${provenance}) did not answer 'gh auth status --json hosts', which ` +
      "this repository and the application both read. Upgrade gh and run this again.",
  };
}

function playwrightCliPath() {
  const appRoot = join(designRoot, "packages", "app");
  return [
    join(appRoot, "node_modules", "@playwright", "test", "cli.js"),
    join(appRoot, "node_modules", "playwright", "cli.js"),
    join(designRoot, "node_modules", "playwright", "cli.js"),
  ].find((candidate) => existsSync(candidate));
}

function runPlaywright(playwrightArgs, options = {}) {
  const cli = playwrightCliPath();
  if (cli === undefined) return { status: 1 };
  const { quiet = false, ...spawnOptions } = options;
  return spawnSync(process.execPath, [cli, ...playwrightArgs], {
    cwd: join(designRoot, "packages", "app"),
    stdio: quiet ? "pipe" : "inherit",
    encoding: "utf8",
    shell: false,
    ...spawnOptions,
  });
}

function playwrightBrowsers() {
  const version = runPlaywright(["--version"], { quiet: true });
  if (version.status !== 0) {
    return { ok: false, detail: "the pinned Playwright CLI is unavailable" };
  }
  if (checkOnly) {
    return {
      ok: true,
      detail:
        "pinned Playwright CLI is available; Electron was verified separately",
    };
  }
  // Only the harness needs these, and it drives Electron rather than a browser, so
  // a failure here is a warning rather than a blocker.
  const install = runPlaywright(["install-deps", "chromium"], { quiet: true });
  return install.status === 0
    ? { ok: true, detail: "playwright dependencies present" }
    : {
        ok: false,
        detail: "Playwright dependency bootstrap failed",
      };
}

/* -------------------------------------------------------------------------- */

log(`Worldlens bootstrap${checkOnly ? " (check only)" : ""}`);
log(`repository: ${repoRoot}`);

step("Node dependencies", nodeDependencies);
step("Electron binary", electronBinary);
step("Java toolchain", javaToolchain);
step("GitHub CLI", githubCli);
step("BlueMap upstream", bluemapUpstream);
step("BlueMap jars", bluemapJars);
step("Playwright browsers", playwrightBrowsers);

log("\n=== summary ===");
for (const entry of steps) {
  log(`  ${entry.ok ? "ok     " : "FAILED "} ${entry.name}: ${entry.detail}`);
}

if (failed) {
  log(
    "\nSomething is not ready. Each failure above names what is missing and how to get it.",
  );
  process.exit(1);
}
log(
  "\nEverything is installed and verified. Next: cd design && pnpm build && pnpm test",
);
