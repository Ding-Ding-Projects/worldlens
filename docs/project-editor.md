# Editing a project

## Behaviour

A project is the repeatable description of a render: its maps, storages, render options and the
four whole-file BlueMap settings. `ProjectEditor.vue` presents those sections as its own nested
browser-style tab strip, so the project remains editable without leaving the application shell.

The shell's map panel deliberately lets pointer input pass through to the map canvas. That is an
explicit host choice, `panel-pass-through`, rather than a selector that reaches every tab panel
below it. The Project Editor's nested panels explicitly restore ordinary pointer input. A click,
pointer press, Enter or Space therefore activates the editor's real tabs and buttons without
opening a hidden overlay or falling through to the map underneath.

An empty project offers two honest starting paths:

- **Add a map** opens the inline form and focuses its first field.
- **Use this preset** applies one of the project's real BlueMap-derived templates, selects the
  first created map and focuses its name. The generated maps remain fully editable.

The editor labels unsaved work and does not save on a tab change. Save is a deliberate action; a
successful project save is recorded in the project's append-only local history. Revert discards
the current edits only through the host's existing audited project path.

## Configuration

| Item               | Value                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Tab layout key     | `worldlens-project-editor-tabs`; the former key is imported only when current state is absent           |
| Sections           | Maps, Storages, How it renders, History, Core, Web app, Web server, Plugin                              |
| Pointer policy     | The application shell alone opts into pass-through; nested tab panels default to `pointer-events: auto` |
| New-map defaults   | BlueMap's own schema and project templates, never invented sample data                                  |
| Responsive targets | At least 44 CSS pixels for primary project, tab, search and live-speed controls                         |

The editor's project value remains owned by its host. A map, storage or setting edit emits an
updated project; Save, Revert, Close and Render remain separate actions. Tab placement, ordering,
pinning and grouping are ordinary tab-layout preferences and do not alter project data.

## Failure modes

- A stale shell-level `pointer-events: none` rule reaching nested panels makes controls look live
  while every pointer action falls through. The typed pass-through prop and mounted shell test
  guard that boundary.
- A keyboard handler that treats Enter or Space as a menu gesture can open an overlay rather than
  activate the tab. The tab strip handles both keys as activation and prevents their default
  scrolling/menu behavior.
- A newly added map with no focus target leaves a keyboard user at the button that disappeared.
  Add and preset routes wait for the form to render and focus the first editable field.
- A narrow or bilingual layout can crowd the map list, action row or search controls. The project
  container stacks those regions at its responsive breakpoints, wraps long labels and bounds
  overlays to the viewport with internal scrolling.
- Save failures remain visible as the host's exact error. The editor does not infer success from
  a dismissed progress state.

## Security considerations

Editing is local. The pointer boundary grants input only to the visible nested panel; it does not
add a privileged bridge or broaden the files the project host may write. Project persistence uses
the existing validated project path and append-only local history. Presets contain BlueMap config
values, not credentials or network-fetched content.

Removing a map still uses the project's destructive confirmation and states that already-rendered
tiles remain on disk. The interaction fix does not bypass that gate or any unsaved-work check.

## Verification

- `components/project/ProjectEditor.test.ts` exercises the real nested tabs with pointer input,
  Enter and Space; the Add button's full pointer sequence; inline-form focus; preset creation;
  post-preset editability; save, revert and validation states.
- `packages/ui/src/App.test.ts` mounts the real shell and Project Editor together, proves only the
  outer shell panel computes to `pointer-events: none`, proves the nested panel is interactive,
  and clicks the Core, Maps and Add-map paths.
- `components/project/projectSurfaceSizing.test.ts` inventories the 44px targets, responsive
  stacking, text wrapping and viewport-bounded overlay rules for the project and related controls.
- `pnpm --filter @worldlens/ui run typecheck` verifies the typed pass-through boundary and
  the editor/component contracts.

The focused mounted tests and UI typecheck pass on this change. A packaged, hidden-desktop capture
remains a separate runtime proof and must be reported independently from these DOM and CSS checks.

## Suggested articles

- [Browser-style tabbed navigation](./tabbed-navigation.md) for the layout and keyboard model the
  nested editor uses.
- [Worlds ready to use on the Projects tab](./project-world-discovery.md) for the path that opens a
  discovered world in this editor.
- [Local version history for config folders](./config-history.md) for the append-only history model
  shared by project saves.
- [Super confirmation](./super-confirmation.md) for the gate used when a map is removed.

## 廣東話

### 編輯 project (Project Editor)

#### 行為

一個 project 係一次 render 嘅可重複描述:佢嘅 maps、storages、render options,加四份 whole-file BlueMap settings。`ProjectEditor.vue` 用自己嵌套嘅 browser-style tab strip 呈現呢啲 section,所以唔使離開 application shell 都編輯到 project。

shell 嘅 map panel 刻意畀 pointer input 穿透落 map canvas。呢個係明確嘅 host 選擇,叫 `panel-pass-through`,唔係一條掂到下面每個 tab panel 嘅 selector。Project Editor 嘅嵌套 panel 明確恢復正常 pointer input,所以 click、pointer press、Enter 或者 Space 會啟動編輯器嘅真 tab 同掣,唔會打開一個隱藏 overlay,亦唔會穿透落底下個地圖。

一個空嘅 project 提供兩條老實嘅起步路:**Add a map** 打開 inline form 並 focus 第一個欄位;**Use this preset** 套用 project 真正由 BlueMap derive 嘅 template 之一,揀選第一個建立咗嘅 map 並 focus 佢個名。生成嘅 maps 仍然完全可以編輯。

編輯器會標明未儲存嘅工作,轉 tab 唔會自動 save。save 係一個要人主動做嘅動作;成功 save project 會記入 project 嘅 append-only 本地 history。Revert 只會經 host 現有、經 audit 嘅 project 路徑捨棄當前編輯。

#### 設定

tab layout key 係 `worldlens-project-editor-tabs`;舊 key 只會喺當前狀態唔存在時先 import。section 有:Maps、Storages、How it renders、History、Core、Web app、Web server、Plugin。pointer policy:只有 application shell 揀 pass-through,嵌套 tab panel 預設 `pointer-events: auto`。新 map 嘅預設值來自 BlueMap 自己嘅 schema 同 project template,永不作 sample data。responsive 目標:主要 project、tab、search 同 live-speed 控制至少 44 CSS pixel。

編輯器嘅 project value 仍然由佢個 host 擁有。改一個 map、storage 或者 setting 只係 emit 一個更新咗嘅 project;Save、Revert、Close 同 Render 係各自獨立嘅動作。tab 嘅擺位、次序、pin 同 grouping 係普通嘅 tab-layout preferences,唔會改 project 數據。

#### 失敗情況

- 一條過時嘅 shell 級 `pointer-events: none` rule 掂到嵌套 panel 嘅話,啲控制睇落生猛但每個 pointer 動作都穿咗底。typed 嘅 pass-through prop 同 mounted shell test 睇實呢條界。
- 將 Enter 或者 Space 當 menu gesture 嘅鍵盤 handler 可能打開 overlay 而唔係啟動 tab。tab strip 將兩個鍵都當啟動處理,並阻止佢哋預設嘅 scroll/menu 行為。
- 新加咗 map 但冇 focus 目標,會令鍵盤用戶留喺一個消失咗嘅掣度。Add 同 preset 兩條路都會等 form render 完,再 focus 第一個可編輯欄位。
- 窄或者雙語 layout 可能逼爆 map list、action row 或者 search 控制。project container 喺 responsive breakpoint 將呢啲區域疊起、長 label 換行,overlay 限喺 viewport 內加內部 scrolling。
- save 失敗會以 host 嘅原文錯誤顯示。編輯器唔會因為 progress 狀態消失咗就當成功。

#### 保安考慮

編輯係本地嘅。pointer boundary 只將 input 交返畀見得到嗰個嵌套 panel;佢冇加特權 bridge,亦冇擴闊 project host 可以寫嘅檔案。project persistence 用現有經驗證嘅 project 路徑同 append-only 本地 history。preset 入面係 BlueMap config 值,唔係 credentials 或者網絡攞返嚟嘅內容。

移除一個 map 照樣行 project 嘅 destructive confirmation,並講明已經 render 咗嘅 tiles 仍然留喺磁碟。interaction fix 冇繞過嗰道閘,亦冇繞過任何未儲存工作嘅檢查。

#### 驗證

- `components/project/ProjectEditor.test.ts` 用 pointer input、Enter 同 Space 操作真嘅嵌套 tab;Add 掣嘅完整 pointer sequence;inline-form focus;preset 建立;preset 之後嘅可編輯性;save、revert 同 validation 狀態。
- `packages/ui/src/App.test.ts` mount 真嘅 shell 同 Project Editor 一齊,證明只有最外層 shell panel compute 到 `pointer-events: none`,證明嵌套 panel 係可以互動,再 click Core、Maps 同 Add-map 路徑。
- `components/project/projectSurfaceSizing.test.ts` inventory 44px 目標、responsive stacking、text wrapping 同 project 及相關控制嘅 viewport-bounded overlay rules。
- `pnpm --filter @worldlens/ui run typecheck` 驗證 typed pass-through boundary 同 editor/component contracts。

focused 嘅 mounted 測試同 UI typecheck 喺呢個改動上係 pass 嘅。packaged、hidden-desktop capture 係另一項獨立嘅 runtime 證明,要同呢啲 DOM 同 CSS 檢查分開匯報。

#### 建議文章

- [Browser-style tabbed navigation](./tabbed-navigation.md)——嵌套編輯器用嘅 layout 同鍵盤模型。
- [Worlds ready to use on the Projects tab](./project-world-discovery.md)——由發現咗嘅世界打開呢個編輯器嗰條路。
- [Local version history for config folders](./config-history.md)——project save 共用嘅 append-only history 模型。
- [Super confirmation](./super-confirmation.md)——移除 map 時用嗰道閘。
