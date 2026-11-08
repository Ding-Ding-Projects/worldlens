/**
 * Every word a live chart puts on screen, in English and Cantonese.
 *
 * Fixed rather than voiced: a chart's state says what the data is doing, and that should read
 * the same every time. Placeholders match the call sites exactly.
 */

import type { FixedString } from "../../components/setup/setupStrings.js";

export const CHARTS_FIXED = {
    "chart.trend.up": { en: "rising", yue: "上升緊" },
    "chart.trend.down": { en: "falling", yue: "下降緊" },
    "chart.trend.flat": { en: "steady", yue: "平穩" },
    "chart.state.loading": { en: "Waiting for the first readings.", yue: "等緊第一批數據。" },
    "chart.state.paused": { en: "Paused. The last readings stay on screen and new ones catch up when it resumes.", yue: "暫停咗。最後嘅數據留喺畫面，繼續嘅時候新數據會追返上嚟。" },
    "chart.state.stale": { en: "No new reading since {age}. The source has gone quiet.", yue: "由 {age} 開始冇新數據。來源靜咗。" },
    "chart.state.empty": { en: "Nothing to show yet.", yue: "暫時未有嘢顯示。" },
    "chart.summary": { en: "{label}: {value}, {trend}.", yue: "{label}：{value}，{trend}。" },
    "chart.live": { en: "Live", yue: "直播中" },
} as const satisfies Record<string, FixedString>;
