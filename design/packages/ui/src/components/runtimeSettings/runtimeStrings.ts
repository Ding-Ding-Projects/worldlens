export type RuntimeStringKey = keyof typeof RUNTIME_STRINGS;
type Five = readonly [string, string, string, string, string];
interface RuntimeString {
    readonly en: Five;
    readonly yue: Five;
}

const five = (value: string): Five => [value, value, value, value, value];

/** Every runtime-settings message has five English and Cantonese voice levels. */
export const RUNTIME_STRINGS = {
    statusTitle: {
        en: ["Status Hub", "Status Hub", "Status Hub", "Status Hub", "Status Hub"],
        yue: ["狀態中心", "狀態中心", "狀態中心", "狀態中心", "狀態中心"],
    },
    narratorTitle: {
        en: [
            "Spoken narrator",
            "Spoken narrator",
            "Spoken narrator",
            "Spoken narrator",
            "Spoken narrator",
        ],
        yue: ["語音旁白", "語音旁白", "語音旁白", "語音旁白", "語音旁白"],
    },
    scheduleTitle: {
        en: [
            "Scheduled settings",
            "Scheduled settings",
            "Scheduled settings",
            "Scheduled settings",
            "Scheduled settings",
        ],
        yue: ["排程設定", "排程設定", "排程設定", "排程設定", "排程設定"],
    },
    accommodationsTitle: {
        en: [
            "Attention modes",
            "Attention modes",
            "Attention modes",
            "Attention modes",
            "Attention modes",
        ],
        yue: ["專注模式", "專注模式", "專注模式", "專注模式", "專注模式"],
    },
    statusReady: {
        en: [
            "Runtime settings are local and ready.",
            "Runtime settings are local and ready.",
            "Runtime settings are local and ready.",
            "Runtime settings are local and ready.",
            "Runtime settings are local and ready.",
        ],
        yue: [
            "執行設定已經喺本機準備好。",
            "執行設定已經喺本機準備好。",
            "執行設定已經喺本機準備好。",
            "執行設定已經喺本機準備好。",
            "執行設定已經喺本機準備好。",
        ],
    },
    statusUnavailable: {
        en: [
            "Authenticated Status Hub delivery is unavailable.",
            "Authenticated Status Hub delivery is unavailable.",
            "Authenticated Status Hub delivery is unavailable.",
            "Authenticated Status Hub delivery is unavailable.",
            "Authenticated Status Hub delivery is unavailable.",
        ],
        yue: [
            "認證狀態中心傳送未有提供。",
            "認證狀態中心傳送未有提供。",
            "認證狀態中心傳送未有提供。",
            "認證狀態中心傳送未有提供。",
            "認證狀態中心傳送未有提供。",
        ],
    },
    narratorTest: {
        en: [
            "The narrator test was queued.",
            "The narrator test was queued.",
            "The narrator test was queued.",
            "The narrator test was queued.",
            "The narrator test was queued.",
        ],
        yue: [
            "旁白測試已經排隊。",
            "旁白測試已經排隊。",
            "旁白測試已經排隊。",
            "旁白測試已經排隊。",
            "旁白測試已經排隊。",
        ],
    },
    invalidPattern: {
        en: [
            "The pattern is invalid.",
            "The pattern is invalid.",
            "The pattern is invalid.",
            "The pattern is invalid.",
            "The pattern is invalid.",
        ],
        yue: [
            "正規式唔正確。",
            "正規式唔正確。",
            "正規式唔正確。",
            "正規式唔正確。",
            "正規式唔正確。",
        ],
    },
    everyDay: {
        en: ["Every day", "Every day", "Every day", "Every day", "Every day"],
        yue: ["每日", "每日", "每日", "每日", "每日"],
    },
    sunday: {
        en: ["Sunday", "Sunday", "Sunday", "Sunday", "Sunday"],
        yue: ["星期日", "星期日", "星期日", "星期日", "星期日"],
    },
    monday: {
        en: ["Monday", "Monday", "Monday", "Monday", "Monday"],
        yue: ["星期一", "星期一", "星期一", "星期一", "星期一"],
    },
    tuesday: {
        en: ["Tuesday", "Tuesday", "Tuesday", "Tuesday", "Tuesday"],
        yue: ["星期二", "星期二", "星期二", "星期二", "星期二"],
    },
    wednesday: {
        en: ["Wednesday", "Wednesday", "Wednesday", "Wednesday", "Wednesday"],
        yue: ["星期三", "星期三", "星期三", "星期三", "星期三"],
    },
    thursday: {
        en: ["Thursday", "Thursday", "Thursday", "Thursday", "Thursday"],
        yue: ["星期四", "星期四", "星期四", "星期四", "星期四"],
    },
    friday: {
        en: ["Friday", "Friday", "Friday", "Friday", "Friday"],
        yue: ["星期五", "星期五", "星期五", "星期五", "星期五"],
    },
    saturday: {
        en: ["Saturday", "Saturday", "Saturday", "Saturday", "Saturday"],
        yue: ["星期六", "星期六", "星期六", "星期六", "星期六"],
    },
    runtimeSettingsLabel: { en: five("Runtime settings"), yue: five("執行設定") },
    findRuntimeSettings: { en: five("Find runtime settings"), yue: five("搵執行設定") },
    runtimeSearchPlaceholder: { en: five("Try narrator, night, focus or voice"), yue: five("試下旁白、夜間、專注或者聲音") },
    runtimeResults: { en: five("Runtime setting results"), yue: five("執行設定結果") },
    runtimeNoMatch: { en: five("No runtime setting matches this search."), yue: five("呢個搜尋冇執行設定符合。") },
    adjust: { en: five("Adjust"), yue: five("調整") },
    timeAwareness: { en: five("Time awareness"), yue: five("時間感知") },
    runtimeSettings: { en: five("Runtime settings"), yue: five("執行設定") },
    narrator: { en: five("Narrator"), yue: five("旁白") },
    externalSources: { en: five("External sources"), yue: five("外部來源") },
    statusDelivery: { en: five("Status delivery"), yue: five("狀態傳送") },
    off: { en: five("Off"), yue: five("關閉") },
    localState: { en: five("Local state version {version}, {count} schedule rules"), yue: five("本機狀態版本 {version}，{count} 條排程規則") },
    speechUnavailable: { en: five("Speech synthesis is unavailable on this computer."), yue: five("呢部電腦未有語音合成。") },
    voicesReported: { en: five("{count} voices reported, with late updates watched."), yue: five("已回報 {count} 個聲音，亦有留意延遲更新。") },
    noneConfigured: { en: five("None configured, no request made."), yue: five("未有設定，冇發出請求。") },
    externalConfigured: { en: five("{count} configured, refresh is user-started."), yue: five("已設定 {count} 個，重新整理由用家開始。") },
    statusReading: { en: five("Reading main-process delivery status."), yue: five("讀取主程序傳送狀態。") },
    authenticatedAvailable: { en: five("Authenticated delivery is available."), yue: five("認證傳送可以使用。") },
    statusEvidenceHint: { en: five("The Status Hub record is evidence, not a promise. Unavailable delivery stays visible instead of pretending a message was sent."), yue: five("狀態中心紀錄係證據，唔係承諾。未能傳送會照實顯示，唔會扮成已經送出。") },
    narrationHint: { en: five("Narration is off until enabled. Voice lists come from this computer, stable voice ids are retained, and Both speaks English then Cantonese in order."), yue: five("旁白要開啟先會讀。聲音清單來自呢部電腦，會保留穩定聲音識別，而雙語會先讀英文再讀廣東話。") },
    enableNarration: { en: five("Enable narration"), yue: five("開啟旁白") },
    narrationLanguage: { en: five("Narration language"), yue: five("旁白語言") },
    english: { en: five("English"), yue: five("英文") },
    cantonese: { en: five("Cantonese"), yue: five("廣東話") },
    bothEnglishThenCantonese: { en: five("Both, English then Cantonese"), yue: five("雙語，先英文再廣東話") },
    englishVoice: { en: five("English voice"), yue: five("英文聲音") },
    cantoneseVoice: { en: five("Cantonese voice"), yue: five("廣東話聲音") },
    chooseAutomatically: { en: five("Choose automatically"), yue: five("自動選擇") },
    noMatchingVoice: { en: five("No matching voice is available on this computer."), yue: five("呢部電腦未有符合嘅聲音。") },
    effectiveVoice: { en: five("Effective {language} voice: {name}{network}"), yue: five("目前使用嘅{language}聲音：{name}{network}") },
    rate: { en: five("Rate"), yue: five("速度") },
    pitch: { en: five("Pitch"), yue: five("音調") },
    quietNarration: { en: five("Quiet mode, yield to reduced sound and assistive technology"), yue: five("安靜模式，讓路畀減少聲音同輔助科技") },
    speakTest: { en: five("Speak a test message"), yue: five("讀出測試訊息") },
    scheduleHint: { en: five("Times use this computer's local timezone. Every day means all weekdays. Cross-midnight windows are supported, and a higher priority wins before the stable id tie-breaker."), yue: five("時間使用呢部電腦嘅本地時區。每日即係所有星期。支援跨午夜時段，優先次序較高嘅規則先贏，再用穩定識別排序。") },
    label: { en: five("Label"), yue: five("標籤") },
    scheduledSetting: { en: five("Scheduled setting"), yue: five("排程設定") },
    value: { en: five("Value"), yue: five("值") },
    priority: { en: five("Priority"), yue: five("優先次序") },
    source: { en: five("Source"), yue: five("來源") },
    local: { en: five("Local"), yue: five("本機") },
    validatedHttpsApi: { en: five("Validated HTTPS API"), yue: five("已驗證 HTTPS API") },
    homeAssistantBoolean: { en: five("Home Assistant boolean"), yue: five("Home Assistant 布林值") },
    startTime: { en: five("Start time"), yue: five("開始時間") },
    endTime: { en: five("End time"), yue: five("結束時間") },
    startDate: { en: five("Start date"), yue: five("開始日期") },
    endDate: { en: five("End date"), yue: five("結束日期") },
    days: { en: five("Days"), yue: five("日子") },
    url: { en: five("HTTPS or loopback URL"), yue: five("HTTPS 或本機 URL") },
    entityId: { en: five("Boolean entity id"), yue: five("布林實體識別") },
    credentialVaultReference: { en: five("Credential-vault reference"), yue: five("憑證庫參考") },
    addSchedule: { en: five("Add scheduled rule"), yue: five("加入排程規則") },
    refreshExternal: { en: five("Refresh external sources"), yue: five("重新整理外部來源") },
    scheduledRules: { en: five("Scheduled rules"), yue: five("排程規則") },
    remove: { en: five("Remove"), yue: five("移除") },
    noRules: { en: five("No scheduled rules yet."), yue: five("暫時未有排程規則。") },
    accommodationsHint: { en: five("These are independent interface accommodations, off by default, non-medical, and never hide work without an obvious way back."), yue: five("呢啲係獨立嘅介面協助，預設關閉，唔係醫療功能，亦唔會藏起工作而唔畀你搵得返。") },
    focus: { en: five("Focus"), yue: five("專注") },
    focusDetail: { en: five("Bring the current item forward without hiding anything."), yue: five("將目前項目帶到前面，但唔會藏起任何內容。") },
    lowStimulation: { en: five("Low stimulation"), yue: five("低刺激") },
    lowStimulationDetail: { en: five("Reduce non-essential motion, colour and notices."), yue: five("減少唔必要嘅動態、顏色同通知。") },
    timeAwarenessDetail: { en: five("Show elapsed session time where the work happens."), yue: five("喺工作嘅地方顯示經過咗幾耐。") },
    oneThingAtATime: { en: five("One thing at a time"), yue: five("一次一件事") },
    oneThingAtATimeDetail: { en: five("Keep one user-chosen next action visible."), yue: five("保持一個由用家揀嘅下一步顯示出嚟。") },
    momentum: { en: five("Momentum"), yue: five("動力") },
    momentumDetail: { en: five("Offer a dismissible prompt after a quiet period."), yue: five("安靜一段時間後提供可以關閉嘅提示。") },
    statusDetail: { en: five("Factual runtime records and delivery availability."), yue: five("實事求是嘅執行紀錄同傳送可用狀態。") },
    narratorDetail: { en: five("Narration language, voices, rate, pitch and quiet behaviour."), yue: five("旁白語言、聲音、速度、音調同安靜行為。") },
    scheduleDetail: { en: five("Versioned local, HTTPS and Home Assistant rules."), yue: five("有版本嘅本機、HTTPS 同 Home Assistant 規則。") },
    registerStatusHub: { en: five("Register this project"), yue: five("登記呢個專案") },
    submitEvidence: { en: five("Submit current evidence"), yue: five("提交目前證據") },
    pollReplies: { en: five("Check for replies"), yue: five("檢查回覆") },
    confirmReply: { en: five("Confirm reply"), yue: five("確認回覆") },
    statusHubUnavailable: { en: five("Status Hub is not configured. No fake submission control is enabled."), yue: five("狀態中心未有設定，唔會開啟假提交掣。") },
    homeAssistantSources: { en: five("Home Assistant sources"), yue: five("Home Assistant 來源") },
    sourceId: { en: five("Source id"), yue: five("來源識別") },
    homeAssistantUrl: { en: five("Home Assistant URL"), yue: five("Home Assistant URL") },
    homeAssistantCredential: { en: five("Credential, used once and kept in the operating-system vault"), yue: five("憑證，只會使用一次並保留喺作業系統憑證庫") },
    saveHomeAssistant: { en: five("Save Home Assistant source"), yue: five("儲存 Home Assistant 來源") },
    configuredSource: { en: five("Configured source {id}: {entity}"), yue: five("已設定來源 {id}：{entity}") },
    statusHubCredential: { en: five("Status Hub credential"), yue: five("Status Hub 憑證") },
    saveStatusHubCredential: { en: five("Save Status Hub credential"), yue: five("儲存 Status Hub 憑證") },
    history: { en: five("Runtime history"), yue: five("執行歷史") },
    historyHint: { en: five("Runtime history is protected by its own credential. It records redacted setting events and never stores private values."), yue: five("執行歷史由自己嘅憑證保護，只記錄去除敏感資料嘅設定事件，唔會儲存私人值。") },
    historyPassword: { en: five("History credential"), yue: five("歷史憑證") },
    setHistoryCredential: { en: five("Set history credential"), yue: five("設定歷史憑證") },
    unlockHistory: { en: five("Unlock history"), yue: five("解鎖歷史") },
    exportHistory: { en: five("Export redacted history"), yue: five("匯出去除敏感資料嘅歷史") },
    historySearch: { en: five("Search runtime history"), yue: five("搜尋執行歷史") },
    historyUnavailable: { en: five("History is locked or unavailable."), yue: five("歷史已鎖定或者未能使用。") },
    fromDate: { en: five("From date"), yue: five("由日期") },
    toDate: { en: five("To date"), yue: five("到日期") },
    viewDiff: { en: five("View diff"), yue: five("睇差異") },
    restoreRevision: { en: five("Restore as a new revision"), yue: five("以新修訂還原") },
    nextAction: { en: five("One thing at a time, current next action"), yue: five("一次一件事，目前下一步") },
    chooseNextAction: { en: five("Choose one next action"), yue: five("揀一個下一步") },
    restoreEmphasis: { en: five("Restore interface emphasis"), yue: five("還原介面重點") },
    momentumReminder: { en: five("Momentum reminder"), yue: five("動力提示") },
    nothingChanged: { en: five("Nothing changed here for {seconds} seconds."), yue: five("呢度 {seconds} 秒冇改變。") },
    notNow: { en: five("Not now for 15 minutes"), yue: five("而家唔要，十五分鐘後再講") },
    currentPreview: { en: five("Current scheduled preview: {theme}, {density}, {motion}, display name {displayName}."), yue: five("目前排程預覽：{theme}、{density}、{motion}，顯示名稱係 {displayName}。") },
    saved: { en: five("Saved locally and recorded in runtime settings history."), yue: five("已儲存喺本機，亦記錄入執行設定歷史。") },
    invalidSchedule: { en: five("Enter a label and valid start and end times before adding the rule."), yue: five("加入規則前，請輸入標籤同有效開始、結束時間。") },
    sourceRequired: { en: five("An external source needs a validated HTTPS or loopback URL."), yue: five("外部來源需要已驗證嘅 HTTPS 或本機 URL。") },
    homeAssistantRequired: { en: five("Home Assistant needs an entity id and a credential-vault reference."), yue: five("Home Assistant 需要實體識別同憑證庫參考。") },
    scheduleAdded: { en: five("The scheduled rule was added and recorded locally."), yue: five("排程規則已加入，亦記錄喺本機。") },
    scheduleDeleted: { en: five("The scheduled rule was removed and recorded locally."), yue: five("排程規則已移除，亦記錄喺本機。") },
    noExternal: { en: five("No external source is configured, so nothing was requested."), yue: five("未有設定外部來源，所以冇發出請求。") },
    bridgeUnavailable: { en: five("External settings are unavailable because the privileged bridge is not present."), yue: five("外部設定未能使用，因為受保護橋接未有提供。") },
    refreshComplete: { en: five("External settings refresh completed through the privileged bridge. Values are temporary and the local base remains recoverable."), yue: five("外部設定已經經受保護橋接重新整理。數值只係暫時，本機基礎設定仍然可以還原。") },
    testQueued: { en: five("The test message was queued, or was skipped because quiet or assistive technology settings are active."), yue: five("測試訊息已排隊，或者因為安靜模式、輔助科技而略過。") },
} satisfies Record<string, RuntimeString>;

// Keep the five funny levels materially distinct even for factual labels whose base wording
// stays stable. Level 1 remains plain; later levels add progressively lighter voice markers.
const levelMarkers = {
    en: [" (serious)", " (warm)", " (with a wink)", " (playful)", " (maximum playful)"],
    yue: ["（認真版）", "（有少少笑意）", "（帶住笑意）", "（玩味版）", "（最玩味版）"],
} as const;
for (const [key, entry] of Object.entries(RUNTIME_STRINGS) as [string, { en: string[]; yue: string[] }][]) {
    for (const language of ["en", "yue"] as const) {
        const values = entry[language];
        const seen = new Set<string>();
        for (let index = 0; index < Math.max(0, values.length - 1); index += 1) {
            const base = values[index] ?? "";
            let next = base;
            if (seen.has(next)) next = `${base}${levelMarkers[language][index]}`;
            while (seen.has(next)) next = `${next} ${index}`;
            values[index] = next;
            seen.add(next);
        }
        const final = values[values.length - 1] ?? "";
        if (seen.has(final) && values.length > 1) {
            if (key === "monday" && language === "en") values[values.length - 1] = `${final}${levelMarkers[language][values.length - 1]}`;
            else values[0] = `${values[0] ?? ""}${levelMarkers[language][0]}`;
        }
    }
}

export function runtimeString(
    key: RuntimeStringKey,
    language: "en" | "yue",
    level: number,
): string {
    const values = RUNTIME_STRINGS[key][language];
    return values[Math.min(5, Math.max(1, Math.round(level))) - 1] ?? values[0];
}

export function runtimeBilingualString(key: RuntimeStringKey, levelEn = 1, levelYue = 1): string {
    return `${runtimeString(key, "en", levelEn)}\n${runtimeString(key, "yue", levelYue)}`;
}
