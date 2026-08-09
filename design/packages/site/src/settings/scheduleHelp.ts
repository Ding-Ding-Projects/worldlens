/**
 * Guidance copy for the schedule editor, and the one shape every piece of that
 * guidance travels in.
 *
 * A machine code in front of a visitor is a dead end. `id`, `api-url`, `refresh`
 * are the names this module gave its own fields; they tell a reader which internal
 * variable was unhappy and nothing whatsoever about what to type instead. The
 * reader cannot look the code up, cannot infer the bound it violated, and cannot
 * tell whether the fault is theirs or the site's — so the only move left is to
 * change something at random and press Save again. That is why a code is never
 * the message. It is still the right thing to *carry*: a stable code is what a
 * test asserts on and what a caller branches on, and it stays exactly as stable
 * once a sentence rides alongside it. So nothing here replaces one string with
 * another; a `GuidanceMessage` holds both, and the caller decides which half it
 * needs.
 *
 * The sentence is an i18n key rather than English text because this site renders
 * in English, Hong Kong Cantonese, or both at once, and because a bound written
 * into prose is a bound written twice — the day someone raises the refresh
 * ceiling, the sentence keeps confidently quoting the old one. Every number in
 * this table therefore arrives through interpolation from the constant that the
 * validator itself compares against, so the two cannot drift.
 *
 * These phrases are plain strings rather than per-funny-level variants wherever
 * they state a constraint. What a field will accept is a fact, and a fact reads
 * identically at every level; only the framing around it — the line that counts
 * the problems — carries the humour, because rewording *that* cannot change what
 * the visitor is being told.
 */

import { registerStrings, t } from "./i18n.js";
import type { Interpolations, StringTable } from "./i18n.js";

/**
 * One thing to say to a visitor, plus the code for everyone who is not one.
 *
 * `phraseKeys` exists because some of these sentences have to name a setting, and
 * a setting's name is itself an i18n key. Interpolating the key would print
 * `set.themeMode` at the visitor; interpolating a hardcoded "Theme" would print
 * English into Cantonese copy. So the renderer resolves those entries through the
 * language port first and substitutes the result.
 */
export interface GuidanceMessage {
    /** Stable machine code. Kept for tests and for callers that branch on it. */
    readonly code: string;
    /** i18n key of the sentence a visitor reads. */
    readonly messageKey: string;
    /** Interpolations for `messageKey`, carrying the real bounds and values. */
    readonly values: Interpolations;
    /** Interpolations whose value is another i18n key, resolved before substitution. */
    readonly phraseKeys: Readonly<Record<string, string>>;
    /**
     * i18n key of the control this belongs beside, when there is one. The renderer
     * uses it to point `aria-describedby` at the sentence and to move focus to the
     * field that has to change, so the guidance is not merely present but attached.
     */
    readonly field?: string | undefined;
}

/**
 * Resolve a message into the text a visitor sees.
 *
 * Nested phrases are resolved with the *same* interpolations as the outer one, so
 * a reason sentence that needs the HTTP status can have it without the caller
 * having to thread a second values object through every layer.
 */
export function guidanceText(message: GuidanceMessage): string {
    const resolved: Record<string, string | number> = { ...message.values };
    for (const [name, key] of Object.entries(message.phraseKeys)) {
        resolved[name] = t(key, message.values);
    }
    return t(message.messageKey, resolved);
}

export const SCHEDULE_HELP_STRINGS: StringTable = {
    // The count line is framing, so it is the one place in this table where the
    // funny level changes the wording. The number it reports never moves.
    "scheduleHelp.summary.one": {
        en: {
            1: "This rule cannot be saved yet. One thing needs fixing:",
            3: "Almost there. One thing still needs fixing before this rule saves:",
            5: "So close. One lonely thing is holding this rule back:",
        },
        yue: {
            1: "呢條規則仲未儲存到，有一樣要修正：",
            3: "差少少啦，仲有一樣搞掂咗就儲存到：",
            5: "就差咁少少，得返一樣嘢拖住條規則：",
        },
    },
    "scheduleHelp.summary.many": {
        en: {
            1: "This rule cannot be saved yet. {count} things need fixing:",
            3: "Almost there. {count} things still need fixing before this rule saves:",
            5: "So close. {count} things are still holding this rule back:",
        },
        yue: {
            1: "呢條規則仲未儲存到，有 {count} 樣要修正：",
            3: "差少少啦，仲有 {count} 樣搞掂咗就儲存到：",
            5: "就差咁少少，仲有 {count} 樣嘢拖住條規則：",
        },
    },

    "scheduleHelp.problem.id": {
        en: "A rule id may use only lowercase letters, numbers and hyphens, {min} to {max} characters, and must start with a letter or a number. “{value}” does not. Rules added here are given a valid id automatically, so this one came from an imported file — fix it there, for example “{suggestion}”.",
        yue: "規則 id 淨係可以用細楷英文字母、數字同連字號，{min} 至 {max} 個字元，第一個字要係字母或者數字。「{value}」唔合格。喺呢度新增嘅規則會自動攞到合法 id，所以呢條係匯入檔案帶入嚟嘅 — 去嗰個檔案改，例如「{suggestion}」。",
    },
    "scheduleHelp.problem.label.empty": {
        en: "Give the rule a name you will recognise later, such as “Evening reading”. The name is what the rule list shows you.",
        yue: "幫條規則改個你日後認得嘅名，例如「夜晚睇嘢」。規則清單顯示嘅就係呢個名。",
    },
    "scheduleHelp.problem.label.tooLong": {
        en: "A rule name can be at most {max} characters. This one is {length}. Shorten it.",
        yue: "規則名最多 {max} 個字元，呢個有 {length} 個，剪短啲。",
    },
    "scheduleHelp.problem.priority": {
        en: "Priority decides which rule wins when two match at the same moment: the higher number wins. It must be a whole number from {min} to {max}.",
        yue: "兩條規則同一時間都符合嘅時候，優先次序決定邊條贏：數字大嗰條贏。要係 {min} 至 {max} 之間嘅整數。",
    },
    "scheduleHelp.problem.timezone": {
        en: "“{value}” is not a timezone this browser knows. Pick one from the Timezone list, which offers every zone this browser supports.",
        yue: "「{value}」唔係呢個瀏覽器識得嘅時區。喺「時區」清單揀一個 — 入面已經列晒瀏覽器支援嘅時區。",
    },
    "scheduleHelp.problem.startDate": {
        en: "Start date must be a real date on the calendar, chosen with the date picker or written as YYYY-MM-DD. “{value}” is not one. Leave it empty for a rule with no start date.",
        yue: "開始日期要係日曆上真係存在嘅日子，用日期揀選器揀，或者寫成 YYYY-MM-DD。「{value}」唔係。唔想設開始日期就留空。",
    },
    "scheduleHelp.problem.endDate": {
        en: "End date must be a real date on the calendar, chosen with the date picker or written as YYYY-MM-DD. “{value}” is not one. Leave it empty for a rule with no end date.",
        yue: "結束日期要係日曆上真係存在嘅日子，用日期揀選器揀，或者寫成 YYYY-MM-DD。「{value}」唔係。唔想設結束日期就留空。",
    },
    "scheduleHelp.problem.dateOrder": {
        en: "The start date {start} falls after the end date {end}, so this rule could never run. Swap the two, or clear one of them.",
        yue: "開始日期 {start} 喺結束日期 {end} 之後，咁樣呢條規則一世都跑唔到。調轉兩個，或者清走其中一個。",
    },
    "scheduleHelp.problem.startTime": {
        en: "Start time is a time of day on the 24-hour clock, from 00:00 to 23:59. “{value}” is not. Use the time picker.",
        yue: "開始時間係 24 小時制嘅時間，00:00 至 23:59。「{value}」唔係。用時間揀選器揀。",
    },
    "scheduleHelp.problem.endTime": {
        en: "End time is a time of day on the 24-hour clock, from 00:00 to 23:59. “{value}” is not. Use the time picker. Setting it equal to the start time means the whole selected day.",
        yue: "結束時間係 24 小時制嘅時間，00:00 至 23:59。「{value}」唔係。用時間揀選器揀。同開始時間一樣就代表成日。",
    },
    "scheduleHelp.problem.weekdaysEmpty": {
        en: "Every day is switched off, so this rule needs at least one weekday ticked. Tick the days it should run, or switch Every day back on.",
        yue: "而家「每日」熄咗，所以要至少揀一個星期幾。揀返要跑嘅日子，或者開返「每日」。",
    },
    "scheduleHelp.problem.weekdays": {
        en: "A weekday must be one of the seven days in the list, Sunday through Saturday. This rule carries a day outside that range, which the editor cannot produce, so it came from an imported file.",
        yue: "星期只可以係清單入面星期日至星期六嗰七日。呢條規則有個超出範圍嘅日子，編輯器整唔出，所以係匯入檔案帶入嚟嘅。",
    },
    "scheduleHelp.problem.valuesEmpty": {
        en: "This rule changes nothing, so you would never see it do anything. Add at least one setting for it to control.",
        yue: "呢條規則乜都冇改，跑咗你都睇唔出嚟。至少加一項設定俾佢控制。",
    },
    "scheduleHelp.problem.unknownSetting": {
        en: "One row names a setting this site does not have, so that row shows an empty picker and could never be applied. Choose a setting in that picker, or remove the row.",
        yue: "有一行揀咗個呢個網站冇嘅設定，所以嗰個揀選器係空嘅，永遠套用唔到。喺嗰個揀選器揀返一項設定，或者刪走成行。",
    },
    "scheduleHelp.problem.valueRejected": {
        en: "{name} cannot hold “{value}”. Pick a value with that row's own control — it only offers values the setting accepts.",
        yue: "{name} 唔收得「{value}」。用嗰行自己嘅控制項揀 — 佢淨係俾得設定收得嘅值。",
    },
    "scheduleHelp.problem.refresh": {
        en: "Refresh must be a whole number of minutes from {min} to {max}. Anything under {min} would hammer the source; anything over {max} is longer than a day, by which point a schedule is stale rather than scheduled.",
        yue: "更新間隔要係 {min} 至 {max} 分鐘之間嘅整數。少過 {min} 會不停撳人哋個 source；多過 {max} 就過咗一日，嗰陣個排程已經係舊聞唔係排程。",
    },
    "scheduleHelp.problem.haEntity": {
        en: "A Home Assistant entity here must be a boolean one: binary_sensor.something or input_boolean.something, in lowercase with underscores. “{value}” is not in either of those two domains, and only a boolean entity can switch a rule on and off.",
        yue: "呢度嘅 Home Assistant 實體要係布林類：binary_sensor.something 或者 input_boolean.something，細楷加底線。「{value}」唔屬於嗰兩個 domain，而淨係布林實體先開得關得一條規則。",
    },
    "scheduleHelp.problem.credentialKey": {
        en: "The credential key names the slot this rule's token sits in for the session. It may use lowercase letters, numbers, dots, hyphens and underscores, up to {max} characters, and must start with a letter or a number. The editor fills this in for you, so an empty or odd one came from an imported file.",
        yue: "Credential key 係呢條規則今次 session 放 token 嗰格嘅名。可以用細楷英文字母、數字、句號、連字號同底線，最多 {max} 個字元，第一個字要係字母或者數字。編輯器會自動填，所以空咗或者古古怪怪嗰啲係匯入檔案帶入嚟嘅。",
    },
    "scheduleHelp.problem.document": {
        en: "The rules could not be saved as a set. A saved set must be a version {version} document of at most {max} rules, each valid on its own and each with an id no other rule uses. Nothing was written, so the rules you already had are untouched.",
        yue: "成組規則儲存唔到。儲存嘅組合要係第 {version} 版文件、最多 {max} 條規則，每條自己要合格，而且 id 唔可以撞。今次乜都冇寫入，所以你原本嗰啲規則安然無恙。",
    },
    "scheduleHelp.problem.history": {
        en: "That version is no longer in the history list, so there was nothing to restore. Reload the page to see the versions that are actually stored.",
        yue: "嗰個版本已經唔喺歷史清單度，所以冇嘢還原到。Reload 個頁面睇返而家真係儲住嘅版本。",
    },

    "scheduleHelp.url.invalid": {
        en: "The address must be a complete URL with a scheme and a host, for example https://example.test/settings.json. “{value}” is not one.",
        yue: "個網址要完整，有 scheme 有 host，例如 https://example.test/settings.json。「{value}」唔係。",
    },
    "scheduleHelp.url.credentials": {
        en: "Take the username and password out of the address. A URL carrying credentials is copied into browser history, into server logs, and into any export of these rules. {advice}",
        yue: "將個 username 同 password 由網址度攞走。網址帶住登入資料，會俾人抄入瀏覽紀錄、伺服器 log，同埋你匯出規則嘅檔案入面。{advice}",
    },
    "scheduleHelp.url.credentials.api": {
        en: "Use an endpoint that needs no credentials; a static site has nowhere safe to keep them.",
        yue: "用個唔使登入嘅 endpoint；靜態網站冇個安全地方擺得低啲密碼。",
    },
    "scheduleHelp.url.credentials.ha": {
        en: "Home Assistant's token belongs in the session token field below instead, which keeps it in memory only.",
        yue: "Home Assistant 個 token 應該擺落面嗰個 session token 欄，嗰度淨係擺喺記憶體。",
    },
    "scheduleHelp.url.fragment": {
        en: "Remove the # and everything after it. A browser never sends that part to the server, so it cannot reach the source — it can only leak into places you did not intend.",
        yue: "刪走個 # 同後面所有嘢。瀏覽器根本唔會將嗰截送去伺服器，所以去唔到個 source — 淨係會漏去你唔想佢去嘅地方。",
    },
    "scheduleHelp.url.https": {
        en: "Use https://. Plain http:// is accepted only for a loopback address — localhost or 127.0.0.1 — because to any other host it would travel unencrypted across the network.",
        yue: "要用 https://。淨係 loopback 位址 — localhost 或者 127.0.0.1 — 先收 http://，因為去第二部機嘅話成段嘢冇加密咁喺網絡上面行。",
    },

    "scheduleHelp.status.error": {
        en: "{rule} could not be applied, so the stored base settings were restored. {reason}",
        yue: "{rule} 套用唔到，所以已經還原返儲低嘅基礎設定。{reason}",
    },
    "scheduleHelp.status.unknownRule": {
        en: "A rule that is no longer in your list",
        yue: "一條已經唔喺你清單度嘅規則",
    },

    "scheduleHelp.reason.redirect": {
        en: "The address redirected somewhere else, and this site will not follow a redirect: the place it lands is not the place you allowed.",
        yue: "個網址 redirect 咗去第二度，而呢個網站唔會跟 redirect：跳到去嘅地方唔係你批准嗰個。",
    },
    "scheduleHelp.reason.authentication": {
        en: "The source refused the credentials it was given. For Home Assistant, enter the token for this session again; it is dropped on every reload.",
        yue: "個 source 唔收俾佢嘅登入資料。如果係 Home Assistant，今次 session 再輸入多次個 token；每次 reload 都會冇咗。",
    },
    "scheduleHelp.reason.rateLimited": {
        en: "The source asked for fewer requests. Raise this rule's refresh interval, then try again.",
        yue: "個 source 叫你唔好嗌咁密。將呢條規則嘅更新間隔調長啲，再試過。",
    },
    "scheduleHelp.reason.http": {
        en: "The source answered with HTTP {status} instead of the settings.",
        yue: "個 source 回咗個 HTTP {status}，唔係啲設定。",
    },
    "scheduleHelp.reason.tooLarge": {
        en: "The response was bigger than the {kilobytes} KB this site will read, so it was dropped unread.",
        yue: "回應大過呢個網站肯讀嘅 {kilobytes} KB，所以連睇都冇睇就掉咗。",
    },
    "scheduleHelp.reason.malformedJson": {
        en: "The response was not valid JSON.",
        yue: "個回應唔係有效嘅 JSON。",
    },
    "scheduleHelp.reason.apiSchema": {
        en: "The response is not a version {version} settings document: it needs a version field of {version} and a values object.",
        yue: "個回應唔係第 {version} 版設定文件：要有個等於 {version} 嘅 version 欄，同一個 values 物件。",
    },
    "scheduleHelp.reason.haSchema": {
        en: "Home Assistant's answer carried no state, so this is not the kind of entity a rule can read.",
        yue: "Home Assistant 回嘅嘢冇 state，所以佢唔係規則讀得嘅嗰種實體。",
    },
    "scheduleHelp.reason.haState": {
        en: "The entity is neither on nor off — most often it is unavailable — and this site will not guess which of the two you meant.",
        yue: "個實體唔係 on 又唔係 off — 最多數係 unavailable — 而呢個網站唔會估你想要邊個。",
    },
    "scheduleHelp.reason.missingToken": {
        en: "No Home Assistant token is loaded for this session. Enter it again; tokens are deliberately dropped on every reload.",
        yue: "今次 session 未載入 Home Assistant token。再輸入一次；token 係特登每次 reload 都唔留低。",
    },
    "scheduleHelp.reason.noAllowedValues": {
        en: "None of the values the source sent matches a setting this site has, so there was nothing to apply.",
        yue: "個 source 送嚟嘅值冇一個對得上呢個網站有嘅設定，所以冇嘢套用得到。",
    },
    "scheduleHelp.reason.url": {
        en: "This rule's address is not one this site will fetch. Open the rule and correct the address.",
        yue: "呢條規則嘅網址係呢個網站唔會去攞嘅。開返條規則改個網址。",
    },
    "scheduleHelp.reason.unknown": {
        en: "Something else went wrong that this site has no words for. Its technical code is {code}, which is worth quoting in a bug report.",
        yue: "有第啲嘢出咗錯，而呢個網站講唔出係咩。佢個技術代碼係 {code}，報 bug 嗰陣抄埋佢。",
    },

    "scheduleHelp.history.action.saved": { en: "Saved", yue: "儲存" },
    "scheduleHelp.history.action.imported": { en: "Imported", yue: "匯入" },
    "scheduleHelp.history.action.reset": { en: "Reset", yue: "重設" },
    "scheduleHelp.history.count.one": { en: "1 rule", yue: "1 條規則" },
    "scheduleHelp.history.count.many": { en: "{count} rules", yue: "{count} 條規則" },
    "scheduleHelp.values.allUsed": {
        en: "Every setting this site has is already in this rule, so there is nothing left to add.",
        yue: "呢個網站有嘅設定已經全部喺呢條規則入面，冇嘢再加得。",
    },

    "scheduleHelp.dependsOn.unmet": {
        en: "Only applies while {name} is {value}.",
        yue: "淨係喺 {name} 係 {value} 嗰陣先生效。",
    },
    "scheduleHelp.dependsOn.on": {
        en: "Only applies while {name} is turned on.",
        yue: "淨係喺 {name} 開咗嗰陣先生效。",
    },
    "scheduleHelp.dependsOn.off": {
        en: "Only applies while {name} is turned off.",
        yue: "淨係喺 {name} 熄咗嗰陣先生效。",
    },
    "scheduleHelp.dependsOn.missing": {
        en: "This setting waits on another setting that this build does not have, so it never takes effect. That is a fault in the site, not something you can fix here.",
        yue: "呢項設定等緊另一項設定，但係呢個版本根本冇嗰項，所以佢永遠唔會生效。呢個係網站嘅問題，唔係你喺呢度整得掂。",
    },
    "scheduleHelp.dependsOn.unmatchedValue": {
        en: "Only applies while {name} is set to a value this build does not offer, so it never takes effect. That is a fault in the site, not something you can fix here.",
        yue: "要 {name} 設成一個呢個版本根本冇提供嘅值先生效，所以佢永遠唔會生效。呢個係網站嘅問題，唔係你喺呢度整得掂。",
    },
};

/*
 * Registered here rather than by each caller, for the same reason the language
 * port registers the two tables it serves: a caller that forgets leaves its
 * surface rendering raw keys, and every surface that renders these phrases goes
 * through `guidanceText` above, which lives in this module. Importing this file
 * to render a message is therefore the same act as registering the copy for it.
 */
registerStrings("scheduleHelp", SCHEDULE_HELP_STRINGS);
