# The rich text editor

Every box where you format text (bold, lists, links, tables) uses one editor: a bundled copy of
TinyMCE. Today that is the **note on a marker** in the marker studio. Plain text boxes stay plain
and code boxes stay code boxes; only a box that keeps formatting is a rich text box.

## What you get

- A toolbar with undo and redo, paragraph and heading styles, bold, italic, underline,
  strikethrough, text colour, bulleted and numbered lists, indent, links, tables, special
  characters, find and replace, full screen and a help dialog.
- On a narrow window the toolbar folds into a sliding overflow, so every action stays reachable.
- A status bar with a word count, and the editor's own keyboard help (press `Alt+0` inside the
  editor).
- The editor follows the application: light and dark themes, the surface and text colours of the
  current theme, and the interface language.

## Where it is used

| Field | Where | Holds |
| --- | --- | --- |
| Marker note | Marker studio, the **Note (optional)** field | Formatted text shown in the marker popup on the map |

Notes written before the editor existed are plain text with line breaks. They open as paragraphs,
one per line, and are stored exactly as typed until you change them.

## Where it is not used, and why

Plain text and code stay in ordinary text boxes. The full list, with a reason for each box, is
kept by hand in `design/packages/ui/src/components/richText/richTextInventory.ts`: raw
configuration files, regular expressions and their samples, data pack JSON, function files, SNBT,
file paths, Base64, issue reports, support tickets, Ollama prompts and a drawing text layer. The
server message of the day is a single `server.properties` line that uses the game's own
section-sign colour codes, so it is not HTML and stays a text field.

## Language

TinyMCE can show one interface language at a time.

| Language mode | Editor interface |
| --- | --- |
| English | English |
| Cantonese | Cantonese (Hong Kong), from the bundled `tinymce-i18n` pack |
| Bilingual | English |

The Cantonese pack does not translate every string; a missing string falls back to English inside
the editor. Changing the language mode or the theme rebuilds the editor around the same content,
so nothing you typed is lost.

## Offline, bundled and licensed

- The editor, its skins, icons, plugins and the Cantonese pack are bundled into the application
  and loaded from it. There is no Tiny Cloud script, no API key and no request to a Tiny host.
- It is loaded the first time a rich text field appears, so it adds nothing to startup.
- TinyMCE 8 is offered under GPL version 2 or later. This application is under the MIT licence,
  which is GPL-compatible, so the editor is used under the GPL route (`license_key: "gpl"`). The
  notice is in `design/NOTICE`.
- No image or media plugin is loaded. There is no upload route, so nothing can be uploaded from
  the editor and pasted images are not embedded.

## Sanitizing

The editor is never the only defence.

1. The field cleans what the editor returns before it emits it.
2. The marker model cleans the note again wherever a marker is created, edited or imported, so a
   stored note never depends on the editor having done its job.
3. The viewer cleans it a third time when it shows the popup.

Scripts, event handlers, `javascript:` links, frames, forms, style elements, SVG and data
attributes are removed. Where no document is available to clean with (a plain node process), the
model fails closed by dropping every tag instead of passing markup through.

## Failure modes

| What happens | What you see |
| --- | --- |
| The editor is still loading | A plain box with "Loading the text editor..." beside it, read-only until the editor is ready |
| The editor cannot load | A message saying so, and the note shown as raw formatted text that can still be edited and saved |
| The field is disabled | The editor is read-only and the exact reason is written beside the field |
| A note is over 4,000 characters of formatted text | The marker form refuses to save it and says so |

## Security considerations

- Everything the editor produces is treated as untrusted and sanitized as described above.
- The editor offers no new-window option for links, its link dialog offers `rel="noopener noreferrer"`, and no external plugin or script can be
  loaded: the configuration names no remote asset.
- Nothing is sent anywhere. The editor works with the application offline.

## Verification

- `richTextInventory.test.ts` reads the whole package against the hand-written inventory and fails
  on a rich text field without the editor, an editor that is not listed, a new unclassified
  multi-line box, a hand-rolled `contenteditable` editor, another rich text library, or any
  reference to a Tiny host.
- `RichTextField.test.ts` covers mounting, round trips, script and handler stripping, the
  disabled reason, the light and dark skin switch, the Cantonese interface, and the failed-load
  fallback.
- `tinymceLoader.test.ts` loads the real bundled editor and proves the pinned version, the
  plugins, the skins, the Cantonese pack and an offline initialisation.
- `markerNote.test.ts` and `sanitizeRichText.test.ts` cover the sanitizing where a note is saved.
- Not yet verified: the editor in the packaged desktop build, screenshots of the editor in light
  and dark, narrow-window and high-scale layouts, and screen-reader behaviour.

## Suggested articles

- [Marker studio](./marker-studio.md)
- [Appearance editors](./appearance-editors.md)
- [Accessibility and sizing](./display-and-ease-of-use.md)

## 廣東話

凡係可以格式化文字(粗體、清單、連結、表格)嘅輸入框,都用同一個編輯器:內置嘅 TinyMCE。
而家用咗嘅地方係標記工作室入面標記嘅「備註」。純文字同程式碼輸入框照舊係普通輸入框,只有保留
格式嘅先係富文字輸入框。

**功能:** 工具列有復原、重做、段落同標題樣式、粗體、斜體、底線、刪除線、文字顏色、清單、縮排、
連結、表格、特殊字元、搜尋取代、全螢幕同說明。視窗窄嘅時候工具列會收埋入滑動溢出選單,所以
每個動作都仍然搵得到。編輯器跟返程式嘅淺色或深色主題同介面語言。

**舊備註:** 編輯器未出現之前寫嘅備註係有換行嘅純文字,開嗰陣會變成一行一段,你冇改過就會原樣
保存。

**語言:** TinyMCE 一次只可以顯示一種介面語言。廣東話模式用內置嘅香港廣東話語言包,英文同雙語
模式用英文。語言包唔係每句都有翻譯,冇嘅會用返英文。轉語言或者轉主題會重建編輯器,但內容唔會
失去。

**離線同授權:** 編輯器、佢嘅外觀、圖示、外掛同語言包全部內置,冇 Tiny 雲端指令碼、冇 API 金鑰、
唔會向 Tiny 主機發出任何請求。第一次有富文字欄位出現先載入,所以唔會拖慢啟動。TinyMCE 8 以 GPL
第 2 版或以上提供;呢個程式用 MIT 授權(同 GPL 相容),所以行 GPL 途徑。聲明喺 `design/NOTICE`。
冇載入圖片或者媒體外掛,冇上載路徑,貼上嘅圖片亦唔會嵌入。

**清理:** 編輯器唔係唯一防線。欄位會清理編輯器交出嘅內容;標記模型喺建立、編輯同匯入標記嗰陣
再清理一次;檢視器顯示彈出視窗嗰陣再清理第三次。腳本、事件處理器、`javascript:` 連結、框架、
表單、樣式元素、SVG 同資料屬性都會被移除。冇文件可以用嘅時候(純 node 程序),模型會保守處理,
移走所有標籤,而唔係原樣放行。

**出錯嗰陣:** 編輯器載入緊嗰陣,會顯示一個純文字框同「載入緊文字編輯器...」,載入完先可以改。
載入唔到嘅話會講明,備註會以原始格式文字顯示,仍然可以編輯同儲存。欄位停用嘅時候,編輯器唯讀,
而且原因會寫喺欄位旁邊。

**未驗證:** 打包版桌面程式入面嘅編輯器、淺色同深色嘅畫面擷取、窄視窗同高縮放嘅版面,以及螢幕
閱讀器嘅表現,全部都未驗證。
