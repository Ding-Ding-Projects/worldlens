import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const MCSERVER_VOICED = {
    "mcserver.wizard.versionRenderLimit": {
        en: [
            "Showing {shown} of {total} matching versions.",
            "Showing {shown} of {total} matching versions.",
            "Showing {shown} of {total} matching versions, because the catalogue is rather large.",
            "Showing {shown} of {total} matching versions. The rest is one page away, not missing.",
            "Showing {shown} of {total} matching versions. The catalogue has more rows than this card has patience, so use the page buttons.",
        ],
        yue: [
            "而家顯示緊 {shown} / {total} 個符合版本。",
            "而家顯示緊 {shown} / {total} 個符合版本。",
            "而家顯示緊 {shown} / {total} 個符合版本，因為個版本表真係幾大。",
            "而家顯示緊 {shown} / {total} 個符合版本，其餘唔係失蹤，只係喺下一頁。",
            "而家顯示緊 {shown} / {total} 個符合版本。個表大過張卡嘅耐性，撳下一頁就搵得返。",
        ],
    } satisfies VoicedString,
    "mcserver.wizard.flavourCatalogueStale": {
        en: [
            "The {flavour} list is from {at} and could not be refreshed: {reason}",
            "The {flavour} list is from {at} and could not be refreshed: {reason}",
            "The {flavour} list is still from {at}; refresh stopped with: {reason}",
            "The {flavour} list is wearing its {at} coat because refresh stopped with: {reason}",
            "The {flavour} list is proudly reusing {at}. Refresh met this failure: {reason}",
        ],
        yue: [
            "{flavour} 版本表係 {at} 嗰份，未能更新：{reason}",
            "{flavour} 版本表係 {at} 嗰份，未能更新：{reason}",
            "{flavour} 版本表仲係 {at} 嗰份，更新喺呢度停咗：{reason}",
            "{flavour} 版本表著住 {at} 嗰件外套，因為更新喺呢度停咗：{reason}",
            "{flavour} 版本表好有骨氣咁重用 {at} 嗰份，更新撞到呢個問題：{reason}",
        ],
    } satisfies VoicedString,
    "mcserver.wizard.missingServerArtifact": {
        en: [
            "Server download unavailable",
            "Server download unavailable",
            "No server download was published for this exact version",
            "No server download was published for this exact version, so this row cannot be selected",
            "This exact version arrived without a server download, so the wizard is keeping it visible and sensibly unselectable",
        ],
        yue: [
            "冇伺服器下載",
            "冇伺服器下載",
            "呢個確實版本冇發布伺服器下載",
            "呢個確實版本冇發布伺服器下載，所以呢行唔可以揀",
            "呢個確實版本冇帶伺服器下載，wizard 照樣畀你睇，但唔畀你誤揀",
        ],
    } satisfies VoicedString,
} as const;

export const MCSERVER_FIXED = {
    "mcserver.readiness.title": { en: "Remote process readiness", yue: "遠端程序準備檢查" },
    "mcserver.readiness.option": { en: "Remote process (SSH): readiness", yue: "遠端程序（SSH）：準備檢查" },
    "mcserver.readiness.optionDescription": { en: "Inspect a Linux host for process hosting. Installation is not available yet.", yue: "檢查 Linux 主機能否承載程序。目前未提供安裝。" },
    "mcserver.readiness.scope": { en: "Inspect the selected host without creating folders, changing host settings or installing a server. Remote process installation is not available yet.", yue: "檢查所選主機，唔會建立資料夾、更改主機設定或者安裝伺服器。目前未提供遠端程序安裝。" },
    "mcserver.readiness.parent": { en: "Saved host parent folder", yue: "主機已儲存嘅上層資料夾" },
    "mcserver.readiness.javaPath": { en: "Remote Java executable", yue: "遠端 Java 執行檔" },
    "mcserver.readiness.memory": { en: "Server memory (MiB)", yue: "伺服器記憶體（MiB）" },
    "mcserver.readiness.port": { en: "Server TCP port", yue: "伺服器 TCP 連接埠" },
    "mcserver.readiness.check": { en: "Check host readiness", yue: "檢查主機準備狀態" },
    "mcserver.readiness.unavailable": { en: "This build cannot inspect remote process readiness.", yue: "呢個版本未能檢查遠端程序準備狀態。" },
    "mcserver.readiness.invalid": { en: "Select a saved host with an absolute parent folder, an absolute Java path, valid memory and a TCP port from 1 to 65535.", yue: "請選擇已儲存主機、絕對上層路徑、絕對 Java 路徑、有效記憶體，以及 1 至 65535 嘅 TCP 連接埠。" },
    "mcserver.readiness.failed": { en: "The selected host could not be inspected. Check the saved profile, trusted host identity and connection, then retry.", yue: "未能檢查所選主機。請核對已儲存設定、已信任主機身分同連線，再試一次。" },
    "mcserver.readiness.javaRequirement": { en: "Recorded Java feature", yue: "版本表記錄嘅 Java 版本" },
    "mcserver.readiness.ready": { en: "Observed ready", yue: "已觀察到準備就緒" },
    "mcserver.readiness.blocked": { en: "Needs attention", yue: "需要處理" },
    "mcserver.readiness.unknown": { en: "Unknown", yue: "未知" },
    "mcserver.readiness.installPending": { en: "Host inspection is available here. Remote process installation is not available yet, so creation cannot continue.", yue: "可以喺呢度檢查主機。目前未提供遠端程序安裝，所以未能繼續建立。" },
    "mcserver.readiness.hostHint": { en: "Choose the saved host to inspect. Only its existing parent folder will be checked.", yue: "選擇要檢查嘅已儲存主機。只會檢查現有上層資料夾。" },
    "mcserver.readiness.label.platform": { en: "Linux host", yue: "Linux 主機" },
    "mcserver.readiness.label.systemd": { en: "systemd 254 or newer", yue: "systemd 254 或以上" },
    "mcserver.readiness.label.user-manager": { en: "User service manager", yue: "使用者服務管理員" },
    "mcserver.readiness.label.linger": { en: "User lingering", yue: "使用者持續運行設定" },
    "mcserver.readiness.label.directory": { en: "Existing writable parent", yue: "現有可寫上層資料夾" },
    "mcserver.readiness.label.java": { en: "Catalogue Java feature", yue: "版本表要求嘅 Java 版本" },
    "mcserver.readiness.label.memory": { en: "Available memory (MiB)", yue: "可用記憶體（MiB）" },
    "mcserver.readiness.label.disk": { en: "Free storage (bytes)", yue: "可用儲存空間（bytes）" },
    "mcserver.readiness.label.port": { en: "TCP listening port", yue: "TCP 監聽連接埠" },
    "mcserver.readiness.reason.linux": { en: "Linux was observed.", yue: "已觀察到 Linux。" },
    "mcserver.readiness.reason.linux-required": { en: "This route requires Linux.", yue: "呢條路徑需要 Linux。" },
    "mcserver.readiness.reason.systemd-254-required": { en: "systemd 254 or newer is required.", yue: "需要 systemd 254 或以上。" },
    "mcserver.readiness.reason.user-manager-running": { en: "The user service manager must answer and report version 254 or newer.", yue: "使用者服務管理員必須回應，並回報版本 254 或以上。" },
    "mcserver.readiness.reason.linger-required": { en: "Lingering must already be enabled by the host administrator.", yue: "主機管理員必須已啟用使用者持續運行。" },
    "mcserver.readiness.reason.existing-canonical-writable-parent": { en: "The saved parent must exist, resolve to the same canonical path and allow writing and directory search.", yue: "已儲存上層資料夾必須存在、解析成同一標準路徑，而且可以寫入及進入。" },
    "mcserver.readiness.reason.catalogue-java-feature-required": { en: "Java must match the selected catalogue feature. Unknown requirements remain unverified.", yue: "Java 必須符合所選版本表要求。未知要求仍然未經驗證。" },
    "mcserver.readiness.reason.available-memory-plus-512-mib-reserve": { en: "Available memory must cover this allocation plus a 512 MiB reserve.", yue: "可用記憶體必須足夠呢個配置，另外預留 512 MiB。" },
    "mcserver.readiness.reason.free-bytes-observed-not-size-estimate": { en: "This is observed free space, not an estimate of future world storage.", yue: "呢個係觀察到嘅可用空間，唔係未來世界儲存用量估算。" },
    "mcserver.readiness.reason.tcp-listener-snapshot": { en: "No TCP listener may currently occupy the port. This check does not reserve it.", yue: "連接埠目前唔可以畀 TCP 程序佔用。呢個檢查唔會預留連接埠。" },
    "mcserver.readiness.reason.not-observed": { en: "This check has not produced a verified observation.", yue: "呢個檢查未有可驗證嘅觀察結果。" },
    "mcserver.wizard.historicalBeta": { en: "Historical beta", yue: "歷史 Beta 版本" },
    "mcserver.wizard.historicalAlpha": { en: "Historical alpha", yue: "歷史 Alpha 版本" },
    "mcserver.wizard.recommended": { en: "Recommended", yue: "推薦" },
    "mcserver.wizard.toggleFamily": {
        en: "{family}, {n} exact versions",
        yue: "{family}，{n} 個確實版本",
    },
    "mcserver.wizard.wiki": { en: "Wiki", yue: "Wiki" },
    "mcserver.picker.search": { en: "Search options", yue: "搜尋選項" },
    "mcserver.wizard.noVersions": {
        en: "No versions were fetched for this flavour.",
        yue: "呢種伺服器類型未有攞到版本。",
    },
    "mcserver.wizard.noLoaderVersions": {
        en: "No matching loader versions.",
        yue: "冇符合嘅 loader 版本。",
    },
    "mcserver.wizard.noWorldTypes": { en: "No matching world types.", yue: "冇符合嘅世界類型。" },
} satisfies Record<string, FixedString>;

export const MCSERVER_FACTS = {
    "mcserver.wizard.versionRenderLimit": {
        en: ["{shown}", "{total}"],
        yue: ["{shown}", "{total}"],
    },
    "mcserver.wizard.flavourCatalogueStale": {
        en: ["{flavour}", "{at}", "{reason}"],
        yue: ["{flavour}", "{at}", "{reason}"],
    },
    "mcserver.wizard.missingServerArtifact": { en: ["server download"], yue: ["伺服器下載"] },
} as const;
