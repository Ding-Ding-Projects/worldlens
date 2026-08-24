export type RuntimeStringKey = keyof typeof RUNTIME_STRINGS;
type Five = readonly [string, string, string, string, string];
interface RuntimeString {
    readonly en: Five;
    readonly yue: Five;
}

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
} satisfies Record<string, RuntimeString>;

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
