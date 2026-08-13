/**
 * The app-logo customization row: picking one of the shipped presets or a local file, the
 * crop/fit/focal-point/background choices that go with it, and the states the row can be
 * in - no custom logo, loading, just-rejected, converted-and-active, and reset.
 *
 * The section's own title and description live beside every other section heading in
 * `settings.ts`, next to `settings.updates.title`, exactly the way `settings.vocabulary.*`
 * already does - one place a section title is written, not two. What lives here is the row's
 * own prose: the status sentence describing what is active right now, the notice shown
 * before a lossy conversion applies, and the plain-language reason for each rejection.
 *
 * Every level of every status sentence keeps the same facts regardless of how playfully it
 * says them: which mark is active (shipped or custom, and its format/size when custom), that
 * a rejected file changes nothing already on screen, and that a reset restores every choice
 * to its own shipped default. Those are pinned in `APPLOGO_FACTS` rather than left to survive
 * a rewrite by luck.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const APPLOGO_VOICED = {
    "appLogo.status.usingShipped": {
        en: [
            "Using the shipped mark. No custom logo is active.",
            "Using the shipped mark. No custom logo is active.",
            "Using the shipped mark right now. No custom logo is active.",
            "Using the shipped mark right now, plain and simple. No custom logo is active.",
            "Using the shipped mark right now, plain and simple, no fuss. No custom logo is active - yet.",
        ],
        yue: [
            "而家用緊出廠標記,未揀自訂 logo。",
            "而家用緊出廠標記,未揀自訂 logo。",
            "而家用緊出廠標記,重未揀自訂 logo。",
            "而家用緊出廠標記,好簡單好清楚,重未揀自訂 logo。",
            "而家用緊出廠標記,簡簡單單冇花巧,重未揀自訂 logo,遲吓先講。",
        ],
    },
    "appLogo.status.usingCustom": {
        en: [
            "Using your custom mark: {format}, {width}x{height}.",
            "Using your custom mark: {format}, {width}x{height}.",
            "Using your custom mark right now: {format}, {width}x{height}.",
            "Using your custom mark right now, and it looks sharp: {format}, {width}x{height}.",
            "Using your custom mark right now, looking sharp as anything: {format}, {width}x{height}.",
        ],
        yue: [
            "而家用緊你自己個 custom 標記:{format},{width}x{height}。",
            "而家用緊你自己個 custom 標記:{format},{width}x{height}。",
            "而家用緊你自己個 custom 標記:{format},{width}x{height}。",
            "而家用緊你自己個 custom 標記,幾靚仔:{format},{width}x{height}。",
            "而家用緊你自己個 custom 標記,靚到冇朋友:{format},{width}x{height}。",
        ],
    },
    "appLogo.status.invalid": {
        en: [
            "That file was not applied: {reason} The mark already active was not changed.",
            "That file was not applied: {reason} The mark already active was not changed.",
            "That file was not applied: {reason} The mark already active was not changed.",
            "That file was not applied, turned away at the door: {reason} The mark already active was not changed.",
            "That file was not applied, stopped right at the door: {reason} The mark already active was not changed, not even a pixel.",
        ],
        yue: [
            "呢個檔案冇被採用:{reason} 而家生效緊嘅標記冇變過。",
            "呢個檔案冇被採用:{reason} 而家生效緊嘅標記冇變過。",
            "呢個檔案冇被採用:{reason} 而家生效緊嘅標記冇變過。",
            "呢個檔案冇被採用,喺門口就俾人截返轉頭:{reason} 而家生效緊嘅標記冇變過。",
            "呢個檔案冇被採用,喺門口就俾人截返轉頭:{reason} 而家生效緊嘅標記連一個像素都冇變過。",
        ],
    },
    "appLogo.status.conversionNotice": {
        en: [
            "Before this applies: {detail}",
            "Before this applies: {detail}",
            "Before this applies, one thing to know: {detail}",
            "Before this applies, worth knowing: {detail}",
            "Before this applies, heads up: {detail}",
        ],
        yue: [
            "套用之前:{detail}",
            "套用之前:{detail}",
            "套用之前,有一件事要講先:{detail}",
            "套用之前,有樣嘢想你知道:{detail}",
            "套用之前,提你一句:{detail}",
        ],
    },
    "appLogo.status.resetDone": {
        en: [
            "Reset to the shipped mark. Every crop, fit and background choice is back to its own default.",
            "Reset to the shipped mark. Every crop, fit and background choice is back to its own default.",
            "Reset to the shipped mark. Every crop, fit and background choice is back to its own default.",
            "Reset to the shipped mark, clean slate. Every crop, fit and background choice is back to its own default.",
            "Reset to the shipped mark, wiped clean and back to day one. Every crop, fit and background choice is back to its own default.",
        ],
        yue: [
            "已經返去出廠標記。每一個裁切、填滿同背景選擇都返去自己嘅預設值。",
            "已經返去出廠標記。每一個裁切、填滿同背景選擇都返去自己嘅預設值。",
            "已經返去出廠標記。每一個裁切、填滿同背景選擇都返去自己嘅預設值。",
            "已經返去出廠標記,乾乾淨淨。每一個裁切、填滿同背景選擇都返去自己嘅預設值。",
            "已經返去出廠標記,返晒去第一日嗰陣。每一個裁切、填滿同背景選擇都返去自己嘅預設值。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const APPLOGO_FIXED = {
    "appLogo.picker.chooseFile": { en: "Choose a logo file...", yue: "揀一個 logo 檔案…" },
    "appLogo.picker.replaceFile": { en: "Replace the logo file...", yue: "換一個 logo 檔案…" },
    "appLogo.picker.fileInputLabel": { en: "Custom app logo image file", yue: "自訂應用程式 logo 圖檔" },

    "appLogo.preset.groupLabel": { en: "Shipped presets", yue: "出廠預設款式" },
    "appLogo.preset.square": { en: "Shipped mark (square)", yue: "出廠標記 (正方形)" },
    "appLogo.preset.circleLarge": { en: "Shipped mark (circle, large)", yue: "出廠標記 (圓形,大)" },
    "appLogo.preset.circleCompact": { en: "Shipped mark (circle, compact)", yue: "出廠標記 (圓形,細)" },

    "appLogo.action.apply": { en: "Use this file", yue: "用呢個檔案" },
    "appLogo.action.cancel": { en: "Cancel", yue: "取消" },
    "appLogo.action.reset": { en: "Reset to shipped mark", yue: "返去出廠標記" },

    "appLogo.crop.title": { en: "Crop", yue: "裁切" },
    "appLogo.crop.top": { en: "Top inset", yue: "上邊留白" },
    "appLogo.crop.right": { en: "Right inset", yue: "右邊留白" },
    "appLogo.crop.bottom": { en: "Bottom inset", yue: "下邊留白" },
    "appLogo.crop.left": { en: "Left inset", yue: "左邊留白" },

    "appLogo.fit.title": { en: "Fit", yue: "填滿方式" },
    "appLogo.fit.fill": { en: "Fill", yue: "填滿" },
    "appLogo.fit.contain": { en: "Contain", yue: "完整顯示" },

    "appLogo.focal.title": { en: "Focal point", yue: "對焦點" },
    "appLogo.focal.x": { en: "Horizontal position", yue: "橫向位置" },
    "appLogo.focal.y": { en: "Vertical position", yue: "垂直位置" },

    "appLogo.background.title": { en: "Background", yue: "背景" },
    "appLogo.background.transparent": { en: "Transparent", yue: "透明" },
    "appLogo.background.solid": { en: "Solid colour", yue: "純色" },
    "appLogo.background.colorLabel": { en: "Background colour", yue: "背景顏色" },

    "appLogo.safeArea.label": { en: "Safe-area preview", yue: "安全區域預覽" },
    "appLogo.safeArea.description": {
        en: "The dashed box shows the area every shipped surface keeps clear around the mark.",
        yue: "虛線框顯示每個出廠介面喺標記四周會留返嘅範圍。",
    },

    "appLogo.preview.titleBar": { en: "Title bar (24px)", yue: "標題列 (24px)" },
    "appLogo.preview.settings": { en: "Settings row (64px)", yue: "設定列 (64px)" },
    "appLogo.preview.about": { en: "About screen (256px)", yue: "關於畫面 (256px)" },

    "appLogo.identity.note": {
        en: "This changes the picture only. The application's package identity, executable filename, installer identity, update feed and data directory never move because a picture changed.",
        yue: "呢個淨係改緊幅圖。應用程式嘅套件身份、執行檔檔名、安裝程式身份、更新來源同資料夾都唔會因為換咗幅圖而改變。",
    },

    /* Shown before a JPEG upload becomes the active mark: JPEG has no alpha channel, so a
     * transparent background choice would silently show this image's own opaque background
     * instead. Named here rather than only implied, per "report any ... transparency loss
     * ... BEFORE it becomes the active output". */
    "appLogo.notice.jpegNoTransparency": {
        en: "JPEG has no transparency, so a transparent background choice will show this image's own background instead.",
        yue: "JPEG 冇透明度,揀透明背景都只會顯示返呢張圖自己嘅背景。",
    },

    /* One plain-language reason per rejection code from logoValidation.ts. */
    "appLogo.reason.too-large": {
        en: "the file is larger than this app allows",
        yue: "個檔案大過呢個程式容許嘅上限",
    },
    "appLogo.reason.unsupported-format": {
        en: "the file is not a PNG, JPEG, WebP or SVG image",
        yue: "個檔案唔係 PNG、JPEG、WebP 或者 SVG 圖片",
    },
    "appLogo.reason.malformed": {
        en: "the file's bytes do not match a valid image of its own format",
        yue: "個檔案嘅內容同佢自己嘅格式對唔上,唔係一個有效嘅圖片",
    },
    "appLogo.reason.dimension-too-large": {
        en: "the image is wider or taller than this app allows",
        yue: "幅圖嘅闊度或者高度超過呢個程式容許嘅上限",
    },
    "appLogo.reason.too-many-pixels": {
        en: "the image has more pixels than this app allows",
        yue: "幅圖嘅像素數量超過呢個程式容許嘅上限",
    },
    "appLogo.reason.animated-not-supported": {
        en: "the image is animated, and an app mark must be a single still image",
        yue: "幅圖係動畫,但應用程式標記淨係接受單一靜態圖片",
    },
    "appLogo.reason.svg-unsafe-content": {
        en: "the SVG file contains script or event-handler content this app will not accept",
        yue: "個 SVG 檔案含有 script 或者事件處理內容,呢個程式唔會接受",
    },
    "appLogo.reason.read-failed": {
        en: "the file could not be read from disk",
        yue: "個檔案由磁碟讀唔到",
    },
} as const satisfies Record<string, FixedString>;

export const APPLOGO_FACTS = {
    "appLogo.status.usingShipped": {
        en: ["shipped mark", "No custom logo is active"],
        yue: ["出廠標記", "未揀自訂 logo"],
    },
    "appLogo.status.usingCustom": {
        en: ["custom mark", "{format}", "{width}x{height}"],
        yue: ["custom 標記", "{format}", "{width}x{height}"],
    },
    "appLogo.status.invalid": {
        en: ["not applied", "{reason}", "was not changed"],
        yue: ["冇被採用", "{reason}", "冇變過"],
    },
    "appLogo.status.conversionNotice": {
        en: ["Before this applies", "{detail}"],
        yue: ["套用之前", "{detail}"],
    },
    "appLogo.status.resetDone": {
        en: ["Reset to the shipped mark", "back to its own default"],
        yue: ["返去出廠標記", "返去自己嘅預設值"],
    },
} as const satisfies Record<
    keyof typeof APPLOGO_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
