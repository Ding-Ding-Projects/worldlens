/**
 * Every word the provider text renderer adds around release notes and similar text, in English
 * and Cantonese. The provider's own words are shown as written.
 */

import type { FixedString } from "../../components/setup/setupStrings.js";

export const PROVIDERTEXT_FIXED = {
    "providerText.empty": { en: "No notes were provided.", yue: "冇提供說明。" },
    "providerText.image": { en: "Image: {alt}", yue: "圖片：{alt}" },
    "providerText.imageNoAlt": { en: "no description", yue: "冇描述" },
    "providerText.code": { en: "{language} code", yue: "{language} 程式碼" },
    "providerText.done": { en: "done", yue: "已完成" },
    "providerText.notDone": { en: "not done", yue: "未完成" },
} as const satisfies Record<string, FixedString>;
