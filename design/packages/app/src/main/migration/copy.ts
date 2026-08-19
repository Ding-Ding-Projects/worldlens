import type { ProfileMigrationPlan } from "./profileMigration.js";

export type ProfileMigrationLanguage = "en" | "yue" | "bilingual";

export interface ProfileMigrationConsentCopy {
    readonly title: string;
    readonly message: string;
    readonly detail: string;
    readonly buttons: readonly [string, string];
}

/**
 * Copy for the pre-window migration decision. Keep the facts identical in every language:
 * before a decision nothing changes; accept stages and verifies; decline preserves and records.
 */
export function profileMigrationConsentCopy(
    language: ProfileMigrationLanguage,
    plan: ProfileMigrationPlan,
): ProfileMigrationConsentCopy {
    const legacyFolder = plan.legacyDirectory.split(/[\\/]/u).at(-1) ?? plan.legacyDirectory;
    const currentFolder = plan.worldlensDirectory.split(/[\\/]/u).at(-1) ?? plan.worldlensDirectory;
    const en = {
        title: "Bring your existing profile to Worldlens?",
        message: "Worldlens found data from Material BlueMap.",
        detail:
            "Status: waiting for your decision. No profile files are changed before you choose an action.\n\n" +
            "Copy and verify: stage a byte-checked copy, then verify it before Worldlens opens it. " +
            "The old profile remains available for retry or rollback.\n\n" +
            "Not now: keep the old profile untouched and remember this answer; you can retry explicitly later.\n\n" +
            `Legacy profile folder: ${legacyFolder}\nWorldlens profile folder: ${currentFolder}`,
        buttons: ["Copy and verify", "Not now"] as const,
    };
    const yue = {
        title: "帶現有 profile 過 Worldlens？",
        message: "Worldlens 搵到 Material BlueMap 嘅資料。",
        detail:
            "狀態：等緊你決定。你揀掣之前，唔會改任何 profile 檔案。\n\n" +
            "複製同驗證：先 staging，再逐檔驗證，之後 Worldlens 先會打開；舊 profile 會保留，方便重試或回復。\n\n" +
            "而家唔做：舊 profile 原封不動，呢個答案會記低；之後可以由明確操作重試。\n\n" +
            `舊 profile 資料夾：${legacyFolder}\nWorldlens profile 資料夾：${currentFolder}`,
        buttons: ["複製同驗證", "而家唔做"] as const,
    };
    if (language === "en") return en;
    if (language === "yue") return yue;
    return {
        title: `${en.title} / ${yue.title}`,
        message: `${en.message} / ${yue.message}`,
        detail: `${en.detail}\n\n${yue.detail}`,
        buttons: [`${en.buttons[0]} / ${yue.buttons[0]}`, `${en.buttons[1]} / ${yue.buttons[1]}`],
    };
}
