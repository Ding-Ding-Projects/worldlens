# Control guides

Some controls carry a small information button beside them. It opens a guide anchored to that control: what it is for, the choices, the default, what changing it does, an example, what is checked, and what to do if something goes wrong. Where it helps, the guide has a **Try it** example that shows what the current setting does, and **Reset to default** puts the control back.

## Where they are

- **Base64:** Alphabet (with a live example of the standard and URL-safe characters), Text encoding (with "é" in the chosen encoding), Line length, Padding (with "Ma" encoded with and without it) and Strict decoding. The options that apply only to one direction say so beside them.
- **Virtual disks:** Operation and Route.
- **Drawing board:** Size.

Line length on the Base64 screen is now a number stepper with a split control rather than a text box.

## Accessibility

The button's name is "About" and the control's own name, so a screen reader announces what it explains. The guide is a labelled dialog that closes with Escape or Close, and it only ever describes; changing the control is done on the control itself or with Reset.

## Not yet

Guides cover the controls listed above. The rest of the app's controls do not have one yet.

## Verification

- `design/packages/ui/src/components/info/InfoButton.test.ts`: the button names its control, the guide shows only the sections it has, the example renders, and Reset reaches the host.
- The Base64, disk and drawing screen tests still pass with the guides in place.

## 廣東話

有啲控制項旁邊有個細細嘅資訊掣。撳落去會喺控制項旁邊打開一份說明:用嚟做乜、有乜選擇、預設係乜、改咗會點、例子、會檢查乜,同埋出事點算。有用嘅地方會有「試吓」,即刻顯示而家個設定會變成點;「還原預設」會將控制項打回原形。

- **喺邊度:** Base64 嘅字母表(即時顯示標準同網址安全嘅分別)、文字編碼(用揀咗嘅編碼顯示「é」)、每行長度、補位(「Ma」有補位同冇補位)同嚴格解碼;淨係用喺一個方向嘅選項,旁邊會寫明。虛擬磁碟嘅操作同路線。畫板嘅粗幼。Base64 嘅每行長度而家係數字加減掣,唔再係文字格。
- **無障礙:** 個掣嘅名係「關於」加控制項自己個名,螢幕閱讀器會讀出佢講緊邊個。說明係有標籤嘅對話框,撳 Escape 或者「關閉」就收埋;佢只會解釋,改設定要喺控制項本身或者用「還原預設」。
- **未做:** 暫時只有上面列出嘅控制項有說明,其他嘅未有。
- **驗證:** `InfoButton.test.ts`,同埋 Base64、磁碟同畫板嘅測試照樣通過。
