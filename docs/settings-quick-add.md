# Quick add beside Settings pointers

## Behaviour

Some messages tell the person to go to Settings and add, set or accept something: a failed
render that needs a maps folder, a review step that warns the Mojang download was never
accepted, a config field that is gated on that consent. Each of those now carries the matching
control right beside the message, so the problem can be fixed without leaving the task.

| Pointer | Control beside it |
| --- | --- |
| A maps folder is missing or wrong (render console advice, failed download) | A folder field with a browse button, **Use the default** and **Save this folder** |
| The Mojang client download was never accepted (render console, download row, render review, config field, run screen, CI render) | The same quotation Settings shows, then an **Accept** button |

The quick entry is not a second copy of the setting. It is driven by the same controllers the
Settings rows use, so the value it writes is the value Settings shows, and the same validation
refuses the same bad input. A relative path is refused with its reason written beside the field
and nothing is saved. **Save this folder** stays out of reach until the folder has changed, and
says so in words next to the button. After a save, the open Settings sheet reloads its row
instead of showing the old answer, and a non-blocking notification confirms the change.

Pointers that cannot carry an entry are listed with the reason, not skipped. A world folder
belongs to one map and is chosen in that map's wizard. Java is found or downloaded rather than
typed. Signing in to GitHub is an interactive device flow, and a notification action has no room
for an inline entry.

## Configuration

There is nothing to configure. The entry appears wherever a pointer to a supported setting
appears, and writes the existing stored value (`worldlens.maps.directory` for the maps folder,
the main process's consent record for the Mojang download). Both stay editable and resettable
from their normal Settings rows.

## Failure modes

- **No desktop bridge.** The folder is still saved for the map wizard, and the Settings row says
  the desktop app itself cannot be moved from this build. The consent entry cannot record an
  answer, so **Accept** is disabled and the reason is written next to it.
- **A refusal from the main process.** The message is shown under the control and the stored
  value is unchanged.
- **Already accepted.** The consent entry says so instead of offering the button again.

## Security considerations

Consent is never given silently. The quotation the person is agreeing to is on screen before
the button that accepts it, exactly as in Settings and in first-run setup. The entry stores no
secret. Any value that is a secret in a future entry must be stored encrypted and shown masked.

## Verification

`SettingsQuickAdd.test.ts` proves the folder entry saves the value the Settings row reads
(including from a freshly created controller, as after a restart), refuses a relative path and
saves nothing, keeps Save out of reach with its reason, resets to the default, confirms through
the notification history, and that the consent entry shows the quotation first, records the
answer, clears the shared warning, and names the reason when it cannot. `quickAddPointers.test.ts`
holds the hand-written inventory of pointers: each wired surface must mount the control, every
other entry must say why, a source scan fails when a file with pointer wording is not listed, and
the quick entry and the Settings row must use the same controllers.

## 廣東話

呢個功能係喺每個叫你「去設定度加／設／接受啲嘢」嘅提示隔離，直接擺返對應嘅輸入位，唔使走開
去設定先搞得掂。例如：算圖失敗話你要揀地圖資料夾，或者未接受 Mojang 嘅客戶端下載，提示隔離
就即刻有資料夾欄位或者「接受」掣。

呢個輸入位唔係另一份設定。佢用同設定頁一模一樣嘅控制器，所以喺度儲存咗嘅值，設定頁見到嘅
就係同一個值，驗證規則都一樣：相對路徑會被拒絕，原因寫喺欄位隔離，而且乜都唔會儲存。資料
夾冇改過之前，「儲存」掣用唔到，旁邊會用文字講明原因。儲存之後，打開咗嘅設定頁會即刻重新
讀取，唔會繼續顯示舊答案，仲會彈出一個唔阻手阻腳嘅通知確認。

未能加輸入位嘅提示都有列出同埋寫明原因：世界資料夾屬於單一地圖，要喺嗰張地圖嘅精靈度揀；
Java 係搵或者落載，唔係打字；GitHub 登入係互動式裝置流程。同意條款嗰度，要接受嘅文字一定
喺「接受」掣前面顯示，同設定頁、首次設定一樣，絕對唔會靜靜雞幫你接受。
