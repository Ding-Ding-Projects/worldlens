# Automatic repair when a render or the web server fails to start

When a run fails, the app collects what was actually observed and tries to say why. It does that
in two halves, and the order between them is the whole safety of the feature:

1. **Deterministic diagnosis first.** Every failure this project knows the shape of is decided by
   code, from the evidence, with no language model involved anywhere.
2. **A local coding agent only for what is left** — and only if one is installed and the user has
   switched it on — inside guardrails that refuse anything outside a narrow set of files.

If the first half explains the failure, the second half is **not reached at all**. A model asked
"why did this fail?" always answers, and an answer is not the same thing as a cause; for a port
that is already in use there is nothing to gain from asking and a config file to lose.

## The evidence

Assembled at the moment of the failure, because most of it stops being true afterwards:

- the exit code, the signal, and any spawn error (`ENOENT` and friends)
- the last lines of stderr and every `WARNING`/`ERROR` the log reader kept
- upstream's multi-line "problem with your BlueMap setup" banners
- **the config that was in force then**, not after somebody edited it
- which Java ran it and which feature version this app requires
- what Docker was doing, when the run was containerised
- the port a web server tried to bind, the output folder, and each world folder
- the exact command and arguments

### Credentials never leave that record intact

A config folder can hold database credentials: `storages/*.conf` carries a JDBC URL and a
`connection-properties` block with a user name and a password. The evidence is shown on screen,
copied into bug reports, and — when the deterministic half comes up empty — put into a prompt for
a local agent that may send it to whatever model it is configured to use.

So masking happens **on the way in**, not on the way out: every config file is redacted as the
record is built, so nothing downstream can hold an unmasked copy even by accident. Keys are kept
and values replaced, which is all a diagnosis needs — "the password is set" and "the password is
`hunter2`" are the same fact for every purpose here. URL user-information and JDBC query strings
are masked too, because that is the other place a password hides.

## The failures decided without any AI

Each pattern below is quoted from the vendored BlueMap source that prints it, so the claim can be
checked and an upstream bump can be checked against it.

| Diagnosis | Recognised from | What is offered |
|---|---|---|
| `download-not-accepted` | the engine's own `You must accept the required file download…`, or the parsed consent signal | the Settings row that accepts it |
| `port-in-use` | `BlueMap failed to bind to the configured address` / `already in use by some other program` / `java.net.BindException` / Docker's `port is already allocated` | retry on a port the operating system picks |
| `java-missing` | a spawn `ENOENT` on a local run, `'java' is not recognized…`, `java: command not found` | the Java runtime setting |
| `java-too-old` | `UnsupportedClassVersionError`, `class file version …`, **or** the reported version being below the required feature version before anything was printed | a newer runtime, or a container, which supplies one |
| `world-unreadable` | `'<path>' does not exist or is no directory!`, `Failed to load world …` | the world-folder setting, with a container-specific sentence about read-only sharing |
| `output-not-writable` | `AccessDeniedException`, `Read-only file system`, `No space left on device`, attributed to the output folder rather than the config folder | the map-storage setting, and a different sentence for a full disk |
| `out-of-memory` | `java.lang.OutOfMemoryError`, `Could not reserve enough space for object heap`, **or exit code 137**, which is what a container gets when it passes its memory limit and prints nothing at all | retry with a larger heap |
| `config-rejected` | `BlueMap failed to parse this file:` / `Failed to load map-config:` / `BlueMap tried to read this file, but can not access it:` | restore the config folder's last working revision, or fix the file the engine named |

Two more exist for the container path: `docker-unavailable` (with the honest distinction between
not installed and not running, so nobody is told to install Java when Docker was what was
missing) and `docker-image-unavailable`.

More than one can be true at once, and all of them are reported rather than a winner being
picked. Every diagnosis quotes the evidence line it was decided from — never a paraphrase,
because a diagnosis a person cannot check is one they have to take on trust from something that
is about to offer to change their files.

**A cancelled run is diagnosed as nothing.** Cancelling is a decision, not a fault, and offering
to repair it would be offering to repair a decision.

**An unrecognised failure stays unexplained.** A pattern that stops matching after an upstream
change degrades to "I could not work out why", which is the correct failure mode — not matching
something else by accident.

## The coding agent, and everything it may not do

Reached only for a failure nothing above matched, only when the setting is on, and only when
`opencode` is on the account's `PATH`. Absence is reported as an ordinary fact; the app works
without it and the only thing lost is the last resort.

The prompt states the rules in words, and the same list is what the code enforces — the two are
built from one constant so they cannot drift:

- **Nothing inside the Minecraft world folder**, or anywhere outside this run's config folder.
- **No deletion of any file or folder, anywhere, for any reason.**
- **No git**: no commit, checkout, branch switch, reset, rebase, revert, stash, clean, push,
  force-push, or history rewriting of any kind.
- **No sending the config, logs or paths anywhere**: no HTTP request, upload, paste service,
  issue or telemetry.
- No installing or removing software; no starting or stopping the app, a render, the web server,
  Docker or a container.
- **No inventing a cause.** If the evidence does not say why, the answer is "I do not know".

The words are a courtesy, because an agent told the rules is likelier to follow them. The
enforcement is the guard, which every proposed edit passes through before a file is opened:

- the path must resolve inside **this run's config folder** — absolute paths are accepted only
  when they genuinely are, and are then reduced to a relative name so there is one check rather
  than two;
- the file must be one BlueMap loads as config: `core.conf`, `webapp.conf`, `webserver.conf`,
  `plugin.conf`, `maps/<name>.conf`, `storages/<name>.conf`, in either supported spelling — the
  same set the options editor writes, checked by the same function;
- a deletion is refused as a category;
- anything inside a world folder is refused explicitly, even though the folder rule already
  excludes it;
- a file named twice in one repair has **no** version written, rather than letting whichever the
  agent emitted last silently win.

A refusal never fails the batch: an agent that proposes one good edit and one that reaches
outside the folder has still worked something out. Every refusal is reported in full beside what
was applied, so nothing is silently dropped.

## Doing nothing is a correct outcome

Five different results all mean "nothing was changed", and they are reported differently because
they suggest different next steps:

- the failure was explained deterministically, so no agent was consulted;
- automatic repair is switched off;
- no coding agent is installed;
- the agent answered `"cause": null` — it did not know either;
- the agent answered in prose, or everything it proposed was refused.

"I could not work out why this failed" costs a person one sentence. A confident wrong edit costs
them a config file and their trust in the feature.

## Every change is recorded and shown

Before a file is written it is read, so the change can be shown as a **unified diff** — the
format every developer already reads and which pastes into an issue unchanged. After the writes,
the config folder's own [local version history](./config-history.md) is asked to snapshot it, so
the automatic change is an ordinary revision that can be restored, and that restore undone in
turn, exactly like any change a person made.

A file whose proposed contents are byte-identical to what is already there is not written and not
recorded: a row in the history panel for an event that did not happen makes the real events
harder to find. A history write that fails never undoes the repair that succeeded — the change is
kept and the failure is reported, the same rule the history layer states for a person's own save.

## Failure modes

| What happens | What the app does |
|---|---|
| The agent is not installed | says so plainly; the deterministic diagnosis is still complete |
| The agent cannot be run | reports the reason; nothing is changed |
| The agent answers in prose | refuses the reply whole rather than inferring an edit from it |
| The agent answers with invalid JSON | the same |
| The agent proposes a deletion | refused by name, and the person is told it was asked for |
| The agent proposes a path outside the folder | refused, with the path, and nothing is written |
| A write fails | reported per file; the other files still applied |
| The history cannot be recorded | the change is kept and the report says it cannot be undone from the panel |
| The pass itself throws | it does not: every step's failure is a field in the result |

## Security considerations

- The evidence a repair works from is put in place by the main process at the moment of failure.
  The renderer names a failure by id and never describes one — otherwise whatever runs in that
  window would choose the config folder a repair writes into and the world folders it is told to
  keep away from.
- Config text is masked before it is stored, before it is displayed and before it reaches a
  prompt.
- The agent is invoked with the prompt as a single argv element and no shell, so nothing in a
  path or a log line can become a second command.
- The agent is opt-in. Handing a failure report — even a masked one — to a program that may send
  it to a model is a decision somebody makes once, knowingly, not something that happens because
  a render failed.
- The repair pass has no network, no process and no git channel of its own. It reads and writes
  config files and nothing else.

## Verification

`design/packages/app/src/main/repair/` carries 102 tests, none of which need `opencode` installed:

- `diagnose.test.ts` — every failure class above, in and correct diagnosis out, including both
  wordings of a port conflict, Java 8's version spelling not being read as version 1, the exit-137
  container kill that prints no Java error, several causes at once, and the two cases that must
  yield **nothing**: a cancelled run and an unrecognised exception.
- `guardrails.test.ts` — deletion, traversal, absolute paths outside the folder, a file inside a
  world, a non-config file, a config file in a folder BlueMap does not read, an oversized file,
  and a file named twice.
- `pass.test.ts` — that the agent is never consulted for an explained failure, that "I do not
  know" is accepted, that a refused edit writes nothing while a good one beside it still applies,
  that the diff and the history record are produced, and that a failed write or a failed history
  write is reported rather than hidden.
- `agent.test.ts` — detection when absent, the prompt naming every prohibition, and a reply parser
  that refuses prose.
- `evidence.test.ts` — credentials masked in every place they hide, and never present anywhere in
  the serialised record.
- `diff.test.ts`, `ipc.test.ts` — the diff's hunks and counts, and that no channel rejects.

## Suggested articles

- [Running the engine on this computer, or in a container](./docker-and-local.md) — the two ways a
  run can be started, and the container-specific failures the repair pass recognises.
- [Local version history for config folders](./config-history.md) — where an automatic change is
  recorded, and how it is undone.
- [Renders that survive being interrupted](./resumable-renders.md) — what happens to a render that
  started and then stopped.

## 廣東話

呢篇講嘅係 render 或者 web server 開唔到嗰陣嘅自動修復 (automatic repair)。

一次 run 失敗嗰陣，個 app 會收集實際觀察到嘅嘢，再嘗試講出點解。佢分兩半去做，而兩者之間嘅次序就係成個功能嘅安全所在：

1. **先做確定性診斷 (deterministic diagnosis)。** 凡係呢個專案識得嗰種形狀嘅失敗，都係由程式碼根據證據去判定，全程冇任何語言模型參與。
2. **剩返嗰啲先至交畀本地 coding agent** —— 而且淨係喺真係裝咗、用戶又開咗嗰個設定嘅時候 —— 仲要喺一套會拒絕碰狹窄檔案集以外任何嘢嘅 guardrails 入面行。

如果第一半已經解釋到個失敗，第二半就**根本唔會行到**。你問一個模型「點解會失敗？」，佢一定會答你，但一個答案唔等於一個成因；對住一個已經被佔用嘅 port，問極都冇嘢好賺，反而輸得起一個 config 檔。

### 證據 (The evidence)

證據係喺失敗嗰一刻即時組裝，因為大部分過咗之後就唔再成立：exit code、signal 同任何 spawn error（`ENOENT` 嗰類）；stderr 最後幾行同 log reader 保留嘅每個 `WARNING`/`ERROR`；上游嗰啲多行 "problem with your BlueMap setup" banner；**當時生效嗰份 config**，而唔係有人改完之後嗰份；邊個 Java 行佢、同呢個 app 要求邊個 feature version；如果係容器化嘅 run，就記低 Docker 當時做緊乜；web server 試圖綁嘅 port、output 資料夾同每個 world 資料夾；仲有準確嘅指令同參數。

#### 憑證永遠唔會原封不動咁留喺記錄入面

一個 config 資料夾可以載住資料庫憑證：`storages/*.conf` 帶住一條 JDBC URL 同一個 `connection-properties` 區塊，入面有用戶名同密碼。啲證據會喺畫面顯示、會被複製入 bug report，而且喺確定性嗰半交白卷嗰陣，仲會擺入畀本地 agent 嘅 prompt，而嗰個 agent 可能會將佢送去佢設定嗰個模型。

所以遮蔽 (masking) 係喺**入嗰邊**做，唔係出嗰邊：每個 config 檔喺記錄組裝嗰陣就已經 redact 咗，令下游冇任何嘢有機會就算意外都攞到一份未遮蔽嘅副本。做法係保留 key、換走 value，而診斷需要嘅就只係咁多 ——「密碼有設定」同「密碼係 `hunter2`」喺呢度所有用途上都係同一個事實。URL 嘅 user-information 同 JDBC query string 一樣會遮蔽，因為嗰度就係密碼另一個匿藏處。

### 完全唔靠 AI 判定嘅失敗

下面每個 pattern 都係由 vendored 嘅 BlueMap 原始碼度引出嚟嘅，所以呢個聲稱可以查證，上游升級之後亦可以對返。

`download-not-accepted`：由引擎自己嗰句 `You must accept the required file download…` 或者解析到嘅同意訊號認出，提供嘅係接受佢嗰行 Settings。`port-in-use`：由 `BlueMap failed to bind to the configured address`、`already in use by some other program`、`java.net.BindException` 或者 Docker 嘅 `port is already allocated` 認出，提供用作業系統自己揀嘅 port 重試。`java-missing`：由本地 run 嘅 spawn `ENOENT`、`'java' is not recognized…`、`java: command not found` 認出，提供 Java runtime 設定。`java-too-old`：由 `UnsupportedClassVersionError`、`class file version …`，**或者**喺乜都未印之前所報告嘅版本已經低過要求嘅 feature version 認出，提供新啲嘅 runtime 或者一個自帶 runtime 嘅容器。`world-unreadable`：由 `'<path>' does not exist or is no directory!`、`Failed to load world …` 認出，提供 world 資料夾設定，並且附一句針對容器唯讀分享嘅說明。`output-not-writable`：由 `AccessDeniedException`、`Read-only file system`、`No space left on device` 認出，而且係歸咎於 output 資料夾而唔係 config 資料夾，提供 map-storage 設定，磁碟爆滿嗰陣另有一句唔同嘅說明。`out-of-memory`：由 `java.lang.OutOfMemoryError`、`Could not reserve enough space for object heap`，**或者 exit code 137** 認出 —— 後者就係一個容器爆咗記憶體上限而乜都印唔到嗰陣會攞到嘅嘢 —— 提供用大啲嘅 heap 重試。`config-rejected`：由 `BlueMap failed to parse this file:`、`Failed to load map-config:`、`BlueMap tried to read this file, but can not access it:` 認出，提供還原 config 資料夾最後一個可用版本，或者修返引擎點名嗰個檔案。

容器路徑仲有多兩個：`docker-unavailable`（會老實分開「冇裝」同「冇行緊」，等冇人喺明明係 Docker 唔見咗嗰陣被叫去裝 Java）同 `docker-image-unavailable`。

同一時間可以有多過一個成立，而且全部都會報告，唔會揀個贏家出嚟。每個診斷都會引用佢據以判定嗰行證據 —— 一定係原文，唔會意譯，因為一個用戶查唔到嘅診斷，就係佢要盲信一樣就嚟提議改佢啲檔案嘅嘢。

**畀人取消嘅 run 唔會有任何診斷。** 取消係一個決定，唔係一個故障，提議修復佢即係提議修復一個決定。

**認唔到嘅失敗會維持冇解釋。** 一個 pattern 喺上游改動之後對唔上，就會退化成「我搵唔出點解」，而呢個先係正確嘅失敗模式 —— 好過誤中副車咁夾硬對上第二樣嘢。

### Coding agent，同佢唔准做嘅所有嘢

淨係喺上面全部都對唔上嘅失敗、設定開咗、而且 `opencode` 喺個帳戶嘅 `PATH` 上面嗰陣先會用到佢。冇裝就當一件平常事咁報告；個 app 冇佢一樣行到，蝕嘅淨係最後一道板斧。

個 prompt 會用文字講明規則，而程式碼強制執行嘅係同一份清單 —— 兩邊由同一個常數砌出嚟，所以唔會走樣：

- **唔准掂 Minecraft world 資料夾入面任何嘢**，亦唔准掂今次 run 嘅 config 資料夾以外任何地方。
- **唔准刪除任何檔案或者資料夾，任何地方，任何理由都唔得。**
- **唔准用 git**：唔准 commit、checkout、切 branch、reset、rebase、revert、stash、clean、push、force-push，或者任何形式嘅改寫歷史。
- **唔准將 config、log 或者路徑送去任何地方**：唔准 HTTP request、上載、貼上服務、開 issue 或者 telemetry。
- 唔准安裝或者移除軟件；唔准啟動或者停止個 app、一次 render、web server、Docker 或者容器。
- **唔准作一個成因出嚟。** 如果啲證據冇講點解，答案就係「我唔知」。

用文字寫出嚟係一種禮貌，因為畀人講咗規則嘅 agent 比較大機會跟。真正把關嘅係 guard，每一個被提議嘅編輯喺開檔之前都要過佢：

- 路徑要解析到**今次 run 嘅 config 資料夾**入面 —— 絕對路徑淨係喺佢真係喺入面嗰陣先接受，然後會化成相對名，令檢查得一次而唔係兩次；
- 個檔要係 BlueMap 當 config 去載嗰啲：`core.conf`、`webapp.conf`、`webserver.conf`、`plugin.conf`、`maps/<name>.conf`、`storages/<name>.conf`，兩種支援嘅串法都得 —— 同 options editor 寫入嘅係同一個集合，用同一個 function 檢查；
- 刪除係整類拒絕；
- world 資料夾入面任何嘢都會明確拒絕，即使資料夾規則本身已經排除咗佢；
- 同一次修復入面被點名兩次嘅檔案，**一個版本都唔會**寫入，唔會等 agent 最後 emit 嗰個靜靜雞贏。

一次拒絕唔會令成批嘢失敗：一個 agent 提議咗一個好嘅編輯同一個伸出咗資料夾之外嘅編輯，佢始終都係搞掂咗啲嘢。每一次拒絕都會連同已套用嘅嘢一齊完整報告，所以冇嘢會被靜靜雞掉低。

### 乜都唔做係一個正確結果

有五種唔同結果都係「乜都冇改」，而佢哋分開報告，因為佢哋暗示唔同嘅下一步：個失敗已經被確定性咁解釋咗，所以冇問過 agent；自動修復根本熄咗；冇裝任何 coding agent；agent 答 `"cause": null`，即係佢都唔知；agent 用散文答，或者佢提議嘅嘢全部被拒絕。

「我搵唔出點解會失敗」對一個人嚟講只係一句說話嘅代價。一個好肯定但錯嘅編輯，代價係佢一個 config 檔，同埋佢對呢個功能嘅信任。

### 每個改動都會記錄同展示

寫入一個檔之前會先讀返佢，令個改動可以用 **unified diff** 呈現 —— 呢個格式每個開發者都已經識睇，而且原樣貼落 issue 都得。寫完之後，會叫 config 資料夾自己嘅[本地版本歷史](./config-history.md)影一個 snapshot，令呢個自動改動變成一個普通嘅 revision，可以還原，而嗰個還原本身又可以再撤銷，同人手改嘅改動完全一樣。

如果一個檔被提議嘅內容同而家嗰份逐 byte 一樣，就唔會寫入亦唔會記錄：喺歷史面板為一件冇發生過嘅事開一行，只會令真正發生過嘅事更難搵。歷史寫入失敗永遠唔會撤銷已經成功嘅修復 —— 改動會保住，失敗會報告，同歷史層對人手 save 所講嘅規則一樣。

### 失敗情況 (Failure modes)

Agent 冇裝：老實講出嚟，確定性診斷仍然完整。Agent 行唔到：報告原因，乜都唔改。Agent 用散文答：整份回覆拒絕，唔會由入面推斷出一個編輯。Agent 答一份無效 JSON：一樣處理。Agent 提議刪除：點名拒絕，並且話返畀人知佢曾經要求過。Agent 提議資料夾以外嘅路徑：拒絕，連路徑一齊講，乜都唔寫。寫入失敗：逐個檔報告，其他檔照樣套用咗。歷史記錄唔到：改動保住，報告會講明喺面板度撤銷唔到。至於「成個 pass 自己 throw」：唔會發生，因為每一步嘅失敗都係結果入面嘅一個欄位。

### 保安考慮 (Security considerations)

- 修復所根據嘅證據係由 main process 喺失敗嗰一刻擺落去嘅。Renderer 淨係用 id 去命名一個失敗，永遠唔會描述一個失敗 —— 否則喺嗰個視窗入面行緊嘅嘢就會有得揀修復要寫入邊個 config 資料夾、同埋叫佢唔好掂邊啲 world 資料夾。
- Config 文字喺儲存之前、顯示之前同去到 prompt 之前都已經遮蔽。
- 叫 agent 嗰陣，個 prompt 係當成單一個 argv 元素咁傳，唔經 shell，所以路徑或者 log 行入面冇嘢可以變成第二條指令。
- Agent 係 opt-in。將一份失敗報告 —— 就算遮蔽咗 —— 交畀一個可能會送去模型嘅程式，係一個人明知咁做一次嘅決定，唔係因為 render 失敗就自動發生嘅事。
- 修復 pass 自己冇網絡、冇 process、亦冇 git 通道。佢淨係讀寫 config 檔，冇其他。

### 驗證 (Verification)

`design/packages/app/src/main/repair/` 帶住 102 個測試，全部都唔需要裝 `opencode`：

- `diagnose.test.ts` —— 上面每一類失敗，入乜證據出乜診斷，包括 port 衝突嘅兩種寫法、Java 8 嘅版本串法唔可以被讀成版本 1、印唔到 Java error 嘅 exit-137 容器 kill、幾個成因同時成立，同埋兩個一定要交白卷嘅情況：畀人取消嘅 run 同認唔到嘅例外。
- `guardrails.test.ts` —— 刪除、路徑穿越、資料夾以外嘅絕對路徑、world 入面嘅檔、非 config 檔、放喺 BlueMap 唔會讀嗰個資料夾入面嘅 config 檔、超大檔，同埋被點名兩次嘅檔。
- `pass.test.ts` —— 已解釋嘅失敗永遠唔會問 agent、接受「我唔知」、被拒絕嘅編輯乜都唔寫但隔籬一個好嘅仍然照樣套用、diff 同歷史記錄有產生出嚟，以及寫入失敗或者歷史寫入失敗係報告出嚟而唔係收埋。
- `agent.test.ts` —— 唔存在時嘅偵測、prompt 有點名每一項禁令，同埋一個會拒絕散文嘅回覆解析器。
- `evidence.test.ts` —— 憑證喺佢會匿藏嘅每個位都遮蔽咗，而且喺序列化嘅記錄入面任何地方都唔會出現。
- `diff.test.ts`、`ipc.test.ts` —— diff 嘅 hunk 同計數，以及冇任何 channel 會拒收。

### 建議文章 (Suggested articles)

英文版最後指向三篇：[Running the engine on this computer, or in a container](./docker-and-local.md)，講開一次 run 嘅兩種方式，同修復 pass 認得嘅容器專屬失敗；[Local version history for config folders](./config-history.md)，講自動改動記錄喺邊同點撤銷；[Renders that survive being interrupted](./resumable-renders.md)，講一次開咗之後停低嘅 render 會點。
