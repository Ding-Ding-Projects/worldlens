/**
 * The interactive tour: what each step says, and the buttons around it.
 *
 * Every fact in here was checked against the running application rather than assumed:
 * `finding-worlds.md` for the automatic default-folder scan, `RenderProgressDetail.vue` for
 * there being no fixed render time and the percentage-then-estimate behaviour, `pages.pitch`
 * in `copy/appCopy.ts` for what publishing actually changes, and `palettePrefs.ts` for the
 * command palette's real shortcut, Control+Shift+F. Nothing here promises a feature the app
 * does not have or describes a flow that has since changed; where a step is genuinely just
 * "point BlueMap at a world, answer a few short steps", that is `world.screen.blurb`'s own
 * wording, not an invention for this file.
 *
 * Two of the seven steps say where the map lives, and where it lives changed: the Material
 * Design 3 shell rewrite moved Home and Map off the tab strip and onto the application rail,
 * so `welcome` and `openMap` name the rail's Map button rather than a Map tab, at every level
 * and in both languages. Their anchors in `tutorialSteps.ts` were moved to `rail-map` in that
 * rewrite while these sentences were left behind, which put the highlight on the rail and the
 * words on a tab that no longer exists - the one failure a tour anchored to real controls is
 * supposed to be immune to, since the user can see both at once. `makeAMap` and `publish` still
 * say "this tab" because the world wizard and the publishing screen genuinely are still tabs in
 * the strip, and rewording them to match their neighbours would introduce the same defect in
 * the opposite direction.
 *
 * `tutorial.step.*.title` and the control labels are `FIXED`: short, and a funny level
 * restyling "Next" or "Back" would make a button somebody has to re-read mid-click. The step
 * bodies, the progress line and the one-time invitation are `VOICED`, because they are real
 * sentences a newcomer reads once, and `FACTS` pins the one concrete claim each of them makes
 * so a playful level cannot quietly drop it - see `copy/appCopy.ts`'s own header for why that
 * split exists.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const TUTORIAL_VOICED = {
    "tutorial.step.welcome.body": {
        en: [
            "BlueMap turns a Minecraft world into a map you can pan, zoom and explore, and the Map button on the navigation rail is what opens it.",
            "BlueMap turns a Minecraft world into a map you can pan, zoom and explore, and the Map button on the navigation rail is what opens it.",
            "BlueMap reads a Minecraft world and turns it into a map you can pan, zoom and explore. The Map button on the navigation rail is what opens it.",
            "Point BlueMap at a Minecraft world and it hands back a map you can pan, zoom and wander through. The Map button on the navigation rail is what opens it.",
            "Point BlueMap at a Minecraft world and it hands back a map you can pan, zoom and happily get lost in. The Map button on the navigation rail opens it, and it is not going anywhere.",
        ],
        yue: [
            "BlueMap 會將一個 Minecraft 世界變成一張可以拖動、縮放同探索嘅地圖，撳側邊導覽欄嘅「地圖」掣就打得開。",
            "BlueMap 會將一個 Minecraft 世界變成一張可以拖動、縮放同探索嘅地圖，撳側邊導覽欄嘅「地圖」掣就打得開。",
            "BlueMap 會讀取一個 Minecraft 世界，變成一張可以拖動、縮放同探索嘅地圖；打開佢嘅係側邊導覽欄嘅「地圖」掣。",
            "同 BlueMap 講一個 Minecraft 世界俾佢聽，佢就變返一張地圖俾你，可以拖動、縮放、周圍逛；撳側邊導覽欄嘅「地圖」掣就打得開。",
            "同 BlueMap 講一個 Minecraft 世界俾佢聽，佢就變返一張地圖俾你，可以拖動、縮放，仲可以開心咁逛到唔記得返屋企；撳側邊導覽欄嘅「地圖」掣就打得開，佢一直喺度等你。",
        ],
    },
    "tutorial.step.makeAMap.body": {
        en: [
            "This tab is where you turn a Minecraft world into a map: point BlueMap at one, answer a few short questions, and it renders.",
            "This tab is where you turn a Minecraft world into a map: point BlueMap at one, answer a few short questions, and it renders.",
            "This tab is where a Minecraft world becomes a map: point BlueMap at one, answer a few short questions, and it renders.",
            "Everything starts here: hand BlueMap a Minecraft world, answer a few short questions, and let it render.",
            "Everything starts here: hand BlueMap a Minecraft world, answer a few short questions, sit back, and let it render.",
        ],
        yue: [
            "呢個分頁係將 Minecraft 世界變成地圖嘅地方：揀一個俾 BlueMap，答幾條簡單問題，佢就會開始算圖。",
            "呢個分頁係將 Minecraft 世界變成地圖嘅地方：揀一個俾 BlueMap，答幾條簡單問題，佢就會開始算圖。",
            "呢個分頁係一個 Minecraft 世界變成地圖嘅地方：揀一個俾 BlueMap，答幾條簡單問題，佢就會算圖。",
            "一切由呢度開始：擺個 Minecraft 世界俾 BlueMap，答幾條簡單問題，等佢算圖。",
            "一切由呢度開始：擺個 Minecraft 世界俾 BlueMap，答幾條簡單問題，然後坐低等佢算圖。",
        ],
    },
    "tutorial.step.findWorld.body": {
        en: [
            "BlueMap looks in this computer's default Minecraft folder automatically, with nothing to configure, and lists what it finds below. Nothing there? Browse for a folder, type a path, or drag one in.",
            "BlueMap looks in this computer's default Minecraft folder automatically, with nothing to configure, and lists what it finds below. Nothing there? Browse for a folder, type a path, or drag one in.",
            "BlueMap checks this computer's default Minecraft folder automatically, with nothing to set up, and lists what it finds. No luck? Browse for a folder, type a path, or drag one in.",
            "BlueMap already went looking: it checks the default Minecraft folder automatically and lists every world it found. Nothing there yet? Browse, type a path, or drag a folder in.",
            "BlueMap already went looking so you do not have to: it checks the default Minecraft folder automatically and lists every world it found. Nothing there yet? Browse, type a path, or drag a folder in.",
        ],
        yue: [
            "BlueMap 會自動搵呢部電腦嘅預設 Minecraft 資料夾，乜都唔使設定，搵到嘅世界會列喺下面。乜都冇？可以自己揀資料夾、打路徑，或者拖一個入嚟。",
            "BlueMap 會自動搵呢部電腦嘅預設 Minecraft 資料夾，乜都唔使設定，搵到嘅世界會列喺下面。乜都冇？可以自己揀資料夾、打路徑，或者拖一個入嚟。",
            "BlueMap 會自動檢查呢部電腦嘅預設 Minecraft 資料夾，乜都唔使自己設定，搵到嘅世界會列出嚟。搵唔到？自己揀資料夾、打路徑，或者拖一個入嚟都得。",
            "BlueMap 已經自動幫你搵咗：佢會自動檢查預設 Minecraft 資料夾，將搵到嘅世界全部列出嚟。仲未見到？自己揀資料夾、打路徑，或者拖一個入嚟都得。",
            "BlueMap 已經自動幫你搵晒，你唔使郁手：佢會自動檢查預設 Minecraft 資料夾，將搵到嘅世界全部列出嚟。仲未見到？自己揀資料夾、打路徑，或者拖一個入嚟都得。",
        ],
    },
    "tutorial.step.rendering.body": {
        en: [
            "Rendering reads the world and draws it into map tiles on disk. There is no fixed time for it: a small world can take minutes, a huge one can take hours. Once it starts, you will see a percentage and, after a while, an estimate of what is left.",
            "Rendering reads the world and draws it into map tiles on disk. There is no fixed time for it: a small world can take minutes, a huge one can take hours. Once it starts, you will see a percentage and, after a while, an estimate of what is left.",
            "Rendering reads the world and draws it into map tiles on disk. There is no fixed time for it, since it depends on how big the world is: minutes for a small one, hours for a huge one. Once it starts, you will see a percentage and, after a while, an estimate of what is left.",
            "Rendering is BlueMap actually reading the world and drawing it into map tiles on disk. There is no fixed time for it: small world, a few minutes; huge world, could be hours. Once it gets going you will see a percentage, and after a while, a rough estimate of what is left.",
            "Rendering is BlueMap actually reading the world and drawing it into map tiles on disk, one chunk at a time. There is no fixed time for it, and anyone who promises one is guessing: small world, a few minutes; sprawling world, could be hours. Once it gets going you will see a percentage, and after a while, a rough estimate of what is left.",
        ],
        yue: [
            "算圖即係 BlueMap 讀取個世界，畫成一塊塊地圖圖磚，存落磁碟。時間冇固定，睇個世界有幾大：細嘅世界幾分鐘，大嘅可能要幾個鐘。開始咗之後，你會見到百分比，過一陣仲會有個大約要幾耐嘅估計。",
            "算圖即係 BlueMap 讀取個世界，畫成一塊塊地圖圖磚，存落磁碟。時間冇固定，睇個世界有幾大：細嘅世界幾分鐘，大嘅可能要幾個鐘。開始咗之後，你會見到百分比，過一陣仲會有個大約要幾耐嘅估計。",
            "算圖即係 BlueMap 讀取個世界，畫成一塊塊地圖圖磚，存落磁碟。時間冇固定嘅，全睇個世界有幾大：細嘅世界幾分鐘搞掂，大嘅可能要幾個鐘。開始咗之後，你會見到百分比，過一陣仲會有個大約要幾耐嘅估計。",
            "算圖即係 BlueMap 真係喺度讀緊個世界，一格一格畫成地圖圖磚，存落磁碟。時間冇固定：細世界幾分鐘就搞掂，大世界隨時要幾個鐘。開始咗之後會見到百分比，過一陣重有個大約嘅時間估計。",
            "算圖即係 BlueMap 真係喺度讀緊個世界，一格一格咁畫成地圖圖磚，存落磁碟。時間冇固定㗎，邊個同你講死實幾耐都係呃你：細世界幾分鐘搞掂，大世界隨時燒幾個鐘。開始咗之後會見到百分比，過一陣重有個大約嘅時間估計。",
        ],
    },
    "tutorial.step.openMap.body": {
        en: [
            "When a render finishes, its tiles are written straight into your maps folder, and an Open the map button appears. The Map button on the navigation rail opens what BlueMap made, any time you want it.",
            "When a render finishes, its tiles are written straight into your maps folder, and an Open the map button appears. The Map button on the navigation rail opens what BlueMap made, any time you want it.",
            "When a render finishes, its tiles land in your maps folder, and an Open the map button appears. The Map button on the navigation rail opens what BlueMap made, whenever you like.",
            "A finished render writes its tiles into your maps folder and drops an Open the map button right where the wizard was. Later on, the Map button on the navigation rail is how you come back to it.",
            "A finished render writes its tiles into your maps folder and drops an Open the map button right where the wizard was, no hunting required. Later on, the Map button on the navigation rail is how you come back to it, whenever the mood strikes.",
        ],
        yue: [
            "算好之後，圖磚會直接寫入你嘅地圖資料夾，仲會出現一個「打開地圖」掣。想幾時打開 BlueMap 整好嘅嘢，撳側邊導覽欄嘅「地圖」掣就得。",
            "算好之後，圖磚會直接寫入你嘅地圖資料夾，仲會出現一個「打開地圖」掣。想幾時打開 BlueMap 整好嘅嘢，撳側邊導覽欄嘅「地圖」掣就得。",
            "算好之後，圖磚會落咗喺你嘅地圖資料夾，仲會出現一個「打開地圖」掣。之後想幾時打開都得，撳側邊導覽欄嘅「地圖」掣就打得返出嚟。",
            "算好一次之後，圖磚就寫入咗你嘅地圖資料夾，跟住喺原本個精靈嘅位置會出現一個「打開地圖」掣。之後想返嚟睇，就撳側邊導覽欄嘅「地圖」掣。",
            "算好一次之後，圖磚就寫入咗你嘅地圖資料夾，跟住喺原本個精靈嘅位置直接彈返個「打開地圖」掣出嚟，唔使周圍搵。之後幾時想返嚟睇都得，撳側邊導覽欄嘅「地圖」掣就打得返出嚟。",
        ],
    },
    "tutorial.step.publish.body": {
        en: [
            "By default a finished map only opens on this computer. This tab can publish it to GitHub Pages instead: a real, free address anyone can open, still nothing but files.",
            "By default a finished map only opens on this computer. This tab can publish it to GitHub Pages instead: a real, free address anyone can open, still nothing but files.",
            "By default a finished map only opens on this computer, at an address nobody else can reach. This tab can publish it to GitHub Pages instead: a real, free address anyone can open, still nothing but files.",
            "Right now your map only opens on this computer. Publish it from this tab to GitHub Pages instead, and it gets a real, free address anyone can open, still nothing fancier than files.",
            "Right now your map only opens on this computer, which is not much of a map to show off. Publish it from this tab to GitHub Pages instead, and it gets a real, free address anyone can open, still nothing fancier than files.",
        ],
        yue: [
            "預設情況下，算好嘅地圖淨係喺呢部電腦度打得開。呢個分頁可以將佢發佈去 GitHub Pages：一個真正、免費、人人都開得到嘅網址，依然淨係一堆檔案。",
            "預設情況下，算好嘅地圖淨係喺呢部電腦度打得開。呢個分頁可以將佢發佈去 GitHub Pages：一個真正、免費、人人都開得到嘅網址，依然淨係一堆檔案。",
            "預設情況下，算好嘅地圖淨係喺呢部電腦打得開，第二個地方都去唔到。呢個分頁可以將佢發佈去 GitHub Pages：一個真正、免費、人人都開得到嘅網址，依然淨係一堆檔案。",
            "而家你張圖淨係呢部電腦先開得到。喺呢個分頁發佈去 GitHub Pages，就會有個真正、免費、人人開得到嘅網址，依然唔複雜，一堆檔案咁簡單。",
            "而家你張圖淨係呢部電腦先開得到，想俾人睇都幾寒酸。喺呢個分頁發佈去 GitHub Pages，就會有個真正、免費、人人開得到嘅網址，依然唔複雜，一堆檔案咁簡單。",
        ],
    },
    "tutorial.step.wrapUp.body": {
        en: [
            "That is the whole loop: find a world, render it, open it, and publish it if you want to. Replay this tour any time from Info, from here in Docs, or from the command palette (Ctrl+Shift+F).",
            "That is the whole loop: find a world, render it, open it, and publish it if you want to. Replay this tour any time from Info, from here in Docs, or from the command palette (Ctrl+Shift+F).",
            "That is the whole loop: find a world, render it, open it, and publish it if you feel like it. Replay this tour any time from Info, from here in Docs, or from the command palette (Ctrl+Shift+F).",
            "That is the whole loop, start to finish: find a world, render it, open it, publish it if you feel like showing off. Come back to this tour any time from Info, from here in Docs, or from the command palette (Ctrl+Shift+F).",
            "That is the whole loop, start to finish: find a world, render it, open it, publish it if you feel like showing off. This tour is not going anywhere either: come back to it any time from Info, from here in Docs, or from the command palette (Ctrl+Shift+F).",
        ],
        yue: [
            "成個流程就係咁：搵個世界、算圖、打開、想公開就發佈。想幾時再睇呢個導覽都得，喺「資訊」、喺呢度嘅「說明文件」，或者用指令面板（Ctrl+Shift+F）都搵到。",
            "成個流程就係咁：搵個世界、算圖、打開、想公開就發佈。想幾時再睇呢個導覽都得，喺「資訊」、喺呢度嘅「說明文件」，或者用指令面板（Ctrl+Shift+F）都搵到。",
            "成個流程就係咁：搵個世界、算圖、打開、想公開就發佈。呢個導覽你想幾時再睇都得，喺「資訊」、喺呢度嘅「說明文件」，或者用指令面板（Ctrl+Shift+F）都搵得返。",
            "成個流程由頭到尾就係咁：搵個世界、算圖、打開、想威就發佈俾人睇。呢個導覽唔會走，想幾時返嚟睇都得，喺「資訊」、喺呢度嘅「說明文件」，或者用指令面板（Ctrl+Shift+F）都搵得返。",
            "成個流程由頭到尾就係咁：搵個世界、算圖、打開、想威就發佈俾成個網打開睇。呢個導覽都唔會走，想幾時返嚟溫書都得，喺「資訊」、喺呢度嘅「說明文件」，或者用指令面板（Ctrl+Shift+F）都搵得返。",
        ],
    },
    /* The step counter, read out with the step's own title when focus lands on it. */
    "tutorial.progress": {
        en: [
            "Step {n} of {m}.",
            "Step {n} of {m}.",
            "Step {n} of {m} of this tour.",
            "Step {n} of {m}, and moving right along.",
            "Step {n} of {m}. Nearly there, or just getting started, depending how you look at it.",
        ],
        yue: [
            "第 {n} 步，共 {m} 步。",
            "第 {n} 步，共 {m} 步。",
            "呢個導覽嘅第 {n} 步，共 {m} 步。",
            "第 {n} 步，共 {m} 步，穩陣咁行緊。",
            "第 {n} 步，共 {m} 步。快到定啱啱開始，睇你點諗。",
        ],
    },
    /* The one-time, dismissible corner notice offering the tour. Never shown twice. */
    "tutorial.offer.message": {
        en: [
            "New to BlueMap? There is a short interactive tour that walks through finding a world, rendering it and opening the result.",
            "New to BlueMap? There is a short interactive tour that walks through finding a world, rendering it and opening the result.",
            "New to BlueMap? A short interactive tour walks through finding a world, rendering it and opening the result, right inside the app.",
            "New here? A short interactive tour is sitting right there, ready to walk you through finding a world, rendering it and opening the result.",
            "New here? There is a short interactive tour just waiting to walk you through finding a world, rendering it and opening the result, no reading required.",
        ],
        yue: [
            "第一次用 BlueMap？有一個簡短嘅互動導覽，會帶你搵世界、算圖，同打開結果。",
            "第一次用 BlueMap？有一個簡短嘅互動導覽，會帶你搵世界、算圖，同打開結果。",
            "第一次用 BlueMap？呢個程式入面有個簡短互動導覽，會帶你搵世界、算圖，同打開結果。",
            "第一次嚟？呢度有個簡短互動導覽，準備好帶你搵世界、算圖，同打開結果。",
            "第一次嚟？呢度有個簡短互動導覽，隨時可以帶你搵世界、算圖，同打開結果，唔使睇文字都識用。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const TUTORIAL_FIXED = {
    "tutorial.step.welcome.title": { en: "Welcome to BlueMap", yue: "歡迎使用 BlueMap" },
    "tutorial.step.makeAMap.title": { en: "Make a map", yue: "整張地圖" },
    "tutorial.step.findWorld.title": { en: "Finding a world", yue: "搵世界" },
    "tutorial.step.rendering.title": { en: "What rendering does", yue: "算圖做緊乜" },
    "tutorial.step.openMap.title": { en: "Opening the finished map", yue: "打開算好嘅地圖" },
    "tutorial.step.publish.title": { en: "Sharing it, if you want to", yue: "想分享都得" },
    "tutorial.step.wrapUp.title": { en: "Come back any time", yue: "隨時返嚟睇" },

    /* The short per-destination tours: one title and one body per step, one name per tour. */
    "tutorial.tour.overall": { en: "Getting started", yue: "新手上路" },
    "tutorial.tour.home": { en: "Home", yue: "主頁" },
    "tutorial.tour.map": { en: "Map", yue: "地圖" },
    "tutorial.tour.work": { en: "Work", yue: "工作區" },
    "tutorial.tour.world": { en: "Make a map", yue: "整張地圖" },
    "tutorial.tour.projects": { en: "Projects", yue: "專案" },
    "tutorial.tour.pages": { en: "Publish", yue: "發佈" },
    "tutorial.tour.toolkit": { en: "General tools", yue: "一般工具" },
    "tutorial.tour.settings": { en: "Settings", yue: "設定" },

    "tutorial.step.homeRail.title": { en: "Home", yue: "主頁" },
    "tutorial.step.homeRail.body": {
        en: "Home is where you start. It shows what is happening on this computer and lists everything this application does.",
        yue: "主頁係起點，會顯示呢部電腦而家發生緊乜，同列出呢個程式做到嘅所有嘢。",
    },
    "tutorial.step.homeSearch.title": { en: "Search everything", yue: "搜尋所有嘢" },
    "tutorial.step.homeSearch.body": {
        en: "Type here to find any feature, setting or article. The button beside the box opens the pattern builder for more precise searches.",
        yue: "喺呢度打字就可以搵到任何功能、設定或者文章。格仔旁邊嘅掣會打開模式產生器，搜尋可以更精準。",
    },
    "tutorial.step.homeMachine.title": { en: "On this machine", yue: "呢部電腦" },
    "tutorial.step.homeMachine.body": {
        en: "This section shows what is moving right now, such as renders in progress, so you can jump straight back to them.",
        yue: "呢個區顯示而家進行緊嘅嘢，例如算緊嘅地圖，可以即刻跳返去睇。",
    },
    "tutorial.step.homeCatalogues.title": { en: "The catalogues", yue: "功能目錄" },
    "tutorial.step.homeCatalogues.body": {
        en: "Everything the application does is grouped by the job it belongs to. Open a catalogue to see every item in it, one line each.",
        yue: "程式所有功能按用途分組。打開一個目錄，就會見到入面每一項，每項一行。",
    },
    "tutorial.step.mapRail.title": { en: "The Map button", yue: "地圖掣" },
    "tutorial.step.mapRail.body": {
        en: "This opens the map BlueMap made. It stays on the navigation rail so you can get back to it from anywhere.",
        yue: "撳呢個掣會打開 BlueMap 整好嘅地圖。佢一直喺側邊導覽欄，喺邊度都可以返嚟。",
    },
    "tutorial.step.mapPage.title": { en: "The map area", yue: "地圖範圍" },
    "tutorial.step.mapPage.body": {
        en: "The map shows here. With no map open it says so and offers Make a map; once one is open, this area is the viewer with its own menu.",
        yue: "地圖會喺呢度顯示。未開地圖嗰陣會寫明，並提供「整張地圖」；開咗之後，呢個範圍就係檢視器，仲有自己嘅選單。",
    },
    "tutorial.step.workRail.title": { en: "Work", yue: "工作區" },
    "tutorial.step.workRail.body": {
        en: "Work holds the jobs you have open, each in its own tab: making a map, projects, publishing and the tools.",
        yue: "工作區放你打開咗嘅工作，每樣一個分頁：整地圖、專案、發佈同各種工具。",
    },
    "tutorial.step.workStrip.title": { en: "Your open tabs", yue: "已開分頁" },
    "tutorial.step.workStrip.body": {
        en: "Each job is a tab. Tabs can be reordered, pinned and grouped, and they are kept when you restart.",
        yue: "每樣工作都係一個分頁。分頁可以調位、釘住同分組，重新開程式都會記住。",
    },
    "tutorial.step.workNewTab.title": { en: "Open another job", yue: "開另一樣工作" },
    "tutorial.step.workNewTab.body": {
        en: "The plus button opens a menu of every job this application can show, so any tool is one click away.",
        yue: "加號掣會打開選單，列出程式可以開嘅所有工作，任何工具都係一撳就到。",
    },
    "tutorial.step.projectsTab.title": { en: "Projects", yue: "專案" },
    "tutorial.step.projectsTab.body": {
        en: "Projects holds your saved render projects, so you can render the same world again with the same settings.",
        yue: "專案放你儲存咗嘅算圖專案，可以用同一套設定再算同一個世界。",
    },
    "tutorial.step.projectsPage.title": { en: "Your saved projects", yue: "你嘅專案" },
    "tutorial.step.projectsPage.body": {
        en: "This page lists every saved render project and opens an editor for the one you pick.",
        yue: "呢頁列出所有已儲存嘅算圖專案，揀一個就會打開編輯器。",
    },
    "tutorial.step.projectsNew.title": { en: "Start a new project", yue: "新增專案" },
    "tutorial.step.projectsNew.body": {
        en: "New project creates a project you can configure beyond the five questions the guide asks.",
        yue: "新增專案會建立一個專案，設定可以多過精靈問嗰五條問題。",
    },
    "tutorial.step.pagesTab.title": { en: "Publish to GitHub Pages", yue: "發佈去 GitHub Pages" },
    "tutorial.step.pagesTab.body": {
        en: "This tab publishes a finished map to GitHub Pages, a free address anyone can open.",
        yue: "呢個分頁會將算好嘅地圖發佈去 GitHub Pages，一個人人都開到嘅免費網址。",
    },
    "tutorial.step.toolsTab.title": { en: "General tools", yue: "一般工具" },
    "tutorial.step.toolsTab.body": {
        en: "General tools gathers the smaller tools, including the documentation, in one tab.",
        yue: "一般工具將較細嘅工具集合喺一個分頁，包括說明文件。",
    },
    "tutorial.step.toolsList.title": { en: "Pick a tool", yue: "揀工具" },
    "tutorial.step.toolsList.body": {
        en: "Choose a tool from this list and it opens beside it. In a narrow window the list becomes a dropdown instead.",
        yue: "喺呢個清單揀一個工具，就會喺旁邊打開。視窗窄嗰陣，清單會變成下拉選單。",
    },
    "tutorial.step.settingsRail.title": { en: "Settings", yue: "設定" },
    "tutorial.step.settingsRail.body": {
        en: "Settings opens from the foot of the navigation rail. Pressing it again closes it.",
        yue: "設定喺側邊導覽欄最底打開，再撳一下就關返。",
    },
    "tutorial.step.settingsSearch.title": { en: "Search settings", yue: "搜尋設定" },
    "tutorial.step.settingsSearch.body": {
        en: "Type here to find a setting by its name or description. The button beside the box opens the pattern builder.",
        yue: "喺呢度打字，用名稱或者描述搵設定。格仔旁邊嘅掣會打開模式產生器。",
    },

    /* The card's own chrome for a step whose control is not on screen, and the tour list. */
    "tutorial.tour.heading": { en: "Tour: {tour}", yue: "導覽：{tour}" },
    "tutorial.missing.message": {
        en: "This step points at a control that is not showing right now. It may be on another page, or hidden by the window size.",
        yue: "呢一步指住嘅控制項而家冇顯示，可能喺另一頁，或者視窗太細畀佢收埋咗。",
    },
    "tutorial.missing.still": {
        en: "Still not showing. Try a larger window, or skip this step.",
        yue: "仍然冇顯示。試吓放大視窗，或者跳過呢步。",
    },
    "tutorial.controls.reveal": { en: "Show it", yue: "帶我去" },
    "tutorial.launch.tour": { en: "Take a tour: {tour}", yue: "開始導覽：{tour}" },
    "tutorial.tours.heading": { en: "Guided tours", yue: "導覽" },

    "tutorial.controls.next": { en: "Next", yue: "下一步" },
    "tutorial.controls.finish": { en: "Finish", yue: "完成" },
    "tutorial.controls.back": { en: "Back", yue: "上一步" },
    "tutorial.controls.skip": { en: "Skip this step", yue: "跳過呢步" },
    "tutorial.controls.exit": { en: "Exit the tour", yue: "退出導覽" },

    /* The button that opens the tour: from Info, from Docs, and from the command palette. */
    "tutorial.launch.start": { en: "Take a tour", yue: "開始導覽" },
    "tutorial.launch.replay": { en: "Replay the tour", yue: "重睇導覽" },

    /* The overlay's own accessible region name, in case a step's title has not loaded yet. */
    "tutorial.region.label": { en: "Interactive tour", yue: "互動導覽" },
} as const satisfies Record<string, FixedString>;

export const TUTORIAL_FACTS = {
    "tutorial.step.welcome.body": { en: ["Minecraft"], yue: ["Minecraft"] },
    "tutorial.step.makeAMap.body": { en: ["Minecraft"], yue: ["Minecraft"] },
    "tutorial.step.findWorld.body": { en: ["automatically"], yue: ["自動"] },
    "tutorial.step.rendering.body": { en: ["no fixed"], yue: ["冇固定"] },
    "tutorial.step.openMap.body": { en: ["maps folder"], yue: ["地圖資料夾"] },
    "tutorial.step.publish.body": { en: ["GitHub Pages"], yue: ["GitHub Pages"] },
    "tutorial.step.wrapUp.body": { en: ["Ctrl+Shift+F"], yue: ["Ctrl+Shift+F"] },
    "tutorial.progress": { en: ["Step"], yue: ["步"] },
    "tutorial.offer.message": { en: ["tour"], yue: ["導覽"] },
} as const satisfies Record<
    keyof typeof TUTORIAL_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
