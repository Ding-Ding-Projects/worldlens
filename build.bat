@echo off
setlocal DisableDelayedExpansion
rem ===========================================================================
rem  Worldlens - one-click build
rem
rem  Usage:
rem    build.bat            bootstrap, build, then ask whether to run
rem    build.bat /s         no prompt or pause
rem    build.bat --silent   same as /s
rem
rem  This entry point installs or repairs project dependencies through the
rem  committed bootstrap. It never asks the user to install Electron or pnpm by
rem  hand, and it refuses to report success until both are actually runnable.
rem ===========================================================================

set "SILENT_MODE=0"
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
if "%~1"=="/?" goto :usage
if /i "%~1"=="/s" set "SILENT_MODE=1"
if /i "%~1"=="-s" set "SILENT_MODE=1"
if /i "%~1"=="--silent" set "SILENT_MODE=1"
if /i "%~1"=="/silent" set "SILENT_MODE=1"
if defined SILENT if not "%SILENT%"=="0" set "SILENT_MODE=1"

set "ROOT=%~dp0"
set "DESIGN=%ROOT%design"
set "APPDIR=%DESIGN%\packages\app"
set "TOOLCHAIN=%LOCALAPPDATA%\worldlens-toolchain"
set "PORTABLE_NODE=%TOOLCHAIN%\node"
set "PNPM_VERSION=10.33.0"
set "STARTED=%TIME%"

echo == Worldlens build ==
echo    repository: %ROOT%
if "%SILENT_MODE%"=="1" echo    mode: silent
echo.

rem --- Node ------------------------------------------------------------------
rem The committed bootstrap is JavaScript, so Node is the one dependency this
rem wrapper must obtain before it can hand over control. Both installation routes
rem are user-scoped and the portable archive is kept outside the repository.
if exist "%PORTABLE_NODE%\node.exe" set "PATH=%PORTABLE_NODE%;%PATH%"

echo [1/5] Node 22 or newer
call :probe_node
if "%NODE_OK%"=="1" goto :node_ready

echo       no usable Node found - trying the user-scoped Windows package
where winget >nul 2>&1
if errorlevel 1 goto :node_portable
call winget install --id OpenJS.NodeJS.LTS --scope user --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
call :probe_node
if "%NODE_OK%"=="1" goto :node_ready

:node_portable
echo       package route unavailable - trying portable Node in %PORTABLE_NODE%
if not exist "%TOOLCHAIN%" mkdir "%TOOLCHAIN%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $v='v22.20.0'; $u=\"https://nodejs.org/dist/$v/node-$v-win-x64.zip\"; $z=Join-Path $env:TEMP 'worldlens-node.zip'; $t=Join-Path $env:LOCALAPPDATA 'worldlens-toolchain'; $x=Join-Path $t 'node-extract'; if(Test-Path $z){Remove-Item -LiteralPath $z -Force}; if(Test-Path $x){Remove-Item -LiteralPath $x -Recurse -Force}; Invoke-WebRequest -Uri $u -OutFile $z -UseBasicParsing; Expand-Archive -LiteralPath $z -DestinationPath $x -Force; $d=Get-ChildItem -LiteralPath $x -Directory | Where-Object Name -Like 'node-*-win-x64' | Select-Object -First 1; if($null -eq $d){throw 'portable Node archive had no runtime directory'}; $dest=Join-Path $t 'node'; if(Test-Path $dest){Remove-Item -LiteralPath $dest -Recurse -Force}; Move-Item -LiteralPath $d.FullName -Destination $dest; Remove-Item -LiteralPath $x -Recurse -Force; Remove-Item -LiteralPath $z -Force" 2>nul
if exist "%PORTABLE_NODE%\node.exe" set "PATH=%PORTABLE_NODE%;%PATH%"
call :probe_node
if not "%NODE_OK%"=="1" goto :no_node

:node_ready
echo       using %NODE_VERSION%
echo.

rem --- Self-healing bootstrap ------------------------------------------------
rem This is the repository's authority for workspace dependencies, the Electron
rem archive recovery path, Java/Gradle/BlueMap prerequisites and Playwright.
echo [2/5] Committed dependency bootstrap
pushd "%ROOT%." >nul || goto :no_root
node scripts\bootstrap.mjs
set "BOOTSTRAP_RESULT=%ERRORLEVEL%"
popd >nul
if not "%BOOTSTRAP_RESULT%"=="0" goto :bootstrap_failed
echo.

rem --- Pinned pnpm ------------------------------------------------------------
rem npm exec runs the version pinned by design/package.json without relying on a
rem global pnpm shim. --yes makes the cache-miss path non-interactive.
echo [3/5] Pinned pnpm runtime
set "NPM_CLI="
for /f "tokens=* usebackq" %%p in (`node -e "const fs=require('node:fs'),path=require('node:path'),d=path.dirname(process.execPath);const p=[path.join(d,'node_modules','npm','bin','npm-cli.js'),path.join(d,'..','lib','node_modules','npm','bin','npm-cli.js'),path.join(d,'..','share','node_modules','npm','bin','npm-cli.js')].find(fs.existsSync);if(p)process.stdout.write(p)" 2^>nul`) do set "NPM_CLI=%%p"
if not defined NPM_CLI goto :no_pnpm
node "%NPM_CLI%" exec --yes --package=pnpm@%PNPM_VERSION% -- pnpm --version
if errorlevel 1 goto :no_pnpm
echo       pnpm %PNPM_VERSION% is runnable through %NPM_CLI%
echo.

rem --- Build -----------------------------------------------------------------
echo [4/5] Workspace build
pushd "%DESIGN%" >nul || goto :no_design
node "%NPM_CLI%" exec --yes --package=pnpm@%PNPM_VERSION% -- pnpm build
set "BUILD_RESULT=%ERRORLEVEL%"
popd >nul
if not "%BUILD_RESULT%"=="0" goto :build_failed
echo.

rem --- Runtime proof ----------------------------------------------------------
rem Requiring the module path is only a presence check. --version starts the
rem recovered executable and proves that the file is a runnable Electron binary.
echo [5/5] Electron runtime proof
pushd "%APPDIR%" >nul || goto :no_app
node -e "const fs=require('node:fs'),{spawnSync}=require('node:child_process'); const exe=require('electron'); const s=fs.statSync(exe); if(!s.isFile()||s.size<1000000) throw new Error('Electron executable is missing or incomplete'); const r=spawnSync(exe,['--version'],{encoding:'utf8'}); if(r.status!==0) throw new Error('Electron executable returned '+r.status+': '+String(r.stderr||r.stdout||'').trim()); process.stdout.write('      runnable '+String(r.stdout||r.stderr||'').trim()+'\n');"
set "ELECTRON_RESULT=%ERRORLEVEL%"
popd >nul
if not "%ELECTRON_RESULT%"=="0" goto :no_electron

echo.
echo == Built successfully ==
echo    started  %STARTED%
echo    finished %TIME%

if "%SILENT_MODE%"=="1" exit /b 0

echo.
choice /c YN /n /m "Run Worldlens now? [Y/N] "
if errorlevel 2 goto :done
echo Starting Worldlens...
pushd "%DESIGN%" >nul
node "%NPM_CLI%" exec --yes --package=pnpm@%PNPM_VERSION% -- pnpm --filter @worldlens/app start
set "START_RESULT=%ERRORLEVEL%"
popd >nul
exit /b %START_RESULT%

:done
echo Not starting. Nothing else to do.
exit /b 0

:usage
echo Usage: build.bat [/s^|--silent]
echo        Bootstraps dependencies, builds the workspace and proves Electron runs.
exit /b 0

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

:no_node
echo.
echo ERROR: no runnable Node 22+ could be obtained. 1>&2
echo        Tried OpenJS.NodeJS.LTS through winget and the official portable 1>&2
echo        archive under %PORTABLE_NODE%. No machine-wide toolchain changed. 1>&2
exit /b 1

:no_root
echo ERROR: repository root %ROOT% is unavailable. 1>&2
exit /b 1

:bootstrap_failed
echo.
echo ERROR: scripts\bootstrap.mjs could not install and verify every dependency. 1>&2
echo        The bootstrap output above names the exact failed component. 1>&2
exit /b 1

:no_pnpm
echo.
echo ERROR: pnpm@%PNPM_VERSION% is not runnable through the active Node/npm runtime. 1>&2
echo        The pinned non-interactive npm CLI route failed; no global install 1>&2
echo        was attempted and the build is stopping rather than guessing. 1>&2
exit /b 1

:no_design
echo ERROR: design workspace not found at %DESIGN%. 1>&2
exit /b 1

:no_app
echo ERROR: app package not found at %APPDIR%. 1>&2
exit /b 1

:build_failed
echo.
echo ERROR: the pinned pnpm workspace build failed. The package output above 1>&2
echo        identifies the failing command. 1>&2
exit /b 1

:no_electron
echo.
echo ERROR: the committed bootstrap completed, but Electron is still not runnable. 1>&2
echo        The build is rejected because a package without a working runtime is 1>&2
echo        not a runnable program. 1>&2
exit /b 1
