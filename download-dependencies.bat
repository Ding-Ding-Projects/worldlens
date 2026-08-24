@echo off
rem ===========================================================================
rem  Worldlens - fresh-machine dependency fetcher
rem
rem  This file is intentionally a dependency-only entry point. It never builds,
rem  launches, publishes, signs, or asks a question. build.bat calls it before
rem  doing any project work, so the same acquisition path is usable on a cold
rem  Windows checkout and on a warm one.
rem
rem  Usage:
rem    download-dependencies.bat
rem    download-dependencies.bat /s
rem    download-dependencies.bat --silent
rem ===========================================================================

set "FETCH_SILENT=0"
if /i "%~1"=="/s" set "FETCH_SILENT=1"
if /i "%~1"=="-s" set "FETCH_SILENT=1"
if /i "%~1"=="--silent" set "FETCH_SILENT=1"
if /i "%~1"=="/silent" set "FETCH_SILENT=1"
if defined SILENT if not "%SILENT%"=="0" set "FETCH_SILENT=1"
if not "%~1"=="" if not "%~1"=="/s" if not "%~1"=="-s" if not "%~1"=="--silent" if not "%~1"=="/silent" goto :bad_argument
if not "%~2"=="" goto :bad_argument

set "ROOT=%~dp0"
set "TOOLCHAIN=%LOCALAPPDATA%\worldlens-toolchain"
set "PORTABLE_NODE=%TOOLCHAIN%\node"
set "PORTABLE_GIT=%TOOLCHAIN%\git"
set "PORTABLE_GH=%TOOLCHAIN%\gh"
set "PNPM_VERSION=10.33.0"
set "NPM_CONFIG_REGISTRY=https://registry.npmjs.org/"

rem Test-only probe. It deliberately performs no network, extraction, PATH edit,
rem or project install. This lets the committed contract test exercise both a
rem cold user profile and a warm portable-toolchain profile safely.
if /i "%WORLDLENS_FETCH_DRY_RUN%"=="1" goto :dry_run

echo == Worldlens dependency fetch ==
echo    repository: %ROOT%
if "%FETCH_SILENT%"=="1" echo    mode: silent
echo.

rem --- Node ------------------------------------------------------------------
if exist "%PORTABLE_NODE%\node.exe" set "PATH=%PORTABLE_NODE%;%PATH%"
echo [1/5] Node 22 or newer
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
echo       package route unavailable - trying the official hash-verified portable Node archive
if not exist "%TOOLCHAIN%" mkdir "%TOOLCHAIN%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $arm=$env:PROCESSOR_ARCHITECTURE -eq 'ARM64'; $v='v22.20.0'; $suffix=if($arm){'win-arm64'}else{'win-x64'}; $asset='node-'+$v+'-'+$suffix+'.zip'; $base='https://nodejs.org/dist/'+$v; $z=Join-Path $env:TEMP 'worldlens-node.zip'; $s=Join-Path $env:TEMP 'worldlens-node-SHASUMS256.txt'; $t=Join-Path $env:LOCALAPPDATA 'worldlens-toolchain'; $x=Join-Path $t 'node-extract'; if(Test-Path $z){Remove-Item -LiteralPath $z -Force}; if(Test-Path $s){Remove-Item -LiteralPath $s -Force}; if(Test-Path $x){Remove-Item -LiteralPath $x -Recurse -Force}; Invoke-WebRequest -Uri ($base+'/'+$asset) -OutFile $z -UseBasicParsing; Invoke-WebRequest -Uri ($base+'/SHASUMS256.txt') -OutFile $s -UseBasicParsing; $line=Get-Content -LiteralPath $s | Where-Object {$_ -match ('^[0-9a-fA-F]{64}\s+\*?'+[regex]::Escape($asset)+'$')} | Select-Object -First 1; if($null -eq $line){throw ('official SHASUMS256.txt did not list '+$asset)}; $expected=($line -split '\s+')[0].ToLowerInvariant(); $actual=(Get-FileHash -LiteralPath $z -Algorithm SHA256).Hash.ToLowerInvariant(); if($actual -ne $expected){throw ('portable Node SHA-256 mismatch: expected '+$expected+', got '+$actual)}; Expand-Archive -LiteralPath $z -DestinationPath $x -Force; $d=Get-ChildItem -LiteralPath $x -Directory | Where-Object Name -Like 'node-*-win-*' | Select-Object -First 1; if($null -eq $d -or -not (Test-Path -LiteralPath (Join-Path $d.FullName 'node.exe') -PathType Leaf)){throw 'portable Node archive had no runnable-looking runtime directory'}; $dest=Join-Path $t 'node'; if(Test-Path $dest){Remove-Item -LiteralPath $dest -Recurse -Force}; Move-Item -LiteralPath $d.FullName -Destination $dest; Remove-Item -LiteralPath $x -Recurse -Force; Remove-Item -LiteralPath $z -Force; Remove-Item -LiteralPath $s -Force"
if exist "%PORTABLE_NODE%\node.exe" set "PATH=%PORTABLE_NODE%;%PATH%"
call :probe_node
if not "%NODE_OK%"=="1" goto :no_node
:node_ready
echo       using %NODE_VERSION%
echo.

rem --- Git -------------------------------------------------------------------
if exist "%PORTABLE_GIT%\cmd\git.exe" set "PATH=%PORTABLE_GIT%\cmd;%PATH%"
echo [2/5] Git
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
echo       package route unavailable - trying the hash-verified MinGit archive
if not exist "%TOOLCHAIN%" mkdir "%TOOLCHAIN%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $arm=$env:PROCESSOR_ARCHITECTURE -eq 'ARM64'; if($arm){$asset='MinGit-2.55.0.3-arm64.zip';$sha='f7748965d5068e81ad93ca1923650db6742d6e22332b1ae7567a841c59f6bde5'}else{$asset='MinGit-2.55.0.3-64-bit.zip';$sha='f48e2d2dc74a24454adc6d8fd0ac25bf9c2386f19cfb06202b9465aaad4f9f05'}; $url='https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.3/'+$asset; $z=Join-Path $env:TEMP 'worldlens-mingit.zip'; $t=Join-Path $env:LOCALAPPDATA 'worldlens-toolchain'; $x=Join-Path $t 'git-extract'; $dest=Join-Path $t 'git'; if(Test-Path $z){Remove-Item -LiteralPath $z -Force}; if(Test-Path $x){Remove-Item -LiteralPath $x -Recurse -Force}; Invoke-WebRequest -Uri $url -OutFile $z -UseBasicParsing; $actual=(Get-FileHash -LiteralPath $z -Algorithm SHA256).Hash.ToLowerInvariant(); if($actual -ne $sha){throw ('MinGit SHA-256 mismatch: expected '+$sha+', got '+$actual)}; Expand-Archive -LiteralPath $z -DestinationPath $x -Force; if(-not (Test-Path -LiteralPath (Join-Path $x 'cmd\git.exe') -PathType Leaf)){throw 'MinGit archive had no cmd/git.exe'}; if(Test-Path $dest){Remove-Item -LiteralPath $dest -Recurse -Force}; Move-Item -LiteralPath $x -Destination $dest; Remove-Item -LiteralPath $z -Force"
if exist "%PORTABLE_GIT%\cmd\git.exe" set "PATH=%PORTABLE_GIT%\cmd;%PATH%"
call :probe_git
if not "%GIT_OK%"=="1" goto :no_git
:git_ready
echo       using %GIT_VERSION%
echo.

rem --- GitHub CLI ------------------------------------------------------------
if exist "%PORTABLE_GH%\bin\gh.exe" set "PATH=%PORTABLE_GH%\bin;%PATH%"
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\gh.exe" set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
echo [3/5] GitHub CLI
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
echo       package route unavailable - trying the hash-verified GitHub CLI archive
if not exist "%TOOLCHAIN%" mkdir "%TOOLCHAIN%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $arm=$env:PROCESSOR_ARCHITECTURE -eq 'ARM64'; if($arm){$asset='gh_2.97.0_windows_arm64.zip';$sha='3e2d4a166da4ee5020c592737b65eec0e724946d5d5b962f5fe59d99116dc4bf'}else{$asset='gh_2.97.0_windows_amd64.zip';$sha='35d7fe05c4dd1411ffda1e73dfc7c6f44b75c936ca51fa6595c657fdc0350cec'}; $url='https://github.com/cli/cli/releases/download/v2.97.0/'+$asset; $z=Join-Path $env:TEMP 'worldlens-gh.zip'; $t=Join-Path $env:LOCALAPPDATA 'worldlens-toolchain'; $x=Join-Path $t 'gh-extract'; $dest=Join-Path $t 'gh'; if(Test-Path $z){Remove-Item -LiteralPath $z -Force}; if(Test-Path $x){Remove-Item -LiteralPath $x -Recurse -Force}; Invoke-WebRequest -Uri $url -OutFile $z -UseBasicParsing; $actual=(Get-FileHash -LiteralPath $z -Algorithm SHA256).Hash.ToLowerInvariant(); if($actual -ne $sha){throw ('GitHub CLI SHA-256 mismatch: expected '+$sha+', got '+$actual)}; Expand-Archive -LiteralPath $z -DestinationPath $x -Force; $root=Get-ChildItem -LiteralPath $x -Directory | Where-Object {Test-Path -LiteralPath (Join-Path $_.FullName 'bin\gh.exe') -PathType Leaf} | Select-Object -First 1; if($null -eq $root){throw 'GitHub CLI archive had no bin/gh.exe'}; if(Test-Path $dest){Remove-Item -LiteralPath $dest -Recurse -Force}; Move-Item -LiteralPath $root.FullName -Destination $dest; Remove-Item -LiteralPath $x -Recurse -Force; Remove-Item -LiteralPath $z -Force"
if exist "%PORTABLE_GH%\bin\gh.exe" set "PATH=%PORTABLE_GH%\bin;%PATH%"
call :probe_gh
if not "%GH_OK%"=="1" goto :no_gh
:gh_ready
echo       using %GH_VERSION%
echo.

rem --- Java and project dependency bootstrap -------------------------------
echo [4/5] Eclipse Temurin 25 build runtime
set "BUILD_JAVA_HOME=%LOCALAPPDATA%\worldlens-toolchain\java\temurin-25"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\ensure-build-java.ps1"
if errorlevel 1 goto :java_failed
set "JAVA_HOME=%BUILD_JAVA_HOME%"
set "PATH=%JAVA_HOME%\bin;%PATH%"
java -version >nul 2>&1
if errorlevel 1 goto :java_failed
echo       using %JAVA_HOME%
echo.

echo [5/5] Committed dependency bootstrap
pushd "%ROOT%." >nul || goto :no_root
node scripts\bootstrap.mjs
set "BOOTSTRAP_RESULT=%ERRORLEVEL%"
popd >nul
if not "%BOOTSTRAP_RESULT%"=="0" goto :bootstrap_failed
echo.
echo == Dependencies installed and verified ==
echo    Node: %NODE_VERSION%
echo    Git: %GIT_VERSION%
echo    GitHub CLI: %GH_VERSION%
echo    Java: %JAVA_HOME%
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

:bad_argument
echo ERROR: download-dependencies.bat accepts only /s, -s, --silent or /silent. 1>&2
exit /b 2
:dry_run
echo DRY RUN: no dependency installation or project mutation will occur.
if exist "%PORTABLE_NODE%\node.exe" (
    echo DRY RUN: warm user-scoped toolchain profile detected.
) else (
    echo DRY RUN: cold user-scoped toolchain profile detected; acquisition routes are ready.
)
exit /b 0
:no_node
echo ERROR: no runnable Node 22+ could be obtained from WinGet or the official portable archive. 1>&2
exit /b 1
:no_git
echo ERROR: no runnable Git could be obtained from WinGet or the hash-verified MinGit archive. 1>&2
exit /b 1
:no_gh
echo ERROR: no runnable GitHub CLI could be obtained from WinGet or its hash-verified official archive. 1>&2
exit /b 1
:no_root
echo ERROR: repository root %ROOT% is unavailable. 1>&2
exit /b 1
:java_failed
echo ERROR: Eclipse Temurin 25 could not be provisioned in the user-scoped toolchain. 1>&2
echo        The resolver, digest check, extraction or runtime probe failed. 1>&2
exit /b 1
:bootstrap_failed
echo ERROR: scripts\bootstrap.mjs could not install and verify every project dependency. 1>&2
echo        The bootstrap output above names the exact failed component, version and source. 1>&2
exit /b 1
