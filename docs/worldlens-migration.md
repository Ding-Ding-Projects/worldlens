# Migrating from Material BlueMap to Worldlens

Worldlens is the new product and package identity. It remains a from-scratch TypeScript port of
[BlueMap](https://github.com/BlueMap-Minecraft/BlueMap); BlueMap is the upstream renderer and
viewer project, and this project does not claim that name or erase that credit.

![The packaged Worldlens profile-migration dialog, headed Bring your existing profile to Worldlens? It says Worldlens found data from Material BlueMap, lists what would be copied and verified - consent record, settings, GitHub credential references, projects, histories, cache and maps - states that the old profile stays in place so the copy can be retried or rolled back, names both folders, and offers Copy and verify or Not now](./screenshots/worldlens-profile-migration-consent.png)

## Behaviour

The first Worldlens launch looks for the legacy Windows profile at
`%APPDATA%\@material-bluemap\app`. When it exists, the app asks once before copying anything.
Acceptance copies through a staging directory, verifies every legacy file by SHA-256, writes a
receipt, activates `%APPDATA%\Worldlens`, and verifies it again. The legacy profile is retained.
Declining is remembered without nagging; retry remains an explicit action.

Before the existing Worldlens root can be renamed, migration writes and flushes
`%APPDATA%\.worldlens-profile-migration-transaction.json`. The journal records the exact source,
staging, current, backup and failed paths; both source and pre-existing-current manifests; and the durable phase. Every
startup recovers that transaction before reading a success receipt: a completed activation is
verified and finalized, while a partial or failed activation restores the retained current root
and quarantines partial staging. A crash cannot turn a Worldlens-only file into an unreachable
backup that the next launch ignores.

The desktop process owns a single-instance lock before migration starts. Migration also rejects a
legacy or current root that is itself a symbolic link, junction, reparse indirection, or resolves
outside the application-data root. Collision keys use Windows case-insensitive semantics even in
cross-platform tests, so `Settings.json` and `settings.json` stop before either root changes. The
exact current manifest is checked again after staging and immediately before its atomic rename;
any concurrent addition, removal, or content change aborts cutover, leaves the changed current root
active, retains the legacy root, and quarantines staging for inspection.

Renderer and documentation-site preferences migrate before stores hydrate. A current Worldlens
value wins when both namespaces exist; otherwise the legacy value is copied to the new key. Old
cells remain for rollback. Legacy appearance files remain importable, while new exports use only
the Worldlens format.

World/project repository adapters read both generations during the compatibility window:

| Surface                 | Current write                                                  | Legacy read                                             |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| Project file            | `worldlens.project.json`, schema `worldlens.project`, format 2 | `material-bluemap.project.json`, format 1               |
| CI ownership marker     | `.worldlens-ci.json`, tool `worldlens`                         | `.material-bluemap-ci.json`, tool `material-bluemap`    |
| World-repository marker | `.worldlens-world.json`, tool `worldlens`                      | `.material-bluemap-world.json`, tool `material-bluemap` |
| Published-map marker    | `.worldlens-map.json`, tool `worldlens`                        | `.material-bluemap-map.json`, tool `material-bluemap`   |

Unknown project fields survive parse and serialization. New writes use only current identifiers.

Encrypted private-render payloads follow the same rule: new opaque ids and AES-GCM associated
data use `worldlens/private-transport`; the opener recognizes the prior
`material-bluemap/private-transport` generation when its legacy manifest is present. Sealing and
workflow id output never create another legacy payload.

## Configuration

Runtime environment variables use the `WORLDLENS_` prefix. Existing
`MATERIAL_BLUEMAP_` update-feed, GitHub-client, and download-consent variables remain readable;
when both names are set, the Worldlens value wins.

Packaged bridge builds carry both release repositories. The Worldlens feed is tried first and the
former repository is a bounded fallback until this profile has actually downloaded from the
Worldlens feed. The repository-and-channel identity pair is persisted atomically without the
installed version that appears at the end of the feed URL; build 101 therefore retains a
confirmation written by build 100. Changing repository, architecture, or channel invalidates the
confirmation. This prevents later launches from depending on the former repository or on a
repository-rename redirect. See
[Automatic updates](./automatic-updates.md) for the unverified three-version runtime boundary.

The **Product display name** setting is cosmetic. It changes the title bar, About/version line,
notification titles, and introductions. It never changes the data directory, app/package id,
installer name, update feed, schema, markers, diagnostics product name, or repository identity.

## Repository rename finalization

Current live repository, Pages, policy and legal references retain their reachable pre-rename
addresses until the repository rename succeeds. The committed finalizer makes the rename-time
switch deterministic instead of relying on a manual search-and-replace:

```powershell
node scripts/finalize-worldlens-repository.mjs --check-ready
node scripts/finalize-worldlens-repository.mjs --apply
node scripts/finalize-worldlens-repository.mjs --verify-final
```

`--check-ready` verifies the exact old value and occurrence count in every inventoried file
without writing anything. `--apply` preflights the complete inventory before staging same-folder
replacements, installs all 17 targets, and verifies every final Worldlens value. The expanded
inventory includes the desktop crash-report destination, every current Pages repository/base/clone
source, the compact-proof target, and both generated changelog link owners alongside the original
README, contributor, policy, legal and standalone-builder surfaces. Installation
and verification form the rollback transaction: any failure before the explicit committed state
restores every original file byte-for-byte. Backup cleanup starts only after that commit boundary
and is not allowed to enter rollback. If cleanup fails, every finalized target stays in place,
undeleted backups are retained, and the error lists the exact paths to review and remove manually.
Commit the 17-file switch as one changeset, and run it only after the repository rename lands.
`--verify-final` is the post-switch CI guard. Historical changelog entries, release and issue
prose, compatibility readers and archived decisions are deliberately outside this
current-reference switch; only their current link owner changes where the generated changelog must
keep navigation live.

The executable filesystem integration matrix synthesizes the exact pre-cutover form of all 17
inventoried files from the committed replacement contract. It therefore remains executable both
before and after the real repository has been finalized, and proves read-only readiness by hash
and timestamp, normal apply plus verification,
exact rollback during installation, exact rollback after verification, and committed cleanup
failure after one backup has already been removed. Faults enter through an import-only test hook;
the production command has no fault flag or environment-variable switch. A separate residual test
accepts only a wholly ready or wholly finalized inventory and deliberately finalizes one fixture
inside an otherwise ready set to prove that a mixed cutover is rejected.

Worldlens is free software and has no payment, donation, review, or upgrade nags. People who want
to support the renderer this port builds on should support the BlueMap project directly.

## Failure modes

- A divergent file present in both old and new profile roots stops migration and lists only the
  colliding relative paths; neither root is replaced.
- A corrupt consent record or migration receipt is refused instead of guessed.
- An interrupted staging directory is quarantined and rebuilt from retained source data.
- A post-activation verification failure moves the failed target aside and restores the previous
  Worldlens root when one existed.
- A crash before or after backup rename, receipt write, staging activation, verification or
  rollback is recovered from the durable transaction before the app reads the profile.
- A blocked or full browser-storage implementation leaves legacy settings intact for a future
  retry; it never prevents the app or site from starting.

## Security considerations

Migration refuses symbolic links and unsupported filesystem entries so copying cannot leave the
profile root. Credentials remain encrypted or referenced exactly as stored; migration never
prints or returns their values. Receipt and consent writes are staged, flushed, and renamed.

Worldlens Windows artifacts are intentionally unsigned. Packaging fixes `forceCodeSigning`,
`signExecutable`, and `signAndEditExecutable` to `false`, clears inherited signing inputs, and
sets `CSC_IDENTITY_AUTO_DISCOVERY=false`. A resource-only `rcedit` hook preserves the tracked icon
and Windows version metadata without entering electron-builder's signer/editor path. CI recursively
requires `Get-AuthenticodeSignature` to report `NotSigned` for every emitted executable, including
the Squirrel installer; any signer invocation or signed output blocks publication.
HTTPS authenticates the contacted host and protects transport; feed metadata and package hashes
detect bytes that differ from what that host advertised. Because packages are intentionally
unsigned, neither mechanism authenticates the publisher or author. See
[Automatic updates](./automatic-updates.md).

## Verification

Unit coverage exercises old-only, new-only, disjoint merge, divergent and case-only collision,
linked-root escape refusal, concurrent-current-write refusal, denial/retry, corrupt records,
partial staging, rollback, idempotence, legacy/current marker precedence,
schema adaptation, unknown-field preservation, preference migration, and environment aliases.
The migration matrix also injects ordinary failures and simulated process crashes before and
after backup rename, receipt write, staging activation, verification and rollback, then retries
from the retained legacy and current roots.

The packaged Windows app was launched on an off-screen desktop and the real native migration
consent dialog was captured without moving the visible cursor, keyboard focus, or foreground
window. The dialog names the legacy and current profile folders without exposing an absolute
user-profile path.

A copy of the actual legacy profile on the development machine was migrated in an isolated
scratch root: 885 files and 347,197,060 bytes copied, the source digest stayed unchanged, the
target matched every legacy file byte-for-byte, the receipt was present, and the old copy
remained. The scratch copy was deleted afterwards; the real profile was never modified.

## Suggested articles

- [Automatic updates](./automatic-updates.md)
- [Appearance editors](./appearance-editors.md)
- [Editing a project](./project-editor.md)
- [Adopting a prepared repository](./repository-adoption.md)

## 廣東話

### 概述：由 Material BlueMap 遷移去 Worldlens（Migrating from Material BlueMap to Worldlens）

Worldlens 係新嘅產品同 package 身份。佢依然係 [BlueMap](https://github.com/BlueMap-Minecraft/BlueMap) 嘅一個由零開始寫嘅 TypeScript port；BlueMap 係上游嘅 renderer 同 viewer project，呢個 project 冇認頭嗰個名，亦冇抹走嗰份 credit。文件開頭有一張打包版 Worldlens profile 遷移對話框嘅截圖：佢話 Worldlens 搵到 Material BlueMap 嘅資料，列出會複製同驗證嘅嘢——consent record、settings、GitHub credential reference、projects、histories、cache 同 maps——講明個舊 profile 會原封不動留低，可以重試或者 roll back，列出兩個資料夾，並且提供「Copy and verify」同「Not now」兩個選擇。

### 行為（Behaviour）

Worldlens 第一次啟動會喺 `%APPDATA%\@material-bluemap\app` 度搵舊嘅 Windows profile。搵到嘅話，個 app 會問一次先，先至複製任何嘢。答應嘅話，會經一個 staging 目錄複製，每個舊檔用 SHA-256 驗證，寫一張 receipt，啟用 `%APPDATA%\Worldlens`，然後再驗多一次。個舊 profile 會保留。拒絕嘅話會記住，唔會再煩你；重試永遠係一個明確嘅動作。

現有 Worldlens root 可以改名之前，migration 會寫低並且 flush `%APPDATA%\.worldlens-profile-migration-transaction.json`。呢個 journal 記錄準確嘅 source、staging、current、backup 同 failed path；source 同原有 current 兩份 manifest；仲有 durable phase。每次啟動都會先 recover 呢單 transaction，先至讀 success receipt：完成咗嘅 activation 會驗證同 finalize，而做咗一半或者 fail 咗嘅 activation 會還原保留住嘅 current root，並且將唔完整嘅 staging 隔離。一次 crash 唔可能將一個淨係 Worldlens 有嘅檔，變成一個下次啟動會唔理嘅、攞唔返嘅 backup。

Desktop process 喺 migration 開始之前已經揸住 single-instance lock。Migration 亦會拒絕本身係 symbolic link、junction、reparse indirection，或者 resolve 出 application-data root 以外嘅 legacy 或者 current root。Collision key 用 Windows 唔分大小寫嘅語義，連 cross-platform test 都係，所以 `Settings.json` 同 `settings.json` 會喺任何一個 root 改變之前就停低。準確嘅 current manifest 會喺 staging 之後、atomic rename 之前即刻再檢查一次；任何同時發生嘅加、減或者內容改動都會 abort 個 cutover，keep 住改咗嘅 current root 做 active，保留 legacy root，並且將 staging 隔離畀人檢查。

Renderer 同 documentation-site 嘅 preference 會喺啲 store hydrate 之前遷移。兩個 namespace 都有值嗰陣，current Worldlens 嗰個贏；唔係嘅話，legacy 值會複製去新 key。舊 cell 留低方便 rollback。舊 appearance 檔照樣 import 到，但係新 export 淨係用 Worldlens 格式。

World/project repository adapter 喺兼容期內兩代都讀。四個 surface 各有 current write 同 legacy read：project file 而家寫 `worldlens.project.json`（schema `worldlens.project`，format 2），舊嘅係 `material-bluemap.project.json`（format 1）；CI ownership marker 而家係 `.worldlens-ci.json`（tool `worldlens`），舊嘅係 `.material-bluemap-ci.json`（tool `material-bluemap`）；world-repository marker 而家係 `.worldlens-world.json`，舊嘅係 `.material-bluemap-world.json`；published-map marker 而家係 `.worldlens-map.json`，舊嘅係 `.material-bluemap-map.json`。未識嘅 project field 經 parse 同 serialize 都會保留。新寫嘅嘢淨係用 current identifier。

加密嘅 private-render payload 跟同一條規則：新嘅 opaque id 同 AES-GCM associated data 用 `worldlens/private-transport`；個 opener 見到 legacy manifest 喺度嗰陣，識得認之前嘅 `material-bluemap/private-transport` 世代。Sealing 同 workflow id output 永遠唔會再產生多一個 legacy payload。

### 配置（Configuration）

Runtime 環境變數用 `WORLDLENS_` prefix。現有 `MATERIAL_BLUEMAP_` 嘅 update-feed、GitHub-client 同 download-consent 變數照樣讀得到；兩個名都設咗嗰陣，Worldlens 嗰個贏。

打包嘅 bridge build 帶住兩個 release repository。會先試 Worldlens feed，而舊 repository 係一個有限度嘅 fallback，直至呢個 profile 真係由 Worldlens feed 下載過為止。Repository 加 channel 呢對身份會 atomic 咁 persist，但係唔包 feed URL 尾嗰個 installed version；所以 build 101 會保留 build 100 寫低嘅 confirmation。改 repository、architecture 或者 channel 會令個 confirmation 失效。咁樣就防止之後嘅啟動依賴舊 repository 或者 repository-rename 嘅 redirect。未驗證嘅三個版本 runtime boundary 睇 [Automatic updates](./automatic-updates.md)。

**Product display name** 設定純粹係外觀。佢改 title bar、About/version 嗰行、notification 標題同介紹文字。佢永遠唔會改 data directory、app/package id、installer 名、update feed、schema、markers、diagnostics product name 或者 repository 身份。

### Repository rename 嘅 finalization（Repository rename finalization）

而家 live 嘅 repository、Pages、policy 同 legal reference 會保留 rename 之前仲去得到嘅地址，直到 repository rename 成功為止。Commit 咗嘅 finalizer 令 rename 嗰刻嘅切換變成 deterministic，唔使靠人手 search-and-replace：

```powershell
node scripts/finalize-worldlens-repository.mjs --check-ready
node scripts/finalize-worldlens-repository.mjs --apply
node scripts/finalize-worldlens-repository.mjs --verify-final
```

`--check-ready` 喺唔寫任何嘢嘅情況下，驗證每個 inventoried 檔案入面準確嘅舊值同出現次數。`--apply` 會先 preflight 成個 inventory，先至 stage same-folder replacement，安裝全部 17 個 target，再驗證每個最終 Worldlens 值。擴充咗嘅 inventory 包括 desktop crash-report destination、每個而家嘅 Pages repository/base/clone source、compact-proof target、兩個 generated changelog link owner，加埋原本嘅 README、contributor、policy、legal 同 standalone-builder surface。安裝加驗證構成個 rollback transaction：去到明確嘅 committed state 之前任何 failure，都會將每個原檔 byte-for-byte 還原。Backup cleanup 只會喺過咗 commit boundary 之後先開始，而且唔准入返 rollback。如果 cleanup fail，每個 finalize 咗嘅 target 留返喺度，未刪嘅 backup 保留，個 error 會列出要人手檢查同刪除嘅準確 path。17 個檔嘅切換要 commit 做一個 changeset，而且淨係可以喺 repository rename 落地之後先行。`--verify-final` 係切換之後嘅 CI guard。歷史 changelog entry、release 同 issue 嘅文字、compatibility reader 同 archived decision 刻意唔喺呢個 current-reference 切換範圍之內；淨係 generated changelog 需要保持 navigation live 嗰度，先會改佢哋而家嘅 link owner。

Executable filesystem integration matrix 會由 commit 咗嘅 replacement contract，合成全部 17 個 inventoried 檔案 cutover 之前嘅準確形態。所以無論真 repository finalize 咗未，佢都照樣行到，並且證明：read-only readiness（用 hash 同 timestamp）、正常 apply 加 verification、安裝途中嘅 exact rollback、verification 之後嘅 exact rollback，同埋刪咗一個 backup 之後嘅 committed cleanup failure。Fault 淨係經一個 import-only test hook 入去；production command 冇 fault flag，亦冇環境變數開關。另外有一個 residual test 淨係接受成個 inventory 全部 ready 或者全部 finalized，並且刻意喺一堆 ready fixture 入面 finalize 一個，證明混合嘅 cutover 會被拒絕。

Worldlens 係自由軟件，冇任何付款、捐款、評分或者升級嘅滋擾。想支持呢個 port 建基嘅 renderer 嘅人，應該直接支持 BlueMap project。

### Failure modes

- 新舊兩個 profile root 都有、但係內容唔同嘅檔，會停低 migration，淨係列出相撞嘅 relative path；兩個 root 都唔會被取代。
- 爛咗嘅 consent record 或者 migration receipt 會拒絕，唔會靠估。
- 中斷咗嘅 staging 目錄會隔離，再由保留住嘅 source data 重建。
- Activation 之後驗證 fail，會將 fail 咗嘅 target 移埋一邊，之前有 Worldlens root 嘅話就還原返佢。
- 喺 backup rename、receipt write、staging activation、verification 或者 rollback 之前或者之後 crash，都會喺個 app 讀 profile 之前由 durable transaction recover 返。
- Browser storage 被封鎖或者滿咗，舊 settings 會原封不動留返畀將來重試；永遠唔會阻止個 app 或者個 site 啟動。

### 保安考慮（Security considerations）

Migration 拒絕 symbolic link 同唔支援嘅 filesystem entry，所以複製唔可能走出 profile root。Credentials 保持加密或者按原樣 reference；migration 永遠唔會 print 或者 return 佢哋嘅值。Receipt 同 consent 嘅寫入都係先 stage、flush，再 rename。

Worldlens 嘅 Windows artifact 係刻意唔簽名嘅。Packaging 將 `forceCodeSigning`、`signExecutable` 同 `signAndEditExecutable` fix 做 `false`，清走繼承落嚟嘅 signing input，並且設 `CSC_IDENTITY_AUTO_DISCOVERY=false`。一個 resource-only 嘅 `rcedit` hook 保留 tracked icon 同 Windows version metadata，唔會入 electron-builder 嘅 signer/editor 路徑。CI 遞歸咁要求 `Get-AuthenticodeSignature` 對每個出嘅 executable（包括 Squirrel installer）都報 `NotSigned`；任何 signer invocation 或者簽咗名嘅 output 都會 block publication。HTTPS 認證接觸嗰個 host 同保護 transport；feed metadata 同 package hash 偵測到同嗰個 host 公佈嘅唔同嘅 byte。因為啲 package 係刻意唔簽名，兩個機制都認證唔到 publisher 或者 author。睇 [Automatic updates](./automatic-updates.md)。

### 驗證（Verification）

Unit coverage 覆蓋：只有舊、只有新、disjoint merge、divergent 同 case-only collision、linked-root escape 拒絕、concurrent-current-write 拒絕、拒絕/重試、爛 record、partial staging、rollback、idempotence、legacy/current marker 優先次序、schema adaptation、unknown-field 保留、preference migration，同埋環境變數 alias。Migration matrix 仲會喺 backup rename、receipt write、staging activation、verification 同 rollback 之前同之後，注入普通 failure 同模擬 process crash，然後由保留住嘅 legacy 同 current root 重試。

打包咗嘅 Windows app 喺一個 off-screen desktop 度啟動過，真嘅 native migration consent dialog 喺冇郁過可見 cursor、keyboard focus 或者 foreground window 嘅情況下 capture 咗。個 dialog 列出 legacy 同 current profile 資料夾，冇暴露絕對嘅 user-profile path。

開發機上面真 legacy profile 嘅一個 copy 喺隔離嘅 scratch root 度遷移過：複製咗 885 個檔、347,197,060 byte，source digest 冇變過，target 同每個 legacy 檔 byte-for-byte 一樣，receipt 存在，舊 copy 仲喺度。個 scratch copy 事後刪咗；真 profile 從來冇改過。

### 建議文章（Suggested articles）

- [Automatic updates](./automatic-updates.md)
- [Appearance editors](./appearance-editors.md)
- [Editing a project](./project-editor.md)
- [Adopting a prepared repository](./repository-adoption.md)
