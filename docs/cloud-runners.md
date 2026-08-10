# GitHub-hosted cloud runners

## Behaviour

Every executable job in the repository's seven GitHub Actions workflows runs on an explicit
standard hosted label. Linux build, test, render, release and Pages work uses `ubuntu-24.04`;
the Squirrel.Windows packaging job uses `windows-2022`. Mutable `*-latest` aliases are rejected.
Reusable-workflow call jobs name the
checked-in workflow they call and cannot declare `runs-on` under GitHub Actions syntax.

This restores disposable, isolated environments for a public repository. A failed or cancelled
run leaves no process, package, or toolchain state on a maintainer's computer, and a pull request
can be validated without executing contributor-controlled code on a project-owned runner.

## Configuration

Runner selection lives beside each executable job in `.github/workflows/`. The workflows retain
the project's ordinary declared setup:

- the SHA-pinned `pnpm/action-setup` action reads the exact `pnpm@10.33.0` package-manager pin from
  `design/package.json`;
- the SHA-pinned `actions/setup-node` action selects Node 22, matching the workspace engine requirement;
- the SHA-pinned `actions/setup-java` action selects the Temurin versions required by the vendored BlueMap build;
- `pnpm install --frozen-lockfile` resolves exactly `design/pnpm-lock.yaml`;
- the workflow-lint job downloads actionlint 1.7.12 from its canonical release, verifies its
  committed SHA-256 digest, and uses shellcheck already present on hosted Ubuntu.

The hand-written inventory in
`design/packages/shared/src/cloudRunnerPolicy.test.ts` names every workflow and all 36 jobs.
Twenty-three executable jobs declare their expected hosted label; thirteen reusable call jobs
declare their exact checked-in target.

## Failure modes

- A new workflow file or job fails the guard until the inventory deliberately names it.
- A missing `runs-on`, an expression, a private runner label, or a non-standard hosted label fails
  the guard for executable jobs.
- A reusable call with a runner label, or an executable job replaced by a reusable call, fails
  because the inventoried job kind no longer matches.
- Any `self-hosted` text or reference to the removed bootstrap action in a workflow fails the
  guard. The deleted action, Linux/Windows scripts, and obsolete bootstrap article are also
  asserted absent.
- A setup action or locked dependency install that fails stops that job. There is no fallback to
  a maintainer machine and no hidden mutation of another environment.

## Security considerations

Hosted runners are ephemeral GitHub-managed virtual machines. Pull-request code executes there,
not on a computer that also holds a maintainer's files or long-lived processes. Workflow tokens
still follow least privilege: read by default, with write permission only on the release or Pages
operation that needs it. Secrets remain unavailable to ordinary fork pull requests under GitHub's
standard event model.

The private-world render path is unchanged. Its payload remains encrypted before upload and its
workflow continues to use standard hosted Ubuntu jobs. This runner change neither weakens that
encryption nor redirects private-builder output.

## Verification

Run the focused policy test from `design/`:

```sh
npx vitest run packages/shared/src/cloudRunnerPolicy.test.ts
```

Then parse all workflow YAML, run actionlint with shellcheck available, and run the workspace
typecheck and site build. These checks prove the checked-in labels, job inventory, workflow
syntax, and rendered documentation; an actual hosted run remains the runtime proof after the
commit reaches the default branch.

## Suggested articles

- [Rendering a world in GitHub Actions](./render-in-actions.md)
- [Rendering a private world](./private-world-rendering.md)
- [Publishing a rendered map to GitHub Pages](./pages-hosting.md)

## 廣東話

### 行為

呢個 repository 七個 GitHub Actions workflow 入面，每一個可執行嘅 job 都行喺一個明確寫出嚟嘅
標準 hosted runner label 上面。Linux 嘅 build、test、render、release 同 Pages 工作用 `ubuntu-24.04`；
Squirrel.Windows 嘅打包 job 用 `windows-2022`。會變嘅 `*-latest` 別名一律拒絕。
呼叫可重用 workflow (reusable workflow) 嘅 job 就指名佢哋呼叫嗰個已 check in 嘅 workflow，
而喺 GitHub Actions 語法之下，呢類 job 本身係唔可以宣告 `runs-on` 嘅。

咁樣就為一個公開 repository 恢復咗用完即棄、互相隔離嘅環境。一次失敗或者被取消嘅 run，
唔會喺維護者部電腦上面遺低任何 process、套件或者工具鏈狀態；
而驗證一個 pull request 亦唔使喺專案自己嘅 runner 度執行由貢獻者控制嘅 code。

### 設定

Runner 嘅選擇就寫喺 `.github/workflows/` 入面每個可執行 job 隔籬。啲 workflow 保留返專案一貫嘅宣告式設定：

- 釘死 SHA 嘅 `pnpm/action-setup` action 會由 `design/package.json` 讀出確實嘅套件管理器 pin
  `pnpm@10.33.0`；
- 釘死 SHA 嘅 `actions/setup-node` action 揀 Node 22，同 workspace 嘅 engine 要求一致；
- 釘死 SHA 嘅 `actions/setup-java` action 揀 vendor 咗嘅 BlueMap build 所需要嘅 Temurin 版本；
- `pnpm install --frozen-lockfile` 會完全按 `design/pnpm-lock.yaml` 解析；
- workflow-lint 嗰個 job 會由 actionlint 1.7.12 嘅官方 release 下載佢，驗證已 commit 嘅 SHA-256 digest，
  並用 hosted Ubuntu 上面本身已經有嘅 shellcheck。

`design/packages/shared/src/cloudRunnerPolicy.test.ts` 入面有一份人手寫嘅清單，
指名咗每一個 workflow 同全部 36 個 job。其中 23 個可執行 job 宣告咗佢哋預期嘅 hosted label；
13 個可重用呼叫 job 宣告咗佢哋確實嘅已 check in 目標。

### 失敗模式

- 一個新嘅 workflow 檔或者新 job，喺份清單特登指名佢之前，都會令個 guard 失敗。
- 可執行 job 如果冇 `runs-on`、用咗表達式、用咗私有 runner label，或者用咗非標準嘅 hosted label，
  都會令個 guard 失敗。
- 一個帶住 runner label 嘅可重用呼叫，或者一個被可重用呼叫取代咗嘅可執行 job，都會失敗，
  因為清單記低嗰個 job 類別已經對唔上。
- Workflow 入面出現任何 `self-hosted` 字眼，或者引用返已經移除咗嗰個 bootstrap action，都會令 guard 失敗。
  嗰個已刪除嘅 action、Linux/Windows 腳本，同埋過時嗰篇 bootstrap 文章，
  亦都會被斷言為「唔存在」。
- 一個 setup action 或者鎖定版本嘅依賴安裝失敗，就會令嗰個 job 停低。冇任何後備會退返去維護者部機，
  亦冇任何暗中改動另一個環境嘅行為。

### 保安考慮

Hosted runner 係由 GitHub 管理、用完即棄嘅虛擬機。Pull-request 嘅 code 喺嗰度執行，
而唔係喺一部同時放住維護者檔案同長命 process 嘅電腦上面執行。Workflow token 仍然跟最小權限原則：
預設淨係讀，只有真係需要嘅 release 或者 Pages 操作先攞到寫入權限。
喺 GitHub 標準嘅事件模型之下，一般 fork 嘅 pull request 一樣攞唔到 secret。

私有 world 嘅 render 路徑冇變。佢個 payload 一樣係上傳之前先加密，
而佢個 workflow 亦一樣繼續用標準 hosted Ubuntu job。今次呢個 runner 改動，
唔會削弱嗰層加密，亦唔會改變私有 builder 輸出去邊。

### 核實

喺 `design/` 底下行針對性嘅政策測試：

```sh
npx vitest run packages/shared/src/cloudRunnerPolicy.test.ts
```

跟住 parse 晒全部 workflow YAML、喺有 shellcheck 嘅情況下行 actionlint，
再行 workspace 嘅 typecheck 同網站 build。呢啲檢查證明到已 check in 嘅 label、job 清單、
workflow 語法同渲染出嚟嘅文件；不過真正嘅執行期證明，仍然要等 commit 上到預設分支之後，
真係喺 hosted runner 行一次。

### 建議閱讀

- [Rendering a world in GitHub Actions](./render-in-actions.md)
- [Rendering a private world](./private-world-rendering.md)
- [Publishing a rendered map to GitHub Pages](./pages-hosting.md)
