/**
 * The menu side sheet and everything that lives inside it: the About page, the search bar
 * that every menu carries, the anchored regex builder behind that search bar, the super
 * confirmation slider, and the one setting in here that destroys something.
 *
 * ## Two registers in one module, on purpose
 *
 * Most of this surface is labels, so most of it is FIXED. The six voiced entries are the
 * ones that report something a reader has to act on: a version this build could not
 * produce, a search that matched nothing, a pattern that will not compile, and a reset
 * that cannot be taken back.
 *
 * ## Terms that stay in English
 *
 * `ECMAScript RegExp`, `pattern`, `flags` and `backslash` are the names of the thing the
 * builder actually runs, and a reader carrying a pattern between this app and their
 * editor needs them to be the same word in both. `regexBuilder.engine` names the dialect
 * exactly because a builder that will not say which engine it is cannot be trusted with
 * an escape rule.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const MENU_VOICED = {
    /* ---------------------------------------------------------------- */
    /* About this build                                                  */
    /* ---------------------------------------------------------------- */

    /* No version is shown rather than a plausible one, and every level says why. A guessed
     * version number in an About box is worse than a blank, because somebody will quote it
     * back in a bug report. */
    "info.appVersionFailed": {
        en: [
            "This build could not report its version: {reason}",
            "This build could not report its version: {reason}",
            "This build could not report its own version: {reason}",
            "This build could not report its own version, so none is shown rather than a guess: {reason}",
            "This build could not report its own version, so none is shown rather than a number invented to fill the gap: {reason}",
        ],
        yue: [
            "呢個 build 報唔到自己嘅版本號：{reason}",
            "呢個 build 報唔到自己嘅版本號：{reason}",
            "呢個 build 報唔到自己嘅版本號，所以呢度唔會顯示：{reason}",
            "呢個 build 報唔到自己嘅版本號，所以呢度寧願唔顯示，都唔會亂估一個：{reason}",
            "呢個 build 報唔到自己嘅版本號，所以呢度寧願吉住，都唔會作個號碼出嚟填個窿：{reason}",
        ],
    },

    /* When this build was made. The instant itself is a fact and is identical at every
     * level; only the sentence around it moves. It is rendered in the reader's own local
     * time, to the second, with the zone named, because "14:32" with no zone is not an
     * answer anybody can act on across a timezone. */
    "info.builtAt": {
        en: [
            "Built {timestamp}",
            "Built {timestamp}",
            "This build was made {timestamp}",
            "This exact build was made {timestamp}, in your own timezone",
            "This exact build was made {timestamp}, shown in your own timezone so nobody has to do the arithmetic",
        ],
        yue: [
            "整於 {timestamp}",
            "整於 {timestamp}",
            "呢個 build 係 {timestamp} 整嘅",
            "呢個 build 就係 {timestamp} 整嘅，用緊你自己嗰個時區",
            "呢個 build 就係 {timestamp} 整嘅，直接用你自己個時區顯示，唔使你自己喺度計時差",
        ],
    },

    /* No build time recorded. Says so, and never fills the gap with the current clock -
     * which would be the launch time of a binary that could have been sitting on a disk for
     * a month, rendered as a confident fact about when it was made. */
    "info.builtAtUnknown": {
        en: [
            "Build time not recorded",
            "Build time not recorded",
            "This build did not record when it was made",
            "This build did not record when it was made, so nothing is shown rather than a guess",
            "This build did not record when it was made, so this line stays empty rather than quietly showing you the time right now and calling it a build date",
        ],
        yue: [
            "冇記低幾時整",
            "冇記低幾時整",
            "呢個 build 冇記低自己幾時整",
            "呢個 build 冇記低自己幾時整，所以寧願唔顯示，都唔會亂估",
            "呢個 build 冇記低自己幾時整，所以呢行寧願吉住，都唔會靜靜雞攞而家嘅時間出嚟當係 build 日期",
        ],
    },

    /* What a hosted copy says about itself. The facts stay exact at every level: which
     * folders, what was granted, and whether anything stands between the port and whoever
     * opened it. A person handed a URL by a colleague cannot otherwise tell a locked
     * deployment from an open one. */
    "info.hosted": {
        en: [
            "Served from a container",
            "Served from a container",
            "This copy is served from a container rather than installed here",
            "This copy is served from a container rather than installed on this computer",
            "This copy is not installed on this computer at all: it is served from a container somewhere else, and what it can reach was decided by whoever started it",
        ],
        yue: [
            "由 container 送出嚟",
            "由 container 送出嚟",
            "呢個唔係裝喺呢部機，係由 container 送出嚟嘅",
            "呢個唔係裝喺你部機度，係由某部機嘅 container 送出嚟",
            "呢個完全唔係裝喺你部機：係喺第度一個 container 送出嚟，佢掂到啲乜，開佢嗰個人早就決定咗",
        ],
    },

    /* No password. Said plainly and identically at every level, because a person who has just
     * been handed the address is exactly the person who needs to know. */
    "info.hostedOpen": {
        en: [
            "No password: anyone who can reach this address has full access.",
            "No password: anyone who can reach this address has full access.",
            "There is no password on this deployment, so anyone who can reach this address has full access.",
            "There is no password on this deployment, so anyone who can reach this address has full access to everything it can reach.",
            "There is no password on this deployment at all, so anyone who can reach this address has exactly as much access as you do, including every folder listed below.",
        ],
        yue: [
            "冇密碼：任何人到得呢個地址就用得晒。",
            "冇密碼：任何人到得呢個地址就用得晒。",
            "呢個 deployment 冇設密碼，即係任何人到得呢個地址就用得晒。",
            "呢個 deployment 冇設密碼，即係任何人到得呢個地址，就同你一樣乜都用得。",
            "呢個 deployment 完全冇密碼，任何人到得呢個地址，權限同你一模一樣，包括下面列住嗰啲資料夾。",
        ],
    },

    /* The folders it can reach. Empty is a real state and is said, because a deployment with
     * nothing mounted looks broken rather than unconfigured. */
    "info.hostedFolders": {
        en: [
            "Folders: {folders}",
            "Folders: {folders}",
            "It can reach these folders: {folders}",
            "The folders it can reach, and nothing else: {folders}",
            "These are the only folders it can reach, because they are the only ones whoever started it declared: {folders}",
        ],
        yue: [
            "資料夾：{folders}",
            "資料夾：{folders}",
            "佢掂到呢啲資料夾：{folders}",
            "佢淨係掂到呢啲資料夾，其他一律唔得：{folders}",
            "佢淨係掂到呢啲資料夾，因為開佢嗰個人就只係報咗呢啲：{folders}",
        ],
    },

    "info.hostedNoFolders": {
        en: [
            "No folders are mounted.",
            "No folders are mounted.",
            "No folders are mounted, so there is nothing for it to read or render.",
            "No folders are mounted, so there is nothing for it to read or render yet.",
            "No folders are mounted at all, so there is nothing for it to read or render, which is a deployment that has not been finished rather than one that is broken.",
        ],
        yue: [
            "冇 mount 任何資料夾。",
            "冇 mount 任何資料夾。",
            "冇 mount 任何資料夾，所以佢冇嘢讀得，亦都算唔到圖。",
            "冇 mount 任何資料夾，所以暫時冇嘢讀得都算唔到圖。",
            "完全冇 mount 過資料夾，所以佢冇嘢讀亦冇嘢算 —— 呢個係未設定完，唔係壞咗。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The search bar every menu carries                                 */
    /* ---------------------------------------------------------------- */

    "search.noMatch": {
        en: [
            "Nothing matches that search.",
            "Nothing matches that search.",
            "Nothing matches that search. Nothing has been removed.",
            "Nothing matches that search. Nothing has been removed either; clearing it brings everything back.",
            "Nothing matches that search. Nothing has been removed either; clearing it brings the whole list back, unharmed.",
        ],
        yue: [
            "冇嘢符合嗰個搜尋。",
            "冇嘢符合嗰個搜尋。",
            "冇嘢符合嗰個搜尋。冇任何嘢被刪走。",
            "冇嘢符合嗰個搜尋。亦都冇任何嘢被刪走，清走個搜尋就會全部返嚟。",
            "冇嘢符合嗰個搜尋。亦都冇任何嘢被刪走，清走個搜尋，成張清單就會原封不動咁返嚟。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The regex builder                                                 */
    /* ---------------------------------------------------------------- */

    /*
     * Three facts in one short line, and all three are load-bearing. The dialect, because
     * escaping rules differ between engines and this one is ECMAScript. That it runs
     * locally, because a person testing a pattern against real text is entitled to know it
     * was not sent anywhere. And the escape rule itself, which is the single most asked
     * question a builder like this gets.
     */
    "regexBuilder.engine": {
        en: [
            "ECMAScript RegExp, evaluated locally. Escape a literal with a backslash.",
            "ECMAScript RegExp, evaluated locally. Escape a literal with a backslash.",
            "ECMAScript RegExp, evaluated locally on this machine. Escape a literal with a backslash.",
            "ECMAScript RegExp, evaluated locally on this machine and sent nowhere. Escape a literal with a backslash.",
            "ECMAScript RegExp, evaluated locally right here and sent nowhere at all. Escape a literal with a backslash, the way it has always been.",
        ],
        yue: [
            "ECMAScript RegExp，喺本機評估。想要字面字元就用 backslash escape。",
            "ECMAScript RegExp，喺本機評估。想要字面字元就用 backslash escape。",
            "ECMAScript RegExp，喺你部機本機評估。想要字面字元就用 backslash escape。",
            "ECMAScript RegExp，喺你部機本機評估，唔會傳去任何地方。想要字面字元就用 backslash escape。",
            "ECMAScript RegExp，就喺你部機本機評估，一個字都唔會傳出去。想要字面字元就用 backslash escape，由頭到尾都係咁。",
        ],
    },
    /* An empty builder and a broken pattern both show no matches, and a reader has to be
     * able to tell which of the two they are looking at. */
    "regexBuilder.noPattern": {
        en: [
            "No pattern yet.",
            "No pattern yet.",
            "No pattern yet, so nothing is being matched.",
            "No pattern yet, so nothing is being matched and nothing is wrong.",
            "No pattern yet, so nothing is being matched, and nothing is wrong; the builder is simply waiting.",
        ],
        yue: [
            "仲未有 pattern。",
            "仲未有 pattern。",
            "仲未有 pattern，所以冇嘢喺度比對緊。",
            "仲未有 pattern，所以冇嘢比對緊，亦都冇出錯。",
            "仲未有 pattern，所以冇嘢比對緊，亦都冇出錯，個 builder 淨係喺度等緊你。",
        ],
    },
    "regexBuilder.invalid": {
        en: [
            "Pattern is not valid, so nothing matches.",
            "Pattern is not valid, so nothing matches.",
            "The pattern is not valid, so nothing matches.",
            "The pattern is not valid, so nothing matches and nothing is being hidden.",
            "The pattern is not valid, so nothing matches, and that is the pattern's doing rather than the sample's.",
        ],
        yue: [
            "個 pattern 唔正確，所以冇嘢 match 到。",
            "個 pattern 唔正確，所以冇嘢 match 到。",
            "個 pattern 而家唔正確，所以冇嘢 match 到。",
            "個 pattern 而家唔正確，所以冇嘢 match 到，亦都冇收埋任何嘢。",
            "個 pattern 而家唔正確，所以冇嘢 match 到，呢個係 pattern 嘅問題，唔關個 sample 事。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Fullscreen                                                        */
    /* ---------------------------------------------------------------- */

    /*
     * `MenuOption`'s `disabled` prop, by itself, tells nobody why: a screen reader hears
     * "Go Fullscreen, dimmed" and a sighted person sees a greyed-out row, and neither
     * learns anything a click would not have told them anyway. `document.fullscreenEnabled`
     * is false when the browser itself refuses the Fullscreen API here - most often because
     * this page is embedded in a frame that was never granted the permission - and that is
     * a fact about the browser, not a bug in this app, which is the one thing every level
     * below keeps saying.
     */
    "goFullscreen.unavailable": {
        en: [
            "Fullscreen is not available in this browser.",
            "Fullscreen is not available in this browser.",
            "Fullscreen is not available in this browser right now.",
            "Fullscreen is not available in this browser, so the button stays off rather than promising something it cannot do.",
            "Fullscreen is not available in this browser, which flatly refuses it here, so the button stays off rather than pretending it will work and leaving you to find out the hard way.",
        ],
        yue: [
            "呢個瀏覽器唔支援全螢幕。",
            "呢個瀏覽器唔支援全螢幕。",
            "而家呢個瀏覽器唔支援全螢幕。",
            "呢個瀏覽器唔支援全螢幕，所以個掣寧願熄住，都唔會呃你話得。",
            "呢個瀏覽器死都唔支援全螢幕，所以個掣寧願熄住扮冇嘢發生，都唔會呃你撳落去先話你知唔得。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Resetting every setting                                           */
    /* ---------------------------------------------------------------- */

    /*
     * The one irreversible action in this menu. Four facts survive level 5 in both
     * languages: it is *every* saved BlueMap setting, it is *this browser* rather than the
     * account or the server, the page reloads afterwards, and it cannot be undone. Drop any
     * one of them and the reader is agreeing to something other than what happens.
     */
    "resetAllSettings.warning": {
        en: [
            "This clears every saved BlueMap setting in this browser and reloads the page. It cannot be undone.",
            "This clears every saved BlueMap setting in this browser and reloads the page. It cannot be undone.",
            "This clears every saved BlueMap setting in this browser, then reloads the page. It cannot be undone.",
            "This clears every saved BlueMap setting in this browser, then reloads the page. It cannot be undone, so the settings do not come back.",
            "This clears every saved BlueMap setting in this browser, then reloads the page. It cannot be undone, and no amount of asking nicely afterwards brings the settings back.",
        ],
        yue: [
            "呢個動作會清走呢個瀏覽器入面所有已儲存嘅 BlueMap 設定，然後重新載入個頁面。冇得復原。",
            "呢個動作會清走呢個瀏覽器入面所有已儲存嘅 BlueMap 設定，然後重新載入個頁面。冇得復原。",
            "呢個動作會清走呢個瀏覽器入面所有已儲存嘅 BlueMap 設定，跟住重新載入個頁面。冇得復原。",
            "呢個動作會清走呢個瀏覽器入面所有已儲存嘅 BlueMap 設定，跟住重新載入個頁面。冇得復原，啲設定唔會返嚟。",
            "呢個動作會清走呢個瀏覽器入面所有已儲存嘅 BlueMap 設定，跟住重新載入個頁面。冇得復原，之後你點求都好，啲設定都唔會返嚟。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const MENU_FIXED = {
    /* The Maps page's own list of renders this computer has made. Kept apart from the map
     * list above it, so the two headings have to say which is which. */
    "maps.rendered": { en: "Rendered on this computer", yue: "喺呢部電腦 render 過" },
    "maps.noneLoadedButRendered": {
        en: "No map is open. The renders this computer has made are below.",
        yue: "而家冇開住地圖。呢部電腦 render 過嘅喺下面。",
    },
    /* The About page. */
    "info.logoAlt": { en: "The BlueMap logo", yue: "BlueMap 標誌" },
    /* Product name and version number, both identifiers, so the string is the same either
     * side of the language switch. */
    "info.appVersion": { en: "{name} {version}", yue: "{name} {version}" },
    "info.changelog": {
        en: "Changelog, every released version",
        yue: "更新日誌，每一個已發佈版本",
    },

    /* The search bar shared by the maps menu and the settings menu. */
    "search.button": { en: "Search", yue: "搜尋" },
    "search.summary": { en: "{shown} of {total}", yue: "{total} 之中嘅 {shown}" },
    "search.tooltip": { en: "Show or hide the search field", yue: "顯示或者收埋搜尋欄" },

    /* The regex builder: its two entry points from a search field. */
    "regexBuilder.toggle": { en: "Use a regular expression", yue: "用正則表達式" },
    "regexBuilder.open": { en: "Open the regex builder", yue: "開 regex 產生器" },

    /* The builder itself. */
    "regexBuilder.title": { en: "Regex builder", yue: "Regex 產生器" },
    "regexBuilder.pattern": { en: "Pattern", yue: "Pattern" },
    "regexBuilder.flags": { en: "Flags", yue: "Flags" },
    "regexBuilder.sample": { en: "Sample text", yue: "示範文字" },
    "regexBuilder.escape": { en: "Escape selection", yue: "Escape 選取咗嘅文字" },
    "regexBuilder.namedGroups": { en: "Named groups", yue: "具名擷取組" },

    /* Guided construction, one group of buttons per construct. */
    "regexBuilder.group.literals": { en: "Literals", yue: "字面字元" },
    "regexBuilder.group.classes": { en: "Character classes", yue: "字元類別" },
    "regexBuilder.group.anchors": { en: "Anchors", yue: "錨點" },
    "regexBuilder.group.groups": { en: "Groups", yue: "擷取組" },
    "regexBuilder.group.alternation": { en: "Alternation", yue: "交替選擇" },
    "regexBuilder.group.quantifiers": { en: "Quantifiers", yue: "數量詞" },

    /*
     * Three readouts that all mean "there are fewer results here than the pattern really
     * found", and each names its own reason. A shared "(stopped)" would leave a reader
     * unable to tell a bounded run from a runaway one.
     */
    "regexBuilder.matchCount": {
        en: "{count} matches in the sample",
        yue: "示範文字入面有 {count} 個 match",
    },
    "regexBuilder.truncated": { en: "(stopped at {max})", yue: "（數到 {max} 就停咗）" },
    "regexBuilder.timedOut": {
        en: "(stopped: pattern is too slow)",
        yue: "（停咗：個 pattern 太慢）",
    },
    "regexBuilder.empty": { en: "(empty match)", yue: "（空嘅 match）" },

    /* Copy out of the builder. */
    "regexBuilder.copyPattern": { en: "Copy pattern", yue: "複製 pattern" },
    "regexBuilder.copyFlags": { en: "Copy flags", yue: "複製 flags" },
    "regexBuilder.copied": { en: "Copied {what}", yue: "已複製 {what}" },
    "regexBuilder.copyFailed": { en: "Could not reach the clipboard", yue: "去唔到剪貼簿" },

    /* The side sheet's own chrome. */
    "menu.back": { en: "Back", yue: "返上一頁" },
    "menu.close": { en: "Close the menu", yue: "閂咗個選單" },

    /* The confirmation slider's `aria-valuetext`, read out as the handle travels. It is a
     * position, not a percentage of anything destroyed. */
    "superConfirm.travel": {
        en: "{percent} percent of the way across",
        yue: "已經行咗全程嘅 {percent} 個百分比",
    },
} as const satisfies Record<string, FixedString>;

export const MENU_FACTS = {
    // The reason, and that it is a version this build failed to produce.
    "info.appVersionFailed": { en: ["{reason}", "version"], yue: ["{reason}", "版本號"] },

    // The instant itself, and that it describes the build rather than anything else.
    "info.builtAt": { en: ["{timestamp}", "uilt"], yue: ["{timestamp}", "整"] },

    // That there is no recorded time, so no level can imply there is one.
    "info.builtAtUnknown": { en: ["not record"], yue: ["冇記低"] },

    // That it is not installed here, which is the whole point of the line.
    "info.hosted": { en: ["container"], yue: ["container"] },

    // That there is no password, and what that means for whoever else can reach it.
    "info.hostedOpen": { en: ["No password", "full access"], yue: ["冇密碼"] },

    // The folder list itself.
    "info.hostedFolders": { en: ["{folders}"], yue: ["{folders}"] },

    // That there are none, which must not read as a general statement about folders.
    "info.hostedNoFolders": { en: ["No folders"], yue: ["冇 mount"] },

    "search.noMatch": { en: ["matches that search"], yue: ["符合嗰個搜尋"] },

    // Dialect, locality and the escape rule: the three things the line exists to say.
    "regexBuilder.engine": {
        en: ["ECMAScript RegExp", "locally", "backslash"],
        yue: ["ECMAScript RegExp", "本機", "backslash"],
    },
    "regexBuilder.noPattern": { en: ["No pattern yet"], yue: ["仲未有 pattern"] },
    "regexBuilder.invalid": {
        en: ["not valid", "nothing matches"],
        yue: ["唔正確", "冇嘢 match 到"],
    },

    // That fullscreen is unavailable, and that it is the browser's doing rather than a
    // broken button.
    "goFullscreen.unavailable": {
        en: ["Fullscreen", "not available", "this browser"],
        yue: ["全螢幕", "唔支援", "呢個瀏覽器"],
    },

    // Scope, medium, consequence and irreversibility, all four in all ten strings.
    "resetAllSettings.warning": {
        en: ["every saved BlueMap setting", "this browser", "reloads the page", "cannot be undone"],
        yue: ["所有已儲存嘅 BlueMap 設定", "呢個瀏覽器", "重新載入", "冇得復原"],
    },
} as const satisfies Record<
    keyof typeof MENU_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
