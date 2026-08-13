# GitHub CLI is required, and it holds the only GitHub credential

Every GitHub operation this application performs runs through the `gh` command-line tool. There is
no second credential: nothing here asks for a token, stores one, reads one from an environment
variable, or signs you in to GitHub itself. If `gh` is not installed and signed in, the GitHub half
of the application does not work, and it says so in plain words rather than failing later inside a
render.

This article covers what that means in practice. The section-by-section behaviour of the account
list itself lives in [The gh command-line tool's own accounts](./gh-cli-accounts.md).

## Behaviour

### One credential store, not two

The application used to carry its own GitHub sign-in beside `gh`'s. Two stores meant two places a
credential could be stale, two places it could be revoked from, two sets of scopes that could
disagree, and two answers to the question "which account is this push going out as". Every one of
those is a way to be wrong quietly.

`gh` already keeps a credential store, in its own files, under its own control, shared by every
terminal, script and other tool on the machine that shells out to it. Deleting the second store
leaves exactly one place a GitHub credential lives, one place to revoke it, and one account list to
read. It also means signing out in a terminal genuinely signs this application out, which is what
almost everybody expects the first time they try it.

The application therefore never sees a token at all. It runs `gh` as a child process, `gh` attaches
its own credential, and the process returns data. Requests are made through `gh api`, files are
downloaded through `gh api` with an octet-stream header, release assets go up through
`gh release upload`, and even `git push` authenticates through `gh auth git-credential` rather than
through anything this application holds.

### Signing in happens in your own terminal, and cannot happen here

`gh auth login` and `gh auth refresh` suppress their own approval prompt when they are not attached
to a terminal. Spawned from a window, they print nothing and then wait, forever, for an approval
that was never offered. Launching a console host on a hidden desktop does not rescue it either.

That is the whole reason there is no sign-in button. A button that appeared to sign you in and then
hung is worse than no button, so Settings → GitHub shows the exact command instead, with a copy
control beside it, and a Check again action that re-reads `gh` once you have run it:

```
gh auth login --hostname github.com --git-protocol https --scopes repo,workflow,gist,read:org,read:project,project
```

The scope list is not optional decoration. `gh auth login`'s own default grant is `repo`,
`read:org` and `gist`; `workflow`, `read:project` and `project` are not in it. Sign in without them
and the first workflow dispatch fails with a permission error that reads like a missing repository
permission rather than a missing scope, which is a genuinely misleading place to end up.

### What each state says, and why the wording differs

The account section reports exactly one of these, and never blurs two of them together:

| State                                 | What it means                                                          | What to run                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `gh` is not installed                 | The pinned executable could not be started from its install location.  | Nothing: the section installs it for you through the system-dependency route.   |
| The application could not ask `gh`    | The read itself threw. Nothing is known about your sign-in either way. | Check again, and read the error the section prints verbatim.                    |
| `gh` says nobody is signed in         | `gh` answered, and its account list was empty.                          | The `gh auth login` command above.                                              |
| `gh` is too old                       | `gh auth status --json hosts` did not parse, so no account is guessed.  | Update `gh` from the Dependencies screen.                                       |
| Signed in, but short a scope          | The account is there, and `repo` or `workflow` is missing from it.      | `gh auth refresh --hostname <host> --user <login> --scopes repo,workflow,read:project,project` |
| Signed in and complete                | Every account `gh` holds, with the active one named.                    | Nothing.                                                                        |

"The application could not ask `gh`" and "`gh` says nobody is signed in" are different facts and are
worded differently on purpose. The first is an unknown; the second is an answer. A surface that
rendered both as "you are not signed in" would be inventing the answer it failed to get.

Installing `gh` is the one thing in that table the application genuinely can do for you, so it is
the one thing offered as a button: the section previews the exact package-manager route and its
administrator-permission disclosure, installs only that one dependency, verifies it, re-probes, and
then shows the sign-in command.

### Several accounts, and which one is active

`gh` supports several accounts at once, including accounts on an enterprise host beside
`github.com`, and this application uses that directly rather than keeping a list of its own.

`gh` has exactly one **active** account per host: the one an unqualified `gh` command runs as. That
is machine-wide, so a terminal, a script or another tool can move it at any moment, and this project
has already lost time to an active account changing underneath a push. Two things follow, and both
are visible in the section:

- The active account is named in a sentence, not left to a chip on a row. If `gh` reports no active
  account at all, the section says that too, because a command that does not name an account is
  then unpredictable.
- Every command the section prints names its own host and login. A scope repair for an enterprise
  account says that enterprise host, never a `github.com` stand-in that would repair the wrong
  account.

Switching the active account from the Switch action is offered, with a permanent warning that it is
machine-wide rather than scoped to this application, and it is confirmed by re-reading the account
list rather than by trusting the exit code. Internally, an operation that needs a particular account
switches to it, does its work in a serialised lane, and switches back, reporting a failure loudly if
it cannot restore what it found.

Signing an account out from here removes it from `gh`'s own store, behind the destructive-action
confirmation, and every other tool on the machine loses that sign-in too. That is stated on the
confirmation rather than discovered afterwards.

## Configuration

There is nothing to configure. `gh` is resolved from its trusted installation locations rather than
from `PATH`, and every credential-bearing call runs with `GH_TOKEN`, `GITHUB_TOKEN`,
`GH_ENTERPRISE_TOKEN`, `GITHUB_ENTERPRISE_TOKEN`, `GH_HOST` and `GH_DEBUG` stripped from its
environment, so an environment variable left over from another tool can never quietly become the
identity a push goes out as.

## Failure modes

- **`gh` missing.** Reported as missing, with the installer offered. No operation is attempted.
- **`gh` present, nobody signed in.** Reported as `gh`'s own answer, with the sign-in command.
- **The probe itself failed.** Reported as an unknown, with the raw error, never as "signed out".
- **A scope is missing.** Reported per account with the exact `gh auth refresh` command. The
  underlying operation still fails until it is run, and the failure names the scope rather than
  claiming the account lacks repository access.
- **An enterprise host.** Fully supported: commands name that host. Nothing is redirected through
  `github.com`.
- **`gh` too old for `--json hosts`.** Reported as incompatible. No account is inferred from text.

## Security considerations

No token, and no part of one, is read, displayed, logged, written to a file, passed as a command
argument, or sent over IPC by this application. The account metadata it does read is a login, a
host, a git protocol, a token *source* such as `keyring`, and a scope list, none of which is secret.
The account section never renders anything token-shaped, and its tests assert that.

Because `gh` owns the credential, revoking it is done where it was granted: `gh auth logout`, or the
authorisation list on GitHub itself. Deleting files under this application's data directory does not
revoke anything on GitHub, and the legacy-credential cleanup surface says so where it offers to
remove the files an older version left behind.

## Verification

- `design/packages/ui/src/components/github/GhCliAccountsList.test.ts` covers each reported state,
  the exact sign-in and repair commands, the difference between a failed probe and an empty account
  list, the named active account, and the absence of anything token-shaped.
- `design/packages/app/src/main/ghcli/accounts.test.ts` covers parsing `gh auth status --json hosts`,
  and the switch and sign-out paths that re-read rather than trusting an exit code.
- `design/packages/app/src/main/ghcli/credentialBoundary.test.ts` covers the boundary itself: what
  may cross it, and what may not.

## Suggested articles

- [The gh command-line tool's own accounts](./gh-cli-accounts.md)
- [Automatic dependency provisioning](./dependency-provisioning.md)
- [Setting up a repository for CI renders](./ci-repository-setup.md)

## 廣東話

### GitHub CLI 係必需，GitHub 憑證只得佢一份 (GitHub CLI is required, and it holds the only GitHub credential)

呢個程式所有 GitHub 操作都經 `gh` command-line 工具行。冇第二份憑證：呢度唔會問你攞 token、唔會儲
token、唔會讀環境變數入面嘅 token，亦唔會自己幫你登入 GitHub。`gh` 未裝或者未登入，GitHub 嗰半邊
就用唔到，而程式會即刻用人話講出嚟，唔會等到 render 途中先失敗。

#### 一個憑證儲存，唔係兩個

以前呢個程式喺 `gh` 隔籬有自己嘅登入。兩個儲存即係兩個地方可以過期、兩個地方要撤銷、兩套 scope 可以
唔一致、「呢次 push 用邊個帳戶」有兩個答案。每一樣都係一種靜靜雞出錯嘅方法。删走第二個之後，憑證只
剩一個地方，撤銷只有一個地方，帳戶名單亦只讀一份；喺 terminal 登出係真係連呢個程式都登出咗。

#### 登入要喺你自己個 terminal 度做

`gh auth login` 同 `gh auth refresh` 冇連住 terminal 嘅時候會收起自己個批准提示。喺視窗度開，佢乜都
唔會印，然後永遠等落去。所以呢度冇「登入」掣，只有一句可以複製嘅指令同埋「再檢查」：

```
gh auth login --hostname github.com --git-protocol https --scopes repo,workflow,gist,read:org,read:project,project
```

嗰串 scope 唔係裝飾。`gh` 自己預設只授 `repo`、`read:org`、`gist`，冇 `workflow`、`read:project`、
`project`；漏咗就第一次 dispatch workflow 會撞到一個似「冇 repository 權限」嘅錯，其實係少咗 scope。

#### 幾個狀態，用字唔同係有心嘅

`gh` 未裝、問唔到 `gh`、`gh` 話冇人登入、`gh` 太舊、登入咗但少 scope、一切齊全，六種狀態分開報。
「問唔到 `gh`」係未知，「`gh` 話冇人登入」係答案，兩者唔可以寫成同一句。安裝 `gh` 係表入面唯一一件
程式真係做得到嘅事，所以得嗰件用掣。

#### 多帳戶同邊個生效

`gh` 可以同時有幾個帳戶，包括企業主機嘅。每個主機只有一個「生效」帳戶，而且係成部電腦通用，terminal
或者第二個工具隨時可以搞郁佢，所以生效嗰個會用一句說話講明；`gh` 話冇生效帳戶都會照講。每句印出嚟嘅
指令都會寫明自己嗰個 host 同 login，企業帳戶唔會被送去 `github.com` 修。切換會警告係成部電腦嘅事，
而且會重新讀一次名單先當成功。喺呢度登出係喺 `gh` 自己個儲存移除，其他工具都會冇咗呢個登入。

#### 安全考量

任何 token、甚至一部分，都唔會被讀、顯示、寫入紀錄或檔案、放入指令參數或者經 IPC 傳送。讀到嘅只有
login、host、git 協議、憑證來源（例如 `keyring`）同 scope，全部都唔係秘密。撤銷要喺授權嗰度做：
`gh auth logout`，或者 GitHub 自己嘅授權清單；删本機檔案唔會撤銷 GitHub 上面嘅授權。
