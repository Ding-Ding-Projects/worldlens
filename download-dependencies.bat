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
call :validate_silent
if errorlevel 1 (
    echo ERROR: SILENT must be unset, 0 or 1. 1>&2
    exit /b 2
)
if defined SILENT if not "%SILENT%"=="0" set "FETCH_SILENT=1"
if not "%~1"=="" if not "%~1"=="/s" if not "%~1"=="-s" if not "%~1"=="--silent" if not "%~1"=="/silent" goto :bad_argument
if not "%~2"=="" goto :bad_argument

set "ROOT=%~dp0"
set "TOOLCHAIN=%LOCALAPPDATA%\worldlens-toolchain"
set "PORTABLE_NODE=%TOOLCHAIN%\node"
set "PORTABLE_GIT=%TOOLCHAIN%\git"
set "PORTABLE_GH=%TOOLCHAIN%\gh"
set "NPM_CONFIG_REGISTRY=https://registry.npmjs.org/"
if not exist "%ROOT%scripts\toolchain-manifest.json" goto :manifest_failed

rem Test-only probe. It deliberately performs no network, extraction, PATH edit,
rem or project install. This lets the committed contract test exercise both a
rem cold user profile and a warm portable-toolchain profile safely.
if /i "%WORLDLENS_FETCH_DRY_RUN%"=="1" goto :dry_run
if /i "%WORLDLENS_FETCH_ROUTE_DRY_RUN%"=="1" goto :route_fixture

echo == Worldlens dependency fetch ==
echo    repository: %ROOT%
if "%FETCH_SILENT%"=="1" echo    mode: silent
echo.

rem --- Node ------------------------------------------------------------------
if "%WORLDLENS_REQUIRE_PACKAGE_DIGEST%"=="1" goto :node_portable
if exist "%PORTABLE_NODE%\node.exe" set "PATH=%PORTABLE_NODE%;%PATH%"
echo [1/5] Node 22 or newer
call :probe_node
if "%NODE_OK%"=="1" goto :node_ready
echo       no usable Node found - trying the exact user-scoped Windows package
where winget >nul 2>&1
if errorlevel 1 goto :node_portable
call winget install --id OpenJS.NodeJS.LTS --version 24.19.0 --exact --source winget --scope user --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
set "ACQUIRED_NODE="
if exist "%ProgramFiles%\nodejs\node.exe" set "ACQUIRED_NODE=%ProgramFiles%\nodejs"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "ACQUIRED_NODE=%LOCALAPPDATA%\Programs\nodejs"
if defined ACQUIRED_NODE set "PATH=%ACQUIRED_NODE%;%PATH%"
call :probe_node
if "%NODE_OK%"=="1" goto :node_ready

:node_portable
echo       package route unavailable - trying the official hash-verified portable Node archive
if not exist "%TOOLCHAIN%" mkdir "%TOOLCHAIN%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\acquire-portable-tool.ps1" -Tool node
if exist "%PORTABLE_NODE%\node.exe" set "PATH=%PORTABLE_NODE%;%PATH%"
call :probe_node
if not "%NODE_OK%"=="1" goto :no_node
:node_ready
node "%ROOT%scripts\toolchain-probe.mjs" manifest >nul 2>&1
if errorlevel 1 goto :manifest_failed
set "PNPM_CLI_FILE=%TEMP%\worldlens-pnpm-cli-%RANDOM%-%RANDOM%.txt"
node "%ROOT%scripts\ensure-pnpm.mjs" > "%PNPM_CLI_FILE%"
if errorlevel 1 goto :pnpm_failed
set "WORLDLENS_PNPM_CLI="
set /p "WORLDLENS_PNPM_CLI=" < "%PNPM_CLI_FILE%"
del /q "%PNPM_CLI_FILE%" >nul 2>&1
if not defined WORLDLENS_PNPM_CLI goto :pnpm_failed
echo       using %NODE_VERSION%
echo.

rem --- Git -------------------------------------------------------------------
if "%WORLDLENS_REQUIRE_PACKAGE_DIGEST%"=="1" goto :git_portable
if exist "%PORTABLE_GIT%\cmd\git.exe" set "PATH=%PORTABLE_GIT%\cmd;%PATH%"
echo [2/5] Git
call :probe_git
if "%GIT_OK%"=="1" goto :git_ready
echo       no usable Git found - trying the exact user-scoped Windows package
where winget >nul 2>&1
if errorlevel 1 goto :git_portable
call winget install --id Git.Git --version 2.55.0.3 --exact --source winget --scope user --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
set "ACQUIRED_GIT="
if exist "%ProgramFiles%\Git\cmd\git.exe" set "ACQUIRED_GIT=%ProgramFiles%\Git\cmd"
if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" set "ACQUIRED_GIT=%LOCALAPPDATA%\Programs\Git\cmd"
if defined ACQUIRED_GIT set "PATH=%ACQUIRED_GIT%;%PATH%"
call :probe_git
if "%GIT_OK%"=="1" goto :git_ready
:git_portable
echo       package route unavailable - trying the hash-verified MinGit archive
if not exist "%TOOLCHAIN%" mkdir "%TOOLCHAIN%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\acquire-portable-tool.ps1" -Tool git
if exist "%PORTABLE_GIT%\cmd\git.exe" set "PATH=%PORTABLE_GIT%\cmd;%PATH%"
call :probe_git
if not "%GIT_OK%"=="1" goto :no_git
:git_ready
echo       using %GIT_VERSION%
echo.

rem --- GitHub CLI ------------------------------------------------------------
if "%WORLDLENS_REQUIRE_PACKAGE_DIGEST%"=="1" goto :gh_portable
if exist "%PORTABLE_GH%\bin\gh.exe" set "PATH=%PORTABLE_GH%\bin;%PATH%"
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\gh.exe" set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
echo [3/5] GitHub CLI
call :probe_gh
if "%GH_OK%"=="1" goto :gh_ready
echo       no usable GitHub CLI found - trying the exact user-scoped Windows package
where winget >nul 2>&1
if errorlevel 1 goto :gh_portable
call winget install --id GitHub.cli --version 2.98.0 --exact --source winget --scope user --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
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
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\acquire-portable-tool.ps1" -Tool gh
if exist "%PORTABLE_GH%\bin\gh.exe" set "PATH=%PORTABLE_GH%\bin;%PATH%"
call :probe_gh
if not "%GH_OK%"=="1" goto :no_gh
:gh_ready
echo       using %GH_VERSION%
echo.

rem --- Submodule initialization and verification ---------------------------
echo [4/6] Initialize and verify every gitlink
pushd "%ROOT%." >nul || goto :no_root
node "%ROOT%scripts\verify-submodules.mjs" --init --repo "%ROOT%."
set "SUBMODULE_RESULT=%ERRORLEVEL%"
popd >nul
if not "%SUBMODULE_RESULT%"=="0" goto :submodule_failed
echo.

rem --- Java and project dependency bootstrap -------------------------------
echo [5/6] Eclipse Temurin 25 build runtime
set "BUILD_JAVA_HOME=%LOCALAPPDATA%\worldlens-toolchain\java\temurin-25"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\ensure-build-java.ps1"
if errorlevel 1 goto :java_failed
set "JAVA_HOME=%BUILD_JAVA_HOME%"
set "PATH=%JAVA_HOME%\bin;%PATH%"
java -version >nul 2>&1
if errorlevel 1 goto :java_failed
echo       using %JAVA_HOME%
echo.

echo [6/6] Committed dependency bootstrap with frozen lockfile
pushd "%ROOT%." >nul || goto :no_root
node scripts\bootstrap.mjs
set "BOOTSTRAP_RESULT=%ERRORLEVEL%"
popd >nul
if not "%BOOTSTRAP_RESULT%"=="0" goto :bootstrap_failed
if defined WORLDLENS_DEPS_HANDOFF_FILE (
    node "%ROOT%scripts\deps-handoff.mjs" write --file "%WORLDLENS_DEPS_HANDOFF_FILE%" --repo "%ROOT%." --pnpm-cli "%WORLDLENS_PNPM_CLI%"
    if errorlevel 1 goto :handoff_failed
)
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
node --version >nul 2>&1
if errorlevel 1 exit /b 0
for /f "tokens=* usebackq" %%v in (`node --version 2^>nul`) do set "NODE_VERSION=%%v"
if not defined NODE_VERSION exit /b 0
node "%ROOT%scripts\toolchain-probe.mjs" node >nul 2>&1
if errorlevel 1 exit /b 0
set "NODE_OK=1"
exit /b 0

:probe_git
set "GIT_OK=0"
set "GIT_VERSION="
where git >nul 2>&1
if errorlevel 1 exit /b 0
for /f "tokens=* usebackq" %%v in (`git --version 2^>nul`) do set "GIT_VERSION=%%v"
if not defined GIT_VERSION exit /b 0
node "%ROOT%scripts\toolchain-probe.mjs" git >nul 2>&1
if errorlevel 1 exit /b 0
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
node "%ROOT%scripts\toolchain-probe.mjs" gh >nul 2>&1
if errorlevel 1 exit /b 0
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
:route_fixture
if not defined WORLDLENS_FETCH_ROUTE_LOG goto :bad_argument
call :fixture_route node
call :fixture_route git
call :fixture_route gh
exit /b 0
:fixture_route
where %1 >nul 2>&1
if errorlevel 1 >>"%WORLDLENS_FETCH_ROUTE_LOG%" echo missing-path-%1
if not errorlevel 1 >>"%WORLDLENS_FETCH_ROUTE_LOG%" echo detected-path-%1
if "%WORLDLENS_REQUIRE_PACKAGE_DIGEST%"=="1" >>"%WORLDLENS_FETCH_ROUTE_LOG%" echo selected-portable-%1
if not "%WORLDLENS_REQUIRE_PACKAGE_DIGEST%"=="1" >>"%WORLDLENS_FETCH_ROUTE_LOG%" echo selected-path-%1
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
:manifest_failed
echo ERROR: scripts\toolchain-manifest.json is missing, so exact acquisition cannot proceed. 1>&2
exit /b 1
:pnpm_failed
if exist "%PNPM_CLI_FILE%" del /q "%PNPM_CLI_FILE%" >nul 2>&1
echo ERROR: the committed pnpm tarball integrity or CLI installation could not be verified. 1>&2
exit /b 1
:handoff_failed
echo ERROR: the scoped dependency handoff could not be written. 1>&2
exit /b 1
:submodule_failed
echo ERROR: every gitlink must initialize and verify at its recorded commit before bootstrap. 1>&2
exit /b 1
:java_failed
echo ERROR: Eclipse Temurin 25 could not be provisioned in the user-scoped toolchain. 1>&2
echo        The resolver, digest check, extraction or runtime probe failed. 1>&2
exit /b 1
:bootstrap_failed
echo ERROR: scripts\bootstrap.mjs could not install and verify every project dependency. 1>&2
echo        The bootstrap output above names the exact failed component, version and source. 1>&2
exit /b 1
:validate_silent
if not defined SILENT exit /b 0
if "%SILENT%"=="0" exit /b 0
if "%SILENT%"=="1" exit /b 0
exit /b 1
