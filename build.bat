@echo off
rem ===========================================================================
rem  Worldlens - one-click build
rem
rem  Takes a checkout with nothing installed and gets it to a program you can
rem  run. It installs what is missing rather than telling you to.
rem
rem  Usage:
rem    build.bat            build, then ask whether to run it
rem    build.bat /s         silent: install and build, no prompt, no pause
rem    build.bat --silent   same thing
rem
rem  Silent mode is what CI, a scheduled task and another agent use, so it never
rem  blocks on a keypress and exits non-zero on the first real failure.
rem
rem  It does not publish, tag, push or release, and it never touches code
rem  signing - Worldlens installers are permanently unsigned on purpose.
rem
rem  No subroutines and no delayed expansion in here on purpose. An earlier
rem  version used `call :say` helpers and produced interleaved output with the
rem  wrong error attached to the wrong step, which is worse than no reporting at
rem  all: it sent a reader to the wrong phase. Plain echo, plain goto.
rem ===========================================================================

set "SILENT_MODE=0"
if /i "%~1"=="/s" set "SILENT_MODE=1"
if /i "%~1"=="-s" set "SILENT_MODE=1"
if /i "%~1"=="--silent" set "SILENT_MODE=1"
if /i "%~1"=="/silent" set "SILENT_MODE=1"
if defined SILENT if not "%SILENT%"=="0" set "SILENT_MODE=1"

set "ROOT=%~dp0"
set "DESIGN=%ROOT%design"
set "STARTED=%TIME%"

echo == Worldlens build ==
echo    repository: %ROOT%
if "%SILENT_MODE%"=="1" echo    mode: silent
echo.

rem --- Node ------------------------------------------------------------------
rem The workspace declares engines.node ">=22". Checked rather than assumed,
rem because a Node too old fails much later with an error that says nothing
rem about Node.
rem A fresh Windows install has no Node, so this fetches one rather than telling
rem you to. User-scoped, never machine-wide, so it needs no elevation and cannot
rem disturb a Node another project depends on. Two routes: winget, which ships on
rem current Windows, and a portable extract into the toolchain directory below
rem when winget is absent or refuses.
set "TOOLCHAIN=%LOCALAPPDATA%\worldlens-toolchain"
set "PORTABLE_NODE=%TOOLCHAIN%\node"
if exist "%PORTABLE_NODE%\node.exe" set "PATH=%PORTABLE_NODE%;%PATH%"

echo [1/5] Node
call :probe_node
if "%NODE_OK%"=="1" goto :node_ready

echo       no usable Node found - installing one, user-scoped
where winget >nul 2>&1
if errorlevel 1 goto :node_portable
echo       trying winget (OpenJS.NodeJS.LTS)
call winget install --id OpenJS.NodeJS.LTS --scope user --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
rem winget writes PATH for future shells, not this one, so the usual install
rem locations are added here or the very next command still cannot find node.
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
call :probe_node
if "%NODE_OK%"=="1" goto :node_ready

:node_portable
echo       falling back to a portable Node in %PORTABLE_NODE%
if not exist "%TOOLCHAIN%" mkdir "%TOOLCHAIN%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $v='v22.20.0'; $u=\"https://nodejs.org/dist/$v/node-$v-win-x64.zip\"; $z=Join-Path $env:TEMP 'worldlens-node.zip'; Invoke-WebRequest -Uri $u -OutFile $z -UseBasicParsing; $t=Join-Path $env:LOCALAPPDATA 'worldlens-toolchain'; Expand-Archive -Path $z -DestinationPath $t -Force; $d=Get-ChildItem -Path $t -Directory -Filter 'node-*-win-x64' | Select-Object -First 1; if ($null -ne $d) { $dest=Join-Path $t 'node'; if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }; Move-Item $d.FullName $dest }; Remove-Item $z -Force" 2>nul
if exist "%PORTABLE_NODE%\node.exe" set "PATH=%PORTABLE_NODE%;%PATH%"
call :probe_node
if "%NODE_OK%"=="1" goto :node_ready
goto :no_node

:node_ready
echo       using %NODE_VERSION%
echo.
goto :after_node

rem Sets NODE_OK=1 when a Node of at least the declared major is on PATH.
:probe_node
set "NODE_OK=0"
set "NODE_VERSION="
where node >nul 2>&1
if errorlevel 1 exit /b 0
for /f "tokens=* usebackq" %%v in (`node --version 2^>nul`) do set "NODE_VERSION=%%v"
if not defined NODE_VERSION exit /b 0
for /f "tokens=1 delims=. " %%m in ("%NODE_VERSION:v=%") do set "NODE_MAJOR=%%m"
if %NODE_MAJOR% GEQ 22 set "NODE_OK=1"
exit /b 0

:after_node

rem --- pnpm ------------------------------------------------------------------
rem Corepack activates the exact pnpm the manifest pins, so the lockfile is
rem resolved by the build that wrote it rather than by whatever pnpm happens to
rem be installed globally. A refusal is not fatal while some pnpm is on PATH.
echo [2/5] pnpm
call corepack enable >nul 2>&1
call corepack prepare pnpm@10.33.0 --activate >nul 2>&1
where pnpm >nul 2>&1
if errorlevel 1 goto :no_pnpm
for /f "tokens=* usebackq" %%v in (`pnpm --version`) do set "PNPM_VERSION=%%v"
echo       using pnpm %PNPM_VERSION%
echo.

rem --- Dependencies ----------------------------------------------------------
rem `--frozen-lockfile` on purpose: this builds what the lockfile says, never
rem something newer resolved behind your back. A lockfile that genuinely needs
rem updating is a commit, not a side effect of running a build script.
echo [3/5] Workspace dependencies
cd /d "%DESIGN%" || goto :no_design
call pnpm install --frozen-lockfile
if errorlevel 1 goto :install_failed
echo.

rem --- Electron binary -------------------------------------------------------
rem npm's install-script gate can leave the electron package present with no
rem electron.exe inside it, and the failure is silent: the install prints a cache
rem hit, exits 0 and extracts nothing. Resolved through Node rather than by
rem guessing a path, because pnpm's store means the package is not necessarily at
rem design\node_modules\electron.
echo [4/5] Electron runtime
set "ELECTRON_EXE="
for /f "tokens=* usebackq" %%p in (`node -e "try{const p=require.resolve('electron/package.json',{paths:['%DESIGN:\=\\%\\packages\\app','%DESIGN:\=\\%']});const d=require('path').join(require('path').dirname(p),'dist','electron.exe');console.log(require('fs').existsSync(d)?d:'')}catch{console.log('')}" 2^>nul`) do set "ELECTRON_EXE=%%p"
if defined ELECTRON_EXE (
    echo       electron.exe present
) else (
    echo       electron.exe not found - the app will not start until it is
    echo       extracted. This is not fatal for a build; see the note in
    echo       AGENTS.md about the silent-extract failure on newer Node.
)
echo.

rem --- Build -----------------------------------------------------------------
rem The workspace's own build, the same one CI runs, rather than a convenience
rem build producing something CI would not recognise.
echo [5/5] Build
call pnpm build
if errorlevel 1 goto :build_failed

echo.
echo == Built successfully ==
echo    started  %STARTED%
echo    finished %TIME%
echo    run it with: pnpm --dir design --filter @worldlens/app start

if "%SILENT_MODE%"=="1" exit /b 0

rem The prompt is the last thing this script does, never the first: a failed
rem build has already exited above, so this can only offer to launch something
rem that genuinely exists.
echo.
choice /c YN /n /m "Run Worldlens now? [Y/N] "
if errorlevel 2 goto :done
echo Starting Worldlens...
call pnpm --filter @worldlens/app start
exit /b %ERRORLEVEL%

:done
echo Not starting. Nothing else to do.
exit /b 0

:no_node
echo.
echo ERROR: could not obtain a usable Node 22+. 1>&2
echo        Both routes failed: winget (OpenJS.NodeJS.LTS, user scope) and a 1>&2
echo        portable extract into %PORTABLE_NODE%. 1>&2
echo        The usual cause is no network. Nothing was installed machine-wide 1>&2
echo        and nothing was left half-written. 1>&2
exit /b 1

:no_pnpm
echo.
echo ERROR: corepack could not activate pnpm@10.33.0 and no pnpm is on PATH. 1>&2
echo        Run: npm install -g pnpm@10.33.0 1>&2
exit /b 1

:no_design
echo.
echo ERROR: no design\ directory at %DESIGN% 1>&2
echo        Run this from the repository root. 1>&2
exit /b 1

:install_failed
echo.
echo ERROR: pnpm install failed. The output above names the package. 1>&2
echo        If the lockfile is genuinely out of date, run 'pnpm install' in 1>&2
echo        design\ and commit the result. 1>&2
exit /b 1

:build_failed
echo.
echo ERROR: pnpm build failed. The failing package is named above. 1>&2
exit /b 1
