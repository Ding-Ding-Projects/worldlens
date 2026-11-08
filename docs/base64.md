# Base64

The **Base64** job encodes and decodes text and files on this computer. Nothing is uploaded. Open it from the command palette (`Ctrl+Shift+F`, then type "Base64") or from the Work tabs.

![Decoding with the bad character marked](evidence/base64/error-1440x900.png)

## Text

- **Alphabets:** standard (RFC 4648 section 4), URL-safe (section 5) and MIME (76 characters per line with CRLF), plus any line length.
- **Padding** on or off when encoding. **Strict decoding** refuses anything outside the alphabet, spaces, line breaks outside MIME and wrong padding, and names the exact character and its position; lenient decoding ignores whitespace, accepts both alphabets and missing padding.
- **Text encodings:** UTF-8, UTF-16 LE, UTF-16 BE and Latin-1. Text that cannot be written in the chosen encoding is reported, never mangled. Byte counts show on both sides.
- **Import** from a file, the clipboard or a paste; a pasted `data:` URL is decoded straight away.
- **Export:** copy, copy as a `data:` URL, save as a file (never over an existing one), or a JSON record of the conversion.
- A failed decode never shows partial output.

## Files

Drop a file on **Encode** and Worldlens writes `name.ext.base64.txt` beside it. Drop that text file on **Decode** and it writes `name.ext` back beside it. The name comes from the `.base64.txt` or `.b64` pattern first, then a leading `data:` URL's type, then the decoded bytes' signature, and `.bin` last. Neither direction overwrites: a taken name gets a number before the extension, such as `report (1).pdf`.

Files of any size are streamed through one megabyte at a time into a hidden partial file. Encoded output is decoded again and its SHA-256 compared with the source; decoded output is read back and its SHA-256 compared with what was decoded. Only a match is renamed into place. Pause, resume and cancel work at any point, and a cancel or failure leaves nothing behind. Results show the SHA-256 and a **Show in folder** action; decoded results get a preview. Finished jobs export as a `.zip` of their JSON records and any result up to 256 KB.

Without the desktop app (a hosted workspace), files up to 256 MB are read in the window and the result downloads under the same names.

![Files](evidence/base64/files-1440x900.png)

## Preview

The preview element is chosen from the bytes' signature, never a name or claimed type: images, audio and video play from a blob URL in plain media elements, text shows as text, and everything else, SVG and HTML included, is a hex dump. Nothing decoded is run, opened or framed.

## History and undo

Every copy, save and file conversion is a history entry with names, sizes and SHA-256, never the payload. Undo and redo are unlimited. They survive a restart only when **Keep inputs on this computer** is on, because by default nothing typed is written to disk. Clearing history needs the two-key confirmation.

## On the documentation site

The site's Base64 article (`#/docs/base64`) carries the same tool, built from the same shared code: every alphabet and option, exact error positions, history and undo. A web page cannot write beside a file, so files are read in the page (up to 256 MB) and the result downloads as `name.ext.base64.txt` or the restored `name.ext`.

![The tool on the site](evidence/base64/site-tool-1440x900.png)

## Verification

- `design/packages/shared/src/base64.test.ts`: round trips for every alphabet, padding option and length remainder against Node's encoder; RFC 4648 test vectors (removing padding from the encoder turns this red); strict offsets; every text encoding; `data:` URLs; naming order; preview kinds; hex dump; CRC-32 and a ZIP read back by Python's `zipfile`; streaming in odd chunk sizes.
- `design/packages/app/src/main/base64/files.test.ts`: the same-folder round trip with numbered names, `data:` and signature naming, refusal of non-Base64 text with nothing left behind, a 128 MB file streamed in bounded memory with the exact output length, pause and cancel, and exports that never overwrite.
- `design/packages/ui/src/components/base64/Base64Screen.test.ts`: conversion and truthful failures, 300-step undo surviving a restart only when inputs are kept, history without payloads, the exact bad-character mark, typing as one undo step, and a safe preview that never renders SVG markup.
- `design/packages/site/src/tools/base64Tool.test.ts`: the site tool encodes as you type, marks the exact bad character, steps back through undo and redo, never renders decoded markup and follows the language setting.
- Screenshots come from the built interface and the built site in headless Chrome, without the desktop bridge.

## 廣東話

**Base64** 工作喺呢部電腦度將文字同檔案編碼同解碼,乜都唔會上載。喺指令面板(`Ctrl+Shift+F`,再打 "Base64")或者「工作」分頁開。

- **文字:** 標準(RFC 4648 第 4 節)、網址安全(第 5 節)同 MIME(每行 76 個字,CRLF 換行),仲可以自訂每行長度。編碼時可以開或者閂補位。**嚴格解碼**會拒絕字母表以外嘅字、MIME 以外嘅空格同換行、同埋錯嘅補位,仲會講明係邊個字、喺第幾個位;寬鬆解碼會忽略空白,兩套字母表都收,冇補位都得。文字編碼有 UTF-8、UTF-16 LE、UTF-16 BE 同 Latin-1;寫唔到落揀咗嘅編碼嘅字會報出嚟,唔會靜靜雞整爛。解碼失敗唔會出半份結果。
- **匯入同匯出:** 可以由檔案、剪貼簿或者貼上匯入,貼 `data:` 網址會即刻解碼。可以複製、複製成 `data:` 網址、存做檔案(永遠唔會蓋過舊檔),或者匯出成 JSON 記錄。
- **檔案:** 將檔案拖去 **編碼**,會喺旁邊寫 `name.ext.base64.txt`;將嗰個文字檔拖去 **解碼**,會喺旁邊寫返 `name.ext`。檔名先睇 `.base64.txt` 或 `.b64`,再睇開頭 `data:` 網址嘅類型,再睇解碼出嚟啲位元組嘅特徵,最後先用 `.bin`。兩邊都唔會蓋過舊檔,撞名就加號碼,例如 `report (1).pdf`。
- **大檔案:** 每次一 MB 咁串流入一個隱藏嘅暫存檔。編碼結果會再解碼一次,用 SHA-256 同原檔對;解碼結果會讀返出嚟,同解碼嘅內容對。對得啱先會改名放好。隨時可以暫停、繼續同取消,取消或者失敗都唔會留低嘢。冇桌面版(寄存工作區)嘅時候,256 MB 以內嘅檔案喺視窗入面讀,結果用同一套名下載。
- **預覽:** 用位元組特徵揀預覽方式,唔信檔名或者聲稱嘅類型:圖片、聲音同影片用 blob 網址喺普通媒體元素播,文字顯示做文字,其他(包括 SVG 同 HTML)一律顯示十六進位。解碼出嚟嘅嘢唔會被執行、打開或者嵌入。
- **歷史同復原:** 每次複製、儲存同轉換檔案都係一條歷史記錄,有名、大細同 SHA-256,但唔會有內容。復原同重做冇上限;只有開咗 **喺呢部電腦保留輸入** 先會喺重開之後仲喺度,因為預設唔會將打過嘅字寫落磁碟。清除歷史要先過兩條鎖匙確認。
- **文件網站:** 網站嘅 Base64 文章(`#/docs/base64`)有同一個工具,用同一份共用程式碼。網頁唔可以喺檔案旁邊寫嘢,所以檔案喺頁面入面讀(最多 256 MB),結果下載做 `name.ext.base64.txt` 或者還原嘅 `name.ext`。
- **驗證:** 上面「Verification」列出嘅測試檔同截圖,全部用建好嘅介面同網站喺無頭 Chrome 影,冇桌面橋接。
