import {
    type ViewerLanguageMode,
    type ViewerPresentationAdapter,
    type ViewerPresentationLanguage,
} from "./presentationPolicy";

/** Values carried by a factual rendered sentence, never interpolated as HTML. */
export type MaterialShellCopyValues = Readonly<Record<string, string | number>>;

type Copy = string | readonly [string, string, string, string, string];

/**
 * The served map owns a small fallback catalogue so a plain BlueMap deployment does not need the
 * desktop package to speak English, Cantonese, or both.  A host may replace individual entries
 * through the framework-neutral viewer i18n adapter; the fallback remains the standalone route.
 */
const EN = {
    mapNavigation: "Map navigation",
    openMapMenu: [
        "Open map menu",
        "Open map menu",
        "Open map menu",
        "Open map menu, neatly",
        "Open map menu, map mission control awaits",
    ],
    materialMapServer: [
        "Material map server",
        "Material map server",
        "Material map server, ready to explore",
        "Material map server, maps behaving nicely",
        "Material map server, map magic on standby",
    ],
    searchMapControls: "Search map controls",
    searchControlsPlaceholder: "Search controls…",
    regexSearch: "Search with a regular expression",
    regexPlainSearch: "Search plain text instead of a regular expression",
    openMapRegexBuilder: "Open the regex builder for map controls",
    currentMapCoordinates: "Current map coordinates",
    mapControlSearchResults: "Map control search results",
    coordinateUnavailable: "Current {axis} coordinate: unavailable",
    currentCoordinate: "Current {axis} coordinate: {value}",
    openSettings: [
        "Open settings",
        "Open settings",
        "Open settings",
        "Open settings, neatly",
        "Open settings, let the map have a little polish",
    ],
    closeSettings: "Close settings",
    openCommandPalette: "Open command palette",
    terrainActions: "Terrain actions",
    savedPinpoints: "Saved pinpoints",
    addPinpoint: "Add pinpoint here",
    copyCoordinates: "Copy coordinates",
    cancel: "Cancel",
    mapMenu: "Map menu",
    closeMapMenu: "Close map menu",
    mapAppearance: "Map appearance",
    notificationHistory: "Notification history",
    closeNotificationHistory: "Close notification history",
    noNotificationsRecorded: "No notifications have been recorded yet.",
    alert: "Alert",
    notice: "Notice",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    contrast: "Contrast",
    density: "Density",
    densityDescription: "Controls spacing without changing map data.",
    languageTone: "Language and tone",
    languageMode: "Language mode",
    languageEnglish: "English",
    languageYue: "Cantonese",
    languageBilingual: "Bilingual",
    funnyEn: "Funny level, English",
    funnyYue: "Funny level, Cantonese",
    funnyLevelValue: "Level {level}",
    funnyDescription: [
        "Styles visible copy, labels, and messages; facts stay exact.",
        "Styles visible copy, labels, and messages; facts stay exact.",
        "Styles visible copy, labels, and messages; facts stay exact.",
        "Styles visible copy, labels, and messages; the facts still keep both shoes on.",
        "Styles visible copy, labels, and messages; facts remain exact while the map gets silly.",
    ],
    commandPalette: "Command palette",
    closeCommandPalette: "Close command palette",
    commandPaletteDescription:
        "Type a map command, then choose the real control to run. Ctrl+Shift+F opens this palette.",
    searchCommands: "Search commands",
    searchCommandsPlaceholder: "Search commands…",
    searchCommandsRegex: "Search commands with a regular expression",
    openCommandRegexBuilder: "Open the regex builder for commands",
    commandResults: "Command results",
    regexBuilder: "Regex builder",
    regexBuilderDescription:
        "ECMAScript RegExp runs locally against this search. Pattern {patternLimit} characters; sample {sampleLimit} characters.",
    pattern: "Pattern",
    flags: "Flags",
    buildPattern: "Build pattern",
    characterClass: "Character class",
    startAnchor: "Start anchor",
    capturingGroup: "Capturing group",
    alternation: "Alternation",
    oneOrMore: "One or more",
    escapeLiteral: "Escape literal",
    sampleText: "Sample text",
    copyPattern: "Copy pattern",
    exportPattern: "Export pattern",
    close: "Close",
    patternError: "Pattern error: {error}",
    noPatternYet: "No pattern yet. Plain-text search remains the default.",
    liveMatches: "{count} live {matchWord}.",
    liveMatch: "match",
    liveMatchesPlural: "matches",
    sampleLimited: "Sample limited to {limit} characters.",
    controlsMatchRegex: "{count} {controlWord} match this regular expression.",
    controlsMatchPlain: "{count} {controlWord} match this plain-text search.",
    control: "control",
    controls: "controls",
    clipboardUnavailable: "Clipboard access is unavailable in this browser.",
    patternCopied: "Pattern copied.",
    patternCopyFailed: "Could not copy the pattern.",
    exportUnavailable: "Download export is unavailable in this browser.",
    exportStarted: "Pattern export started.",
    actionMapMenu: "Open map menu",
    actionMapMenuKeywords: "navigation control layers markers map",
    actionAppearance: "Open map appearance",
    actionAppearanceKeywords: "settings theme light dark contrast density",
    actionPalette: "Open command palette",
    actionPaletteKeywords: "commands keyboard Ctrl Shift F",
    actionMapSearch: "Focus map control search",
    actionMapSearchKeywords: "find search controls regex",
    actionNotifications: "Open notification history",
    actionNotificationsKeywords: "bell alerts messages status activity",
    noTerrain: [
        "No terrain at that point; move over a loaded map tile first.",
        "No terrain at that point; move over a loaded map tile first.",
        "No terrain at that point; move over a loaded map tile first.",
        "No terrain at that point; move over a loaded map tile first, then the map can help.",
        "No terrain at that point; move over a loaded map tile first — the map cannot conjure a tile yet.",
    ],
    coordinatesCopied: "Coordinates copied: {coordinates}",
    pinpoint: "Pinpoint {count}",
    pinSaved: "{label} saved at {x}, {y}, {z}.",
    externalAlert: "{message}",
    notificationBellEmpty: "Notification history. No recorded notifications.",
    notificationBellCount: "Notification history. {count} recorded, {unread} unread.",
    notificationMeta: "{kind} · {time}",
} as const satisfies Record<string, Copy>;

type MaterialShellCopyKey = keyof typeof EN;

const YUE: Record<MaterialShellCopyKey, Copy> = {
    mapNavigation: "地圖導覽",
    openMapMenu: [
        "開啟地圖選單",
        "開啟地圖選單",
        "開啟地圖選單",
        "開啟地圖選單，整整齊齊",
        "開啟地圖選單，地圖指揮中心等緊你",
    ],
    materialMapServer: [
        "Material 地圖伺服器",
        "Material 地圖伺服器",
        "Material 地圖伺服器，準備好探索",
        "Material 地圖伺服器，幅地圖乖乖地",
        "Material 地圖伺服器，地圖魔法候命",
    ],
    searchMapControls: "搜尋地圖控制",
    searchControlsPlaceholder: "搜尋控制…",
    regexSearch: "用正規表示式搜尋",
    regexPlainSearch: "改用普通文字搜尋",
    openMapRegexBuilder: "開啟地圖控制嘅正規表示式工具",
    currentMapCoordinates: "而家地圖座標",
    mapControlSearchResults: "地圖控制搜尋結果",
    coordinateUnavailable: "而家 {axis} 座標：未有",
    currentCoordinate: "而家 {axis} 座標：{value}",
    openSettings: [
        "開啟設定",
        "開啟設定",
        "開啟設定",
        "開啟設定，整整齊齊",
        "開啟設定，幫幅地圖執一執靚",
    ],
    closeSettings: "關閉設定",
    openCommandPalette: "開啟指令面板",
    terrainActions: "地形操作",
    savedPinpoints: "已儲存定位點",
    addPinpoint: "喺呢度加定位點",
    copyCoordinates: "複製座標",
    cancel: "取消",
    mapMenu: "地圖選單",
    closeMapMenu: "關閉地圖選單",
    mapAppearance: "地圖外觀",
    notificationHistory: "通知紀錄",
    closeNotificationHistory: "關閉通知紀錄",
    noNotificationsRecorded: "未有通知紀錄。",
    alert: "提示",
    notice: "通知",
    theme: "主題",
    light: "淺色",
    dark: "深色",
    contrast: "高對比",
    density: "密度",
    densityDescription: "只會改控制項間距，唔會改地圖資料。",
    languageTone: "語言同語氣",
    languageMode: "語言模式",
    languageEnglish: "英文",
    languageYue: "廣東話",
    languageBilingual: "雙語",
    funnyEn: "搞笑程度（英文）",
    funnyYue: "搞笑程度（廣東話）",
    funnyLevelValue: "第 {level} 級",
    funnyDescription: [
        "會改可見文字、標籤同訊息；事實照舊準確。",
        "會改可見文字、標籤同訊息；事實照舊準確。",
        "會改可見文字、標籤同訊息；事實照舊準確。",
        "會改可見文字、標籤同訊息；事實照舊穿返對鞋。",
        "會改可見文字、標籤同訊息；幅地圖可以玩啲，但事實唔會亂嚟。",
    ],
    commandPalette: "指令面板",
    closeCommandPalette: "關閉指令面板",
    commandPaletteDescription: "輸入地圖指令，再揀真正要做嘅控制。Ctrl+Shift+F 會開呢個面板。",
    searchCommands: "搜尋指令",
    searchCommandsPlaceholder: "搜尋指令…",
    searchCommandsRegex: "用正規表示式搜尋指令",
    openCommandRegexBuilder: "開啟指令嘅正規表示式工具",
    commandResults: "指令結果",
    regexBuilder: "正規表示式工具",
    regexBuilderDescription:
        "ECMAScript RegExp 會喺本機幫呢個搜尋運行。模式 {patternLimit} 個字元；樣本文字 {sampleLimit} 個字元。",
    pattern: "模式",
    flags: "旗標",
    buildPattern: "砌模式",
    characterClass: "字元類別",
    startAnchor: "開頭錨點",
    capturingGroup: "擷取群組",
    alternation: "分支",
    oneOrMore: "一個或以上",
    escapeLiteral: "跳脫文字",
    sampleText: "樣本文字",
    copyPattern: "複製模式",
    exportPattern: "匯出模式",
    close: "關閉",
    patternError: "模式錯誤：{error}",
    noPatternYet: "未有模式；預設仲係普通文字搜尋。",
    liveMatches: "即時搵到 {count} 個{matchWord}。",
    liveMatch: "結果",
    liveMatchesPlural: "結果",
    sampleLimited: "樣本文字限制咗 {limit} 個字元。",
    controlsMatchRegex: "{count} 個{controlWord}配合呢條正規表示式。",
    controlsMatchPlain: "{count} 個{controlWord}配合呢個普通文字搜尋。",
    control: "控制",
    controls: "控制",
    clipboardUnavailable: "呢個瀏覽器未畀剪貼簿使用權。",
    patternCopied: "模式已複製。",
    patternCopyFailed: "複製模式唔成功。",
    exportUnavailable: "呢個瀏覽器未提供下載匯出。",
    exportStarted: "已開始匯出模式。",
    actionMapMenu: "開啟地圖選單",
    actionMapMenuKeywords: "導覽 控制 圖層 標記 地圖",
    actionAppearance: "開啟地圖外觀",
    actionAppearanceKeywords: "設定 主題 淺色 深色 高對比 密度",
    actionPalette: "開啟指令面板",
    actionPaletteKeywords: "指令 鍵盤 Ctrl Shift F",
    actionMapSearch: "聚焦地圖控制搜尋",
    actionMapSearchKeywords: "搵 搜尋 控制 正規表示式",
    actionNotifications: "開啟通知紀錄",
    actionNotificationsKeywords: "鐘 提示 訊息 狀態 活動",
    noTerrain: [
        "嗰個位置未有地形；請先移去已載入嘅地圖磚。",
        "嗰個位置未有地形；請先移去已載入嘅地圖磚。",
        "嗰個位置未有地形；請先移去已載入嘅地圖磚。",
        "嗰個位置未有地形；請先移去已載入嘅地圖磚，幅地圖先幫到手。",
        "嗰個位置未有地形；請先移去已載入嘅地圖磚——未有磚，地圖都變唔出嚟。",
    ],
    coordinatesCopied: "已複製座標：{coordinates}",
    pinpoint: "定位點 {count}",
    pinSaved: "{label} 已儲存喺 {x}、{y}、{z}。",
    externalAlert: "{message}",
    notificationBellEmpty: "通知紀錄。未有已記錄通知。",
    notificationBellCount: "通知紀錄。已記錄 {count} 個，未讀 {unread} 個。",
    notificationMeta: "{kind} · {time}",
};

function clampFunnyLevel(level: number): 1 | 2 | 3 | 4 | 5 {
    if (!Number.isFinite(level)) return 2;
    return Math.max(1, Math.min(5, Math.round(level))) as 1 | 2 | 3 | 4 | 5;
}

function interpolate(copy: string, values: MaterialShellCopyValues): string {
    return copy.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) => {
        const value = values[name];
        return value === undefined ? placeholder : String(value);
    });
}

function localCopy(
    key: MaterialShellCopyKey,
    language: ViewerPresentationLanguage,
    funnyLevel: number,
    values: MaterialShellCopyValues,
): string {
    const entry = (language === "en" ? EN : YUE)[key];
    const copy = Array.isArray(entry) ? entry[clampFunnyLevel(funnyLevel) - 1] : entry;
    return interpolate(copy, values);
}

/**
 * Composes one safe text value for visible copy and ARIA names.
 *
 * Bilingual output deliberately keeps English first, then Cantonese, matching the desktop
 * presentation contract while remaining useful to controls that only accept one text node.
 */
export function materialShellCopy(
    key: MaterialShellCopyKey,
    mode: ViewerLanguageMode,
    funnyLevels: Readonly<Record<ViewerPresentationLanguage, number>>,
    values: MaterialShellCopyValues = {},
    presentationAdapter?: ViewerPresentationAdapter,
): string {
    const copyFor = (language: ViewerPresentationLanguage): string => {
        const override = presentationAdapter?.copy({
            surface: "material-shell",
            key,
            language,
            funnyLevel: clampFunnyLevel(funnyLevels[language]),
            values,
        });
        return override === undefined
            ? localCopy(key, language, funnyLevels[language], values)
            : interpolate(override, values);
    };

    if (mode === "bilingual") return `${copyFor("en")} / ${copyFor("yue")}`;
    return copyFor(mode);
}

export type { MaterialShellCopyKey };
