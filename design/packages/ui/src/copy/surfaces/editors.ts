/**
 * Every word the external editor settings and hand-offs put on screen, in English and Cantonese.
 */

import type { FixedString } from "../../components/setup/setupStrings.js";

export const EDITORS_FIXED = {
    "editors.chosen": { en: "{name} opens project folders and files from now on.", yue: "由而家開始用 {name} 開專案資料夾同檔案。" },
    "editors.noBridge": { en: "External editors are chosen in the desktop app, where they can be started.", yue: "外部編輯器喺桌面版揀,喺嗰度先開得到。" },
    "editors.none": { en: "No external editor was found on this computer. Add the program you use, or install Visual Studio Code.", yue: "呢部電腦搵唔到外部編輯器。加你用開嗰個程式,或者裝 Visual Studio Code。" },
    "editors.use": { en: "Open project folders and files in", yue: "用嚟開專案資料夾同檔案" },
    "editors.added": { en: "Added by you", yue: "你加嘅" },
    "editors.detected": { en: "Found", yue: "搵到" },
    "editors.remove": { en: "Remove {name}", yue: "移除 {name}" },
    "editors.add": { en: "Add an editor", yue: "加編輯器" },
    "editors.refresh": { en: "Look again", yue: "再搵一次" },
    "editors.getVsCode": { en: "Get Visual Studio Code", yue: "下載 Visual Studio Code" },
    "editors.vscodeNote": { en: "Exports open in Visual Studio Code in one action, from its per-user, machine, Insiders or VSCodium install, whichever is found first.", yue: "匯出嘅嘢一撳就喺 Visual Studio Code 開,用先搵到嗰個:個人安裝、全機安裝、Insiders 或者 VSCodium。" },
    "editors.openInVsCode": { en: "Open in VS Code", yue: "喺 VS Code 開" },
} as const satisfies Record<string, FixedString>;
