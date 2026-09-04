import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

/** Shared factual clauses remain intact at every voice level. */
function levels(base: string, additions: readonly [string, string, string, string]) {
    return [base, base + additions[0], base + additions[1], base + additions[2], base + additions[3]] as const;
}

export const MEASUREDWORLDGEN_FIXED = {
    "world.screen.generateTestWorld": { en: "Generate test world", yue: "生成測試世界" },
    "worldgen.measured.target": { en: "Minimum world bytes (decimal)", yue: "世界最少位元組數（十進制）" },
    "worldgen.measured.preset1": { en: "1 GB (1,000,000,000 bytes)", yue: "1 GB（1,000,000,000 位元組）" },
    "worldgen.measured.preset10": { en: "10 GB (10,000,000,000 bytes)", yue: "10 GB（10,000,000,000 位元組）" },
    "worldgen.measured.targets": { en: "Large deterministic world targets", yue: "大型確定性世界目標" },
    "worldgen.measured.resume": { en: "Resume the existing generated world", yue: "繼續生成現有世界" },
    "worldgen.measured.stop": { en: "Stop and preserve progress", yue: "停止並保留進度" },
    "worldgen.measured.generate": { en: "Generate", yue: "生成" },
    "worldgen.measured.generating": { en: "Generating…", yue: "生成中…" },
} as const satisfies Record<string, FixedString>;

export const MEASUREDWORLDGEN_VOICED = {
    "world.screen.generator": {
        en: levels("Create a deterministic test world from a seed.", [" The same seed can reproduce it.", " Give the renderer a world of its own.", " No borrowed world required.", " A world made to order, with its seed kept on the receipt."]),
        yue: levels("用種子生成可重現嘅測試世界。", ["相同種子可以重現內容。", "畀渲染器一個專用世界。", "唔使借人哋個世界。", "即叫即整一個世界，粒種子寫喺單上，方便翻單。"]),
    },
    "worldgen.measured.notice": {
        en: levels("Generates valid Java 1.20.4 Anvil chunks until level.dat and region files meet the byte target. No padding. Resume requires the same seed, name and target and verifies every region hash.", [
            " Sizes come from the files.", " The files do the counting.", " The target is measured, not guessed.", " The square can make promises; the files must bring the receipts.",
        ]),
        yue: levels("持續生成有效 Java 1.20.4 Anvil 區塊，直到 level.dat 同區域檔案達到指定大小，唔會塞填充資料。繼續時要用相同種子、名稱同目標，並核對每個區域嘅雜湊。", [
            "大小以檔案為準。", "由檔案自己交數。", "目標靠量度，唔係靠估。", "正方形識講大話都冇用，檔案要拎單出嚟交數。",
        ]),
    },
    "worldgen.measured.paused": {
        en: levels("Paused. Valid generated content is retained. Enable Resume with the same inputs to continue.", [
            " The saved work stays here.", " Continue from the saved work.", " The generator can rest; the files stay.", " The generator has clocked out, but it left its work neatly on the desk.",
        ]),
        yue: levels("已暫停，有效內容已保留。保持原有設定並啟用繼續生成即可接住做。", [
            "已儲存嘅內容會留低。", "可以接返已儲存嘅進度。", "生成器休息，檔案照留。", "生成器收工都識交低功課，唔使由第一個方塊做起。",
        ]),
    },
    "worldgen.measured.progress": {
        en: levels("Measured {bytes} / {target} bytes, {chunks} chunks", [
            ". Counting actual files.", ". The files are growing.", ". Real terrain, counted as it lands.", ". No imaginary gigabytes on this invoice.",
        ]),
        yue: levels("已量度 {bytes} / {target} 位元組，{chunks} 個區塊", [
            "，以實際檔案計算。", "，檔案正逐步增加。", "，地形寫一份就數一份。", "，呢張單唔收幻想出嚟嘅 GB。",
        ]),
    },
    "worldgen.measured.result": {
        en: levels("Measured {bytes} bytes, {chunks} chunks, overshoot {overshoot} bytes. Folder: {folder}", [
            ". These are measured file sizes.", ". The byte count comes from the files.", ". The files have delivered their totals.", ". The measuring tape has the final word, as it should.",
        ]),
        yue: levels("已量度 {bytes} 位元組，{chunks} 個區塊，超出目標 {overshoot} 位元組。資料夾：{folder}", [
            "。以上係實際檔案大小。", "。位元組數由檔案量返嚟。", "。檔案已經交齊條數。", "。把尺講咗算，正方形冇得上訴。",
        ]),
    },
    "worldgen.measured.failed": {
        en: levels("The generator did not return a result. Check the operation and retry.", [
            " No completion is confirmed.", " A result is still missing.", " The generator owes us a result.", " The generator handed in an empty envelope. That does not count as a result.",
        ]),
        yue: levels("生成器冇傳返結果。請檢查操作再試。", [
            "未能確認完成。", "結果仍然未收到。", "生成器仲欠一份結果。", "生成器交咗個空信封，唔代表做完份功課。",
        ]),
    },
} as const satisfies Record<string, VoicedString>;

export const MEASUREDWORLDGEN_FACTS = {
    "world.screen.generator": { en: ["deterministic test world", "seed"], yue: ["種子", "可重現", "測試世界"] },
    "worldgen.measured.notice": { en: ["Java 1.20.4", "level.dat", "No padding", "same seed, name and target", "every region hash"], yue: ["Java 1.20.4", "level.dat", "唔會塞填充資料", "相同種子、名稱同目標", "每個區域嘅雜湊"] },
    "worldgen.measured.paused": { en: ["Paused", "content is retained", "same inputs"], yue: ["已暫停", "內容已保留", "原有設定"] },
    "worldgen.measured.progress": { en: ["{bytes}", "{target}", "{chunks}"], yue: ["{bytes}", "{target}", "{chunks}"] },
    "worldgen.measured.result": { en: ["{bytes}", "{chunks}", "{overshoot}", "{folder}"], yue: ["{bytes}", "{chunks}", "{overshoot}", "{folder}"] },
    "worldgen.measured.failed": { en: ["did not return a result", "retry"], yue: ["冇傳返結果", "再試"] },
} as const satisfies Record<keyof typeof MEASUREDWORLDGEN_VOICED, { en: readonly string[]; yue: readonly string[] }>;
