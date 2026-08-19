# Measurement and waypoints

## Behaviour

This feature is planned, not shipped. The current application can display a rendered map and
supports the existing marker workflow, but the issue #75 measurement and waypoint tools are not
present in the audited checkout at commit `652b9e572ff338151badf51268007d75b28f445b`.

The planned surface must provide point-to-point distance, polyline length, horizontal and vertical
deltas, area, and block coordinates with explicit dimension and scale context. It must also provide
editable, grouped, tagged, searchable waypoints that can be focused from the keyboard and command
palette. Overlay geometry must remain accurate while zooming, changing maps, changing dimensions,
and applying coordinate-scale conversions.

## Configuration and persistence

The planned implementation must persist measurement and waypoint data per project, record changes
in local version history, and provide undo and restore. Bulk move, copy, delete, and export actions
must show their scope before applying changes; destructive actions require the application's
two-key confirmation flow. Search fields, context menus, appearance controls, accessible names,
keyboard focus, and narrow layouts must follow the same contracts as the rest of the viewer.

Exports must preserve the data faithfully in every supported structured and text format and offer
an action to open the result in Visual Studio Code.

## Failure modes and security

Negative or very large coordinates, Nether coordinate scaling, precision boundaries, Unicode names,
and invalid imports need explicit validation and honest error states. An invalid import must not
partially apply. Local project data must remain local; no measurement, waypoint, coordinate, or
user-provided label should be sent to a network service merely to render or edit an overlay.

## Verification boundary

No implementation, focused tests, packaged-artifact interaction, or real capture is claimed by this
record. Issue #75 remains open. The acceptance work still required is the implementation, focused
tests for the numeric and import/export boundaries, and a capture from the packaged viewer showing
real measurement and waypoint overlays. The roadmap and handoff deliberately keep this item
pending rather than describing the planned surface as available.

## 廣東話 / Cantonese

呢個功能仲係計劃中，未出貨。要有距離、折線長度、水平／垂直差、面積、座標同維度比例，
亦要有可以編輯、分組、加 tag、搜尋、匯入匯出嘅 waypoint；縮放、轉地圖、轉維度都唔可以
令 overlay 飄走。呢篇文檔只記錄要求同目前邊界，冇冒充已經做完，issue #75 仍然開住。
