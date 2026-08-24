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
