export const CONVERTER_FIXED = {
    "converter.overline": { en: "Local file tools", yue: "本機檔案工具" },
    "converter.title": { en: "Convert files safely", yue: "安全咁轉換檔案" },
    "converter.intro": { en: "Choose a source, preview the detected bytes, select a target and keep every result recoverable.", yue: "揀來源、預覽位元組偵測、揀目標，同埋保留每個結果方便復原。" },
    "converter.refresh": { en: "Refresh adapter catalog", yue: "重新整理轉換器目錄" },
    "converter.search": { en: "Search converter adapters", yue: "搜尋轉換器" },
    "converter.chooseSource": { en: "Choose source file", yue: "揀來源檔案" },
    "converter.chooseOutput": { en: "Choose output folder", yue: "揀輸出資料夾" },
} as const;
export const CONVERTER_VOICED = {
    "converter.overline": { en: ["Local file tools"], yue: ["本機檔案工具"] },
    "converter.title": { en: ["Convert files safely"], yue: ["安全咁轉換檔案"] },
} as const;
export const CONVERTER_FACTS = {
    "converter.overline": { en: ["Local file tools"], yue: ["本機檔案工具"] },
    "converter.title": { en: ["Convert files safely"], yue: ["安全咁轉換檔案"] },
} as const satisfies Record<keyof typeof CONVERTER_VOICED, { readonly en: readonly string[]; readonly yue: readonly string[] }>;
