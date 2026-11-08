/**
 * Every word the drawing board puts on screen, in English and Cantonese.
 *
 * Fixed rather than voiced: tool names and the facts about clearing and saving should read the
 * same every time. Placeholders match the call sites exactly.
 */

import type { FixedString } from "../../components/setup/setupStrings.js";

export const DRAWING_FIXED = {
    "draw.pen.pencil": { en: "Pencil", yue: "鉛筆" },
    "draw.pen.pen": { en: "Pen", yue: "原子筆" },
    "draw.pen.fineliner": { en: "Fineliner", yue: "針筆" },
    "draw.pen.marker": { en: "Marker", yue: "箱頭筆" },
    "draw.pen.highlighter": { en: "Highlighter", yue: "螢光筆" },
    "draw.pen.brush": { en: "Brush", yue: "毛筆" },
    "draw.pen.fountain": { en: "Fountain pen", yue: "墨水筆" },
    "draw.eraser": { en: "Eraser", yue: "擦膠" },
    "draw.notice.pictureNotKept": { en: "The strokes are saved; the picture is too large to keep and will need opening again after a restart.", yue: "筆劃儲好咗；張圖太大留唔低，重開之後要再開過。" },
    "draw.notice.notSaved": { en: "This window cannot save the drawing, so it lasts until the window closes.", yue: "呢個視窗儲唔到張畫，閂咗視窗就冇。" },
    "draw.notice.cleared": { en: "Cleared. Undo brings the strokes back.", yue: "清咗。撳復原可以攞返啲筆劃。" },
    "draw.notice.badPicture": { en: "That file could not be read as a picture.", yue: "呢個檔讀唔到做圖片。" },
    "draw.notice.notPicture": { en: "Choose a PNG, JPEG, WebP or GIF picture.", yue: "揀一張 PNG、JPEG、WebP 或者 GIF 圖。" },
    "draw.notice.noPicture": { en: "The clipboard has no picture.", yue: "剪貼簿入面冇圖。" },
    "draw.notice.clipboard": { en: "The clipboard is not available here. Press Ctrl+V on the board instead.", yue: "呢度用唔到剪貼簿。喺畫板度撳 Ctrl+V 啦。" },
    "draw.notice.exported": { en: "Exported.", yue: "匯出咗。" },
    "draw.undo": { en: "Undo", yue: "復原" },
    "draw.redo": { en: "Redo", yue: "重做" },
    "draw.exportSvg": { en: "Export SVG", yue: "匯出 SVG" },
    "draw.exportPng": { en: "Export PNG at 2x", yue: "匯出 2 倍 PNG" },
    "draw.expand": { en: "Show the toolbar", yue: "打開工具列" },
    "draw.minimise": { en: "Minimise the toolbar", yue: "收細工具列" },
    "draw.nothing": { en: "Nothing to step through yet.", yue: "暫時冇嘢可以返轉頭。" },
    "draw.title": { en: "Drawing board", yue: "畫板" },
    "draw.intro": { en: "Draw on a picture or a blank board. Strokes stay on this computer. Hold Shift for a straight line; right-click for every tool and its key.", yue: "喺圖片或者白板上面畫。筆劃留喺呢部電腦。㩒住 Shift 畫直線；撳右鍵睇晒所有工具同快捷鍵。" },
    "draw.open": { en: "Open picture", yue: "開圖片" },
    "draw.paste": { en: "Paste picture", yue: "貼上圖片" },
    "draw.blank": { en: "Blank board", yue: "白板" },
    "draw.exportPngShort": { en: "Export PNG", yue: "匯出 PNG" },
    "draw.pngAt": { en: "PNG at {ratio}x", yue: "{ratio} 倍 PNG" },
    "draw.toolbar": { en: "Drawing tools", yue: "畫畫工具" },
    "draw.colour": { en: "Colour", yue: "顏色" },
    "draw.customColour": { en: "Any colour", yue: "任何顏色" },
    "draw.size": { en: "Size", yue: "粗幼" },
    "draw.clearTitle": { en: "Clear the board?", yue: "清晒個畫板？" },
    "draw.clearAction": { en: "Removes all {count} strokes from this board. Undo can bring them back until the history is cleared.", yue: "會刪走呢個畫板上面全部 {count} 筆。未清歷史之前，撳復原都攞得返。" },
    "draw.clear": { en: "Clear", yue: "清除" },
    "draw.clearReason": { en: "Clear is available once there is a stroke.", yue: "有筆劃先可以清除。" },
    "draw.canvas": { en: "Drawing with {count} strokes", yue: "畫咗 {count} 筆嘅畫" },
    "draw.menu": { en: "Drawing commands", yue: "畫畫指令" },
    "draw.menuFilter": { en: "Filter tools", yue: "篩選工具" },
} as const satisfies Record<string, FixedString>;
