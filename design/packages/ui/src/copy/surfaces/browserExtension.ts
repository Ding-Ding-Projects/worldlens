/**
 * The browser-extension download capture surfaces: the Start download decision, the live
 * Downloading dialog, and the completion notice.
 *
 * Two facts are pinned in `BROWSEREXTENSION_FACTS` and never move, at any funny level:
 *
 *  - **Nothing has started until Start download is pressed.** `browserExtension.start.lede`
 *    keeps "before any transfer starts" in words at every level, because the whole point of
 *    this surface is that the decision comes first.
 *  - **A completion notice never claims success early.** `browserExtension.complete.failed`
 *    keeps the word "failed" itself pinned, so a playful rewrite cannot soften a broken
 *    transfer into something that reads as fine.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const BROWSEREXTENSION_VOICED = {
    "browserExtension.page.lede": {
        en: [
            "Every download a browser extension hands to this application: proposed, started, watched, finished, in that order.",
            "Every download a browser extension hands to this application goes: proposed, started, watched, finished - in that order, and nothing happens until you say so.",
            "Every download a browser extension hands to this application passes through here first: proposed, started, watched, and finished, in that order and never out of it.",
            "Every download a browser extension hands to this application passes through here first, in order: proposed, started, watched, finished. No skipping ahead, ever.",
            "This is the whole relay a browser-extension download runs: proposed, started, watched, finished, in that exact order, with you holding the button at the only step that matters.",
        ],
        yue: [
            "瀏覽器擴充功能交畀呢個應用程式嘅每一個下載：建議、開始、睇住、完成，順序嚟。",
            "瀏覽器擴充功能交畀呢個應用程式嘅每一個下載都係：建議、開始、睇住、完成 - 順序嚟，未撳掣之前乜都唔會開始。",
            "瀏覽器擴充功能交畀呢個應用程式嘅每一個下載，都先經過呢度：建議、開始、睇住、完成，順序嚟，唔會跳。",
            "瀏覽器擴充功能交畀呢個應用程式嘅每一個下載，順序都要經過呢度：建議、開始、睇住、完成，唔會跳步。",
            "呢度就係一個瀏覽器擴充功能下載嘅全程接力：建議、開始、睇住、完成，順序精準，最緊要嗰粒掣一直喺你手。",
        ],
    },
    "browserExtension.start.lede": {
        en: [
            "This file has not started downloading. Confirm starts the real transfer; cancel leaves the queue unchanged.",
            "This file has not started downloading, and won't until you say so. Confirm starts the real transfer; cancel leaves the queue unchanged.",
            "Nothing below is a preview: this file has not started downloading. Confirm starts the real transfer; cancel leaves the queue unchanged.",
            "This file has not started downloading, full stop. Confirm starts the real transfer; cancel leaves the queue unchanged.",
            "This file has not started downloading, and it will not until you say so. Confirm starts the real transfer; cancel leaves the queue unchanged.",
        ],
        yue: [
            "呢個檔案未開始下載。撳確認就開始真正下載；撳取消隊列就維持原狀。",
            "呢個檔案未開始下載，未到你話事之前都唔會郁。撳確認就開始真正下載；撳取消隊列就維持原狀。",
            "下面唔係預覽：呢個檔案未開始下載。撳確認就開始真正下載；撳取消隊列就維持原狀。",
            "呢個檔案未開始下載，講明係咁。撳確認就開始真正下載；撳取消隊列就維持原狀。",
            "呢個檔案未開始下載，未到你話事一直都唔會郁。撳確認就開始真正下載；撳取消隊列就維持原狀。",
        ],
    },
    "browserExtension.start.noHost": {
        en: [
            "This build cannot receive captures from a browser extension. A capture needs the desktop application's own bridge to a real extension, which this window does not have.",
            "This build cannot receive captures from a browser extension - it needs the desktop application's own bridge to a real extension, which this window does not have.",
            "This build has no way to receive a capture from a browser extension, because it needs the desktop application's own bridge to a real extension, and this window does not have one.",
            "There is no route into this build from a browser extension: a capture needs the desktop application's own bridge to a real extension, and this window simply has none.",
            "A browser extension has nowhere to hand a capture in this build: it needs the desktop application's own bridge to a real extension, and this window has none, so there is genuinely nothing to press here.",
        ],
        yue: [
            "呢個 build 收唔到瀏覽器擴充功能嘅下載。要有桌面應用程式自己嘅 bridge 去接一個真嘅擴充功能，但呢個窗口冇。",
            "呢個 build 收唔到瀏覽器擴充功能嘅下載 - 要有桌面應用程式自己嘅 bridge 去接一個真嘅擴充功能，但呢個窗口冇。",
            "呢個 build 完全冇辦法收瀏覽器擴充功能嘅下載，因為要有桌面應用程式自己嘅 bridge 去接一個真嘅擴充功能，而呢個窗口冇呢條 bridge。",
            "瀏覽器擴充功能喺呢個 build 入面搵唔到路入嚟：要有桌面應用程式自己嘅 bridge 去接一個真嘅擴充功能，呢個窗口根本冇。",
            "瀏覽器擴充功能喺呢個 build 度完全冇地方交低啲嘢：要有桌面應用程式自己嘅 bridge 去接一個真嘅擴充功能，呢個窗口一條都冇，所以呢度真係冇嘢好撳。",
        ],
    },
    "browserExtension.downloading.lede": {
        en: [
            "This is the real transfer, watched live. The controls below operate the real download; nothing here is a simulated progress value.",
            "This is the real transfer, watched live, updated as it runs. The controls below operate the real download; nothing here is a simulated progress value.",
            "Every number below is the real transfer, watched live. The controls below operate the real download; nothing here is a simulated progress value.",
            "This is the real transfer, watched down to the byte. The controls below operate the real download; nothing here is a simulated progress value.",
            "This is the real transfer, watched down to the byte, because a fake progress bar is the one thing this dialog refuses to be. The controls below operate the real download; nothing here is a simulated progress value.",
        ],
        yue: [
            "呢個係真實傳輸，即時睇住。下面嘅控制掣操作緊真正下載；呢度冇假嘅進度數值。",
            "呢個係真實傳輸，即時睇住，一路更新。下面嘅控制掣操作緊真正下載；呢度冇假嘅進度數值。",
            "下面每個數字都係真實傳輸，即時睇住。下面嘅控制掣操作緊真正下載；呢度冇假嘅進度數值。",
            "呢個係真實傳輸，睇到每粒 byte。下面嘅控制掣操作緊真正下載；呢度冇假嘅進度數值。",
            "呢個係真實傳輸，睇到每粒 byte，因為假進度條係呢個對話框最唔想做嘅事。下面嘅控制掣操作緊真正下載；呢度冇假嘅進度數值。",
        ],
    },
    "browserExtension.downloading.unknown": {
        en: [
            "Not known yet",
            "Not known yet",
            "Not known yet - no guessing here",
            "Not known yet, and this dialog will not guess",
            "Not known yet, and guessing is off the table",
        ],
        yue: [
            "重未知道",
            "重未知道",
            "重未知道 - 呢度唔會亂估",
            "重未知道，呢個對話框唔會亂估",
            "重未知道，估都唔使估",
        ],
    },
    "browserExtension.complete.completed": {
        en: [
            "{filename} finished downloading.",
            "{filename} finished downloading, all bytes accounted for.",
            "{filename} finished downloading. Every byte landed.",
            "{filename} finished. The whole file landed, no shortcuts taken.",
            "{filename} finished, and finished properly - every byte landed where it should.",
        ],
        yue: [
            "{filename} 下載完成。",
            "{filename} 下載完成，每個 byte 都齊。",
            "{filename} 下載完成，一個 byte 都冇少。",
            "{filename} 完成咗，成個檔案落晒地，冇偷步。",
            "{filename} 完成咗，仲完成得幾靚仔，每個 byte 都到齊位。",
        ],
    },
    "browserExtension.complete.cancelled": {
        en: [
            "{filename} was cancelled.",
            "{filename} was cancelled before it finished.",
            "{filename} was cancelled before it finished. Nothing was reported as complete.",
            "{filename} was cancelled part-way through, and nothing here pretends otherwise.",
            "{filename} got cancelled mid-flight, and this notice is not going to dress that up as a finish.",
        ],
        yue: [
            "{filename} 已經取消。",
            "{filename} 喺完成之前取消咗。",
            "{filename} 喺完成之前取消咗，冇報做完成。",
            "{filename} 下載到一半就取消咗，呢度唔會扮冇事。",
            "{filename} 中途取消咗，呢個通知唔會扮完成畀你睇。",
        ],
    },
    "browserExtension.complete.failed": {
        en: [
            "{filename} failed: {reason}",
            "{filename} failed to download: {reason}",
            "{filename} failed: {reason} - nothing here claims it finished.",
            "{filename} failed. {reason} It never finished, and this notice will not say it did.",
            "{filename} failed - {reason} It never finished, and pretending it did is exactly what this notice exists to refuse.",
        ],
        yue: [
            "{filename} 失敗：{reason}",
            "{filename} 下載失敗：{reason}",
            "{filename} 失敗：{reason} - 呢度唔會話佢完成咗。",
            "{filename} 失敗咗。{reason} 佢從未完成，呢個通知唔會話完成。",
            "{filename} 失敗咗 - {reason} 佢從未完成，扮完成正正係呢個通知拒絕做嘅事。",
        ],
    },
    "browserExtension.list.empty": {
        en: [
            "No captures yet. This page fills in when a browser extension hands this application a file to download.",
            "No captures yet - this page fills in the moment a browser extension hands this application a file to download.",
            "No captures yet. The moment a browser extension proposes a file, it lands on this page first, before anything downloads.",
            "No captures yet. A browser extension has to actually propose a file before this page has anything to show.",
            "No captures yet, and that is honest emptiness rather than a broken page - a browser extension has to propose a file first, and none has yet.",
        ],
        yue: [
            "重未有下載。瀏覽器擴充功能交檔案畀呢個應用程式嗰陣，呢版就會有嘢。",
            "重未有下載 - 瀏覽器擴充功能一交檔案畀呢個應用程式，呢版即刻有嘢。",
            "重未有下載。瀏覽器擴充功能一提出檔案，就會先落呢版，之後先至下載。",
            "重未有下載。要有瀏覽器擴充功能真係提出一個檔案，呢版先有嘢畀你睇。",
            "重未有下載，呢個係老老實實嘅空，唔係壞咗 - 要有瀏覽器擴充功能先提出檔案，而目前重未有。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const BROWSEREXTENSION_FIXED = {
    "tabs.page.browserExtension": { en: "Browser downloads", yue: "瀏覽器下載" },
    "browserExtension.start.title": { en: "Start download", yue: "開始下載" },
    "browserExtension.start.fileLabel": { en: "File", yue: "檔案" },
    "browserExtension.start.sourceLabel": { en: "Source", yue: "來源" },
    "browserExtension.start.destinationLabel": { en: "Destination", yue: "目的地" },
    "browserExtension.start.sizeLabel": { en: "Size", yue: "大小" },
    "browserExtension.start.sizeUnknown": { en: "Unknown", yue: "未知" },
    "browserExtension.start.confirm": { en: "Start download", yue: "開始下載" },
    "browserExtension.start.cancel": { en: "Cancel", yue: "取消" },
    "browserExtension.downloading.title": { en: "Downloading", yue: "下載緊" },
    "browserExtension.downloading.downloaded": { en: "Downloaded", yue: "已下載" },
    "browserExtension.downloading.rate": { en: "Rate", yue: "速率" },
    "browserExtension.downloading.eta": { en: "Time remaining", yue: "剩餘時間" },
    "browserExtension.downloading.pause": { en: "Pause", yue: "暫停" },
    "browserExtension.downloading.resume": { en: "Resume", yue: "繼續" },
    "browserExtension.downloading.cancel": { en: "Cancel download", yue: "取消下載" },
    "browserExtension.downloading.statePaused": { en: "Paused", yue: "已暫停" },
    "browserExtension.downloading.stateFailed": { en: "Failed", yue: "失敗" },
    "browserExtension.complete.title": { en: "Download complete", yue: "下載完成" },
    "browserExtension.complete.dismiss": { en: "Dismiss", yue: "知道喇" },
} as const satisfies Record<string, FixedString>;

export const BROWSEREXTENSION_FACTS = {
    "browserExtension.page.lede": {
        en: ["proposed", "started", "watched", "finished"],
        yue: ["建議", "開始", "睇住", "完成"],
    },
    "browserExtension.start.lede": {
        en: [
            "has not started downloading",
            "Confirm starts the real transfer; cancel leaves the queue unchanged",
        ],
        yue: ["未開始下載", "撳確認就開始真正下載；撳取消隊列就維持原狀"],
    },
    "browserExtension.start.noHost": {
        en: ["application's own bridge to a real extension"],
        yue: ["桌面應用程式自己嘅 bridge 去接一個真嘅擴充功能"],
    },
    "browserExtension.downloading.lede": {
        en: ["real transfer", "operate the real download", "simulated progress value"],
        yue: ["真實傳輸", "操作緊真正下載", "假嘅進度數值"],
    },
    "browserExtension.downloading.unknown": {
        en: ["Not known yet"],
        yue: ["重未知道"],
    },
    "browserExtension.complete.completed": {
        en: ["{filename}", "finished"],
        yue: ["{filename}", "完成"],
    },
    "browserExtension.complete.cancelled": {
        en: ["{filename}", "cancelled"],
        yue: ["{filename}", "取消"],
    },
    "browserExtension.complete.failed": {
        en: ["{filename}", "failed", "{reason}"],
        yue: ["{filename}", "失敗", "{reason}"],
    },
    "browserExtension.list.empty": {
        en: ["No captures yet", "browser extension"],
        yue: ["重未有下載", "瀏覽器擴充功能"],
    },
} as const satisfies Record<keyof typeof BROWSEREXTENSION_VOICED, { en: readonly string[]; yue: readonly string[] }>;
