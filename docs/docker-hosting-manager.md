# Docker hosting instance manager

## Behaviour

Issue #69 provides a local Docker hosting manager for BlueMap server instances. This is a
different surface from rendering a map inside a container, importing a world from a container or
publishing an already-rendered map to a remote SSH host. The manager owns and manages only
workloads carrying this application's ownership labels.

The current source is split across `design/packages/app/src/main/dockerhosting/manager.ts`,
`ipc.ts` and `index.ts`, with the preload bridge in `design/packages/app/src/preload/index.ts` and
the user-facing surface in `design/packages/ui/src/components/remote/DockerHostingScreen.vue`.
`main/index.ts` starts it with a user-data record file, `jobRegistry.ts` registers the
`dockerHosting` destination, `App.vue` mounts the tab, and `catalogues.ts` exposes the command-
palette/feature-catalogue entry.

The surface discovers the local Docker daemon and distinguishes these states:

| State | Required meaning |
| --- | --- |
| `not-installed` | The Docker CLI is not available on the current account's `PATH`. |
| `daemon-unreachable` | The CLI exists, but the daemon socket or service does not answer. |
| `refused` | The daemon answers, but this account is not permitted to use it. |
| `unusable` | Docker returned an unrecognised or unusable response. |
| `ready` / `available` | The daemon response is usable for the requested operation. |

When ready, the manager lists and inspects application-owned containers and labelled volumes, while
the image inventory is limited to exact digest-pinned references (`repository@sha256:...`). Create
validates a digest-pinned image,
safe id/name, ports and volumes, checks port conflicts, creates owned named volumes when needed,
labels the container, preserves the digest-pinned image's own `ENTRYPOINT` and `CMD`, verifies the
created container and loopback mappings, and rolls back when verification fails. Create does not
start the container: Create and Start remain separate explicit operations. Start, stop and restart
run through the manager IPC with progress, cancellation
and refresh events. Stop and remove use native confirmation surfaces; remove consumes a short-lived
one-use authorization token and keeps volumes and unrelated workloads out of scope.

The surface provides a guided create path through validated values, a persistent target record,
restart reattachment through the saved record file, bounded log display, selection/export for
owned rows, and a direct tab/command-palette destination. It is tabbed and searchable through the
anchored regex builder, with per-element appearance targeting and the normal localization,
funny-level, accessibility, responsive-layout and confirmation contracts. Full image/resource
pickers, actual server/map configuration editing, generated-file/folder handoff to Visual Studio Code,
and complete history/bulk-action treatment remain open work.

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

Issue #69 remains open and unverified. As of the current `main` baseline
(`b5dd1fd332de7e0eee3e9b3a5b233fceae4e6170`, published as `v1.0.1380`), the checkout contains the manager implementation,
bridge, navigation and catalogue wiring described above, alongside the existing Docker render,
Docker world-import and remote-hosting foundations. This records update did not run tests, contact
a Docker daemon, create throwaway containers, exercise refusal or cancellation paths, build the
packaged application, or take a headless capture. Those are required before any acceptance item can
be marked complete.

The next owner must prove daemon-state handling and ownership isolation against an isolated
throwaway Docker environment; create conflict and rollback; start/stop/restart; update refusal
until transactional recreate exists; map/configuration state; persistent logs/history; multi-row
bulk actions; export and Visual Studio Code handoff. The packaged application must subsequently
exercise these flows through the approved headless route, with captures of the real surface and
redacted operation receipts.

## Related

- [Running the engine on this computer, or in a container](./docker-and-local.md) — Docker as a
  render execution route, not an instance manager.
- [A world that lives inside Docker](./docker-world-source.md) — read-only world import from a
  real container mount or named volume.
- [Hosting a rendered map on your own server](./remote-hosting.md) — remote SSH/Docker hosting of
  an already-rendered map.
- [Super confirmation](./super-confirmation.md) — the destructive-action confirmation contract.

### 廣東話 / Cantonese

Issue #69 而家有一個本機 Docker hosting manager，專門管理帶住 app ownership labels 嘅
BlueMap server container；唔係喺 container 入面 render、唔係由 container 攞 world、亦唔係
SSH 去遠端機 host 已經 render 好嘅地圖。Source 已經有 manager、IPC/preload bridge、
`dockerHosting` tab、command-palette entry、create validation、label filtering、persistent
record、progress/cancel、logs、selection/export 同 confirmation surface。要分清 CLI 唔見、
daemon 停咗、socket 被拒、答案唔啱用同 ready，再用真資料列 container、image、port、volume、
map、config、health、log 同 update 狀態。

今次只係寫 records，冇跑 tests、冇掂真 daemon、冇開 throwaway container、冇 package、冇
headless capture。真 daemon ownership/refusal、create rollback、update、map/config state、
persistent log/history、multi-bulk、VS Code handoff 同 packaged evidence 都仲係下一位 owner
要補嘅工作。
