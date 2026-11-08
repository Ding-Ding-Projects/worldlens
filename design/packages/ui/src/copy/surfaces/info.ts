/**
 * Every word the per-control information button adds around a guide, in English and Cantonese.
 */

import type { FixedString } from "../../components/setup/setupStrings.js";

export const INFO_FIXED = {
    "info.choices": { en: "Choices", yue: "選擇" },
    "info.default": { en: "Default", yue: "預設" },
    "info.effect": { en: "What changing it does", yue: "改咗會點" },
    "info.example": { en: "Example", yue: "例子" },
    "info.validation": { en: "What is checked", yue: "會檢查乜" },
    "info.recovery": { en: "If something goes wrong", yue: "出事點算" },
    "info.about": { en: "About {control}", yue: "關於 {control}" },
    "info.tryIt": { en: "Try it", yue: "試吓" },
    "info.reset": { en: "Reset to default", yue: "還原預設" },
    "info.close": { en: "Close", yue: "關閉" },
} as const satisfies Record<string, FixedString>;
