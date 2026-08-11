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
rem  This entry point obtains the user-scoped command-line toolchain, then
rem  installs or repairs project dependencies through the committed bootstrap.
rem  It never asks the user to install Git, GitHub CLI, Electron or pnpm by hand,
rem  and it refuses to report success until every required tool is runnable.
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
set "PORTABLE_GIT=%TOOLCHAIN%\git"
set "PORTABLE_GH=%TOOLCHAIN%\gh"
set "PNPM_VERSION=10.33.0"
set "NPM_CONFIG_REGISTRY=https://registry.npmjs.org/"
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

echo [1/7] Node 22 or newer
call :probe_node
if "%NODE_OK%"=="1" goto :node_ready

echo       no usable Node found - trying the exact user-scoped Windows package
where winget >nul 2>&1
if errorlevel 1 goto :node_portable
call winget install --id OpenJS.NodeJS.LTS --exact --source winget --scope user --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
set "ACQUIRED_NODE="
if exist "%ProgramFiles%\nodejs\node.exe" set "ACQUIRED_NODE=%ProgramFiles%\nodejs"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "ACQUIRED_NODE=%LOCALAPPDATA%\Programs\nodejs"
if defined ACQUIRED_NODE set "PATH=%ACQUIRED_NODE%;%PATH%"
call :probe_node
if "%NODE_OK%"=="1" goto :node_ready

:node_portable
echo       package route unavailable - trying portable Node in %PORTABLE_NODE%
if not exist "%TOOLCHAIN%" mkdir "%TOOLCHAIN%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $v='v22.20.0'; $asset=\"node-$v-win-x64.zip\"; $base=\"https://nodejs.org/dist/$v\"; $z=Join-Path $env:TEMP 'worldlens-node.zip'; $s=Join-Path $env:TEMP 'worldlens-node-SHASUMS256.txt'; $t=Join-Path $env:LOCALAPPDATA 'worldlens-toolchain'; $x=Join-Path $t 'node-extract'; if(Test-Path $z){Remove-Item -LiteralPath $z -Force}; if(Test-Path $s){Remove-Item -LiteralPath $s -Force}; if(Test-Path $x){Remove-Item -LiteralPath $x -Recurse -Force}; Invoke-WebRequest -Uri ($base+'/'+$asset) -OutFile $z -UseBasicParsing; Invoke-WebRequest -Uri ($base+'/SHASUMS256.txt') -OutFile $s -UseBasicParsing; $line=Get-Content -LiteralPath $s | Where-Object {$_ -match ('^[0-9a-fA-F]{64}\s+\*?'+[regex]::Escape($asset)+'$')} | Select-Object -First 1; if($null -eq $line){throw ('official SHASUMS256.txt did not list '+$asset)}; $expected=($line -split '\s+')[0].ToLowerInvariant(); $actual=(Get-FileHash -LiteralPath $z -Algorithm SHA256).Hash.ToLowerInvariant(); if($actual -ne $expected){throw ('portable Node SHA-256 mismatch: expected '+$expected+', got '+$actual)}; Expand-Archive -LiteralPath $z -DestinationPath $x -Force; $d=Get-ChildItem -LiteralPath $x -Directory | Where-Object Name -Like 'node-*-win-x64' | Select-Object -First 1; if($null -eq $d -or -not (Test-Path -LiteralPath (Join-Path $d.FullName 'node.exe') -PathType Leaf)){throw 'portable Node archive had no runnable-looking runtime directory'}; $dest=Join-Path $t 'node'; if(Test-Path $dest){Remove-Item -LiteralPath $dest -Recurse -Force}; Move-Item -LiteralPath $d.FullName -Destination $dest; Remove-Item -LiteralPath $x -Recurse -Force; Remove-Item -LiteralPath $z -Force; Remove-Item -LiteralPath $s -Force"
if exist "%PORTABLE_NODE%\node.exe" set "PATH=%PORTABLE_NODE%;%PATH%"
call :probe_node
if not "%NODE_OK%"=="1" goto :no_node

:node_ready
echo       using %NODE_VERSION%
echo.

rem --- Git -------------------------------------------------------------------
rem Installer provenance and live tag inventory require Git. Prefer WinGet's
rem exact canonical package, then verify a pinned MinGit archive from the
rem Git-for-Windows release before placing it in the user-scoped toolchain.
if exist "%PORTABLE_GIT%\cmd\git.exe" set "PATH=%PORTABLE_GIT%\cmd;%PATH%"

echo [2/7] Git
call :probe_git
if "%GIT_OK%"=="1" goto :git_ready

echo       no usable Git found - trying the exact user-scoped Windows package
where winget >nul 2>&1
if errorlevel 1 goto :git_portable
call winget install --id Git.Git --exact --source winget --scope user --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
set "ACQUIRED_GIT="
if exist "%ProgramFiles%\Git\cmd\git.exe" set "ACQUIRED_GIT=%ProgramFiles%\Git\cmd"
if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" set "ACQUIRED_GIT=%LOCALAPPDATA%\Programs\Git\cmd"
if defined ACQUIRED_GIT set "PATH=%ACQUIRED_GIT%;%PATH%"
call :probe_git
if "%GIT_OK%"=="1" goto :git_ready

:git_portable
echo       package route unavailable - trying verified MinGit in %PORTABLE_GIT%
if not exist "%TOOLCHAIN%" mkdir "%TOOLCHAIN%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $arm=$env:PROCESSOR_ARCHITECTURE -eq 'ARM64'; if($arm){$asset='MinGit-2.55.0.3-arm64.zip';$sha='f7748965d5068e81ad93ca1923650db6742d6e22332b1ae7567a841c59f6bde5'}else{$asset='MinGit-2.55.0.3-64-bit.zip';$sha='f48e2d2dc74a24454adc6d8fd0ac25bf9c2386f19cfb06202b9465aaad4f9f05'}; $url='https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.3/'+$asset; $z=Join-Path $env:TEMP 'worldlens-mingit.zip'; $t=Join-Path $env:LOCALAPPDATA 'worldlens-toolchain'; $x=Join-Path $t 'git-extract'; $dest=Join-Path $t 'git'; if(Test-Path $z){Remove-Item -LiteralPath $z -Force}; if(Test-Path $x){Remove-Item -LiteralPath $x -Recurse -Force}; Invoke-WebRequest -Uri $url -OutFile $z -UseBasicParsing; $actual=(Get-FileHash -LiteralPath $z -Algorithm SHA256).Hash.ToLowerInvariant(); if($actual -ne $sha){throw ('MinGit SHA-256 mismatch: expected '+$sha+', got '+$actual)}; Expand-Archive -LiteralPath $z -DestinationPath $x -Force; if(-not (Test-Path -LiteralPath (Join-Path $x 'cmd\git.exe') -PathType Leaf)){throw 'MinGit archive had no cmd/git.exe'}; if(Test-Path $dest){Remove-Item -LiteralPath $dest -Recurse -Force}; Move-Item -LiteralPath $x -Destination $dest; Remove-Item -LiteralPath $z -Force"
if exist "%PORTABLE_GIT%\cmd\git.exe" set "PATH=%PORTABLE_GIT%\cmd;%PATH%"
call :probe_git
if not "%GIT_OK%"=="1" goto :no_git

:git_ready
echo       using %GIT_VERSION%
echo.

rem --- GitHub CLI ------------------------------------------------------------
rem Live release and workflow ordinals are queried through the supported CLI,
rem never through a raw API. Authentication remains in gh's own credential store.
if exist "%PORTABLE_GH%\bin\gh.exe" set "PATH=%PORTABLE_GH%\bin;%PATH%"
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\gh.exe" set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"

echo [3/7] GitHub CLI
call :probe_gh
if "%GH_OK%"=="1" goto :gh_ready

echo       no usable GitHub CLI found - trying the exact user-scoped Windows package
where winget >nul 2>&1
if errorlevel 1 goto :gh_portable
call winget install --id GitHub.cli --exact --source winget --scope user --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
set "ACQUIRED_GH="
if exist "%ProgramFiles%\GitHub CLI\gh.exe" set "ACQUIRED_GH=%ProgramFiles%\GitHub CLI"
if exist "%LOCALAPPDATA%\Programs\GitHub CLI\gh.exe" set "ACQUIRED_GH=%LOCALAPPDATA%\Programs\GitHub CLI"
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\gh.exe" set "ACQUIRED_GH=%LOCALAPPDATA%\Microsoft\WinGet\Links"
if defined ACQUIRED_GH set "PATH=%ACQUIRED_GH%;%PATH%"
call :probe_gh
if "%GH_OK%"=="1" goto :gh_ready

:gh_portable
echo       package route unavailable - trying verified GitHub CLI in %PORTABLE_GH%
if not exist "%TOOLCHAIN%" mkdir "%TOOLCHAIN%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $arm=$env:PROCESSOR_ARCHITECTURE -eq 'ARM64'; if($arm){$asset='gh_2.97.0_windows_arm64.zip';$sha='3e2d4a166da4ee5020c592737b65eec0e724946d5d5b962f5fe59d99116dc4bf'}else{$asset='gh_2.97.0_windows_amd64.zip';$sha='35d7fe05c4dd1411ffda1e73dfc7c6f44b75c936ca51fa6595c657fdc0350cec'}; $url='https://github.com/cli/cli/releases/download/v2.97.0/'+$asset; $z=Join-Path $env:TEMP 'worldlens-gh.zip'; $t=Join-Path $env:LOCALAPPDATA 'worldlens-toolchain'; $x=Join-Path $t 'gh-extract'; $dest=Join-Path $t 'gh'; if(Test-Path $z){Remove-Item -LiteralPath $z -Force}; if(Test-Path $x){Remove-Item -LiteralPath $x -Recurse -Force}; Invoke-WebRequest -Uri $url -OutFile $z -UseBasicParsing; $actual=(Get-FileHash -LiteralPath $z -Algorithm SHA256).Hash.ToLowerInvariant(); if($actual -ne $sha){throw ('GitHub CLI SHA-256 mismatch: expected '+$sha+', got '+$actual)}; Expand-Archive -LiteralPath $z -DestinationPath $x -Force; $root=Get-ChildItem -LiteralPath $x -Directory | Where-Object {Test-Path -LiteralPath (Join-Path $_.FullName 'bin\gh.exe') -PathType Leaf} | Select-Object -First 1; if($null -eq $root){throw 'GitHub CLI archive had no bin/gh.exe'}; if(Test-Path $dest){Remove-Item -LiteralPath $dest -Recurse -Force}; Move-Item -LiteralPath $root.FullName -Destination $dest; Remove-Item -LiteralPath $x -Recurse -Force; Remove-Item -LiteralPath $z -Force"
if exist "%PORTABLE_GH%\bin\gh.exe" set "PATH=%PORTABLE_GH%\bin;%PATH%"
call :probe_gh
if not "%GH_OK%"=="1" goto :no_gh

:gh_ready
echo       using %GH_VERSION%
echo.

rem --- User-scoped Java toolchain -------------------------------------------
echo [4/8] Eclipse Temurin 25
set "BUILD_JAVA_HOME=%LOCALAPPDATA%\worldlens-toolchain\java\temurin-25"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\ensure-build-java.ps1"
if errorlevel 1 goto :java_failed
set "JAVA_HOME=%BUILD_JAVA_HOME%"
set "PATH=%JAVA_HOME%\bin;%PATH%"
java -version >nul 2>&1
if errorlevel 1 goto :java_failed
echo       using %JAVA_HOME%
echo.

rem --- Self-healing bootstrap ------------------------------------------------
rem This is the repository's authority for workspace dependencies, the Electron
rem archive recovery path, Java/Gradle/BlueMap prerequisites and Playwright.
echo [4/7] Committed dependency bootstrap
pushd "%ROOT%." >nul || goto :no_root
node scripts\bootstrap.mjs
set "BOOTSTRAP_RESULT=%ERRORLEVEL%"
popd >nul
if not "%BOOTSTRAP_RESULT%"=="0" goto :bootstrap_failed
echo.

rem --- Pinned pnpm ------------------------------------------------------------
rem npm exec runs the version pinned by design/package.json without relying on a
rem global pnpm shim. --yes makes the cache-miss path non-interactive.
echo [5/7] Pinned pnpm runtime
set "NPM_CLI="
for /f "tokens=* usebackq" %%p in (`node -e "const fs=require('node:fs'),path=require('node:path'),d=path.dirname(process.execPath);const p=[path.join(d,'node_modules','npm','bin','npm-cli.js'),path.join(d,'..','lib','node_modules','npm','bin','npm-cli.js'),path.join(d,'..','share','node_modules','npm','bin','npm-cli.js')].find(fs.existsSync);if(p)process.stdout.write(p)" 2^>nul`) do set "NPM_CLI=%%p"
if not defined NPM_CLI goto :no_pnpm
node "%NPM_CLI%" exec --yes --registry=https://registry.npmjs.org/ --package=pnpm@%PNPM_VERSION% -- pnpm --version
if errorlevel 1 goto :no_pnpm
echo       pnpm %PNPM_VERSION% is runnable through %NPM_CLI%
echo.

rem --- Build -----------------------------------------------------------------
echo [6/7] Workspace build
pushd "%DESIGN%" >nul || goto :no_design
node "%NPM_CLI%" exec --yes --registry=https://registry.npmjs.org/ --package=pnpm@%PNPM_VERSION% -- pnpm build
set "BUILD_RESULT=%ERRORLEVEL%"
popd >nul
if not "%BUILD_RESULT%"=="0" goto :build_failed
echo.

rem --- Runtime proof ----------------------------------------------------------
rem Requiring the module path is only a presence check. --version starts the
rem recovered executable and proves that the file is a runnable Electron binary.
echo [7/7] Electron runtime proof
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
node "%NPM_CLI%" exec --yes --registry=https://registry.npmjs.org/ --package=pnpm@%PNPM_VERSION% -- pnpm --filter @worldlens/app start
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

:probe_git
set "GIT_OK=0"
set "GIT_VERSION="
where git >nul 2>&1
if errorlevel 1 exit /b 0
for /f "tokens=* usebackq" %%v in (`git --version 2^>nul`) do set "GIT_VERSION=%%v"
if not defined GIT_VERSION exit /b 0
git --no-pager help -a >nul 2>&1
if errorlevel 1 exit /b 0
set "GIT_OK=1"
exit /b 0

:probe_gh
set "GH_OK=0"
set "GH_VERSION="
where gh >nul 2>&1
if errorlevel 1 exit /b 0
for /f "tokens=* usebackq" %%v in (`gh --version 2^>nul`) do if not defined GH_VERSION set "GH_VERSION=%%v"
if not defined GH_VERSION exit /b 0
set "GH_OK=1"
exit /b 0

:no_node
echo.
echo ERROR: no runnable Node 22+ could be obtained. 1>&2
echo        Tried OpenJS.NodeJS.LTS through winget and the official portable 1>&2
echo        archive under %PORTABLE_NODE%. No machine-wide toolchain changed. 1>&2
exit /b 1

:no_git
echo.
echo ERROR: no runnable Git could be obtained. 1>&2
echo        Tried Git.Git from the exact WinGet source and a hash-verified 1>&2
echo        MinGit archive under %PORTABLE_GIT%. Acquisition errors are above. 1>&2
exit /b 1

:no_gh
echo.
echo ERROR: no runnable GitHub CLI could be obtained. 1>&2
echo        Tried GitHub.cli from the exact WinGet source and a hash-verified 1>&2
echo        official archive under %PORTABLE_GH%. Acquisition errors are above. 1>&2
exit /b 1

:no_root
echo ERROR: repository root %ROOT% is unavailable. 1>&2
exit /b 1

:bootstrap_failed
echo.
echo ERROR: scripts\bootstrap.mjs could not install and verify every dependency. 1>&2
echo        The bootstrap output above names the exact failed component. 1>&2
exit /b 1

:java_failed
echo.
echo ERROR: Eclipse Temurin 25 could not be provisioned in the user-scoped toolchain. 1>&2
echo        The Adoptium resolver, verified download, extraction or runtime probe failed. 1>&2
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
