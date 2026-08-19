@echo off
REM Launch Worldlens for the driver. Invoked by Lowlevel MCP `launch_on_headless_desktop`,
REM so the window lands on an off-screen Win32 desktop and the visible desktop is untouched.
REM
REM   launch-headless.cmd [port] [profile-dir] [repo-root]
REM
REM This file exists because WORLDLENS_SCREENSHOTS can only be set as an ENVIRONMENT
REM variable (design/packages/app/src/main/index.ts:172) and `launch_on_headless_desktop`
REM takes only a command line. Chaining `cmd /c set VAR=1 && electron.exe ...` inline does
REM NOT work through that tool - the process starts with the variable unset, --user-data-dir
REM is then ignored, and the app silently opens the user's REAL profile. Verified twice.
setlocal
set "PORT=%~1"
if "%PORT%"=="" set "PORT=9333"
set "PROFILE=%~2"
if "%PROFILE%"=="" set "PROFILE=%TEMP%\worldlens-driver-profile"

REM Where the checkout is. %~dp0..\..\.. is correct only for the in-repo copy of
REM this skill; the catalog copy is installed under %USERPROFILE%\.claude\skills. Pass
REM the repo as argument 3, or set WORLDLENS_REPO, when running the installed copy.
set "REPO=%~3"
if "%REPO%"=="" set "REPO=%WORLDLENS_REPO%"
if "%REPO%"=="" set "REPO=%~dp0..\..\.."
set "APP=%REPO%\design\packages\app"
set "PACKAGED=%APP%\release\win-unpacked\Worldlens.exe"
set "ASAR=%APP%\release\win-unpacked\resources\app.asar"
if not exist "%PACKAGED%" (
  echo [launch-headless] no packaged Worldlens executable under "%APP%\release\win-unpacked".
  echo [launch-headless] Build the unsigned packaged app before launching this driver.
  exit /b 1
)
if not exist "%ASAR%" (
  echo [launch-headless] packaged app.asar is missing from "%APP%\release\win-unpacked\resources".
  echo [launch-headless] Refusing to launch a source or partial build.
  exit /b 1
)

REM The seam that makes the app honour --user-data-dir. Without it, production identity
REM wins and this run would write to the user's own settings.
set "WORLDLENS_SCREENSHOTS=1"
set "WORLDLENS_SCREENSHOT_HOME=C:\Worldlens-Capture"
set "WORLDLENS_SCREENSHOT_STORAGE=C:\Worldlens-Capture\maps"
set "WORLDLENS_PACKAGED_EXE=%PACKAGED%"
set "WORLDLENS_PACKAGED_ASAR=%ASAR%"

"%PACKAGED%" ^
  --no-sandbox --disable-gpu --force-prefers-reduced-motion ^
  --remote-debugging-port=%PORT% "--user-data-dir=%PROFILE%"
