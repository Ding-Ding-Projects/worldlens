# Docker hosting instance manager

## Behaviour

Issue #69 requests a local Docker hosting manager for BlueMap server instances. This is a
different surface from rendering a map inside a container, importing a world from a container or
publishing an already-rendered map to a remote SSH host. The manager is expected to own and manage
only the application-created workloads.

The requested surface must discover the local Docker daemon and distinguish these states:

| State | Required meaning |
| --- | --- |
| `not-installed` | The Docker CLI is not available on the current account's `PATH`. |
| `daemon-unreachable` | The CLI exists, but the daemon socket or service does not answer. |
| `refused` | The daemon answers, but this account is not permitted to use it. |
| `unusable` | Docker returned an unrecognised or unusable response. |
| `ready` | The daemon response is usable for the requested operation. |

When ready, the manager must list and inspect application-owned containers and images, ports,
volumes, maps, configuration, health, logs and update state. Create, start, stop, restart, update
and remove actions must be plan-first operations with explicit conflict and disabled-reason copy.
Removal is destructive: it must use the app's native two-key/full-slider confirmation and refuse to
touch workloads that are not recorded as application-owned.

The manager also needs guided image, port, path, volume and resource pickers; persistent targets,
settings and history; restart reattachment; complete log retention; bulk actions and export; and a
direct action to open generated files or folders in Visual Studio Code. Its navigation must be
tabbed, searchable and backed by the project's anchored full regex builder, with the normal
localization, funny-level, accessibility, responsive-layout and per-element appearance contracts.

## Configuration and ownership boundary

The ownership record must be created before a container mutation and must include a stable
application-owned identifier, the image reference, intended mounts and ports, and the configuration
revision used to create it. Discovery may inspect Docker's inventory, but it must not infer that an
unrecorded container belongs to this application merely because its name or image looks familiar.
Unknown workloads remain visible as unmanaged and are never included in a bulk mutation by
default.

All paths, ports, volumes, image tags and resource limits require bounded validation before a plan
is executable. A plan must show conflicts, affected resources and the exact commands or API
operations that will be requested. Credentials, environment values and private paths must stay out
of ordinary logs, exports, history, captures and public records.

## Failure and recovery

Every operation must preserve the pre-mutation state where possible, report Docker's actual error,
and leave a durable outcome of `completed`, `partial`, `cancelled` or `failed`. A daemon stopping
mid-operation must not be reported as a successful update or removal. Reopening the app must
reattach to owned containers that still exist and must label missing, changed or externally removed
resources rather than silently recreating them.

Bulk operations need a reviewable preview, an exact selected-versus-affected count, cancellation,
partial results and an undo/history entry where the action is reversible. A failed item must not
turn a partially completed batch green, and a non-owned workload must remain unchanged even when it
matches a broad filter.

## Security considerations

The Docker socket is a privileged boundary. The manager must use a least-privileged, allowlisted
operation layer rather than accepting arbitrary shell text or unrestricted Docker arguments. It must
not expose the socket to a browser surface, send Docker credentials over the network, or use a
remote daemon as an implicit fallback. Destructive operations must be scoped to recorded ownership,
and the confirmation surface must state exactly which container, image, volume and generated files
will be affected.

## Verification status

Issue #69 remains open and unverified. The current checkout contains the existing Docker render,
Docker world-import and remote-hosting foundations, but no dedicated local Docker hosting
instance-manager implementation was found in the source inventory. This documentation-only record
did not run tests, contact a Docker daemon, create throwaway containers, exercise refusal or
cancellation paths, build the packaged application, or take a headless capture. Those are required
before any acceptance item can be marked complete.

The next owner should first add the manager implementation and its feature article/site entry,
then prove daemon-state handling and ownership isolation against an isolated throwaway Docker
environment. The packaged application must subsequently exercise plan, mutation, recovery,
reattachment, bulk and export flows through the approved headless route, with captures of the real
surface and redacted operation receipts.

## Related

- [Running the engine on this computer, or in a container](./docker-and-local.md) — Docker as a
  render execution route, not an instance manager.
- [A world that lives inside Docker](./docker-world-source.md) — read-only world import from a
  real container mount or named volume.
- [Hosting a rendered map on your own server](./remote-hosting.md) — remote SSH/Docker hosting of
  an already-rendered map.
- [Super confirmation](./super-confirmation.md) — the destructive-action confirmation contract.

### 廣東話 / Cantonese

Issue #69 要整嘅係一個本機 Docker hosting manager，專門管理個 app 自己開嘅 BlueMap server
container；唔係喺 container 入面 render、唔係由 container 攞 world、亦唔係 SSH 去遠端機
host 已經 render 好嘅地圖。要分清 CLI 唔見、daemon 停咗、socket 被拒、答案唔啱用同 ready，
再用真資料列 container、image、port、volume、map、config、health、log 同 update 狀態。

今次只係寫 records，冇跑 tests、冇掂真 daemon、冇開 throwaway container、冇 package、冇
headless capture。實作、ownership isolation、plan-first mutation、recovery、bulk/export 同
真 packaged evidence 都仲係下一位 owner 要補嘅工作。
