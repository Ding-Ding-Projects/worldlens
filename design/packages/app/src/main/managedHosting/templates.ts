/** Templates contain no account, password verifier, device challenge or TLS private material. */
export const composeTemplate = `services:
  map:
    image: \${WORLDLENS_MAP_IMAGE:?Set the reviewed immutable image reference}
    ports:
      - "\${WORLDLENS_HOST_PORT:-8443}:8443"
    environment:
      WORLDLENS_HOST_DATA: /data
      WORLDLENS_HOST_MAP: /app/map
      WORLDLENS_HOST_ORIGIN: \${WORLDLENS_HOST_ORIGIN:?Set the exact HTTPS origin}
      WORLDLENS_HOST_PORT: "8443"
      WORLDLENS_HOST_TLS_KEY: /data/tls.key
      WORLDLENS_HOST_TLS_CERT: /data/tls.crt
    volumes:
      - type: bind
        source: \${WORLDLENS_HOST_DATA:?Choose existing private host storage}
        target: /data
    read_only: true
    tmpfs: [/tmp]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    restart: unless-stopped
    healthcheck:
      test: [CMD, node, /app/health.mjs]
      interval: 10s
      timeout: 5s
      retries: 6
`;
export const healthScript = `import https from 'node:https';
import http from 'node:http';
const origin = process.env.WORLDLENS_HOST_ORIGIN;
if (!origin) process.exit(2);
const url = new URL('/health', origin);
const request = (url.protocol === 'https:' ? https : http).get(url, response => {
 let text=''; response.on('data', chunk => { text+=chunk; if(text.length>4096)request.destroy(); });
 response.on('end',()=>{try{const value=JSON.parse(text);process.exit(response.statusCode===200&&value.ready===true&&value.authentication==='required'?0:1);}catch{process.exit(1);}});
});
request.setTimeout(5000,()=>request.destroy()); request.on('error',()=>process.exit(1));
`;
export const nativeStart = `@echo off
setlocal
cd /d "%~dp0"
if not defined WORLDLENS_HOST_DATA (echo Set WORLDLENS_HOST_DATA to existing private host storage. & exit /b 2)
if not defined WORLDLENS_HOST_ORIGIN (echo Set WORLDLENS_HOST_ORIGIN to the exact HTTPS URL. & exit /b 2)
if not exist "%~dp0runtime\\node.exe" (echo The verified Windows Node runtime was not bundled. Export again with the supported runtime. & exit /b 2)
set "WORLDLENS_HOST_MAP=%~dp0map"
"%~dp0runtime\\node.exe" "%~dp0managed-host.mjs" %*
exit /b %errorlevel%
`;
export const nativeHealth = `@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0runtime\\node.exe" exit /b 2
"%~dp0runtime\\node.exe" "%~dp0health.mjs"
exit /b %errorlevel%
`;
export const wslStart = `#!/bin/sh
set -eu
cd "$(dirname "$0")"
: "\${WORLDLENS_HOST_DATA:?Set private host storage in the Linux filesystem}"
: "\${WORLDLENS_HOST_ORIGIN:?Set the exact HTTPS origin}"
export WORLDLENS_HOST_MAP="$PWD/map"
if [ ! -x ./runtime/node ]; then echo 'The verified Linux Node runtime was not bundled. Export again with the supported runtime.' >&2; exit 2; fi
exec ./runtime/node ./managed-host.mjs "$@"
`;
export const wslHealth = `#!/bin/sh
set -eu
cd "$(dirname "$0")"
test -x ./runtime/node || { echo 'Verified Linux Node runtime is unavailable.' >&2; exit 2; }
exec ./runtime/node ./health.mjs
`;
export const hostBatch = `@echo off
setlocal
cd /d "%~dp0"
docker version >nul 2>nul || (echo Docker is unavailable. & exit /b 2)
docker compose version >nul 2>nul || (echo Docker Compose is unavailable. & exit /b 2)
if not defined WORLDLENS_MAP_IMAGE (echo Set WORLDLENS_MAP_IMAGE to a reviewed immutable registry digest. & exit /b 2)
if not defined WORLDLENS_HOST_DATA (echo Set WORLDLENS_HOST_DATA to existing private storage. & exit /b 2)
if not defined WORLDLENS_HOST_ORIGIN (echo Set WORLDLENS_HOST_ORIGIN to the intended HTTPS LAN URL. & exit /b 2)
set "MODE=%~1"
if "%MODE%"=="" (
  choice /c DL /m "Detached or Logs"
  if errorlevel 2 (set "MODE=--logs") else (set "MODE=--detached")
)
if not "%MODE%"=="--logs" if not "%MODE%"=="--detached" exit /b 2
docker compose pull || exit /b 1
docker compose up -d --wait --wait-timeout 90 || exit /b 1
echo Containers passed their configured health check. Verify the intended LAN URL separately:
echo %WORLDLENS_HOST_ORIGIN%
if "%MODE%"=="--detached" exit /b 0
:menu
docker compose ps
choice /c FSE /m "Follow logs, Status, Exit (containers keep running)"
if errorlevel 3 exit /b 0
if errorlevel 2 goto menu
docker compose logs --follow --tail 100 map
goto menu
`;
