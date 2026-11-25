# Workspace layouts

The Work destination can be split into panes. Each pane is a complete tab strip with its own active page, and the panes can be arranged side by side or stacked, floated over the rest, maximised and saved as named layouts. A single pane still looks and behaves exactly as the Work page always has.

## What it adds, and what it does not change

- **Splitting.** Drag a tab onto the edge of any pane (left, right, top or bottom) to move it into a new pane there, or onto the centre of a pane to move it into that pane. Every pane has the full strip: pinned tabs, groups, the four tab searches, bulk close with its preview, the appearance editor, the overflow list and the context menus.
- **Resizing.** The divider between two panes can be dragged, and it is reachable by keyboard.
- **Floating and maximising.** A pane can float over the layout, be docked back, or fill the whole workspace and be restored.
- **Named layouts.** The arrangement of panes can be saved under a name, applied, renamed and deleted, and the whole arrangement can be reset to one pane.
- **Nothing is replaced.** The layout engine only decides where each pane sits. Every tab, group, pin and search is still the existing tab strip, so none of those features can be lost by a layout.

Popout windows are not offered. A popout would open a second browser window, and a saved layout that mentions one is not trusted.

## Without dragging

Every drag has a command that does the same thing, so the layout can be arranged by keyboard and by screen reader:

| Command | Where to find it |
| --- | --- |
| Split this tab to the right, left, above or below | The tab's context menu, the Layouts button, the command palette |
| Move this tab to the next or previous pane | The same three places |
| Float this pane, dock it back | The same three places |
| Maximise or restore this pane | The same three places |
| Save, apply, rename, delete and reset layouts | The Layouts button at the end of the strip |

Open a tab's context menu from the keyboard with the Menu key or <kbd>Shift</kbd>+<kbd>F10</kbd>. After each command a polite status message says what happened, and a command that cannot run says why: a pane with a single tab cannot split that tab away from itself, and a workspace with one pane has nothing to move a tab into.

## What is saved, and what happens when it is damaged

Two things are saved, each under its own key beside the tab workspace.

- **The arrangement** (`worldlens-tabs-dock`) is a versioned record of where the panes sit and how the dividers are sized. The tab workspace under `worldlens-tabs` is unchanged from before panes existed, so a person who already has tabs, groups, pins and an order keeps every one of them exactly, with no conversion step.
- **Named layouts** (`worldlens-tabs-layouts`) hold the strips and the arrangement that went with them, up to 24 of them.

A saved arrangement is checked against the strips before it is used. It must describe exactly one pane for every strip and no others. Anything else, including unreadable JSON, a layout from another version, one that mentions a popout, or one that the layout engine refuses to load, is dropped and the panes are laid out side by side from the strips. The result is never an empty Work page.

Applying a named layout never closes a tab. Tabs that are open now but are not in the layout are kept in the first pane, tabs in the layout whose page this build cannot show are left out and the layout says so, and a tab with unsaved work keeps that mark.

## Accessibility

- Dockview's own tab headers are hidden and removed from the accessibility tree, so each pane exposes one tab list and one tab panel, the strip's own.
- The drop zones that appear during a drag are not announced, because every zone is also a command.
- Panes never detach from the document, so a page that owns a map renderer keeps its canvas when its pane is not on top.
- The divider animation and the drop zones follow the reduced motion setting.

## Verification

The tests in `TabbedNavigation.dock.test.ts`, `workLayout.test.ts` and `dockLayoutStorage.test.ts` cover migration of a stored workspace, each way a saved arrangement can be damaged, splitting and moving by command and through the context menu, the drag drop zones, persistence across a remount, named layouts, floating and maximising, and the single-pane case with docking off. jsdom has no layout, so the tests assert which tabs each pane holds and what is stored, never a pixel position. How the panes look at real sizes, the divider drag, and floating windows over a live map still need checking in the running application.

## Third-party notice

The layout engine is dockview, MIT licensed, used from its published npm package and bundled locally. Its notice is in `design/NOTICE`.

## 廣東話

工作區可以分成多個窗格。每個窗格都係一條完整嘅分頁列，有自己嘅作用中頁面；窗格可以左右或者上下排，亦可以浮喺其他窗格上面、放到最大，同埋儲存成有名嘅版面。得一個窗格嗰陣，睇落同用落都同以前嘅工作頁一模一樣。

- **分割**：將分頁拖去任何窗格嘅邊（左、右、上、下），就會喺嗰邊開一個新窗格；拖去窗格中間，就係移入嗰個窗格。每個窗格都有完整嘅分頁列：釘住嘅分頁、群組、四種分頁搜尋、附預覽嘅批量關閉、外觀編輯器、溢出清單同右鍵選單。
- **調整大小**：兩個窗格中間嘅分隔線可以拖，亦可以用鍵盤操作。
- **浮起同最大化**：窗格可以浮起、放返入版面，或者佔滿成個工作區再還原。
- **有名嘅版面**：窗格嘅排法可以用名儲存、套用、改名、刪除，亦可以重設返做一個窗格。
- **冇取代任何功能**：版面引擎只負責決定每個窗格喺邊，所有分頁、群組、釘住同搜尋仍然係原有嘅分頁列，所以版面唔會令任何功能消失。

唔提供彈出視窗。彈出會開第二個瀏覽器視窗，而且已儲存嘅版面如果提到彈出視窗，就唔會被信任。

唔使拖都得：每個拖動都有指令做同樣嘅事，所以用鍵盤同螢幕閱讀器都排到版面。指令喺分頁嘅右鍵選單、分頁列尾嘅「安排窗格同版面」按鈕同指令面板都搵到：向右、左、上、下分割；移去下一個或上一個窗格；浮起同放返；最大化同還原；儲存、套用、改名、刪除同重設版面。用 Menu 鍵或者 Shift+F10 就可以用鍵盤開右鍵選單。每個指令之後，狀態訊息會輕聲讀出結果；做唔到嘅指令會講明原因：只有一個分頁嘅窗格分唔到嗰個分頁出去，只有一個窗格嘅工作區亦冇地方可以移分頁入去。

儲存嘅有兩樣，各用自己嘅鍵，同分頁工作區放埋一齊。排法（`worldlens-tabs-dock`）係有版本嘅紀錄，記住每個窗格喺邊同分隔線有幾大。分頁工作區（`worldlens-tabs`）同冇窗格之前一樣，所以已經有分頁、群組、釘住同次序嘅人，全部原封不動，唔使轉換。有名嘅版面（`worldlens-tabs-layouts`）記住分頁列同當時嘅排法，最多 24 個。

已儲存嘅排法會先同分頁列核對：每條分頁列要有一個窗格，唔可以多，唔可以少。唔夠就會被丟棄，窗格由分頁列重新並排，所以工作頁唔會變空白。套用版面唔會關閉任何分頁：而家開住但版面冇提到嘅分頁會留喺第一個窗格；版面入面嘅分頁如果呢個版本顯示唔到，就會被略過並且話你知；有未儲存內容嘅分頁會保留標記。

測試涵蓋咗已儲存工作區嘅遷移、排法損壞嘅各種情況、用指令同右鍵選單分割同移動、拖放區、重新載入之後仍然保留、有名版面、浮起同最大化，以及關閉停靠時嘅單窗格。jsdom 冇版面計算，所以測試只核對每個窗格有咩分頁同儲存咗啲咩，唔核對位置。喺真實大小下嘅外觀、拖動分隔線，以及浮喺運作中地圖上面嘅視窗，仍然要喺運行中嘅應用程式入面檢查。
