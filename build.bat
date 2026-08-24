@echo off
setlocal DisableDelayedExpansion
rem ===========================================================================
rem  Worldlens - one-command build and run
rem
rem  Copy and paste this on a fresh Windows checkout:
rem
rem      .\build.bat --run
rem
rem  The command installs the pinned user-scoped toolchain and project
rem  dependencies, refreshes this process PATH, builds the real workspace
rem  outputs, verifies those outputs and launches only after every proof passes.
rem
rem  Usage:
rem    build.bat --run       bootstrap, build, verify, then launch without a prompt
rem    build.bat /run        same as --run
rem    build.bat             bootstrap and build, then ask whether to launch
rem    build.bat /s          bootstrap and build without a prompt or launch
rem    build.bat --silent    same as /s
rem    set RUN_AFTER_BUILD=1 && build.bat   launch after successful verification
rem
rem  --run cannot be combined with /s, --silent or SILENT=1. This fails before
rem  any acquisition so an automation invocation never launches unexpectedly.
rem ===========================================================================

set "ROOT=%~dp0"
set "DESIGN=%ROOT%design"
set "APPDIR=%DESIGN%\packages\app"
set "TOOLCHAIN=%LOCALAPPDATA%\worldlens-toolchain"
set "NPM_CONFIG_REGISTRY=https://registry.npmjs.org/"
set "SILENT_MODE=0"
set "RUN_MODE=0"
set "STARTED=%TIME%"

:parse_arguments
if "%~1"=="" goto :arguments_ready
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
if "%~1"=="/?" goto :usage
if /i "%~1"=="--run" (
    set "RUN_MODE=1"
    shift /1
    goto :parse_arguments
)
if /i "%~1"=="/run" (
    set "RUN_MODE=1"
    shift /1
    goto :parse_arguments
)
if /i "%~1"=="/s" (
    set "SILENT_MODE=1"
    shift /1
    goto :parse_arguments
)
if /i "%~1"=="-s" (
    set "SILENT_MODE=1"
    shift /1
    goto :parse_arguments
)
if /i "%~1"=="--silent" (
    set "SILENT_MODE=1"
    shift /1
    goto :parse_arguments
)
if /i "%~1"=="/silent" (
    set "SILENT_MODE=1"
    shift /1
    goto :parse_arguments
)
goto :bad_argument

:arguments_ready
call :validate_silent
if errorlevel 1 (
    echo ERROR: SILENT must be unset, 0 or 1. 1>&2
    exit /b 2
)
if defined SILENT if not "%SILENT%"=="0" set "SILENT_MODE=1"
if defined RUN_AFTER_BUILD if /i not "%RUN_AFTER_BUILD%"=="0" if /i not "%RUN_AFTER_BUILD%"=="1" goto :invalid_run_env
if defined RUN_AFTER_BUILD if /i "%RUN_AFTER_BUILD%"=="1" set "RUN_MODE=1"
if "%RUN_MODE%"=="1" if "%SILENT_MODE%"=="1" goto :run_silent_conflict

echo == Worldlens build ==
echo    repository: %ROOT%
if "%RUN_MODE%"=="1" echo    mode: build, verify and run
if "%SILENT_MODE%"=="1" echo    mode: silent, never launch
echo.

rem The root fetcher is the only acquisition path. It installs Node, Git,
rem GitHub CLI, Java and the committed project bootstrap without manual setup.
echo [1/4] Install and verify all build dependencies
set "FETCH_ARGS="
if "%SILENT_MODE%"=="1" set "FETCH_ARGS=--silent"
call "%ROOT%download-dependencies.bat" %FETCH_ARGS%
if errorlevel 1 goto :dependency_failed
echo.

rem The fetcher refreshes PATH in this process because it is called, not spawned.
rem Keep these explicit rediscoveries as a second proof when the package manager
rem changed a future-user PATH rather than this process's environment.
if exist "%LOCALAPPDATA%\worldlens-toolchain\node\node.exe" set "PATH=%LOCALAPPDATA%\worldlens-toolchain\node;%PATH%"
if exist "%LOCALAPPDATA%\worldlens-toolchain\git\cmd\git.exe" set "PATH=%LOCALAPPDATA%\worldlens-toolchain\git\cmd;%PATH%"
if exist "%LOCALAPPDATA%\worldlens-toolchain\gh\bin\gh.exe" set "PATH=%LOCALAPPDATA%\worldlens-toolchain\gh\bin;%PATH%"
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\gh.exe" set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
if exist "%LOCALAPPDATA%\worldlens-toolchain\java\temurin-25\bin\java.exe" set "JAVA_HOME=%LOCALAPPDATA%\worldlens-toolchain\java\temurin-25"
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"

echo [2/4] Resolve the pinned pnpm command
set "PNPM_VERSION="
for /f "tokens=* usebackq" %%v in (`node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('design/package.json','utf8')).packageManager;if(!/^pnpm@[^\s]+$/.test(p))process.exit(1);process.stdout.write(p.slice(5))" 2^>nul`) do set "PNPM_VERSION=%%v"
if not defined PNPM_VERSION goto :no_pnpm
set "NPM_CLI="
for /f "tokens=* usebackq" %%p in (`node -e "const fs=require('node:fs'),path=require('node:path'),d=path.dirname(process.execPath);const p=[path.join(d,'node_modules','npm','bin','npm-cli.js'),path.join(d,'..','lib','node_modules','npm','bin','npm-cli.js'),path.join(d,'..','share','node_modules','npm','bin','npm-cli.js')].find(fs.existsSync);if(p)process.stdout.write(p)" 2^>nul`) do set "NPM_CLI=%%p"
if not defined NPM_CLI goto :no_pnpm
set "PNPM_ACTUAL="
for /f "tokens=* usebackq" %%v in (`node "%NPM_CLI%" exec --yes --registry=https://registry.npmjs.org/ --package=pnpm@%PNPM_VERSION% -- pnpm --version 2^>nul`) do if "%%v"=="%PNPM_VERSION%" set "PNPM_ACTUAL=%%v"
if not defined PNPM_ACTUAL goto :no_pnpm
echo       pnpm %PNPM_ACTUAL% is runnable through the pinned npm CLI
echo.

echo [3/4] Build the real workspace outputs
set "RECEIPT_FILE=%TEMP%\worldlens-build-receipt-%RANDOM%-%RANDOM%.json"
node "%ROOT%scripts\build-receipt.mjs" prepare --repo "%ROOT%." --receipt "%RECEIPT_FILE%"
if errorlevel 1 goto :receipt_prepare_failed
pushd "%DESIGN%" >nul || goto :no_design
node "%NPM_CLI%" exec --yes --registry=https://registry.npmjs.org/ --package=pnpm@%PNPM_VERSION% -- pnpm build
set "BUILD_RESULT=%ERRORLEVEL%"
popd >nul
if not "%BUILD_RESULT%"=="0" goto :build_failed
node "%ROOT%scripts\build-receipt.mjs" finalize --repo "%ROOT%." --receipt "%RECEIPT_FILE%"
if errorlevel 1 goto :receipt_finalize_failed
node "%ROOT%scripts\build-receipt.mjs" verify --repo "%ROOT%." --receipt "%RECEIPT_FILE%"
if errorlevel 1 goto :receipt_verify_failed
echo.

rem Do not treat a successful bundler exit code as a runnable app. These are
rem the outputs the development app actually loads, so they are checked before
rem any --run path can launch it.
echo [4/4] Verify the built app and Electron runtime
pushd "%APPDIR%" >nul || goto :no_app
node -e "const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'); const required=[path.resolve('dist/main/index.js'),path.resolve('dist/preload/index.cjs'),path.resolve('dist/render-engines/manifest.json'),path.resolve('..','ui','dist','index.html')]; for(const file of required){const s=fs.statSync(file);if(!s.isFile()||s.size<128)throw new Error('required build artifact is missing or too small: '+file)} const exe=require('electron'); const s=fs.statSync(exe);if(!s.isFile()||s.size<1000000)throw new Error('Electron executable is missing or incomplete');const r=spawnSync(exe,['--version'],{encoding:'utf8'});if(r.status!==0)throw new Error('Electron executable returned '+r.status+': '+String(r.stderr||r.stdout||'').trim());process.stdout.write('      verified main, preload, engine manifest, UI and '+String(r.stdout||r.stderr||'').trim()+'\n');"
set "ARTIFACT_RESULT=%ERRORLEVEL%"
popd >nul
if not "%ARTIFACT_RESULT%"=="0" goto :artifact_failed

echo.
echo == Built and verified successfully ==
echo    started  %STARTED%
echo    finished %TIME%

if "%RUN_MODE%"=="1" goto :launch
if "%SILENT_MODE%"=="1" exit /b 0
echo.
choice /c YN /n /m "Run Worldlens now? [Y/N] "
if errorlevel 2 goto :done

:launch
echo Starting Worldlens after verified build artifacts...
pushd "%DESIGN%" >nul
node "%NPM_CLI%" exec --yes --registry=https://registry.npmjs.org/ --package=pnpm@%PNPM_VERSION% -- pnpm --filter @worldlens/app start
set "START_RESULT=%ERRORLEVEL%"
popd >nul
exit /b %START_RESULT%

:done
echo Not starting. Nothing else to do.
exit /b 0

:usage
echo Usage: .\build.bat --run
echo        .\build.bat /run
echo        .\build.bat [/s^|--silent]
echo        set RUN_AFTER_BUILD=1 ^&^& .\build.bat
echo.
echo Installs pinned user-scoped dependencies, builds and verifies the app, then launches
echo only for --run, /run or RUN_AFTER_BUILD=1. Silent mode never launches.
exit /b 0

:bad_argument
echo ERROR: unknown argument "%~1". Use .\build.bat --run, /run, /s or --silent. 1>&2
exit /b 2
:invalid_run_env
echo ERROR: RUN_AFTER_BUILD must be 0 or 1. 1>&2
exit /b 2
:run_silent_conflict
echo ERROR: --run and silent mode cannot be combined. Remove /s, --silent or SILENT=1. 1>&2
exit /b 2
:dependency_failed
echo ERROR: dependency acquisition failed. The fetcher output names the exact version, source or probe that failed. 1>&2
exit /b 1
:no_pnpm
echo ERROR: pnpm@%PNPM_VERSION% is not runnable through the active Node/npm runtime. 1>&2
echo        The pinned npm CLI route failed, so the build is stopping rather than guessing. 1>&2
exit /b 1
:no_design
echo ERROR: design workspace not found at %DESIGN%. 1>&2
exit /b 1
:no_app
echo ERROR: app package not found at %APPDIR%. 1>&2
exit /b 1
:build_failed
echo ERROR: the pinned pnpm workspace build failed. The command output above names the failed package. 1>&2
exit /b 1
:artifact_failed
echo ERROR: build output or Electron was not runnable. Launch was refused until artifacts were verified. 1>&2
exit /b 1
:receipt_prepare_failed
echo ERROR: stale build outputs could not be quarantined and a source receipt could not be written. 1>&2
exit /b 1
:receipt_finalize_failed
echo ERROR: the build receipt could not record fresh output hashes, sizes and Electron provenance. 1>&2
exit /b 1
:receipt_verify_failed
echo ERROR: the build receipt did not match the current source or exact fresh outputs. Launch was refused. 1>&2
exit /b 1
:validate_silent
if not defined SILENT exit /b 0
if "%SILENT%"=="0" exit /b 0
if "%SILENT%"=="1" exit /b 0
exit /b 1
