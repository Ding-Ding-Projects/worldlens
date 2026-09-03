/**
 * Every word the Chunker conversion page says.
 *
 * The page walks somebody from "this world" to "a converted copy of this world", and the
 * one fact that has to survive every funny level and both languages is that the conversion
 * writes a NEW world folder and leaves the source exactly where it is. Somebody who
 * believes their only copy is about to be rewritten will not press the button, and somebody
 * who believes the opposite will not take a backup. So that sentence is guarded by a fact
 * on every level rather than left to whichever wording a level happened to produce.
 *
 * The same rule governs the lossy notes. A level may joke about a block that does not exist
 * on the other edition; it may not stop saying that the block is replaced.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const CHUNKER_VOICED = {
    "chunker.lead": {
        en: [
            "Convert a Minecraft world between editions and versions with Chunker. The result is written to a new folder; the world you pick is not modified.",
            "Convert a Minecraft world between editions and versions with Chunker. The result is written to a new folder; the world you pick is not modified.",
            "Chunker converts a world between editions and versions. It writes a new folder, and the world you pick is not modified.",
            "Chunker takes a world across editions and versions. Everything lands in a new folder, and the world you pick is not modified, so your save stays exactly as you left it.",
            "Chunker ferries a world from one edition to another. It builds a new folder to put the result in, and the world you pick is not modified, so nothing you already own is at stake here.",
        ],
        yue: [
            "用 Chunker 將 Minecraft 世界喺唔同版本之間轉換。結果會寫入一個新資料夾，你揀嘅世界唔會改動。",
            "用 Chunker 將 Minecraft 世界喺唔同版本之間轉換。結果會寫入一個新資料夾，你揀嘅世界唔會改動。",
            "Chunker 會將世界轉去另一個版本，寫入一個新資料夾，你揀嘅世界唔會改動。",
            "Chunker 會帶住個世界過去另一個版本，全部結果落喺一個新資料夾，你揀嘅世界唔會改動，個存檔照舊。",
            "Chunker 好似搬屋咁將個世界搬去另一個版本，開個新資料夾放結果，你揀嘅世界唔會改動，你原本嗰份完全安全。",
        ],
    },
    "chunker.sourceUnknown": {
        en: [
            "This build cannot tell which edition or version this folder holds, so it is reported as unknown rather than guessed.",
            "This build cannot tell which edition or version this folder holds, so it is reported as unknown rather than guessed.",
            "The edition and version of this folder are unknown to this build, and a guess would be worse than saying so.",
            "This build cannot read the edition or version out of that folder. It stays unknown here rather than becoming a guess you would have no way to check.",
            "That folder is keeping its edition and version to itself. It stays unknown on this screen, because a confident guess is the one answer that would actually cost you something.",
        ],
        yue: [
            "呢個版本讀唔到呢個資料夾嘅版本，所以顯示為未知，唔會亂估。",
            "呢個版本讀唔到呢個資料夾嘅版本，所以顯示為未知，唔會亂估。",
            "呢個資料夾嘅版本喺呢度係未知，亂估仲衰過直接講。",
            "呢個版本讀唔出嗰個資料夾係邊個版本，所以就寫住未知，唔會變成一個你查唔到嘅估算。",
            "嗰個資料夾唔肯講自己邊個版本，所以呢度就寫未知，因為亂咁講得好肯定先至最伏。",
        ],
    },
    "chunker.pruneSummary": {
        en: [
            "Chunks outside the boundary are dropped from the converted copy.",
            "Chunks outside the boundary are dropped from the converted copy.",
            "Anything past the edge goes: chunks outside the boundary are dropped from the converted copy.",
            "Only what sits inside the boundary is carried over. Chunks outside the boundary are dropped from the converted copy, and the source keeps them.",
            "The boundary is a fence, and the converted copy only gets what is inside it. Chunks outside the boundary are dropped from the converted copy, while your original world keeps every last one.",
        ],
        yue: [
            "範圍以外嘅區塊唔會出現喺轉換後嘅世界。",
            "範圍以外嘅區塊唔會出現喺轉換後嘅世界。",
            "出咗界就冇：範圍以外嘅區塊唔會出現喺轉換後嘅世界。",
            "只有範圍以內先會帶過去，範圍以外嘅區塊唔會出現喺轉換後嘅世界，原本嗰個世界照樣留住。",
            "呢條界好似圍欄咁，出面嗰啲一律唔跟隊：範圍以外嘅區塊唔會出現喺轉換後嘅世界，你原本嗰份就乜都仲喺度。",
        ],
    },
    "chunker.reviewLead": {
        en: [
            "Read this before starting. Every line below is something the conversion will drop or approximate.",
            "Read this before starting. Every line below is something the conversion will drop or approximate.",
            "Worth a read before starting: every line below is something the conversion will drop or approximate.",
            "This is the honest part. Every line below is something the conversion will drop or approximate, listed before anything runs rather than afterwards.",
            "Here comes the small print, up front where small print belongs. Every line below is something the conversion will drop or approximate, and you get to read it before a single file is written.",
        ],
        yue: [
            "開始之前請睇清楚。下面每一行都係轉換會捨棄或者近似處理嘅嘢。",
            "開始之前請睇清楚。下面每一行都係轉換會捨棄或者近似處理嘅嘢。",
            "開始之前值得睇一睇：下面每一行都係轉換會捨棄或者近似處理嘅嘢。",
            "呢度就係老實嗰part。下面每一行都係轉換會捨棄或者近似處理嘅嘢，全部喺開工之前列曬出嚟。",
            "細字條款喺呢度，而且擺喺前面。下面每一行都係轉換會捨棄或者近似處理嘅嘢，一個檔案都未寫你就已經睇得曬。",
        ],
    },
    "chunker.cancelledNote": {
        en: [
            "The conversion was cancelled. Anything already written to the output folder is incomplete.",
            "The conversion was cancelled. Anything already written to the output folder is incomplete.",
            "Cancelled. Anything already written to the output folder is incomplete and should not be played.",
            "You stopped it, so it stopped. Anything already written to the output folder is incomplete, and your source world is untouched as always.",
            "Pulled the handbrake. Anything already written to the output folder is incomplete, which is a polite way of saying do not load it, and your source world never noticed a thing.",
        ],
        yue: [
            "轉換已取消。已經寫入輸出資料夾嘅嘢係唔完整。",
            "轉換已取消。已經寫入輸出資料夾嘅嘢係唔完整。",
            "取消咗。已經寫入輸出資料夾嘅嘢係唔完整，唔好開嚟玩。",
            "你叫停就停。已經寫入輸出資料夾嘅嘢係唔完整，而你原本個世界一如既往冇郁過。",
            "拉咗手掣。已經寫入輸出資料夾嘅嘢係唔完整，即係唔好載入佢，而你原本個世界完全唔知發生過乜。",
        ],
    },
    "chunker.failedNote": {
        en: [
            "The conversion did not finish. The reason is listed above, and the source world is unchanged.",
            "The conversion did not finish. The reason is listed above, and the source world is unchanged.",
            "It did not finish. The reason is listed above, and the source world is unchanged.",
            "This one did not finish. The reason is listed above rather than swallowed, and the source world is unchanged.",
            "It fell over. The reason is listed above rather than vanishing into a log nobody opens, and the source world is unchanged, which is the whole point of writing somewhere else.",
        ],
        yue: [
            "轉換未完成。原因喺上面，原本個世界冇改變。",
            "轉換未完成。原因喺上面，原本個世界冇改變。",
            "做唔完。原因喺上面，原本個世界冇改變。",
            "呢次做唔完。原因喺上面列住，唔會靜雞雞收埋，原本個世界冇改變。",
            "冧咗。原因喺上面寫住，唔會跌落一個冇人開嘅log度，而原本個世界冇改變，呢個就係寫去第二度嘅意義。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const CHUNKER_FIXED = {
    /* The tab label, which lives here rather than beside the other page labels because the
       page and its words arrived together. */
    "tabs.page.chunker": { en: "Convert", yue: "轉換" },
    "tabs.page.converter": { en: "File converter", yue: "檔案轉換器" },
    "chunker.title": { en: "Convert a world", yue: "轉換世界" },
    "chunker.step.source": { en: "Source world", yue: "來源世界" },
    "chunker.step.target": { en: "Target edition", yue: "目標版本" },
    "chunker.step.trim": { en: "Trim and dimensions", yue: "修剪同維度" },
    "chunker.step.blocks": { en: "Block mapping", yue: "方塊對應" },
    "chunker.step.settings": { en: "World settings", yue: "世界設定" },
    "chunker.step.review": { en: "Review", yue: "覆核" },
    "chunker.step.run": { en: "Convert", yue: "轉換" },
    "chunker.back": { en: "Back", yue: "上一步" },
    "chunker.next": { en: "Next", yue: "下一步" },
    "chunker.sourceFolder": { en: "World folder", yue: "世界資料夾" },
    "chunker.detected": { en: "Detected format", yue: "偵測到嘅格式" },
    "chunker.unknown": { en: "Unknown", yue: "未知" },
    "chunker.redetect": { en: "Detect again", yue: "再偵測一次" },
    "chunker.edition": { en: "Edition", yue: "版本類型" },
    "chunker.version": { en: "Version", yue: "版本" },
    "chunker.outputFolder": { en: "Output folder", yue: "輸出資料夾" },
    "chunker.overwrite": { en: "The output folder already exists", yue: "輸出資料夾已經存在" },
    "chunker.overwriteAction": {
        en: "Replace everything currently in the output folder. This cannot be undone.",
        yue: "取代輸出資料夾入面所有嘢。呢個動作冇得還原。",
    },
    "chunker.overwriteConfirm": { en: "Replace the folder", yue: "取代個資料夾" },
    "chunker.trimEnabled": { en: "Trim to a boundary", yue: "按範圍修剪" },
    "chunker.minX": { en: "Minimum X", yue: "最小 X" },
    "chunker.maxX": { en: "Maximum X", yue: "最大 X" },
    "chunker.minZ": { en: "Minimum Z", yue: "最小 Z" },
    "chunker.maxZ": { en: "Maximum Z", yue: "最大 Z" },
    "chunker.dimensions": { en: "Dimension mapping", yue: "維度對應" },
    "chunker.dimensionDrop": { en: "Do not convert", yue: "唔轉換" },
    "chunker.blockSearch": { en: "Search block mappings", yue: "搵方塊對應" },
    "chunker.blockFrom": { en: "Source block", yue: "來源方塊" },
    "chunker.blockTo": { en: "Replacement block", yue: "取代方塊" },
    "chunker.blockAdd": { en: "Add override", yue: "加入自訂對應" },
    "chunker.blockClear": { en: "Clear", yue: "清除" },
    "chunker.blockNone": { en: "No overrides. Chunker's own mapping is used for every block.", yue: "冇自訂對應，全部方塊用 Chunker 本身嘅對應。" },
    "chunker.worldName": { en: "World name", yue: "世界名" },
    "chunker.seed": { en: "Seed", yue: "種子" },
    "chunker.spawnX": { en: "Spawn X", yue: "出生點 X" },
    "chunker.spawnY": { en: "Spawn Y", yue: "出生點 Y" },
    "chunker.spawnZ": { en: "Spawn Z", yue: "出生點 Z" },
    "chunker.gameRules": { en: "Game rules", yue: "遊戲規則" },
    "chunker.start": { en: "Start the conversion", yue: "開始轉換" },
    "chunker.cancel": { en: "Cancel the conversion", yue: "取消轉換" },
    "chunker.phase": { en: "Stage", yue: "階段" },
    "chunker.log": { en: "Converter output", yue: "轉換器輸出" },
    "chunker.done": { en: "Converted", yue: "已轉換" },
    "chunker.noBridge": {
        en: "This build has no converter, so nothing on this page can run.",
        yue: "呢個版本冇轉換器，所以呢一頁乜都行唔到。",
    },
} as const satisfies Record<string, FixedString>;

export const CHUNKER_FACTS = {
    "chunker.lead": {
        en: ["Chunker", "not modified"],
        yue: ["Chunker", "唔會改動"],
    },
    "chunker.sourceUnknown": {
        en: ["unknown"],
        yue: ["未知"],
    },
    "chunker.pruneSummary": {
        en: ["outside the boundary are dropped"],
        yue: ["範圍以外嘅區塊唔會出現喺轉換後嘅世界"],
    },
    "chunker.reviewLead": {
        en: ["drop or approximate"],
        yue: ["捨棄或者近似處理"],
    },
    "chunker.cancelledNote": {
        en: ["already written to the output folder is incomplete"],
        yue: ["已經寫入輸出資料夾嘅嘢係唔完整"],
    },
    "chunker.failedNote": {
        en: ["source world is unchanged"],
        yue: ["原本個世界冇改變"],
    },
} as const satisfies Record<keyof typeof CHUNKER_VOICED, { en: readonly string[]; yue: readonly string[] }>;
