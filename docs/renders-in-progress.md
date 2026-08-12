# Renders in progress

## Behaviour

A single list of every render this application currently knows about, on all three routes it
can run one on: as a local process, in a Docker container, and on GitHub's runners. It exists
because a render's own progress used to live only inside whichever screen started or was
watching it - navigating to another tab tore that view down, even though the render itself,
on every route, kept going untouched. See [Docker and local rendering](./docker-and-local.md)
and [Rendering in GitHub Actions](./render-in-actions.md) for how each route actually runs;
this page is where they are all watched from one place.

Each row shows which world and which project the render is for, its route, live progress and
throughput drawn through the same shared progress vocabulary the render console itself uses,
elapsed time and an estimate explicitly labelled as one, its current state, and the real error
text on a failure. **Open console** takes a local or container render to the Make-a-map tab,
already watching that render; a GitHub render opens the GitHub-runners tab, where it is already
listed. A container this application found running from an earlier launch but has not picked
back up yet shows as a **Reattach** offer rather than as an active render, and accepting it
promotes the row in place once the container starts reporting.

The page distinguishes **still checking** all three routes from **genuinely nothing running**,
and a third state for a search that matches neither. A tab-strip label carries a live count of
everything in progress for the whole life of the application, not only while this page happens
to be open, and the same destination is offered from the Home tab.

## Configuration

The search bar is wired to the shared regex builder; plain text matching is the default. Rows
can be multi-selected and stopped in bulk; because stopping a render is destructive to the work
still in flight (though never to tiles already drawn), bulk cancellation is gated behind the
super-confirmation slider. A single row's own **Stop** button is not gated, matching the render
console's own convention, because tiles already rendered are always kept and a stopped render
can be carried on later. Every row carries the shared per-element appearance editor through its
context menu and Shift+right-click.

## Failure modes

- A route this build cannot reach (no Electron bridge, no container-reattach channel, no CI
  bridge) is simply left out of the aggregation rather than shown as an error; the page still
  reports honestly on whichever routes it can reach.
- A container offer that fails to reattach reports the real refusal message on its own row and
  stays an offer rather than silently disappearing.
- Cancelling a render that has already ended between the click and the request reaching the
  main process is reported as nothing having changed, never as a false success.

## Security considerations

Nothing here elevates any capability beyond what the render, container-reattach and CI-render
bridges already expose individually; this page only aggregates their existing read and cancel
operations into one list. No credential, token or secret crosses this surface.

## Verification

`activeRenders.test.ts` covers the aggregation model directly: a fresh instance discovering a
render already in flight (the regression test for the reported defect), a container offer
promoted to a tracked row on reattach, a GitHub render's real polled status, cancellation
dispatched to the correct route, and the honest error text on a failure. `RendersScreen.test.ts`
covers the mounted page: the two empty states, a render surviving an unmount-and-remount cycle
with live progress intact, the **Open console** navigation target, and that a bare click on the
bulk **Stop** button never cancels anything on its own - only the super-confirmation gate does.

## Suggested articles

- [Render console](./render-console.md) for the single-render detail view this page's **Open
  console** action leads to.
- [Docker and local rendering](./docker-and-local.md) for how a container survives the
  application closing, and how it is found again.
- [Rendering in GitHub Actions](./render-in-actions.md) for the third route, entirely
  independent of this application.
- [Super-confirmation for destructive actions](./super-confirmation.md) for the gate bulk
  cancellation goes through.
- [The regex builder and the search bars it reaches](./regex-builder.md) for the shared search
  contract this page's search bar uses.

## 廣東話

### 行為 (Renders in progress)

一個單一列表,列晒呢個 app 而家知道嘅每一個 render,涵蓋佢可以行 render 嘅三條路:本地 process、Docker container、GitHub 嘅 runners。佢存在嘅原因係:以前一個 render 嘅進度只住喺開佢或者睇緊佢嗰個 screen 入面 — 一轉去第二個 tab 就拆咗個 view,雖然個 render 本身喺每一條路上面都好地地繼續行。每條路實際點行,見 [Docker and local rendering](./docker-and-local.md) 同 [Rendering in GitHub Actions](./render-in-actions.md);呢一頁係一次過睇晒佢哋嘅地方。

每一行顯示個 render 係為邊個 world、邊個 project、行邊條路、live 進度同 throughput(用 render console 本身用開嘅同一套共用進度詞彙)、經過時間同一個明確標明係估算嘅估算、當前狀態,同埋失敗時嘅真實 error 文字。**Open console** 會將一個本地或者 container render 帶去 Make-a-map tab,已經睇緊嗰個 render;一個 GitHub render 就開 GitHub-runners tab,佢已經列咗喺嗰度。一個 app 喺較早前嘅啟動搵到、但仲未接手嘅 container,會顯示成一個 **Reattach** 邀請而唔係一個 active render;接受咗之後,container 一開始報告,嗰行就地升級。

呢一頁分得開「仲檢查緊」三條路同「真係乜都冇行緊」,仲有第三個狀態畀一個乜都 match 唔到嘅搜尋。tab-strip 上面嘅 label 喺 app 成個生命週期都帶住一個 live 嘅進行中總數,唔係淨係呢頁開住先有;Home tab 都有同一個入口。

### 設定 (Configuration)

搜尋欄駁咗共用嘅 regex builder;預設係 plain text match。啲行可以 multi-select 然後一次過停;因為停一個 render 對仲飛緊嘅工作係破壞性(但永遠唔會傷已經畫咗嘅 tiles),bulk cancellation 閘喺 super-confirmation slider 後面。單一行自己嘅 **Stop** 掣就冇閘,同 render console 自己嘅慣例一致,因為已經 render 咗嘅 tiles 永遠保留,一個停咗嘅 render 遲啲可以繼續。每一行都經 context menu 同 Shift+右掣帶住共用嘅 per-element appearance editor。

### 失敗模式

- 一條呢個 build 掂唔到嘅路(冇 Electron bridge、冇 container-reattach channel、冇 CI bridge)只係唔納入 aggregation,而唔係顯示成 error;掂到嘅路呢頁照誠實報告。
- 一個 reattach 失敗嘅 container 邀請,會喺自己嗰行報真實嘅拒絕 message,並且保持係一個邀請,唔會靜靜雞消失。
- 一個喺撳掣同 request 到達主進程之間已經完結咗嘅 render,取消佢會報「乜都冇改變」,永遠唔會報一個假成功。

### 安全考量

呢度冇任何嘢將能力提升到 render、container-reattach 同 CI-render bridge 個別已經公開嘅範圍以上;呢一頁只係將佢哋現有嘅讀取同取消操作聚合成一個列表。冇任何 credential、token 或者 secret 經過呢個 surface。

### 驗證

`activeRenders.test.ts` 直接覆蓋 aggregation model:一個新 instance 發現一個已經飛緊嘅 render(報告咗嗰個 defect 嘅 regression test)、一個 container 邀請喺 reattach 時升級做 tracked row、一個 GitHub render 嘅真實 polled status、取消 dispatch 去正確嘅路、失敗時嘅誠實 error 文字。`RendersScreen.test.ts` 覆蓋 mount 咗嘅頁面:兩個空狀態、一個 render 捱得過 unmount-再-remount 而 live 進度不變、**Open console** 嘅導航目標,同埋 bulk **Stop** 掣淨撳一下永遠唔會自己取消任何嘢 — 只有 super-confirmation 閘先可以。

### 建議文章

- [Render console](./render-console.md) — 呢頁 **Open console** 行去嘅單一 render 詳細畫面。
- [Docker and local rendering](./docker-and-local.md) — container 點樣捱得過 app 閂咗,又點樣被搵返。
- [Rendering in GitHub Actions](./render-in-actions.md) — 第三條路,完全獨立於呢個 app。
- [Super-confirmation for destructive actions](./super-confirmation.md) — bulk cancellation 行嘅嗰道閘。
- [The regex builder and the search bars it reaches](./regex-builder.md) — 呢頁搜尋欄用嘅共用搜尋 contract。
