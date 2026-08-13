# The gh command-line tool's own accounts

This application already has its own GitHub sign-in, with its own multi-account store (see the
"Signed-in accounts" section under Settings → GitHub). This document is about a second, completely
separate thing: the accounts the `gh` command-line tool itself is signed in as, on the same
computer.

## Behaviour

### Two stores, never one list

`gh` keeps its own credential store — shared by every terminal, script and other tool on the
machine that shells out to `gh` — under its own control, in its own files. This application's own
account store is a set of encrypted files under the app's own data directory, managed entirely by
the app. The two can disagree at any moment: an account signed in to `gh` may never have touched
this application, an account signed in to this application may never have touched `gh`, and "the
active account" can be a different login in each store at the same time.

Settings → GitHub therefore shows two sections, one below the other, separated by a divider: the
app's own "Signed-in accounts" list, and a second "gh command-line tool accounts" section. The
second section carries its own explainer, in every language mode and at every funny level, saying
plainly that this is a different, separate account book. Nothing merges the two lists, and nothing
in either section reads or writes the other store.

### Listing gh's accounts

The main process (`design/packages/app/src/main/ghcli/accounts.ts`) reads `gh`'s account list
through `gh auth status --json hosts` — a stable, structured route confirmed present on the `gh`
version this feature was built against (2.96.0, July 2026). Unlike the plain-text form of the same
command, the JSON route answers **exit code 0 even when nobody is signed in to anything**; only a
genuinely fatal error makes it fail, so the application never has to guess whether an empty answer
means "nobody is signed in" or "the command itself broke".

When the JSON route cannot be parsed at all, which is what an old `gh` predating `--json` on this
command produces, the list reports `availability: "incompatible"` and names the upgrade route rather
than returning an empty list. There is deliberately no plain-text fallback parser: a format this
application does not understand is never presented as "you have no accounts", because that would be
a claim it has no basis for making, and guessing at prose output is how it would come to make one.

Each account carries: its login, the host it is on (`github.com` or an enterprise host), whether it
is the one `gh` would use right now, its reported scopes (or an honest "not reported by this token"
for a token kind that does not carry a scope list at all), how it was signed in (`tokenSource` —
`keyring`, a plain file, and so on — never the credential itself), its git protocol, and whether
`gh`'s own per-account health check reported anything other than success.

### Installing GitHub CLI from the same screen

When the account probe says `gh` is missing, the account section uses the existing system-dependency
bridge instead of sending somebody elsewhere. It loads the dependency preview, selects only the
registry entry `githubCli`, and shows its resolved package-manager route (currently `winget` package
`GitHub.cli`) plus the registry's exact administrator-permission disclosure before the button is
enabled.

**Install GitHub CLI and check again** is one guarded chain with one operation in flight:

1. Run `installSysdeps(["githubCli"])`, never the other selected dependencies from the full System
   dependencies screen.
2. Render the install event's real stage, message, and determinate percentage when one exists. A
   phase-only event remains indeterminate; the interface never invents a percentage.
3. Accept only an `installed` or `already-installed` outcome that the dependency engine verified.
   If the preview already verified an installed `gh`, skip package-manager mutation entirely.
4. Re-read the real `gh` account state. If `gh` is still unavailable, stop and say so; never pretend
   the installation made anything else possible.

Cancellation follows the stage that owns the work. During installation it calls the existing
`cancelSysdepInstall()` bridge; a cancellation between stages is remembered and prevents the next
stage from beginning, and says that the account list may therefore be out of date.

### Sign-in is a command, not a button

There is no in-app sign-in, and its absence is deliberate. `gh auth login` and `gh auth refresh`
suppress their own approval prompt when they are not attached to a terminal, so spawning either one
from a window prints nothing and then waits forever. A button that appeared to sign somebody in and
then hung would be worse than no button at all.

The section therefore prints the exact command, with a copy control beside it and the **Check
again** action that re-reads `gh` afterwards:

```text
gh auth login --hostname github.com --git-protocol https --scopes repo,workflow,gist,read:org,read:project,project
```

Every scope is named because `gh auth login`'s own default grant is only `repo`, `read:org` and
`gist`. Without `workflow`, the first CI dispatch fails with a permission error that reads like a
missing repository permission rather than a missing scope.

The section still computes, per account, which operation-critical scopes (`repo` for backup and
`workflow` for CI dispatch) are missing, and prints that account's own repair command rather than
a general one:

```text
gh auth refresh --hostname <host> --user <login> --scopes repo,workflow,read:project,project
```

The host and login come from the row, so an enterprise account's repair names that enterprise host.
Nothing is redirected through `github.com`, and enterprise hosts are no longer a special case: what
used to be a github.com-only device flow is now a command that names whichever host the account is
actually on.

Because an unqualified `gh` command runs as whichever account is active, and that is machine-wide,
the section also names the active account in a sentence rather than leaving it to a chip on a row,
and says so plainly when `gh` reports no active account at all.

The whole reason this reads as a reporting surface is that this application holds no GitHub
credential of its own. That arrangement, and what each reported state means, is
[GitHub CLI is required, and it holds the only GitHub credential](./github-cli-requirement.md).

### Switching gh's active account### Switching gh's active account

Pressing "Switch" on a row calls `gh auth switch --hostname <host> --user <login>` — both flags are
always supplied, so the call is never left to `gh`'s own interactive disambiguation prompt, which
this application could not answer anyway.

`gh auth switch`'s own exit code is **never** trusted as proof the switch happened. Immediately
after the command runs, `main/ghcli/accounts.ts` re-reads the whole account list and only reports
success once the requested login is genuinely the active one on that host. A switch that "succeeded"
by exit code but did not actually take is reported as a failure, with `gh`'s own message.

This is disclosed, in words, at the point of switching — not only after. A persistent warning sits
directly above the row actions, visible before the button is ever pressed: switching here changes
`gh`'s active account **for the whole computer** — every terminal, script and other tool that uses
`gh`, not only this application. The warning is a fact and is pinned into every funny level and both
languages by `GHCLIACCOUNTS_FACTS` in `packages/ui/src/copy/surfaces/ghCliAccounts.ts`; the funny
level styles the surrounding voice, never the "whole computer" fact itself. A successful switch's own
confirmation message repeats that machine-wide consequence.

The CI-render upload route applies the same switch automatically when a render was assigned to an
account that is signed in to `gh` but is not active there. It does not restore the previous account
afterwards: `gh auth switch` is a whole-computer choice, and silently switching it back would
contradict the account list's existing contract. The render card says this before the upload starts.
Immediately before every release read, create, or upload, the main process re-reads the signed-in
inventory, switches if needed, and verifies the effective login through
`gh api --hostname <host> user --jq .login`. This last check also catches an environment override
that would make the next command authenticate as somebody other than the selected account.

Release subcommands keep the host through their supported repository grammar:
`gh release create ... --repo <host>/<owner>/<repository>` and the corresponding upload command.
They are never given `--hostname`; unlike `gh api` and `gh auth switch`, `gh release create` and
`gh release upload` do not define that flag.

### Falling back to gh when the app's own sign-in fails

`main/ghcli/routing.ts` gives the rest of the application a shared way to retry a failed GitHub
operation through `gh` when it is safe to do so, rather than a dead end. It is a set of pure
decision functions plus one orchestrator (`routeWithFallback`); nothing in it spawns a process or
sees a token.

- **Only identity, permission or visibility failures are retried.** A 401 (the credential is no
  longer accepted), a 403 that is not a rate limit, a 404 (GitHub's own "either it does not exist
  or you cannot see it" — ambiguous by design, so trying a different credential is the only way to
  tell the two apart), or an explicit missing-scope failure all retry through `gh`. A network
  failure, a rate limit, or a malformed request never retries — every credential on the same network
  would hit those identically, and retrying only doubles the wait before the same answer.
- **A 404-then-success is reported as an access difference, never as "found it after all".** When
  the app's own sign-in gets a 404 and `gh` succeeds at the same operation, the honest reading is
  that the app's account cannot see the thing, not that it was missing — and the result says so in
  those words. A 404-then-404 is reported as genuinely missing instead, because two different
  accounts agreeing is real evidence.
- **A write never runs through a different account than the one selected, without asking first.**
  Reading is low-stakes enough to fall back on automatically. Creating a repository, pushing a
  workflow file, or dispatching a run as an identity nobody chose in the interface is a genuine
  surprise and could put something under the wrong account's name entirely, so `decideWriteRoute`
  refuses to proceed automatically the moment the fallback account differs from the selected one,
  and names both accounts so the interface can ask.
- **Route selection can use known scopes before ever failing.** `chooseAccountForScope` picks
  between two known credentials by which one is already known to hold a required scope, so an
  operation that always needs `workflow` can prefer the account that has it rather than discovering
  the gap by failing first.
- **When both routes fail, both failures are reported, distinctly** — the same side-by-side
  diagnostic value `cirender/transport.ts`'s own `resolveTransport` report already has, never
  collapsed into one generic apology.
- **`gh` not being available is degraded honestly.** When there is no fallback to try at all —
  `gh` is not installed, or has no ready account — the result names that and points at the System
  dependencies section of Settings, rather than promising a retry that cannot happen.

This module is a shared library other GitHub-touching surfaces (CI render, repository bootstrap,
backup) can call into; it does not itself decide when any particular screen should offer a retry.

## Configuration

There is nothing to configure. The section appears automatically inside Settings → GitHub whenever
the preload can list accounts. GUI login is enabled only when the preload exposes the complete
`ghCliStartLogin`, `ghCliCancelLogin`, and `onGhCliLoginState` trio, so an older shell never renders
a half-working sign-in button. The one-click installation path is enabled only when the preload also
exposes `sysdepsPreview`, `installSysdeps`, `cancelSysdepInstall`, and `onSysdepInstallEvent`; an older
or browser-only shell retains the link to the full System dependencies screen instead of drawing a
button that cannot run.

## Failure modes

| Situation                                                                                            | What is shown                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gh` cannot be started at all                                                                        | The resolved `GitHub.cli` installer route, administrator-permission disclosure, and **Install GitHub CLI and check again**. Older shells fall back to the System dependencies link. |
| The installer is cancelled                                                                           | Real cancellation progress followed by a stopped state. The fresh account probe does not begin, and the list is described as possibly out of date.                              |
| The package manager finishes but `gh` verification fails                                             | The real verification failure is shown, and the fresh account probe does not begin.                                                                                             |
| The preview already verifies an installed `gh`                                                       | Package-manager mutation is skipped and the app simply re-probes accounts.                                                                                                      |
| The account read itself throws                                                                       | The raw error plus a sentence saying nothing is known about the sign-in, explicitly not the same as `gh` reporting that nobody is signed in.                                     |
| `gh` is installed but nobody is signed in to it                                                      | `gh`'s own signed-out answer plus the exact `gh auth login` command, with a copy control and **Check again**.                                                                    |
| `gh` answers a shape this build does not recognise (a very old or very new `gh`)                     | "gh answered … in a format this application does not recognise, so its accounts cannot be listed safely." Never reported as zero accounts.                                      |
| An account's token is short a scope this application needs                                           | A warning naming the missing scopes plus that account's own `gh auth refresh` command, carrying its real host and login.                                                         |
| Accounts exist but none of them is active                                                            | Said in words, because an unqualified `gh` command is then unpredictable.                                                                                                       |
| `gh auth switch` reports success but the account did not actually become active                      | Reported as a failure, with `gh`'s own message — never a false "Active" chip.                                                                                                   |
| The selected account is signed in but inactive when a release operation begins                       | The app switches to it with the exact host and login, re-reads the account inventory, verifies the effective API identity, and leaves it active machine-wide.                   |
| The selected account is missing, unhealthy, the switch is refused, or the effective identity differs | The release command is not run. The upload panel names the account and host, says no release data changed, and offers **Open GitHub accounts** beside the failure.              |
| An enterprise host is selected                                                                       | Release commands use `--repo <host>/<owner>/<repository>`; no unsupported `--hostname` flag is added.                                                                           |
| A search matches nothing, while accounts exist                                                       | "Nothing here matches that search. Clearing it brings the whole list back." — distinct from either "installed and signed in as nobody" or "not installed".                      |

## Security considerations

- **The token never crosses this boundary.** `gh auth status --show-token` is never passed, `gh`'s
  credential file is never read directly, and nothing in the account/login IPC channels, progress
  event, or renderer bridge types carries a token field. Every test in
  `main/ghcli/` asserts `--show-token` never appears in a spawned command's arguments.
- **Switching is disclosed, not hidden.** Because `gh auth switch` is genuinely machine-wide, the
  warning above the row actions is treated as safety-critical copy: it is pinned by
  `GHCLIACCOUNTS_FACTS` so no funny level or rewrite can soften "whole computer" away, and it is
  shown before the action is taken as well as confirmed in the result afterward.
- **Sign-in is never driven from here at all.** `gh auth login` and `gh auth refresh` suppress
  their own approval prompt without a terminal, so the application names the command and lets the
  user run it. There is no token route to secure because no token ever enters this application.
- **Environment hygiene still applies to everything that does run.** Account listing, switching and
  every credential-bearing call omit `GH_TOKEN`,
  `GITHUB_TOKEN`, their enterprise variants, `GH_HOST`, and `GH_DEBUG`; `GH_CONFIG_DIR` stays
  inherited because it identifies the user's real gh credential store.
- **The credential-routing fallback never authenticates as an unselected identity for a write.**
  `decideWriteRoute` is the one gate every write-capable caller of `routeWithFallback` goes through;
  it refuses automatically the moment the fallback account differs from the one selected, which is
  the one shape of "silent surprise" this feature could otherwise introduce.
- **Identity is checked at the write boundary, not only at preflight.** Packing thousands of files
  can take hours, during which another terminal can change `gh`'s active account. Every release
  read/create/upload rechecks the selected host and login and stops before mutation on any mismatch.

## Verification

- `design/packages/app/src/main/ghcli/accounts.test.ts` — real captured
  `gh auth status --json hosts` output (multi-account, empty, an unparseable answer reported as
  incompatible rather than as zero accounts, and the switch and sign-out paths re-reading rather
  than trusting an exit code), plus a `--show-token` never-appears check.
- `design/packages/app/src/main/ghcli/routing.test.ts` — 31 tests over the failure classifier, the
  scope-based chooser, the write-route gate, and the full `routeWithFallback` orchestrator (an
  authentication failure that falls back and succeeds; a network error and a rate limit that do not;
  a 404-then-success reported as an access difference; a 404-then-404 reported as genuinely missing;
  a write whose fallback account differs asking rather than proceeding, and one whose account matches
  proceeding; `gh` unavailable degrading honestly; no token-shaped string in any produced message).
- `design/packages/ui/src/components/github/GhCliAccountsList.test.ts` — the reported states, the
  exact sign-in and per-account repair commands, the difference between a failed probe and an empty
  account list, the named active account, and the absence of anything token-shaped.
- `design/packages/app/src/main/ghcli/ipc.test.ts` — channel registration and disposal, and the
  account handlers.
- `design/packages/app/src/main/cirender/gh.test.ts` — a real child-process check proving omitted
  environment names are removed case-insensitively without putting their values in argv.
- `design/packages/ui/src/copy/surfaces/ghCliAccounts.test.ts` — 12 tests over the catalogue's shape
  (five levels, both languages, no em-dashes, no token ever quoted), the funny-level slider actually
  changing the text, the FACTS pin never dropping the "whole computer" warning or the "gh"/"separate"
  two-stores distinction at any level.
- `design/packages/ui/src/components/github/GhCliAccountsList.test.ts` — 19 tests mounting the real
  component against a scripted bridge: every account's host, active chip and permissions render; the
  machine-wide warning is always shown once accounts exist; a missing-scope warning starts the same
  GUI approval flow; the code, URL, countdown, and cancellation render; an unhealthy account is
  marked; switching reports the machine-wide outcome by
  name; a switch that does not take is reported as a failure; all three honest empty/unavailable
  states render their own distinct message; the not-installed state previews the exact route and
  elevation disclosure, selects only `githubCli`, renders real progress, cancels without starting
  login, and skips installation when the preview already verifies `gh`; older shells still reach
  `open-dependencies`; a search with no matches is distinguished from having no accounts at all; the
  two-stores explainer is always present; and nothing token-shaped ever renders.
- `design/packages/app/src/main/cirender/transport.test.ts` — 32 tests, including the exact
  `gh release create` and `gh release upload` argument arrays on github.com and an enterprise host;
  already-active and inactive selected accounts; the machine-wide auto-switch; missing-account,
  refused-switch and effective-identity-mismatch refusals; release-create failure; resume upload;
  and proof that no release command contains the unsupported `--hostname` flag or runs after an
  identity failure.
- `design/packages/ui/src/components/cirender/CiRenderScreen.test.ts` — the route refusal renders
  **Open GitHub accounts** on the same card and returns through the existing Settings action.

The account, login, and transport suites are all local fakes: they never mutate the machine's real
`gh` sign-in and never publish a release. Login asserts the exact `gh auth login` argument array and
asserts the approved token separately on stdin. A real browser approval remains external-account
runtime proof, not a claim made by these tests.

## 廣東話

### `gh` 命令列工具自己嗰批帳戶 (The gh command-line tool's own accounts)

呢個應用程式本身已經有自己嘅 GitHub 登入同自己嘅多帳戶儲存（睇 Settings → GitHub 底下嘅 "Signed-in accounts" 一節）。呢份文件講嘅係第二樣、完全獨立嘅嘢：同一部電腦上面，`gh` 呢個命令列工具自己登入咗嘅帳戶。

### 行為

#### 兩個儲存，永遠唔會併成一條 list

`gh` 有佢自己嘅 credential store，由佢自己掌管、放喺佢自己嘅檔案入面，而且成部機所有 terminal、script 同埋任何會 shell out 去叫 `gh` 嘅工具都共用嗰一份。呢個應用程式自己嘅帳戶儲存，就係 app 自己資料目錄底下一堆加密檔案，全部由 app 管理。呢兩者隨時都可以唔一致：登入咗 `gh` 嘅帳戶可能從來冇掂過呢個 app，登入咗呢個 app 嘅帳戶亦可能從來冇掂過 `gh`，而「而家生效嗰個帳戶」喺兩邊同一時間可以係唔同嘅 login。

所以 Settings → GitHub 分開顯示兩節，一上一下、中間有分隔線：app 自己嘅 "Signed-in accounts" 清單，同埋第二節 "gh command-line tool accounts"。第二節有自己嘅說明文字，喺每個語言模式、每個 funny level 都會直白噉講明呢個係另一本、獨立嘅帳簿。冇任何嘢會將兩張 list 合併，兩節入面亦冇任何嘢會讀或者寫另一邊嘅儲存。

#### 列出 `gh` 嘅帳戶

Main process（`design/packages/app/src/main/ghcli/accounts.ts`）透過 `gh auth status --json hosts` 去讀 `gh` 嘅帳戶清單 —— 呢條係穩定、有結構嘅路徑，喺開發呢個功能時所用嘅 `gh` 版本（2.96.0，2026 年 7 月）確認過存在。同一條指令嘅純文字形式唔同，JSON 呢條路**就算冇人登入任何嘢都照樣回傳 exit code 0**；淨係真正致命嘅錯誤先會令佢失敗，所以 app 永遠唔使去估一個空答案究竟係「冇人登入」定係「條指令本身壞咗」。

如果 JSON 嗰條路完全解析唔到（例如舊版 `gh`，嗰時呢條指令仲未有 `--json`），個清單會報 `availability: "incompatible"` 並指去升級路線，而唔係交一張空清單。呢度有心咁冇純文字後備解析器：一種 app 唔明嘅格式，永遠唔會被呈現成「你冇帳戶」，因為咁講係一個 app 根本冇根據去落嘅斷言，而靠估佢啲散文輸出正正就係會落到咁嘅斷言。

每個帳戶帶住：佢嘅 login、佢喺邊個 host（`github.com` 或者 enterprise host）、佢係咪 `gh` 而家會用嗰個、佢報稱嘅 scopes（如果係一種根本唔帶 scope 清單嘅 token，就老實噉寫「呢個 token 冇報 scope」）、佢係點樣登入嘅（`tokenSource` —— `keyring`、純檔案等等，**永遠唔會**係 credential 本身）、佢嘅 git protocol，同埋 `gh` 自己嗰個逐帳戶健康檢查有冇報返任何唔係成功嘅嘢。

#### 喺同一個畫面安裝 GitHub CLI

探測話 `gh` 唔喺度嗰陣，帳戶區會用返現有嘅系統依賴橋接，唔會叫你去第二度。佢載入依賴預覽、只揀
`githubCli` 一項，顯示解析到嘅套件管理器路線（而家係 `winget` 套件 `GitHub.cli`）同埋清單入面確切嘅
管理員權限披露，之後粒掣先至可以撳。

**安裝 GitHub CLI 再檢查** 係一條有守衛、同一時間只做一件事嘅鏈：只跑 `installSysdeps(["githubCli"])`、
只顯示真實階段同百分比、只接受依賴引擎驗證過嘅 `installed` 或 `already-installed`、然後重新讀一次
`gh` 嘅真實帳戶狀態。取消由擁有嗰步嘅階段處理，並且會講明帳戶列表可能因此唔係最新。

#### 登入係一句指令，唔係一粒掣

呢度冇程式內登入，而且係有心咁冇。`gh auth login` 同 `gh auth refresh` 冇連住 terminal 就會收起自己
個批准提示，喺視窗度開只會乜都唔印、然後永遠等落去。一粒睇落似登入、實際上吊死嘅掣，仲衰過冇掣。

所以帳戶區直接印出確切指令，隔籬有複製掣，行完之後撳「再檢查」：

```text
gh auth login --hostname github.com --git-protocol https --scopes repo,workflow,gist,read:org,read:project,project
```

每個 scope 都寫出嚟，因為 `gh auth login` 自己預設只授 `repo`、`read:org`、`gist`；冇咗 `workflow`，
第一次 CI dispatch 會撞到一個似「冇 repository 權限」嘅錯，其實係少咗 scope。

每個帳戶欠邊個關鍵 scope（`repo` 用嚟備份、`workflow` 用嚟 dispatch CI）照計，並且印出屬於嗰個帳戶
自己嘅修復指令：

```text
gh auth refresh --hostname <host> --user <login> --scopes repo,workflow,read:project,project
```

host 同 login 由嗰一行嚟，所以企業帳戶會寫返自己嗰個企業主機，唔會被送去 `github.com`。同時，因為
冇指名帳戶嘅 `gh` 指令會用生效嗰個、而生效係成部電腦通用，帳戶區會用一句說話講明邊個生效；`gh` 話
冇生效帳戶都會照講。

#### 切換 `gh` 嘅生效帳戶#### 切換 `gh` 嘅生效帳戶

喺某一行撳 "Switch" 會叫 `gh auth switch --hostname <host> --user <login>` —— 兩個 flag 一定齊齊畀，噉就唔會落入 `gh` 自己嗰個互動式釐清提示（反正呢個 app 都答唔到）。

`gh auth switch` 自己嘅 exit code **永遠**唔會當成切換成功嘅證據。指令一行完，`main/ghcli/accounts.ts` 就會重新讀成張帳戶清單，要確認你要求嗰個 login 喺嗰個 host 上面真係生效咗，先會報成功。Exit code 話「成功」但其實冇生效嘅切換，會當成失敗報，並且附上 `gh` 自己嘅訊息。

呢件事係喺切換嗰一刻用文字講明，唔係事後先講。行動作上方長期擺住一個警告，撳掣之前就已經睇到：喺呢度切換會改變 `gh` **成部電腦**嘅生效帳戶 —— 所有 terminal、script 同其他用 `gh` 嘅工具都會受影響，唔淨止呢個 app。呢個警告係一項事實，由 `packages/ui/src/copy/surfaces/ghCliAccounts.ts` 入面嘅 `GHCLIACCOUNTS_FACTS` 釘死喺每一個 funny level 同兩種語言；funny level 只影響周圍嗰把聲嘅風格，永遠郁唔到「成部電腦」呢個事實本身。切換成功之後嘅確認訊息，都會再講一次呢個全機層面嘅後果。

CI-render 嘅上載路徑亦會自動做同一個切換：當某次 render 指派畀一個已經登入 `gh`、但喺嗰邊唔係生效嘅帳戶。做完之後佢**唔會**還原之前嗰個帳戶：`gh auth switch` 本身就係全機決定，靜靜哋切返轉頭會同帳戶清單既有嘅承諾自相矛盾。Render card 會喺上載開始之前講明呢點。每一次 release 嘅讀取、建立或者上載之前，main process 都會即刻重新讀一次已登入清單、需要就切換、再用 `gh api --hostname <host> user --jq .login` 核實實際生效嘅 login。最後呢個檢查同時捉到一種環境覆寫 —— 佢會令下一條指令用咗一個唔係你所揀嘅帳戶去認證。

Release 相關嘅 subcommand 用佢哋支援嘅 repository 文法去帶住個 host：`gh release create ... --repo <host>/<owner>/<repository>` 同對應嘅上載指令。佢哋永遠唔會收到 `--hostname`；同 `gh api` 及 `gh auth switch` 唔同，`gh release create` 同 `gh release upload` 根本冇定義過嗰個 flag。

#### App 自己嘅登入失敗嗰陣退返去用 `gh`

`main/ghcli/routing.ts` 畀應用程式其餘部分一個共用做法：喺安全嘅前提下，將一個失敗咗嘅 GitHub 操作經 `gh` 重試，而唔係就噉行到掘頭路。佢係一組純決策 function 加一個 orchestrator（`routeWithFallback`）；入面冇任何嘢會 spawn process，亦冇任何嘢見得到 token。

- **只有身分、權限或者可見性嘅失敗先會重試。** 401（credential 唔再被接受）、唔係 rate limit 嘅 403、404（GitHub 自己嗰句「唔係唔存在就係你睇唔到」，設計上就係含糊，所以換個 credential 試係唯一分得出嘅方法），或者明確嘅缺 scope 失敗，全部都會經 `gh` 重試。網絡失敗、rate limit、格式錯嘅請求就永遠唔重試 —— 同一個網絡上面每一個 credential 都會撞到一模一樣嘅結果，重試只會令你等多一倍時間去攞返同一個答案。
- **404 之後成功，會報成「存取權差異」，唔會報成「其實搵到咗」。** 當 app 自己嘅登入攞到 404，而 `gh` 做同一個操作成功，老實嘅解讀係 app 嗰個帳戶睇唔到嗰樣嘢，而唔係嗰樣嘢唔存在 —— 結果亦係用呢啲字去講。404 之後又 404 就會報成真係唔見咗，因為兩個唔同帳戶講同一件事，係真正嘅證據。
- **寫入操作唔會喺冇問過之前用一個唔係你所揀嘅帳戶去執行。** 讀取風險夠低，所以可以自動 fallback。但用一個冇人喺介面揀過嘅身分去建立 repository、推 workflow 檔案或者 dispatch 一個 run，就係真正嘅意外，仲可能將啲嘢完全掛咗喺錯嘅帳戶名下；所以一發現 fallback 帳戶同揀咗嗰個唔同，`decideWriteRoute` 就拒絕自動進行，並且將兩個帳戶名都講出嚟，等介面可以去問。
- **路由選擇可以喺未失敗之前就用已知 scope 判斷。** `chooseAccountForScope` 會喺兩個已知 credential 之間，揀已知持有所需 scope 嗰個，所以一個永遠都要 `workflow` 嘅操作，可以直接揀有嗰個 scope 嘅帳戶，唔使靠先失敗一次先發現條 gap。
- **兩條路都失敗嗰陣，兩個失敗都會分開報。** 呢個同 `cirender/transport.ts` 入面 `resolveTransport` 報告已有嘅並排診斷價值一樣，唔會壓縮成一句籠統嘅道歉。
- **`gh` 唔可用嗰陣，會老實噉降級。** 當根本冇 fallback 可試（`gh` 冇裝，或者冇一個 ready 嘅帳戶），結果會講明呢點，並且指向 Settings 嘅 System dependencies 一節，而唔係承諾一個做唔到嘅重試。

呢個模組係一個共用 library，畀其他掂 GitHub 嘅界面（CI render、repository bootstrap、備份）叫；佢自己唔會決定邊個畫面幾時應該提供重試。

### 設定

冇嘢要設定。只要 preload 列得到帳戶，呢一節就會自動出現喺 Settings → GitHub 入面。GUI 登入淨係喺 preload 完整噉暴露 `ghCliStartLogin`、`ghCliCancelLogin` 同 `onGhCliLoginState` 三樣先會啟用，等舊嘅 shell 唔會畫出一個做到一半嘅登入掣。一撳即裝嗰條路，就要 preload 仲要暴露埋 `sysdepsPreview`、`installSysdeps`、`cancelSysdepInstall` 同 `onSysdepInstallEvent` 先會啟用；舊嘅或者純瀏覽器嘅 shell 就保留返去完整 System dependencies 畫面嗰條連結，唔會畫一個㩒咗都行唔到嘅掣。

### 失效情況

原文嗰個表逐項列咗每種情況同對應顯示，重點如下。完全起動唔到 `gh` 嗰陣，會顯示解析好嘅 `GitHub.cli` 安裝路徑、管理員權限披露同 **安裝 GitHub CLI 再檢查**（舊 shell 就退返去 System dependencies 連結）。安裝被取消，會顯示真實嘅取消進度再入停止狀態，重新探測帳戶唔會開始，而且會講明列表可能唔係最新；套件管理員行完但 `gh` 驗證失敗，都係顯示真實嘅驗證失敗，一樣唔會開始探測。Preview 已經驗證到 `gh` 裝咗，就跳過套件管理員嘅改動，直接重新探測帳戶。

讀取帳戶時本身拋錯，會原文顯示嗰個錯，再加一句話明依家對登入一無所知，同 `gh` 講「冇人登入咗」唔係同一回事。`gh` 裝咗但冇人登入，會顯示 `gh` 自己嘅答案，加埋確切嘅 `gh auth login` 指令、複製掣同「再檢查」。`gh` 回一個呢個 build 解析唔到嘅格式（太舊嘅 `gh`），會報成 incompatible 並指去升級路線，永遠唔會報成零個帳戶；呢度冇純文字後備解析器，因為靠估佢啲散文輸出正正就係會作出無根據結論嘅方法。某帳戶嘅 token 少咗 app 需要嘅 scope，就會出一個列明缺乜嘅警告，加埋屬於嗰個帳戶自己嘅 `gh auth refresh` 指令，入面寫住佢真正嘅 host 同 login。有帳戶但一個都唔生效，都會用說話講出嚟，因為嗰陣冇指名帳戶嘅 `gh` 指令會變得估唔到。

`gh auth switch` 話成功但個帳戶其實冇變成生效，會報成失敗並附 `gh` 自己嘅訊息，唔會出一個假嘅 "Active" chip。Release 操作開始嗰陣，如果所揀帳戶已登入但唔生效，app 會用確切嘅 host 同 login 切過去、重新讀帳戶清單、核實實際 API 身分，然後任由佢喺全機層面保持生效。如果所揀帳戶唔見咗、唔健康、切換被拒、或者實際身分唔對，就唔會行 release 指令：上載面板會講明係邊個帳戶同 host、話冇任何 release 資料改動過，並喺失敗訊息隔籬提供 **Open GitHub accounts**。揀咗 enterprise host 嗰陣，release 指令用 `--repo <host>/<owner>/<repository>`，唔會加上唔支援嘅 `--hostname`。有帳戶但搜尋乜都對唔到，會顯示「Nothing here matches that search. Clearing it brings the whole list back.」，同「裝咗但冇人登入」以及「冇裝」三者分得清清楚楚。

### 安全考量

- **Token 永遠唔會越過呢條邊界。** 永遠唔會傳 `gh auth status --show-token`，永遠唔會直接讀 `gh` 嘅 credential 檔案，而帳戶／登入嘅 IPC channel、進度事件同 renderer bridge 嘅型別入面，冇任何一個帶 token 欄位。`main/ghcli/` 入面每一個測試都會斷言 `--show-token` 從來冇出現喺任何 spawn 出嚟嘅指令參數入面。
- **切換係公開講明，唔係收埋。** 因為 `gh auth switch` 真係全機生效，行動作上方嗰個警告當成安全關鍵文案：由 `GHCLIACCOUNTS_FACTS` 釘死，所以冇任何 funny level 或者改寫可以將「成部電腦」呢句軟化掉；而且喺動作之前就顯示，事後結果度亦再確認一次。
- **完全唔會喺呢度代你登入。** 冇 terminal 嗰陣 `gh auth login` 同 `gh auth refresh` 會收起自己個批准提示，所以 app 只會寫出指令，畀用家自己行。根本冇 token 入過呢個程式，所以亦冇 token 路線需要保護。
- **Token 只有一條 secret-safe 路徑。** 佢淨係存在於 main process 嘅登入 function 入面，喺每一個失敗訊息都會被 redact，亦唔會出現喺 event、state 或者 result 型別。測試會斷言佢出現喺 stdin，但唔會出現喺 argv、繼承落嚟嘅 auth 環境、IPC 形狀嘅 JSON 或者已渲染嘅文字。帳戶列舉、切換、儲存、狀態同 API 證明統統都省走 `GH_TOKEN`、`GITHUB_TOKEN`、佢哋嘅 enterprise 變體、`GH_HOST` 同 `GH_DEBUG`；`GH_CONFIG_DIR` 就保持繼承，因為佢指明咗用家真正嗰個 gh credential store。
- **Credential 路由嘅 fallback 永遠唔會用一個未經揀選嘅身分去做寫入。** `decideWriteRoute` 係每一個有寫入能力、會叫 `routeWithFallback` 嘅呼叫者都必經嘅唯一一道閘；一發現 fallback 帳戶同揀咗嗰個唔同，佢就拒絕自動進行 —— 呢個係呢個功能唯一可能引入嘅「靜靜雞嘅意外」形狀。
- **身分係喺寫入邊界檢查，唔係淨係 preflight 嗰陣檢查。** 打包幾千個檔案可以要幾個鐘，期間另一個 terminal 隨時可以改咗 `gh` 嘅生效帳戶。所以每一次 release 嘅讀／建立／上載都會再檢查一次所揀嘅 host 同 login，一有唔對就喺任何改動之前停低。

### 驗證

- `design/packages/app/src/main/ghcli/accounts.test.ts` —— 25 個測試，用真實擷取嘅 `gh auth status --json hosts` 同純文字輸出（多帳戶、空、「not logged into any hosts」嗰句、舊版 `Logged in to HOST as LOGIN` 形式、唔認得嘅格式、以及切換路徑係重新讀而唔係信 exit code），再加一個 `--show-token` 永不出現嘅檢查。
- `design/packages/app/src/main/ghcli/routing.test.ts` —— 31 個測試，覆蓋失敗分類器、按 scope 揀帳戶、寫入路由閘同完整嘅 `routeWithFallback` orchestrator（認證失敗會 fallback 並成功；網絡錯誤同 rate limit 唔會；404 之後成功報成存取權差異；404 之後 404 報成真係唔見咗；fallback 帳戶唔同嘅寫入會去問而唔會照做，帳戶相同嘅就照做；`gh` 唔可用時老實降級；任何產生嘅訊息入面都冇 token 形狀嘅字串）。
- `design/packages/ui/src/components/github/GhCliAccountsList.test.ts` —— 覆蓋各個狀態、確切嘅登入同修復指令、探測失敗同空帳戶名單嘅分別、講明邊個帳戶生效，以及畫面上冇任何似 token 嘅嘢。
- `design/packages/app/src/main/ghcli/ipc.test.ts` —— channel 註冊／釋放、帳戶 handler、唔含秘密嘅進度事件、明確取消同 renderer 關閉取消，以及全程序唯一一個登入嘅守衛。
- `design/packages/app/src/main/cirender/gh.test.ts` —— 真實 child-process 檢查，證明被省走嘅環境變數名係唔分大細楷噉移除，而且唔會將佢哋嘅值塞入 argv。
- `design/packages/ui/src/copy/surfaces/ghCliAccounts.test.ts` —— 12 個測試，覆蓋文案目錄嘅形狀（五個 level、兩種語言、冇 em-dash、永遠冇引用過 token）、funny-level slider 真係會改變文字、FACTS pin 喺任何 level 都唔會漏咗「成部電腦」警告或者「gh」／「separate」兩個儲存嘅區分。
- `design/packages/ui/src/components/github/GhCliAccountsList.test.ts` —— 19 個測試，將真元件掛喺一個劇本式 bridge 上面：每個帳戶嘅 host、active chip 同權限都渲染得到；只要有帳戶就一定顯示全機警告；缺 scope 嘅警告會啟動同一條 GUI 批准流程；code、URL、倒數同取消都渲染得到；唔健康嘅帳戶會有標記；切換會指名報出全機層面嘅結果；冇真正生效嘅切換會報成失敗；三個老實嘅空／不可用狀態各自渲染唔同訊息；未安裝狀態會預覽確切路徑同提權披露、只揀 `githubCli`、渲染真實進度、可以喺未開始登入前取消，並且喺 preview 已驗證到 `gh` 嗰陣跳過安裝；舊 shell 一樣去到 `open-dependencies`；搜尋冇結果同完全冇帳戶分得開；兩個儲存嘅說明永遠都喺度；同埋任何 token 形狀嘅嘢永遠唔會渲染出嚟。
- `design/packages/app/src/main/cirender/transport.test.ts` —— 32 個測試，包括喺 github.com 同 enterprise host 上面 `gh release create` 同 `gh release upload` 嘅確切參數陣列；所揀帳戶已生效同未生效兩種情況；全機自動切換；帳戶唔見、切換被拒同實際身分唔對嘅拒絕；release-create 失敗；續傳上載；以及證明冇任何 release 指令含有唔支援嘅 `--hostname`，亦唔會喺身分失敗之後再行。
- `design/packages/ui/src/components/cirender/CiRenderScreen.test.ts` —— 路由拒絕會喺同一張 card 上面渲染 **Open GitHub accounts**，並經現有嘅 Settings 動作返返去。

帳戶、登入同 transport 三套測試全部都係本地假件：佢哋永遠唔會改動呢部機真正嘅 `gh` 登入，亦永遠唔會發佈 release。登入測試會斷言 `gh auth login` 嘅確切參數陣列，並且分開斷言批准咗嘅 token 係喺 stdin。真實喺瀏覽器批准嗰步，仍然係外部帳戶嘅 runtime 證明，唔係呢啲測試可以聲稱到嘅嘢。
