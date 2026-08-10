@echo off
setlocal EnableDelayedExpansion
rem ===========================================================================
rem  Worldlens - build the installer
rem
rem  build.bat gets you a program you can run out of the checkout. This produces
rem  the artifact a person downloads and installs, through the same supported
rem  packaging path CI uses, so a locally built installer and a released one are
rem  the same thing rather than two things that resemble each other.
rem
rem  Usage:
rem    build-installer.bat        build the installer, then report it
rem    build-installer.bat /s     silent: no prompt, no pause
rem
rem  Agents ship every manual release through this script rather than around it.
rem  That is not tidiness: a script only ever run on a warm developer machine is
rem  a script nobody has proven works, and the first time it is genuinely needed
rem  is the worst possible moment to discover that. Using it as the only path
rem  makes every hand-cut release an end-to-end test of what a new machine does.
rem  If it fails during a release, fix the script in a commit - do not work
rem  around it once and leave it broken for whoever comes next.
rem
rem  It does not publish, tag, push or create a release. Building an installer
rem  and shipping it are different actions with different authority.
rem
rem  The installer is permanently unsigned, by policy, and this says so rather
rem  than letting you find out from a SmartScreen warning.
rem ===========================================================================

set "SILENT_MODE=0"
if /i "%~1"=="/s" set "SILENT_MODE=1"
if /i "%~1"=="-s" set "SILENT_MODE=1"
if /i "%~1"=="--silent" set "SILENT_MODE=1"
if /i "%~1"=="/silent" set "SILENT_MODE=1"
if defined SILENT if not "%SILENT%"=="0" set "SILENT_MODE=1"

set "ROOT=%~dp0"
set "DESIGN=%ROOT%design"
set "APPDIR=%DESIGN%\packages\app"
set "STARTED=%TIME%"

echo == Worldlens installer build ==
echo    repository: %ROOT%
if "%SILENT_MODE%"=="1" echo    mode: silent

rem --- Everything build.bat does ---------------------------------------------
rem Delegated rather than duplicated. Two copies of the dependency logic is two
rem places for it to drift, and the installer path must not be the one that
rem quietly stops matching.
echo.
echo [1/4] Dependencies and workspace build
call "%ROOT%build.bat" /s
if errorlevel 1 (
    echo.
    echo ERROR: build.bat failed. The installer needs a built workspace. 1>&2
    exit /b 1
)

rem --- The commit this is built from ------------------------------------------
rem Recorded before packaging, so the report names the commit the artifact
rem actually came from rather than whatever HEAD is by the time it finishes.
for /f "tokens=* usebackq" %%s in (`git -C "%ROOT%." rev-parse HEAD 2^>nul`) do set "COMMIT=%%s"
if not defined COMMIT set "COMMIT=(not a git checkout)"
for /f "tokens=* usebackq" %%s in (`git -C "%ROOT%." status --porcelain 2^>nul`) do set "DIRTY=1"

echo.
echo [2/4] Source state
echo       commit %COMMIT%
if defined DIRTY (
    echo       working tree has uncommitted changes - this installer will not
    echo       match a release built from %COMMIT% alone
) else (
    echo       working tree clean
)

rem --- Version ----------------------------------------------------------------
rem A hand-built installer has to be *newer* than whatever is already installed, or it cannot
rem replace it.
rem
rem This is not hypothetical. CI stamps `0.1.<run number>` into package.json before packaging, so a
rem machine that installed a CI build is sitting on something like 0.1.855. This script used the raw
rem `0.1.0` the repository carries, Squirrel compared 0.1.0 against 0.1.855, concluded the installer
rem was older, and every hand-built installer silently failed to take - the application kept
rem launching the old build while its author kept wondering why the interface had not changed.
rem
rem So the patch number is one past the highest version this machine can see: the installed app
rem folders, and whatever the repository manifest says. Restored immediately after packaging, on
rem both the success and the failure path, so the checkout is never left carrying a version nobody
rem chose. That restore is a real step below; this comment previously claimed it while nothing
rem performed it.
echo.
echo [2b/4] Version
pushd "%APPDIR%"
call node -e "const fs=require('fs'),path=require('path'),os=require('os');const p='package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));fs.writeFileSync('.version-backup',j.version);const base=j.version.split('.').slice(0,2).join('.');let hi=Number(j.version.split('.')[2]||0);for(const dir of [path.join(process.env.LOCALAPPDATA||'','Worldlens')]){try{for(const n of fs.readdirSync(dir)){const m=/^app-\d+\.\d+\.(\d+)$/.exec(n);if(m)hi=Math.max(hi,Number(m[1]));}}catch{}}j.version=base+'.'+(hi+1);fs.writeFileSync(p,JSON.stringify(j,null,4)+'\n');console.log('      packaging as '+j.version+' (highest seen was '+hi+')');"
if errorlevel 1 (
    popd
    echo ERROR: could not stamp a version. 1>&2
    exit /b 1
)
popd

rem --- Package ---------------------------------------------------------------
rem `make`, which is the app package's own Squirrel.Windows path, with
rem `--publish never` already inside it. Signing is not requested and not
rem configured: Worldlens installers are permanently unsigned by policy.
echo.
echo [3/4] Packaging the Windows installer
pushd "%APPDIR%" || (echo ERROR: no app package at %APPDIR% 1>&2 & exit /b 1)
call pnpm run make
set "MAKE_RESULT=%ERRORLEVEL%"

rem --- Put the version back ---------------------------------------------------
rem The stamping step above said it restored this afterwards. It did not: it wrote
rem `.version-backup` and nothing ever read it, so every run of this script left the checkout
rem carrying a version nobody chose - one past whatever happened to be installed on that
rem machine. A screenshot sweep found `package.json` sitting at 0.1.858 hours after the build
rem that stamped it, which is the kind of change that gets committed by accident and then
rem reads as a deliberate release decision to whoever finds it.
rem
rem Restored here rather than at the end, and before the exit code is acted on, so a failed
rem packaging run leaves the tree exactly as clean as a successful one. A cleanup step that
rem only runs on the happy path is a cleanup step that will not run on the day it matters.
if exist ".version-backup" (
    call node -e "const fs=require('fs');const p='package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version=fs.readFileSync('.version-backup','utf8').trim();fs.writeFileSync(p,JSON.stringify(j,null,4)+'\n');fs.unlinkSync('.version-backup');console.log('      restored package.json to '+j.version);"
)

if not "%MAKE_RESULT%"=="0" (
    popd
    echo.
    echo ERROR: electron-builder failed. The output above names the step. 1>&2
    exit /b 1
)
popd

rem --- Verify what was actually built ----------------------------------------
rem A green packaging step is not evidence that an installer exists: the search
rem below is what turns "it exited 0" into "here is the file, this is its size,
rem this is its digest". A build that produced nothing fails here rather than
rem being reported as a success with nothing to show.
echo.
echo [4/4] Verifying the artifact
rem electron-builder writes Squirrel output to `release\squirrel-windows\`, not to
rem `dist\`. Searching only `dist` is exactly the trap this project has hit
rem before - a collector reports a missing setup right after packaging succeeded -
rem so both roots are searched, `release` first because that is where this
rem configuration actually puts it.
set "SETUP="
for /f "delims=" %%f in ('dir /b /s "%APPDIR%\release\*Setup*.exe" 2^>nul') do set "SETUP=%%f"
if not defined SETUP (
    for /f "delims=" %%f in ('dir /b /s "%APPDIR%\dist\*Setup*.exe" 2^>nul') do set "SETUP=%%f"
)
if not defined SETUP (
    echo.
    echo ERROR: packaging reported success but no installer was found under 1>&2
    echo        %APPDIR%\release or %APPDIR%\dist 1>&2
    echo        A green exit code is not an artifact. Nothing was produced. 1>&2
    exit /b 1
)

rem The rest of the Squirrel set, named so a manual release knows what to attach.
rem An update feed with a setup and no RELEASES is an installer that can never
rem update itself, which is a defect nobody notices until the second release.
if exist "%APPDIR%\release\squirrel-windows\RELEASES" (
    echo       RELEASES present
) else (
    echo       WARNING: no RELEASES file beside the installer - automatic updates
    echo       will not work for a release built from this run
)

for %%f in ("%SETUP%") do set "SETUP_SIZE=%%~zf"
set "SETUP_SHA="
for /f "skip=1 tokens=* usebackq" %%h in (`certutil -hashfile "%SETUP%" SHA256 2^>nul`) do (
    if not defined SETUP_SHA set "SETUP_SHA=%%h"
)

rem --- Collect into one predictable place ------------------------------------
rem electron-builder writes wherever its config says, which is three directories deep and
rem different per target. Everything shippable is copied to `installer\` at the repository root
rem so a person, a release script and another agent all look in the same place - and it is
rem gitignored, because a 157 MB setup in Git history is a repository nobody can clone.
echo.
echo Collecting into %ROOT%installer
if not exist "%ROOT%installer" mkdir "%ROOT%installer" >nul 2>&1
copy /y "%SETUP%" "%ROOT%installer\" >nul 2>&1
if exist "%APPDIR%\release\squirrel-windows\RELEASES" copy /y "%APPDIR%\release\squirrel-windows\RELEASES" "%ROOT%installer\" >nul 2>&1
for %%f in ("%APPDIR%\release\squirrel-windows\*.nupkg") do copy /y "%%f" "%ROOT%installer\" >nul 2>&1
for %%f in ("%SETUP%") do set "SETUP_NAME=%%~nxf"
if exist "%ROOT%installer\%SETUP_NAME%" set "SETUP=%ROOT%installer\%SETUP_NAME%"

echo.
echo == Installer built ==
echo    path    %SETUP%
echo    size    %SETUP_SIZE% bytes
echo    sha256  %SETUP_SHA%
echo    commit  %COMMIT%
echo    started %STARTED%
echo    finished %TIME%
echo.
echo    This installer is UNSIGNED, permanently and on purpose. Windows
echo    SmartScreen will say the publisher is unknown. Compare the SHA-256
echo    above against the one in the release notes before running it - the
echo    digest detects changed bytes, it does not authenticate who wrote them.
echo.
echo    Nothing has been published, tagged or pushed. Shipping this is a
echo    separate, deliberate action.

if "%SILENT_MODE%"=="1" exit /b 0

echo.
choice /c YN /n /m "Open the folder containing the installer? [Y/N] "
if errorlevel 2 exit /b 0
for %%f in ("%SETUP%") do start "" explorer "%%~dpf"
exit /b 0
