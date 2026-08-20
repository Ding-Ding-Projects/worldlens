/**
 * Kid mode's own words: the rail, Home, the sticker book, the grown-up gate, the celebration, and
 * the `kid-mode` settings row.
 *
 * Built to the same contract every other surface's copy module carries (see
 * `copy/surfaces/home.ts` for the canonical shape this one was checked against): `KID_VOICED` is
 * prose that varies across the five funny levels, `KID_FIXED` is one string per language with no
 * level, and `KID_FACTS` names, for every `KID_VOICED` key, the literal substrings a playful
 * rewrite is not allowed to lose - the fact that no grown-up code is configured, the word "Adult
 * Mode", the honesty statement that this is a speed bump and not a lock.
 *
 * This module does not register itself, and that is still true - but it IS registered. The wiring
 * lives in `copy/surfaces/kid.ts`, which re-exports these three objects, and `copy/surfaces/
 * index.ts` spreads them into the application-wide catalogue alongside every other surface. So
 * Cantonese, bilingual mode and both funny-level sliders genuinely reach every string below.
 *
 * An earlier version of this comment said the opposite - that wiring it in was "the next task's
 * job" and that until then vue-i18n was falling back to each `t()` call's own English argument.
 * That was true when it was written and became false the moment the surface landed, which is the
 * dangerous kind of stale: a reader who believed it would conclude Kid Mode is English-only and
 * either register it a second time or write documentation saying a shipped feature does not work.
 * The English fallback argument on each call site below is still correct and still load-bearing -
 * it is what a missing key would render - but it is no longer what actually renders.
 */
import type { FixedString, VoicedString } from "../components/setup/setupStrings.js";

export const KID_VOICED = {
    "kid.home.hero": {
        en: [
            "Make a new map",
            "Make a new map",
            "Make a new map!",
            "Let's make a new map!",
            "Let's make an awesome new map!",
        ],
        yue: ["整個新地圖", "整個新地圖", "整個新地圖啦！", "嚟整個新地圖啦！", "嚟整個勁正嘅新地圖啦！"],
    },
    "kid.home.heroBlurb": {
        en: [
            "Pick a world, press GO, and watch it get drawn.",
            "Pick a world, press GO, and watch it get drawn.",
            "Pick a world, press GO, and watch it get drawn!",
            "Pick a world, smash GO, and watch it get drawn!",
            "Pick a world, smash that GO button, and watch the magic happen!",
        ],
        yue: [
            "揀個世界，撳 GO，睇住佢畫出嚟。",
            "揀個世界，撳 GO，睇住佢畫出嚟。",
            "揀個世界，撳一下 GO，睇住佢畫出嚟！",
            "揀個世界，大力撳 GO，睇住佢畫出嚟！",
            "揀個世界，大力撳落個 GO 掣，睇住佢變魔術咁畫出嚟！",
        ],
    },
    "kid.home.noRenders": {
        en: [
            "No renders are running right now. Press GO to start one.",
            "No renders are running right now. Press GO to start one.",
            "No renders are running right now - press GO to start one.",
            "No renders are running! Press GO to start one.",
            "No renders are running! Give that GO button a press and start one.",
        ],
        yue: [
            "而家未有地圖算緊。撳 GO 開始一個。",
            "而家未有地圖算緊。撳 GO 開始一個。",
            "而家未有地圖算緊，撳 GO 開始一個。",
            "而家冇地圖算緊！撳 GO 開始一個啦。",
            "而家冇地圖算緊！撳一撳個 GO 掣開始一個啦。",
        ],
    },
    /*
     * "What is being drawn" row on Home, for a render whose world/project name has not resolved
     * yet: `KidHome.vue` shows this instead of the row's raw fallback value (`activeRenders.ts`'s
     * own `idFallback`/`syncId` - a hash like `world-0a974df3a729`, or a CI sync id), which is a
     * meaningless string to a pre-reading child and exactly the kind of adult/technical detail kid
     * mode exists to translate. This is honest about not knowing yet - it never invents a name -
     * and disappears on its own the instant the real one resolves, because `KidHome.vue` only shows
     * it while the row's `label` is still literally the same value as its `renderId`.
     */
    "kid.home.nowUnnamed": {
        en: [
            "Finding its name",
            "Finding its name",
            "Finding its name…",
            "Working out what name to give it!",
            "Working out what name to give it - hang tight!",
        ],
        yue: [
            "搵緊佢個名",
            "搵緊佢個名",
            "搵緊佢個名…",
            "度緊改咩名畀佢！",
            "度緊改咩名畀佢，等等啊！",
        ],
    },
    "kid.stickers.blurb": {
        en: [
            "Every sticker is a real thing you did.",
            "Every sticker is a real thing you did.",
            "Every sticker is a real thing you did, not a guess.",
            "Every single sticker is a real thing you actually did.",
            "Every single sticker is a real thing you actually did, no pretending.",
        ],
        yue: [
            "每個貼紙都係你真係做過嘅嘢。",
            "每個貼紙都係你真係做過嘅嘢。",
            "每個貼紙都係你真係做過嘅嘢，唔係估嘅。",
            "每一個貼紙，都係你真係一手一腳做過嘅嘢。",
            "每一個貼紙，都係你真係一手一腳做過嘅嘢，冇呃你嘅。",
        ],
    },
    /*
     * A fresh install has no shared restricted-mode credential configured, so this is the honest
     * state the grown-up gate opens in on day one - see `KidGrownUpGate.vue`'s own doc comment and
     * `kidMode.ts`'s "Kid Mode ships on" note for the full reasoning. The two facts that must never
     * disappear at any funny level: that no code is set, and that the door out is "Adult Mode" by
     * name, so a grown-up scanning quickly still recognises the destination.
     */
    "kid.gate.noLock.blurb": {
        en: [
            "No grown-up code is set on this computer yet, so anyone can switch to Adult Mode.",
            "No grown-up code is set on this computer yet, so anyone can switch to Adult Mode.",
            "No grown-up code is set on this computer yet - anyone can switch to Adult Mode.",
            "No grown-up code is set on this computer yet, so anyone can hop straight into Adult Mode.",
            "No grown-up code is set on this computer yet, so absolutely anyone can hop straight into Adult Mode.",
        ],
        yue: [
            "呢部電腦未設定大人密碼，所以邊個都轉得去大人模式。",
            "呢部電腦未設定大人密碼，所以邊個都轉得去大人模式。",
            "呢部電腦未設定大人密碼喎，邊個都轉得去大人模式。",
            "呢部電腦未設定大人密碼喎，邊個都可以直接跳去大人模式。",
            "呢部電腦未設定大人密碼喎，邊個都可以大搖大擺跳去大人模式。",
        ],
    },
    "kid.gate.locked.blurb": {
        en: [
            "A grown-up types the {name} code to switch to Adult Mode. It is the same code across participating apps.",
            "A grown-up types the {name} code to switch to Adult Mode. It is the same code across participating apps.",
            "A grown-up types the {name} code to switch to Adult Mode - the same code across participating apps.",
            "A grown-up types in the {name} code to switch to Adult Mode. Same code, every participating app.",
            "A grown-up types in the {name} code to switch to Adult Mode - one code, every participating app.",
        ],
        yue: [
            "大人打 {name} 密碼就轉得去大人模式，有參與嘅程式都用同一個密碼。",
            "大人打 {name} 密碼就轉得去大人模式，有參與嘅程式都用同一個密碼。",
            "大人打 {name} 密碼，就轉得去大人模式喇，有參與嘅程式共用一個密碼。",
            "大人打一打 {name} 密碼，就直接轉去大人模式，有參與嘅程式全部都用同一個密碼。",
            "大人打一打 {name} 密碼，就大搖大擺轉去大人模式，有參與嘅程式全部都係用番同一個密碼。",
        ],
    },
    /*
     * The toy-lock honesty statement, in this project's exact voice: a user-experience lock, not a
     * security boundary, with a real recovery route named rather than gestured at. "Shared
     * restricted mode" is the real shipped English name of the settings section that owns this
     * shared credential (`catalogue.setup.restrictedMode.name`); the Cantonese half deliberately
     * does not invent its own translation of that proper noun, since this module has not verified
     * what `settings.ts`'s own Cantonese for it is, and a second, disagreeing translation of the
     * same section name would be worse than a plain description of where it lives.
     */
    "kid.gate.honesty": {
        en: [
            "This is a user-experience lock, not a security lock. A grown-up who has reached Adult Mode can reset the {name} record from Settings.",
            "This is a user-experience lock, not a security lock. A grown-up who has reached Adult Mode can reset the {name} record from Settings.",
            "This is a user-experience lock, not a security lock - a grown-up already in Adult Mode can reset the {name} record from Settings.",
            "Just a user-experience lock, not a security lock. Forgot the code? A grown-up already in Adult Mode can reset the {name} record from Settings.",
            "Just a friendly speed bump, not a security lock. Forgot the code? Whoever is already in Adult Mode can reset the {name} record from Settings.",
        ],
        yue: [
            "呢個淨係使用體驗鎖，唔係保安鎖。已經喺大人模式嘅大人，可以喺設定入面重設 {name} 記錄。",
            "呢個淨係使用體驗鎖，唔係保安鎖。已經喺大人模式嘅大人，可以喺設定入面重設 {name} 記錄。",
            "呢個淨係使用體驗鎖，唔係保安鎖 - 已經喺大人模式嘅大人，可以喺設定入面重設 {name} 記錄。",
            "淨係使用體驗鎖啫，唔係保安鎖。唔記得個密碼？已經喺大人模式嘅大人，去設定入面重設 {name} 記錄就得。",
            "淨係一條得意嘅擋路帶啫，唔係保安鎖。唔記得個密碼？已經喺大人模式嘅大人，去設定入面重設 {name} 記錄就得。",
        ],
    },
    "kid.celebrate.levelUp.title": {
        en: ["Level {n}", "Level {n}", "Level {n}!", "Level {n}! Nice one!", "Level {n}!! You are on fire!"],
        yue: ["第 {n} 級", "第 {n} 級", "第 {n} 級喇！", "第 {n} 級喇！好嘢！", "第 {n} 級喇！勁到爆！"],
    },
    "kid.celebrate.sticker.title": {
        en: [
            "New sticker: {sticker}",
            "New sticker: {sticker}",
            "New sticker: {sticker}!",
            "New sticker unlocked: {sticker}!",
            "Ta-da! New sticker unlocked: {sticker}!",
        ],
        yue: ["新貼紙：{sticker}", "新貼紙：{sticker}", "新貼紙：{sticker}！", "解鎖新貼紙：{sticker}！", "叮！解鎖新貼紙：{sticker}！"],
    },
    "settings.kidMode.blurb": {
        en: [
            "Picture-first labels, bigger controls, XP and stickers. Every feature stays exactly where it is; only the way it is drawn changes.",
            "Picture-first labels, bigger controls, XP and stickers. Every feature stays exactly where it is; only the way it is drawn changes.",
            "Picture-first labels, bigger controls, XP and stickers - every feature stays exactly where it is, only the way it is drawn changes.",
            "Bigger buttons, picture-first labels, XP and stickers. Every single feature stays exactly where it is - only how it looks changes.",
            "Bigger buttons, picture-first labels, XP, stickers, the works. Every single feature stays exactly where it is - only how it looks changes, promise.",
        ],
        yue: [
            "圖畫行先嘅標籤、大啲嘅按鈕、經驗值同貼紙。每個功能都一樣喺原本位置，淨係畫法變咗。",
            "圖畫行先嘅標籤、大啲嘅按鈕、經驗值同貼紙。每個功能都一樣喺原本位置，淨係畫法變咗。",
            "圖畫行先嘅標籤、大啲嘅按鈕、經驗值同貼紙 - 每個功能都一樣喺原本位置，淨係畫法變咗。",
            "更大嘅按鈕、圖畫行先嘅標籤、經驗值同貼紙。每一個功能都一樣喺原本位置，淨係樣貌變咗。",
            "更大嘅按鈕、圖畫行先嘅標籤、經驗值、貼紙，樣樣齊。每一個功能都一樣喺原本位置，淨係樣貌變咗，保證唔呃你。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const KID_FIXED = {
    "kid.rail.label": { en: "Where to go", yue: "去邊度" },
    "kid.rail.home": { en: "Home", yue: "主頁" },
    "kid.rail.map": { en: "Explore", yue: "探索" },
    "kid.rail.work": { en: "My jobs", yue: "我嘅工作" },
    "kid.rail.stickers": { en: "Stickers", yue: "貼紙" },
    "kid.rail.find": { en: "Find anything", yue: "搵嘢" },
    "kid.rail.messages": { en: "Messages", yue: "訊息" },
    /* Names the destination by name, so it is findable by searching "adult" as well as "grown-up". */
    "kid.rail.grownUps": { en: "Grown-ups: switch to Adult Mode", yue: "大人專用：轉去大人模式" },
    "kid.rail.workOpenJobs": { en: "{count} jobs open", yue: "開緊 {count} 份工" },
    "kid.rail.messagesUnread": { en: "{count} unread", yue: "{count} 個未睇" },

    "kid.home.guide": { en: "Walk me through it", yue: "帶我行一次" },
    "kid.home.go": { en: "GO", yue: "GO" },
    "kid.home.lands": { en: "Everything this app can do", yue: "呢個程式識做嘅所有嘢" },
    "kid.home.rendersNow": { en: "Renders right now", yue: "而家算緊嘅地圖" },
    "kid.home.maps": { en: "Your maps and servers", yue: "你嘅地圖同伺服器" },
    "kid.home.addMap": { en: "Add another one", yue: "加多一個" },
    /*
     * The second line under a map/server card in `kid.home.maps`'s list: where it lives. A
     * local render says so in words a kid reads as plainly as a place name; a remote server
     * shows its address instead (`App.vue`'s `kidProfiles`, mirroring `isLocalProfile()`'s
     * split everywhere else in the app).
     */
    "kid.home.mapMeta.local": { en: "This computer", yue: "呢部電腦" },

    "kid.search": { en: "Look for something…", yue: "搵下啲嘢…" },
    "kid.search.summary": { en: "{shown} of {total} features match", yue: "{total} 樣功能入面有 {shown} 樣符合" },
    "kid.search.none": { en: "Nothing in this catalogue matches “{query}”.", yue: "呢個分類入面冇嘢符合「{query}」。" },

    "kid.stickers.title": { en: "Sticker book", yue: "貼紙簿" },
    "kid.stickers.won": { en: "Won!", yue: "攞到喇！" },
    "kid.stickers.notYet": { en: "Not yet", yue: "未攞到" },
    "kid.stickers.progress": { en: "{won} of {total} stickers won", yue: "攞咗 {total} 個入面嘅 {won} 個貼紙" },

    "kid.gate.heading": { en: "Grown-ups only", yue: "淨係大人先入得" },
    "kid.gate.sharedModeName": { en: "School mode", yue: "校園模式" },
    "kid.gate.loading": { en: "Checking for a grown-up code…", yue: "檢查緊有冇大人密碼…" },
    "kid.gate.noLock.action": { en: "Go to Adult Mode", yue: "去大人模式" },
    "kid.gate.credential": { en: "Shared code", yue: "共用密碼" },
    "kid.gate.unlock": { en: "Switch to Adult Mode", yue: "轉去大人模式" },
    "kid.gate.retry": { en: "Try the shared record again", yue: "再試共用記錄" },
    "kid.gate.failure.credentialInvalid": { en: "That code did not match. {name} and Kid Mode are unchanged.", yue: "個密碼唔啱。{name} 同 Kid Mode 都冇改。" },
    "kid.gate.failure.credentialRequired": { en: "Enter the shared PIN or password before trying again.", yue: "再試之前，請輸入共用 PIN 或密碼。" },
    "kid.gate.failure.credentialTooLong": { en: "That entry is longer than the shared credential limit.", yue: "嗰段輸入長過共用憑證上限。" },
    "kid.gate.failure.recordInvalid": { en: "{name} could not be checked safely. Kid Mode stays on; use the reset recovery in Settings.", yue: "安全核對唔到 {name}。Kid Mode 繼續開住；請喺設定用重設復原。" },
    "kid.gate.failure.unavailable": { en: "{name} could not be reached. Kid Mode stays on; retry after the shared record is available.", yue: "連接唔到 {name}。Kid Mode 繼續開住；共用記錄可用之後再試。" },
    "kid.gate.failed": { en: "That code did not match. Kid Mode stays on.", yue: "個密碼唔啱，Kid Mode 繼續開住。" },

    "kid.celebrate.levelUp.body": { en: "You earned enough XP to level up.", yue: "你攞夠經驗值升咗級。" },
    "kid.celebrate.sticker.body": { en: "Open the sticker book to see it.", yue: "打開貼紙簿睇下佢。" },
    "kid.celebrate.close": { en: "Yay!", yue: "嘩！" },

    "kid.status.level": { en: "Level {n}", yue: "第 {n} 級" },
    "kid.status.openLevel": { en: "Open sticker book, level {n}", yue: "打開貼紙簿，而家係第 {n} 級" },
    "kid.status.xpLabel": { en: "XP until the next level", yue: "升下一級之前嘅經驗值" },
    "kid.status.xpValue": { en: "{current} of {total} XP", yue: "{total} 經驗值入面有 {current}" },
    "kid.status.renderStarting": { en: "Open renders in progress; progress is starting", yue: "打開進行中算圖；進度啱啱開始" },
    "kid.status.renderPercent": { en: "Open renders in progress; {percent} percent complete", yue: "打開進行中算圖；完成咗百分之 {percent}" },
    "kid.status.problems": { en: "{count} problems; open the grown-up gate, then show the problems panel", yue: "有 {count} 個問題；先打開大人關卡，再顯示問題面板" },

    "settings.kidMode.title": { en: "Kid Mode and Adult Mode", yue: "Kid Mode 同大人模式" },
    "settings.kidMode.modeLabel": { en: "Which mode should open?", yue: "打開邊個模式？" },
    "settings.kidMode.kidModeOption": { en: "Kid Mode", yue: "Kid Mode" },
    "settings.kidMode.kidModeOptionHint": {
        en: "Picture-first labels, bigger buttons, stickers",
        yue: "圖畫行先嘅標籤、大啲嘅按鈕、貼紙",
    },
    "settings.kidMode.adultModeOption": { en: "Adult Mode", yue: "大人模式" },
    "settings.kidMode.adultModeOptionHint": {
        en: "The full application, exactly as it always was",
        yue: "完整版程式，同以前一模一樣",
    },
    "settings.kidMode.name": { en: "What to call the child", yue: "點稱呼呢個小朋友" },
    "settings.kidMode.celebrations": { en: "Celebrate finished jobs", yue: "完成工作要慶祝" },
    "settings.kidMode.sound": { en: "Play a sound with a celebration", yue: "慶祝嗰陣播個聲" },
    "settings.kidMode.labelStyle": { en: "Labels", yue: "標籤" },
    "settings.kidMode.kidFirst": { en: "Kid words first, real name underneath", yue: "細路用字行先，真名喺底下" },
    "settings.kidMode.nameFirst": { en: "Real name first, kid words underneath", yue: "真名行先，細路用字喺底下" },
    "settings.kidMode.nameOnly": { en: "Real names only", yue: "淨係真名" },
    "settings.kidMode.accessibleNote": {
        en: "The accessible name of every control keeps the real feature name at all three settings, so a screen reader and every screenshot still identify it.",
        yue: "每個控制項嘅無障礙名稱，喺三個設定入面都會保留真正嘅功能名，等螢幕閱讀器同每張截圖都認得出佢。",
    },
    "settings.kidMode.noLockNote": {
        en: "No grown-up code is set on this computer yet. Anyone can switch between Kid Mode and Adult Mode.",
        yue: "呢部電腦未設定大人密碼。邊個都轉得切 Kid Mode 同大人模式。",
    },
} as const satisfies Record<string, FixedString>;

export const KID_FACTS = {
    "kid.home.hero": { en: ["map"], yue: ["地圖"] },
    "kid.home.heroBlurb": { en: ["GO"], yue: ["GO"] },
    "kid.home.noRenders": { en: ["GO", "renders"], yue: ["GO", "地圖"] },
    "kid.home.nowUnnamed": { en: ["name"], yue: ["名"] },
    "kid.stickers.blurb": { en: ["real"], yue: ["真係"] },
    "kid.gate.noLock.blurb": { en: ["No grown-up code is set", "Adult Mode"], yue: ["未設定大人密碼", "大人模式"] },
    "kid.gate.locked.blurb": { en: ["{name}", "Adult Mode"], yue: ["{name}", "大人模式"] },
    "kid.gate.honesty": { en: ["not a security lock", "{name}"], yue: ["唔係保安鎖", "{name}"] },
    "kid.celebrate.levelUp.title": { en: ["Level", "{n}"], yue: ["{n}", "級"] },
    "kid.celebrate.sticker.title": { en: ["{sticker}"], yue: ["{sticker}"] },
    "settings.kidMode.blurb": { en: ["stays exactly where it is"], yue: ["喺原本位置"] },
} as const satisfies Record<keyof typeof KID_VOICED, { en: readonly string[]; yue: readonly string[] }>;
