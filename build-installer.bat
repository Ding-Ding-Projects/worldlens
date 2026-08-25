@echo off
setlocal DisableDelayedExpansion
rem ===========================================================================
rem  Worldlens - release-equivalent local installer build
rem
rem  Usage:
rem    build-installer.bat --candidate 912
rem    build-installer.bat --candidate 912 /s
rem    set WORLDLENS_RELEASE_CANDIDATE=912 && build-installer.bat --silent
rem
rem  The candidate is the positive monotonic release ordinal used by
rem  scripts/release-version.mjs. It is mandatory: guessing from one machine's
rem  installed folders produced older Squirrel packages that could not update.
rem
rem  This script builds but never publishes, tags, pushes or signs. Every emitted
rem  executable this build GENERATES must have Authenticode status NotSigned.
rem
rem  The packaged tree also carries a vendored Temurin JRE under resources\bundled,
rem  so the installer contains the runtime rather than asking a stranger to go and
rem  download one. Those binaries are Eclipse Adoptium's and arrive carrying
rem  Adoptium's own signature: jabswitch.exe is the one that first tripped this,
rem  but java.exe and javaw.exe are signed too. That is not this project signing
rem  anything. The prohibition is on obtaining a certificate and presenting our own
rem  output as authenticated; a third-party runtime's vendor signature is the
rem  opposite of that concern, and stripping it would leave users with a runtime
rem  whose provenance cannot be checked at all.
rem
rem  CI has excluded that one exact directory since the runtime started shipping
rem  and this script had not, so a local release build refused artifacts CI had
rem  already accepted. The exclusion names one exact directory rather than a
rem  pattern, and it also asserts the vendored tree is present, so an executable of
rem  our own cannot escape the check by being placed somewhere new.
rem ===========================================================================

set "SILENT_MODE=0"
set "RELEASE_CANDIDATE=%WORLDLENS_RELEASE_CANDIDATE%"

:parse_arguments
if "%~1"=="" goto :arguments_ready
if /i "%~1"=="/s" goto :silent_argument
if /i "%~1"=="-s" goto :silent_argument
if /i "%~1"=="--silent" goto :silent_argument
if /i "%~1"=="/silent" goto :silent_argument
if /i "%~1"=="--help" goto :usage_success
if /i "%~1"=="-h" goto :usage_success
if "%~1"=="/?" goto :usage_success
if /i "%~1"=="--candidate" goto :candidate_argument
if not defined RELEASE_CANDIDATE goto :positional_candidate
goto :unknown_argument

:silent_argument
set "SILENT_MODE=1"
shift /1
goto :parse_arguments

:candidate_argument
if "%~2"=="" goto :candidate_missing
set "RELEASE_CANDIDATE=%~2"
shift /1
shift /1
goto :parse_arguments

:positional_candidate
set "RELEASE_CANDIDATE=%~1"
shift /1
goto :parse_arguments

:arguments_ready
if defined SILENT if not "%SILENT%"=="0" set "SILENT_MODE=1"
if not defined RELEASE_CANDIDATE goto :candidate_missing
set "WORLDLENS_RELEASE_CANDIDATE=%RELEASE_CANDIDATE%"
powershell -NoProfile -Command "if($env:WORLDLENS_RELEASE_CANDIDATE -notmatch '^[1-9][0-9]*$'){exit 1}"
if errorlevel 1 goto :candidate_invalid

set "ROOT=%~dp0"
set "DESIGN=%ROOT%design"
set "APPDIR=%DESIGN%\packages\app"
set "PACKAGE_MANIFEST=%APPDIR%\package.json"
set "VERSION_BACKUP=%APPDIR%\.version-backup"
set "OUTPUT=%ROOT%installer"
set "PNPM_VERSION=10.33.0"
set "NPM_CONFIG_REGISTRY=https://registry.npmjs.org/"
set "STARTED=%TIME%"
set "RUN_KEY=%RANDOM%-%RANDOM%"
set "STATE_FILE=%TEMP%\worldlens-squirrel-%RUN_KEY%.json"
set "IDENTITY_FILE=%TEMP%\worldlens-identity-%RUN_KEY%.txt"
set "VERIFY_REPORT=%TEMP%\worldlens-installer-%RUN_KEY%.txt"
set "COMMIT_FILE=%TEMP%\worldlens-commit-%RUN_KEY%.txt"
set "STATUS_FILE=%TEMP%\worldlens-status-%RUN_KEY%.txt"
set "REPOSITORY_FILE=%TEMP%\worldlens-repository-%RUN_KEY%.txt"
set "LIVE_TAGS_FILE=%TEMP%\worldlens-tags-%RUN_KEY%.txt"
set "LIVE_RELEASES_FILE=%TEMP%\worldlens-releases-%RUN_KEY%.json"
set "LIVE_RUNS_FILE=%TEMP%\worldlens-runs-%RUN_KEY%.json"
set "VERSION_STAMPED=0"

if exist "%STATE_FILE%" goto :temporary_collision
if exist "%IDENTITY_FILE%" goto :temporary_collision
if exist "%VERIFY_REPORT%" goto :temporary_collision
if exist "%COMMIT_FILE%" goto :temporary_collision
if exist "%STATUS_FILE%" goto :temporary_collision
if exist "%REPOSITORY_FILE%" goto :temporary_collision
if exist "%LIVE_TAGS_FILE%" goto :temporary_collision
if exist "%LIVE_RELEASES_FILE%" goto :temporary_collision
if exist "%LIVE_RUNS_FILE%" goto :temporary_collision

echo == Worldlens installer build ==
echo    repository: %ROOT%
echo    release candidate: %RELEASE_CANDIDATE%
if "%SILENT_MODE%"=="1" echo    mode: silent
echo.

rem --- Fresh-checkout bootstrap and workspace build --------------------------
echo [1/9] Bootstrap dependencies and build the workspace
call "%ROOT%build.bat" /s
if errorlevel 1 goto :workspace_failed

rem build.bat keeps its toolchain changes local. Rediscover the two user-scoped
rem Node locations it may have populated so this parent wrapper can run the same
rem committed release helpers after a genuinely cold start.
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
if exist "%ProgramFiles%\Git\cmd\git.exe" set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
if exist "%ProgramFiles%\GitHub CLI\gh.exe" set "PATH=%ProgramFiles%\GitHub CLI;%PATH%"
if exist "%LOCALAPPDATA%\Programs\GitHub CLI\gh.exe" set "PATH=%LOCALAPPDATA%\Programs\GitHub CLI;%PATH%"
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\gh.exe" set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
if exist "%LOCALAPPDATA%\worldlens-toolchain\node\node.exe" set "PATH=%LOCALAPPDATA%\worldlens-toolchain\node;%PATH%"
if exist "%LOCALAPPDATA%\worldlens-toolchain\git\cmd\git.exe" set "PATH=%LOCALAPPDATA%\worldlens-toolchain\git\cmd;%PATH%"
if exist "%LOCALAPPDATA%\worldlens-toolchain\gh\bin\gh.exe" set "PATH=%LOCALAPPDATA%\worldlens-toolchain\gh\bin;%PATH%"
if exist "%LOCALAPPDATA%\worldlens-toolchain\java\temurin-25\bin\java.exe" set "JAVA_HOME=%LOCALAPPDATA%\worldlens-toolchain\java\temurin-25"
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"
where pwsh >nul 2>&1
if errorlevel 1 call winget install --id Microsoft.PowerShell --exact --source winget --scope user --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\pwsh.exe" set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
where pwsh >nul 2>&1
if errorlevel 1 goto :runtime_handoff_failed
where node >nul 2>&1
if errorlevel 1 goto :runtime_handoff_failed
where git >nul 2>&1
if errorlevel 1 goto :runtime_handoff_failed
git --version >nul 2>&1
if errorlevel 1 goto :runtime_handoff_failed
where gh >nul 2>&1
if errorlevel 1 goto :runtime_handoff_failed
gh --version >nul 2>&1
if errorlevel 1 goto :runtime_handoff_failed
where java >nul 2>&1
if errorlevel 1 goto :runtime_handoff_failed
java -version >nul 2>&1
if errorlevel 1 goto :runtime_handoff_failed

set "NPM_CLI="
for /f "tokens=* usebackq" %%p in (`node -e "const fs=require('node:fs'),path=require('node:path'),d=path.dirname(process.execPath);const p=[path.join(d,'node_modules','npm','bin','npm-cli.js'),path.join(d,'..','lib','node_modules','npm','bin','npm-cli.js'),path.join(d,'..','share','node_modules','npm','bin','npm-cli.js')].find(fs.existsSync);if(p)process.stdout.write(p)" 2^>nul`) do set "NPM_CLI=%%p"
if not defined NPM_CLI goto :runtime_handoff_failed

rem --- Exact source identity -------------------------------------------------
echo.
echo [2/9] Verify source identity
git -C "%ROOT%." rev-parse --verify HEAD > "%COMMIT_FILE%"
if errorlevel 1 goto :not_a_checkout
set /p "COMMIT=" < "%COMMIT_FILE%"
if not defined COMMIT goto :not_a_checkout
call :probe_clean_tree
if errorlevel 2 goto :source_status_failed
if errorlevel 1 goto :dirty_source
echo       commit %COMMIT%
echo       working tree is clean

rem --- Stage the actual renderer jar -----------------------------------------
rem bootstrap.mjs builds the CLI shadow jar; this committed helper validates and
rem copies exactly that jar into the directory electron-builder bundles.
echo.
echo [3/9] Stage the BlueMap CLI jar
pushd "%ROOT%." >nul || goto :no_root
node tools\build-jars.mjs --only cli --no-build --clean
set "JAR_RESULT=%ERRORLEVEL%"
popd >nul
if not "%JAR_RESULT%"=="0" goto :jar_failed

rem --- Resolve and prove the monotonic version -------------------------------
echo.
echo [4/9] Resolve monotonic package identity
node "%ROOT%scripts\release-version.mjs" --package "%PACKAGE_MANIFEST%" --run-number "%RELEASE_CANDIDATE%" --format lines > "%IDENTITY_FILE%"
if errorlevel 1 goto :identity_failed
set /p "PACKAGE_VERSION=" < "%IDENTITY_FILE%"
set "RELEASE_TAG="
for /f "usebackq skip=1 delims=" %%v in ("%IDENTITY_FILE%") do if not defined RELEASE_TAG set "RELEASE_TAG=%%v"
if not defined PACKAGE_VERSION goto :identity_failed
if not defined RELEASE_TAG goto :identity_failed
set "WORLDLENS_PACKAGE_VERSION=%PACKAGE_VERSION%"
set "WORLDLENS_RELEASE_TAG=%RELEASE_TAG%"
node -e "if(process.env.WORLDLENS_RELEASE_TAG!==('v'+process.env.WORLDLENS_PACKAGE_VERSION))process.exit(1)"
if errorlevel 1 goto :identity_mismatch
set "LIVE_TAG_PATTERN="
for /f "tokens=1,2 delims=." %%a in ("%RELEASE_TAG%") do set "LIVE_TAG_PATTERN=refs/tags/%%a.%%b.*"
if not defined LIVE_TAG_PATTERN goto :identity_failed
set "WORLDLENS_REPOSITORY_ROOT=%ROOT%."
set "GH_PROMPT_DISABLED=1"
set "GIT_TERMINAL_PROMPT=0"
set "GCM_INTERACTIVE=Never"
pushd "%ROOT%." >nul || goto :no_root
gh repo view --json nameWithOwner --jq .nameWithOwner > "%REPOSITORY_FILE%"
set "REPOSITORY_RESULT=%ERRORLEVEL%"
popd >nul
if not "%REPOSITORY_RESULT%"=="0" goto :live_inventory_failed
set /p "REPOSITORY_SLUG=" < "%REPOSITORY_FILE%"
if not defined REPOSITORY_SLUG goto :live_inventory_failed

git -C "%ROOT%." -c credential.interactive=never -c http.lowSpeedLimit=1 -c http.lowSpeedTime=20 ls-remote --tags --refs origin "%LIVE_TAG_PATTERN%" > "%LIVE_TAGS_FILE%"
if errorlevel 1 goto :live_inventory_failed
gh release list --repo "%REPOSITORY_SLUG%" --limit 1000 --json tagName,isDraft,isPrerelease > "%LIVE_RELEASES_FILE%"
if errorlevel 1 goto :live_inventory_failed
gh run list --repo "%REPOSITORY_SLUG%" --workflow ci.yml --limit 250 --json number,databaseId,status,conclusion > "%LIVE_RUNS_FILE%"
if errorlevel 1 goto :live_inventory_failed

set "WORLDLENS_RELEASES_FILE=%LIVE_RELEASES_FILE%"
set "WORLDLENS_RUNS_FILE=%LIVE_RUNS_FILE%"
set "WORLDLENS_TAGS_FILE=%LIVE_TAGS_FILE%"
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; $candidate=[version]$env:WORLDLENS_PACKAGE_VERSION; $ordinal=[long]$env:WORLDLENS_RELEASE_CANDIDATE; $known=[Collections.Generic.List[version]]::new(); function Add-Tag([string]$tag){if($tag -match '^v(?<v>\d+\.\d+\.\d+)$'){[void]$known.Add([version]$Matches.v)}elseif($tag -match '^v(?<base>\d+\.\d+)\.0-build\.(?<n>\d+)$'){[void]$known.Add([version]($Matches.base+'.'+$Matches.n))}}; foreach($line in Get-Content -LiteralPath $env:WORLDLENS_TAGS_FILE){if($line -match 'refs/tags/(?<tag>[^\s]+)$'){Add-Tag $Matches.tag}}; $releases=@(Get-Content -Raw -LiteralPath $env:WORLDLENS_RELEASES_FILE | ConvertFrom-Json); foreach($release in $releases){Add-Tag ([string]$release.tagName)}; $runs=@(Get-Content -Raw -LiteralPath $env:WORLDLENS_RUNS_FILE | ConvertFrom-Json); $runNumbers=@($runs | ForEach-Object {foreach($run in $_){[long]$run.number}}); if($runNumbers.Count -eq 0){throw 'live CI workflow inventory returned no run numbers'}; $maxRun=($runNumbers | Measure-Object -Maximum).Maximum; if($ordinal -le $maxRun){throw ('candidate ordinal '+$ordinal+' is not newer than live CI run '+$maxRun)}; $localAppData=$env:LOCALAPPDATA; if($null -eq $localAppData){$localAppData=''}; $installed=Join-Path $localAppData 'Worldlens'; if(Test-Path -LiteralPath $installed){foreach($directory in Get-ChildItem -LiteralPath $installed -Directory){if($directory.Name -match '^app-(?<v>\d+\.\d+\.\d+)$'){[void]$known.Add([version]$Matches.v)}}}; $blocking=@($known | Where-Object {$_ -ge $candidate}); if($blocking.Count -gt 0){$highest=($blocking | Sort-Object -Descending | Select-Object -First 1); throw ('candidate '+$candidate+' is not newer than live/local release '+$highest)}; Write-Host ('      '+$candidate+' is newer than '+$known.Count+' live/local version(s) and CI run '+$maxRun)"
if errorlevel 1 goto :candidate_not_monotonic
echo       package %PACKAGE_VERSION%
echo       release %RELEASE_TAG%

rem --- Clear only validated Squirrel candidates and record start time --------
echo.
echo [5/9] Prepare one fresh Squirrel release set
node "%ROOT%scripts\collect-squirrel-release.mjs" prepare --package-dir "%APPDIR%" --output "%OUTPUT%" --state "%STATE_FILE%" --version "%PACKAGE_VERSION%"
if errorlevel 1 goto :prepare_failed

rem --- Stamp, package and restore exact manifest bytes -----------------------
echo.
echo [6/9] Stamp and package Squirrel.Windows
if exist "%VERSION_BACKUP%" goto :backup_exists
copy /b /y "%PACKAGE_MANIFEST%" "%VERSION_BACKUP%" >nul
if errorlevel 1 goto :backup_failed
set "VERSION_STAMPED=1"

node "%ROOT%scripts\release-version.mjs" --package "%PACKAGE_MANIFEST%" --run-number "%RELEASE_CANDIDATE%" --write-package --format lines > "%IDENTITY_FILE%"
set "STAMP_RESULT=%ERRORLEVEL%"
if not "%STAMP_RESULT%"=="0" goto :stamp_failed_restore

pushd "%APPDIR%" >nul || goto :package_directory_failed_restore
node "%NPM_CLI%" exec --yes --registry=https://registry.npmjs.org/ --package=pnpm@%PNPM_VERSION% -- pnpm run make
set "MAKE_RESULT=%ERRORLEVEL%"
popd >nul

call :restore_manifest
set "RESTORE_RESULT=%ERRORLEVEL%"
if not "%RESTORE_RESULT%"=="0" goto :restore_failed
if not "%MAKE_RESULT%"=="0" goto :make_failed

rem --- Contract collection ---------------------------------------------------
echo.
echo [7/9] Collect exactly one fresh matching artifact set
node "%ROOT%scripts\collect-squirrel-release.mjs" collect --package-dir "%APPDIR%" --output "%OUTPUT%" --state "%STATE_FILE%" --version "%PACKAGE_VERSION%"
if errorlevel 1 goto :collect_failed

rem --- Authenticode, branding and final cardinality --------------------------
echo.
echo [8/9] Verify unsigned executable and release contracts
set "WORLDLENS_INSTALLER_OUTPUT=%OUTPUT%"
set "WORLDLENS_APP_PACKAGE=%APPDIR%"
set "WORLDLENS_VERIFY_REPORT=%VERIFY_REPORT%"
pwsh -NoProfile -Command "$ErrorActionPreference='Stop'; $version=$env:WORLDLENS_PACKAGE_VERSION; $output=$env:WORLDLENS_INSTALLER_OUTPUT; $app=$env:WORLDLENS_APP_PACKAGE; $setup=@(Get-ChildItem -LiteralPath $output -File | Where-Object {$_.Name -match 'Setup\.exe$'}); $full=@(Get-ChildItem -LiteralPath $output -File | Where-Object {$_.Name -match '-full\.nupkg$'}); $releases=@(Get-ChildItem -LiteralPath $output -File | Where-Object {$_.Name -ceq 'RELEASES'}); if($setup.Count -ne 1 -or $full.Count -ne 1 -or $releases.Count -ne 1){throw ('expected one Setup/full nupkg/RELEASES set, found '+$setup.Count+'/'+$full.Count+'/'+$releases.Count)}; foreach($file in @($setup[0],$full[0])){if($file.Name -notmatch [regex]::Escape($version)){throw ($file.Name+' does not match '+$version)}}; $appDirs=@(@('release/win-unpacked','dist/win-unpacked') | ForEach-Object {Join-Path $app $_} | Where-Object {Test-Path -LiteralPath $_ -PathType Container}); if($appDirs.Count -ne 1){throw ('expected one packaged application directory, found '+$appDirs.Count)}; $packaged=@(Get-ChildItem -LiteralPath $appDirs[0] -File -Filter '*.exe' -Recurse); $vendoredRoot=[System.IO.Path]::GetFullPath((Join-Path $appDirs[0] 'resources\bundled')); $vendored=@($packaged | Where-Object {$_.FullName.StartsWith($vendoredRoot,[System.StringComparison]::OrdinalIgnoreCase)}); if($vendored.Count -lt 1){throw 'no vendored runtime executables found; the bundled JRE is missing from the packaged app'}; $generated=@($packaged | Where-Object {-not $_.FullName.StartsWith($vendoredRoot,[System.StringComparison]::OrdinalIgnoreCase)}); $releaseExe=@(Get-ChildItem -LiteralPath $output -File -Filter '*.exe'); $executables=@($generated+$releaseExe | Sort-Object FullName -Unique); if($executables.Count -lt 2){throw 'packaged application and setup executables were not both found'}; foreach($exe in $executables){$signature=Get-AuthenticodeSignature -LiteralPath $exe.FullName; if($signature.Status -ne 'NotSigned'){throw ($exe.Name+' has Authenticode status '+$signature.Status+'; signing is prohibited')}}; $worldlens=@($packaged | Where-Object {$_.Name -ceq 'Worldlens.exe'}); if($worldlens.Count -ne 1){throw ('expected one packaged Worldlens.exe, found '+$worldlens.Count)}; $info=$worldlens[0].VersionInfo; if($info.ProductName -ne 'Worldlens' -or $info.FileDescription -ne 'Worldlens' -or -not $info.ProductVersion.StartsWith($version)){throw 'packaged executable branding or version does not match the release identity'}; $digest=(Get-FileHash -LiteralPath $setup[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant(); @($setup[0].FullName,[string]$setup[0].Length,$digest) | Set-Content -LiteralPath $env:WORLDLENS_VERIFY_REPORT -Encoding ascii; Write-Host ('      verified '+$executables.Count+' executable(s): branded and NotSigned')"
if errorlevel 1 goto :verification_failed

rem --- Re-prove exact source provenance after every build-side mutation -------
echo.
echo [9/9] Re-prove exact source commit and clean tree
git -C "%ROOT%." rev-parse --verify HEAD > "%COMMIT_FILE%"
if errorlevel 1 goto :final_commit_failed
set "FINAL_COMMIT="
set /p "FINAL_COMMIT=" < "%COMMIT_FILE%"
if not "%FINAL_COMMIT%"=="%COMMIT%" goto :final_commit_changed
call :probe_clean_tree
if errorlevel 2 goto :final_status_failed
if errorlevel 1 goto :final_dirty_source
echo       commit %FINAL_COMMIT% is unchanged and the working tree is clean

set /p "SETUP_PATH=" < "%VERIFY_REPORT%"
set "SETUP_SIZE="
for /f "usebackq skip=1 delims=" %%v in ("%VERIFY_REPORT%") do if not defined SETUP_SIZE set "SETUP_SIZE=%%v"
set "SETUP_SHA="
for /f "usebackq skip=2 delims=" %%v in ("%VERIFY_REPORT%") do if not defined SETUP_SHA set "SETUP_SHA=%%v"
call :cleanup_temporary

echo.
echo == Installer built and verified ==
echo    path      %SETUP_PATH%
echo    size      %SETUP_SIZE% bytes
echo    sha256    %SETUP_SHA%
echo    version   %PACKAGE_VERSION%
echo    candidate %RELEASE_CANDIDATE%
echo    commit    %COMMIT%
echo    started   %STARTED%
echo    finished  %TIME%
echo.
echo    This installer is UNSIGNED, permanently and on purpose. Windows
echo    SmartScreen may identify an unknown publisher. The SHA-256 digest detects
echo    changed bytes; it does not authenticate the publisher or author.
echo.
echo    Nothing has been published, tagged or pushed.

if "%SILENT_MODE%"=="1" exit /b 0
echo.
choice /c YN /n /m "Open the folder containing the installer? [Y/N] "
if errorlevel 2 exit /b 0
start "" explorer "%OUTPUT%"
exit /b 0

:probe_clean_tree
rem Content-aware diffs distinguish rewritten-but-identical generated files from real changes.
rem Keeping submodule comparison explicit preserves the old status probe's nested-tree coverage.
git -C "%ROOT%." diff --quiet --ignore-submodules=none --
if errorlevel 2 exit /b 2
if errorlevel 1 exit /b 1
git -C "%ROOT%." diff --cached --quiet --ignore-submodules=none --
if errorlevel 2 exit /b 2
if errorlevel 1 exit /b 1
git -C "%ROOT%." ls-files --others --exclude-standard -- > "%STATUS_FILE%"
if errorlevel 1 exit /b 2
for /f "usebackq delims=" %%s in ("%STATUS_FILE%") do exit /b 1
exit /b 0

:restore_manifest
if not "%VERSION_STAMPED%"=="1" exit /b 0
if not exist "%VERSION_BACKUP%" exit /b 1
copy /b /y "%VERSION_BACKUP%" "%PACKAGE_MANIFEST%" >nul
if errorlevel 1 exit /b 1
fc /b "%VERSION_BACKUP%" "%PACKAGE_MANIFEST%" >nul
if errorlevel 1 exit /b 1
del /q "%VERSION_BACKUP%" >nul 2>&1
if exist "%VERSION_BACKUP%" exit /b 1
set "VERSION_STAMPED=0"
echo       restored package.json byte for byte
exit /b 0

:cleanup_temporary
if exist "%STATE_FILE%" del /q "%STATE_FILE%" >nul 2>&1
if exist "%IDENTITY_FILE%" del /q "%IDENTITY_FILE%" >nul 2>&1
if exist "%VERIFY_REPORT%" del /q "%VERIFY_REPORT%" >nul 2>&1
if exist "%COMMIT_FILE%" del /q "%COMMIT_FILE%" >nul 2>&1
if exist "%STATUS_FILE%" del /q "%STATUS_FILE%" >nul 2>&1
if exist "%REPOSITORY_FILE%" del /q "%REPOSITORY_FILE%" >nul 2>&1
if exist "%LIVE_TAGS_FILE%" del /q "%LIVE_TAGS_FILE%" >nul 2>&1
if exist "%LIVE_RELEASES_FILE%" del /q "%LIVE_RELEASES_FILE%" >nul 2>&1
if exist "%LIVE_RUNS_FILE%" del /q "%LIVE_RUNS_FILE%" >nul 2>&1
exit /b 0

:stamp_failed_restore
set "STAMP_FAILURE=1"
call :restore_manifest
if errorlevel 1 goto :restore_failed
goto :stamp_failed

:package_directory_failed_restore
call :restore_manifest
if errorlevel 1 goto :restore_failed
goto :package_directory_failed

:usage_success
echo Usage: build-installer.bat --candidate ^<positive release ordinal^> [/s]
echo        WORLDLENS_RELEASE_CANDIDATE may supply the same explicit value.
exit /b 0

:candidate_missing
echo ERROR: --candidate ^<positive release ordinal^> is required. 1>&2
goto :usage_failure

:candidate_invalid
echo ERROR: release candidate must be a positive integer with no leading zero. 1>&2
goto :usage_failure

:unknown_argument
echo ERROR: unknown argument %~1. 1>&2
goto :usage_failure

:usage_failure
echo Usage: build-installer.bat --candidate ^<positive release ordinal^> [/s] 1>&2
exit /b 2

:temporary_collision
echo ERROR: temporary release-state filename collision; no build started. 1>&2
exit /b 1

:workspace_failed
echo ERROR: build.bat failed, so installer packaging did not start. 1>&2
call :cleanup_temporary
exit /b 1

:runtime_handoff_failed
echo ERROR: build.bat completed, but its verified Node/npm/Git/gh toolchain 1>&2
echo        could not be rediscovered by the installer wrapper. Packaging is rejected. 1>&2
call :cleanup_temporary
exit /b 1

:not_a_checkout
echo ERROR: the repository commit cannot be resolved; release provenance is absent. 1>&2
call :cleanup_temporary
exit /b 1

:source_status_failed
echo ERROR: git status failed, so the source tree cannot be proven clean. 1>&2
call :cleanup_temporary
exit /b 1

:dirty_source
echo ERROR: the working tree has uncommitted files. A release-equivalent installer 1>&2
echo        must be attributable to exactly commit %COMMIT%. 1>&2
call :cleanup_temporary
exit /b 1

:no_root
echo ERROR: repository root %ROOT% is unavailable. 1>&2
call :cleanup_temporary
exit /b 1

:jar_failed
echo ERROR: the built BlueMap CLI jar could not be validated and staged. 1>&2
call :cleanup_temporary
exit /b 1

:identity_failed
echo ERROR: scripts\release-version.mjs rejected candidate %RELEASE_CANDIDATE%. 1>&2
call :cleanup_temporary
exit /b 1

:identity_mismatch
echo ERROR: package version %PACKAGE_VERSION% and tag %RELEASE_TAG% are not one identity. 1>&2
call :cleanup_temporary
exit /b 1

:candidate_not_monotonic
echo ERROR: candidate %PACKAGE_VERSION% is not newer than the proven live/local 1>&2
echo        release, tag, installed-version and CI-workflow ordinal inventory. 1>&2
call :cleanup_temporary
exit /b 1

:live_inventory_failed
echo ERROR: bounded git/gh live release, tag or CI workflow inventory failed. 1>&2
echo        No raw API or interactive credential prompt was attempted; the CLI 1>&2
echo        error was printed directly above and packaging has not started. 1>&2
call :cleanup_temporary
exit /b 1

:prepare_failed
echo ERROR: the committed Squirrel collector could not prepare fresh outputs. 1>&2
call :cleanup_temporary
exit /b 1

:backup_exists
echo ERROR: %VERSION_BACKUP% already exists. It may preserve an interrupted build; 1>&2
echo        refusing to overwrite the recovery copy. 1>&2
call :cleanup_temporary
exit /b 1

:backup_failed
echo ERROR: package.json could not be backed up before version stamping. 1>&2
call :cleanup_temporary
exit /b 1

:stamp_failed
echo ERROR: release-version.mjs could not stamp package.json. Original bytes restored. 1>&2
call :cleanup_temporary
exit /b 1

:package_directory_failed
echo ERROR: app package directory %APPDIR% is unavailable. Original bytes restored. 1>&2
call :cleanup_temporary
exit /b 1

:restore_failed
echo ERROR: package.json could not be restored byte for byte. 1>&2
echo        Recovery copy retained at %VERSION_BACKUP%; packaging is rejected. 1>&2
call :cleanup_temporary
exit /b 1

:make_failed
echo ERROR: the pinned pnpm Squirrel.Windows package command failed. 1>&2
echo        package.json was restored; partial output remains only as failure evidence. 1>&2
call :cleanup_temporary
exit /b 1

:collect_failed
echo ERROR: the committed collector rejected the Squirrel output as partial, 1>&2
echo        duplicate, stale, wrong-version or internally inconsistent. 1>&2
call :cleanup_temporary
exit /b 1

:verification_failed
echo ERROR: Authenticode, branding or final artifact cardinality verification failed. 1>&2
echo        No artifact from this run is eligible for publication. 1>&2
call :cleanup_temporary
exit /b 1

:final_commit_failed
echo ERROR: final HEAD could not be resolved after packaging. Provenance failed. 1>&2
call :cleanup_temporary
exit /b 1

:final_commit_changed
echo ERROR: HEAD changed from %COMMIT% to %FINAL_COMMIT% during packaging. 1>&2
echo        The artifacts are rejected because they do not have one source identity. 1>&2
call :cleanup_temporary
exit /b 1

:final_status_failed
echo ERROR: final git status failed after packaging. Source cleanliness is unknown. 1>&2
call :cleanup_temporary
exit /b 1

:final_dirty_source
echo ERROR: packaging left tracked or untracked source changes after restoration. 1>&2
echo        The artifact is rejected even though its binary checks passed. 1>&2
call :cleanup_temporary
exit /b 1
