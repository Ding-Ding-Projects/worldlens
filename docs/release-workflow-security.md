# Release workflow security boundary

The release job turns repository state, prior-job outputs and metadata from the public dim-sum
catalog into release notes and assets. Dynamic values cross into a shell only through explicit
environment mappings. The shell reads those variables inside double quotes and passes them to
data-only consumers; no Actions expression is inserted into executable script text.

## Behaviour

Six steps form the watched boundary: **Resolve release tag**, **Verify nominated release already
exists**, **Resolve dim sum code name**, **Prepare release payload and hash manifest**, **Compose
release notes**, and **Publish**. `scripts/lint-workflows.mjs` names each step, every environment
variable it accepts and the exact Actions expression that may supply that variable. It also pins
SHA-256 fingerprints of each complete normalized `env` and `run` block. It rejects a missing or
duplicated step, changed provenance, a direct or multiline expression in script text, YAML
anchor/alias indirection, an unquoted read, and **any** reviewed-block change. The full-block
fingerprint is the fail-closed boundary: it catches indirect reads such as `printenv`, parameter
indirection and a newly added line without pretending a list of dangerous shell spellings can ever
be complete.

The guard also scans every executable `run:` or `script:` region in the release job, irrespective
of its display name, and pins a SHA-256 fingerprint of the complete normalized release job. The
three named boundaries are therefore not an allowlist with gaps around it: inserting or renaming an
adjacent shell step fails, and a direct Actions expression in that step receives its own diagnostic.

`scripts/pick-dim-sum.mjs` treats catalog and release API responses as untrusted input. It checks
the expected object/array shapes, field types, per-field character sets and bounds, exact dish ID,
safe slug and filename shapes, `catalog-v1*` release tag, asset size, and the exact public
release-asset URL. The English alternative-text boundary is 235 Unicode characters because that is
the real maximum in the current 2,866-record catalog; Traditional Chinese names retain their
legitimate CJK punctuation. Rejected content is never copied into its error message. The consumer
workflow emits only metadata and the public URL: it never downloads, copies, caches, or attaches
the image bytes.

The packaging job calls `scripts/collect-squirrel-release.mjs prepare` before electron-builder.
That phase clears every validated Squirrel output candidate and the collection directory, then
records the expected version and start time. Collection accepts exactly one populated output
directory, one fresh versioned `Setup.exe`, one fresh full `.nupkg`, optional fresh delta packages,
and one non-empty `RELEASES`. Every package record must match the emitted filename, byte count and
SHA-1; empty, stale, duplicate, missing, extra, wrong-version, wrong-size or wrong-hash output fails
closed.

Before that collection, `scripts/release-version.mjs` resolves one version identity for the
packaged app, Squirrel `RELEASES`, the updater feed and the GitHub release. For run 863 the package
version is `0.1.863` and the tag is exactly `v0.1.863`; publication independently recomputes the
same pair from the unchanged base manifest. A split `v0.1.0-build.863` tag fails the workflow and
release-manifest contracts because the update service compares the release tag—not the attached
package filename—with the installed SemVer.

`scripts/release-asset-manifest.mjs` then records the exact unique, non-empty release asset set,
including Setup, full package, `RELEASES`, extras and jar evidence, with each byte count and
SHA-256. Publication downloads every asset again into a new directory and requires an exact name,
count, size and digest match. It also reads the release record back and verifies the exact target
SHA, tag, non-draft/non-prerelease state, notes, and asset inventory.

## Configuration

The watched inventory is deliberately hand-written in `scripts/lint-workflows.mjs`. Adding,
renaming or splitting one of the six release steps requires reviewing the complete changed
blocks, updating their expected bindings and replacing the stored step and complete-job fingerprints
with `stepFingerprint()` and `jobFingerprint()` values. A fingerprint update is a security review
decision, not a mechanical response to a red test. New dynamic values still need an exact `env:`
binding, a quoted data-only use, and negative fixtures for their context.

All 114 external action invocations across the repository's seven executable workflows are pinned
to full commit SHAs. The hand-written inventory must name every workflow, every external action and
its exact per-file use count; a new workflow missing from that inventory fails the guard. To update
one, resolve the intended major tag from the action's official
repository with `git ls-remote <official-repository> refs/tags/v4`, review that commit and its
release, replace the SHA and update the exact per-file count in `ACTION_INVENTORIES`. The tests must
fail on a mutable tag before the new SHA is accepted.

All executable workflows use explicit supported hosted-runner labels (`ubuntu-24.04` or
`windows-2022`); mutable `*-latest`, self-hosted, expression-derived and unknown labels are rejected
by the hand-written job inventory in `cloudRunnerPolicy.test.ts`.

The workflow defaults to `contents: read`; only the release job receives `contents: write`. Every
checkout in every executable workflow sets `persist-credentials: false`, including the release
checkout. The catalog
API may use the configured token for rate limits, but the public asset download never receives it.
The release job explicitly depends on the workflow-security job, so a failing root guard,
actionlint run or `build-changelog.mjs --check` blocks publication. It also depends on application
lint, build, typecheck, the full test suite, the real Java round trip, jar build, real test-world
render and Windows packaging. A failure or skipped fatal dependency means no publish. Screenshot
capture runs as advisory diagnostic evidence with job-level `continue-on-error: true`, uploads
available images and failure traces, and is deliberately absent from the publisher's dependencies.
Pushes on `main` nominate publication automatically; manual dispatch must explicitly retain its
publish input. The serialized publisher checks existing published releases by exact commit SHA, so
one intended commit is nominated at most once and an existing exact target is verified rather than
published again.

## Failure modes

- A workflow-boundary violation fails the early **Lint the workflow files** job before build or
  publication.
- Invalid or unavailable catalog metadata fails only the optional dish-resolution step. The release
  continues without a code name or public photo link and says so in its notes; it never generates,
  downloads, copies, attaches, or substitutes an image.
- Missing, zero-byte, stale, duplicate or mismatched Squirrel output stops before artifact upload.
- A downloaded release asset set with a missing, extra, empty, duplicate, size-mismatched or
  digest-mismatched file fails readback; a wrong target, tag, body or draft state fails metadata
  readback.
- `actionlint` 1.7.12 can deadlock on this Windows host when it feeds many script blocks to the
  Windows `shellcheck` process: its process bridge fills the child input before starting the child.
  Windows syntax-only `actionlint` plus direct shellcheck are supplementary. The authoritative
  combined proof runs on Linux, where actionlint invokes shellcheck normally.

## Security considerations

Environment variables prevent their contents from becoming shell grammar, but quoting alone is not
enough if a later line recovers the value through `printenv`, indirection or another execution
route. Exact whole-block fingerprints make that complete script the reviewed unit. Canonical inline
provenance bindings separately prevent a YAML alias from quietly swapping in a different source.

The picker emits only the four outputs the workflow consumes: English and Traditional Chinese
names, English alternative text and the exact public photo URL. Output values are single-line
validated metadata. No local path exists because the consumer never materializes the photo.

The packaged CLI jar, complete Squirrel installer set and test-world archive carry SHA-256 records
produced in their own jobs and checked after the same-run artifact download. Release notes include
the exact commit, changelog SHA, workflow start/completion/duration, reproducible line-count table,
per-asset byte counts and SHA-256 values, the permanent unsigned warning, and the bilingual code
name plus public photo link when the catalog resolves. These checks prove that the bytes survived
transport unchanged. They do **not** prove that a compromised producer emitted good bytes: the
producer job, pinned action code, repository source, vendored source and hosted runner remain the
trust boundary.

## Verification

```bash
node --test scripts/bootstrap.test.mjs scripts/collect-squirrel-release.test.mjs scripts/lint-workflows.test.mjs scripts/pick-dim-sum.test.mjs scripts/release-asset-manifest.test.mjs scripts/release-version.test.mjs
node scripts/lint-workflows.mjs
node scripts/build-changelog.mjs --check
actionlint -no-color -oneline -shellcheck=
```

The regression test reads the historical workflow files directly from Git. Commit `98988e3` must
fail at its original 11 direct-expression sites. The assigned baseline
`e13777927876a3d7898778f18193e9465bc97cc2` must fail at its exact 19 sites. The checked-in fixed
workflow must have zero findings, exact provenance and reviewed block fingerprints. Focused fixtures
also cover multiline expressions, YAML aliases, altered provenance, indirect `printenv`/parameter
execution, harmless block drift, an adjacent differently named shell step, all 114 immutable action
pins across every executable workflow, exact workflow-inventory completeness, advisory screenshot
status, fatal release-gate dependency, real
235-character alternative text, malformed schema, control characters, unsafe Markdown contexts,
wrong asset origins, no-photo-download enforcement, path containment, zero/stale/duplicate/wrong-
version Squirrel fixtures, RELEASES hash/size mismatches, duplicate/empty release-manifest assets,
split package/tag versions, wrong release target or notes, and downloaded asset-set mismatches. On Windows, `actionlint` with
shellcheck integration can deadlock; the documented local command proves workflow structure with
shellcheck disabled, while the pinned Linux hosted job supplies the authoritative shellcheck pass.

### Suggested articles

- [GitHub-hosted cloud runners](./cloud-runners.md)
- [Changelog and the in-app changelog viewer](./changelog-viewer.md)
- [Large worlds and rendered maps](./large-worlds.md)

## 廣東話

### Release workflow 嘅保安邊界 (Release workflow security boundary)

release job 將 repository state、之前 job 嘅 outputs 同公開 dim-sum catalog 嘅 metadata 變成 release notes 同 assets。動態值只可以經明確嘅 environment mapping 過入 shell;shell 喺雙引號入面讀呢啲變數,再交畀只當數據用嘅 consumer——冇任何 Actions expression 會被插入可執行嘅 script 文字。

### 行為

被睇實嘅邊界係六個 step:**Resolve release tag**、**Verify nominated release already exists**、**Resolve dim sum code name**、**Prepare release payload and hash manifest**、**Compose release notes** 同 **Publish**。`scripts/lint-workflows.mjs` 逐個 step 點名、列明每個佢接受嘅 environment variable,同埋可以供應嗰個變數嘅確切 Actions expression。佢亦 pin 咗每個完整 normalized `env` 同 `run` block 嘅 SHA-256 fingerprint。以下全部會被拒:step 缺咗或者重複、provenance 改咗、script 文字入面有直接或者跨行嘅 expression、YAML anchor/alias 兜路、冇引號嘅讀取,同**任何** reviewed-block 改動。整 block fingerprint 係 fail-closed 嘅邊界:佢捉到 `printenv` 之類嘅間接讀取、parameter indirection 同新加嘅行,而唔使扮一張「危險 shell 寫法」清單可以寫得齊。

個 guard 仲會掃 release job 入面每一個可執行嘅 `run:` 或者 `script:` 區域,唔理佢個 display name 叫乜,並且 pin 成個 normalized release job 嘅 SHA-256 fingerprint。所以三個(六個之中)有名嘅邊界唔係一張周圍有窿嘅 allowlist:插入或者改名一個相鄰嘅 shell step 會 fail,而嗰個 step 入面嘅直接 Actions expression 有自己嘅 diagnostic。

`scripts/pick-dim-sum.mjs` 將 catalog 同 release API 嘅 response 當不可信 input 處理。佢檢查預期嘅 object/array 形狀、欄位類型、每個欄位嘅字符集同界限、確切嘅 dish ID、safe 嘅 slug 同 filename 形狀、`catalog-v1*` 嘅 release tag、asset 大小,同確切嘅公開 release-asset URL。英文 alternative-text 嘅界限係 235 個 Unicode 字符,因為嗰個係現時 2,866 筆記錄嘅 catalog 入面真實嘅最大值;繁體中文名保留佢哋正當嘅 CJK 標點。被拒嘅內容永遠唔會被 copy 入 error message。consumer workflow 只 emit metadata 同公開 URL:佢永遠唔會下載、複製、cache 或者 attach 相片嘅 bytes。

packaging job 喺 electron-builder 之前 call `scripts/collect-squirrel-release.mjs prepare`。呢個階段清走每個經驗證嘅 Squirrel output 候選同 collection directory,再記低預期 version 同開始時間。collection 只接受:正正一個有嘢嘅 output directory、一個新鮮嘅 versioned `Setup.exe`、一個新鮮嘅 full `.nupkg`、可選嘅新鮮 delta packages,同一個非空嘅 `RELEASES`。每筆 package record 都要 match emit 咗嘅 filename、byte count 同 SHA-1;空、舊、重複、缺失、多咗、version 錯、size 錯或者 hash 錯嘅 output 一律 fail closed。

collection 之前,`scripts/release-version.mjs` 為 packaged app、Squirrel `RELEASES`、updater feed 同 GitHub release 解出同一個 version identity。以 run 863 為例,package version 係 `0.1.863`,tag 正正係 `v0.1.863`;publication 由不變嘅 base manifest 獨立重新計出同一對。分裂咗嘅 `v0.1.0-build.863` tag 會 fail workflow 同 release-manifest contracts,因為 update service 比較嘅係 release tag——唔係 attach 咗嘅 package filename——同已安裝嘅 SemVer。

之後 `scripts/release-asset-manifest.mjs` 記低確切、無重複、非空嘅 release asset set,包括 Setup、full package、`RELEASES`、extras 同 jar evidence,連每個嘅 byte count 同 SHA-256。publication 將每個 asset 重新下載落一個新 directory,要求名、數目、size 同 digest 完全 match。佢仲會讀返 release record,驗證確切嘅 target SHA、tag、non-draft/non-prerelease 狀態、notes 同 asset inventory。

### 設定

被睇實嘅 inventory 係刻意人手寫喺 `scripts/lint-workflows.mjs` 度嘅。加、改名或者拆開六個 release step 其中一個,要 review 成個改咗嘅 block、更新佢哋預期嘅 bindings,再用 `stepFingerprint()` 同 `jobFingerprint()` 嘅值換走儲低嘅 step 同 complete-job fingerprints。更新 fingerprint 係一個 security review 決定,唔係對一個紅咗嘅 test 嘅機械反應。新嘅動態值照樣要一個確切嘅 `env:` binding、一個有引號、只當數據嘅用法,同佢個 context 嘅 negative fixtures。

repository 七條可執行 workflow 入面全部 114 個 external action invocation 都 pin 咗完整 commit SHA。人手寫嘅 inventory 要點齊每條 workflow、每個 external action 同佢每個檔案嘅確切使用次數;inventory 漏咗嘅新 workflow 會 fail 個 guard。要更新一個:用 `git ls-remote <official-repository> refs/tags/v4` 由 action 官方 repository 解出想要嘅 major tag,review 嗰個 commit 同佢個 release,換 SHA 再更新 `ACTION_INVENTORIES` 入面確切嘅每檔案次數。新 SHA 被接受之前,啲 test 一定要先喺 mutable tag 上 fail 過。

所有可執行 workflow 都用明確、受支援嘅 hosted-runner label(`ubuntu-24.04` 或者 `windows-2022`);mutable 嘅 `*-latest`、self-hosted、由 expression derive 嘅同不明嘅 label,由 `cloudRunnerPolicy.test.ts` 入面人手寫嘅 job inventory 拒絕。

workflow 預設 `contents: read`;只有 release job 攞到 `contents: write`。每條可執行 workflow 入面每個 checkout 都設 `persist-credentials: false`,包括 release checkout。catalog API 可以用設定咗嘅 token 換 rate limit,但公開 asset 下載永遠唔會收到 token。release job 明確依賴 workflow-security job,所以 root guard、actionlint run 或者 `build-changelog.mjs --check` fail 咗就 block 發佈。佢亦依賴 application lint、build、typecheck、完整 test suite、真嘅 Java round trip、jar build、真 test-world render 同 Windows packaging——任何一個 fail 或者 fatal dependency 被 skip 就冇得 publish。screenshot capture 係 advisory 嘅診斷證據,job 級 `continue-on-error: true`,上載有嘅圖同失敗 trace,而且刻意唔喺 publisher 嘅 dependencies 入面。push 上 `main` 會自動提名發佈;manual dispatch 就要明確保留佢個 publish input。serialized 嘅 publisher 用確切 commit SHA 檢查已發佈嘅 release,所以一個目標 commit 最多被提名一次,已存在嘅確切 target 係被驗證而唔係再發佈一次。

### 失敗情況

- workflow-boundary 違規會喺早期嘅 **Lint the workflow files** job fail,去唔到 build 或者發佈。
- catalog metadata 無效或者攞唔到,只 fail 可選嘅 dish-resolution step。release 照出,冇 code name 同公開相片 link,notes 會講明;佢永遠唔會生成、下載、複製、attach 或者用第二張相頂替。
- Squirrel output 缺失、零 byte、舊、重複或者唔 match,喺 artifact upload 之前就停。
- 下載返嚟嘅 release asset set 有缺、多、空、重複、size 唔 match 或者 digest 唔 match 嘅檔案,fail readback;target、tag、body 或者 draft 狀態錯,fail metadata readback。
- `actionlint` 1.7.12 喺呢部 Windows host 上,當佢餵大量 script block 畀 Windows 嘅 `shellcheck` process 時可能 deadlock:佢個 process bridge 喺起 child 之前已經填滿 child 嘅 input。Windows 上 syntax-only 嘅 `actionlint` 加直接行 shellcheck 只係補充;權威嘅合併證明喺 Linux 上行,嗰度 actionlint 正常咁 invoke shellcheck。

### 保安考慮

environment variable 令內容變唔成 shell grammar,但淨係靠引號唔夠——後面一行可以用 `printenv`、indirection 或者第二條執行路徑攞返個值。確切嘅整 block fingerprint 令成個 script 成為被 review 嘅單位;canonical 嘅 inline provenance binding 另外防止 YAML alias 靜靜換咗個 source。

picker 只 emit workflow 消費嗰四個 output:英文同繁體中文名、英文 alternative text,同確切嘅公開相片 URL。output 值係單行、經驗證嘅 metadata。冇任何本地路徑存在,因為 consumer 從來唔 materialize 張相。

packaged CLI jar、完整 Squirrel installer set 同 test-world archive 帶住喺佢哋自己 job 產生嘅 SHA-256 記錄,same-run artifact 下載之後會再check。release notes 包括:確切 commit、changelog SHA、workflow 開始/完成/歷時、可重現嘅 line-count 表、每個 asset 嘅 byte count 同 SHA-256、永久嘅 unsigned 警告,同(catalog 解到嘅話)雙語 code name 加公開相片 link。呢啲檢查證明 bytes 經傳輸冇變。佢哋**唔**證明一個被攻陷嘅 producer 出咗好嘅 bytes:producer job、pin 咗嘅 action code、repository source、vendored source 同 hosted runner 仍然係 trust boundary。

### 驗證

```bash
node --test scripts/bootstrap.test.mjs scripts/collect-squirrel-release.test.mjs scripts/lint-workflows.test.mjs scripts/pick-dim-sum.test.mjs scripts/release-asset-manifest.test.mjs scripts/release-version.test.mjs
node scripts/lint-workflows.mjs
node scripts/build-changelog.mjs --check
actionlint -no-color -oneline -shellcheck=
```

regression test 直接由 Git 讀歷史 workflow 檔案。commit `98988e3` 必須喺佢原本嗰 11 個 direct-expression 位置 fail;指定 baseline `e13777927876a3d7898778f18193e9465bc97cc2` 必須喺佢確切嗰 19 個位置 fail;check 咗入去嘅 fixed workflow 必須零 findings、provenance 確切、reviewed block fingerprints 啱。focused fixtures 仲cover:跨行 expression、YAML aliases、改咗嘅 provenance、間接嘅 `printenv`/parameter 執行、無害嘅 block drift、相鄰但改咗名嘅 shell step、每條可執行 workflow 全部 114 個 immutable action pin、確切嘅 workflow-inventory 完整性、advisory 嘅 screenshot 狀態、fatal 嘅 release-gate dependency、真實嘅 235 字符 alternative text、畸形 schema、control characters、唔安全嘅 Markdown context、asset 來源錯、no-photo-download 執行、path containment、零/舊/重複/version 錯嘅 Squirrel fixtures、`RELEASES` hash/size 唔 match、重複/空嘅 release-manifest assets、package/tag version 分裂、release target 或者 notes 錯,同下載 asset set 唔 match。喺 Windows 上,開咗 shellcheck integration 嘅 `actionlint` 可能 deadlock;文件寫低嗰條本地 command 用閂咗 shellcheck 嚟證明 workflow 結構,權威嘅 shellcheck pass 由 pin 咗嘅 Linux hosted job 提供。

### 建議文章

- [GitHub-hosted cloud runners](./cloud-runners.md)
- [Changelog and the in-app changelog viewer](./changelog-viewer.md)
- [Large worlds and rendered maps](./large-worlds.md)
