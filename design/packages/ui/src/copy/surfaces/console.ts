/**
 * The render console: the engine's own output, the level filter over it, and everything
 * that says which slice of it you are actually looking at.
 *
 * The engine's lines themselves never pass through this catalogue. They are the strings
 * somebody pastes into a search engine, and an app that improves them has taken away the
 * one thing that was going to help. What is here is the frame around them: how many lines
 * are on screen, how many the ring buffer has already thrown away, what a copy or an
 * export actually contains, and why the view stopped following.
 *
 * Two rules govern this surface in particular.
 *
 * **A severity word is never restyled.** `world.console.level.error` is "Errors" and
 * `world.console.level.warning` is "Warnings", in every mode, at every level. They are
 * FIXED for exactly that reason: they name what a line is, they are read beside a colour
 * swatch that some readers cannot see, and a playful synonym would make the one signal
 * that has to survive a monochrome screen ambiguous. The frame around a log line may be
 * funny; the level of the line may not.
 *
 * **A slice says it is a slice.** The cap drops the beginning of a long render, and a
 * filter hides the middle of it. Both look exactly like a complete log to somebody who
 * was not watching, so `capDropped`, `exportFiltered` and `exportDropped` carry their
 * counts into all ten of their strings and say plainly that lines are missing. An export
 * that covers a tenth of a render and does not admit it is worse than no export: the
 * reader draws conclusions from an absence that is an artefact of a filter.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const CONSOLE_VOICED = {
    /* ---------------------------------------------------------------- */
    /* What is on screen, and what the cap has already dropped           */
    /* ---------------------------------------------------------------- */

    /*
     * The two halves of the summary under the search field. They answer different
     * questions ("412 lines" against "412 of 3908 lines"), so neither is allowed to
     * collapse into the other's wording at a higher level.
     */
    "world.console.showingSome": {
        en: [
            "Showing {shown} of {kept} lines.",
            "Showing {shown} of {kept} lines.",
            "Showing {shown} of the {kept} lines held.",
            "{shown} of {kept} lines on screen; the rest are filtered out, not gone.",
            "{shown} of {kept} lines on screen. The others are filtered out rather than lost, and they come back when the filter does.",
        ],
        yue: [
            "顯示緊 {kept} 行入面嘅 {shown} 行。",
            "顯示緊 {kept} 行入面嘅 {shown} 行。",
            "喺留住嘅 {kept} 行入面，顯示緊 {shown} 行。",
            "畫面上有 {kept} 行入面嘅 {shown} 行；其餘嘅係篩走咗，唔係冇咗。",
            "畫面上有 {kept} 行入面嘅 {shown} 行。其餘嗰啲係俾篩走咗，唔係唔見咗，攞走個篩選就會返晒嚟。",
        ],
    },
    "world.console.showingAll": {
        en: [
            "Showing all {kept} lines.",
            "Showing all {kept} lines.",
            "Showing all {kept} lines, with nothing filtered out.",
            "All {kept} lines are on screen, with nothing filtered out.",
            "All {kept} lines are on screen, nothing filtered and nothing hidden.",
        ],
        yue: [
            "顯示緊全部 {kept} 行。",
            "顯示緊全部 {kept} 行。",
            "顯示緊全部 {kept} 行，冇篩走任何嘢。",
            "全部 {kept} 行都喺畫面上，冇篩走任何嘢。",
            "全部 {kept} 行都喺畫面上，冇篩走，亦都冇收埋。",
        ],
    },
    /*
     * A ring buffer that quietly forgets its own beginning looks exactly like a complete
     * log, and the line that says why a render failed is usually in the first ten seconds
     * of output. So the dropped count is stated, and every level says the dropped lines
     * are not coming back rather than leaving that to be inferred.
     */
    "world.console.capDropped": {
        en: [
            "Keeping the most recent {cap} lines. {dropped} earlier lines from this render have been dropped.",
            "Keeping the most recent {cap} lines. {dropped} earlier lines from this render have been dropped.",
            "Keeping the most recent {cap} lines. {dropped} earlier lines from this render have already been dropped.",
            "Keeping the most recent {cap} lines. {dropped} earlier lines from this render have been dropped and are not coming back.",
            "Keeping the most recent {cap} lines. {dropped} earlier lines from this render have been dropped and are gone for good, which is worth knowing before you conclude the render never mentioned something.",
        ],
        yue: [
            "只會保留最近 {cap} 行。呢次算圖較早嘅 {dropped} 行已經掉咗。",
            "只會保留最近 {cap} 行。呢次算圖較早嘅 {dropped} 行已經掉咗。",
            "只會保留最近 {cap} 行。呢次算圖較早嘅 {dropped} 行已經掉咗，冇留低。",
            "只會保留最近 {cap} 行。呢次算圖較早嘅 {dropped} 行已經掉咗，返唔到轉頭。",
            "只會保留最近 {cap} 行。呢次算圖較早嘅 {dropped} 行已經掉咗，永遠返唔到轉頭；睇之前最好知道呢件事，唔好以為算圖由頭到尾冇提過。",
        ],
    },
    "world.console.capIntact": {
        en: [
            "Every line is here. The console keeps up to {cap}.",
            "Every line is here. The console keeps up to {cap}.",
            "Every line is here. The console keeps up to {cap} of them.",
            "Every line is here, nothing dropped. The console keeps up to {cap} of them.",
            "Every line is here and nothing has been dropped yet. The console keeps up to {cap} of them, and this render has not filled that.",
        ],
        yue: [
            "每一行都喺度。個主控台最多保留 {cap} 行。",
            "每一行都喺度。個主控台最多保留 {cap} 行。",
            "每一行都喺度。個主控台最多保留 {cap} 行咁多。",
            "每一行都喺度，一行都冇掉過。個主控台最多保留 {cap} 行。",
            "每一行都喺度，暫時一行都未掉過。個主控台最多保留 {cap} 行，而今次算圖仲未去到。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Taking the log away: the header, and what happened               */
    /* ---------------------------------------------------------------- */

    /*
     * These three become the header of a copied or exported file, so they are read out of
     * context by somebody who was not here. That is why the filtered one says outright
     * that it is a slice, and why the dropped one keeps its leading space: it is appended
     * to whichever of the first two applies, in the same sentence.
     */
    "world.console.exportFiltered": {
        en: [
            "{shown} of the {kept} lines held, matching the level filter and search that were on screen.",
            "{shown} of the {kept} lines held, matching the level filter and search that were on screen.",
            "{shown} of the {kept} lines held, matching the level filter and the search that were on screen.",
            "{shown} of the {kept} lines held. This is a slice: it matches the level filter and the search that were on screen.",
            "{shown} of the {kept} lines held. This is a slice and not the whole log: it matches the level filter and the search that were on screen at the time.",
        ],
        yue: [
            "留住嘅 {kept} 行入面嘅 {shown} 行，符合當時畫面上嘅等級篩選同搜尋。",
            "留住嘅 {kept} 行入面嘅 {shown} 行，符合當時畫面上嘅等級篩選同搜尋。",
            "喺留住嘅 {kept} 行入面嘅 {shown} 行，符合當時畫面上嘅等級篩選同埋搜尋。",
            "留住嘅 {kept} 行入面嘅 {shown} 行。呢個係一截：符合當時畫面上嘅等級篩選同搜尋。",
            "留住嘅 {kept} 行入面嘅 {shown} 行。呢個係一截，唔係成份 log：佢符合當時畫面上嘅等級篩選同搜尋。",
        ],
    },
    "world.console.exportAll": {
        en: [
            "All {kept} lines the console was holding.",
            "All {kept} lines the console was holding.",
            "All {kept} lines the console was holding, with no filter applied.",
            "All {kept} lines the console was holding, with no filter and no search applied.",
            "All {kept} lines the console was holding, unfiltered and unsearched, exactly as they arrived.",
        ],
        yue: [
            "個主控台當時留住嘅全部 {kept} 行。",
            "個主控台當時留住嘅全部 {kept} 行。",
            "個主控台當時留住嘅全部 {kept} 行，冇加任何篩選。",
            "個主控台當時留住嘅全部 {kept} 行，冇篩選亦冇搜尋。",
            "個主控台當時留住嘅全部 {kept} 行，冇篩選、冇搜尋，點樣到就點樣擺。",
        ],
    },
    /* The leading space is deliberate: this clause is appended to the sentence above it. */
    "world.console.exportDropped": {
        en: [
            " {dropped} earlier lines were already dropped: the console keeps the most recent {cap}.",
            " {dropped} earlier lines were already dropped: the console keeps the most recent {cap}.",
            " {dropped} earlier lines had already been dropped: the console keeps the most recent {cap}.",
            " {dropped} earlier lines had already been dropped before this was written: the console keeps the most recent {cap}.",
            " {dropped} earlier lines had already been dropped before this was written, so it starts mid render: the console keeps the most recent {cap}.",
        ],
        yue: [
            " 較早嘅 {dropped} 行已經掉咗：個主控台只保留最近 {cap} 行。",
            " 較早嘅 {dropped} 行已經掉咗：個主控台只保留最近 {cap} 行。",
            " 較早嘅 {dropped} 行早就掉咗：個主控台只保留最近 {cap} 行。",
            " 寫呢段嘢之前，較早嘅 {dropped} 行已經掉咗：個主控台只保留最近 {cap} 行。",
            " 寫呢段嘢之前，較早嘅 {dropped} 行已經掉咗，所以份嘢係由算圖中間開始嘅：個主控台只保留最近 {cap} 行。",
        ],
    },
    "world.console.copied": {
        en: [
            "Copied {shown} lines, with a header saying which ones.",
            "Copied {shown} lines, with a header saying which ones.",
            "Copied {shown} lines, with a header at the top saying which ones.",
            "Copied {shown} lines to the clipboard, with a header saying which ones.",
            "Copied {shown} lines to the clipboard, with a header saying which ones, so nobody reads a slice as the whole log.",
        ],
        yue: [
            "已經複製咗 {shown} 行，前面有個標頭講明係邊啲。",
            "已經複製咗 {shown} 行，前面有個標頭講明係邊啲。",
            "已經複製咗 {shown} 行，最前面有個標頭講明係邊啲。",
            "已經複製咗 {shown} 行去剪貼簿，前面有個標頭講明係邊啲。",
            "已經複製咗 {shown} 行去剪貼簿，前面有個標頭講明係邊啲，等人唔會將一截當成成份 log。",
        ],
    },
    "world.console.copyFailed": {
        en: [
            "Could not reach the clipboard.",
            "Could not reach the clipboard.",
            "Could not reach the clipboard, so nothing was copied.",
            "Could not reach the clipboard, so nothing was copied and the console is unchanged.",
            "Could not reach the clipboard, so nothing was copied. The console is untouched, which is the one piece of good news here.",
        ],
        yue: [
            "去唔到剪貼簿。",
            "去唔到剪貼簿。",
            "去唔到剪貼簿，所以乜都冇複製到。",
            "去唔到剪貼簿，所以乜都冇複製到，個主控台都冇變過。",
            "去唔到剪貼簿，乜都冇複製到。個主控台原封不動，呢個算係唯一嘅好消息。",
        ],
    },
    "world.console.exportUnavailable": {
        en: [
            "This build cannot write a file from here.",
            "This build cannot write a file from here.",
            "This build cannot write a file from here, so nothing was exported.",
            "This build cannot write a file from here, so nothing was exported. Copying still works.",
            "This build cannot write a file from here, so nothing was exported. Copying still works, and a pasted log is the same text.",
        ],
        yue: [
            "呢個版本喺呢度寫唔到檔案。",
            "呢個版本喺呢度寫唔到檔案。",
            "呢個版本喺呢度寫唔到檔案，所以乜都冇匯出到。",
            "呢個版本喺呢度寫唔到檔案，所以乜都冇匯出到。複製就仲用得。",
            "呢個版本喺呢度寫唔到檔案，所以乜都冇匯出到。複製就仲用得，貼出嚟嘅字係一模一樣。",
        ],
    },
    "world.console.exported": {
        en: [
            "Exported {shown} lines as plain text, with a header saying which ones.",
            "Exported {shown} lines as plain text, with a header saying which ones.",
            "Exported {shown} lines as plain text, with a header at the top saying which ones.",
            "Exported {shown} lines as plain text, with a header saying which ones, ready to attach to a bug report.",
            "Exported {shown} lines as plain text, with a header saying which ones, ready to attach to a bug report without anybody having to ask what is missing.",
        ],
        yue: [
            "已經將 {shown} 行匯出做純文字，前面有個標頭講明係邊啲。",
            "已經將 {shown} 行匯出做純文字，前面有個標頭講明係邊啲。",
            "已經將 {shown} 行匯出做純文字，最前面有個標頭講明係邊啲。",
            "已經將 {shown} 行匯出做純文字，前面有個標頭講明係邊啲，可以直接擺入 bug report。",
            "已經將 {shown} 行匯出做純文字，前面有個標頭講明係邊啲，可以直接擺入 bug report，唔使人問返你少咗啲乜。",
        ],
    },
    "world.console.exportedFormat": {
        en: [
            "Exported {shown} lines as {format}.",
            "Exported {shown} lines as {format}.",
            "Exported {shown} lines as {format}, with the scope header intact.",
            "Exported {shown} lines as {format}; the file keeps its schema and filter scope.",
            "Exported {shown} lines as {format}; the file keeps its schema, provenance, and honest filter scope.",
        ],
        yue: [
            "已經將 {shown} 行匯出做 {format}。",
            "已經將 {shown} 行匯出做 {format}。",
            "已經將 {shown} 行匯出做 {format}，範圍標頭都仲喺度。",
            "已經將 {shown} 行匯出做 {format}；檔案保留 schema 同篩選範圍。",
            "已經將 {shown} 行匯出做 {format}；檔案保留 schema、來源同老實嘅篩選範圍。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Searching, filtering, and the empty states                        */
    /* ---------------------------------------------------------------- */

    /*
     * The search field's placeholder. Voiced, but kept short at every level, because it
     * renders inside a compact field and a level 5 that overflows the input is a joke
     * nobody can read. It has to mention the advice as well as the line: this app's own
     * annotations are searchable, and a reader who searches for a word they can see and
     * gets nothing concludes the search is broken.
     */
    "world.console.searchHint": {
        en: [
            "Any word in a line, or in the advice beside it",
            "Any word in a line, or in the advice beside it",
            "Any word from a line, or from the advice beside it",
            "Any word in a line, or in the advice this app put beside it",
            "Any word in a line, or in the advice this app stuck beside it",
        ],
        yue: [
            "行入面任何一個字，或者旁邊嗰段建議入面嘅字",
            "行入面任何一個字，或者旁邊嗰段建議入面嘅字",
            "行入面任何一個字，又或者旁邊嗰段建議嘅字",
            "行入面任何一個字，或者程式擺喺旁邊嗰段建議嘅字",
            "行入面任何一個字，或者程式硬塞咗喺旁邊嗰段建議嘅字",
        ],
    },
    "world.console.filterNone": {
        en: [
            "No level filter: every line is shown.",
            "No level filter: every line is shown.",
            "No level filter is on, so every line is shown.",
            "No level filter is on, so every line is shown, errors and debug alike.",
            "No level filter is on at all, so every line is shown: errors, debug and everything in between.",
        ],
        yue: [
            "冇等級篩選：每一行都會顯示。",
            "冇等級篩選：每一行都會顯示。",
            "冇開等級篩選，所以每一行都會顯示。",
            "冇開等級篩選，所以每一行都會顯示，錯誤同 debug 一樣照出。",
            "根本冇開過等級篩選，所以每一行都會顯示：錯誤、debug，中間嗰啲全部照出。",
        ],
    },
    /*
     * An empty console before the first line arrives is not the same as an empty console
     * because a filter is on, and the two empty states are worded so far apart that
     * nobody has to look at the filter chips to tell which one they are in.
     */
    "world.console.emptyLog": {
        en: [
            "The engine has not printed anything yet.",
            "The engine has not printed anything yet.",
            "The engine has printed nothing yet.",
            "The engine has printed nothing yet. This is an empty console, not a stuck one.",
            "The engine has printed nothing yet. That is an empty console rather than a stuck one; the first line usually turns up within seconds of a render starting.",
        ],
        yue: [
            "引擎未印過任何嘢。",
            "引擎未印過任何嘢。",
            "引擎到而家未印過任何嘢。",
            "引擎到而家未印過任何嘢。呢個係空嘅主控台，唔係卡住咗。",
            "引擎到而家未印過任何嘢。呢個係空嘅主控台，唔係卡住咗；算圖開始之後，第一行通常幾秒內就會出。",
        ],
    },
    "world.console.emptyMatch": {
        en: [
            "None of the {kept} lines match the level filter and the search.",
            "None of the {kept} lines match the level filter and the search.",
            "None of the {kept} lines match the level filter and the search together.",
            "None of the {kept} lines match the level filter and the search together. The lines are still here; the filter is what is hiding them.",
            "None of the {kept} lines match the level filter and the search at the same time. Every one of them is still here; it is the filter hiding them, not the render going quiet.",
        ],
        yue: [
            "{kept} 行入面冇一行同時符合等級篩選同搜尋。",
            "{kept} 行入面冇一行同時符合等級篩選同搜尋。",
            "{kept} 行入面，冇一行同時符合到等級篩選同搜尋。",
            "{kept} 行入面冇一行同時符合等級篩選同搜尋。啲行仲喺度，係個篩選遮住咗佢哋。",
            "{kept} 行入面冇一行可以同時符合等級篩選同搜尋。每一行都仲好地地喺度，係個篩選遮住咗佢哋，唔係算圖收咗聲。",
        ],
    },
    /*
     * The tooltip on the control that appears only while the view is detached. It has to
     * say that the console stopped following on purpose, or the state reads as a bug in a
     * console that had otherwise been scrolling by itself.
     */
    "world.console.toBottomHint": {
        en: [
            "The console stopped following because you scrolled up. This goes back to the newest line and starts following again.",
            "The console stopped following because you scrolled up. This goes back to the newest line and starts following again.",
            "The console stopped following when you scrolled up. This goes back to the newest line and starts following again.",
            "The console stopped following when you scrolled up, which is deliberate: nothing drags the view away while you are reading. This goes back to the newest line and starts following again.",
            "The console stopped following when you scrolled up, on purpose, so nothing can yank the view out from under you mid sentence. This goes back to the newest line and starts following again.",
        ],
        yue: [
            "你向上捲咗，所以個主控台停咗跟。撳呢個會返去最新嗰行，然後再開始跟。",
            "你向上捲咗，所以個主控台停咗跟。撳呢個會返去最新嗰行，然後再開始跟。",
            "你向上捲嗰陣，個主控台就停咗跟。撳呢個會返去最新嗰行，然後再開始跟。",
            "你向上捲嗰陣個主控台就停咗跟，呢個係特登嘅：你睇緊嘢嗰陣冇嘢會拉走個畫面。撳呢個會返去最新嗰行，然後再開始跟。",
            "你向上捲嗰陣個主控台就特登停咗跟，唔會喺你睇到一半嗰陣扯走個畫面。撳呢個會返去最新嗰行，然後再開始跟。",
        ],
    },
    /*
     * The auto-scroll checkbox's own tooltip. It has to say three things at once - what
     * ticking it does, that scrolling up pauses it without unticking it, and how to get back
     * - or a reader who only reads the first clause comes away thinking the checkbox lies to
     * them the first time they scroll up mid-render.
     */
    "world.console.autoScrollHint": {
        en: [
            "Keeps the console scrolled to the newest line as the engine prints it. Scrolling up pauses that without turning this off; scroll back down, or use Newest lines, to pick it up again.",
            "Keeps the console scrolled to the newest line as the engine prints it. Scrolling up pauses that without turning this off; scroll back down, or use Newest lines, to pick it up again.",
            "Keeps the console scrolled to the newest line as the engine prints it. Scrolling up pauses that without turning this off, so nothing needs re-ticking; scroll back to the bottom, or use Newest lines, to resume it.",
            "Keeps the console scrolled to the newest line. Scrolling up to read something pauses it too, without turning this off - scroll back down, or hit Newest lines, when you are ready to resume.",
            "Keeps the console glued to the newest line. Scroll up and it lets go on its own, without turning this off - scroll back to the bottom, or hit Newest lines, and it glues itself back on.",
        ],
        yue: [
            "跟住引擎印緊嘅最新一行，將主控台捲落去。你向上捲會令佢暫停，但唔會關呢個掣；捲返落底，或者撳「最新嘅行」，就會再繼續跟。",
            "跟住引擎印緊嘅最新一行，將主控台捲落去。你向上捲會令佢暫停，但唔會關呢個掣；捲返落底，或者撳「最新嘅行」，就會再繼續跟。",
            "跟住引擎印緊嘅最新一行，將主控台捲落去。你向上捲嗰陣佢會暫停，但唔會關呢個剔掣；捲返去底，或者撳「最新嘅行」，就會再開始跟。",
            "呢個掣負責將主控台跟住最新一行捲。你向上捲去睇嘢，佢自己會暫停，唔會關呢個剔掣；捲返落底，或者撳「最新嘅行」，準備好就繼續跟。",
            "呢個掣負責將主控台黐實最新一行。你向上捲，佢會自動鬆手，唔會關呢個剔；捲返落底，或者撳「最新嘅行」，佢又會黐返實。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const CONSOLE_FIXED = {
    /*
     * The level names, read beside a colour swatch and used as the accessible name of
     * each filter chip. They are the one signal that has to survive a monochrome display
     * and a copy-paste into a bug report, so they say exactly what the level is and are
     * never restyled by the funny slider. "Debug" keeps its English spelling in both
     * languages: it is the word the engine prints and the word a reader will search for.
     */
    "world.console.level.error": { en: "Errors", yue: "錯誤" },
    "world.console.level.warning": { en: "Warnings", yue: "警告" },
    "world.console.level.info": { en: "Information", yue: "資訊" },
    "world.console.level.debug": { en: "Debug", yue: "Debug" },
    "world.console.level.signal": {
        en: "This app's own status lines",
        yue: "程式自己嘅狀態訊息",
    },
    "world.console.level.tip": { en: "Tips", yue: "貼士" },

    /* The console's own controls. */
    "world.console.title": { en: "Render console", yue: "算圖主控台" },
    "world.console.search": { en: "Search the console", yue: "搜尋主控台" },
    "world.console.filter": { en: "Show only these levels", yue: "只顯示呢啲等級" },
    "world.console.copy": { en: "Copy selected or retained matches", yue: "複製選取或者保留紀錄入面配對嘅行" },
    "world.console.export": { en: "Export selected or retained matches", yue: "匯出選取或者保留紀錄入面配對嘅行" },
    "world.console.exportFormat": { en: "Export format", yue: "匯出格式" },
    "world.console.exportSelection": { en: "{shown} selected lines from {kept} retained lines.", yue: "由留住嘅 {kept} 行入面選取咗 {shown} 行。" },
    "world.console.exportFilterMetadata": { en: "Filter: query={query}; mode={mode}; flags={flags}; levels={levels}.", yue: "篩選：查詢={query}；模式={mode}；旗標={flags}；等級={levels}。" },
    "world.console.exportIdentityMetadata": { en: "Render id={renderId}; provenance={provenance}.", yue: "算圖 ID={renderId}；來源={provenance}。" },
    "world.console.showingRecent": { en: "Showing the newest {shown} of {retained} retained lines. Search and filters use the complete history.", yue: "顯示緊保留紀錄入面最新嘅 {shown} 行（總共 {retained} 行）。搜尋同篩選會用完整紀錄。" },
    "world.console.historyComplete": {
        en: "Complete history: {retained} retained lines.",
        yue: "完整紀錄：保留咗 {retained} 行。",
    },
    "world.console.historyFactsTitle": {
        en: "Persisted history details",
        yue: "已儲存紀錄詳情",
    },
    "world.console.historyIncomplete": {
        en: "Incomplete history: {retained} retained lines. {reason}",
        yue: "紀錄唔完整：保留咗 {retained} 行。{reason}",
    },
    "world.console.historyUnknown": {
        en: "Persisted completion state is unavailable.",
        yue: "冇法得知已儲存紀錄嘅完成狀態。",
    },
    "world.console.historyIncompleteReason": {
        en: "The render may still be running or was interrupted.",
        yue: "算圖可能仲行緊，或者中途停咗。",
    },
    "world.console.evictedLines": {
        en: "Retention removed {evictedLines} older lines.",
        yue: "保留規則移除咗較早嘅 {evictedLines} 行。",
    },
    "world.console.evictedRenders": {
        en: "Retention removed {evictedRenders} older render histories.",
        yue: "保留規則移除咗較早嘅 {evictedRenders} 份算圖紀錄。",
    },
    "world.console.storageWarningDetail": {
        en: "Storage warning: {reason} Last successful save: {lastSavedAt}.",
        yue: "儲存警告：{reason} 上次成功儲存：{lastSavedAt}。",
    },
    "world.console.exportHistoryMetadata": {
        en: "History state={completion}; retained lines={retained}; evicted lines={evictedLines}; evicted renders={evictedRenders}; storage warning={storageWarning}.",
        yue: "紀錄狀態={completion}；保留行數={retained}；已移除行數={evictedLines}；已移除算圖紀錄={evictedRenders}；儲存警告={storageWarning}。",
    },
    "world.console.selectRetained": { en: "Select all retained lines", yue: "揀晒全部保留紀錄" },
    "world.console.selectMatches": { en: "Select all retained matches", yue: "揀晒保留紀錄入面配對嘅行" },
    "world.console.clearSelection": { en: "Clear selection", yue: "清除選取" },
    "world.console.selectLine": { en: "Select line {id}", yue: "選取第 {id} 行" },
    "world.console.affectedMore": { en: "and {count} more retained lines", yue: "同埋另外 {count} 行保留紀錄" },
    "world.console.deleteTitle": { en: "Delete retained console history", yue: "刪除保留嘅主控台紀錄" },
    "world.console.deleteAction": { en: "Delete the selected retained console lines. This cannot be undone.", yue: "刪除選取嘅主控台紀錄，呢個動作冇得還原。" },
    "world.console.deleteConfirm": { en: "Confirm deletion", yue: "確認刪除" },
    "world.console.deleteSelected": { en: "Delete selected", yue: "刪除選取項目" },
    "world.console.pruneTitle": { en: "Prune retained console history", yue: "修剪保留嘅主控台紀錄" },
    "world.console.pruneAction": { en: "Delete every retained console line for this render. The running render, if any, continues and new lines can still arrive. This cannot be undone.", yue: "刪除今次算圖全部保留嘅主控台紀錄。算圖如果仲行緊會繼續，新行亦可以繼續入嚟。呢個動作冇得還原。" },
    "world.console.pruneConfirm": { en: "Confirm retained-history pruning", yue: "確認修剪保留紀錄" },
    "world.console.prune": { en: "Prune retained history", yue: "修剪保留紀錄" },
    "world.console.pruneCount": { en: "All {count} retained lines for this render", yue: "今次算圖全部 {count} 行保留紀錄" },
    "world.console.storageUnavailable": { en: "Console history could not be saved; the live render is unchanged.", yue: "主控台紀錄儲存唔到；即時算圖冇受影響。" },
    "world.console.retentionWarning": { en: "Console history reached a retention or storage limit; older lines remain unavailable.", yue: "主控台紀錄去到保留或儲存上限；較早嘅行仍然搵唔返。" },
    "world.console.capRetained": { en: "The live view keeps the newest {shown} lines. Search, copy, selection, and export use all {retained} retained lines.", yue: "即時畫面保留最新 {shown} 行；搜尋、複製、選取同匯出會用齊全部 {retained} 行保留紀錄。" },
    "world.console.output": { en: "The engine's output", yue: "引擎嘅輸出" },
    /*
     * Who is speaking when a line carries this app's advice. It is the product's name, so
     * it is the same in both languages: translating it would suggest a second speaker.
     */
    "world.console.speaker": { en: "Worldlens", yue: "Worldlens" },
    "world.console.openSetting": { en: "Open the setting", yue: "開嗰個設定" },
    "world.console.toBottom": { en: "Newest lines", yue: "最新嘅行" },
    /* The auto-scroll checkbox's own label - on by default for this surface, see RenderConsole.vue. */
    "world.console.autoScroll": { en: "Follow new lines", yue: "跟住新增嘅行" },
    /*
     * The `#` header line an exported console log opens with, so the file says which
     * application wrote it. "Worldlens" is a product name and stays untranslated for
     * the same reason `world.console.speaker` does; only the words around it move. The call
     * sits inside a template literal, which is why the generated work list never saw it.
     */
    "world.console.exportTitle": {
        en: "Worldlens render console",
        yue: "Worldlens 算圖主控台",
    },
} as const satisfies Record<string, FixedString>;

export const CONSOLE_FACTS = {
    "world.console.showingSome": { en: ["{shown}", "{kept}"], yue: ["{shown}", "{kept}"] },
    "world.console.showingAll": { en: ["{kept}"], yue: ["{kept}"] },
    // The count of what is gone, and that it is gone. A cap nobody is told about reads
    // as a complete log.
    "world.console.capDropped": {
        en: ["{cap}", "{dropped}", "dropped"],
        yue: ["{cap}", "{dropped}", "掉咗"],
    },
    "world.console.capIntact": { en: ["{cap}", "Every line"], yue: ["{cap}", "每一行都喺度"] },

    "world.console.exportFiltered": {
        en: ["{shown}", "{kept}", "filter"],
        yue: ["{shown}", "{kept}", "篩選"],
    },
    "world.console.exportAll": { en: ["{kept}"], yue: ["{kept}"] },
    "world.console.exportDropped": {
        en: ["{dropped}", "{cap}", "dropped"],
        yue: ["{dropped}", "{cap}", "掉咗"],
    },
    "world.console.copied": { en: ["{shown}", "header"], yue: ["{shown}", "標頭"] },
    "world.console.copyFailed": { en: ["clipboard"], yue: ["剪貼簿"] },
    "world.console.exportUnavailable": { en: ["cannot write a file"], yue: ["寫唔到檔案"] },
    "world.console.exported": {
        en: ["{shown}", "plain text", "header"],
        yue: ["{shown}", "純文字", "標頭"],
    },
    "world.console.exportedFormat": {
        en: ["{shown}", "{format}", "schema", "provenance"],
        yue: ["{shown}", "{format}", "schema", "來源"],
    },

    // The advice is searchable too, which is the half of the hint a shorter level drops.
    "world.console.searchHint": { en: ["word", "advice"], yue: ["字", "建議"] },
    "world.console.filterNone": {
        en: ["level filter", "every line is shown"],
        yue: ["等級篩選", "每一行都會顯示"],
    },
    "world.console.emptyLog": { en: ["engine", "yet"], yue: ["引擎", "未印過任何嘢"] },
    "world.console.emptyMatch": {
        en: ["{kept}", "level filter", "search"],
        yue: ["{kept}", "等級篩選", "搜尋"],
    },
    // Why it stopped, and what pressing this does. Either half alone leaves the state
    // looking like a fault.
    "world.console.toBottomHint": {
        en: ["scrolled up", "newest line", "following"],
        yue: ["向上捲", "最新嗰行", "跟"],
    },
    // The three facts a shorter level cannot lose: what it does, that pausing does not
    // untick it, and how to get back. Drop the middle one and level 5 reads as a bug report
    // the first time somebody scrolls up mid-render.
    "world.console.autoScrollHint": {
        en: ["newest line", "without turning this off", "Newest lines"],
        yue: ["最新一行", "唔會關", "最新嘅行"],
    },
} as const satisfies Record<
    keyof typeof CONSOLE_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
