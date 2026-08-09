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
            "All {count} things this application does live in one of the five catalogues below, grouped by the job they belong to.",
            "All {count} things this application does live in one of the five catalogues below, grouped by the job they belong to.",
            "Everything this application does, all {count} of them, lives in one of the five catalogues below, grouped by the job it belongs to.",
            "All {count} things this application can do are in the five catalogues below. Nothing is hidden in a menu you have to know about first.",
            "Every last one of the {count} things this thing can do is in the five boxes below, sorted by job. No secret menus, no folklore.",
        ],
        yue: [
            "呢個應用程式做到嘅 {count} 樣嘢，全部喺下面五個目錄入面，按用途分好。",
            "呢個應用程式做到嘅 {count} 樣嘢，全部喺下面五個目錄入面，按用途分好。",
            "呢個應用程式做到嘅 {count} 樣嘢，全部喺下面五個目錄度，按用途分好咗。",
            "佢做到嘅 {count} 樣嘢全部喺下面五個目錄，冇一樣要你事先知道先搵到。",
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

    /* ---------------------------------------------------------------- */
    /* Work                                                              */
    /* ---------------------------------------------------------------- */

    "work.empty.body": {
        en: [
            "Work holds the jobs you have started. Pick one from Home and it appears here.",
            "Work holds the jobs you have started. Pick one from Home and it appears here.",
            "Work holds the jobs you have started. Pick one from Home and it turns up here.",
            "Work only holds jobs you actually started. Pick one from Home and it lands here.",
            "Nothing on the go. Work only ever holds what you started yourself, pick something from Home and it turns up here.",
        ],
        yue: [
            "「工作」只會放你開咗嘅嘢。喺主頁揀一樣，佢就會出現喺呢度。",
            "「工作」只會放你開咗嘅嘢。喺主頁揀一樣，佢就會出現喺呢度。",
            "「工作」淨係放你開咗嘅嘢，喺主頁揀一樣，佢就會走出嚟。",
            "「工作」淨係放你自己開過嘅嘢。去主頁揀一樣，佢就會喺呢度出現。",
            "而家乜都冇開。「工作」淨係放你自己開過嘅嘢，去主頁揀一樣，佢就會走出嚟。",
        ],
    },

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

    /* Work. */
    "work.empty.title": { en: "No job is open", yue: "冇開任何嘢" },
    "work.empty.choose": { en: "Choose work", yue: "揀樣嘢做" },

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
     * The empty state has to keep naming Home, because it is the only route out of an empty Work
     * and a version that only said "nothing here" would be a dead end with a joke on it.
     */
    "work.empty.body": { en: ["Home"], yue: ["主頁"] },
    /*
     * "Nothing" survives every level. A playful rewrite that dropped it would leave a panel saying
     * something cheerful while the reader is still trying to work out whether anything is wrong.
     */
    "problems.empty": { en: ["othing"], yue: ["冇嘢"] },
};
