/**
 * The drop-render zone's own status lines: starting a render, failing one, and the two
 * ways a drop or a browse can come up short on a real path.
 *
 * The zone's classification copy (`dropRender.zoneLabel`, `dropRender.dropHint`,
 * `dropRender.browseButton`, `dropRender.accepted`) is not in this module - it predates
 * the render actually starting and is registered separately. What lives here is the copy
 * `App.vue` shows once a drop or a browse tries to become a real render.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const DROPRENDER_VOICED = {
    "dropRender.started": {
        en: [
            "Rendering \"{name}\"…",
            "Rendering \"{name}\"…",
            "Rendering \"{name}\" now.",
            "\"{name}\" is rendering - this can take a moment for a big structure.",
            "\"{name}\" is off to the races. A big structure can take a minute or two, so feel free to look away.",
        ],
        yue: [
            "渲染緊「{name}」…",
            "渲染緊「{name}」…",
            "而家渲染緊「{name}」。",
            "「{name}」渲染緊，如果個結構大，可能要等一陣。",
            "「{name}」出發喇，如果係個大結構，可能要等一兩分鐘，唔使一直盯住畫面。",
        ],
    },
    "dropRender.failed": {
        en: [
            "\"{name}\" could not be rendered.",
            "\"{name}\" could not be rendered.",
            "\"{name}\" did not render.",
            "\"{name}\" did not render - see the notice above for why.",
            "\"{name}\" refused to render. The reason is in the notice above, not lost anywhere.",
        ],
        yue: [
            "「{name}」冇渲染成功。",
            "「{name}」冇渲染成功。",
            "「{name}」渲染唔到。",
            "「{name}」渲染唔到，上面嘅通知有講原因。",
            "「{name}」唔肯渲染，原因就喺上面嗰個通知度，冇不見咗。",
        ],
    },
    "dropRender.noPath": {
        en: [
            "\"{name}\" could not be located on disk, so it cannot be rendered.",
            "\"{name}\" could not be located on disk, so it cannot be rendered.",
            "\"{name}\" has no real location this build can find, so it was not rendered.",
            "\"{name}\" does not point at a real file this build can reach, so nothing was rendered.",
            "\"{name}\" is a file this build cannot actually find on disk, so it stayed exactly where it was - unrendered.",
        ],
        yue: [
            "搵唔到「{name}」喺邊，所以冇辦法渲染。",
            "搵唔到「{name}」喺邊，所以冇辦法渲染。",
            "呢個版本搵唔到「{name}」嘅真實位置，所以冇渲染。",
            "「{name}」冇指向一個呢個版本搵得到嘅真實檔案，所以乜都冇做過。",
            "「{name}」呢個版本根本搵唔到喺邊，所以佢繼續原地企喺度，未渲染過。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const DROPRENDER_FIXED = {
    "dropRender.pickFileTitle": {
        en: "Choose a structure or schematic file",
        yue: "揀一個結構或藍圖檔案",
    },
} as const satisfies Record<string, FixedString>;

export const DROPRENDER_FACTS = {
    "dropRender.started": { en: ["{name}"], yue: ["{name}"] },
    "dropRender.failed": { en: ["{name}"], yue: ["{name}"] },
    "dropRender.noPath": { en: ["{name}"], yue: ["{name}"] },
} as const satisfies Record<
    keyof typeof DROPRENDER_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
