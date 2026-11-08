# External editor and VS Code

Worldlens opens files and folders in the editor you use, and anything it exports opens in Visual Studio Code in one action.

## Choosing an editor

**Settings → External editor** lists every editor found on this computer with its path: Visual Studio Code (per user and for the machine), VS Code Insiders, VSCodium, Cursor, Notepad++, Sublime Text and Notepad on Windows, with the usual places on macOS and Linux, plus anything on `PATH`. Choose one with the radio buttons; the choice is remembered. **Add an editor** opens the system file picker so you can add a program that was not found, and **Remove** takes an added one off the list. A folder always opens as a workspace, not as a single file.

When nothing is found the section says so plainly and links to the VS Code download page.

## Open in VS Code

These open in Visual Studio Code in one action, whichever editor is chosen above:

- a finished Base64 file job's result;
- the disk screen's script for the chosen operation (written to a private scratch file first, never over an existing one);
- the drawing board's SVG;
- what an extension produced;
- the file converter's exported files.

VS Code is looked for as a per-user install, a machine install, Insiders and VSCodium, in that order. When none is installed the answer says so and carries the download page; it never opens some other program instead.

## Security

Adding an editor goes through the system file picker in the main process, so the interface never hands over a program path. Only an existing file can be added. Opening checks that the target still exists. The hosted workspace refuses these actions with the reason, because an editor runs on the computer with the desktop app.

## Verification

- `design/packages/app/src/main/editors/editors.test.ts`: detection order per user before machine, PATH and portable installs, opening a file and a folder as a workspace, the remembered choice, the one-action VS Code route with the download page when there is none, and adding and removing a program.
- `design/packages/ui/src/components/editors/ExternalEditorPanel.test.ts`: the list with paths, choosing, the empty state with the download link, and the desktop-only message.

## 廣東話

Worldlens 會用你慣用嘅編輯器開檔案同資料夾,匯出嘅嘢一撳就喺 Visual Studio Code 開。

- **揀編輯器:** **設定 → 外部編輯器** 會列出呢部電腦搵到嘅所有編輯器同佢哋嘅路徑:Windows 上面有 Visual Studio Code(個人同全機安裝)、Insiders、VSCodium、Cursor、Notepad++、Sublime Text 同記事本,macOS 同 Linux 都有慣常位置,再加 `PATH` 上面嘅。用圓掣揀一個,會記住。「加編輯器」會開系統揀檔視窗,俾你加冇被搵到嘅程式;「移除」可以拎走你加嘅。資料夾一定會當工作區開。搵唔到任何編輯器就會直講,同埋俾 VS Code 下載連結。
- **喺 VS Code 開:** Base64 檔案工作嘅結果、磁碟畫面嘅腳本(會先寫入私人暫存檔,唔會蓋過舊檔)、畫板嘅 SVG、擴充功能交出嚟嘅嘢、檔案轉換器匯出嘅檔,全部一撳就喺 VS Code 開。會順序搵個人安裝、全機安裝、Insiders 同 VSCodium;一個都冇就直講同俾下載連結,唔會亂開第二個程式。
- **安全:** 加編輯器經主程序嘅系統揀檔視窗,介面唔會遞程式路徑過去;只可以加存在嘅檔案;開之前會檢查目標仲喺唔喺度。寄存工作區會拒絕呢啲動作,因為編輯器喺有桌面版嗰部電腦行。
- **驗證:** 上面列出嘅兩個測試檔。
