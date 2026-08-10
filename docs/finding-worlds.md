# Finding worlds

The first step of the make-a-map wizard offers the worlds already on this computer, and
keeps every manual route open beside them. Nothing here has to be configured before it
works: the default Minecraft installation is found without anybody adding it.

## Where it looks

| Place | Path |
|---|---|
| Windows (Java) | `%APPDATA%\.minecraft\saves`, falling back to building the path from the home directory when the variable is absent |
| macOS | `~/Library/Application Support/minecraft/saves` |
| Everywhere else | `~/.minecraft/saves` |
| Portable | `<directory of the running executable>/.minecraft/saves`, listed **only when it really exists** |
| Windows (Bedrock) | `%LOCALAPPDATA%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\minecraftWorlds`, listed **only when it really exists** |
| Windows (CurseForge) | `%USERPROFILE%\curseforge\minecraft\Instances\<Instance Name>\saves`, one row per instance, listed **only when the root really exists** |
| Anything else | folders the user has mounted (below) |

`main/world/locations.ts` takes the platform, the environment, the home directory and the
executable's directory **as parameters** rather than reading `process` inline, so a Windows
layout is testable from a Linux CI runner. That is not a stylistic preference: this
repository has already shipped a path bug that no test could reach for exactly that reason,
and `main/java/discovery.ts` carries the same note.

### Bedrock Edition and CurseForge, and what "verified" means for each

Both rows above were added only after being checked against a real, installed layout on a
development machine, in keeping with the rule the rest of this section explains.

- **Bedrock.** `%LOCALAPPDATA%\Packages\<PackageFamilyName>\LocalState\...` is Windows' own
  storage convention for every packaged Store app, confirmed present and populated by
  several other installed packaged apps on that development machine. `Microsoft.MinecraftUWP_
  8wekyb3d8bbwe` is Microsoft's own fixed package identity for Minecraft for Windows,
  documented independently of this repository. What was **not** observed is the Minecraft
  UWP package itself - Bedrock was not installed on that machine - so the row behaves like
  the existing portable-installation row: silent when absent, never a permanent "missing"
  line on every machine that lacks it. Once Bedrock's `level.dat` is found (little-endian
  NBT behind an 8-byte header, not the Java format), the existing detection in
  [Bedrock Edition worlds](./bedrock-worlds.md) names it as Bedrock rather than reporting a
  parse failure - this location just gets that folder in front of the same detector.
- **CurseForge.** Confirmed for real: a development machine had it installed, at
  `<home>\curseforge\minecraft\Instances\<Instance Name>\saves`, each instance carrying its
  own `minecraftinstance.json` beside its `saves`. A CurseForge installation holds *several*
  instances under one root rather than one `saves` folder directly, so this is not a single
  row like the others - `main/world/launcherRoots.ts`'s `detectLauncherRoot` reads the
  `Instances` directory and lists every instance under it as its own row, re-read on every
  visit to the list so a newly created modpack instance appears without anybody re-mounting
  anything.

### Why there is still no MultiMC, Prism, ATLauncher, GDLauncher or Modrinth default entry

None of the five could be confirmed on a real machine for this feature, and a guessed root
reports *no worlds* about a folder full of them. That is worse than not looking, because it
answers a question it was never asked and looks authoritative doing it.

What changed is that the check `detectLauncherRoot` runs is **the shape**, not a hardcoded
launcher name: an `Instances` directory (any case) whose children each hold their own
`saves`. A folder from one of these five launchers that happens to share the same
convention CurseForge uses is still recognised the moment somebody mounts it by hand,
exactly like any other folder - it is only the *automatic, no-action-needed* default entry
that is withheld until this repository can confirm a real layout the same way CurseForge's
was confirmed. Mounting covers every launcher properly today; see below.

## Mounting more Minecraft folders

One machine commonly holds several installations: a vanilla one, a modded one, a launcher's
instance tree, a copy on a second drive. Each can be mounted, and the list persists.

- **Either level is accepted.** Somebody will pick `.minecraft` and somebody else will pick
  `.minecraft/saves`; both are the same intent. What it resolved to is recorded and shown.
  A folder that is neither is refused by name, with the parent to mount instead.
- **A launcher root with several instances is accepted too.** Pointed at a folder shaped
  like CurseForge's own `Instances/<name>/saves` layout - the folder itself, its per-game
  folder, or the `Instances` directory directly - every instance found under it is mounted
  as its own row in one action, and a later remount after a new modpack instance appears
  mounts only the new one.
- **Labels matter more than they look.** Two folders both called `saves` tell you nothing
  apart, so each mount carries a name. Built-in entries can be renamed too, keyed by origin
  so a moved home directory keeps the name.
- **Mounting the same folder twice** resolves to the row that already exists.
- **Unmounting rewrites one JSON file and never opens the folder.** `mounts.test.ts`
  asserts the worlds are still on disk afterwards, because "unmount" beside a list of
  worlds reads as "delete" to a reasonable person. It is not behind the destructive-action
  gate for the same reason.

## What each world shows

The name comes from `LevelName`, **not** the folder name, because those differ constantly.
Underneath it, as a real secondary line rather than a tooltip:

last played · version, marked as a snapshot when it is · game mode · Hardcore · cheats ·
dimensions and their region files · size on disk · seed · the folder on disk when it
differs from the name · **which mounted folder it came from**

That last one is not decoration. Two installations commonly hold worlds with the same name,
and a row that cannot be told from another row is a row somebody renders by mistake.

The seed travels as decimal **text**. A 64-bit seed does not survive a JavaScript number,
and a seed that is quietly wrong is worse than a seed that is absent.

Anything unreadable is omitted rather than guessed. A world whose `level.dat` cannot be read
is still listed, with everything that was never in doubt and a note saying what is missing.

## The list itself

A real `listbox`: `role="option"` rows, `aria-selected` on the chosen world, one roving
tab stop, Arrow/Home/End/PageUp/PageDown stopping at the ends rather than wrapping, and an
accessible name per option carrying the world name **and** the whole detail line.

**Focus and selection are separate on purpose.** Choosing a world runs a folder inspection,
so arrowing down ninety rows must not start ninety of them. Enter, Space or a click chooses.

Sorted by last played, most recent first, across every mount. Unknown dates sort last, ties
by name.

Its search is the project's own `ConfigSearchField` with the anchored regex builder, over
the name, the folder name, the full path, the mount label and every detail part, so typing
`1.20`, `hardcore` or the name of an installation all find what somebody means. Plain text
is the default; regex is the explicit opt-in. See [regex-builder.md](regex-builder.md).

## The manual routes still work

Typing a path, browsing for one, and dropping a folder onto the step all work, none of them
behind a disclosure, all of them working with **nothing mounted**. Somebody with one world
on a memory stick is a normal user, not an edge case.

A dropped or picked folder that is already listed resolves to that row rather than
appearing twice, so the same world never shows up under two names.

> Electron removed `File.path` in v32, so the drop target resolves a dropped folder through
> `webUtils.getPathForFile`, which only works in the preload. That is why the bridge carries
> `pathForDroppedFile` rather than the renderer reading the path itself.

The browse button here is not specific to this wizard. Every field in the application that
names a folder or a file on this computer - a storage's tile folder, a config file's log
path, a remote render target's SSH key, a backup's source folder - offers the same button,
behaving the same way: it writes into the field exactly as typing would, a cancelled dialog
changes nothing, and it is shown disabled with an explanation rather than hidden when there
is no desktop app to open a native dialog with. See [Browsing for a folder or a
file](./path-field.md) for the full list of where it appears and how it behaves.

## Honest states

Every one of these is a real state with its own copy, not a spinner that never resolves:

- scanning, overall and **per mount**, each with its own count
- no Minecraft folder at all, **naming the paths it looked in**
- folders found but no worlds in them, naming the real paths it read
- a mount that has gone missing or unreadable **keeps its row and says so** - a folder on an
  unplugged external drive is not a folder somebody meant to forget
- a scan that failed for one folder reports on that folder's row while the other folders'
  worlds stay on screen
- a world whose `level.dat` could not be read, listed with what is known
- no bridge at all, in a browser tab, where the whole section is simply absent

## Failure modes and security

- **Nothing is written.** Scanning reads; the only file this feature writes is the mount
  list under the app's own data directory.
- **Size is measured with a doubly-bounded walk**, so a save folder with a pathological
  structure cannot turn a scan into an unbounded traversal.
- **`level.dat` is skimmed, not parsed whole.** A one-pass reader recognises about a dozen
  names at two known paths and steps over everything else, including the dimension registry,
  which is the largest thing in a modern `level.dat`.
- **A malformed or hostile `level.dat` yields a listed world with missing details**, never a
  crash and never an invented value.

## Verification

```sh
cd design && npx vitest run packages/app/src/main/world      # discovery, level.dat, mounts, catalog
cd design && npx vitest run packages/ui/src/components/world # the list, its keyboard model, its states
```

`locations.ts` is tested with a fake platform, environment and home directory and no
filesystem at all. The filesystem-touching tests use real temporary directories rather than
a fake `fs`, because a fake would decide the very questions worth asking - including the
CurseForge-shaped directory tree `launcherRoots.test.ts` builds and reads back.

## Related

- [Worlds ready to use on the Projects tab](project-world-discovery.md) - this same
  catalogue, surfaced a second way: automatically, with bulk actions, distinguishing a
  discovered world from a project somebody has actually set up
- [regex-builder.md](regex-builder.md) - the builder this list's search uses
- [path-field.md](path-field.md) - the same browse button, wired into every other folder
  and file field in the application
- [Bedrock Edition worlds](bedrock-worlds.md) - what happens once a Bedrock world reaches
  the detector this location's row feeds
- [legacy-1-12-worlds.md](legacy-1-12-worlds.md) - what a 1.12.2 world can and cannot do
- [large-worlds.md](large-worlds.md) - getting a world that is not on this machine yet

## 廣東話

### 搵世界 (Finding worlds)

做地圖精靈 (make-a-map wizard) 第一步會列出呢部電腦上面已經有嘅世界，同時將所有手動路徑一齊擺喺隔籬。呢度乜都唔使預先設定就用得：預設嘅 Minecraft 安裝位置唔使人手加都搵到。

### 佢會去邊度搵

預設掃描嘅位置有以下幾類。Windows (Java) 睇 `%APPDATA%\.minecraft\saves`，如果嗰個環境變數冇咗，就用家目錄砌返條路徑出嚟；macOS 睇 `~/Library/Application Support/minecraft/saves`；其他系統一律睇 `~/.minecraft/saves`。另外三個位置**淨係真係搵到嗰陣先會列出嚟**：可攜式安裝 (Portable) 嘅 `<directory of the running executable>/.minecraft/saves`、Windows Bedrock 嘅 `%LOCALAPPDATA%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\minecraftWorlds`，以及 Windows CurseForge 嘅 `%USERPROFILE%\curseforge\minecraft\Instances\<Instance Name>\saves`（每個 instance 各佔一行，而且要個 root 真係搵到先列）。除此之外，就係用家自己掛載 (mount) 嘅資料夾。

`main/world/locations.ts` 係將平台、環境變數、家目錄同埋執行檔所在目錄當成**參數**傳入，唔係喺入面直接讀 `process`，咁樣喺 Linux 嘅 CI runner 都測試到 Windows 嘅佈局。呢個唔係風格上嘅偏好：呢個 repository 以前就出過一個冇任何測試掂得到嘅路徑 bug，原因就係咁，而 `main/java/discovery.ts` 都寫住同一個註記。

#### Bedrock Edition 同 CurseForge，「驗證過」對佢哋各自代表咩

上面嗰兩行，都係喺開發機上面對住真實裝好嘅佈局查證過之後先加入嘅，跟嘅就係呢一節講緊嗰條規矩。

- **Bedrock。** `%LOCALAPPDATA%\Packages\<PackageFamilyName>\LocalState\...` 係 Windows 自己對每一個 packaged Store app 嘅儲存慣例，喺嗰部開發機上面已經由其他幾個裝咗嘅 packaged app 證實真係有、亦真係有內容。`Microsoft.MinecraftUWP_8wekyb3d8bbwe` 係 Microsoft 自己畀 Minecraft for Windows 嘅固定 package identity，喺呢個 repository 以外都有文件記載。**冇**親眼見到嘅係 Minecraft UWP package 本身 —— 嗰部機冇裝過 Bedrock —— 所以呢一行嘅行為同現有嘅可攜式安裝嗰行一樣：搵唔到就靜靜哋唔出聲，唔會喺每一部冇裝過嘅機上面長期掛住一句「揾唔到」。一旦搵到 Bedrock 嘅 `level.dat`（8-byte header 後面係 little-endian NBT，唔係 Java 嗰種格式），現有喺 [Bedrock Edition worlds](./bedrock-worlds.md) 嘅偵測就會認得佢係 Bedrock，而唔係報一個解析失敗；呢個位置做嘅嘢，淨係將嗰個資料夾送到同一個偵測器面前。
- **CurseForge。** 呢個係真真正正確認過嘅：有部開發機裝咗，位置係 `<home>\curseforge\minecraft\Instances\<Instance Name>\saves`，每個 instance 喺自己嘅 `saves` 隔籬都有自己嘅 `minecraftinstance.json`。CurseForge 嘅安裝係一個 root 底下放住*幾個* instance，唔係直接一個 `saves` 資料夾，所以佢唔似其他位置咁淨係一行 —— `main/world/launcherRoots.ts` 入面嘅 `detectLauncherRoot` 會讀 `Instances` 目錄，將底下每個 instance 各列成一行，而且每次入去睇個列表都會重新讀一次，所以啱啱整好嘅 modpack instance 唔使人再掛載一次都會自己出現。

#### 點解仲係冇 MultiMC、Prism、ATLauncher、GDLauncher 或者 Modrinth 嘅預設項目

呢五個都冇喺真機上面為呢個功能確認過，而一個靠估嘅 root 會對住一個裝滿世界嘅資料夾報「冇世界」。咁樣仲衰過唔去睇，因為佢答咗一條冇人問過嘅問題，仲要答得好似好權威咁。

改變咗嘅係：`detectLauncherRoot` 檢查嘅係**個形狀**，唔係寫死嘅 launcher 名 —— 即係一個 `Instances` 目錄（大細楷唔拘），佢每個子資料夾都各自有自己嘅 `saves`。如果呢五個 launcher 之中有邊個嘅資料夾啱啱好跟到 CurseForge 同一套慣例，只要有人手動掛載，一樣即刻認得，同任何其他資料夾冇分別 —— 扣住唔畀嘅淨係嗰個*自動、乜都唔使做*嘅預設項目，要等呢個 repository 好似當初確認 CurseForge 咁確認到真實佈局先會加。而家用掛載已經完全照顧到每一個 launcher，睇下面。

### 掛載多啲 Minecraft 資料夾

一部機通常唔止一個安裝：一個原版、一個模組版、一個 launcher 嘅 instance 樹、第二隻碟上面嘅一份 copy。每一個都掛載得，而且個清單會保存落嚟。

- **兩層都接受。** 有人會揀 `.minecraft`，有人會揀 `.minecraft/saves`；兩者意思一樣。系統會記錄同顯示佢最後解析成咩。如果兩樣都唔係，就會指名拒絕，同時話返畀你聽應該改為掛載邊個上層資料夾。
- **一個有幾個 instance 嘅 launcher root 一樣接受。** 只要指住一個似 CurseForge 嗰種 `Instances/<name>/saves` 佈局嘅資料夾 —— 個資料夾本身、佢入面嗰個 per-game 資料夾、或者直接指 `Instances` 目錄都得 —— 一次動作就會將底下搵到嘅每個 instance 各自掛載成一行；之後有新 modpack instance 出現再掛載一次，就只會掛載新嗰個。
- **標籤比睇落重要好多。** 兩個都叫 `saves` 嘅資料夾根本分唔開，所以每個掛載都帶住一個名。內建嘅項目一樣改得名，而且係按 origin 做 key，所以就算家目錄搬咗位都仲保住個名。
- **同一個資料夾掛載兩次**會解析返去已經有嗰行。
- **卸載 (unmount) 淨係改寫一個 JSON 檔，永遠唔會郁個資料夾。** `mounts.test.ts` 會斷言之後啲世界仲喺個碟度，因為喺一串世界隔籬見到「unmount」，正常人會讀成「刪除」。同一個理由，佢亦都冇擺喺破壞性動作 (destructive-action) 嗰道閘後面。

### 每個世界顯示啲乜

個名嚟自 `LevelName`，**唔係**資料夾名，因為呢兩樣成日都唔同。個名底下係一條真正嘅副行，唔係 tooltip：最後遊玩時間 · 版本（係 snapshot 就標明）· 遊戲模式 · Hardcore · cheats · 維度同佢哋嘅 region 檔 · 佔用磁碟大細 · seed · 當資料夾名同世界名唔同時嘅磁碟資料夾 · **佢係由邊個掛載嘅資料夾嚟**。

最尾嗰項唔係裝飾。兩個安裝好常有同名嘅世界，一行分唔出同另一行嘅分別，就係一行遲早會有人搞錯嘅行。

Seed 係用十進位**文字**傳遞。64-bit 嘅 seed 喺 JavaScript number 入面撐唔住，而一個靜靜哋錯咗嘅 seed 仲衰過冇 seed。

讀唔到嘅嘢一律略過，唔會靠估。`level.dat` 讀唔到嘅世界照樣列出，連同所有從來冇疑問嘅資料，再加一句講明少咗啲乜。

### 個清單本身

佢係一個真正嘅 `listbox`：每行係 `role="option"`，揀中嗰個世界有 `aria-selected`，一個 roving tab stop，Arrow/Home/End/PageUp/PageDown 去到頭尾就停、唔會 wrap，每個 option 嘅 accessible name 同時帶住世界名**同埋**成條詳細資料行。

**焦點同選取係特登分開嘅。** 揀一個世界會觸發一次資料夾檢查，所以用方向鍵掃落去九十行，唔可以就咁開九十個檢查。要按 Enter、Space 或者撳一下先算揀咗。

排序係按最後遊玩時間、最新嘅排先，跨晒所有掛載一齊排。日期不明嘅排最後，打和就按名排。

搜尋用嘅係本專案自己嘅 `ConfigSearchField` 配 anchored regex builder，搜尋範圍包括世界名、資料夾名、完整路徑、掛載標籤同埋每一段詳細資料，所以打 `1.20`、`hardcore` 或者某個安裝嘅名都搵到人想要嘅嘢。預設係純文字；regex 要明確 opt-in。詳情睇 [regex-builder.md](regex-builder.md)。

### 手動路徑一樣行得通

打一條路徑、撳掣去瀏覽、將資料夾拖落呢一步度，三樣都得，冇一樣係收埋喺 disclosure 後面，而且**乜都冇掛載**都用得。得一個世界喺 USB 手指嘅人係正常用家，唔係邊緣案例。

拖入或者揀返嚟嘅資料夾如果已經喺清單，就會解析返去嗰一行，唔會出現兩次，所以同一個世界唔會用兩個名出現。

> Electron 喺 v32 攞走咗 `File.path`，所以個 drop target 要靠 `webUtils.getPathForFile` 去解析拖入嘅資料夾，而呢個 API 淨係喺 preload 先用得。所以個 bridge 帶嘅係 `pathForDroppedFile`，而唔係由 renderer 自己讀條路徑。

呢度嗰個瀏覽掣唔係呢個精靈專用。應用程式入面每一個要填本機資料夾或者檔案嘅欄位 —— storage 嘅 tile 資料夾、config 檔嘅 log 路徑、遠端 render target 嘅 SSH key、備份嘅來源資料夾 —— 都有同一個掣，行為一模一樣：佢好似你打字咁直接寫入個欄位，取消對話框就乜都唔改，而當根本冇桌面 app 開唔到原生對話框嗰陣，佢係顯示為 disabled 加解釋，唔係收埋。完整出現位置同行為睇 [Browsing for a folder or a file](./path-field.md)。

### 老實嘅狀態

下面每一個都係有自己文案嘅真實狀態，唔係一個永遠轉唔完嘅 spinner：

- 掃描中，整體同**逐個掛載**都有，各有自己嘅計數
- 完全冇 Minecraft 資料夾，而且**列明佢揾過邊啲路徑**
- 搵到資料夾但入面冇世界，列明佢真正讀過嘅路徑
- 掛載唔見咗或者讀唔到嗰陣**照樣保住嗰行並且講明**——放喺已拔線外置碟上面嘅資料夾，唔係人哋有心唔要嗰隻
- 其中一個資料夾掃描失敗，就喺嗰個資料夾嗰行報告，其他資料夾嘅世界照樣留喺畫面
- `level.dat` 讀唔到嘅世界，用已知資料列出
- 完全冇 bridge（即係喺瀏覽器分頁入面），成節嘢就直接唔出現

### 失效情況同安全

- **乜都唔會寫入。** 掃描係讀取；呢個功能唯一會寫嘅檔案，係 app 自己資料目錄底下嗰個掛載清單。
- **量度大細用雙重上限嘅 walk**，所以結構病態嘅存檔資料夾唔會令一次掃描變成無上限嘅遍歷。
- **`level.dat` 係略讀，唔係成個解析。** 一個 one-pass reader 喺兩個已知路徑度認大約十幾個名，其餘一律跳過，包括 dimension registry —— 佢係現代 `level.dat` 入面最大嗰嚿嘢。
- **畸形或者有惡意嘅 `level.dat` 只會得出一個列咗出嚟但缺少細節嘅世界**，永遠唔會 crash，亦永遠唔會作一個值出嚟。

### 驗證

```sh
cd design && npx vitest run packages/app/src/main/world      # discovery, level.dat, mounts, catalog
cd design && npx vitest run packages/ui/src/components/world # the list, its keyboard model, its states
```

`locations.ts` 係用假嘅平台、環境同家目錄去測試，完全唔掂檔案系統。會掂檔案系統嗰批測試用真嘅暫存目錄，唔用假 `fs`，因為假嘅 `fs` 會幫你決定咗最值得問嗰啲問題 —— 包括 `launcherRoots.test.ts` 建立同讀返出嚟嗰棵 CurseForge 形狀嘅目錄樹。

### 相關文件

- [Worlds ready to use on the Projects tab](project-world-discovery.md) —— 同一個目錄，用第二種方式呈現：自動、有批量操作，並且分得出邊個係偵測到嘅世界、邊個係有人真係設定咗嘅專案
- [regex-builder.md](regex-builder.md) —— 呢個清單搜尋用嘅 builder
- [path-field.md](path-field.md) —— 同一個瀏覽掣，接晒去應用程式其他所有資料夾同檔案欄位
- [Bedrock Edition worlds](bedrock-worlds.md) —— 一個 Bedrock 世界到達呢個位置嗰行所餵嘅偵測器之後會點
- [legacy-1-12-worlds.md](legacy-1-12-worlds.md) —— 1.12.2 世界做到同做唔到啲乜
- [large-worlds.md](large-worlds.md) —— 點樣攞一個仲未喺呢部機上面嘅世界
