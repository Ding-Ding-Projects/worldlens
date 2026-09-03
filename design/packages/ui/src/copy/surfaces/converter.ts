export const CONVERTER_FIXED = {
    "converter.intro": {
        en: "Choose a source, preview the detected bytes, select a target and keep every result recoverable.",
        yue: "揀來源、預覽位元組偵測、揀目標，同埋保留每個結果方便復原。",
    },
    "converter.refresh": { en: "Refresh adapter catalog", yue: "重新整理轉換器目錄" },
    "converter.search": { en: "Search converter adapters", yue: "搜尋轉換器" },
    "converter.chooseSource": { en: "Choose source file", yue: "揀來源檔案" },
    "converter.chooseOutput": { en: "Choose output folder", yue: "揀輸出資料夾" },
} as const;
export const CONVERTER_VOICED = {
    "converter.overline": {
        en: [
            "Local file tools",
            "Local file tools, ready",
            "Local file tools, nice and tidy",
            "Local file tools, no mystery bytes",
            "Local file tools, byte buffet time",
        ],
        yue: [
            "本機檔案工具",
            "本機檔案工具，準備好喇",
            "本機檔案工具，整整齊齊",
            "本機檔案工具，唔畀位元組玩失蹤",
            "本機檔案工具，位元組自助餐開波",
        ],
    },
    "converter.title": {
        en: [
            "Convert files safely",
            "Convert files safely and clearly",
            "Convert files safely, with fewer surprises",
            "Convert files safely, while the bytes behave",
            "Convert files safely, because byte soup is not dinner",
        ],
        yue: [
            "安全咁轉換檔案",
            "安全咁轉換檔案，清清楚楚",
            "安全咁轉換檔案，少啲驚喜",
            "安全咁轉換檔案，等位元組乖乖聽話",
            "安全咁轉換檔案，位元組湯唔係晚餐",
        ],
    },
} as const;
export const CONVERTER_FACTS = {
    "converter.overline": { en: ["Local file tools"], yue: ["本機檔案工具"] },
    "converter.title": { en: ["Convert files safely"], yue: ["安全咁轉換檔案"] },
} as const satisfies Record<
    keyof typeof CONVERTER_VOICED,
    { readonly en: readonly string[]; readonly yue: readonly string[] }
>;
