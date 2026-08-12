# Resizable and draggable panel geometry

Every Pages panel can be resized. Floating interactive panels can also be dragged by their visible
geometry toolbar. Geometry is persisted per surface, bounded by the current viewport, resettable,
and operable without a pointer.

## Behaviour

The shared `PanelGeometry` controller covers docked page/settings panels and every declared
transient owner: anchored popovers, dialog overlays, menu overlays, and command menus. Docked panels
resize. Every transient surface resizes and moves, including `role="menu"`; there is no menu-only
null-controller exemption.

The toolbar exposes wider, taller, smaller, and reset controls with 44-pixel targets. Dragging the
toolbar detaches a floating panel from its anchor for the visit. <kbd>Alt</kbd>+Arrow moves a
floating panel; <kbd>Alt</kbd>+<kbd>Shift</kbd>+Arrow resizes any focused panel.

## Configuration

There is no global switch. Adjust each panel directly and its versioned geometry is stored under
that surface's stable ID. **Reset panel size and position** removes only that panel's record and
returns an anchored panel to its anchor or a docked panel to its responsive layout.

## Failure modes

- Malformed or partly specified stored geometry is ignored.
- A saved size larger than a new viewport is clamped inside a 12-pixel margin.
- A panel moved toward an edge is clamped so its toolbar remains reachable.
- Compact anchored panels retain their sheet fallback and internal scrolling; their saved wide
  position remains available when the viewport becomes wide again.
- A page renderer that replaces its panel contents receives the shared toolbar after rendering, so
  it cannot accidentally erase the controls.

## Security considerations

Geometry contains only width, height and optional screen-relative coordinates. It stays in
namespaced browser preferences, is never transmitted, contains no page content, and cannot name an
arbitrary selector or execute code.

## Verification

- `PanelGeometry.test.ts` proves visible controls, keyboard move/resize, persistence, restoration,
  viewport bounds and reset.
- `panelGeometryCoverage.ts` is a hand-written transient-owner inventory. The test instantiates
  every owner, including both Overlay roles and Menu itself, then fails on a null controller,
  non-floating geometry, or missing toolbar. It does not accept source-string presence as runtime
  evidence.
- Compact captures of the schedule editor and appearance editor show the toolbar and bounded
  internal scrolling at 390 and 414 CSS pixels.

## Suggested articles

- [Pages feature parity](pages-feature-parity.md)
- [Appearance editors](appearance-editors.md)
- [Browser-style tabbed navigation](tabbed-navigation.md)
- [Regex builder](regex-builder.md)

## 廣東話

### 可調大小、可拖曳嘅面板幾何 (Panel geometry)

每個 Pages 面板都可以調大小;浮動嘅互動面板仲可以用佢哋可見嘅 geometry toolbar 嚟拖曳。幾何資料按每個 surface 個別保存、受當前 viewport 限制、可以 reset,而且冇 pointer 都操作得到。

### 行為

共用嘅 `PanelGeometry` controller 覆蓋 docked 嘅 page/settings 面板,同每一個已申報嘅 transient owner:anchored popovers、dialog overlays、menu overlays 同 command menus。docked 面板可以 resize;每個 transient surface 都可以 resize 同 move,包括 `role="menu"`——冇任何 menu 專用嘅 null-controller 豁免。

toolbar 提供加闊、加高、縮細同 reset 四個控制,目標尺寸 44 pixel。拖 toolbar 會令浮動面板喺呢次到訪期間脫離佢嘅 anchor。<kbd>Alt</kbd>+方向鍵移動浮動面板;<kbd>Alt</kbd>+<kbd>Shift</kbd>+方向鍵 resize 任何攞住 focus 嘅面板。

### 設定

冇 global switch。直接調整每個面板,佢嘅 versioned geometry 就會儲存喺嗰個 surface 嘅穩定 ID 之下。**Reset panel size and position** 只會刪走嗰個面板自己嘅記錄:anchored 面板返去佢嘅 anchor,docked 面板返去 responsive layout。

### 失敗情況

- 儲存咗嘅幾何資料格式唔啱,或者只有部分欄位,就直接忽略。
- 儲低嘅尺寸大過新 viewport 嘅話,會 clamp 喺 12 pixel margin 之內。
- 面板被移向螢幕邊緣時會被 clamp,確保 toolbar 仲掂得到。
- compact 嘅 anchored 面板保留 sheet fallback 同內部 scrolling;viewport 再變闊嘅時候,佢哋儲低嘅闊屏位置仍然用得返。
- page renderer 換走面板內容之後,render 完會重新收到 shared toolbar,所以冇可能意外剷走啲控制。

### 保安考慮

幾何資料只包含闊度、高度同可選嘅螢幕相對座標。佢只留喺 namespaced browser preferences,永不傳送,唔包含任何頁面內容,亦冇辦法指定任意 selector 或者執行 code。

### 驗證

- `PanelGeometry.test.ts` 證明咗可見控制、鍵盤 move/resize、persistence、restoration、viewport bounds 同 reset。
- `panelGeometryCoverage.ts` 係人手寫嘅 transient-owner inventory。個測試會 instantiate 每一個 owner,包括兩個 Overlay role 同 Menu 本身,遇到 null controller、非 floating 嘅 geometry,或者冇 toolbar 就 fail。source 入面出現過個字串唔會當係 runtime 證據。
- schedule editor 同 appearance editor 喺 390 同 414 CSS pixel 嘅 compact capture 顯示到 toolbar 同有界嘅內部 scrolling。

### 建議文章

- [Pages feature parity](pages-feature-parity.md)
- [Appearance editors](appearance-editors.md)
- [Browser-style tabbed navigation](tabbed-navigation.md)
- [Regex builder](regex-builder.md)
