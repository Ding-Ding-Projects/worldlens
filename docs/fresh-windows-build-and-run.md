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
3. Falls back to pinned official portable archives when the package manager route is unavailable.
4. Verifies downloaded archive bytes with SHA-256 before extracting them.
5. Refreshes the current process `PATH`, so a tool installed during this invocation is available
   immediately.
6. Provisions the user-scoped Eclipse Temurin 25 build runtime.
7. Runs `scripts/bootstrap.mjs`, which installs and verifies the pinned workspace dependencies,
   Electron binary, Java and Gradle prerequisites, BlueMap outputs, and Playwright tooling.

The build then runs the pinned `pnpm@10.33.0` command through the active Node npm CLI. Before any
launch, it verifies the application main bundle, preload bundle, UI `index.html`, and the Electron
binary by starting Electron with `--version`. A successful build therefore proves the outputs the
development application actually loads, not merely that a package manager returned exit code 0.

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
