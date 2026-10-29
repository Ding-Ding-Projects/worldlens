/**
 * The Material Design 3 shell: the application rail, Home's five catalogues, a catalogue page,
 * the Work workspace, the status strip and the Problems panel.
 *
 * ### Why every key here starts `shell.`, `rail.`, `catalogue.`, `work.`, `status.` or `problems.`
 *
 * Not tidiness - a defect. The first version of Home reused `home.title`, `home.lede` and
 * `home.search.label`, which `surfaces/home.ts` already owns for the *previous* Home screen. The
 * running application therefore rendered the old screen's words inside the new layout: the title
 * read "Home" rather than the question the prototype asks, and the lede described BlueMap rather
 * than the five catalogues.
 *
 * Nothing caught it. Every English fallback at the call sites was correct, and none of them was
 * ever reached: `mergeVoiceInto` merges this catalogue on top of the loaded locale, so a matching
 * key answers first and the fallback becomes dead code. A component test mounted in isolation has
 * no catalogue at all, sees the fallback, and passes. It was found by launching the packaged
 * installer on a hidden desktop and photographing it.
 *
 * ### Fixed against voiced
 *
 * Most of this is {@link FixedString}: a rail label, a destination name, a severity word. They are
 * navigation, and navigation that rephrases itself as the funny level moves is navigation somebody
 * has to re-learn. The prose - the Home lede, the empty states, the problem meanings - is
 * {@link VoicedString}, because that is where the product's voice actually lives, and every level
 * of it still names the same fact.
 *
 * Nothing here is an upstream BlueMap viewer key. Every one of these surfaces is this application's
 * own invention; the localization trap `chrome.ts` documents does not apply, and `appCopy.test.ts`
 * proves it.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const SHELL_VOICED = {
    /* ---------------------------------------------------------------- */
    /* Home                                                              */
    /* ---------------------------------------------------------------- */

    "shell.home.title": {
        en: [
            "What are you here to do?",
            "What are you here to do?",
            "What are you here to do?",
            "So, what are we doing today?",
            "Right then. What are we making?",
        ],
        yue: [
            "你想做啲咩？",
            "你想做啲咩？",
            "今次想做啲咩？",
            "嗱，今日搞邊瓣？",
            "好喇，今日整啲乜？",
        ],
    },

    /*
     * `{count}` is the real length of the manifest, never a number typed into a sentence. The
     * prototype wrote 85 into its own copy and the whole point of the resolver layer is that this
     * one cannot.
     */
    "shell.home.lede": {
        en: [
            "All {count} things this application does live in one of the five catalogues below, grouped by the job they belong to. Nothing is hidden behind a menu you have to already know about, and every catalogue opens a page that names everything in it, one line each.",
            "All {count} things this application does live in one of the five catalogues below, grouped by the job they belong to. Nothing is hidden behind a menu you have to already know about, and every catalogue opens a page that names everything in it, one line each.",
            "Everything this application does, all {count} of them, lives in one of the five catalogues below, grouped by the job it belongs to. Nothing hides behind a menu you would have to already know about, and every catalogue opens a page naming everything in it, one line each.",
            "All {count} things this application can do are in the five catalogues below. Nothing is hidden in a menu you have to know about first, and every catalogue opens a page that lists the lot, one line each.",
            "Every last one of the {count} things this thing can do is in the five boxes below, sorted by job. No secret menus, no folklore, and each box opens a page that names everything inside, one line apiece.",
        ],
        yue: [
            "呢個應用程式做到嘅 {count} 樣嘢，全部喺下面五個目錄入面，按用途分好。冇嘢收埋喺你要預先知道嘅選單後面，每個目錄打開都係一版清單，逐行寫晒入面有咩。",
            "呢個應用程式做到嘅 {count} 樣嘢，全部喺下面五個目錄入面，按用途分好。冇嘢收埋喺你要預先知道嘅選單後面，每個目錄打開都係一版清單，逐行寫晒入面有咩。",
            "呢個應用程式做到嘅 {count} 樣嘢，全部喺下面五個目錄度，按用途分好咗。冇嘢匿埋喺要預先知先搵到嘅選單度，每個目錄一開就係一版清單，逐行列晒。",
            "佢做到嘅 {count} 樣嘢全部喺下面五個目錄，冇一樣要你事先知道先搵到，每個目錄一開仲有成版清單逐行話你知有咩。",
            "呢舊嘢識做嘅 {count} 樣，全部擺晒喺下面五個櫃桶度，分好類。冇隱藏選單，唔使靠人教。",
        ],
    },

    "shell.home.search.none": {
        en: [
            "Nothing matches “{query}”. Try a shorter word, or turn the regular expression off.",
            "Nothing matches “{query}”. Try a shorter word, or turn the regular expression off.",
            "Nothing matches “{query}”. Try a shorter word, or turn the regular expression off.",
            "Nothing matches “{query}”. A shorter word usually does it, or turn the regular expression off.",
            "“{query}” finds nothing at all. Shorter word, or switch the regular expression off and try again.",
        ],
        yue: [
            "搵唔到「{query}」。試下短啲嘅字，或者熄咗個正則。",
            "搵唔到「{query}」。試下短啲嘅字，或者熄咗個正則。",
            "搵唔到「{query}」。試下短啲嘅字，又或者熄咗個正則。",
            "「{query}」乜都搵唔到。通常打短啲就得，唔係就熄咗個正則。",
            "「{query}」完全冇料到。打短啲，或者熄咗個正則再試過。",
        ],
    },

    "shell.catalogue.search.none": {
        en: [
            "Nothing in this list matches “{query}”.",
            "Nothing in this list matches “{query}”.",
            "Nothing in this list matches “{query}”.",
            "Nothing in this list matches “{query}”ically speaking.",
            "This list has nothing for “{query}”. It might be in one of the other four.",
        ],
        yue: [
            "呢個清單度搵唔到「{query}」。",
            "呢個清單度搵唔到「{query}」。",
            "呢個清單入面搵唔到「{query}」。",
            "呢個清單度「{query}」乜都冇。",
            "呢個清單冇「{query}」，可能喺另外四個嗰邊。",
        ],
    },

    /*
     * Work had three voiced keys here - `work.empty.title`, `work.empty.body` and
     * `work.empty.choose` - for an empty state `WorkPane.vue` drew over its own tab strip.
     * They are gone with it. `TabbedNavigation` was already drawing an empty state inside
     * the panel, listing every job as a button, so the overlay was a second one covering a
     * better one; see that component's `tabs.panel.empty` and the comment where the overlay
     * used to be. Nothing replaced them, because nothing needed to.
     */

    /* ---------------------------------------------------------------- */
    /* Problems                                                          */
    /* ---------------------------------------------------------------- */

    "problems.empty": {
        en: [
            "Nothing is wrong right now.",
            "Nothing is wrong right now.",
            "Nothing is wrong right now.",
            "Nothing is wrong right now, which is the best this panel ever gets to say.",
            "Absolutely nothing is wrong. Enjoy it; this panel rarely gets to say so.",
        ],
        yue: [
            "而家冇嘢出錯。",
            "而家冇嘢出錯。",
            "而家冇嘢出錯，一切正常。",
            "而家冇嘢出錯，呢版最叻都係講到咁。",
            "完全冇嘢出錯。慢慢享受，呢版好少有機會咁講。",
        ],
    },

    /*
     * The voice moves; "Nothing was deleted" does not, and `SHELL_FACTS` pins it.
     *
     * This is the sentence somebody reads after being told a tab they had is unreadable by this
     * build, so the fact has to survive intact at level five. What varies is only how much
     * reassurance is spent around it - never whether the reassurance is true.
     */
    "problems.unknownPage.meaning": {
        en: [
            "Nothing was deleted. The tab is kept so a build that knows about it can restore your arrangement.",
            "Nothing was deleted. The tab is kept so a build that knows about it can restore your arrangement.",
            "Nothing was deleted: the tab is kept, so a build that does know about it can still restore your arrangement.",
            "Nothing was deleted. The tab stays exactly where it is, so a build that does understand it can put your arrangement back.",
            "Nothing was deleted, and nothing is going to be. The tab sits there untouched until a build that recognises it can hand your arrangement back.",
        ],
        yue: [
            "冇刪除任何嘢。個 tab 照留住，識得佢嘅版本可以還原返你嘅排位。",
            "冇刪除任何嘢。個 tab 照留住，識得佢嘅版本可以還原返你嘅排位。",
            "冇刪除任何嘢：個 tab 照留住，識得佢嘅版本仲可以還原返你嘅排位。",
            "冇刪除任何嘢。個 tab 原封不動咁擺喺度，等識得佢嘅版本幫你還原返個排位。",
            "冇刪除任何嘢，將來都唔會。個 tab 就咁靜靜哋擺住，等到有個識佢嘅版本嚟到，就會原原本本還返你個排位。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The Projects page header                                          */
    /* ---------------------------------------------------------------- */

    /*
     * Projects had no header at all - it opened straight onto a list of worlds, which is the
     * previous application's habit and one of the clearest reasons the screen still read as it
     * after the shell around it was rebuilt. `Worldlens.dc.html` opens it on a title, a paragraph
     * saying what a project actually is, and a smaller line promising nothing has to be typed.
     *
     * Voiced rather than fixed because it is prose, not navigation. Every level still says a
     * project is a file at the root of a world, and still says saving is what writes it - those
     * are the two things somebody could get wrong, so no level is allowed to drop them.
     */
    "projects.page.title": {
        en: [
            "Start a project",
            "Start a project",
            "Start a project",
            "Let's start a project",
            "Right, let's start a project",
        ],
        yue: [
            "開一個 project",
            "開一個 project",
            "開一個 project",
            "嚟啦，開個 project",
            "好喇，我哋開個 project 先",
        ],
    },

    "projects.page.lede": {
        en: [
            "A project is one file at the root of a Minecraft world, holding every map, storage and setting that world renders with. Starting one writes nothing until you save.",
            "A project is one file at the root of a Minecraft world, holding every map, storage and setting that world renders with. Starting one writes nothing until you save.",
            "A project is a single file at the root of a Minecraft world, holding every map, storage and setting that world renders with. Starting one writes nothing until you save.",
            "A project is one file sitting at the root of a Minecraft world, holding every map, storage and setting that world renders with. Starting one writes nothing at all until you save.",
            "A project is one modest little file at the root of a Minecraft world, quietly holding every map, storage and setting that world renders with. Start one and nothing whatsoever is written until you save, so you can poke at it as long as you like.",
        ],
        yue: [
            "一個 project 就係放喺 Minecraft 世界根目錄嘅一個檔案，入面裝住嗰個世界 render 用嘅每個 map、storage 同設定。開咗都唔會寫任何嘢，要你按 save 先會寫。",
            "一個 project 就係放喺 Minecraft 世界根目錄嘅一個檔案，入面裝住嗰個世界 render 用嘅每個 map、storage 同設定。開咗都唔會寫任何嘢，要你按 save 先會寫。",
            "一個 project 就係擺喺 Minecraft 世界根目錄嗰個檔案，入面裝住嗰個世界 render 用嘅每個 map、storage 同設定。開咗都唔會寫嘢，要你按 save 先會寫。",
            "一個 project 就係靜靜哋擺喺 Minecraft 世界根目錄嘅一個檔案，入面裝晒嗰個世界 render 用嘅每個 map、storage 同設定。開咗佢都唔會寫任何嘢落去，要你按 save 先會寫。",
            "一個 project 咪就係喺 Minecraft 世界根目錄度乖乖哋坐住嘅一個檔案囉，入面裝晒嗰個世界 render 要用嘅每個 map、每個 storage、每個設定。開咗佢都仲係一個字都唔會寫，要你真係按 save 嗰陣先寫，所以想點撩都得。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Problems: what a problem actually means                           */
    /* ---------------------------------------------------------------- */

    /*
     * These are the prose half of the Problems panel, and prose is where the voice lives. Every
     * level still names the same reassurance, because the whole reason the panel says anything at
     * all is so somebody who has just seen a red row knows what did and did not happen to their
     * work.
     */
    "problems.config.meaning": {
        en: [
            "This value will not be written until it is valid. Nothing else in the file is affected.",
            "This value will not be written until it is valid. Nothing else in the file is affected.",
            "This value will not be written until it is valid, and nothing else in the file is affected.",
            "This value stays unwritten until it is valid. Nothing else in the file is affected, so the rest of your settings are exactly where you left them.",
            "This one value refuses to be written until it makes sense. Nothing else in the file is affected, so the other settings are sitting there untouched, quietly minding their own business.",
        ],
        yue: [
            "呢個值未夠正確之前都唔會寫入。檔案入面其他嘢完全唔受影響。",
            "呢個值未夠正確之前都唔會寫入。檔案入面其他嘢完全唔受影響。",
            "呢個值未夠正確之前唔會寫入，檔案入面其他嘢完全唔受影響。",
            "呢個值要正確咗先會寫入，喺咁之前都唔會寫。檔案入面其他嘢完全唔受影響，你之前設定嘅嘢原封不動。",
            "呢個值未搞掂之前係死都唔會寫入嘅。檔案入面其他嘢完全唔受影響，個個都好安分咁坐喺原位等你。",
        ],
    },

    "problems.render.meaning": {
        en: [
            "The render stopped. Whatever tiles it had already written are still there, and it can be resumed or discarded.",
            "The render stopped. Whatever tiles it had already written are still there, and it can be resumed or discarded.",
            "The render stopped. The tiles it had already written are still there, and it can be resumed or discarded.",
            "The render stopped part way. Every tile it had already written is still on disk, and you can resume it or discard it.",
            "The render gave up part way through. Every tile it had already finished is still sitting on disk, so you can pick it back up or throw the whole attempt away.",
        ],
        yue: [
            "個 render 停咗。之前寫咗嘅 tiles 全部仲喺度，可以續做或者掉咗佢。",
            "個 render 停咗。之前寫咗嘅 tiles 全部仲喺度，可以續做或者掉咗佢。",
            "個 render 停咗。之前寫咗嘅 tiles 仲喺度，可以續做或者掉咗佢。",
            "個 render 做到一半停咗。之前寫咗嘅 tiles 全部仲好地地喺硬碟度，你可以續做或者掉咗佢。",
            "個 render 做到一半就唔做喇。不過之前搞掂咗嘅 tiles 全部仲好地地擺喺硬碟度，你想接返落去定係成個掉咗都得。",
        ],
    },

    "problems.routing.meaning": {
        en: [
            "The feature exists in the catalogue but this build cannot open it, so the row was left where it is rather than doing nothing when pressed.",
            "The feature exists in the catalogue but this build cannot open it, so the row was left where it is rather than doing nothing when pressed.",
            "The feature is in the catalogue but this build cannot open it, so the row was left where it is rather than doing nothing when pressed.",
            "The feature is listed in the catalogue, but this build has no way to open it. The row was left visible rather than quietly doing nothing when pressed.",
            "The catalogue lists this one, but this build has no way to actually open it. The row was left where it is on purpose, because a row that looks alive and does nothing when pressed is worse than one that says so.",
        ],
        yue: [
            "呢個功能喺目錄入面有，但係呢個版本開唔到，所以個 row 照留住，唔會撳咗之後乜都唔發生。",
            "呢個功能喺目錄入面有，但係呢個版本開唔到，所以個 row 照留住，唔會撳咗之後乜都唔發生。",
            "呢個功能喺目錄有，但呢個版本開唔到，所以個 row 照留住，唔會撳咗之後乜都唔發生。",
            "呢個功能喺目錄入面係有嘅，但係呢個版本冇辦法開到佢。個 row 特登留低咗，唔想你撳咗之後乜都唔發生。",
            "目錄入面係列咗呢個功能嘅，但呢個版本真係開唔到佢。個 row 特登留喺度，因為一個睇落好似做到嘢、撳落去又乜都唔發生嘅 row，仲衰過老實話你知。",
        ],
    },

    "problems.unknownPage.message": {
        en: [
            "This workspace has a tab for “{page}”, which this build does not know about.",
            "This workspace has a tab for “{page}”, which this build does not know about.",
            "This workspace has a tab for “{page}”, which this build does not know anything about.",
            "This workspace is carrying a tab for “{page}”, and this build does not know what that is.",
            "This workspace is still carrying a tab for “{page}”, and this build has never heard of it.",
        ],
        yue: [
            "呢個工作區有個叫「{page}」嘅 tab，但呢個版本唔識佢。",
            "呢個工作區有個叫「{page}」嘅 tab，但呢個版本唔識佢。",
            "呢個工作區有個叫「{page}」嘅 tab，但係呢個版本唔識佢。",
            "呢個工作區仲帶住個叫「{page}」嘅 tab，但呢個版本完全唔知嗰個係乜。",
            "呢個工作區仲帶住個叫「{page}」嘅 tab，但呢個版本連聽都未聽過佢。",
        ],
    },

    "projects.page.footnote": {
        en: [
            "Nothing here is a path you have to type. Everything below was found on this machine, or fetches the world for you.",
            "Nothing here is a path you have to type. Everything below was found on this machine, or fetches the world for you.",
            "Nothing here is a path you have to type: everything below was found on this machine, or fetches the world for you.",
            "There is no path here you have to type out. Everything below was already found on this machine, or will fetch the world for you.",
            "Not one path here needs typing. Everything below either turned up on this machine already, or will go and fetch the world for you.",
        ],
        yue: [
            "呢度冇任何路徑要你自己打。下面全部都係喺呢部機搵到，或者會幫你攞返個世界。",
            "呢度冇任何路徑要你自己打。下面全部都係喺呢部機搵到，或者會幫你攞返個世界。",
            "呢度冇路徑要你自己打：下面全部都係喺呢部機搵到，或者會幫你攞返個世界。",
            "呢度真係冇一條路徑要你自己打出嚟。下面啲嘢全部都係喺呢部機搵返嚟，或者會幫你攞埋個世界。",
            "呢度連一條路徑都唔使你自己打。下面啲嘢，唔係早就喺呢部機度搵到咗，就係會自動幫你攞返個世界返嚟。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

/**
 * Navigation, counts and severity words.
 *
 * Fixed rather than voiced on purpose. A rail label that rephrases itself as the funny level moves
 * is a label somebody has to re-learn every time they touch the slider, and a severity word that
 * got funnier at level five would be the one place this application's own rule - humour styles the
 * telling, never the facts - was broken.
 */
export const SHELL_FIXED = {
    /* ---------------------------------------------------------------- */
    /* The catalogue rows' live meta                                     */
    /* ---------------------------------------------------------------- */

    /*
     * The short grey line at the right of a catalogue row: how many, which state, what version.
     *
     * Fixed rather than voiced, and not because they are short. Every one of these is read at a
     * glance while scanning eighty-five rows for one of them, and a count that rephrased itself as
     * the funny level moved would be a number somebody has to stop and parse. `resolveMeta` fills
     * the placeholders from the real registries - the config schema's own tab and field counts, the
     * live render count, the actual update version - so nothing here is a figure anybody typed.
     */
    "catalogue.meta.maskShapes": { en: "{count} shapes", yue: "{count} 個形狀" },
    "catalogue.meta.speedLevels": { en: "{count} levels", yue: "{count} 級" },
    "catalogue.meta.docsArticles": { en: "{count} articles", yue: "{count} 篇" },
    "catalogue.meta.rendersRunning": { en: "{count} running", yue: "{count} 個進行緊" },
    "catalogue.meta.unreadNotices": { en: "{count} unread", yue: "{count} 個未讀" },
    "catalogue.meta.backupPartSize": { en: "{size} parts", yue: "每份 {size}" },
    "catalogue.meta.downloadRange": { en: "{min}–{max} at once", yue: "同時 {min}–{max} 個" },
    "catalogue.meta.historyRevision": { en: "revision {revision}", yue: "第 {revision} 版" },
    "catalogue.meta.updateReady": { en: "{version} ready", yue: "{version} 準備好" },
    "catalogue.meta.configTabsAndFields": {
        en: "{tabs} tabs · {fields} settings",
        yue: "{tabs} 個分頁 · {fields} 個設定",
    },
    "catalogue.meta.languageModesAndLevels": {
        en: "{modes} modes · {levels} levels",
        yue: "{modes} 個模式 · {levels} 級",
    },

    /*
     * States, not counts. Same reasoning: "Declined" has to mean declined at every funny level,
     * because the row it sits on is how somebody finds out why a render will not start.
     */
    "catalogue.meta.consentAccepted": { en: "Accepted", yue: "已接受" },
    "catalogue.meta.consentDeclined": { en: "Declined", yue: "已拒絕" },
    "catalogue.meta.accountSignedIn": { en: "Signed in", yue: "已登入" },
    "catalogue.meta.accountSignedOut": { en: "Signed out", yue: "未登入" },
    "catalogue.meta.eulaAccepted": { en: "Accepted", yue: "已接受" },
    "catalogue.meta.eulaPending": { en: "Not accepted yet", yue: "仲未接受" },
    "catalogue.meta.previewRunning": { en: "Serving now", yue: "正在提供服務" },
    "catalogue.meta.pagesPublished": { en: "Published", yue: "已發佈" },

    /* The notification history's own heading, opened from the rail's bell. */
    "notice.centre.title": { en: "Notifications", yue: "通知" },

    /*
     * The Problems panel's severity words, its source labels and its two remedy verbs are further
     * down this same object and were already there. A second copy of each was added here while
     * filling the catalogue's gaps, which TypeScript reports as TS1117 and which the bundler
     * reports as a duplicate-key warning on every run - and the later declaration silently wins,
     * so the Cantonese somebody actually wrote would have been replaced by a hastier translation
     * of the same word without anything failing. The originals stayed.
     */

    /* The three destinations, and the footer actions. */
    "rail.home": { en: "Home", yue: "主頁" },
    "rail.map": { en: "Map", yue: "地圖" },
    "rail.work": { en: "Work", yue: "工作" },
    "rail.label": { en: "{product} navigation", yue: "{product} 導覽" },
    "rail.work.openJobs": { en: "{count} jobs open", yue: "開咗 {count} 樣嘢" },
    "rail.search": { en: "Search everything ({shortcut})", yue: "全域搜尋（{shortcut}）" },
    "rail.notifications": { en: "Notifications", yue: "通知" },
    "rail.notifications.unread": {
        en: "Notifications, {count} unread",
        yue: "通知，{count} 個未讀",
    },

    /* Home. */
    "shell.home.search.label": { en: "Search everything", yue: "全域搜尋" },
    "shell.home.search.placeholder": {
        en: "Try: mask, backup, Cantonese, publish",
        yue: "試下：遮罩、備份、廣東話、發佈",
    },
    "shell.home.search.summary": { en: "{shown} of {total} features", yue: "{total} 項之中嘅 {shown} 項" },
    "shell.home.card.count": { en: "{count} features", yue: "{count} 項功能" },
    "shell.home.hero.newMap": { en: "New map", yue: "新地圖" },
    "shell.home.hero.guide": { en: "Or walk me through it", yue: "或者一步步教我" },

    /* Catalogue pages. */
    "shell.catalogue.back": { en: "All five catalogues", yue: "五個目錄" },
    "shell.catalogue.search.label": { en: "Search this list", yue: "搵呢個清單" },
    "shell.catalogue.search.summary": { en: "{shown} of {total}", yue: "{total} 之中嘅 {shown}" },

    /* The status strip. */
    "status.renders": { en: "{count} rendering", yue: "{count} 個渲染緊" },
    "status.problems": { en: "{count} problems", yue: "{count} 個問題" },
    "status.action.problems": { en: "Show problems", yue: "睇問題" },
    "status.action.renders": { en: "Open renders", yue: "開渲染" },

    /*
     * Severity, in words. The panel renders these beside an icon precisely so the distinction
     * survives a monochrome display, the contrast theme, and a reader who cannot see red.
     */
    "problems.severity.error": { en: "Error", yue: "錯誤" },
    "problems.severity.warning": { en: "Warning", yue: "警告" },
    "problems.severity.info": { en: "Note", yue: "備註" },
    "problems.title": { en: "Problems ({count})", yue: "問題（{count}）" },
    "problems.close": { en: "Close the problems panel", yue: "閂咗問題版" },
    "problems.source.workspace": { en: "Saved workspace", yue: "儲低咗嘅工作區" },
    "problems.source.navigation": { en: "Navigation", yue: "導覽" },
    "problems.render.remedy": { en: "Open the render console", yue: "開渲染主控台" },
    "problems.config.remedy": { en: "Open the setting", yue: "開嗰個設定" },
    /* Catalogue-coverage sweep: these answered nothing, so every language and every
       funny level rendered the English fallback. */
    "rail.host": { en: "Host Server", yue: "寄存伺服器" },
    /*
     * Dedicated short display labels for the rail's compact shortcut rows - deliberately not
     * the job's full title (that stays the button's accessible name and tooltip, from
     * `tabs.page.*` beside these). Material navigation rails use short single-line labels, and
     * an 80px column genuinely cannot hold "Get a world off a server" on one line at any font
     * size worth reading - the regression these replace was exactly that: the full label
     * truncating mid-word behind an ellipsis ("Remo…", "Chun…", "Back…"). At most ~10 Latin
     * characters or ~4 CJK characters, and never an ellipsis - see
     * `railShortcutLabels.test.ts`, which enforces both bounds on every entry below.
     */
    "rail.shortcut.cirender": { en: "Actions", yue: "操作" },
    "rail.shortcut.dockerHosting": { en: "Docker", yue: "Docker" },
    "rail.shortcut.remoteHosting": { en: "SSH", yue: "SSH" },
    "rail.shortcut.chunker": { en: "Convert", yue: "轉換" },
    "rail.shortcut.backups": { en: "Backups", yue: "備份" },
    "rail.shortcut.mcservers": { en: "Servers", yue: "伺服器" },
    "rail.shortcut.worldDownloader": { en: "Downloader", yue: "下載器" },
    "rail.more": { en: "More", yue: "更多" },
    "rail.moreShortcuts": { en: "More shortcuts ({count})", yue: "更多捷徑（{count}）" },
    "rail.moreShortcuts.title": { en: "More shortcuts", yue: "更多捷徑" },
    "rail.moreShortcuts.search": { en: "Filter shortcuts", yue: "篩選捷徑" },
    "rail.moreShortcuts.empty": { en: "No shortcuts match.", yue: "冇捷徑夾得中。" },
    /* Catalogue-coverage sweep: no catalogue answer, so every language and every
       funny level fell back to the English written at the call site. */
    "shell.home.dashboard.drafts": { en: "Pick up where you left off", yue: "接返上次做到嘅位" },
    "shell.home.dashboard.draftsBody": { en: "You have {count} project drafts waiting for their first render.", yue: "你有 {count} 個專案草稿等緊行第一次 render。" },
    "shell.home.dashboard.guide": { en: "Walk me through it", yue: "一步步教我" },
    "shell.home.dashboard.inProgress": { en: "In progress", yue: "做緊" },
    "shell.home.dashboard.mapsAndServers": { en: "Your maps & servers", yue: "你嘅地圖同伺服器" },
    "shell.home.dashboard.newMap": { en: "New map", yue: "新地圖" },
    "shell.home.dashboard.openProjects": { en: "Open projects", yue: "開專案" },
    "shell.home.dashboard.profileLocal": { en: "Rendered on this computer", yue: "喺呢部機行嘅" },
    "shell.home.dashboard.profileOverflow": { en: "+{count} more", yue: "仲有 {count} 個" },
    "shell.home.dashboard.renderOverflow": { en: "+{count} more running", yue: "仲有 {count} 個行緊" },
    "shell.home.dashboard.renderPercent": { en: "{percent}%", yue: "{percent}%" },
    "shell.home.dashboard.search": { en: "Search everything", yue: "搵晒所有嘢" },
    "shell.home.dashboard.titleFresh": { en: "Let's make your first map", yue: "整你第一張地圖啦" },
    "shell.home.dashboard.titleReturning": { en: "Welcome back", yue: "歡迎返嚟" },
    "shell.home.dashboard.welcomeBody": { en: "Nothing is rendered or saved on this machine yet. New map starts one from a world you already have; the guide walks through the whole thing if you would rather be shown.", yue: "呢部機仲未 render 過或者儲過任何嘢。「新地圖」會由你已經有嘅世界開始整；想有人一步步帶你行嘅話，可以用嗰個引導。" },
    "shell.home.dashboard.browseAll": { en: "Browse everything", yue: "全部睇晒" },
    "shell.home.dashboard.profileRemote": { en: "Remote server", yue: "遠端伺服器" },
    "shell.home.dashboard.renderOffer": { en: "Found running · tap to reattach", yue: "搵到緊喺度行 · 㩒一下重新接返" },
    "shell.home.dashboard.renderWorking": { en: "Working…", yue: "做緊嘢…" },
} as const satisfies Record<string, FixedString>;

/**
 * Substrings that must survive every funny level, in both languages.
 *
 * The count placeholders are here because a level-five rewrite that dropped `{count}` would render
 * a sentence about "everything this application does" with no number in it - which reads as
 * complete and is missing the one fact the sentence exists to carry.
 */
export const SHELL_FACTS = {
    /*
     * A question, at every level. The heading's whole job is to ask one - a level-five rewrite that
     * turned it into a statement would leave Home opening on an announcement nobody asked for.
     */
    "shell.home.title": { en: ["?"], yue: ["？"] },
    "shell.home.lede": { en: ["{count}"], yue: ["{count}"] },
    "shell.home.search.none": { en: ["{query}"], yue: ["{query}"] },
    "shell.catalogue.search.none": { en: ["{query}"], yue: ["{query}"] },
    "problems.unknownPage.meaning": {
        en: ["Nothing was deleted"],
        yue: ["冇刪除"],
    },
    /*
     * `work.empty.body` was pinned here on the grounds that it "has to keep naming Home,
     * because it is the only route out of an empty Work". That was measurably untrue by the
     * time anyone checked: the panel's own empty state lists every job as a button and the
     * strip's `+` opens any of them without leaving Work, and the overlay this pinned was
     * painted over both. The overlay is gone and so is the pin.
     */
    /*
     * "Nothing" survives every level. A playful rewrite that dropped it would leave a panel saying
     * something cheerful while the reader is still trying to work out whether anything is wrong.
     */
    "problems.empty": { en: ["othing"], yue: ["冇嘢"] },
    /*
     * The two things somebody could get wrong about a project, pinned so no level may drop them:
     * that it is one file at the *root* of a world, and that nothing is written until a save.
     */
    "projects.page.lede": { en: ["root", "save"], yue: ["根目錄", "save"] },
    /*
     * The word the page is about. A level that stopped saying "project" would leave the heading
     * naming nothing, on the one screen whose whole job is to explain what a project is.
     */
    "projects.page.title": { en: ["project"], yue: ["project"] },
    /*
     * The Problems panel's prose. Each pinned literal is the reassurance the sentence exists to
     * give - what survived, or what was deliberately left alone. A level that dropped one would
     * leave somebody staring at a red row with no idea whether their work is still there.
     */
    /*
     * "othing else" rather than "Nothing else": at level three the sentence joins into one clause
     * and the word loses its capital. The reassurance is the word, not its casing.
     */
    "problems.config.meaning": { en: ["othing else"], yue: ["其他嘢完全唔受影響"] },
    "problems.render.meaning": { en: ["still"], yue: ["仲"] },
    "problems.routing.meaning": { en: ["catalogue"], yue: ["目錄"] },
    "problems.unknownPage.message": { en: ["{page}"], yue: ["{page}"] },
    /*
     * The promise the footnote exists to make. A level that lost it would leave the reader
     * hunting for a path field that is deliberately not there.
     */
    "projects.page.footnote": { en: ["path"], yue: ["路徑"] },
};
