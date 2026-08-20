# Per-project render-engine choice

## Behaviour

The Settings surface has a versioned **Render engine choice** section intended to provide the
global default used by new projects. The project editor's **How it renders** tab has the same
control for a project-specific override. The choices are:

- **BlueMap original engine** — BlueMap 5.22, from upstream source and the packaged Java runtime.
- **Worldlens app engine** — the application's TypeScript engine, shipped with the app and usable without a JVM.
- **Automatic** — keep BlueMap when a suitable JVM is available; select the app engine when no suitable JVM exists.

Existing projects with an explicit choice keep it. An unmodified project's automatic choice is
resolved at render time and never claims a Java version the current surface has not measured.
The global-default wiring is not complete in the current source: `chooseNewProjectEngine()` has
no caller, `createProject()` hard-codes `render.engine` to `typescript`, and both generated-default
and wizard creation copy that value. Therefore current new projects use `typescript` regardless
of the selected global default; the UI text describes the intended behavior, not verified behavior.
Every card shows the engine version, provenance, capabilities, and unsupported or conditional
settings before a render is started.

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

## Security considerations

The record is local application data and is bounded to the two known engine identifiers plus
Automatic. The UI does not execute an engine or download a runtime. Runtime selection, process
launch, and provenance records remain owned by the desktop boundary, which must report its own
observed version and capability result.

## Verification

This UI lane is implemented, but issue #78 still requires runtime routing for local, Docker, CLI,
and restart-with-speed requests, plus a genuine packaged render with each engine and a documented
comparison. The packaged proof is still unrun. A static packaging audit also found that
`stage-render-engines.mjs` copies the TypeScript engine and `shared/dist`, while the compiled
engine imports bare `@worldlens/shared`, `@worldlens/nbt`, and `@worldlens/config` package names;
the packaged artifact has not yet proved those imports resolve, nor shown a rewrite or bundle
step that would make them resolve. Those are not claimed by this document. Track the remaining
proof in [issue #78](https://github.com/Ding-Ding-Projects/worldlens/issues/78).

## 廣東話

設定頁有一格 **Render engine choice**，原意係俾新 project 用全域 default；project editor 嘅 **How it renders** 分頁亦有每個 project 自己嘅 override。可以揀 BlueMap 原本個 Java engine、Worldlens 自己個 engine，或者 Automatic：有合適 JVM 就保留 BlueMap，冇就用 app engine，唔會靜雞雞轉台。每張卡都寫清楚版本、來源、能力同唔支援嘅設定，仲有自己個搜尋欄同 anchored regex builder。匯入錯檔案會成份拒絕，唔會食半份設定。

UI 同持久化已落地，但 `chooseNewProjectEngine()` 暫時冇 caller，`createProject()` 直接寫死 `typescript`，所以新 project 未必跟全域 default；issue #78 仲要補齊 local、Docker、CLI、restart-with-speed 嘅 runtime routing，同埋兩個 engine 真 packaged render 嘅比較證據。Packaged engine 嘅 bare package imports 亦未有 artifact proof；呢份文檔唔會扮已經完成。
