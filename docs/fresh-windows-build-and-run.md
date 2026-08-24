# Fresh Windows build and run

The supported copy-and-paste path for a checkout on a fresh Windows installation is:

```powershell
.\build.bat --run
```

The command is designed for a machine that has no Node.js, package manager, Java runtime, Git,
GitHub CLI, project dependency tree, Electron binary, Gradle cache, BlueMap jar, or Playwright
browser cache. It does not ask the user to prepare a toolchain first.

## What happens

`build.bat` calls `download-dependencies.bat` before it starts the workspace build. The fetcher:

1. Checks for a runnable Node 22 or newer, Git, and GitHub CLI.
2. Uses the user-scoped Windows package manager route when it is available.
3. Requests exact WinGet package versions from the committed manifest and then verifies the
   installed tool's exact version grammar. WinGet's public package-manager route does not expose a
   stable archive digest to this script, so the verifiable boundary is the canonical package ID,
   requested version, successful install exit, and independent executable version probe. The
   scripts do not claim that this route has a package SHA-256 proof.
4. Falls back to pinned official portable archives when the package manager route is unavailable.
5. Verifies downloaded archive bytes with committed SHA-256 values before extracting them.
6. Refreshes the current process `PATH`, so a tool installed during this invocation is available
   immediately.
7. Initializes every git submodule recursively and verifies each checkout against the exact
   gitlink commit recorded by the source checkout.
8. Provisions the user-scoped Eclipse Temurin 25.0.4+7 build runtime from the committed release,
   URL, and SHA-256 manifest.
9. Runs `scripts/bootstrap.mjs`, which installs and verifies the pinned workspace dependencies,
   Electron binary, Java and Gradle prerequisites, BlueMap outputs, and Playwright tooling.

The build derives its pnpm version from `design/package.json`, then runs that exact package through
the active Node npm CLI. The bootstrap uses `pnpm install --frozen-lockfile` and rejects any lockfile
change. Before any launch, it clears owned output directories, records the current source commit and
tracked-index digest, verifies the application main bundle, preload bundle, engine manifest, UI
`index.html`, and Electron binary by starting Electron with `--version`, then writes and re-reads a
receipt containing fresh hashes, sizes, timestamps, and Electron provenance. A successful build
therefore proves the outputs the development application actually loads, not merely that a package
manager returned exit code 0.

## Launch modes

| Command | Result |
| --- | --- |
| `.\build.bat --run` | Installs, builds, verifies, and launches without a post-build question. |
| `.\build.bat /run` | Same explicit launch behavior as `--run`. |
| `set RUN_AFTER_BUILD=1 && .\build.bat` | Same explicit launch behavior, useful for a scripted environment. |
| `.\build.bat` | Installs and builds, then asks whether to launch. |
| `.\build.bat /s` or `.\build.bat --silent` | Installs and builds with no prompt and never launches. |

`--run` and silent mode are rejected together before dependency acquisition. This prevents a
headless automation invocation from launching a desktop process unexpectedly. `RUN_AFTER_BUILD`
must be `0` or `1` when present.

## Failure behavior

The scripts stop at the first unsatisfied check and print the exact component, version, source
route, digest check, or runtime probe that failed. A failed archive digest is never extracted. A
partial or missing Electron binary is repaired by the committed bootstrap or causes the build to
stop. A missing app bundle or UI bundle prevents launch even when the workspace builder returned
success.

All toolchain locations are user-scoped under `%LOCALAPPDATA%\worldlens-toolchain` or the
repository's existing ignored dependency directories. The scripts do not change an unrelated
machine-wide toolchain and do not install signing material.

The scripts invoke batch files and repositories through absolute paths, so a shell with
`NoDefaultCurrentDirectoryInExePath=1` still follows the same route. A Microsoft Store app-execution
alias that cannot see the installed tool is treated as unusable and the verified portable route is
selected. Package-manager and archive extraction failures leave the destination absent or in a
quarantined temporary directory. A valid prior portable installation remains in place until the
new archive passes its digest and executable-layout checks, then the old installation is moved to a
rollback name while the new one is swapped in. The old installation is restored if that swap fails,
and a later run recovers an interrupted rollback before acquiring another copy.

## Verification

The root contract test reads the real batch files and README, checks the parser aliases, fetcher
invocation, fresh-machine acquisition routes, artifact-before-launch ordering, and silent no-launch
behavior. It then removes each asserted claim in temporary in-memory copies and proves the check
turns red before restoring the original source and proving green again:

```powershell
node --test scripts/build-contract.test.mjs
git diff --check
```

The test does not launch the desktop app. Real app interaction remains a separate headless smoke
step after the built artifact exists.
