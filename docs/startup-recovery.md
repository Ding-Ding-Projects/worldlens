# Startup recovery and the Worldlens identity mark

## Behaviour

Worldlens creates a usable window before it initializes optional features. Each startup feature
runs behind its own failure boundary: configuration, dependency discovery, update setup, network
features and ordinary initialization may disable themselves without removing the rest of the app.
The shell shows a persistent, non-modal recovery banner, and the same error enters notification
history so navigating away does not erase it.

Failures that make the ordinary renderer unsafe use a smaller recovery shell instead. Profile
migration collisions or verification failures, preload failures, main-frame load failures,
renderer-process loss, an app-ready rejection and an uncaught startup exception all take this
route. The recovery shell has no preload, no JavaScript and no Node integration. It still provides
working window controls plus **Restart and retry**, **Copy details**, **Export JSON**, and **Export
Markdown** actions.

Startup diagnostics are appended to `startup-diagnostics.jsonl` below the separate `Worldlens
Recovery` application-data folder, not inside the profile being migrated. The current launch and
the bounded recent history are readable through the startup bridge. Copy and export include the
complete cached record, not only the last line.

The Worldlens identity mark is built from `design/brand/worldlens-logo-source.png`. A committed
Sharp-based builder derives the app title-bar and About images, the documentation-site mark and
favicon, a README-sized image, and a Windows ICO containing 16, 20, 24, 32, 40, 48, 64, 128 and
256 pixel entries. Packaging checks that every derivative is current before it runs.

## Configuration

There is no switch that disables recovery. The diagnostic files contain startup facts only and
remain local until a person explicitly copies or exports them. Export offers UTF-8 JSON or
Markdown and opens the operating system's Save dialog.

`--worldlens-startup-probe=<phase>` is a diagnostic smoke-test seam. It can only make the named
phase fail; it never enables a capability, relaxes isolation, skips migration verification, or
changes a security decision. The packaged proof uses
`--worldlens-startup-probe=profile-migration`, which stops before any profile is read or written.

Regenerate brand assets with:

```powershell
corepack pnpm --dir design --filter @worldlens/app brand:build
```

Verify that tracked assets match the source without changing them:

```powershell
corepack pnpm --dir design --filter @worldlens/app brand:build -- --check
```

## Failure modes

- A profile migration collision or verification failure is a hard data-integrity boundary. The
  ordinary shell is not allowed to open writable profile features; the recovery shell opens
  instead and the legacy profile stays unchanged.
- A preload failure never falls back to `nodeIntegration`, disabled isolation, or an un-sandboxed
  renderer. The ordinary window is destroyed and the no-preload recovery shell replaces it.
- A configuration, dependency, update or network feature that throws is recorded and disabled.
  Other independent features continue initializing.
- A main-frame load failure or renderer crash retires the failed window and opens recovery. It is
  not reported as a successful launch.
- A diagnostic write failure cannot hide the original startup error or prevent recovery from
  opening. The in-memory record remains available and the recovery surface reports that durable
  storage failed.
- Restart, export and shell launch actions use single-flight guards. Repeated keyboard submits or
  clicks share the in-progress operation rather than launching or exporting twice.

## Security considerations

The profile recovery directory is separate from both the legacy and current profile roots. Secret
shapes such as GitHub tokens, bearer authorization, token query values, passwords and generic
secret fields are redacted before they reach memory, disk, the renderer, clipboard, or an export.
No diagnostic is transmitted automatically.

The minimal recovery renderer uses `sandbox: true`, `contextIsolation: true`,
`nodeIntegration: false`, and `javascript: false`. Its Content Security Policy denies everything
except its bundled data-image and inline styling. Buttons are ordinary keyboard-operable links to
a private `worldlens-recovery://` action namespace intercepted by the main process; no privileged
object enters the page.

Worldlens remains permanently unsigned. Electron Builder edits Windows resources to apply the
logo and version metadata, while `forceCodeSigning` and `signExecutable` remain disabled. Resource
editing is not signing and makes no publisher-authenticity claim.

## Verification

The focused suite covers all eight startup categories, secret redaction, success isolation,
single-flight launch/retry/export behavior, JSONL persistence, complete JSON and Markdown export,
bridge registration, migration ordering, the no-exit policy, every inventoried startup phase,
renderer/preload/exception signals, recovery CSP and sandbox settings, recovery actions, the
packaged probe, the mounted banner, persistent notification history, and the About logo's semantic
alternative text.

Packaging must additionally prove that:

1. `brand:build -- --check`, app/UI/site typecheck, lint, build and the full test suite pass;
2. the unpacked Windows executable contains the edited Worldlens icon while Authenticode remains
   `NotSigned`;
3. a cheap Lowlevel off-screen launch with the profile-migration probe opens the recovery shell;
4. the capture clearly shows the unique logo, truthful failure, working actions and a usable
   window rather than an exit-only native error; and
5. exact branch CI passes before the phase is merged.

## Suggested reading

- [Migrating to Worldlens](worldlens-migration.md)
- [Automatic dependency provisioning](dependency-provisioning.md)
- [Automatic updates](automatic-updates.md)
- [Notification centre](notification-centre.md)
- [Release workflow security](release-workflow-security.md)

## 廣東話

### 行為（Behaviour）

Worldlens 會喺初始化啲可選功能之前，先整一個用得嘅視窗出嚟。每個啟動功能都行喺自己嘅失敗邊界後面：
configuration、dependency discovery、update setup、network features 同普通初始化，任何一個都可以自己
停用自己，而唔會拆咗個 app 其餘部分。個 shell 會顯示一條常駐、非 modal 嘅 recovery banner，而同一個
錯誤亦都會入埋 notification history，所以就算走去第二版都唔會抹咗佢。

如果個失敗令普通 renderer 唔安全，就會改用一個細啲嘅 recovery shell。profile migration 撞名或者驗證
失敗、preload 失敗、main-frame 載入失敗、renderer process 冇咗、app-ready rejection，同啟動時未被接住
嘅 exception，全部都行呢條路。個 recovery shell 冇 preload、冇 JavaScript、亦冇 Node integration。佢
仍然有得用嘅視窗控制掣，再加 **Restart and retry**、**Copy details**、**Export JSON** 同 **Export
Markdown** 呢幾個動作。

啟動診斷會 append 落 `startup-diagnostics.jsonl`，位置係喺獨立嗰個 `Worldlens Recovery` 應用程式資料
資料夾之下，唔會擺喺正被 migrate 嗰個 profile 入面。今次啟動同有上限嘅近期歷史，都可以經 startup
bridge 讀到。Copy 同 export 會包埋成份 cache 落嚟嘅紀錄，唔係淨係最後嗰行。

Worldlens 嘅識別標記（identity mark）由 `design/brand/worldlens-logo-source.png` 整出嚟。一個已經
commit 咗、用 Sharp 嘅 builder 會衍生出 app title-bar 同 About 用嘅圖、文件網站嘅標記同 favicon、一張
README 尺寸嘅圖，同埋一個包含 16、20、24、32、40、48、64、128 同 256 pixel 項目嘅 Windows ICO。打包
之前會檢查每個衍生檔案係咪最新。

### 設定（Configuration）

冇任何開關可以停用 recovery。啲診斷檔淨係載住啟動嘅事實，而且會一直留喺本機，直到有人明確噉去 copy
或者 export 佢。Export 提供 UTF-8 JSON 或者 Markdown，並且會開作業系統嘅 Save 對話框。

`--worldlens-startup-probe=<phase>` 係一個診斷用嘅 smoke-test 接口。佢淨係做到令指名嗰個 phase 失敗；
佢永遠唔會啟用任何功能、唔會放寬 isolation、唔會跳過 migration 驗證、亦唔會改任何保安決定。打包時嘅
證明用嘅係 `--worldlens-startup-probe=profile-migration`，佢會喺讀或者寫任何 profile 之前就停低。

重新產生 brand assets：

```powershell
corepack pnpm --dir design --filter @worldlens/app brand:build
```

喺唔改動嘅前提下驗證已追蹤嘅 assets 同原始檔一致：

```powershell
corepack pnpm --dir design --filter @worldlens/app brand:build -- --check
```

### 失敗情況（Failure modes）

- profile migration 撞名或者驗證失敗，係一條硬性嘅資料完整性邊界。普通 shell 唔准開任何可寫 profile
  功能；改為開 recovery shell，而舊嗰個 profile 保持原封不動。
- preload 失敗永遠唔會退返去用 `nodeIntegration`、關咗 isolation、或者冇 sandbox 嘅 renderer。個普通
  視窗會被銷毀，由冇 preload 嘅 recovery shell 頂上。
- configuration、dependency、update 或者 network 功能掟錯，會被記低同停用。其他獨立功能會繼續初始化。
- main-frame 載入失敗或者 renderer crash，會退役咗嗰個失敗嘅視窗再開 recovery。呢啲唔會當成功啟動報。
- 診斷寫入失敗唔可以掩蓋原本嗰個啟動錯誤，亦唔可以阻止 recovery 開出嚟。記憶體入面嗰份紀錄依然攞到，
  而 recovery 介面會報告持久儲存失敗咗。
- Restart、export 同開 shell 呢啲動作用 single-flight 守衛。連續撳鍵盤提交或者連環撳掣，會共用緊行緊
  嗰次操作，唔會啟動兩次或者 export 兩次。

### 保安考慮（Security considerations）

profile recovery 目錄同舊嘅、現行嘅 profile root 都係分開嘅。GitHub token、bearer authorization、
token query 值、密碼同一般 secret 欄位呢啲 secret 形狀，會喺入到記憶體、磁碟、renderer、剪貼簿或者
export 之前就被遮蔽。冇任何診斷會自動傳送出去。

最簡嘅 recovery renderer 用 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false` 同
`javascript: false`。佢嘅 Content Security Policy 除咗自己 bundle 咗嘅 data-image 同 inline styling
之外，其他全部拒絕。啲掣係普通、用鍵盤操作到嘅連結，指向一個私有嘅 `worldlens-recovery://` 動作
namespace，由主行程攔截；冇任何有特權嘅物件會入到個頁面。

Worldlens 永遠都係未簽名（unsigned）。Electron Builder 會改 Windows 資源去套用 logo 同版本 metadata，
而 `forceCodeSigning` 同 `signExecutable` 就保持停用。改資源唔等於簽名，亦冇對發佈者真確性作出任何
聲稱。

### 驗證（Verification）

聚焦測試組涵蓋全部八個啟動類別、secret 遮蔽、成功情況嘅隔離、single-flight 嘅啟動/重試/export 行為、
JSONL 持久化、完整嘅 JSON 同 Markdown export、bridge 註冊、migration 次序、no-exit 政策、每一個列冊
咗嘅啟動 phase、renderer/preload/exception 訊號、recovery 嘅 CSP 同 sandbox 設定、recovery 動作、打包
版嘅 probe、mounted 嘅 banner、常駐 notification history，同埋 About logo 嘅語意替代文字。

打包仲要額外證明：

1. `brand:build -- --check`、app/UI/site 嘅 typecheck、lint、build 同成套測試都過到;
2. 未打包嘅 Windows 執行檔含住改咗嘅 Worldlens icon，而 Authenticode 仍然係 `NotSigned`;
3. 用 profile-migration probe 做一次平價嘅 Lowlevel off-screen 啟動，會開到 recovery shell;
4. 截圖清楚見到獨有嘅 logo、老實嘅失敗訊息、可用嘅動作，同一個用得嘅視窗，而唔係一個淨係得退出嘅原生
   錯誤框；同埋
5. 呢個 phase 合併之前，準確嗰條 branch 嘅 CI 要過。

### 建議閱讀（Suggested reading）

- [Migrating to Worldlens](worldlens-migration.md)
- [Automatic dependency provisioning](dependency-provisioning.md)
- [Automatic updates](automatic-updates.md)
- [Notification centre](notification-centre.md)
- [Release workflow security](release-workflow-security.md)
