/**
 * The Work workspace's pane layouts: splitting a tab into its own pane, moving it between
 * panes, floating and maximising a pane, and saving named layouts.
 *
 * Every string here is FIXED. These are command labels, accessible names and the one-line
 * results read to a screen reader after an arrangement command, and the menu filter matches
 * the exact label shown, so a label that changed with the funny level would stop matching what
 * somebody just typed. What each result says (which pane, which direction, what was refused
 * and why) is a fact that no tone is allowed to soften.
 */

import type { FixedString } from "../../components/setup/setupStrings.js";

export const WORKLAYOUT_FIXED = {
    "tabs.strip.pane": { en: "Pane {n}", yue: "窗格 {n}" },

    "workLayout.menu": { en: "Arrange panes and layouts", yue: "安排窗格同版面" },
    "workLayout.filter": {
        en: "Filter layouts and arrangement commands",
        yue: "篩選版面同排列指令",
    },
    "workLayout.arrange": { en: "Arrange this pane", yue: "安排呢個窗格" },
    "workLayout.saved": { en: "Saved layouts", yue: "已儲存嘅版面" },
    "workLayout.noneSaved": {
        en: "No layout is saved yet. Arrange the panes, name the arrangement below and save it to bring it back later.",
        yue: "未有儲存任何版面。排好窗格，喺下面改個名再儲存，之後就可以叫返出嚟。",
    },

    "workLayout.splitRight": { en: "Split this tab to the right", yue: "將呢個分頁分到右邊" },
    "workLayout.splitLeft": { en: "Split this tab to the left", yue: "將呢個分頁分到左邊" },
    "workLayout.splitAbove": { en: "Split this tab above", yue: "將呢個分頁分到上面" },
    "workLayout.splitBelow": { en: "Split this tab below", yue: "將呢個分頁分到下面" },
    "workLayout.nextPane": {
        en: "Move this tab to the next pane",
        yue: "將呢個分頁移去下一個窗格",
    },
    "workLayout.previousPane": {
        en: "Move this tab to the previous pane",
        yue: "將呢個分頁移去上一個窗格",
    },
    "workLayout.float": { en: "Float this pane", yue: "令呢個窗格浮起" },
    "workLayout.dock": { en: "Dock this floating pane back", yue: "將浮起嘅窗格放返入版面" },
    "workLayout.maximize": { en: "Maximise this pane", yue: "最大化呢個窗格" },
    "workLayout.restore": { en: "Restore this pane", yue: "還原呢個窗格" },

    "workLayout.reason.needsTwoTabs": {
        en: "This pane needs at least two tabs to split one away.",
        yue: "呢個窗格起碼要有兩個分頁，先可以分一個出去。",
    },
    "workLayout.reason.needsTwoPanes": { en: "There is only one pane.", yue: "而家得一個窗格。" },

    "workLayout.nameLabel": { en: "Name for this layout", yue: "呢個版面嘅名" },
    "workLayout.save": { en: "Save layout", yue: "儲存版面" },
    "workLayout.reset": { en: "Reset layout", yue: "重設版面" },
    "workLayout.apply": { en: "Apply the layout {name}", yue: "套用版面 {name}" },
    "workLayout.rename": { en: "Rename the layout {name}", yue: "改版面 {name} 嘅名" },
    "workLayout.renameLabel": { en: "New name for this layout", yue: "呢個版面嘅新名" },
    "workLayout.renameCommit": { en: "Rename", yue: "改名" },
    "workLayout.delete": { en: "Delete the layout {name}", yue: "刪除版面 {name}" },
    "workLayout.deleteTitle": { en: "Delete the layout {name}?", yue: "刪除版面 {name}？" },
    "workLayout.deleteAction": {
        en: "Removes this saved layout. Your open tabs are not closed.",
        yue: "會移除呢個已儲存嘅版面。你開咗嘅分頁唔會被關閉。",
    },
    "workLayout.deleteGo": { en: "Delete layout", yue: "刪除版面" },

    "workLayout.nameRequired": {
        en: "Give the layout a name before saving it.",
        yue: "儲存之前，要先俾個名個版面。",
    },
    "workLayout.full": {
        en: "No more layouts can be saved. Delete one first.",
        yue: "儲存唔到更多版面。請先刪除一個。",
    },
    "workLayout.replaced": {
        en: "Replaced the saved layout with that name.",
        yue: "已取代同名嘅已儲存版面。",
    },
    "workLayout.saved1": { en: "Layout saved.", yue: "版面已儲存。" },
    "workLayout.applied": { en: "Applied the layout {name}.", yue: "已套用版面 {name}。" },
    "workLayout.cannotApply": {
        en: "That layout has no tab this build can show, so nothing was changed.",
        yue: "呢個版面冇任何呢個版本顯示得到嘅分頁，所以乜都冇改。",
    },
    "workLayout.cannotRename": {
        en: "That name is empty or already used by another layout.",
        yue: "個名係空白，或者已經畀另一個版面用咗。",
    },
    "workLayout.deleted": { en: "Layout deleted.", yue: "版面已刪除。" },

    "workLayout.cannotSplit": {
        en: "That tab cannot be split away: a pane needs at least two tabs to split one out.",
        yue: "分唔到呢個分頁出去：窗格起碼要有兩個分頁，先可以分一個出去。",
    },
    "workLayout.didSplit": {
        en: "Tab moved into a new pane to the {direction}.",
        yue: "分頁已移入{direction}邊嘅新窗格。",
    },
    "workLayout.dir.left": { en: "left", yue: "左" },
    "workLayout.dir.right": { en: "right", yue: "右" },
    "workLayout.dir.above": { en: "top", yue: "上" },
    "workLayout.dir.below": { en: "bottom", yue: "下" },
    "workLayout.didMove": { en: "Tab moved into the other pane.", yue: "分頁已移入另一個窗格。" },
    "workLayout.didFloat": { en: "The pane is now floating.", yue: "窗格而家浮起咗。" },
    "workLayout.cannotFloat": {
        en: "That pane cannot float: there is only one pane.",
        yue: "呢個窗格浮唔到起：而家得一個窗格。",
    },
    "workLayout.didDock": {
        en: "The pane is docked back into the layout.",
        yue: "窗格已放返入版面。",
    },
    "workLayout.cannotDock": {
        en: "Nothing to dock this pane beside.",
        yue: "冇可以靠埋放嘅窗格。",
    },
    "workLayout.didMaximize": { en: "The pane fills the workspace.", yue: "窗格已佔滿成個工作區。" },
    "workLayout.didRestore": { en: "The pane is restored.", yue: "窗格已還原。" },
    "workLayout.didReset": {
        en: "Every tab is back in one pane.",
        yue: "所有分頁都返咗入同一個窗格。",
    },

    "workLayout.zone.left": {
        en: "Drop here to split this pane to the left",
        yue: "擺喺度，將呢個窗格分到左邊",
    },
    "workLayout.zone.right": {
        en: "Drop here to split this pane to the right",
        yue: "擺喺度，將呢個窗格分到右邊",
    },
    "workLayout.zone.above": {
        en: "Drop here to split this pane above",
        yue: "擺喺度，將呢個窗格分到上面",
    },
    "workLayout.zone.below": {
        en: "Drop here to split this pane below",
        yue: "擺喺度，將呢個窗格分到下面",
    },
    "workLayout.zone.centre": {
        en: "Drop here to move the tab into this pane",
        yue: "擺喺度，將分頁移入呢個窗格",
    },

    "palette.chrome.layout": {
        en: "Arranges the Work workspace into panes without dragging: the focused pane's active tab, or the pane itself.",
        yue: "唔使拖，就將工作區排成窗格：對象係焦點窗格嘅作用中分頁，或者窗格本身。",
    },
} as const satisfies Record<string, FixedString>;
