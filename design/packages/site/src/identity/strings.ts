/**
 * Copy for the rename control, in English and Hong Kong Cantonese.
 *
 * This table is registered under its own `identity` namespace rather than added to
 * `settings/strings.ts`, because the rename is not a settings-surface concern that happens to
 * be rendered elsewhere — it is owned by `productIdentity.ts` and read by the shell, the
 * document title and the settings row alike. Keeping the copy beside its owner means the day
 * somebody deletes the feature there is nothing left orphaned in a shared table.
 *
 * The one genuinely load-bearing sentence here is `identity.displayNameNote`. It is the
 * disclosure the rename rule requires: a visitor who has retitled the site needs to know,
 * before they file a bug, that the report will carry the real product name rather than
 * theirs. It is therefore a plain string with no funny-level variants at all — every level
 * reads the same words, because a reader who missed that sentence files an unroutable issue
 * and a joke is not worth that.
 */

import { registerStrings, type StringTable } from "../settings/i18n.js";

export const IDENTITY_STRINGS: StringTable = {
    "identity.displayNameLabel": { en: "What this site is called", yue: "呢個網站叫咩名" },
    "identity.displayNameDesc": {
        en: {
            1: "The name shown in the side rail, the browser tab and the About line. Changing it changes the label only.",
            3: "The name in the side rail, the browser tab and the About line. It is a label: changing it changes nothing else.",
            5: "Rename the place. The side rail, the browser tab and the About line all follow along. It is only a label, so nothing underneath moves an inch.",
        },
        yue: {
            1: "側欄、瀏覽器分頁同關於欄顯示嘅名。改佢淨係改個標籤。",
            3: "側欄、瀏覽器分頁同關於欄嘅名。呢個係標籤嚟：改咗都唔會影響其他嘢。",
            5: "想改個名就改啦。側欄、分頁、關於欄都會跟住改。純粹係個標籤，底下啲嘢一寸都唔會郁。",
        },
    },
    "identity.displayNamePlaceholder": { en: "worldlens", yue: "worldlens" },
    "identity.displayNameNote": {
        en: "Renaming changes the display name only. Your stored settings, this browser's storage and the published address are untouched. Anywhere the real product has to be identified — a bug report, a diagnostic line — still says worldlens, so whoever reads it knows which software you mean.",
        yue: "改名淨係改顯示嘅名。你儲低嘅設定、瀏覽器儲存同埋網站地址都唔會變。凡係要認得出係邊個產品嘅地方——例如報 bug、診斷訊息——一律仍然寫 worldlens，等睇嘅人知你講緊邊個軟件。",
    },
    "identity.displayNameReset": { en: "Use the shipped name", yue: "用返原本個名" },
    "identity.provenanceShipped": {
        en: "Source: no chosen name, so the shipped name worldlens is in force.",
        yue: "來源：未改過名，所以用緊出廠個名 worldlens。",
    },
    "identity.provenanceChosen": {
        en: "Source: a name you chose, stored in this browser.",
        yue: "來源：你自己改嘅名，存喺呢個瀏覽器。",
    },
};

registerStrings("identity", IDENTITY_STRINGS);
