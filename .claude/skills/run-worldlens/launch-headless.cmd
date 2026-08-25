@echo off
REM Launch Worldlens for the driver. Invoked by Lowlevel MCP `launch_on_headless_desktop`,
REM so the window lands on an off-screen Win32 desktop and the visible desktop is untouched.
REM
REM   launch-headless.cmd [port] [profile-dir] [repo-root] [log-file]
REM
REM The optional fourth argument captures the application's own stdout and stderr. Without it
REM they go nowhere, which matters more than it sounds: the app destroys its own window on an
REM uncaught exception or a dead renderer (see enterTerminalRecovery in src/main/index.ts), and
REM a harness attached over the debugging protocol sees only "target closed" with no reason.
REM A whole day was spent guessing at that with the evidence sitting unread on a discarded
REM stream. Optional rather than always-on so existing callers are unaffected.
REM
REM The packaged app accepts --worldlens-direct-launch as an explicit smoke-only switch.
REM It requires --user-data-dir and refuses the production application-data directory, so
REM launch_on_headless_desktop can pass the owned profile directly without an environment
REM wrapper.
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

set "WORLDLENS_SCREENSHOT_HOME=C:\Worldlens-Capture"
set "WORLDLENS_SCREENSHOT_STORAGE=C:\Worldlens-Capture\maps"
set "WORLDLENS_PACKAGED_EXE=%PACKAGED%"
set "WORLDLENS_PACKAGED_ASAR=%ASAR%"

set "LOG=%~4"
if "%LOG%"=="" goto :run_plain

"%PACKAGED%" ^
  --no-sandbox --disable-gpu --force-prefers-reduced-motion ^
  --remote-debugging-port=%PORT% "--worldlens-direct-launch" "--user-data-dir=%PROFILE%" ^
  > "%LOG%" 2>&1
exit /b %ERRORLEVEL%

:run_plain
"%PACKAGED%" ^
  --no-sandbox --disable-gpu --force-prefers-reduced-motion ^
  --remote-debugging-port=%PORT% "--worldlens-direct-launch" "--user-data-dir=%PROFILE%"
