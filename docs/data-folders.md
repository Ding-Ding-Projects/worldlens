# Data folders, and the profile history

Settings has a **Data folders and history** section. It does three things: it lets you choose
where the app keeps its **profile folder**, it lets you choose the **save folder** where rendered
maps are written, and it keeps the profile folder as a Git repository so every settled change has
a recorded version. Sending that history to a remote repository is optional and off until you
turn it on.

## The two folders

| Folder | What lives there | Default | When a change applies |
| --- | --- | --- | --- |
| Profile folder | Settings, consent choices, accounts, the app's own history repositories | `%APPDATA%\Worldlens` (resolved at run time) | After a restart |
| Save folder | Rendered maps (the same folder the older "Where rendered maps go" row edits) | `<profile folder>\maps` | Straight away |

Each folder is a path field with a native browse button. Under it, a radio group says what happens
to the data already there:

- **Move it**: copy everything, check every file, switch, then offer to remove the old folder.
- **Copy it**: the same, but the old folder is never offered for removal.
- **Start fresh, or use what is already in that folder**: nothing is copied. This is the only mode
  that accepts a folder that already has files in it, because nothing is written to it.

**Reset to default** puts the default folder in the field. It does not move anything by itself:
you still choose how to treat the data and press Apply.

### What is checked before anything moves

The main process checks the choice (and checks it again when you press Apply). Every refusal names
its reason and changes nothing.

- It must be a full path.
- It must not be the folder already in use.
- It must not be inside the folder the app is installed in, or contain it, because an update can
  replace that folder.
- It must not be a system folder, a whole drive, or contain a system folder.
- The profile and save folders must not be the same, nested, or contain each other, once either
  has been chosen separately.
- It must exist or be creatable, and be writable (a small probe file is written and removed).
- For move and copy it must not exist or must be empty, so nothing is ever overwritten.
- The drive must have room for the data plus a margin.

### How the data is moved

1. The profile's pending changes are recorded as a version first, so the history that moves is the
   history up to that moment.
2. Files are copied with an exclusive flag, so an existing file in the target makes the copy fail
   instead of being replaced. Caches, locks, crash dumps and logs are not copied (a running app holds
   some of them open, and they are rebuilt on their own).
3. Every copied file is compared with its source by size and SHA-256. A file that changed while it
   was being copied is copied once more and compared again.
4. For the profile, the latest saved version in the old and new Git history must match.
5. Only then is the choice recorded: for the profile in a pointer file, for the save folder by
   switching the map storage folder.

**Cancel** stops the copy and removes only the files and folders that this run created. A copy that
fails part-way does the same. In both cases the old folder is untouched and stays in use, and the
result says so.

### The profile folder pointer

The profile folder is read before anything else starts, so its location cannot be stored inside
it. It is kept in a small file beside the default location, named
`<default folder name>.data-folders.json` in the per-user application-data folder. At start the app
reads that file and calls `app.setPath("userData", ...)` before anything uses the profile.

- A missing file means the default.
- A file that is damaged, from an unknown version, or names a relative path is reported in Settings
  and the default is used. The file is never deleted.
- A chosen folder that cannot be reached at start (an unplugged drive, for example) is reported with
  two options: restart and try again once it is reconnected, or **use the default for good**. The app
  never silently replaces your choice, and uses the default only for that launch.
- Screenshot and smoke runs ignore the pointer, so they never touch your real profile.

### Removing the old folder

After a move, and after the restart for a profile move, Settings offers **Remove the old folder**.
It is its own step behind a two-key confirmation. Before anything is deleted the new folder is
compared with the old one file by file (size and SHA-256), and for the profile the saved versions
must match. If anything differs, or the save folder still lives inside the old profile folder,
nothing is removed and the message names the first difference.

## The profile history

The profile folder is a Git repository. If it is not one already it is initialised on start (an
existing repository is reused and its history is never rewritten). The identity is set per
repository to `WorldLens <worldlens@localhost>`.

- A managed block in the folder's `.gitignore` keeps out caches, GPU and code caches, blob storage,
  Chromium session storage, crash dumps, logs, lock files and temporary files, downloaded runtimes
  and jars, rendered maps, and files over 25 MB. Lines you add outside the block are kept. Folders
  that are Git repositories of their own (the app's configuration histories, for example) are
  listed in the block so they keep their own history.
- A version is recorded a little while after changes settle (20 seconds of quiet, and never later
  than five minutes after the first change), on start, and when the app closes. The message says
  what changed, for example `Update profile files: settings.json, consent.json`. Nothing is recorded
  when nothing changed.
- Files that hold sign-in details are recorded in this local repository exactly as they sit on disk.
  They are never decrypted or copied into another form.
- A failed history write never fails the save that triggered it. It is shown as a non-blocking
  notice and in the section's status. With no Git on the machine the section says so plainly, and
  everything else works as usual. Git is not bundled.

## Sending the history to a repository (optional)

Off by default. To use it, save the address of a private repository and turn on **Send the history
to this repository**. Private is the recommendation, and **Create private repository** (GitHub
account and owner chosen from what GitHub CLI reports) creates only private repositories. Sign-in is
GitHub CLI's, shown in the GitHub account section; no token is typed or stored here.

- The address may not contain a user name and password. Plain `http` is accepted only for hosts on
  your own network.
- What is sent is not the local history itself. It is a second branch, `worldlens-remote`, built
  from the local history with the credential paths removed from each snapshot, and each new commit
  has the previous one as its parent. It is pushed to the remote branch `worldlens-profile`, never
  `main`.
- **There is no force.** The push has no `+` or force option, and a guard throws if one is ever
  added. A remote that has moved on is reported as rejected and left alone. After a push the remote
  is read back and the result says whether it was confirmed.
- **What is left out:** folders named `github-accounts`, `lock-secrets`, `rcon-secrets`,
  `protected-bot-accounts` and `.ssh`; the named credential files; and any file whose name contains
  credential, secret, password, passphrase, token or private key, or that ends in `.pem`, `.p12`,
  `.pfx` or `.key`. The section lists this exactly.
- When such files exist the section recommends a Git server on your own network (a self-hosted
  GitLab, for example). Only for a host on your own network can **Also send sign-in files** be
  turned on. Turning it off later stops sending them, but copies already sent stay in the remote's
  history.

## Failure modes

| What happens | What you see |
| --- | --- |
| The folder is refused | The reason, under the field, and why Apply is unavailable. Nothing changed. |
| The copy is cancelled or fails | The partial copy is removed, the old folder stays in use, the result says so. |
| The new copy does not match | Nothing is switched, and the message names the file. |
| Git is missing | "Git is not available, so no history is kept." The rest works. |
| The remote has moved on | "Rejected", nothing forced, remote unchanged. |
| GitHub sign-in is missing | A pointer to the GitHub account section. |
| A chosen profile folder is unreachable | The warning with the two ways out. |

## Security considerations

- Every channel checks that the request comes from the app's own window.
- A request is validated by hand in the main process, not trusted from the interface.
- Nothing credential-bearing is read, only listed by name.
- A hosted container refuses these channels: its data folders are the volumes its operator mounted.

## Verification

Colocated Vitest tests under `design/packages/app/src/main/dataFolders` use real temporary
folders and real Git (skipped with a printed reason when Git is missing) for the pointer, the
refusals, move and copy with verification, cancel and failure rollback, never overwriting an
existing file, history recording, the ignore rules, history failure, the filtered push to a local
bare repository, the rejected push, and the no-force guard. Interface tests cover the store and the
section.

What is **not** verified: a move and restart in the real packaged app, a real push to GitHub, a
real GitLab server, the native folder picker, and the layout at narrow widths and large display
scales. The sentences produced by the main process (refusal reasons are localized in the interface
by code, but copy and failure messages are English) are not localized.

## Suggested articles

- [Configuration history](config-history.md)
- [Backups](backup.md)
- [Command palette](command-palette.md)

## 廣東話

設定入面有個「資料夾同歷史記錄」部分,可以揀個人設定資料夾(程式嘅用戶資料夾)同儲存資料夾
(渲染地圖寫去邊)放喺邊,而且個人設定資料夾會用 Git 保存版本歷史。將歷史傳去遠端儲存庫係可選,
預設關閉。

**揀資料夾:** 兩個資料夾都有原生瀏覽掣。搬之前會檢查:一定要係完整路徑、唔可以係而家用緊嗰個、
唔可以喺程式安裝位置入面、唔可以係系統資料夾或者成個磁碟、要寫得入、要有足夠空位、兩個資料夾
唔可以疊埋。每個拒絕都會寫明原因,同埋乜都唔會改。

**點搬:** 揀「搬過去」、「複製過去」或者「重新開始/用現有嘅嘢」。複製用獨佔旗標,所以永遠唔會
覆蓋已有檔案。每個檔案都用大小同 SHA-256 核對,個人設定嘅版本歷史亦要一致,之後先切換。取消
或者失敗,只會刪走今次新建嘅嘢,舊資料夾原封不動。個人設定資料夾要重新啟動先生效;位置記喺預設
位置旁邊一個細檔案,唔會記喺資料夾自己入面。揀咗嘅資料夾如果搵唔到,會警告你,畀你重新接駁後再試
或者永遠用預設,唔會靜靜雞換走。

**刪走舊資料夾:** 係獨立一步,要雙鑰匙確認。刪之前會逐個檔案同新資料夾比較,有分別就唔刪。

**歷史:** 設定穩定一陣、啟動同關閉嗰陣會儲存一個版本,訊息寫明改咗乜。快取、鎖定檔、日誌、
下載嘅執行環境同渲染地圖唔入歷史。載有登入資料嘅檔案喺本機原樣記錄,唔會解密或者複製。冇 Git
嘅話會清楚講明,其他功能照常。歷史寫入失敗唔會令你嘅儲存失敗。

**傳去遠端(可選):** 建議私人儲存庫,「建立私人儲存庫」只會建立私人嘅。傳出去嘅係另一條已經
剔走登入資料檔案嘅分支,只會往前加,永遠唔會強制推送;遠端有新嘢就顯示「被拒絕」並且原樣保留。
傳完會讀返遠端核實。有登入資料檔案嘅話,會建議用你自己網絡上嘅 Git 伺服器(例如自行架設嘅
GitLab),只有嗰類主機先可以揀連登入資料檔案一齊傳。

**未驗證:** 真正打包版嘅搬移同重新啟動、真正推送去 GitHub、真正 GitLab、原生資料夾選擇器,以及
窄螢幕同高顯示縮放嘅版面,全部都未驗證。主要程序產生嘅提示句子(除咗拒絕原因由介面按代碼翻譯)
暫時只有英文。
