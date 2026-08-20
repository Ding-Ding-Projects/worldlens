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

## Security considerations

The record is local application data and is bounded to the two known engine identifiers plus
Automatic. The UI does not execute an engine or download a runtime. Runtime selection, process
launch, and provenance records remain owned by the desktop boundary, which must report its own
observed version and capability result.

The packaged TypeScript staging boundary now includes the required production dependency closure
and validates its manifest and entrypoints, integrated on main by
[`80eefd17`](https://github.com/Ding-Ding-Projects/worldlens/commit/80eefd172d35b9329f95b464e20b56d415826025).
The local staging record reported **TypeScript 0.1.0** and **Java 5.22-27**.

## Verification

The global new-project wiring and packaged TypeScript dependency-closure staging are integrated,
but the decisive acceptance evidence remains open: no genuine packaged project has yet been
rendered through both engines with output and provenance compared, and no corresponding capture
matrix is verified. Runtime routing for local, Docker, CLI, and restart-with-speed requests also
remains an explicit boundary. Track the remaining proof in [issue #78](https://github.com/Ding-Ding-Projects/worldlens/issues/78).

## 廣東話

設定頁有一格 **Render engine choice**，俾新 project 用全域 default；project editor 嘅 **How it renders** 分頁亦有每個 project 自己嘅 override。可以揀 BlueMap 原本個 Java engine、Worldlens 自己個 engine，或者 Automatic：有合適 JVM 就保留 BlueMap，冇就用 app engine，唔會靜雞雞轉台。每張卡都寫清楚版本、來源、能力同唔支援嘅設定，仲有自己個搜尋欄同 anchored regex builder。匯入錯檔案會成份拒絕，唔會食半份設定。

Global new-project wiring 而家已經接入 ProjectsScreen 同 WorldScreen，packaged TypeScript 嘅 required production dependency closure 亦已經 stage 同 validate；local staging record 係 TypeScript 0.1.0、Java 5.22-27。不過兩個 engine 真 packaged render、output/provenance comparison、capture matrix，同 local、Docker、CLI、restart-with-speed runtime routing 仍然未證實，issue #78 繼續 open。
