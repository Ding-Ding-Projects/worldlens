# Generating a world in GitHub Actions

The world generator dialog can run its built-in generator on GitHub's runners instead of this
computer, and compile a map of the result in the same run. The dialog builds one small JSON
document from the settings a person chose, the main process starts `worldgen.yml` with it, and
the workflow generates, verifies, packages and renders the world. This article describes what
that path does, what it refuses, and what it does not claim.

## Behaviour

Choosing **GitHub Actions** under *Where to run* with the built-in generator selected shows the
configuration the run will receive, read-only, so what is sent is visible before it is sent. The
document (`@worldlens/shared`, `worldGenerationConfig.ts`, version 1) carries the seed, the square
size derived from the pre-generation radius, the world name, the chunk format derived from the
chosen version (1.12 selects the pre-flattening layout, everything else the modern one), the
output mode, and an echo of the other settings under `source` for the receipt. Starting the run
needs a repository as `owner/name` whose default branch carries `.github/workflows/worldgen.yml`,
and a GitHub CLI account that can write to it; the account picker lists what the CLI knows, and
the repository field is prefilled with the first writable repository that account owns when the
list can be read.

The main process validates the document with the same module the dialog built it with, confirms
the repository carries the workflow, reads the default branch and sends one `workflow_dispatch`.
The answer is a dispatch receipt with the repository, ref, time, the exact inputs sent and the link
to the workflow's runs. A started run is not a generated world, and the dialog says only that the
run was dispatched.

On the runner, `worldgen.yml` runs four jobs:

- **generate** builds the generator packages, validates the document again through
  `scripts/worldgen-config.mjs`, writes the world with `design/packages/worldgen`, checks that a
  `level.dat` and at least one region file exist, zips the world folder, writes `SHA256SUMS` and a
  `generation-receipt.json` naming the configuration, the generator's own summary, the commit and
  the run, and uploads them as the `generated-world` artifact.
- **render** (input `render`, default on) downloads the BlueMap CLI jar from the latest successful
  `ci.yml` run on `main`, renders the overworld exactly as `ci.yml`'s test-world job does, fails
  when no tiles came out, and uploads the webapp as the `generated-map` artifact with a
  `provenance.json`.
- **publish** (input `publish: release-asset`) attaches the zip, `SHA256SUMS`, the configuration and
  the receipt to a prerelease tagged `world-<name>-<run id>`, which is the form `render-world.yml`'s
  `release-asset` world source reads.
- **chain-render** (input `dispatch-render`, needs `release-asset`) dispatches `render-world.yml`
  against that asset with the world's name as map id and name, so the full map pipeline runs on
  the generated world without anybody downloading it.

The dialog's *also publish* switch turns on both `publish: release-asset` and `dispatch-render`.

## Configuration

The workflow takes four `workflow_dispatch` inputs: `generation-config` (the JSON document,
required), `render` (boolean, default true), `publish` (`artifact` or `release-asset`, default
`artifact`) and `dispatch-render` (boolean, default false). Dispatching by hand works with the
same document the dialog shows, for example:

```sh
gh workflow run worldgen.yml -F generation-config=@generation-config.json \
  -f render=true -f publish=release-asset -f dispatch-render=true
```

The document is bounded at 16 KiB, the size at 16 to 40 000 blocks, the world name at 120
characters of letters, digits, `.`, `_` and `-`. Unknown top-level fields are refused rather than
ignored.

## Failure modes

- A document the module refuses fails the dialog before anything is sent, and fails the `generate`
  job's validation step with the same message if it is dispatched by hand.
- A document naming the `vanilla-server` engine is refused on the runner. Nothing in the workflow
  launches a Minecraft server; the receipt never implies Mojang's generator produced the terrain.
- No `level.dat` or no region file fails the run with the listing of what was written.
- No successful `ci.yml` run on `main`, or an expired `bluemap-jar-cli` artifact, fails the render
  job with a message; nothing is downloaded from anywhere else.
- A render that produces no tiles fails rather than uploading an empty webapp.
- A repository without the workflow on its default branch, or an account that cannot write to it,
  is refused by the main process before any dispatch.

## Security considerations

The document crosses into the workflow as an input bound to an environment variable and is read
by a script; no value from it is interpolated into shell text. Every step that reaches the GitHub
API uses the run's own workflow token with the least permission the job needs: `contents: read`
for generation, `actions: read` to download the jar, `contents: write` only in the publish job, and
`actions: write` only in the job that dispatches the render. A `workflow_dispatch` started with the
workflow token is one of the two events GitHub lets a token-authored action start, so no personal
token is involved. The desktop side dispatches through the GitHub CLI account lease every other
cloud action uses; no credential crosses IPC.

## Verification

The shared module's tests cover building, parsing and refusing the document and the exact
dispatch inputs; `scripts/worldgen-config.test.mjs` runs the validator as the workflow does;
the dialog test selects the GitHub Actions runner, reads the shown document and checks the
dispatched request; the main-process test dispatches `worldgen.yml` on the default branch with
string-only inputs and refuses a signed-out account or a repository without the workflow. The
workflow itself is pinned in `scripts/lint-workflows.mjs` and named in the cloud runner
inventory. Whether a real dispatch generated and rendered a world is recorded with its run id in
`HANDOFF.md`, not claimed here.

## Follow, download and import

A successful dispatch records an operation id under the application's `worldgen-actions` storage.
The dialog retains that id across reopening and can refresh the run and its jobs. Automatic
observation is bounded to 60 checks, five seconds apart while the dialog remains open; manual
refresh stays available. Closing the dialog does not cancel the remote workflow.

Run discovery requires the exact generated-world title, a workflow_dispatch event and a creation
time within five minutes of dispatch. More than one match is an explicit ambiguity, never an
automatic choice. A missing match remains waiting, not completed.

After a successful run, **Download and verify world** requires one unexpired `generated-world`
artifact with GitHub's published SHA-256 digest. The download must match that digest before safe
ZIP extraction. The included generation receipt must match the exact configuration, repository,
source commit and run id. Its inner world ZIP must match its own SHA-256, and the extracted world
must contain measured chunks and a readable level.dat with the submitted seed. Only then does
**Open imported world** become available. Each attempt uses a fresh application-owned directory;
existing worlds are never replaced, and interrupted files remain available for recovery.

These paths have fixture-based positive and negative checks. A real GitHub dispatch, download,
packaged dialog and map import remain separate runtime acceptance evidence.

## 廣東話

派發成功後會保存操作編號。重新開啟視窗可以更新工作流程及各項工作的真實狀態。
自動觀察最多執行 60 次，每次相隔五秒，亦可手動更新；關閉視窗不會取消遠端工作流程。
尋找流程時必須符合世界標題、workflow_dispatch 事件及派發後五分鐘內的時間。
多個符合結果會明確停止自動選擇，沒有結果亦不會當作完成。

流程成功後，下載按鈕會先驗證 GitHub 公布的壓縮檔 SHA-256，再安全解壓。
收據必須符合提交設定、儲存庫、來源提交及流程編號，內層世界壓縮檔亦要符合自己的摘要。
解壓後會量度真實區塊，並讀取 level.dat 核對種子；全部通過後才提供開啟匯入世界。
每次嘗試使用新的應用程式儲存目錄，不覆寫現有世界，中斷的檔案會保留作恢復用途。
這些檢查目前由測試資料驗證，真正線上派發、下載及原生介面操作仍需獨立驗收。
