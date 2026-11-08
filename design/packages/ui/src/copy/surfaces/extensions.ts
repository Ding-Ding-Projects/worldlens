/**
 * Every word the extension manager puts on screen, in English and Cantonese. Extension names,
 * descriptions and command titles come from their manifests and are shown as written.
 */

import type { FixedString } from "../../components/setup/setupStrings.js";

export const EXTENSIONS_FIXED = {
    "extensions.needMap": { en: "Open a map first: this command reads the open map.", yue: "先開一張地圖:呢個指令要讀開住嘅地圖。" },
    "extensions.noBridge": { en: "Extensions run in the desktop app, as programs on your computer.", yue: "擴充功能喺桌面版行,係你電腦上面嘅程式。" },
    "extensions.search": { en: "Search extensions, commands and permissions", yue: "搵擴充功能、指令同權限" },
    "extensions.import": { en: "Add an extension folder", yue: "加一個擴充功能資料夾" },
    "extensions.openFolder": { en: "Open the extensions folder", yue: "打開擴充功能資料夾" },
    "extensions.refresh": { en: "Look again", yue: "再搵一次" },
    "extensions.noMatch": { en: "No extension matches this search.", yue: "冇擴充功能夾到呢個搜尋。" },
    "extensions.builtIn": { en: "Built in", yue: "內置" },
    "extensions.added": { en: "Added by you", yue: "你加嘅" },
    "extensions.on": { en: "On", yue: "開" },
    "extensions.off": { en: "Off", yue: "閂" },
    "extensions.problems": { en: "This extension cannot run until its manifest is fixed:", yue: "要先修好佢個 manifest 先行得:" },
    "extensions.consentNeeded": { en: "Its permissions are new or changed, so it is off until you agree to them.", yue: "佢嘅權限係新嘅或者改過,所以你同意之前會閂住。" },
    "extensions.consentTitle": { en: "Agree to these permissions?", yue: "同意呢啲權限?" },
    "extensions.consentBody": { en: "It runs as a program on this computer with your rights, one request at a time, and is stopped at its limits. It receives only what is listed here; no passwords, tokens or other files.", yue: "佢會用你嘅權限喺呢部電腦行一個程式,一次一個要求,超出限制就會被停。佢只會收到下面列出嘅嘢,唔會收到密碼、權杖或者其他檔案。" },
    "extensions.noPermissions": { en: "No permissions: it receives no map data.", yue: "冇權限:佢唔會收到任何地圖資料。" },
    "extensions.agree": { en: "Agree and turn on", yue: "同意並打開" },
    "extensions.cancel": { en: "Not now", yue: "遲啲先" },
    "extensions.permissions": { en: "Permissions", yue: "權限" },
    "extensions.limits": { en: "Stopped after {seconds} s or {kb} KB of output.", yue: "行咗 {seconds} 秒或者輸出 {kb} KB 就會被停。" },
    "extensions.offReason": { en: "Turn it on to run its commands.", yue: "打開佢先可以行佢嘅指令。" },
    "extensions.save": { en: "Save {name}", yue: "儲存 {name}" },
} as const satisfies Record<string, FixedString>;
