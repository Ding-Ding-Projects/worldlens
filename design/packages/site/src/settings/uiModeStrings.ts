/**
 * Copy for the three controls that had none: dialog emoji, the renamable mode, and the
 * visitor-supplied vocabulary.
 *
 * Registered as three separate namespaces rather than folded into `settings/strings.ts`
 * because each belongs to a module that can be reached without the settings page — the
 * confirmation gate opens from anywhere, and the mode's suppression is consulted by the shell.
 * Copy living beside its owner is copy that leaves with its owner.
 *
 * Two sentences here are deliberately plain strings with no funny-level variants at all, and
 * that is not an oversight. `school.lockNote` tells a visitor that this is a user-experience
 * lock and that deleting the local record resets it; `school.reportingNote` tells them the
 * shipped name still reaches a bug report. Somebody who skims past either one relies on a
 * promise the software never made, so those two read identically at every level while the
 * framing around them varies like everything else.
 *
 * The mode's own name is interpolated as `{name}` everywhere rather than written out, because
 * after a rename the shipped words must not appear in any label, description, search result,
 * notification or accessible name. A single hardcoded "School mode" anywhere in this table
 * would defeat the rename entirely, and it would do so in a way no type checker can catch.
 */

import { registerStrings, type StringTable } from "./i18n.js";

export const DIALOG_EMOJI_STRINGS: StringTable = {
    "ui.dialogEmojiLabel": {
        en: "Show emojis in dialogs and message boxes",
        yue: "喺對話框同訊息框顯示表情符號",
    },
    "ui.dialogEmojiDesc": {
        en: {
            1: "Adds one decorative emoji to each dialog and message box. The wording is identical either way.",
            3: "Puts one decorative emoji on each dialog and message box. The words say exactly the same thing with it off.",
            5: "Sticks one emoji on every dialog and message box, purely for the vibes. Turn it off and the words are word-for-word the same — no meaning is hiding in the picture.",
        },
        yue: {
            1: "喺每個對話框同訊息框加一個裝飾表情符號。文字內容完全一樣。",
            3: "每個對話框同訊息框加一個裝飾用表情符號。閂咗都係一模一樣嘅字。",
            5: "每個對話框、訊息框加粒表情符號，純粹靚仔。閂咗之後啲字一個都冇少——意思冇匿喺個公仔度。",
        },
    },
    "ui.dialogEmojiNote": {
        en: "Buttons, labels and screen-reader names never carry an emoji, whichever way this is set.",
        yue: "無論開定閂，按鈕、標籤同讀屏名稱都唔會有表情符號。",
    },
};

export const SCHOOL_MODE_STRINGS: StringTable = {
    /**
     * The shipped name, used only while the visitor has not chosen one of their own. Every
     * other key below takes `{name}` so that a rename is total rather than partial.
     */
    "school.shippedName": { en: "School mode", yue: "校園模式" },
    "school.groupLabel": { en: "{name}", yue: "{name}" },
    "school.stateOn": { en: "{name} is on", yue: "{name} 開咗" },
    "school.stateOff": { en: "{name} is off", yue: "{name} 閂咗" },
    "school.description": {
        en: {
            1: "While {name} is on the site is English only, and the Cantonese, bilingual, tone and vocabulary features are not present.",
            3: "While {name} is on the site is English, and the Cantonese, bilingual, tone and vocabulary features are simply not there.",
            5: "Switch {name} on and the site speaks plain English: Cantonese, bilingual, the tone sliders and the vocabulary file all pack up and leave rather than sit around greyed out.",
        },
        yue: {
            1: "{name} 開咗嘅時候，網站淨係英文，廣東話、雙語、語氣同詞彙功能都唔會出現。",
            3: "{name} 開咗嘅時候，網站係英文，廣東話、雙語、語氣同詞彙功能索性唔存在。",
            5: "撳착 {name}，成個網站淨係講英文：廣東話、雙語、語氣掣同詞彙檔一律收工走人，唔會喺度灰住等你撳。",
        },
    },
    "school.renameLabel": { en: "What this mode is called", yue: "呢個模式叫咩名" },
    "school.renameDesc": {
        en: "Rename it and only your name is used anywhere on the site from then on.",
        yue: "改咗名之後，成個網站就淨係會用你嗰個名。",
    },
    "school.secretLabel": { en: "PIN or password to turn it off again", yue: "用嚟閂返佢嘅 PIN 或密碼" },
    "school.secretPlaceholder": { en: "At least one character", yue: "最少一個字元" },
    "school.turnOn": { en: "Turn on", yue: "開" },
    "school.turnOff": { en: "Turn off", yue: "閂" },
    "school.wrongSecret": {
        en: "That is not the PIN or password recorded on this browser.",
        yue: "同呢個瀏覽器記低嘅 PIN 或密碼唔啱。",
    },
    "school.needSecret": {
        en: "Enter a PIN or password first — without one there would be no way to turn this off.",
        yue: "要先入一個 PIN 或密碼——冇咗佢就冇辦法閂返。",
    },
    "school.lockNote": {
        en: "This is a user-experience lock, not a security boundary. The PIN is checked against a digest stored in this browser, and anyone who clears this browser's storage — or uses the reset below — turns the mode off without it. Do not rely on it to stop a determined person.",
        yue: "呢個係使用體驗鎖，唔係保安措施。個 PIN 只係同呢個瀏覽器入面存住嘅摘要對比，任何人清咗呢個瀏覽器嘅儲存空間——或者撳下面個重設——就唔使 PIN 都閂到。唔好當佢擋得住有心人。",
    },
    "school.reportingNote": {
        en: "Renaming this mode changes its label only. A bug report or diagnostic line still identifies the product as worldlens.",
        yue: "改呢個模式個名淨係改標籤。報 bug 或者診斷訊息一樣會寫產品係 worldlens。",
    },
    "school.resetRecord": { en: "Delete the local record", yue: "刪除本機記錄" },
    "school.resetRecordDesc": {
        en: "Forgets the name and the PIN and turns the mode off. Nothing else is affected.",
        yue: "會忘記個名同 PIN，順帶閂咗個模式。其他嘢唔會受影響。",
    },
    "school.unavailable": {
        en: "This browser cannot check a PIN on this page, so the mode cannot be armed here. It needs a secure context (HTTPS, or localhost).",
        yue: "呢個瀏覽器喺呢一頁查唔到 PIN，所以開唔到呢個模式。佢需要安全連線（HTTPS 或 localhost）。",
    },
};

export const VOCABULARY_STRINGS: StringTable = {
    "vocab.installedLabel": { en: "Your own wording", yue: "你自己嘅用詞" },
    "vocab.installedCount": {
        en: "{count} replacements are in force from the file you supplied.",
        yue: "你提供嘅檔案有 {count} 項替換生效緊。",
    },
    "vocab.remove": { en: "Remove it", yue: "移除" },
    "vocab.removeDesc": {
        en: "Returns every word on this site to its shipped wording. The file itself is not touched.",
        yue: "會將成個網站啲字還原做出廠寫法。你部機嗰個檔案唔會郁到。",
    },
    "vocab.note": {
        en: "The file is held in this browser only. It is never included in a settings export, never sent anywhere, and commands, addresses, file paths and code are always left exactly as written.",
        yue: "個檔案淨係留喺呢個瀏覽器。永遠唔會夾埋喺設定匯出入面，唔會寄去任何地方；指令、網址、檔案路徑同程式碼一律原封不動。",
    },
    "vocab.refused.too-large": {
        en: "That file is too large to read safely. Trim it and try again.",
        yue: "個檔案太大，讀唔安全。剪短啲再試。",
    },
    "vocab.refused.not-json": {
        en: "That file is not valid JSON, so nothing was changed.",
        yue: "個檔案唔係有效 JSON，所以冇改過任何嘢。",
    },
    "vocab.refused.wrong-shape": {
        en: "That file is valid JSON but not in the shape this site accepts, so nothing was changed.",
        yue: "個檔案係有效 JSON，但唔係呢個網站接受嘅格式，所以冇改過任何嘢。",
    },
    "vocab.refused.empty": { en: "That file contains no replacements.", yue: "個檔案冇任何替換項。" },
    "vocab.refused.too-many": {
        en: "That file contains more replacements than this site will apply.",
        yue: "個檔案嘅替換項多過呢個網站會套用嘅數量。",
    },
};

registerStrings("ui", DIALOG_EMOJI_STRINGS);
registerStrings("school", SCHOOL_MODE_STRINGS);
registerStrings("vocab", VOCABULARY_STRINGS);
