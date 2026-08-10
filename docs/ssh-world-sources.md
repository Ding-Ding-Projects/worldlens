# Worlds hosted on your own SSH server

A world does not have to be zipped up, uploaded and re-downloaded every time it changes. If it
already lives on a machine you own — a home server, a VPS, a Windows box running a Minecraft
server — and that machine answers SSH, this reads the world from where it already is.

This is the read side. [Rendering on a remote host](./remote-render.md) is the other
direction — sending a render _to_ a machine over SSH — and both share the same connection,
host-key and transfer code in `main/remote/`. This feature adds nothing new to that trust
model; it reuses it.

**Contents**

- [What it does](#what-it-does)
- [Linux and Windows, one honest difference](#linux-and-windows-one-honest-difference)
- [The host key is a decision, not a default](#the-host-key-is-a-decision-not-a-default)
- [The cheap change check](#the-cheap-change-check)
- [Failure modes](#failure-modes)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Related reading](#related-reading)

## What it does

```
1  connect       ssh, with the host key checked exactly as a remote render checks it
2  detect        which kind of shell answered - POSIX, Windows, or genuinely unknown
3  check path    the given remote path, read in that host's own grammar
4  transfer      rsync where both ends have it, scp everywhere else - and it says which
```

Nothing is written to the remote host at any point. This is a read, and only a read: no
staging directory is created there, nothing is deleted, and a failure at any stage leaves the
remote host exactly as it was found.

## Linux and Windows, one honest difference

A Linux host very likely has `rsync`, and the existing `chooseTransfer` machinery already
prefers it: an interrupted fetch of a world's tens of thousands of small region files resumes
from where it stopped rather than starting the whole world over.

A Windows host very likely does **not** have `rsync` — it does not ship with Windows and is
rarely installed there — so the transfer falls back to `scp`, exactly as it already does for
any host missing either end of the pair, and says so in the message it returns:

> Sending with scp, because renderer@host has no rsync. scp cannot carry a partial file on, so
> a transfer that is interrupted starts that file again from the beginning.

Nothing new was built for that fallback; it is `main/remote/rsync.ts`'s own honesty, reused.

What Windows _does_ need that Linux does not is a way to even ask "what kind of host is this"
without knowing in advance which shell answers an SSH command. OpenSSH Server on Windows
defaults its login shell to `cmd.exe`; an administrator can configure it to PowerShell instead.
Writing quoting for "the" Windows shell would mean guessing which of those two a given host
runs — and being wrong about a shell is how a path with a space in it becomes a different
command.

The way out is `-EncodedCommand`: PowerShell's own way of taking a script as Base64 of
UTF-16LE text, with **no quoting step in between**. The remote command line built for a
Windows host is:

```
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand <base64>
```

Base64's alphabet is `A-Za-z0-9+/=` — no space, no quote, no shell metacharacter — so this one
line survives being split on whitespace by `cmd.exe`, by PowerShell itself, or by anything
else that merely tokenises a command line the plain way. The login shell's own quoting dialect
stops mattering, because nothing sent to it ever needs quoting.

Detection itself costs at most two round trips: `uname -s` first, because it is the common
case and answers in one. When that fails with the shell simply not recognising the command —
not a connection failure, a **command** failure, which `ssh`'s own exit code distinguishes —
the PowerShell probe runs next. A host that answers neither is reported as `unknown`, honestly,
and every caller downstream degrades from there: the survey below refuses to guess a shell it
was never shown working.

## The host key is a decision, not a default

Exactly the same rule [remote rendering](./remote-render.md#the-host-key-is-a-decision-not-a-default)
already documents, because it is the same code: `StrictHostKeyChecking=yes`, always. A host
this application has never seen offers its fingerprints for a person to compare against the
machine itself; a host whose key has _changed_ is refused outright, with no button anywhere,
because a rebuilt server and an intercepted connection look identical from here.

## The cheap change check

Reading a world's actual files can be expensive even before a single byte transfers, if the
only way to know whether anything changed is to transfer it. `surveyRemoteWorld` answers that
question for the cost of one remote command: a listing of every file's size and modification
time, `find -printf` on a POSIX host and a `Get-ChildItem` one-liner run through the
PowerShell trick above on a Windows one.

`diffRemoteWorldSurveys` compares two such listings — pure functions, no SSH client, no
network — and says what was added, changed, removed, or left alone. `remoteWorldChanged`
answers the yes/no question a scheduled render actually wants before it does anything else.
All three are exported from `main/remote/worldsource.ts` and `main/remote/index.js`, so a
render that only wants to know "is this worth rendering again" never has to fetch the world to
find out.

## Failure modes

| What happened                                                 | What is reported                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| the host never answers                                        | `unreachable`, the same code an unreachable remote-render target uses            |
| the host key is unknown                                       | `host-key-unknown`, with fingerprints to compare                                 |
| the host key has changed                                      | `host-key-changed`, refused, no button                                           |
| the account is refused                                        | `auth-refused` — this app never offers a password                                |
| the given path is not shaped like a path on the detected host | `invalid-target`, naming the grammar it expected                                 |
| a transfer is interrupted                                     | `transfer-failed`, with whatever `rsync` or `scp` said; nothing local is deleted |
| the person cancelled                                          | `cancelled`, which is not an error                                               |

## Security notes

- **No password, ever.** The SSH options this reuses make the client refuse one even when a
  host offers it — see [remote rendering](./remote-render.md#authentication-keys-only-never-a-password)
  for the exact flags. Authentication is an SSH agent or a named identity file; neither is
  ever read, copied or logged by this application.
- **Nothing is written to the remote host.** No staging directory, no PowerShell script left
  behind — `-EncodedCommand` runs the script and exits; nothing is saved there.
- **The remote path is validated in the grammar its own host actually uses**, not guessed from
  the string. A Windows-shaped path offered against a POSIX host, or the reverse, is refused
  before anything is sent, rather than silently reinterpreted.
- **The app's own `known_hosts`, never the person's.** Exactly the file remote rendering
  already writes, so trusting a host once covers both directions without touching the user's
  own SSH configuration.

## Verification

`design/packages/app/src/main/remote/worldsource.ts`, `windowsShell.ts`, and
`design/packages/app/src/main/worldsource/sshFetcher.ts` / `sshIpc.ts` have **64 main-process
tests**, all of them against fake SSH and process runners. The reachable wizard path adds
**15 focused UI/preload tests** (three renderer seam/likelihood tests, two mounted guided-flow
tests, and the existing ten preload channel tests):

| File                                   | What it proves                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `windowsShell.test.ts`                 | PowerShell single-quote escaping, Base64 round-trips, and that the encoded form contains no shell metacharacter                                                                                                                                                                                                                                            |
| `worldsource.test.ts`                  | host detection (POSIX, Windows, unknown), path grammar per host kind, the POSIX and PowerShell survey parsers, survey diffing, and the full fetch orchestration — an unreachable host, a host-key mismatch, a Windows host falling back to scp, a partial/interrupted transfer, permission denied, an invalid path for the detected host, and cancellation |
| `sshFetcher.test.ts`                   | id assignment, active-fetch tracking, and that cancelling aborts the signal the transfer is actually awaiting                                                                                                                                                                                                                                              |
| `sshIpc.test.ts`                       | the nine channels register and dispose exactly, no handler rejects, and a host key is only ever trusted by re-scanned fingerprint                                                                                                                                                                                                                          |
| `sshWorldSourceBridge.test.ts`         | the renderer resolves the real nested `window.worldlens.sshWorldSource` namespace only when all ten methods exist, and a survey needs both `level.dat` and a real region file before it is called a world                                                                                                                                                  |
| `SshWorldSourcePanel.test.ts`          | mounted unknown-key review, explicit trust, POSIX detection, survey, transfer events, local destination calculation and the final handoff into the ordinary wizard path                                                                                                                                                                                    |
| `preload/sshWorldSourceBridge.test.ts` | all nine invoke channels and the event listener keep the exact positional shape the main-process handlers read                                                                                                                                                                                                                                             |

Run them with `npx vitest run packages/app` from `design/`.

**Not yet run against a real host of either kind.** Every scenario above — including the
Windows detection and survey, and the scp fallback — is proven against fakes that answer
exactly as OpenSSH, PowerShell and `find` are documented to, not against a genuine Windows
OpenSSH server or a real Linux box. The connection, host-key and transfer _code paths_ are the
same ones `remote-render.md` already reports verified against a real Linux host; the
Windows-specific probe and survey scripts in `windowsShell.ts` have not had that same real-host
pass yet.

The desktop application registers this at startup (`startSshWorldSources()` in
`main/index.ts`) and the map wizard's World step now reaches it through
`SshWorldSourcePanel.vue`. The panel deliberately reuses the same saved-target editor and
Explorer-style remote browser as remote rendering: one list of SSH machines, actual directory
data, the same host-key trust store, and the same world-likelihood signals. An unknown key shows
the offered fingerprints and records only the exact one the person reviewed; a changed key stays
refused with no trust action. A surveyed and fetched folder rejoins the existing local-folder
inspection path instead of creating a second kind of wizard world.

The focused UI suite and a real production UI build prove that preload-to-renderer seam and the
mounted interactions. A cheap headless run also opened the built panel at 390 CSS pixels and
200% scale with zero horizontal overflow, viewport escapes, or clipped buttons. The real-host
limitation above still stands: neither a Linux nor Windows host has completed this whole path
through a packaged build yet.

## Related reading

- [Rendering on a remote host](./remote-render.md) — the other direction over the same SSH
  connection, host-key and transfer machinery.
- [Worlds from somebody else's release](./world-sources.md) — a world from a GitHub release
  instead of a machine you run yourself.
- [Rendering a world in GitHub Actions](./render-in-actions.md) — where a scheduled render's
  change detection would use the cheap survey this feature exposes.
- [Renders that survive being interrupted](./resumable-renders.md) — the same "carry on, do
  not restart" promise, for a render on this computer rather than a fetch from one.

## 廣東話

### 放喺你自己 SSH 伺服器嘅世界（Worlds hosted on your own SSH server）

個世界唔使每次改動都壓成 zip、上載完再下載返。如果佢已經喺一部你自己嘅機（屋企 server、VPS、行緊
Minecraft server 嘅 Windows 機）上面，而嗰部機肯應 SSH，噉呢個功能就直接喺原地讀個世界。

呢個係「讀」嗰邊。[Rendering on a remote host](./remote-render.md) 係另一個方向 —— 將一次 render
送去一部機度做 —— 兩邊共用 `main/remote/` 入面同一套連線、host key 同傳送嘅程式碼。呢個功能冇為個
信任模型加任何新嘢，佢係直接重用返。

### 佢做啲乜（What it does）

```
1  connect       ssh, with the host key checked exactly as a remote render checks it
2  detect        which kind of shell answered - POSIX, Windows, or genuinely unknown
3  check path    the given remote path, read in that host's own grammar
4  transfer      rsync where both ends have it, scp everywhere else - and it says which
```

任何時候都唔會寫任何嘢落遠端主機。呢個係讀，而且淨係讀：唔會喺嗰邊開 staging 目錄、唔會刪嘢，任何
一步失敗都會令遠端主機保持搵到佢嗰陣嘅原狀。

### Linux 同 Windows：一個老實嘅分別

Linux 主機好大機會有 `rsync`，而現有嘅 `chooseTransfer` 機制本身就偏向用佢：一個世界有幾萬個細
region 檔，如果攞到一半斷咗，可以由斷咗嗰度續返，唔使成個世界由頭嚟過。

Windows 主機就好大機會**冇** `rsync` —— Windows 唔會自帶，亦好少人裝 —— 所以傳送會退返去用 `scp`，
就好似任何一邊缺咗 rsync 嗰陣一樣，而且佢會喺回傳嘅訊息度講明:

> Sending with scp, because renderer@host has no rsync. scp cannot carry a partial file on, so
> a transfer that is interrupted starts that file again from the beginning.

呢個 fallback 冇新造過任何嘢，係 `main/remote/rsync.ts` 本身嗰份老實，攞嚟重用。

Windows 真係需要而 Linux 唔需要嘅，係一個方法去問「呢部主機係咩類型」，而事前又唔知一條 SSH 指令會
由邊個 shell 應。Windows 上面嘅 OpenSSH Server 預設登入 shell 係 `cmd.exe`；管理員可以改成
PowerShell。如果去寫「嗰個」Windows shell 嘅 quoting，就等於估緊部主機行緊兩者之中邊個 —— 而估錯
shell，就係一條有空格嘅路徑變成另一條指令嘅方法。

出路係 `-EncodedCommand`：PowerShell 自己嘅做法，將 script 用 UTF-16LE 文字嘅 Base64 傳入，**中間
完全冇 quoting 呢一步**。為 Windows 主機砌出嚟嘅遠端指令行係：

```
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand <base64>
```

Base64 嘅字母表係 `A-Za-z0-9+/=` —— 冇空格、冇引號、冇任何 shell metacharacter —— 所以呢一行就算畀
`cmd.exe`、畀 PowerShell 本身、或者畀任何淨係用最普通方式切 token 嘅嘢按空白切開，都一樣生存到。登入
shell 自己嗰套 quoting 方言就唔再重要，因為送畀佢嘅嘢根本冇一樣需要 quote。

偵測本身最多用兩個來回：先試 `uname -s`，因為呢個係常見情況，一次就有答案。當佢失敗，而且係 shell
單純唔識嗰條指令 —— 唔係連線失敗，係**指令**失敗，`ssh` 自己嘅 exit code 分得出 —— 就跟住行
PowerShell 探測。兩樣都唔應嘅主機會老老實實報做 `unknown`，之後每個下游呼叫者都會由嗰度降級：下面講嘅
survey 唔會去估一個從來未見過佢行得通嘅 shell。

### host key 係一個決定，唔係預設值

同 [remote rendering](./remote-render.md#the-host-key-is-a-decision-not-a-default) 已經寫低嘅規則
一模一樣，因為根本係同一份程式碼：永遠 `StrictHostKeyChecking=yes`。呢個應用程式從未見過嘅主機，會將
自己嘅 fingerprints 攞出嚟畀人同部機本身對；如果一部主機嘅 key _變咗_，就直接拒絕，任何地方都冇掣撳，
因為喺呢邊睇，一部重裝過嘅 server 同一條被截取嘅連線係一模一樣。

### 平價嘅改動檢查

如果想知有冇嘢改過嘅唯一方法係將個世界傳晒過嚟，噉就算一個 byte 都未傳，讀一個世界嘅真實檔案都已經好
貴。`surveyRemoteWorld` 用一條遠端指令嘅代價就答到呢條問題：列出每個檔案嘅大細同修改時間，POSIX 主機
用 `find -printf`，Windows 主機就用上面嗰招 PowerShell 行一句 `Get-ChildItem`。

`diffRemoteWorldSurveys` 比較兩份噉嘅清單 —— 純函數，冇 SSH client、冇網絡 —— 講出加咗、改咗、刪咗
定係冇郁過。`remoteWorldChanged` 就答一個排程 render 喺做任何嘢之前真正想知嘅 yes/no 問題。三個都由
`main/remote/worldsource.ts` 同 `main/remote/index.js` 匯出，所以一個淨係想知「值唔值得再 render 多
次」嘅 render，永遠唔使攞成個世界返嚟先知。

### 失敗情況（Failure modes）

原文嗰個表列出七種情況同對應嘅報告：主機完全冇應 → `unreachable`（同遠端 render 目標唔通嗰陣用同一個
code）；host key 未見過 → `host-key-unknown`，連 fingerprints 畀你對；host key 變咗 →
`host-key-changed`，拒絕，冇掣；帳戶被拒 → `auth-refused`，而呢個 app 永遠唔會遞密碼出去；畀嘅路徑
唔似偵測到嗰種主機嘅路徑格式 → `invalid-target`，並講明佢預期嘅 grammar；傳送中途斷咗 →
`transfer-failed`，連 `rsync` 或者 `scp` 講咗乜都照報，而本機嘅嘢一樣都唔會刪；用戶自己取消 →
`cancelled`，呢個唔算錯誤。

### 保安注意（Security notes）

- **永遠冇密碼。** 佢重用嗰套 SSH 選項會令 client 就算主機遞密碼認證出嚟都照拒 —— 確實嘅 flag 睇
  [remote rendering](./remote-render.md#authentication-keys-only-never-a-password)。認證方式係 SSH
  agent 或者一個指名嘅 identity file；兩者呢個應用程式都唔會讀、唔會複製、唔會寫落 log。
- **唔會寫任何嘢落遠端主機。** 冇 staging 目錄，亦唔會遺留 PowerShell script —— `-EncodedCommand`
  行完就退出，嗰邊乜都冇存低。
- **遠端路徑係用嗰部主機自己真正用嗰套 grammar 去驗證**，唔係靠條字串去估。一條 Windows 樣式嘅路徑
  攞去對住 POSIX 主機（或者調轉），會喺送出任何嘢之前就被拒絕，唔會靜靜雞被重新詮釋。
- **用嘅係 app 自己嗰份 `known_hosts`，唔係用戶自己嗰份。** 就係 remote rendering 已經會寫嗰個檔，
  所以信任一部主機一次就兩個方向都掂，亦唔會掂到用戶自己嘅 SSH 設定。

### 驗證（Verification）

`design/packages/app/src/main/remote/worldsource.ts`、`windowsShell.ts`，同
`design/packages/app/src/main/worldsource/sshFetcher.ts` / `sshIpc.ts` 有 **64 個 main-process
測試**，全部係對住假嘅 SSH 同 process runner 行。行得通嗰條 wizard 路徑再加 **15 個聚焦嘅 UI/preload
測試**（三個 renderer seam/likelihood 測試、兩個 mounted guided-flow 測試，加原有嗰十個 preload
channel 測試）。

原文嗰個表逐個檔案講佢證明咗乜：`windowsShell.test.ts` 證 PowerShell 單引號 escaping、Base64 來回
轉換，同埋 encode 完嘅形式冇任何 shell metacharacter；`worldsource.test.ts` 證主機偵測（POSIX、
Windows、unknown）、每種主機嘅路徑 grammar、POSIX 同 PowerShell 兩個 survey parser、survey diff，
再加成個 fetch 流程 —— 唔通嘅主機、host key 唔夾、Windows 主機退返用 scp、傳送傳一半斷、權限被拒、
路徑對唔上偵測到嗰種主機、同埋取消；`sshFetcher.test.ts` 證 id 分配、active-fetch 追蹤，同埋取消嗰陣
真係 abort 到傳送等緊嗰個 signal；`sshIpc.test.ts` 證九條 channel 準確噉註冊同釋放、冇 handler 會
reject，同埋一個 host key 淨係會靠重新掃返嚟嘅 fingerprint 先信；`sshWorldSourceBridge.test.ts` 證
renderer 淨係喺十個方法全部存在嗰陣先解析到真正嵌套嘅 `window.worldlens.sshWorldSource` namespace，
而且一份 survey 要同時有 `level.dat` 同一個真嘅 region 檔先當佢係世界；`SshWorldSourcePanel.test.ts`
證 mounted 之後嘅未知 key 覆檢、明確信任、POSIX 偵測、survey、傳送事件、本機目的地計算，同最後交返落
普通 wizard 路徑；`preload/sshWorldSourceBridge.test.ts` 證九條 invoke channel 同個事件 listener 保持
住 main-process handler 讀嗰個確實嘅參數位置形狀。

喺 `design/` 度用 `npx vitest run packages/app` 行呢啲測試。

**仲未對住任何一種真機行過。** 上面每一個情境 —— 包括 Windows 偵測同 survey，同埋 scp fallback ——
都係對住一啲照 OpenSSH、PowerShell 同 `find` 文件所寫噉去回應嘅假嘢證出嚟，唔係對住真嘅 Windows
OpenSSH server 或者真嘅 Linux 機。連線、host key 同傳送嗰啲 _code path_ 就係 `remote-render.md`
已經報告過對住真 Linux 主機驗證過嗰啲；但 `windowsShell.ts` 入面 Windows 專用嘅探測同 survey script
就仲未過同一關真機測試。

桌面應用程式喺啟動嗰陣註冊呢樣嘢（`main/index.ts` 入面嘅 `startSshWorldSources()`），而地圖 wizard 嘅
World step 而家經 `SshWorldSourcePanel.vue` 去到佢度。呢個 panel 刻意重用同 remote rendering 一樣嘅
saved-target 編輯器同 Explorer 風格嘅遠端瀏覽器：一張 SSH 機器清單、真實目錄資料、同一個 host-key 信任
儲存、同一組 world-likelihood 訊號。未見過嘅 key 會顯示佢遞出嚟嘅 fingerprints，而且淨係記低個人真係
覆檢過嗰一個；變咗嘅 key 就繼續拒絕，冇任何信任動作。survey 同攞落嚟嘅資料夾會歸返落現有嘅本機資料夾
檢查路徑，唔會另外整多一種 wizard 世界。

嗰個聚焦 UI 測試組加一個真正 production UI build，證到 preload 去 renderer 嗰個接口同 mounted 之後嘅
互動。仲有一次平價 headless 執行，喺 390 CSS pixel 闊、200% 縮放之下開過個 build 出嚟嘅 panel，冇橫向
overflow、冇跑出 viewport、亦冇掣被切走。上面講嘅真機限制依然成立：Linux 同 Windows 兩邊都仲未有主機
用打包好嘅 build 行完成條路。

### 相關閱讀（Related reading）

- [Rendering on a remote host](./remote-render.md) —— 用同一套 SSH 連線、host key 同傳送機制嘅另一個
  方向。
- [Worlds from somebody else's release](./world-sources.md) —— 由 GitHub release 攞世界，而唔係由
  一部你自己行嘅機。
- [Rendering a world in GitHub Actions](./render-in-actions.md) —— 排程 render 嘅改動偵測就會用呢個
  功能提供嘅平價 survey。
- [Renders that survive being interrupted](./resumable-renders.md) —— 同一個「續落去，唔好重頭嚟」嘅
  承諾，不過係講喺呢部電腦度 render，而唔係由一部機攞嘢返嚟。
