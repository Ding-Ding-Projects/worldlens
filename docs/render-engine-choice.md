# Per-project render-engine choice

## Behaviour

The Settings surface has a versioned **Render engine choice** section for the global default
used by new projects. The project editor's **How it renders** tab has the same control for a
project-specific override. The choices are:

- **BlueMap original engine** — BlueMap 5.22, from upstream source and the packaged Java runtime.
- **Worldlens app engine** — the application's TypeScript engine, shipped with the app and usable without a JVM.
- **Automatic** — keep BlueMap when a suitable JVM is available; select the app engine when no suitable JVM exists.

Existing projects with an explicit choice keep it. An unmodified project's automatic choice is
resolved at render time and never claims a Java version the current surface has not measured.
Every card shows the engine version, provenance, capabilities, and unsupported or conditional
settings before a render is started.

The global new-project choice is wired through both real creation routes: `ProjectsScreen` and
`WorldScreen`, integrated on main by [`e3cf7f30`](https://github.com/Ding-Ding-Projects/worldlens/commit/e3cf7f30b40989d83a6b8833b1f42894efa55623).
The choice is resolved against measured Java availability before the new project is written;
existing project intent remains explicit and unchanged.

## Configuration

The UI stores a bounded record under `worldlens-render-engine-choice-v1` and mirrors the latest
record into application-settings history under `renderEngineChoice`. Export and import use this
shape:

```json
{
  "schema": "worldlens.render-engine-choice",
  "version": 1,
  "globalDefault": "automatic"
}
```

The engine cards have their own plain-text search and adjacent anchored regex builder. Export
and import are local file operations; an invalid file is rejected as a whole.

## Failure modes

- If no suitable JVM is available, Automatic selects the Worldlens app engine and says that
  nothing was downloaded.
- If the project editor cannot measure JVM availability yet, it says the answer will be resolved
  when rendering begins rather than guessing.
- Conditional or unsupported capabilities remain visible with the exact boundary; the UI never
  silently substitutes the other engine.
- An invalid or wrong-version import changes nothing and reports the rejection.
- **The Worldlens app engine is offered only when its files are really on disk.** The picker asks
  the desktop process, which opens the engine entry, the driver, the assets folder and every
  package the engine imports. A manifest that says "available" is not taken as evidence.
- **An installed copy with part of the engine missing reinstalls it by itself.** When a render
  starts and the engine inside the app is incomplete, the app verifies the engine archive it was
  packaged with (size and SHA-256), unpacks it into its data folder
  (`render-engines/typescript/<digest>`) with visible progress, and then carries on with the
  render. Nothing is downloaded, so this works offline, and the installed files are never
  modified. Until then the picker keeps the engine selectable and says it will be reinstalled
  when the next render starts.
- **When it cannot reinstall, it says exactly why.** The failure names each missing piece (for
  example `the package @worldlens/nbt (typescript/node_modules/@worldlens/nbt)`) and the reason
  the reinstall failed (the archive is missing, is the wrong size, does not match its digest, or
  could not be unpacked). Nothing is started, Java is not chosen instead, and starting the render
  again retries. The picker then disables the engine and shows the same reason.

## Security considerations

The record is local application data and is bounded to the two known engine identifiers plus
Automatic. The UI does not execute an engine or download a runtime. Runtime selection, process
launch, and provenance records remain owned by the desktop boundary, which must report its own
observed version and capability result.

The packaged TypeScript engine carries exactly the packages its import graph reaches, found by
tracing the built engine rather than by reading `dependencies` lists. Releases 1.0.2490 to
1.0.2502 shipped the engine without any of those packages: the packaging tool drops a folder
named `node_modules` at the root of a copied file set, and the engine's packages were exactly
that folder. The render engines are now copied as one file set rooted a level higher, and the
build fails in `afterPack` unless the packaged engine is complete, its reinstall archive matches
the manifest, and the engine loads in a separate process from a copy outside the checkout.
Tracked and fixed in [issue #192](https://github.com/Ding-Ding-Projects/worldlens/issues/192).
The staged engine is 5.2 MB; the earlier staging was 96 MB, mostly a UI framework the engine
never imports.
## Verification

Checked on 2026-11-25 for the packaged TypeScript engine:

- A real electron-builder 26.15.3 `--dir` run with the current file set produced
  `resources/render-engines/typescript/node_modules`, and the `afterPack` check passed. The same
  run with the file sets as they were in 1.0.2500 produced no `node_modules` and the check failed
  the build, naming all ten missing packages.
- `render-ts.mjs` run from a copy outside the checkout: in the 1.0.2500 shape it reports
  `Cannot find package '@worldlens/shared'`; in the current shape the engine loads and the driver
  goes on to ask for render inputs.
- Tests: `typescriptEngine.test.ts` (resolver, reinstall with progress, exact failure text, picker
  summary), `packagedRenderEngines.test.ts` (the packaging check and the single file set),
  `stagedTypeScriptEngine.test.ts` (the real engine staged, damaged, reinstalled and loaded in a
  fresh process), and `EngineChoicePanel.test.ts` (the picker disables an engine that cannot start).

- Release v1.0.2504, built by the hosted workflow: its `afterPack` check passed, the update
  package is one file of 1,983,670,323 bytes, and after updating an installed copy to it
  `resources/render-engines/typescript/node_modules` is present. The installed driver, run under
  the app's own runtime, fails to load the engine in 1.0.2502 and loads it in 1.0.2504.

Not yet checked: a full render with the Worldlens app engine inside an installed build, and the
automatic reinstall seen in the running interface. The decisive comparison also remains open: no
genuine packaged project has yet been rendered through both engines with output and provenance
compared, and no corresponding capture matrix is verified. Runtime routing for Docker, CLI, and
restart-with-speed requests remains an explicit boundary. Track the remaining proof in
[issue #78](https://github.com/Ding-Ding-Projects/worldlens/issues/78).

## 廣東話

設定頁有一格 **Render engine choice**，俾新 project 用全域 default；project editor 嘅 **How it renders** 分頁亦有每個 project 自己嘅 override。可以揀 BlueMap 原本個 Java engine、Worldlens 自己個 engine，或者 Automatic：有合適 JVM 就保留 BlueMap，冇就用 app engine，唔會靜雞雞轉台。每張卡都寫清楚版本、來源、能力同唔支援嘅設定，仲有自己個搜尋欄同 anchored regex builder。匯入錯檔案會成份拒絕，唔會食半份設定。

Global new-project wiring 已經接入 ProjectsScreen 同 WorldScreen。

Worldlens 自己個 engine 而家要啲檔案真係喺碟度先會俾你揀：desktop 嗰邊會逐件開，engine 入口、driver、assets，同埋 engine import 嘅每一個 package，唔會淨係信 manifest 話「available」。1.0.2490 至 1.0.2502 出貨嗰陣 engine 有帶、啲 package 一個都冇帶，因為打包工具見到檔案集最頂層叫 `node_modules` 嘅資料夾就掉走；而家成個 render-engines 當一個檔案集抄，`afterPack` 仲會驗埋：engine 齊唔齊、重裝用嘅 archive 啱唔啱 manifest、喺 checkout 以外另開 process load 唔 load 到，唔過就成個 build 失敗（[issue #192](https://github.com/Ding-Ding-Projects/worldlens/issues/192)）。Staged engine 得 5.2 MB，舊時係 96 MB，大部份係 engine 根本冇用嘅 UI framework。

如果裝咗嘅 app 入面 engine 唔齊，一開 render 佢會自己搞掂：驗咗 app 自帶嗰個 engine archive 嘅大細同 SHA-256，解壓去 data folder（`render-engines/typescript/<digest>`），有進度睇，跟住照 render。唔使上網，亦唔會改裝咗嘅檔案。真係重裝唔到，佢會講明缺邊件（例如 `the package @worldlens/nbt`）同點解重裝唔到，唔會開始 render，亦唔會靜雞雞轉用 Java；再開一次 render 就係重試，揀 engine 嗰度亦會熄咗佢兼寫埋原因。

2026-11-25 驗過：真 electron-builder 26.15.3 `--dir` 用而家個檔案集有 `node_modules` 兼過到 `afterPack`，用 1.0.2500 嗰套檔案集就冇 `node_modules` 兼 build 失敗，十個 package 逐個點名；`render-ts.mjs` 喺 checkout 以外行，舊樣報 `Cannot find package '@worldlens/shared'`，新樣 engine load 到。Hosted workflow 出嘅 v1.0.2504 亦驗咗：`afterPack` 過到，更新包得一個檔、1,983,670,323 bytes，更新完裝咗嗰份有齊 `resources/render-engines/typescript/node_modules`；用 app 自己個 runtime 行裝咗嗰個 driver，1.0.2502 load 唔到 engine，1.0.2504 load 到。未驗：喺裝咗嘅 build 入面用 Worldlens engine 完整 render 一次，同埋喺介面度親眼見到自動重裝。兩個 engine 真 packaged render、output/provenance comparison、capture matrix，同 Docker、CLI、restart-with-speed runtime routing 仍然未證實，issue #78 繼續 open。
