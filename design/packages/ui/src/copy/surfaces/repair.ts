/**
 * `RepairPanel.vue`: diagnosing and repairing why a render or the web server failed to
 * start, per `docs/automatic-repair.md`.
 *
 * `main/repair/index.ts` was registered on every launch and reachable by nobody until this
 * panel and its bridge existed. What is voiced here is the state the panel is honest about
 * being in today - see `RepairPanel.vue`'s own doc comment: real failures reach this list
 * the moment something calls `repair:remember`, and nothing has yet, so the empty state is
 * not a placeholder, it is the current, accurate answer.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const REPAIR_VOICED = {
    /*
     * Two facts survive every level: nothing is on record yet, and that is because nothing
     * has failed and been remembered - not because the feature is broken or hiding
     * something. A reader deciding whether to trust an empty list needs both.
     */
    "repair.empty": {
        en: [
            "No failures are on record. One is remembered here the moment a render or the web server fails to start, so it can be diagnosed and, where the failure is understood, repaired.",
            "No failures are on record. One is remembered here the moment a render or the web server fails to start, so it can be diagnosed and, where the failure is understood, repaired.",
            "No failures are on record - one is remembered here the moment a render or the web server fails to start, so it can be diagnosed and repaired where the failure is understood.",
            "Nothing is on record here yet. A failure is remembered the moment a render or the web server fails to start, so it can be diagnosed and, where it is understood, repaired.",
            "Nothing at all is on record here yet, and that is simply because nothing has failed. A failure is remembered the moment a render or the web server fails to start, so it can be diagnosed and, where it is understood, repaired.",
        ],
        yue: [
            "而家未有記錄過任何失敗。一次 render 或者 web server 開唔到就會即刻記喺呢度，等你可以診斷，理解到嘅仲可以修復埋。",
            "而家未有記錄過任何失敗。一次 render 或者 web server 開唔到就會即刻記喺呢度，等你可以診斷，理解到嘅仲可以修復埋。",
            "而家未有記錄過任何失敗，一次 render 或者 web server 開唔到就會即刻記喺呢度，等你診斷，理解到嘅仲可以修復。",
            "呢度而家仲未記錄過任何嘢。一次 render 或者 web server 開唔到，就會即刻記喺呢度，等你診斷，理解到嘅仲可以修復。",
            "呢度而家一項都未記錄過，純粹係因為未有嘢失敗過。一次 render 或者 web server 開唔到，就會即刻記喺呢度，等你診斷，理解到嘅仲可以修復。",
        ],
    },

    "repair.noHost": {
        en: [
            "This build cannot diagnose a failed run. The desktop application is what does.",
            "This build cannot diagnose a failed run. The desktop application is what does.",
            "This build cannot diagnose a failed run - the desktop application is what does.",
            "This build cannot diagnose a failed render or web server, because it is running without the desktop application that does.",
            "There is no way to diagnose a failed run here at all, because this build is running without the desktop application that does, and nothing else in the room can do it either.",
        ],
        yue: [
            "呢個組建冇辦法診斷失敗嘅run。行嗰個係桌面應用程式。",
            "呢個組建冇辦法診斷失敗嘅run。行嗰個係桌面應用程式。",
            "呢個組建冇辦法診斷失敗嘅run，行嗰個係桌面應用程式。",
            "呢個組建冇辦法診斷失敗嘅 render 或者 web server，因為佢喺冇桌面應用程式嘅情況下行緊，而識做嗰個正正就係桌面應用程式。",
            "呢度根本冇辦法診斷失敗嘅run，因為呢個組建冇咗桌面應用程式行緊，而識做嗰個就係桌面應用程式，附近亦都冇第二個幫到手。",
        ],
    },

    /* A diagnose that genuinely found nothing this build knows the shape of. Distinct from
     * an error: the channel worked, it simply had nothing to say. */
    "repair.unexplained": {
        en: [
            "This failure did not match anything this build knows how to explain.",
            "This failure did not match anything this build knows how to explain.",
            "This failure did not match anything this build knows how to explain - which is an honest answer, not a broken one.",
            "This failure did not match any pattern this build recognises, so there is nothing more to say about it than that.",
            "This failure did not match a single pattern this build recognises, and saying so honestly beats guessing at a cause that was never observed.",
        ],
        yue: [
            "呢個失敗同呢個組建識解釋嘅嘢都對唔上。",
            "呢個失敗同呢個組建識解釋嘅嘢都對唔上。",
            "呢個失敗同呢個組建識解釋嘅嘢都對唔上，呢個係老實嘅答案，唔係壞咗。",
            "呢個失敗同呢個組建識嘅任何一個模式都對唔上，所以都冇多嘢好講。",
            "呢個失敗連呢個組建識嘅一個模式都對唔上，老實講一句好過亂估一個根本冇觀察到嘅原因。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const REPAIR_FIXED = {
    "repair.title": { en: "Automatic repair", yue: "自動修復" },
    "repair.loading": { en: "Reading what is on record...", yue: "讀緊已經記錄咗嘅嘢……" },
    "repair.refresh": { en: "Refresh", yue: "重新整理" },
    "repair.diagnose": { en: "Diagnose", yue: "診斷" },
    "repair.run": { en: "Diagnose and repair", yue: "診斷同修復" },
    "repair.subject.render": { en: "Render", yue: "Render" },
    "repair.subject.webServer": { en: "Web server", yue: "Web server" },
    "repair.lineChanges": { en: "+{added}/-{removed}", yue: "+{added}/-{removed}" },
    "repair.reportAction": { en: "Report a problem", yue: "報告問題" },
    "repair.reportPreview": {
        en: "Review every field before submitting. Nothing is sent automatically; optional evidence can be edited or removed.",
        yue: "提交之前請逐項睇清楚。唔會自動傳送；可選證據可以修改或者刪走。",
    },
    "repair.reportRequired": { en: "Included because it identifies this failure.", yue: "因為可以識別呢次失敗，所以會包括。" },
    "repair.reportOptional": { en: "Optional; clear it to remove it from the draft.", yue: "可選；清空就會由草稿刪走。" },
    "repair.reportCopied": { en: "Draft copied. GitHub has not received anything.", yue: "草稿已複製。GitHub 仲未收到任何嘢。" },
    "repair.reportCopyFailed": {
        en: "The clipboard is unavailable. The draft stayed local and no submission was attempted; export it locally instead.",
        yue: "剪貼簿用唔到。草稿留喺本機，冇嘗試提交；可以改為本地匯出。",
    },
    "repair.reportExported": { en: "Draft exported locally. Nothing was submitted.", yue: "草稿已本地匯出。冇提交任何嘢。" },
    "repair.reportCopy": { en: "Copy draft", yue: "複製草稿" },
    "repair.reportMarkdown": { en: "Export Markdown", yue: "匯出 Markdown" },
    "repair.reportJson": { en: "Export JSON", yue: "匯出 JSON" },
    "repair.reportSubmit": { en: "Submit reviewed report", yue: "提交已檢查報告" },
    "repair.reportNoAutoSend": {
        en: "Submission requires this explicit action. The report body stays on this computer until you choose to submit it.",
        yue: "提交一定要你明確撳呢個掣。報告內容會留喺呢部電腦，直到你自己揀提交。",
    },
    "repair.reportOffline": {
        en: "Issue reporting is unavailable while this build is offline.",
        yue: "呢個組建離線期間用唔到報告問題。",
    },
    "repair.reportNotSignedIn": {
        en: "You are not signed in. The draft remains local and is never submitted automatically.",
        yue: "你未登入。草稿會留喺本機，永遠唔會自動提交。",
    },
    "repair.reportReady": {
        en: "The draft is ready to review. Nothing is submitted automatically.",
        yue: "草稿準備好畀你檢查。冇任何嘢會自動提交。",
    },
    "repair.reportLoading": { en: "Preparing a redacted draft...", yue: "準備緊已遮蓋敏感資料嘅草稿……" },
    "repair.reportNoDraft": { en: "The report draft is not available yet.", yue: "報告草稿而家仲未有。" },
    "repair.reportTitle": { en: "Issue title", yue: "問題標題" },
    "repair.reportTitleHint": { en: "Review the title before submitting.", yue: "提交之前請檢查標題。" },
    "repair.reportBodyPreview": { en: "Submission body preview", yue: "提交內容預覽" },
    "repair.reportBodyHint": { en: "This is the exact reviewed body sent to the bridge when you explicitly submit.", yue: "你明確提交時，橋接器收到嘅就係呢段已檢查內容。" },
    "repair.reportSubmitting": { en: "Submitting the reviewed report...", yue: "提交緊已檢查報告……" },
    "repair.reportSubmitted": { en: "The reviewed report was submitted. Open the returned issue link to inspect it.", yue: "已提交檢查過嘅報告。開返問題連結就可以查看。" },
    "repair.reportOpenSubmitted": { en: "Open the submitted issue", yue: "開啟已提交問題" },
    "repair.reportSubmitFailed": { en: "The report could not be submitted. The reviewed draft remains local.", yue: "報告提交唔到。已檢查草稿仍然留喺本機。" },
    "repair.reportSubmitInvalid": { en: "The reviewed report was invalid.", yue: "已檢查報告格式無效。" },
    "repair.reportDraftMissing": { en: "The selected failure is no longer available for a draft.", yue: "揀嗰次失敗已經冇咗，冇法再整草稿。" },
    "repair.reportSubmitOffline": { en: "GitHub is unavailable offline; nothing was submitted.", yue: "離線用唔到 GitHub；冇提交任何嘢。" },
    "repair.reportSubmitNotSignedIn": { en: "You are not signed in; nothing was submitted.", yue: "你未登入；冇提交任何嘢。" },
    "repair.reportSubmitPermissionDenied": { en: "GitHub denied issue creation for this account; nothing was submitted.", yue: "GitHub 拒絕呢個帳戶建立問題；冇提交任何嘢。" },
    "repair.reportSubmitRestoreUncertain": { en: "Submission failed and the prior account state may need review; keep the returned detail.", yue: "提交失敗，之前嘅帳戶狀態可能要再檢查；請保留返詳細資料。" },
    "repair.reportExportCancelled": { en: "Export was cancelled; the reviewed draft remains local.", yue: "匯出已取消；已檢查草稿仍然留喺本機。" },
    "repair.reportExportInvalid": { en: "The reviewed report could not be exported because its content was invalid.", yue: "已檢查報告內容無效，所以匯出唔到。" },
    "repair.reportExportFailed": { en: "The report could not be exported. The reviewed draft remains local.", yue: "報告匯出唔到。已檢查草稿仍然留喺本機。" },
    "repair.reportInvalidUrl": { en: "The report was accepted but the returned issue link was not a safe GitHub URL.", yue: "報告已接受，但返嚟嘅問題連結唔係安全 GitHub 網址。" },
    "repair.reportUnexpectedState": { en: "The report bridge returned an invalid automatic-submission state.", yue: "報告橋接器返咗無效嘅自動提交狀態。" },
    "repair.reportFieldApp": { en: "App", yue: "應用程式" },
    "repair.reportFieldBuild": { en: "Build", yue: "組建" },
    "repair.reportFieldPlatform": { en: "Platform", yue: "平台" },
    "repair.reportFieldEngine": { en: "Engine", yue: "引擎" },
    "repair.reportFieldCategory": { en: "Failure category", yue: "失敗類別" },
    "repair.reportFieldConfig": { en: "Configuration facts", yue: "設定資料" },
    "repair.reportFieldReproduction": { en: "Reproduction steps", yue: "重現步驟" },
    "repair.reportFieldConsole": { en: "Selected console evidence", yue: "選取嘅主控台證據" },
} as const satisfies Record<string, FixedString>;

export const REPAIR_FACTS = {
    "repair.empty": { en: ["record", "remembered"], yue: ["記錄", "記喺呢度"] },
    "repair.noHost": { en: ["desktop application"], yue: ["桌面應用程式"] },
    "repair.unexplained": { en: ["did not match"], yue: ["對唔上"] },
} as const satisfies Record<
    keyof typeof REPAIR_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
