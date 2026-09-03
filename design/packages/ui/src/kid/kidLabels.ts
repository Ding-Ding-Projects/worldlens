/**
 * Shipped English name → the label a four-to-six-year-old reads, in both languages.
 *
 * Keyed by `nameFallback` from `catalogues.ts`, `labelFallback` from `jobRegistry.ts` and the
 * section titles behind `SETTINGS_SECTIONS`, so this file names nothing the application does not
 * already have. `kidLabel()` falls back to the shipped name: a surface with no entry here still
 * renders, still routes and still says what it is.
 *
 * ## Every entry is a real `FixedString`, resolved for the live language mode
 *
 * An earlier version of this file stored plain English strings here and let a doc comment above
 * promise that "every entry goes through `t()` at the call site" - a promise nothing in this
 * module or its call sites (`KidHome.vue`'s land buttons, `KidCataloguePage.vue`'s feature rows,
 * `KidJobStrip.vue`'s tab renames) ever kept. `docs/screenshots/kid-home-yue.png` caught exactly
 * that: every piece of Kid Mode's OWN prose (`kidCopy.ts`, wired through `copy/surfaces/kid.ts`)
 * came through in Cantonese, and the five catalogue tiles - the picture-first navigation Kid Mode
 * exists to give a pre-reading child - stayed in English regardless of language mode, because
 * `KID_CATALOGUE_LABELS[catalogue.id]` was a bare object index with no language anywhere near it.
 *
 * This file is the fix, not a second attempt at the same promise: every table below is
 * `Readonly<Record<string, FixedString>>` (`FixedString` is the exact `{ en, yue }` shape
 * `setupStrings.ts` already defines and `kidCopy.ts`'s own `KID_FIXED` already uses), and
 * `kidLabel()`/`kidAccessibleName()`/`kidCatalogueLabel()` resolve the active word through
 * `languageMode()` from `setupI18n.ts` - the same reactive state `setupI18n.ts`'s own `pair()`
 * and `flat()` read, so a call inside any component's `<template>` or a `computed()` picks up a
 * language-mode change exactly as any other reactive read does, with no extra plumbing at the
 * call site. Kid label text does not vary by funny level: these are titles and picture captions,
 * the same reason `setupStrings.ts`'s own `FIXED` tier carries one string per language rather
 * than five.
 *
 * Bilingual mode joins the two with " / ", the same join `setupI18n.ts`'s own `flat()` uses -
 * deliberately not the "\n" + `white-space: pre-line` convention `appVoice.ts`'s prose messages
 * use, because a kid label can end up inside a tab title (`KidJobStrip.vue` renames a job tab
 * through `WorkPane`'s `renamePage`, which hands the string to `TabStrip.vue` - a sibling lane's
 * component this file does not control the wrapping of) as easily as inside a `<strong>` this
 * file's own styling can size. A flat, single-line join is the one join that is safe everywhere a
 * kid label is shown.
 */
import type { FixedString } from "../components/setup/setupStrings.js";
import { languageMode } from "../components/setup/setupI18n.js";
import { applyVocabulary } from "../components/vocabulary/applyVocabulary.js";

export const KID_FEATURE_LABELS: Readonly<Record<string, FixedString>> = {
    "Console, config, plugins and players": { en: "Everything about your server", yue: "你伺服器嘅所有嘢" },
    "Your Minecraft servers": { en: "Servers you made", yue: "你整咗嘅伺服器" },
    "Docker hosting manager": { en: "Servers in boxes", yue: "箱仔入面嘅伺服器" },
    /* Make a map (28) */
    "The project editor": { en: "Build room", yue: "砌嘢房" },
    "The project canvas": { en: "Build room map", yue: "砌嘢房地圖" },
    "The guide": { en: "Five questions", yue: "五條問題" },
    "Project world discovery": { en: "Find my worlds", yue: "揾返我啲世界" },
    "Dimension detection": { en: "Which part of the world?", yue: "邊忽世界" },
    "Legacy 1.12.2 worlds": { en: "Really old worlds", yue: "好舊嘅世界" },
    "Bedrock worlds": { en: "Bedrock worlds", yue: "Bedrock 版世界" },
    "Projects on this machine": { en: "Maps on this computer", yue: "呢部電腦嘅地圖" },
    "Render mask drawing": { en: "Draw the bit to make", yue: "劃低要整嘅位" },
    "Live render speed": { en: "Speed dial", yue: "快慢掣" },
    "The path field": { en: "Where things live", yue: "嘢住喺邊" },
    "Scheduled render": { en: "Do it later", yue: "遲啲先做" },
    "Docker or this machine": { en: "This computer or a box", yue: "呢部機定個箱" },
    "Remote rendering over SSH": { en: "Another computer", yue: "第二部電腦" },
    "Rendering in GitHub Actions": { en: "Robot helpers", yue: "機械人幫手" },
    "Disposable cloud CI": { en: "Rented helpers", yue: "租嚟嘅幫手" },
    "CI repository setup": { en: "The helpers' toolbox", yue: "幫手嘅工具箱" },
    "Large worlds": { en: "Huge worlds", yue: "勁大嘅世界" },
    "Renders in progress": { en: "What is being drawn", yue: "而家畫緊乜嘢" },
    "The render console": { en: "What the engine says", yue: "引擎講乜" },
    "Resumable renders": { en: "Carry on later", yue: "遲啲繼續" },
    "Live speed control": { en: "Change speed now", yue: "而家轉速度" },
    "Container offers": { en: "Use the box we have", yue: "用返個箱" },
    "Interrupted renders": { en: "Ones that stopped", yue: "停低咗嗰啲" },
    "Render throughput": { en: "How fast is it going", yue: "而家幾快" },
    "Automatic repair": { en: "Fix it for me", yue: "幫我整返好" },
    "Java runtime provisioning": { en: "Get the engine's Java", yue: "攞引擎嘅 Java" },
    "Dependency provisioning": { en: "Get the other bits", yue: "攞埋第啲嘢" },
    "Mojang download consent": { en: "Say yes to Mojang", yue: "同 Mojang 講好" },

    /* Your maps (6) */
    "Maps and servers": { en: "All my maps", yue: "我全部地圖" },
    "The viewer and its controls": { en: "Fly around", yue: "周圍飛" },
    "Markers and marker sets": { en: "Pins and flags", yue: "大頭針同旗仔" },
    "Remote BlueMap servers": { en: "Someone else's map", yue: "第啲人嘅地圖" },
    "Viewer settings": { en: "How pretty it looks", yue: "睇落靚唔靚" },
    "Server-hosted Material UI": { en: "Map in a browser", yue: "網頁入面嘅地圖" },

    /* Share a map (6) */
    "Publish to GitHub Pages": { en: "Put it on the web", yue: "擺上網" },
    "Watch it live": { en: "Watch it now", yue: "而家睇" },
    "Private worlds": { en: "Keep it secret", yue: "唔俾人知" },
    "Remote hosting": { en: "Anywhere else", yue: "第度都得" },
    "Pages feature parity": { en: "Same app on the web", yue: "網上都一樣" },
    "Release workflow security": { en: "Safe publishing rules", yue: "安全公開嘅規矩" },

    /* Keep a copy (7) */
    Backups: { en: "Make a safe copy", yue: "整份安全副本" },
    "World git repository": { en: "Copy that grows", yue: "會大嘅副本" },
    "Repository adoption": { en: "Another computer joins", yue: "第二部電腦加入" },
    "World sources": { en: "Get a world", yue: "攞個世界" },
    "SSH world sources": { en: "Get it from a computer", yue: "由電腦度攞" },
    "Docker world source": { en: "Get it from a box", yue: "由箱度攞" },
    "Local version history": { en: "Go back in time", yue: "返去舊時" },

    /* Set up & help (37) */
    Settings: { en: "All the switches", yue: "全部掣" },
    "Options editor": { en: "Engine switches", yue: "引擎嘅掣" },
    "GitHub CLI accounts": { en: "Who we sign in as", yue: "用邊個帳戶" },
    "Tabbed navigation": { en: "My tabs", yue: "我嘅分頁" },
    "Where the panels sit": { en: "Where things sit", yue: "嘢擺喺邊" },
    "Appearance editors": { en: "Change the colours", yue: "轉顏色" },
    "The regex builder": { en: "Clever searching", yue: "醒目搵嘢" },
    "Command palette": { en: "Find anything", yue: "乜都搵到" },
    "Notification centre": { en: "My messages", yue: "我嘅訊息" },
    "Super confirmation": { en: "Two keys first", yue: "要兩條鎖匙先" },
    "Action-specific artwork": { en: "Picture for big buttons", yue: "大掣嘅圖畫" },
    "Display and ease of use": { en: "Bigger and easier", yue: "大啲易啲" },
    Theme: { en: "Day or night colours", yue: "日頭定夜晚顏色" },
    "Downloads at once": { en: "How many at once", yue: "一次幾多個" },
    "What this application is called": { en: "What we call this app", yue: "呢個程式叫乜" },
    "Language and tone": { en: "How it talks", yue: "佢點講嘢" },
    "Shared restricted mode": { en: "Grown-up lock", yue: "大人鎖" },
    "Personal vocabulary": { en: "Our own words", yue: "我哋自己嘅字" },
    "Spoken narrator": { en: "Read it out loud", yue: "讀出嚟" },
    "Scheduled language and appearance": { en: "Change it by the clock", yue: "跟時間轉" },
    "Memory Console": { en: "Shared memory desk", yue: "共用記憶檯" },
    "Status Hub": { en: "Are we in sync?", yue: "夾唔夾得埋" },
    "Control-plane runtime": { en: "Shared engine room", yue: "共用引擎房" },
    "Sync attestation": { en: "Proof it synced", yue: "證明夾得埋" },
    "Secret intake": { en: "Secret keeper", yue: "秘密保管員" },
    "Tooling integrations": { en: "Other tools", yue: "第啲工具" },
    "Shared localization contract": { en: "Shared word rules", yue: "共用文字規矩" },
    "Automatic updates": { en: "New versions", yue: "新版本" },
    "Startup recovery": { en: "If it wakes up poorly", yue: "瞓醒唔妥" },
    Migration: { en: "Moving old stuff over", yue: "搬舊嘢過嚟" },
    "Memory console settings": { en: "Memory desk switches", yue: "記憶檯嘅掣" },
    Docs: { en: "Read about it", yue: "睇下資料" },
    "Changelog viewer": { en: "What changed", yue: "改咗乜" },
    Glossary: { en: "Word list", yue: "生字表" },
    "Licence and consent": { en: "The rules", yue: "規矩" },
    "The interactive tour": { en: "Show me around", yue: "帶我行下" },
    "The design system": { en: "How it is drawn", yue: "點畫出嚟" },
};

/** Job label (`jobRegistry.ts` `labelFallback`) → kid label. All eighteen jobs. */
export const KID_JOB_LABELS: Readonly<Record<string, FixedString>> = {
    "Remote hosting": { en: "Servers somewhere else", yue: "喺第度嘅伺服器" },
    "Docker hosting": { en: "Servers in boxes", yue: "箱仔入面嘅伺服器" },
    Screenshots: { en: "Pictures you took", yue: "你影咗嘅相" },
    "Minecraft servers": { en: "Your own servers", yue: "你自己嘅伺服器" },
    "Make a map": { en: "Five questions", yue: "五條問題" },
    Projects: { en: "Build room", yue: "砌嘢房" },
    "Project canvas": { en: "Build room map", yue: "砌嘢房地圖" },
    "File converter": { en: "Shape changer", yue: "轉形狀機" },
    "GitHub runners": { en: "Robot helpers", yue: "機械人幫手" },
    Structures: { en: "Things already built", yue: "已經整好嘅嘢" },
    Convert: { en: "Change a world's shape", yue: "轉世界形狀" },
    Authenticator: { en: "Code keeper", yue: "密碼保管員" },
    Locks: { en: "Locks list", yue: "鎖頭清單" },
    "Support Tickets": { en: "Ask for help", yue: "揾人幫手" },
    "Browser downloads": { en: "Grabbed from the web", yue: "網度攞返嚟" },
    Renders: { en: "Being drawn", yue: "畫緊" },
    "Maps and servers": { en: "All my maps", yue: "我全部地圖" },
    "Publish to Pages": { en: "Put it on the web", yue: "擺上網" },
    "Watch it live": { en: "Watch it now", yue: "而家睇" },
    Backups: { en: "Safe copies", yue: "安全副本" },
    "World repository": { en: "Copy that grows", yue: "會大嘅副本" },
    Docs: { en: "Read about it", yue: "睇下資料" },
    Ollama: { en: "Talk to the robot", yue: "同機械人傾偈" },
    // `jobRegistry.ts`'s Memory job spells its `labelFallback` with a lowercase "console" -
    // `catalogues.ts`'s "Memory Console" catalogue-feature name capitalises it. The two disagree
    // about the same concept, and this table has to match the job registry's spelling exactly or
    // the lookup in `kidLabel()` (an exact string match) silently never fires for this job's tab.
    "Memory console": { en: "Shared memory desk", yue: "共用記憶檯" },
};

/**
 * Settings section anchor → kid label, for every section `settingsSections.ts` declares.
 *
 * This used to say "all nineteen sections" and had been wrong for a while: a count in a
 * comment rots the first time somebody adds a section and does not think to come here. The
 * number that matters is asserted in kidMode.contract.test.ts, which fails naming the exact
 * anchor that has no label rather than a total nobody can act on.
 */
export const KID_SETTINGS_LABELS: Readonly<Record<string, FixedString>> = {
    "render-engine-choice": { en: "Which drawing helper", yue: "用邊個畫圖幫手" },
    "aws-accounts": { en: "Big computer accounts", yue: "大電腦帳戶" },
    addons: { en: "Extra bits", yue: "額外嘅嘢" },
    "runtime-settings": { en: "How it talks and helps", yue: "佢點講嘢同點幫你" },
    "mojang-download-consent": { en: "Say yes to Mojang", yue: "同 Mojang 講好" },
    "java-runtime": { en: "The engine's Java", yue: "引擎嘅 Java" },
    "map-storage-directory": { en: "Where maps live", yue: "地圖住喺邊" },
    "world-folder": { en: "Where worlds live", yue: "世界住喺邊" },
    "github-account": { en: "Who we sign in as", yue: "用邊個帳戶" },
    "language-and-tone": { en: "How it talks", yue: "佢點講嘢" },
    display: { en: "Bigger and easier", yue: "大啲易啲" },
    // This is Kid Mode's own settings row - the one a grown-up uses to leave. The kid label
    // names the grown-up's way out ("the grown-up switch") rather than hiding it: this row must
    // never be harder for a grown-up to recognise than the row beside it, in any language.
    // "Kid Mode" itself stays untranslated, matching `kidCopy.ts`'s own
    // `settings.kidMode.kidModeOption` ({ en: "Kid Mode", yue: "Kid Mode" }) - it is the shipped
    // product name, not a sentence, and the project's own rule keeps identifiers identical in
    // both languages. `kidAccessibleName()` still appends the real anchor after this label
    // wherever it is used, exactly as it does for every other entry in this file, so the shipped
    // name is never the part that goes missing.
    "kid-mode": { en: "Kid pictures or the grown-up switch", yue: "Kid Mode 圖畫定大人掣" },
    "surface-placement": { en: "Where things sit", yue: "嘢擺喺邊" },
    "render-memory": { en: "How much thinking room", yue: "幾多諗嘢空間" },
    "download-concurrency": { en: "How many at once", yue: "一次幾多個" },
    "notification-duration": { en: "How long messages stay", yue: "訊息留幾耐" },
    "system-dependencies": { en: "Get the other bits", yue: "攞埋第啲嘢" },
    "bluemap-engine": { en: "Which engine", yue: "邊個引擎" },
    updates: { en: "New versions", yue: "新版本" },
    vocabulary: { en: "Our own words", yue: "我哋自己嘅字" },
    "app-logo": { en: "Our picture", yue: "我哋嘅圖案" },
    history: { en: "Go back in time", yue: "返去舊時" },
    diagnostics: { en: "If it wakes up poorly", yue: "瞓醒唔妥" },
};

/** The five catalogues, by id. */
export const KID_CATALOGUE_LABELS: Readonly<Record<string, FixedString>> = {
    remoteHosting: { en: "Somebody else's computer", yue: "人哋部電腦" },
    host: { en: "Run a server", yue: "開個伺服器" },
    make: { en: "Make a map", yue: "整地圖" },
    maps: { en: "Your maps", yue: "你嘅地圖" },
    share: { en: "Show people", yue: "俾人睇" },
    copy: { en: "Keep it safe", yue: "安全咁留底" },
    setup: { en: "Buttons & help", yue: "掣同幫手" },
};

export type KidLabelStyle = "kid-first" | "name-first" | "name-only";

/**
 * One `FixedString` entry, resolved for the language mode that is active right now.
 *
 * Reads `languageMode()` directly rather than accepting it as a parameter, matching
 * `setupI18n.ts`'s own `pair()`/`flat()`: `languageMode()` reads a module-level `reactive()`
 * object, so a call made during a component's render (a `<template>` expression, a `computed()`)
 * is tracked by Vue exactly as any other reactive read is, and the caller needs no extra
 * plumbing to stay live when the language-mode setting changes. A caller outside a reactive
 * context (`KidJobStrip.vue`'s imperative `applyKidLabels()`) still gets a correct value - it
 * just has to ask again itself when the setting changes, which is why that call site watches
 * `languageMode` explicitly rather than relying on this function to notice on its own.
 *
 * Bilingual mode joins with " / ": see this file's own top-of-file doc comment for why that join
 * rather than `appVoice.ts`'s "\n" + `white-space: pre-line` convention.
 */
function kidText(entry: FixedString): string {
    const mode = languageMode();
    if (mode === "en") return applyVocabulary(entry.en);
    if (mode === "yue") return applyVocabulary(entry.yue);
    return `${applyVocabulary(entry.en)} / ${applyVocabulary(entry.yue)}`;
}

/**
 * The pair a kid row shows. `primary` is what the child reads, `secondary` keeps the shipped name
 * on screen so a grown-up looking over a shoulder — and every screenshot, search result and
 * accessible name — can still find the feature by its real name. The shipped name itself is never
 * translated: it is the application's own real feature name, and `kidAccessibleName()` (and this
 * test suite's own contract test) depend on it staying byte-identical to what `catalogues.ts`,
 * `jobRegistry.ts` and `settingsSections.ts` actually declare, in every language mode.
 */
export function kidLabel(
    shippedName: string,
    table: Readonly<Record<string, FixedString>> = KID_FEATURE_LABELS,
    style: KidLabelStyle = "kid-first",
): { primary: string; secondary: string | null } {
    const entry = table[shippedName];
    const displayName = applyVocabulary(shippedName);
    if (entry === undefined || style === "name-only")
        return { primary: displayName, secondary: null };
    const kid = kidText(entry);
    if (style === "name-first") return { primary: displayName, secondary: kid };
    return { primary: kid, secondary: displayName };
}

/** The accessible name never drops the shipped name, whatever the label style or language is. */
export function kidAccessibleName(
    shippedName: string,
    table?: Readonly<Record<string, FixedString>>,
): string {
    const entry = (table ?? KID_FEATURE_LABELS)[shippedName];
    // A plain hyphen, not an em-dash: this project spells em-dashes as ordinary words everywhere
    // else its own copy is checked for one, and a string built here at runtime is no exception.
    const displayName = applyVocabulary(shippedName);
    return entry === undefined ? displayName : `${kidText(entry)} - ${displayName}`;
}

/**
 * The five catalogues' own kid word, for `KidHome.vue`'s land buttons and `KidCataloguePage.vue`'s
 * own heading - both of which already show the catalogue's real `title` alongside this, so unlike
 * `kidLabel()` there is no secondary/accessible-name pairing to do here: just the kid word, or the
 * real title when this table has no entry for the id (which `kidMode.contract.test.ts`'s "labels
 * every catalogue" check means never happens for a real catalogue, but a bare object index has no
 * such guarantee at the type level, so the fallback stays honest regardless).
 */
export function kidCatalogueLabel(catalogueId: string, fallbackTitle: string): string {
    const entry = KID_CATALOGUE_LABELS[catalogueId];
    return entry === undefined ? applyVocabulary(fallbackTitle) : kidText(entry);
}
