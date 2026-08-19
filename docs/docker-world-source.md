# A world that lives inside Docker

> **Issue #86 acceptance record — 2026-08-19 (documentation-only pass)**
>
> The current implementation includes the local Docker inventory, mount inspection, bind-direct,
> container-copy, and read-only named-volume-copy routes described below. This pass records source
> state only; it did not run tests, launch a Docker daemon, build/package the desktop application, or
> capture the packaged flow. No real-container, bind-mount, named-volume, cancellation, retry,
> destination-safety, `level.dat`/region validation, or render/open evidence is added here. The
> daemon/package/capture acceptance items therefore remain open and this issue is not closed.

A world does not have to be a folder this computer can already see. It can be sitting inside a
Minecraft server that already runs in a container — a bind-mounted host folder, a named volume,
or nothing this machine can read directly at all, only Docker's own view of it. This is the input
side of that: reaching the world, whichever of those three shapes it turns out to be, without
asking anybody to know which one it is before they start.

**Contents**

- [The three ways in](#the-three-ways-in)
- [The refusal a running container earns](#the-refusal-a-running-container-earns)
- [Local daemon, or one reached over SSH](#local-daemon-or-one-reached-over-ssh)
- [What is incremental, and what is not](#what-is-incremental-and-not)
- [A cheap change check, and where it does and does not reach](#a-cheap-change-check-and-where-it-does-and-does-not-reach)
- [Using it in the desktop application](#using-it-in-the-desktop-application)
- [Failure modes](#failure-modes)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Related reading](#related-reading)

## The three ways in

`main/dockerworld/resolve.ts` decides which of three routes a world is read through, and never
guesses: every claim is checked before it is trusted.

| Route | When | How the bytes move |
|---|---|---|
| `bind-direct` | a bind mount's host path answers a directory check, on whichever machine is doing the asking | straight off that filesystem — no Docker command touches the bytes at all |
| `container-copy` | a specific container has the world mounted, but its host path does not answer that check | `docker cp <container>:<path> <staging>`, which works whether the container is running or stopped and regardless of storage driver, because it reads through the container's filesystem view rather than whatever backs it |
| `volume-copy` | a bare volume, named without reference to any container | a disposable helper container binds the volume read-only and a staging directory read-write, and a plain `cp -a` inside it does the copy — one `docker run`, no pipe |

The reason a bind mount is *tried* rather than assumed matters more than it looks: Docker
Desktop on Windows runs containers inside a Linux VM, and a bind mount's reported host path is
frequently a path inside that VM, not a Windows path this process can open. A native Linux daemon
does not have that problem. Rather than guess which kind of host produced the report, every
bind-mount source is checked — `fs.stat` locally, `test -d` over the remote runner for an SSH
host — and only trusted once that check actually answers yes. Everything else falls back to
`docker cp`, which reads correctly either way because Docker itself is the one reading it.

A named volume's own `Mountpoint` is never trusted as directly readable, even on a native Linux
host where root genuinely could read it: this application does not run as root, and assuming
otherwise for the sake of one machine shape would be exactly the kind of guess the rest of this
module refuses to make.

## The refusal a running container earns

A running server may be writing to the exact region files being read. Reading them anyway can
produce a torn `.mca` file — one that opens without error, because the region format's own
compression does not notice a chunk written mid-copy, and corrupts a render three layers away
from anything that would point back here.

So a fetch of a **running** container's world refuses outright unless the caller explicitly says
`acknowledgeLiveRisk: true`. That flag **is** an override, and it works: pass it, having read the
warning, and the fetch proceeds anyway. What this refusal does not have is a *silent* or
*standing* override — nothing "always allows" it by default, nothing persists a prior acceptance
into a setting that would apply to every world after the first, and nothing lets a caller skip
past it without the exact sentence naming the container and the risk. Every fetch of a live world
is acknowledged fresh, per call. Three honest options are named, every time: stop the server
first, point this at a backup instead, or accept the risk explicitly and fetch it live anyway.

**What this project does not have yet** is a fourth, *automatic* safe route — a `save-off`/`save-all`
RCON command sent to the server before the copy and `save-on` after, which is how a careful
backup script protects itself without stopping the server and without asking a person to accept
any risk at all. Building one means an RCON client and somewhere to keep the server's RCON
password, which is exactly the kind of secret this project's own rules say never gets typed into
a settings field — it would need the same ephemeral, one-time-token intake flow the project uses
for any other secret, and that has not been built. Until it is, the three options above are the
fetcher's only honest ones for a live world.

## Local daemon, or one reached over SSH

Every function in `dockerworld/` takes a `CommandRunner` the same way `runtime/docker.ts` and
`remote/ssh.ts` already do, rather than assuming `docker` is on this machine's `PATH`. That is
what lets the identical logic answer for:

- **a local daemon** — the default, no configuration needed;
- **a Docker host reached over SSH** — pass `sshCommandRunner(...)` from the remote-render lane's
  own module as the runner, and a `FileTransfer` (rsync when both ends have it, `scp` otherwise —
  the exact same choice `remote/rsync.ts`'s `chooseTransfer` already makes) to bring the bytes
  back, for the `bind-direct` and staging-placement steps.

Nothing here spawns `ssh` itself or knows what a `RemoteTarget` is; that stays the SSH lane's own
concern, and this module reuses its result rather than a parallel implementation. This is fully
built and tested at the module level — see [Verification](#verification) — against a fake runner
and a fake `FileTransfer`, so none of it needs an actual remote host to prove out.

## What is incremental, and what is not

- **`bind-direct` is genuinely incremental.** `localIncrementalCopy` compares size and
  modification time and copies only what differs; a remote fetch gets the same property for free
  from rsync's `-a`, which does the identical comparison. A world with a thousand region files and
  six changed ones moves six files.
- **`container-copy` and `volume-copy` are not**, and this is an honest limitation rather than an
  oversight. Docker has no notion of "copy only what changed" — `docker cp` and a helper
  container's `cp -a` always read the whole thing. What incrementality this module *can* still
  offer is in the placement step: staging always lands in a scratch directory, and only the move
  from staging into the real destination is incremental, so a scheduled render that finds a
  volume-backed world unchanged does not rewrite files downstream of the destination — a
  git-tracked copy, a render cache — even though the `docker cp` itself still ran.
- **Nothing here ever deletes.** Every copy only adds and updates files; a region pruned or a
  dimension removed at the source leaves a stale file behind at the destination rather than
  losing data to a bug in a comparison. This is also why fetching a Docker world needs no
  destructive-action gate: nothing this module does is destructive.

## A cheap change check, and where it does and does not reach

`dockerworld/change.ts` exports `dockerWorldFingerprint`, which answers "has this world changed"
by reading file **metadata** — region file names, sizes, modification times — and never a byte of
content, so a caller can ask before every fetch without paying for the copy it might decide is
unnecessary.

**Only the `bind-direct` route gets a cheap answer.** That is the same line `resolve.ts` already
draws: a bind mount can be listed without touching Docker at all, locally with `readdir`/`stat` or
remotely in one `find <root> -name '*.mca' -exec stat --format=%n:%s:%Y {} +` round trip.
`container-copy` and `volume-copy` have no such vantage point — Docker's own filesystem view is
reachable only by reading it, and reading it is exactly the expensive step a change check exists
to avoid. Asking for a fingerprint of one of those routes returns `null`, plainly, rather than a
wrong or invented answer. Whoever wants incrementality out of a volume-backed world pays for the
copy every time until Docker grows a cheaper way to ask; there is no honest way around that today.

`fingerprintsEqual` compares two fingerprints order-independently, so a caller can keep the last
fingerprint beside whatever record it keeps and skip a fetch when the next one matches.

**Exposed over IPC, the same way the git-repository and SSH routes expose theirs.**
`DockerWorldFetcher.fingerprint(source)` resolves the source and returns its fingerprint (or
`null`, honestly, for the two routes above), and `main/dockerworld/ipc.ts` puts that behind
`dockerworld:fingerprint` — the same shape `worldrepo:remoteTip` uses for a git-repository world.
`dockerworld:fingerprintsEqual` exposes the pure comparison the same way `worldsource:ssh:diff`
does. Both are counted among the eight channels the [desktop-application section
below](#using-it-in-the-desktop-application) says are not yet called from
`design/packages/ui` — the same documented gap the fetch, list and inspect channels already carry,
now including these two.

**What this is not connected to, and why not:** [Scheduled re-rendering](./scheduled-render.md)'s
`evaluateScheduleChange` gained a `"git"` comparator because a GitHub-hosted Actions runner can
reach a GitHub-hosted git branch directly — one `gh api` call. It has **no** `"docker"`
comparator, and `render-world.yml`'s own `world-source` choices are exactly `repository`, `url`,
`release-asset` and `git` — Docker is not among them, and this is not an oversight to fix later:
a GitHub-hosted runner has no route to a local Docker daemon or to a Docker host on somebody's own
network without exposing that daemon to the internet, which this project does not do. That is the
exact same reason the SSH world source's own `surveyRemoteWorld`/`diffRemoteWorldSurveys` — built
before this route, and already exposed over IPC the same way — never gained a matching kind
either. `dockerWorldFingerprint` is real, tested, and reachable through the IPC bridge for
whatever calls it locally on this computer; it is not, and structurally cannot become, an input to
the GitHub Actions scheduled-render workflow.

## Using it in the desktop application

The ordinary map wizard's **World** step now mounts a guided **World in local Docker** panel. It
uses only this computer's local IPC registration; it does not claim that a remote Docker daemon
is reachable. The flow is deliberately made of real pickers rather than identifier boxes:

1. **Check Docker and refresh.** The existing five-state Docker explanation distinguishes an
   absent command, a stopped daemon, a refused daemon socket, an unusable answer and a working
   daemon. The container and volume lists come from `dockerworld:list` on every refresh.
2. **Choose a source.** Container mode lists every running and stopped container, then calls
   `dockerworld:inspectContainer` and offers only its real bind and named-volume mounts. Volume
   mode lists Docker's real named volumes and inspects the chosen one. No container id, volume
   name or mount path is invented or accepted as free text.
3. **Review liveness and the route.** Running/stopped state is refreshed from Docker. A directly
   readable bind mount shows the real cheap metadata fingerprint and region count. Container-copy
   and volume-copy routes say that their fingerprint is `null` because Docker must read them to
   know whether they changed.
4. **Choose a local destination.** The shared `PathField` provides both free text and the native
   folder browser. This is the exact folder the fetched world becomes, not an implicit child
   whose name the interface guesses.
5. **Fetch and validate.** A stopped container or volume can start immediately. A running
   container requires the fresh, exact torn-`.mca` acknowledgement described above. The checkbox
   is consumed by one attempt and is never persisted. Success is then handed to the wizard's
   ordinary local inspection path, which reads `level.dat` and the actual region data before the
   wizard can continue.

The fetch button states its disabled reason beside it. The submitting handler refuses re-entry,
the button stays disabled during the operation, and cancellation reaches the child `docker cp`
or helper-container process through an abort signal. Progress is honest about the seam's actual
knowledge: Docker's source-copy phase is indeterminate because `docker cp` and `cp -a` expose no
file total, while the local additive-placement phase reports the real number of files checked and
the current relative path. A directly readable bind mount reports those real file counts from the
first phase. No timer-shaped percentage is presented as work completed.

This operation is not destructive, so the destructive-action super-confirmation gate does not
apply: the source side is read-only, the volume helper mounts `/mb-source:ro`, and local placement
only adds or updates. It never deletes a destination file. The running-container acknowledgement
is a different safety decision and remains mandatory per fetch.

## Failure modes

| What happened | What is reported |
|---|---|
| there is no `docker` on the account's `PATH` | `not-installed` |
| the daemon is not running | `daemon-unreachable` |
| the daemon is there, this account may not talk to it | `refused` |
| Docker answered with something unrecognised | `unusable` |
| the named container or volume does not exist | `not-found` |
| the request names a mount destination the container does not have | `invalid-request` |
| the container is running and the risk was not accepted | `live-world-not-acknowledged` |
| `docker cp` or the helper container failed | `copy-failed` |
| what was copied out is not a Minecraft world | `not-a-world`, naming what `locateWorld` looked for and where |
| the destination folder could not be written | `storage-unwritable` |
| the person cancelled it | `cancelled` — whatever had already been copied stays; see below |

A cancellation leaves whatever was already written to the destination in place, because every
copy in this module is additive-only. It never corrupts existing good data; it simply leaves the
destination partially updated, exactly where the next fetch's incremental comparison picks back
up. A staging directory this fetch created for itself is still removed on the way out, cancelled
or not — it holds nothing a person asked to keep.

## Security notes

- **The world is always read, never written.** Nothing in this module issues a `docker cp` or a
  helper-container run in the direction of the container or volume; every copy moves from Docker
  toward the destination folder.
- **The helper-container idiom mounts the volume read-only.** `-v <volume>:/mb-source:ro` — a bug
  in the disposable container's own command cannot write into somebody's world, because the mount
  itself refuses the write at the kernel level regardless of what runs inside.
- **The helper container reuses the render engine's own default image** (`eclipse-temurin:*-jre`,
  from `runtime/plan.ts`) rather than pulling a second one, so this feature costs no extra image
  download on a machine that already renders through Docker.
- **No secret is asked for or stored.** There is no RCON password field, no daemon credential
  beyond whatever the account running this app already has configured for `docker` itself, and no
  new place for a secret to end up in a log or a config file.
- **The live-world refusal has no override flag that defaults to true anywhere in this module.**
  `acknowledgeLiveRisk` is read from the caller's own request each time; nothing persists a prior
  acceptance into a setting that would silently apply to every world after the first.

## Verification

### Issue #86 current evidence boundary — 2026-08-19

This documentation-only update does not add runtime evidence. In this records-only pass, tests and
captures are intentionally unrun. The earlier focused module-level test inventory below remains a
description of the existing test coverage, not a result from this pass. A real daemon/package run
is still required to prove throwaway running and stopped containers, bind mounts, named volumes,
fresh one-shot live-risk acknowledgement, copy progress/cancellation/retry, source read-only
behaviour, additive destination placement, ordinary wizard validation, and the genuine packaged
headless capture. Until those receipts exist, issue #86 remains open.

`design/packages/app/src/main/dockerworld/` plus the preload/UI seam have focused tests, none of
which need a Docker
installation, a daemon, or a network connection:

| File | What it proves |
|---|---|
| `inventory.test.ts` | the five daemon states map correctly; container and volume listings parse real `docker ... --format {{json .}}` output, including a stray non-JSON line; mounts, running state and the zero-time "never started" case read correctly from `docker inspect` |
| `resolve.test.ts` | a mount at the wrong destination is refused; a reachable host path routes `bind-direct`; an unreachable one (the Docker Desktop VM-path case) falls back to `container-copy`; a bare volume always routes `volume-copy`; the running flag and its warning text carry through; `remoteDirectoryExists` runs `test -d` through the given runner |
| `copy.test.ts` | `localIncrementalCopy` copies once, touches nothing on an unchanged second pass, re-copies on a size or modification-time change, and — checked directly — never deletes a file the destination has that the source no longer does; `dockerCopyToStaging` and `volumeCopyToStaging` build the exact argv described above; `copyRemoteBindMount` creates the destination and calls the given `FileTransfer` |
| `fetch.test.ts` | no daemon, permission denied, a volume that does not exist, a stopped container's world fetched with no acknowledgement needed, a running container refused and confirmed to leave the destination untouched, the same container fetched successfully once the risk is accepted (with the warning event proven present), a copied-out folder that is not a world, both the `container-copy` and `volume-copy` staging routes with their staging directories proven cleaned up afterward, a cancellation proven to leave the destination without the copy it interrupted, and `fingerprint()` reading the bind-direct fingerprint with no copy invoked, answering `null` for a container-copy candidate, and surfacing the same resolve failure `inspect()` would |
| `change.test.ts` | the local and remote fingerprints agree on the same content; a size change is detected; `container-copy`/`volume-copy` candidates answer `null` rather than a guess; a remote fingerprint with no runner also answers `null` |
| `ipc.test.ts` | the eight channels register and `dispose` exactly; a malformed request is refused rather than reaching the fetcher; the fetcher's own throw is turned into a reported failure rather than a rejection; `list` and `inspect*` thread an injected runner rather than reaching for whatever `docker` happens to be on the test machine; `dockerworld:fingerprint` refuses a sourceless request, passes a well-formed one through, and never rejects on a fetcher throw; `dockerworld:fingerprintsEqual` compares order-independently and treats malformed input as an empty fingerprint rather than throwing |
| `dockerWorldBridge.test.ts` | all eight invokes use the exact channel and argument shape, and the event listener forwards `dockerworld:event` and removes only its own listener |
| `DockerWorldSourcePanel.test.ts` | mounted pickers receive real container/volume/mount data; a live fetch is refused until the fresh exact acknowledgement and consumes it after one attempt; a volume reports a null fingerprint honestly; real progress events render and cancellation reaches the active id |
| policy inventories | the surface's search opens the anchored full regex builder; its AppearanceTarget supplies the searchable context menu and editor; the destination is in the PathField inventory; overlays are bounded; copy facts are guarded at every funny level; the read-only/additive path is explicitly recorded as not destructive |

Run them with `npx vitest run packages/app/src/main/dockerworld` from `design/`.

**Not verified against a real source in this pass.** The host had Docker Desktop client 29.6.1,
but its `desktop-linux` daemon pipe did not exist: `docker version` returned a real client and
`Server: null`, then `docker ps` failed at
`npipe:////./pipe/dockerDesktopLinuxEngine`. No real container, volume or mount could be listed,
so no runtime fetch was simulated or claimed. A real Docker Desktop VM-path bind mount and a real
remote host over SSH also remain unverified. The cheap hidden UI proof separately verifies the
real built panel and the daemon-down guidance, not a successful source copy.

## Related reading

- [Running the engine on this computer, or in a container](./docker-and-local.md) — the Docker
  path a *render* takes, including the mount rules `dockerworld/`'s own host-path checks are
  modelled on.
- [Rendering on a remote host](./remote-render.md) — the SSH primitives (`CommandRunner`,
  `FileTransfer`, `chooseTransfer`) this module reuses rather than reimplementing.
- [Worlds from somebody else's release](./world-sources.md) — the other input-side world source,
  and the same "fully built, not yet wired to the UI" gap this document names for the same reason.
- [Scheduled re-rendering](./scheduled-render.md) — the GitHub Actions lane `dockerWorldFingerprint`
  is deliberately *not* wired into, and why: a GitHub-hosted runner has no route to a local
  Docker daemon.
- [Worlds hosted on your own SSH server](./ssh-world-sources.md) — the other locally-reachable,
  scheduled-render-shaped change check (`surveyRemoteWorld`/`diffRemoteWorldSurveys`) that carries
  the identical, structural gap with the GitHub Actions lane.
- [Backing up a world or a rendered map](./backup.md) — why this project never reaches for Git
  LFS, including for a world's own storage.

## 廣東話

### 一個住喺 Docker 入面嘅世界 (Docker world source)

一個世界唔一定要係呢部電腦已經睇得到嘅資料夾。佢可以係坐喺一部已經行緊 container 嘅 Minecraft server 入面 — 可能係一個 bind-mount 咗嘅 host 資料夾、一個 named volume，又或者根本冇任何嘢係呢部機直接讀得到，得 Docker 自己嗰個 view。呢份文件講嘅係輸入嗰邊：無論最後係嗰三種形狀入面邊一種，都掂得到個世界，而且唔使任何人喺開始之前就知自己屬於邊種。

### 三條入路

`main/dockerworld/resolve.ts` 決定一個世界經三條路線入面邊條嚟讀，而且從來唔估：每一項聲稱喺被信之前都會驗證。

第一條係 `bind-direct`：當一個 bind mount 嘅 host 路徑喺負責問嗰部機上面通過咗目錄檢查，就直接由嗰個檔案系統讀 — 完全冇任何 Docker 指令掂過啲 bytes。第二條係 `container-copy`：當某個特定 container 有 mount 住個世界，但佢個 host 路徑通唔過嗰個檢查，就用 `docker cp <container>:<path> <staging>`，呢招無論個 container 行緊定停咗、無論用邊個 storage driver 都得，因為佢係經 container 嘅檔案系統 view 嚟讀，唔理底層係乜。第三條係 `volume-copy`：一個淨係得個名、唔關任何 container 事嘅 volume，就開一個用完即棄嘅 helper container，將個 volume 唯讀 bind 埋、將 staging 目錄可讀寫 bind 埋，喺入面行一句普通 `cp -a` 做複製 — 一次 `docker run`，冇 pipe。

Bind mount 係去*試*而唔係當佢一定得，呢點比表面重要：Docker Desktop 喺 Windows 上面係喺一個 Linux VM 入面行 container，而一個 bind mount 報返嘅 host 路徑好多時係嗰個 VM 入面嘅路徑，唔係呢個 process 開得到嘅 Windows 路徑。原生 Linux daemon 就冇呢個問題。與其估係邊種主機報返嚟，倒不如每個 bind-mount source 都檢查一次 — 本機用 `fs.stat`，SSH 主機就經 remote runner 行 `test -d` — 檢查真係答 yes 咗先信。其餘一律 fallback 去 `docker cp`，兩種情況都讀得啱，因為讀嘅人係 Docker 自己。

一個 named volume 自己嘅 `Mountpoint` 永遠唔會被當成直接讀得到，就算喺原生 Linux 主機、root 真係讀得到都唔會：呢個 application 唔係用 root 行，而為咗遷就一種機型就假設佢係，正正就係呢個 module 其餘部分拒絕做嘅嗰種估估下。

### 一個行緊嘅 container 值得被拒絕

一部行緊嘅 server 可能正正喺度寫緊你讀緊嗰啲 region 檔。照讀落去可能整出一個撕裂咗嘅 `.mca` 檔 — 佢開得到而且唔會報錯，因為 region 格式自己嗰套壓縮唔會察覺有隻 chunk 係複製中途寫入嘅，然後喺三層之外整衰次 render，而嗰度冇任何嘢會指返嚟呢度。

所以攞一個**行緊**嘅 container 嘅世界會直接被拒絕，除非 caller 明確講 `acknowledgeLiveRisk: true`。呢個 flag **確實係**一個覆寫，而且真係有效：睇完警告之後傳佢，次 fetch 就照行。呢個拒絕冇嘅係*靜靜雞*或者*長期*嘅覆寫 — 冇任何嘢預設「永遠允許」，冇任何嘢會將之前接受過嘅嘢保存落一個設定度、令第一個之後嘅世界全部適用，亦冇任何嘢畀 caller 跳過嗰句明確點名咗個 container 同風險嘅說話。每次攞一個 live 世界都要重新確認一次，逐次呼叫計。每次都會列出三個老實選擇：先熄咗個 server、改為指去一份備份、或者明確接受風險照住 live 攞。

**呢個 project 而家仲未有**第四條、*自動*嘅安全路線 — 即係喺複製之前經 RCON 向 server 送 `save-off`/`save-all`、之後送 `save-on`，一個謹慎嘅備份 script 就係噉樣喺唔熄 server、又唔使任何人接受任何風險嘅情況下保護自己。要整呢個就要有 RCON client，同埋一個位擺 server 個 RCON 密碼，而嗰樣嘢正正就係呢個 project 自己啲規則講明永遠唔會打入一個設定欄嘅秘密 — 佢要行返 project 對其他秘密用嗰套即用即棄、一次性 token 嘅收集流程，而嗰個仲未整。整好之前，上面三個選擇就係 fetcher 對一個 live 世界唯一老實嘅做法。

### 本機 daemon，定係經 SSH 掂到嗰個

`dockerworld/` 入面每個 function 都好似 `runtime/docker.ts` 同 `remote/ssh.ts` 已經做開噉，收一個 `CommandRunner`，而唔係假設 `docker` 喺呢部機嘅 `PATH` 上面。就係噉樣，同一套邏輯先答得到兩種情況：**本機 daemon**（預設，唔使配置）；同埋**經 SSH 掂到嘅 Docker host** — 將 remote-render 那條 lane 自己個 module 嘅 `sshCommandRunner(...)` 當 runner 傳入，再傳一個 `FileTransfer`（兩邊都有就用 rsync，冇就用 `scp` — 同 `remote/rsync.ts` 嘅 `chooseTransfer` 已經做緊嘅選擇一模一樣）將 bytes 攞返嚟，畀 `bind-direct` 同 staging 擺位嗰兩步用。

呢度冇任何嘢自己 spawn `ssh`，亦唔知 `RemoteTarget` 係乜；嗰啲留返畀 SSH lane 自己管，而呢個 module 係重用佢個結果，唔係寫多份平行實作。呢部分喺 module 層面已經完全整好兼有測試 — 見驗證一節 — 用嘅係假 runner 同假 `FileTransfer`，所以全部都唔使真有部遠端主機都證得到。

### 邊啲係增量，邊啲唔係

- **`bind-direct` 係真正嘅增量。** `localIncrementalCopy` 會比較大細同修改時間，只複製唔同嗰啲；遠端 fetch 就靠 rsync 個 `-a` 免費攞到同樣特性，佢做嘅比較係一模一樣。一個有一千個 region 檔、其中六個變咗嘅世界，就淨係搬六個檔。
- **`container-copy` 同 `volume-copy` 唔係**，而呢個係老實嘅限制，唔係漏咗。Docker 根本冇「只複製變咗嘅嘢」呢個概念 — `docker cp` 同 helper container 嘅 `cp -a` 永遠讀晒成份。呢個 module *仲*提供到嘅增量性喺擺位嗰步：staging 永遠落喺一個 scratch 目錄，只有由 staging 搬入真正目的地嗰步係增量，所以一次排程 render 如果發現一個 volume 撐住嘅世界冇變過，就唔會重寫目的地下游嘅檔案 — 例如一份 git 追蹤緊嘅副本、一個 render cache — 就算個 `docker cp` 本身照樣行咗。
- **呢度冇任何嘢會刪嘢。** 每次複製都淨係加同更新檔案；source 嗰邊剪走咗一個 region 或者移除咗一個維度，喺目的地會留低一個過時嘅檔案，而唔會因為一個比較邏輯嘅 bug 而蝕咗資料。呢個亦都係點解攞一個 Docker 世界唔需要破壞性操作嘅閘：呢個 module 做嘅嘢冇一樣係破壞性。

### 平價嘅變更檢查，同佢掂到／掂唔到邊度

`dockerworld/change.ts` 匯出 `dockerWorldFingerprint`，佢靠讀檔案**元資料** — region 檔名、大細、修改時間 — 嚟答「呢個世界變咗未」，一個 byte 內容都唔會讀，所以 caller 可以喺每次 fetch 之前問一問，唔使為一次可能判定為冇必要嘅複製找數。

**淨係 `bind-direct` 路線攞到平價答案。** 呢條線同 `resolve.ts` 已經劃嘅一樣：一個 bind mount 完全唔使掂 Docker 都列得出，本機用 `readdir`/`stat`，遠端就一次 round trip 行 `find <root> -name '*.mca' -exec stat --format=%n:%s:%Y {} +`。`container-copy` 同 `volume-copy` 冇呢個觀察點 — Docker 自己嗰個檔案系統 view 淨係讀先掂得到，而讀佢正正就係一個變更檢查想避免嗰個貴步驟。問呢兩條路線攞 fingerprint 會直接回 `null`，唔會畀個錯嘅或者作出嚟嘅答案。想喺一個 volume 撐住嘅世界身上攞增量嘅人，喺 Docker 出到一個更平嘅問法之前，每次都要為複製找數；今日冇任何老實嘅方法繞過。

`fingerprintsEqual` 比較兩個 fingerprint 係唔理次序嘅，所以 caller 可以將上一個 fingerprint 擺喺佢自己保存嗰份紀錄隔籬，下次夾得返就跳過 fetch。

**經 IPC 暴露出嚟，同 git repository 同 SSH 路線暴露佢哋嗰啲一樣。** `DockerWorldFetcher.fingerprint(source)` 會解析個 source 再回傳佢個 fingerprint（上面兩條路線就老實回 `null`），而 `main/dockerworld/ipc.ts` 將佢擺喺 `dockerworld:fingerprint` 後面 — 同 git repository 世界用嘅 `worldrepo:remoteTip` 同一個形狀。`dockerworld:fingerprintsEqual` 就好似 `worldsource:ssh:diff` 噉暴露嗰個純比較。兩者都計入下面桌面應用一節講嘅八條 channel 之中，而嗰八條仲未喺 `design/packages/ui` 度被呼叫 — 同 fetch、list、inspect channel 已經帶住嘅同一個有文件記錄嘅缺口，而家連埋呢兩條。

**呢個唔連去邊度，同點解：**[Scheduled re-rendering](./scheduled-render.md) 嘅 `evaluateScheduleChange` 有咗一個 `"git"` comparator，因為一個 GitHub 主機上面嘅 Actions runner 直接掂得到一個 GitHub 上面嘅 git branch — 一次 `gh api` 呼叫搞掂。佢**冇** `"docker"` comparator，而 `render-world.yml` 自己嘅 `world-source` 選擇就係 `repository`、`url`、`release-asset` 同 `git` — Docker 唔喺其中，而且呢個唔係遲啲要補嘅疏忽：一個 GitHub 主機嘅 runner 冇任何路徑掂到一個本機 Docker daemon，或者掂到某人自己網絡入面嘅 Docker host，除非將嗰個 daemon 曝露上互聯網，而呢個 project 唔會噉做。SSH 世界源自己嗰個 `surveyRemoteWorld`/`diffRemoteWorldSurveys`（比呢條路線早整，而且一早已經以同樣方式經 IPC 暴露）同樣從來冇加到對應嘅 kind，理由一模一樣。`dockerWorldFingerprint` 係真嘢、有測試、亦經 IPC bridge 畀呢部電腦上面任何本機呼叫者用；但佢唔係、而且結構上都變唔到係 GitHub Actions 排程 render workflow 嘅輸入。

### 喺桌面應用度點用

普通地圖 wizard 嘅 **World** 步驟而家會 mount 一個有引導嘅 **World in local Docker** 面板。佢淨係用呢部電腦嘅本機 IPC 註冊；佢冇聲稱掂得到一個遠端 Docker daemon。整個流程刻意用真正嘅選擇器，唔係要你打 identifier 嘅輸入框：

1. **檢查 Docker 同重新整理。** 現有嗰個五狀態 Docker 說明會分開：指令唔存在、daemon 停咗、daemon socket 被拒、答案用唔到，同埋 daemon 正常。Container 同 volume 清單每次重新整理都由 `dockerworld:list` 攞。
2. **揀個 source。** Container 模式會列出所有行緊同停咗嘅 container，跟住叫 `dockerworld:inspectContainer`，只提供佢真實嘅 bind 同 named volume mount。Volume 模式會列出 Docker 真實嘅 named volume 再 inspect 揀咗嗰個。冇任何 container id、volume 名或者 mount 路徑係作出嚟或者當自由文字收。
3. **檢視 liveness 同路線。** 行緊／停咗嘅狀態會由 Docker 重新攞。一個直接讀得到嘅 bind mount 會顯示真實嘅平價元資料 fingerprint 同 region 數目。Container-copy 同 volume-copy 路線會講明佢哋個 fingerprint 係 `null`，因為 Docker 一定要讀過先知有冇變。
4. **揀一個本機目的地。** 共用嘅 `PathField` 同時提供自由文字同原生資料夾瀏覽。呢個就係攞返嚟嗰個世界會變成嘅確切資料夾，唔係一個介面自己估個名嘅隱含子資料夾。
5. **Fetch 同驗證。** 停咗嘅 container 或者 volume 可以即刻開始。行緊嘅 container 就要上面講嗰個即時、明確嘅撕裂 `.mca` 確認。嗰個 checkbox 一次嘗試就消耗掉，永遠唔會保存。成功之後會交畀 wizard 平時嘅本機檢查流程，佢會喺 wizard 可以繼續之前讀 `level.dat` 同實際 region 資料。

Fetch 掣會喺隔籬講明佢點解 disabled。提交 handler 拒絕重入，操作期間粒掣保持 disabled，而取消會經一個 abort signal 去到子 `docker cp` 或者 helper container process。進度顯示對呢個接縫實際知幾多好老實：Docker 嘅來源複製階段係 indeterminate，因為 `docker cp` 同 `cp -a` 都唔會 expose 檔案總數；而本機加建擺位階段就會報真實檢查過嘅檔案數同目前嘅相對路徑。一個直接讀得到嘅 bind mount 由第一階段開始就報得出嗰啲真實檔案數。冇任何計時器形狀嘅百分比會扮成已完成嘅工作。

呢個操作唔係破壞性，所以破壞性操作嘅超級確認閘唔適用：source 嗰邊係唯讀、volume helper mount 嘅係 `/mb-source:ro`、而本機擺位只會加或者更新，永遠唔會刪目的地嘅檔案。行緊 container 嘅確認係另一個安全決定，仍然係每次 fetch 都必須做。

### 失敗情況

帳戶嘅 `PATH` 上面冇 `docker` 報 `not-installed`；daemon 冇行報 `daemon-unreachable`；daemon 喺度但呢個帳戶冇資格同佢傾報 `refused`；Docker 答咗啲認唔到嘅嘢報 `unusable`；點名嗰個 container 或者 volume 唔存在報 `not-found`；請求指名一個 container 冇嘅 mount 目的地報 `invalid-request`；container 行緊而風險未被接受報 `live-world-not-acknowledged`；`docker cp` 或者 helper container 失敗報 `copy-failed`；複製出嚟嗰嚿嘢唔係 Minecraft 世界報 `not-a-world`，並且講明 `locateWorld` 搵過乜、搵過邊度；目的地資料夾寫唔到報 `storage-unwritable`；有人取消咗報 `cancelled`，而已經複製咗嘅嘢會留低。

取消會將已經寫入目的地嘅嘢原封留低，因為呢個 module 每次複製都係只加不減。佢永遠唔會整壞現有嘅好資料；佢淨係令目的地更新到一半，而下次 fetch 嘅增量比較就正正由嗰度接返。至於呢次 fetch 為自己開嘅 staging 目錄，無論有冇取消，離開嗰陣都照樣會移除 — 入面冇任何嘢係有人要求保留嘅。

### 安全注意

- **個世界永遠係讀，唔會被寫。** 呢個 module 冇任何地方會向 container 或者 volume 方向發 `docker cp` 或者 helper container run；每次複製都係由 Docker 流向目的地資料夾。
- **Helper container 嗰招係唯讀 mount 個 volume。** `-v <volume>:/mb-source:ro` — 就算個用完即棄 container 自己條指令有 bug，都寫唔入人哋個世界，因為個 mount 本身喺 kernel 層面就拒絕寫入，唔理入面行乜。
- **Helper container 重用算圖引擎自己嗰個預設 image**（`eclipse-temurin:*-jre`，出自 `runtime/plan.ts`），唔會 pull 多個，所以一部已經經 Docker render 嘅機用呢個功能唔使額外落多個 image。
- **唔會問你攞、亦唔會存任何秘密。** 冇 RCON 密碼欄、除咗行呢個 app 嗰個帳戶本身為 `docker` 配置咗嘅嘢之外冇任何 daemon credential，亦冇新地方畀秘密走漏落 log 或者 config 檔。
- **Live 世界嘅拒絕，喺呢個 module 入面冇任何預設為 true 嘅覆寫 flag。** `acknowledgeLiveRisk` 每次都係由 caller 自己個請求度讀；冇任何嘢會將之前接受過嘅嘢保存成一個會靜靜雞套用喺第一個之後每個世界嘅設定。

### 驗證

`design/packages/app/src/main/dockerworld/` 加埋 preload/UI 接縫都有針對性測試，冇一個需要裝 Docker、有 daemon 或者有網絡連線。逐個檔案證嘅嘢：`inventory.test.ts` 證五個 daemon 狀態對應正確、container 同 volume 清單解析得到真實嘅 `docker ... --format {{json .}}` 輸出（連夾雜嘅非 JSON 行），以及 mount、running 狀態同 zero-time「未開過」情況由 `docker inspect` 讀得啱。`resolve.test.ts` 證 mount 喺錯目的地會被拒、掂得到嘅 host 路徑走 `bind-direct`、掂唔到嗰個（即 Docker Desktop VM 路徑情況）fallback 去 `container-copy`、淨係得個名嘅 volume 永遠走 `volume-copy`、running flag 同佢嘅警告文字會傳落去，以及 `remoteDirectoryExists` 係經指定 runner 行 `test -d`。`copy.test.ts` 證 `localIncrementalCopy` 複製一次、第二次冇變就乜都唔郁、大細或者修改時間變咗就重新複製，而且直接驗證過佢永遠唔會刪走目的地有而 source 已經冇嘅檔案；亦證 `dockerCopyToStaging` 同 `volumeCopyToStaging` 砌出上面描述嗰個確切 argv，同埋 `copyRemoteBindMount` 會建立目的地再叫傳入嗰個 `FileTransfer`。`fetch.test.ts` 覆蓋冇 daemon、權限被拒、唔存在嘅 volume、一個停咗 container 嘅世界唔使確認就攞到、一個行緊嘅 container 被拒並且確認目的地原封不動、同一個 container 喺接受風險之後成功攞到（連警告事件都證實有出）、複製出嚟唔係世界嘅資料夾、`container-copy` 同 `volume-copy` 兩條 staging 路線連 staging 目錄事後證實清乾淨、一次取消證實目的地冇咗被中斷嗰次複製，以及 `fingerprint()` 讀 bind-direct fingerprint 而唔會觸發任何複製、對 container-copy 候選答 `null`、並且會浮出同 `inspect()` 一樣嘅 resolve 失敗。`change.test.ts` 證本機同遠端 fingerprint 對住同樣內容一致、大細改變偵測得到、`container-copy`/`volume-copy` 候選答 `null` 而唔係估、以及一個冇 runner 嘅遠端 fingerprint 一樣答 `null`。`ipc.test.ts` 證八條 channel 準確噉註冊同 `dispose`、格式錯嘅請求會喺去到 fetcher 之前被拒、fetcher 自己 throw 會變成一個報出嚟嘅失敗而唔係 rejection、`list` 同 `inspect*` 會穿一個注入嘅 runner 而唔係亂攞測試機上面隨便邊個 `docker`、`dockerworld:fingerprint` 會拒絕冇 source 嘅請求同時放行格式正確嗰個而且永遠唔會因為 fetcher throw 而 reject，以及 `dockerworld:fingerprintsEqual` 比較唔理次序兼將格式錯嘅輸入當成空 fingerprint 而唔會 throw。`dockerWorldBridge.test.ts` 證八個 invoke 全部用確切嘅 channel 同參數形狀，而個事件 listener 會轉發 `dockerworld:event` 兼淨係移除自己嗰個 listener。`DockerWorldSourcePanel.test.ts` 證已 mount 嘅選擇器收到真實嘅 container/volume/mount 資料、一次 live fetch 喺攞到即時明確確認之前會被拒而且一次嘗試之後就消耗咗佢、一個 volume 老實噉報 null fingerprint、真實進度事件 render 得到而取消去到 active id。至於 policy inventory，就證呢個介面嘅搜尋開得到 anchored 完整 regex builder、佢個 AppearanceTarget 提供得到可搜尋嘅 context menu 同編輯器、目的地喺 PathField inventory 之內、overlay 有界、copy 事實喺每個 funny level 都守得住，以及嗰條唯讀／只加路徑明確記錄為非破壞性。

喺 `design/` 度行 `npx vitest run packages/app/src/main/dockerworld` 就跑到。

**呢一輪冇對住真實 source 驗證過。** 部主機有 Docker Desktop client 29.6.1，但佢個 `desktop-linux` daemon pipe 唔存在：`docker version` 回咗個真 client 加 `Server: null`，跟住 `docker ps` 喺 `npipe:////./pipe/dockerDesktopLinuxEngine` 失敗。列唔到任何真實 container、volume 或者 mount，所以冇模擬過亦冇聲稱過任何 runtime fetch。一個真實嘅 Docker Desktop VM 路徑 bind mount，同埋一部經 SSH 嘅真實遠端主機，一樣仲未驗證。嗰個平價嘅隱藏 UI 證明係另外驗證咗真實砌出嚟嘅面板同 daemon 冧咗嘅指引，唔係一次成功嘅 source 複製。

### 相關閱讀

- [Running the engine on this computer, or in a container](./docker-and-local.md) — *render* 走嘅 Docker 路徑，包括 `dockerworld/` 自己啲 host 路徑檢查所參照嘅 mount 規則。
- [Rendering on a remote host](./remote-render.md) — 呢個 module 重用而唔係重新實作嘅 SSH primitive（`CommandRunner`、`FileTransfer`、`chooseTransfer`）。
- [Worlds from somebody else's release](./world-sources.md) — 另一個輸入側世界源，同埋本文為同樣理由講嘅「完全整好、但仲未接落 UI」缺口。
- [Scheduled re-rendering](./scheduled-render.md) — `dockerWorldFingerprint` 刻意*唔*接落去嘅 GitHub Actions lane，同埋點解：GitHub 主機嘅 runner 冇路徑掂到本機 Docker daemon。
- [Worlds hosted on your own SSH server](./ssh-world-sources.md) — 另一個本機掂得到、排程 render 形狀嘅變更檢查（`surveyRemoteWorld`/`diffRemoteWorldSurveys`），佢同 GitHub Actions lane 之間帶住一模一樣嘅結構性缺口。
- [Backing up a world or a rendered map](./backup.md) — 點解呢個 project 從來唔會用 Git LFS，包括用嚟存個世界本身。
