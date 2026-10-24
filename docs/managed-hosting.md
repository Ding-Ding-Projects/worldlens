# Hosting a verified map with authentication

Take one render that has passed its provenance check and turn it into a map other people can open
behind a sign-in: as a container image you build, save or upload, or as a native host you run on
this computer or inside a selected WSL distribution.

## Behaviour

Hosting always starts from a specific render. The hosting panel on the Preview screen asks the
main process to **export** a hosting context for a render identity, and the main process refuses
unless that render's workspace carries a completed, provenance-verified output manifest. Renderer
input never supplies the proof: the source commit, the runtime bundle hash and the container base
image are read from the build itself.

An exported context holds the map, a copy of the managed host runtime bundle (`managed-host.mjs`
from this build), a health script and a generated Dockerfile. Its receipt records the render
fingerprint, the runtime hash and a context fingerprint over every exported file. Every later
operation re-reads that context and re-checks it against the receipt before doing anything with it.

From a verified context the panel offers:

- **Build image** with a local tag, through the local Docker daemon.
- **Save image archive** to a path, with its byte size and SHA-256 reported back.
- **Sign in** to Docker Hub with the device flow. Only the one-time user code and the fixed
  activation address cross to the panel; CLI output is never shown or logged.
- **Upload image** to a reviewed Docker Hub destination after an explicit confirmation.
- **Deploy** to a container, a native Windows host or a native WSL host on a chosen port.

Access comes first. **Prepare access** collects an administrator name and password in protected
controls and stores only a salted memory-hard verifier plus an opaque credential reference in the
app's data folder. Projects, exports, images and logs never carry the verifier, the password or a
session value. Three states stay separate on purpose: prepared on this device, provisioned on the
destination, and sign-in verified against the running host.

## Configuration

| Input | Where it comes from |
| --- | --- |
| Source commit | The build's recorded 40-character commit. A development build without one cannot export, and says so. |
| Runtime bundle | `dist/managed-host.mjs`, hashed when first needed. |
| Container base image | `node:22-slim` pinned to the manifest-list digest read from Docker Hub on 2026-10-23 (`REVIEWED_CONTAINER_BASE_IMAGE` in `managedHosting/wiring.ts`). Changing it is a review decision. |
| Native runtimes | Staged Node binaries for Windows or Linux. A target reports unavailable whenever its matching verified runtime is absent. |
| Hosting profile | Saved locally under `managed-hosting/profiles` in application data. Named profiles store target, exact HTTPS origin, host port, existing private data folder, local TLS certificate/key paths and selected WSL distribution. No account verifier or certificate bytes enter the profile. |

Access verifiers live under `managed-hosting/access` in the app data folder, encrypted with the
operating-system safe storage. Exported contexts are staged under `managed-hosting/contexts`.

## Failure modes

- A render that is still running, interrupted or unverified cannot be exported; the message says a
  completed provenance-verified render is required.
- A context that was not exported through this workflow, or whose files no longer match their
  receipt, is refused by build, save, upload and deploy alike.
- Registry sign-in requires a native Docker credential store; without one it stops before any
  prompt. A sign-in that is not confirmed within ten minutes expires and must be started again.
- Upload is limited to Docker Hub and needs the confirmed destination; any other registry is refused.
- Deployment requires a saved profile matching the selected target and port. Readiness rejects invalid or expired certificates, hostname mismatch, unusable TLS pairs and data folders overlapping context or TLS paths.
- WSL resolves local context and TLS paths inside the selected distribution and verifies that the Linux data directory exists. A missing distribution or path remains unavailable.

## Security considerations

Account preparation is consumed over standard input only, never as a process argument. Container
deployment runs read-only with all capabilities dropped and
`no-new-privileges`. Health and reachability checks are separate from account verification, and a
reachable host is never reported as authenticated. Every hosting request must come from the
application's own main frame.

## Profile workflow

In **Deploy and verify**, create or select a named profile. Choose a target, enter its exact HTTPS
origin with the same port as **Host port**, select existing private storage and TLS files, then
save. For WSL, enter an installed distribution and an existing absolute Linux data directory;
TLS files remain selected through the local file picker and are mapped into that distribution.
**Check readiness** validates the saved configuration against the current verified context.
Editing a field or changing the context invalidates readiness. Deployment rechecks the saved
profile before provisioning. Removing a profile removes only preferences, never data or a host.

Readiness does not install trust, confirm client trust or claim LAN access. A deployment must still
return its own health and reachability verdict. Profiles restore after restart; process handles,
verified exported contexts and deployment observations remain session-owned and are not adopted
from stale saved identifiers. Safe restart reattachment and in-flight deployment cancellation remain
unfinished acceptance items. Device sign-in can be cancelled without exposing CLI output.
**Stop this host** acts only on the current session's owned native Windows process or exact
container, then observes exit. WSL stop remains unavailable because stopping a Windows wrapper
does not prove that the Linux host stopped. Do not launch another host merely because an old observation is absent.

## Verification

Focused checks cover registrar authorization and context identity, profile persistence and rejection, and GUI readiness invalidation including a late response after context change. Package-wide type checking remains incomplete in this continuation because generated workspace declarations are absent. Not verified here: a real Docker build, save or upload, registry sign-in
against Docker Hub, any deployment, LAN reachability, and the packaged Windows application. Those
remain open until a Windows host with Docker runs the packaged build.

## Sources and suggested articles

- `design/packages/app/src/main/managedHosting/register.ts`
- `design/packages/app/src/main/managedHosting/exportContext.ts`
- `design/packages/app/src/main/managedHosting/wiring.ts`
- `design/packages/ui/src/components/preview/ManagedHostingPanel.vue`
- [Hosted mode](./hosted-mode.md), [The container image](./container-image.md), [Render identity](./render-identity.md)
