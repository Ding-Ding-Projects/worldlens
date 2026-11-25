/**
 * Every word the quick entry beside a Settings pointer says, in English and Cantonese.
 *
 * The folder entry also reuses the `settings.storage.*` keys the Settings row owns (field
 * label, save, use the default, the two refusals and the saved message), with identical
 * wording, so the two places can never describe the same value differently.
 */

import type { FixedString } from "../../components/setup/setupStrings.js";

export const QUICKADD_FIXED = {
    "settings.quickAdd.folder.title": { en: "Set the folder right here", yue: "喺呢度直接設定資料夾" },
    "settings.quickAdd.folder.unchanged": {
        en: "Change the folder above to save it.",
        yue: "先改上面個資料夾，先可以儲存。",
    },
    "settings.quickAdd.consent.title": { en: "Accept the download right here", yue: "喺呢度直接接受下載" },
    "settings.quickAdd.consent.done": {
        en: "Already accepted. Nothing more to do here.",
        yue: "已經接受咗，呢度唔使再做嘢。",
    },
    "settings.quickAdd.consent.saved": {
        en: "Accepted. The Minecraft client download can go ahead.",
        yue: "已接受。Minecraft 客戶端可以開始下載。",
    },
    "settings.quickAdd.consent.unavailable": {
        en: "This build cannot record the answer. Accept it from the desktop app's Settings.",
        yue: "呢個版本記錄唔到答案，請喺桌面程式嘅設定入面接受。",
    },
} as const satisfies Record<string, FixedString>;
