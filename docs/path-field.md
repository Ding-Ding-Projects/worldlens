# Browsing for a folder or a file

Every field in the application that names a folder or a file on this computer offers the
same native browse button beside the text box, in addition to typing or pasting the path by
hand. Typing always keeps working; the button is an addition, never a replacement.

This is the shared control, `PathField`, and the point of documenting it once here rather
than once per screen is that it behaves identically everywhere it appears: the same button
placement, the same keyboard behaviour, the same disabled state and explanation when there is
nothing to browse with.

## Where it appears

| Screen | Field | What it picks |
|---|---|---|
| Any schema-driven config screen (Maps, Storages, the general config editor) | Every setting the config schema marks as a path - the web server root, the map storage folder, the debug and access log files, the JDBC driver `.jar`, and more | Folder or file, depending on the setting |
| Maps screen, New Map dialog | World folder | Folder |
| Storages screen, New Storage dialog | Folder for rendered tiles | Folder |
| Settings, Storage row | Folder for rendered maps | Folder |
| First-run setup wizard, storage step | Folder for rendered maps | Folder |
| Remote render target editor | Private key file (the SSH identity file) | File |
| Backup screen | The world or render folder being backed up | Folder |
| Project editor, render options | Where the rendered map is written, when overriding the default | Folder |

The make-a-map wizard's own world-folder step, the project screen's "add a world" flow, the
CI render screen and the "mount another Minecraft folder" dialog each offer their own folder
browse button as well, wired directly rather than through this shared control - they predate
it and already worked, so they were left as they were rather than rewritten for its own sake.
Typing, browsing and (on the wizard's own step) dropping a folder all work the same way in
every case; see [Finding worlds](./finding-worlds.md) for that step specifically.

## Behaviour

- **A pick writes into the field exactly as typing would.** There is no separate "picked"
  state, no extra confirmation step, and no notice when the dialog is cancelled - a
  cancelled dialog leaves the field exactly as it was, matching every picker in the
  application.
- **The dialog starts at the field's current value**, once there is one, rather than at an
  arbitrary default location.
- **A field can ask for a folder, a file, or offer both.** A file field can also restrict the
  dialog to particular extensions - the JDBC driver field only offers `.jar` files, the log
  file fields only offer `.log` files - while a field with no natural extension, such as an
  SSH private key, offers every file.

## Keyboard and accessibility

- The browse button is a real button, so Enter and Space activate it through the browser's
  own native keyboard handling.
- Its accessible name always says what it browses for - "Browse for world folder", never a
  bare "Browse" - so a screen-reader or keyboard user tabbing through several such buttons on
  one screen can tell them apart.
- A field offering both a folder and a file button gives each one its own distinguishable
  name, for the same reason.
- The dialog itself carries a title naming the same field, so its own window is identifiable
  independent of the button that opened it.

## Failure modes and security

- **No desktop app, no browse button.** A browser tab, or any build without the desktop
  bridge, has no native folder or file dialog to open. The button is shown disabled with an
  explanation naming the field and saying that typing or pasting the path still works; the
  text field itself is never disabled.
- **The application only ever records the path as text.** Browsing for the SSH private key
  file is the clearest case: the application writes down where the file is, hands that path
  to the SSH client, and never opens, copies or transmits the file's contents itself. There
  is no password field anywhere in the remote render feature, and the SSH client is told to
  refuse one even if the remote host offers it.
- **A picked path is not validated by the dialog.** Whether a chosen folder or file actually
  works for its purpose - a world folder that contains a save, a storage folder that is
  writable - is checked by the screen that owns the field, the same way a typed path is
  checked, so browsing carries no more trust than typing does.

## Verification

```sh
cd design && npx vitest run packages/ui/src/components/PathField.test.ts       # the control itself
cd design && npx vitest run packages/ui/src/components/pathFieldHost.test.ts   # the bridge probe
cd design && npx vitest run packages/ui/src/copy/surfaces/pathField.test.ts    # its copy, in both languages
cd design && npx vitest run packages/ui/src/components/pathFieldPolicy.test.ts # every wired field, plus a sweep for one that was never wired
cd design && npx vitest run packages/app/src/main/dialogs                     # the native dialog, in the main process
```

`pathFieldPolicy.test.ts` is the guard against this feature quietly rotting: it names every
field above and fails if one loses its browse button, and separately scans every text field
in the application for one that reads as a folder or a file path but carries no browse button
and no written reason why not.

## Related

- [Finding worlds](./finding-worlds.md) - the wizard step this control shares its browse
  behaviour with, which also offers dropping a folder
- [Rendering on a remote host](./remote-render.md) - the SSH identity file field
- [Backing up a world or a rendered map](./backup.md) - the backup screen's folder field

## 廣東話

### 揀資料夾或者檔案 (PathField)

應用程式入面每個要填本機資料夾或者檔案路徑嘅欄位,喺文字框旁邊都有同一個原生 browse 掣;打字或者貼上路徑照樣永遠得——個掣係加多一個選擇,唔係取代。呢個共用控制項叫 `PathField`。喺呢度記一次而唔係每個畫面記一次,重點就係佢喺邊度出現行為都一模一樣:同一個掣位置、同一套鍵盤行為、同一個 disabled 狀態同冇嘢可以 browse 時嘅解釋。

### 出現喺邊度

所有 schema-driven config 畫面(Maps、Storages、general config editor)入面,config schema 標明係 path 嘅每一個設定——web server root、map storage folder、debug 同 access log 檔、JDBC driver 嘅 `.jar` 等等——按設定揀資料夾或者檔案。另外仲有:Maps 畫面 New Map dialog 嘅 world folder(資料夾);Storages 畫面 New Storage dialog 嘅 rendered tiles 資料夾;Settings 嘅 Storage row(資料夾);first-run setup wizard 嘅 storage step(資料夾);remote render target editor 嘅 private key 檔,即 SSH identity file(檔案);Backup 畫面要備份嘅 world 或者 render 資料夾;同埋 project editor render options 入面 override 預設輸出位置嗰個資料夾。

make-a-map wizard 自己嘅 world-folder step、project 畫面嘅「add a world」流程、CI render 畫面同「mount another Minecraft folder」dialog,各自有自己直接接駁嘅 browse 掣——佢哋早過呢個共用控制項出現而且本來已經 work,所以冇為改而改。打字、browse,同(喺 wizard 嗰步)drop 資料夾,喺每個 case 行為都一樣;嗰一步詳見 [Finding worlds](./finding-worlds.md)。

### 行為

- **揀完寫入欄位,同打字冇分別。** 冇獨立嘅「picked」狀態,冇額外確認步驟,dialog 取消咗亦冇通知——取消嘅話欄位維持原狀,同應用程式入面每一個 picker 一致。
- **dialog 由欄位當前嘅值開始**(有值嘅話),而唔係一個隨便嘅預設位置。
- **欄位可以要資料夾、要檔案,或者兩樣都提供。** 檔案欄位仲可以限 dialog 只顯示特定 extension——JDBC driver 欄位只顯示 `.jar`,log 檔欄位只顯示 `.log`;冇天然 extension 嘅欄位(例如 SSH private key)就咩檔案都顯示。

### 鍵盤同無障礙

browse 掣係一個真正嘅 button,所以 Enter 同 Space 經 browser 自己嘅原生鍵盤處理就啟動得到。佢嘅 accessible name 一定講明 browse 緊咩——「Browse for world folder」,永遠唔係淨得一個「Browse」——所以螢幕閱讀器或者鍵盤用戶 tab 過同一畫面幾個咁嘅掣都分得清邊個係邊個。同時提供資料夾掣同檔案掣嘅欄位,兩個掣各有可以分辨嘅名,原因一樣。dialog 本身嘅標題都寫住同一個欄位名,所以佢個 window 唔使靠邊個掣開佢都認得出。

### 失敗情況同保安

- **冇 desktop app 就冇 browse 掣。** browser tab,或者任何冇 desktop bridge 嘅 build,冇原生資料夾/檔案 dialog 可以開。個掣會以 disabled 顯示,附解釋講明係邊個欄位、同埋打字或者貼上路徑照樣得;文字欄位本身永不會 disabled。
- **應用程式只會以文字記低個路徑。** SSH private key 係最清楚嘅例子:應用程式記低個檔案喺邊,將路徑交畀 SSH client,自己永遠唔會開啟、複製或者傳送檔案內容。remote render 功能任何地方都冇密碼欄位,而且 SSH client 被明確吩咐:就算 remote host 提出都要拒絕用密碼。
- **dialog 唔會驗證揀咗嘅路徑。** 揀嘅資料夾或者檔案實際啱唔啱用——world folder 有冇 save、storage folder 寫唔寫得入——由擁有欄位嘅畫面去檢查,同打字輸入嘅路徑一樣咁檢查,所以 browse 唔會比打字攞多咗任何信任。

### 驗證

```sh
cd design && npx vitest run packages/ui/src/components/PathField.test.ts       # the control itself
cd design && npx vitest run packages/ui/src/components/pathFieldHost.test.ts   # the bridge probe
cd design && npx vitest run packages/ui/src/copy/surfaces/pathField.test.ts    # its copy, in both languages
cd design && npx vitest run packages/ui/src/components/pathFieldPolicy.test.ts # every wired field, plus a sweep for one that was never wired
cd design && npx vitest run packages/app/src/main/dialogs                     # the native dialog, in the main process
```

`pathFieldPolicy.test.ts` 係防止呢個功能靜靜哋爛落去嘅 guard:佢逐一點名上面每一個欄位,有邊個冇咗 browse 掣就 fail;另外仲會掃描應用程式入面每一個文字欄位,搵有冇睇落係資料夾或者檔案路徑、但又冇 browse 掣、亦冇寫低原因嘅欄位。

### 相關文章

- [Finding worlds](./finding-worlds.md)——同呢個控制項共用 browse 行為嘅 wizard step,嗰度仲可以 drop 資料夾
- [Rendering on a remote host](./remote-render.md)——SSH identity file 欄位
- [Backing up a world or a rendered map](./backup.md)——backup 畫面嘅資料夾欄位
