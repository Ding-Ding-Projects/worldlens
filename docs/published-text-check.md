# The pre-publication text check

`scripts/check-published-text.mjs` looks for the maintainers' internal shorthand in text this
repository publishes: `CHANGELOG.md`, the generated changelog the in-app viewer reads, the
documentation site, the README, and — the case that prompted it — a commit message, before it
is written.

```
pnpm published-text:check                                   # the published surfaces
node scripts/check-published-text.mjs --commit-msg <file>    # one commit message
node scripts/check-published-text.mjs docs/new-article.md    # exactly these files
node scripts/check-published-text.mjs --show                 # print the terms that matched
```

Issue #168 asked for it, and gave the reason: the eleven files fixed in `fa2f5abb` were found
by a manual sweep, and a manual sweep is exactly what will not happen next time.

## The terms are not in this repository

Holding them is the leak. A previous guard listed seven of them in source in order to assert
their absence, which published the exact words it existed to keep unpublished.

The terms are read from a JSON file **outside** this repository, resolved in this order:

1. `$WORLDLENS_VOCABULARY_TERMS`, an explicit path.
2. A sibling repository, found by walking up from the script's own location.

No username, drive letter or absolute path is written down anywhere in the script.

**An explicitly named path is authoritative.** If `$WORLDLENS_VOCABULARY_TERMS` points at a
file that does not exist, the run skips loudly rather than quietly falling back to a different
file — a typo that silently checks against something else looks exactly like a pass.

Two shapes are accepted:

```json
{ "terms": [ { "alias": "..." }, { "alias": "a / b" } ] }
[ "...", "..." ]
```

An `alias` may carry variants separated by ` / `; each is its own term. Terms shorter than
three characters are dropped, because they match far too much ordinary prose to be a signal.

## When the terms file is absent it skips, and says so

```
check-published-text: SKIPPED - no terms file.
  The terms are deliberately not in this repository: holding them is the leak
  this check exists to prevent.
  Looked in:
    ...
  Set WORLDLENS_VOCABULARY_TERMS to a JSON file to run it.
```

Exit **0**. This repository is public and its CI machines will never have that file; failing
there would make a red run the normal state, and a check whose normal state is red is one
everybody learns to scroll past. That is not hypothetical — it is how `scripts/lint-workflows.mjs`
went two weeks unread, as [`release-workflow-security.md`](release-workflow-security.md) and
issue #167 record.

## A hit never prints the term

```
docs/some-article.md:42:17: internal shorthand
```

File, line, column. Printing the word would put it in a terminal, a CI log or a pasted bug
report, which is the same publication the check exists to prevent. `--show` adds the term, and
is only useful on a machine that already has the terms file.

## The three things it deliberately does not flag

**Binary files.** A term "found" in a PNG is byte noise. Issue #168's own verification section
records this from the manual sweep: a random three-letter string matched five committed PNGs.
Detected by a NUL byte rather than by extension, so an unfamiliar binary is skipped too.

**Reviewed homonyms.** `scripts/published-text-allowlist.json` records occurrences a human has
looked at and found to be the ordinary English or technical word rather than the private sense —
a language runtime's memory allocator, a git plumbing command, a mob name in game data. It holds
**positions and reasons and never a term**, for the same reason the script itself holds none.

Keyed by exact position, so an edit that moves a line re-flags it. That is correct: the review
was of *that occurrence*, not of the word.

**The two files generated from commit history.** `CHANGELOG.md` and
`design/packages/ui/src/components/changelog/changelogData.generated.ts` are regenerated from
git history, so a term in a published commit body reappears on every regeneration. Editing the
generated file is not a fix, and fixing it at the source means rewriting published history and
force-pushing, which invalidates every clone, every commit link in an issue or release note, and
every recorded SHA in `docs/release-ledger.json`. Their hits are counted and named as accepted
residue rather than failing the run:

```
check-published-text: 67 accepted hit(s) in text generated from commit history,
which issue #168 records as unfixable without rewriting published history.
check-published-text: no actionable hit.
```

## What it found on its first run

One real leak, in `docs/release-ledger.json` — a file the earlier manual sweep had already been
over. That is the argument for the check in one line.

## Verification

`scripts/check-published-text.test.mjs`, 11 checks. Every term used in them is invented and
written into a temporary file, so the test names none of the real ones.

The behaviours that matter were proven by breaking them:

| Case | Result |
| --- | --- |
| a new leak in a hand-written doc | exit 1 |
| the same leak in a commit message, before it is written | exit 1 |
| an explicitly named terms file that does not exist | skips loudly, exit 0 |
| the clean tree | no actionable hit |

## Failure modes worth knowing

- **It cannot judge sense.** A word-boundary match cannot tell the memory allocator from the
  private meaning. That is what the allowlist and `--show` are for, and why a human decides.
- **It is not a security boundary.** It catches the shorthand it has been given terms for. A
  term nobody has written down is a term it cannot find.
- **A skip is not a pass.** The wording says so explicitly, because the two are easy to confuse
  at a glance in a log.

---

## 廣東話

`scripts/check-published-text.mjs` 喺出版之前，檢查本 repository 會公開嘅文字入面有冇維護者
嘅內部術語：`CHANGELOG.md`、應用程式內置檢視器讀嗰份生成 changelog、文件網站、README，以及
最初促成呢件工嘅個案 —— 一個 commit message，喺佢寫入之前。

**啲詞唔喺呢個 repository 入面，因為擺喺度本身就係個漏。** 之前有個守衛喺原始碼列出咗七個，
為咗證明佢哋唔存在 —— 結果就出版咗佢本來要防止出版嘅字。啲詞由 repository 外面一個 JSON
檔案讀入：先睇 `$WORLDLENS_VOCABULARY_TERMS`，再由 script 自己位置向上搵隔籬個 repository。
script 入面唔會寫低任何用戶名、碟符或者絕對路徑。明確指定嘅路徑話事：唔存在就大聲跳過，唔會
靜靜雞轉用第二個檔案，因為打錯字而靜靜雞驗咗第二樣嘢，睇落同通過一模一樣。

**搵唔到詞檔就跳過，並且講明。** exit 0。呢個 repository 係公開嘅，佢啲 CI 機永遠唔會有嗰個
檔案；喺嗰度失敗會令紅色變成常態，而一個平時就係紅色嘅檢查，係一個人人都學識跳過嘅檢查。呢
個唔係假設 —— `scripts/lint-workflows.mjs` 兩個禮拜冇人睇，就係咁嚟嘅。

**命中永遠唔會印個詞**，只印檔案、行、欄。印咗就會走入終端機、CI log 或者貼出嚟嘅 bug
report，正正就係佢要防止嘅出版。`--show` 會印埋個詞，而佢淨係喺已經有詞檔嗰部機先有用。

**三樣佢故意唔報：** PNG 之類嘅二進位檔（入面搵到嘅詞係位元組雜訊，用 NUL 位元組判斷，唔靠
副檔名）；已經人手審過嘅同形異義字（記喺 `published-text-allowlist.json`，只有位置同理由，
永遠冇詞；以確切位置做 key，所以改動令行數郁咗就會再彈出嚟，因為審嘅係嗰一處，唔係嗰個字）；
以及由 commit 歷史生成嗰兩個檔案（改生成檔案唔算修好，由源頭修就要 force-push，會令所有
clone、所有 issue 同 release note 入面嘅 commit 連結，同 `docs/release-ledger.json` 入面每個
SHA 全部作廢）。

**佢第一次行就搵到一個真漏**，喺 `docs/release-ledger.json` —— 而嗰個檔案人手掃已經睇過。

**驗證：** `check-published-text.test.mjs` 11 個檢查，入面用嘅詞全部係老作嘅，所以個測試檔案
一個真詞都冇提。要緊嗰幾個行為都係整爛咗嚟證：文件新漏變紅、commit message 未寫入之前同一個
漏都變紅、指定但唔存在嘅詞檔大聲跳過、乾淨嘅 tree 報冇可處理嘅命中。

**要知道嘅限制：** 佢分唔到語意（word boundary 分唔出記憶體嗰個意思同私人意思，所以先要有
allowlist 同 `--show`，而且要由人決定）；佢唔係保安邊界（冇人寫低嘅詞，佢搵唔到）；跳過唔等於
通過（措辭寫明呢點，因為喺 log 度一眼掃過好易撈亂）。
