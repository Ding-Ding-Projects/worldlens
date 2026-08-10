# Changelog and the in-app changelog viewer

The project's changelog is generated from its own git history and its release tags, and it is
readable inside the application rather than only on a website. Every entry carries the full SHA
of the commit that made the change, and generation fails rather than emitting a reference to a
commit that cannot be resolved.

## Behaviour

### Where the record comes from

`scripts/build-changelog.mjs` reads the repository and writes two files:

| Output | What it is |
|---|---|
| `CHANGELOG.md` | The scannable record: every version, its date, its entries grouped by area, each linked to its commit. |
| `design/packages/ui/src/components/changelog/changelogData.generated.ts` | The same record plus each commit's full message body, which is what the viewer renders and searches. Its generated filename and banner keep quoted historical prose outside executable-source policy scans. |

Both are generated. Neither is edited by hand.

Commits that change only these two generated outputs are excluded from the Unreleased input. That
makes the freshness contract stable: generate, commit the two outputs, and the new generated-only
commit does not immediately make its own result stale.

- **Versions are the tags the release workflow published.** A version's entries are the commits
  reachable from its tag and from no earlier tag. That is not `previous..current`: three tags in
  this repository sit on a side branch that was merged later, and a range against the immediately
  preceding tag alone would either lose those commits or replay them under a later version.
- **The date on a version is the tagged commit's own date.** The tags are lightweight, and the
  GitHub Release for a tag is published minutes later by the same workflow run. Taking the
  publication timestamp instead would make generation depend on the network and produce a
  different file offline.
- **Entries are grouped by the area of the repository they changed**, derived from the paths in
  each commit. They are deliberately not classified as features or fixes: the commits here carry
  no such marker, so any such label would be inferred from the wording of a subject line, and a
  changelog that infers is a changelog that eventually says something nobody wrote.
- **A merge commit is one entry, marked as a summary**, carrying how many commits it brought to
  the mainline. Those commits are listed under the same version alongside it, and its own files
  are the diff against its first parent, so it is categorised by what it actually brought in.
- **A version that shipped with nothing recorded says so.** A tag can land on a commit an earlier
  tag already carried. That version keeps its place in the list with an explicit line, because a
  gap in a version list reads as history that was lost.

### The viewer

`design/packages/ui/src/components/changelog/` holds it. `ChangelogViewer` needs no props: the
data is compiled in, and the props exist so a test can mount it over a fixture.

- **Every released version**, not only the newest, plus an Unreleased section for work that is
  committed but not yet carried by a published release.
- **A search** wired to the app's own `ConfigSearchField` and the regex builder anchored to it.
  Plain text is the default and stays a case-insensitive substring match; regex is an explicit
  opt-in; query, pattern, flags, validation and mode are one piece of state shared by the field
  and the builder. The search covers each entry's subject, its full commit message, its short SHA
  and its full SHA.
- **A date filter** with two typed fields and an anchored calendar: month and year jump, range
  selection by clicking two days, and presets (today, last 7 days, last 30 days, this month, this
  year, all time). The fields accept plain ISO in every locale and the active locale's own numeric
  order, worked out from `Intl` rather than assumed.
- **The two filters compose** with "and". Both are named in the count line above the list, so a
  surprising result can be explained by reading one sentence rather than by clearing controls one
  at a time to find out which was responsible.
- **Copy and export** to Markdown or plain text, honouring the active filter and any selection.
  The file states its own scope in its first lines, and every entry carries the full SHA in text,
  so a changelog that has left the app is still traceable.
- **Commit references render short and link long**: ten hex digits on screen, the full forty in
  the accessible name and in every export.

## Configuration

Regenerate after committing:

```
node scripts/build-changelog.mjs
```

Prove the committed outputs are current, which is what CI should run:

```
node scripts/build-changelog.mjs --check
```

`--check` compares both outputs against what the current history produces and exits non-zero with
the file that is stale. The early workflow-security job runs it before any release can publish. It
needs the full history: a default `actions/checkout` is a depth-1 clone, so that job uses
`fetch-depth: 0`.

## Failure modes

- **An unresolvable commit reference aborts generation.** Every SHA is fed through
  `git cat-file --batch-check` before anything is written, and one missing object stops the run
  with the offending reference named. A wrong SHA is worse than no SHA, because it sends the
  reader somewhere confidently irrelevant.
- **Two commits that render the same short form abort generation**, rather than shipping two
  links that look identical.
- **A partly typed date is not an error.** `2026-08` is reported as incomplete, the text is left
  exactly as entered, and the range keeps its previous value. `2026-02-31` is reported as a date
  that does not exist. Nothing is silently applied and nothing is silently discarded.
- **A version filtered down to nothing is dropped**, while a version that genuinely shipped
  nothing is kept and labelled. Those two facts must never look the same, so the empty version is
  hidden while a filter is active: it has no text and no dates in it, so it cannot have matched.
- **An empty result names what filtered it** and offers to clear the filters, rather than saying
  "no results" and leaving a stale date range invisible.
- **A clipboard that refuses says so.** The desktop shell's own `clipboard:writeText` channel is
  tried first and the browser's API second; a failure is reported rather than leaving a button
  that looked like it worked.

## Security

Nothing here reaches the network. The changelog is compiled into the bundle, the search runs on
the local `RegExp` engine under the bounds `components/config/regexEngine.ts` states (512-character
pattern, 20000-character sample, 500 matches, 100 ms per preview run), and no pattern, sample or
export is transmitted, logged or persisted. Commit links open in a new context with
`rel="noopener noreferrer"`, so a navigation cannot replace the application window.

## Accessibility

The viewer is a labelled region with a heading, the count line is a polite live region, every
entry's checkbox is named with the entry it selects, and every commit link is named with the full
SHA rather than with the ten digits on screen. The calendar is a grid with a roving tabindex:
exactly one cell is tabbable, arrow keys move it, Home and End reach the ends of the month, and
PageUp/PageDown page by month and (with Shift) by year. The calendar is a card, so it paints its
own surface rather than letting the list behind it read through; it is bounded to the viewport and
scrolls inside that bound rather than clipping a week off the bottom; and it opens below and to
the start of the button that summoned it, so it never covers that button. Day cells are at least
32 by 32 pixels, and a day that carries entries is marked in its accessible name as well as with a
dot.

## Verification

| Test | What it holds |
|---|---|
| `changelogData.test.ts` | Every referenced commit exists in the repository, every short SHA is a real prefix of its full SHA and unique, each commit appears exactly once, every category is one the viewer can label, and the subjects match what `git log` says. The git assertions are skipped, visibly, on a shallow clone. |
| `changelogModel.test.ts` | The filters compose rather than override, an empty version is kept and marked while unfiltered and dropped while filtered, exports state their range, keep the full SHA in text and honour a selection, and the no-match state is honest. |
| `changelogDates.test.ts` | ISO parses in every locale, the locale's own numeric order is read from `Intl`, incomplete input is distinguished from impossible input and from unparsable input, no parse ever returns a day beside an error, the month grid is six consecutive weeks padded from its neighbours, and the presets are computed against a supplied day rather than the clock. |
| `ChangelogViewer.test.ts` | Mounted: every version reaches the DOM, commit links carry the full SHA, the search narrows the list and names itself, the date range and search compose in the component, the empty state names both filters and clears them, copying goes through the shell's clipboard channel, a selection narrows the export, and the region, headings and checkbox names are present. |

Run them with `npx vitest run packages/ui/src/components/changelog` from `design/`.

## 廣東話

### 概覽

呢個專案嘅變更記錄 (changelog) 係由佢自己嘅 git 歷史同 release tag 生成出嚟嘅，
而且可以喺應用程式入面睇，唔係淨係喺網站先睇到。每一項都帶住做嗰個改動嘅 commit 嘅完整 SHA，
而如果有 commit 解析唔到，生成過程會直接失敗，唔會出一個解析唔到嘅引用。

### 記錄由邊度嚟

`scripts/build-changelog.mjs` 會讀個 repository，寫出兩個檔。`CHANGELOG.md` 係方便掃視嘅記錄：
每個版本、佢嘅日期、按範疇分組嘅項目，每項都連去佢嘅 commit。
`design/packages/ui/src/components/changelog/changelogData.generated.ts` 係同一份記錄，
再加埋每個 commit 嘅完整訊息內文，而嗰啲就係 viewer 攞嚟 render 同搜尋嘅嘢；佢嘅生成檔名同 banner
令引用返嚟嘅歷史文字唔會落入可執行源碼嘅政策掃描範圍。兩個檔都係生成嘅，兩個都唔係人手改。

只改呢兩個生成輸出嘅 commit 唔會計入 Unreleased 嘅輸入。咁樣個新鮮度契約先穩定：生成、commit 嗰兩個輸出，
而嗰個「淨係生成」嘅新 commit 唔會即刻令佢自己嘅結果過時。

- **版本就係 release workflow 發佈咗嘅 tag。** 一個版本嘅項目，係由佢個 tag 到得到、而且冇任何更早 tag
  到得到嘅 commit。呢個唔係 `previous..current`：呢個 repository 有三個 tag 坐喺一條之後先 merge 返嘅側支上面，
  淨係對住緊接住嘅前一個 tag 做 range，唔係會漏咗嗰啲 commit，就係會喺更後嘅版本度再播一次。
- **一個版本嘅日期，係嗰個被 tag 嘅 commit 自己嘅日期。** 啲 tag 係 lightweight，
  而一個 tag 對應嘅 GitHub Release 係同一次 workflow run 幾分鐘之後先發佈。如果改為攞發佈時間戳，
  生成就會依賴網絡，離線嗰陣仲會出到一個唔同嘅檔。
- **項目係按佢改咗 repository 邊個範疇分組**，由每個 commit 入面嘅路徑推導出嚟。
  佢哋刻意唔分做 feature 定 fix：呢度啲 commit 冇呢類標記，所以任何咁樣嘅標籤都要靠 subject 行嘅字眼去推斷，
  而一個會推斷嘅 changelog，最終會講出啲冇人寫過嘅嘢。
- **一個 merge commit 算一項，標記做 summary**，帶住佢帶咗幾多個 commit 入主線。
  嗰啲 commit 會喺同一個版本入面同佢並列咁列出，而佢自己嘅檔案係對住第一個 parent 嘅 diff，
  所以佢係按佢實際帶入咗乜嘢嚟分類。
- **一個乜都冇記錄到嘅版本會照講出嚟。** 一個 tag 可以落喺一個更早嘅 tag 已經涵蓋咗嘅 commit 上面。
  嗰個版本仍然會保住佢喺清單入面嘅位置，加一行明確講明，因為版本清單入面有個窿，讀落好似段歷史唔見咗咁。

### Viewer

`design/packages/ui/src/components/changelog/` 就係佢。`ChangelogViewer` 唔需要任何 prop：
啲資料係編譯入去嘅，啲 prop 存在只係為咗測試可以掛住一份 fixture mount 佢。

- **每一個已發佈嘅版本**，唔止最新嗰個，仲有一個 Unreleased 區段，放已經 commit 但仲未由已發佈 release
  帶住嘅工作。
- **搜尋**，接住 app 自己嘅 `ConfigSearchField` 同錨定喺佢身上嘅 regex builder。純文字係預設，
  維持大小寫不敏感嘅子字串比對；regex 要明確 opt-in；query、pattern、flag、驗證同模式係一份共用狀態，
  由輸入欄同 builder 一齊用。搜尋涵蓋每一項嘅 subject、完整 commit 訊息、短 SHA 同完整 SHA。
- **日期篩選**，有兩個有型別嘅欄位同一個錨定嘅日曆：可以跳月跳年、撳兩日就選到範圍，
  仲有預設值（today、last 7 days、last 30 days、this month、this year、all time）。
  啲欄位喺任何 locale 都收得純 ISO，亦收得當前 locale 自己嘅數字次序，而嗰個次序係由 `Intl` 推算出嚟，
  唔係靠估。
- **兩個篩選以「and」組合**。兩個都會喺清單上面嗰行計數句子度指名，所以一個出人意表嘅結果，
  可以靠讀一句嘢解釋到，唔使逐個控制項清走去查邊個做成。
- **複製同匯出**成 Markdown 或者純文字，會尊重當前篩選同任何選取。個檔頭幾行會自己講明佢嘅範圍，
  而且每一項都喺文字入面帶住完整 SHA，所以一份離開咗 app 嘅 changelog 一樣追查得返。
- **Commit 引用顯示短、連結長**：畫面上十個十六進位數字，完整四十個就喺無障礙名稱同每次匯出入面。

### 設定同用法

Commit 之後重新生成：

```
node scripts/build-changelog.mjs
```

證明已 commit 嘅輸出係最新，呢句就係 CI 應該行嗰句：

```
node scripts/build-changelog.mjs --check
```

`--check` 會將兩個輸出同當前歷史產生嘅結果比較，唔一致就以非零狀態退出，並指名邊個檔過時咗。
前期嗰個 workflow-security job 會喺任何 release 發佈之前行佢。佢需要完整歷史：
預設嘅 `actions/checkout` 係 depth-1 clone，所以嗰個 job 要用 `fetch-depth: 0`。

### 失敗模式

- **解析唔到嘅 commit 引用會終止生成。** 每個 SHA 喺寫任何嘢之前都要經 `git cat-file --batch-check`，
  一個 object 唔見咗就會停低成個 run，並指名嗰個出事嘅引用。一個錯 SHA 差過冇 SHA，
  因為佢會好自信咁送讀者去一個唔相干嘅地方。
- **兩個 commit 產生相同短格式會終止生成**，好過出兩條睇落一模一樣嘅連結。
- **打咗一半嘅日期唔算錯。** `2026-08` 會報做未完整，文字原封不動保留返用戶打嗰個樣，
  範圍維持之前嘅值。`2026-02-31` 會報做一個唔存在嘅日期。冇嘢會靜靜雞套用，亦冇嘢會靜靜雞掉咗。
- **被篩到乜都冇嘅版本會被拿走**，而一個真係冇出過嘢嘅版本就會保留兼標記。呢兩件事永遠唔可以睇落一樣，
  所以有篩選生效嗰陣，個空版本會收埋：佢入面冇文字亦冇日期，所以佢根本不可能符合。
- **空結果會講出係咩篩走咗**，並提供清除篩選嘅選項，而唔係得句「no results」，
  留低一個睇唔到嘅過期日期範圍。
- **剪貼簿唔肯做嘅時候會照講。** 會先試桌面 shell 自己嗰條 `clipboard:writeText` channel，
  再試瀏覽器嘅 API；失敗會報出嚟，唔會留低一粒睇落好似成功咗嘅掣。

### 保安

呢度冇任何嘢會出網絡。Changelog 係編譯入 bundle 入面，搜尋喺本機 `RegExp` engine 度行，
受 `components/config/regexEngine.ts` 訂明嘅界限限制（pattern 512 字元、樣本 20000 字元、500 個 match、
每次預覽 100 ms），而且冇任何 pattern、樣本或者匯出會被傳送、記錄或者持久化。
Commit 連結喺新 context 開，帶 `rel="noopener noreferrer"`，所以一次導航唔可以取代到應用程式視窗。

### 無障礙

個 viewer 係一個有標籤、有標題嘅 region，計數嗰行係一個 polite live region，
每一項嘅 checkbox 都用佢選中嗰項嚟命名，而每條 commit 連結都用完整 SHA 命名，唔係用畫面上嗰十個數字。
個日曆係一個 grid，用 roving tabindex：任何時候剛好得一格入到 tab，方向鍵移動佢，
Home 同 End 去到當月頭尾，PageUp／PageDown 逐月翻，撳住 Shift 就逐年翻。個日曆係一張 card，
所以佢自己畫底面，唔會畀後面嘅清單透出嚟；佢受 viewport 限制，喺個界限入面自己捲動，
唔會將最尾一個星期剪走；佢喺召喚佢嗰粒掣嘅下面兼起始側打開，所以永遠唔會遮住嗰粒掣。
日格至少 32 × 32 像素，而有項目嘅日子除咗一點標記之外，喺無障礙名稱入面都會標明。

### 核實

測試分四組。`changelogData.test.ts` 保住：每個被引用嘅 commit 喺 repository 度真係存在、
每個短 SHA 都係佢完整 SHA 嘅真前綴而且唯一、每個 commit 只出現一次、每個分類都係 viewer 標得到嘅、
而且啲 subject 同 `git log` 講嘅一致；喺 shallow clone 上面，啲 git 斷言會被跳過，而且跳得見得人。
`changelogModel.test.ts` 保住：啲篩選係組合而唔係互相覆蓋、空版本喺冇篩選時保留兼標記、有篩選時拿走、
匯出會講明自己嘅範圍、喺文字入面保住完整 SHA 兼尊重選取，而冇 match 嘅狀態要老實。
`changelogDates.test.ts` 保住：ISO 喺每個 locale 都 parse 到、locale 自己嘅數字次序係由 `Intl` 讀出嚟、
未完整輸入同不可能嘅輸入同 parse 唔到嘅輸入分得開、任何 parse 都唔會一邊回傳日子一邊回傳錯誤、
月曆格係六個連續星期並由前後月份補滿，而啲 preset 係對住一個傳入嘅日子計，唔係對住時鐘。
`ChangelogViewer.test.ts` 係掛住 mount 嚟測：每個版本都去到 DOM、commit 連結帶住完整 SHA、
搜尋會收窄清單兼自己講明、日期範圍同搜尋喺元件入面組合得到、空狀態會指名兩個篩選兼清得走、
複製會經 shell 嘅剪貼簿 channel、選取會收窄匯出，而且 region、標題同 checkbox 名稱都存在。

喺 `design/` 底下用 `npx vitest run packages/ui/src/components/changelog` 行佢哋。
