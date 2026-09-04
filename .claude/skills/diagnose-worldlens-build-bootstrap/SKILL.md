---
name: diagnose-worldlens-build-bootstrap
description: Diagnose Worldlens build.bat acquisition, archive verification, and Java version detection before changing package configuration. Use when the supported build stalls or repeatedly downloads an installed runtime.
---

# Diagnose the supported build bootstrap

1. Run root `build.bat /s` and retain its phase and terminal exit status. A dependency phase is not application compilation.
2. Read `scripts/toolchain-manifest.json`. The ordinary bootstrap checks a minimum Java feature; the root build requests an exact committed release. These are different assertions.
3. Preserve the manifest URL and SHA-256. `scripts/portable-archive.ps1` hashes with framework APIs and checks the digest before extraction, including when `Get-FileHash` or `Expand-Archive` is unavailable. Never skip verification to repair a missing cmdlet.
4. For repeated Java downloads, compare the quoted release version and the runtime build independently. Temurin reports `25.0.4` first and `25.0.4+7-LTS` on its runtime line. Comparing only the first line with `25.0.4+7` rejects the correct runtime forever. `scripts/java-version.ps1` validates both and accepts only the optional LTS suffix.
5. Keep acquisition deadlines explicit and suppress unattended PowerShell progress rendering. Preserve a previous valid installation until its replacement is verified.
6. Commit reviewed repairs before starting a new source-bound build. Build receipts refuse modified source and stale output; do not remove that check to accommodate an in-flight edit.

Focused checks:

```powershell
node --test scripts/java-version.test.mjs scripts/portable-archive.test.mjs scripts/acquire-portable-tool.test.mjs scripts/build-contract.test.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/ensure-build-java.ps1
```

These cover real ZIP extraction, rejection before extraction on a wrong digest, cold/warm behavior, rollback, exact Java banner handling, and the real installed runtime. They do not prove that the application builds or its UI works.

Verified on 2026-09-04: the missing archive cmdlet interrupted portable Node acquisition. The framework helper installed Node 22.20.0 successfully, and the repaired Java probe accepted the installed committed Temurin build without another download.
