/**
 * The Fabric Carpet world downloader screen: its settings form, connection test, get-the-jar
 * step, and the honest states for no-Java, no-jar, running and failed.
 *
 * Almost everything here is fixed rather than funny-level voiced, for the same reason
 * `dockerHosting.ts` beside this file is: a Java-missing message, a port-in-use message and a
 * session's phase are facts about the machine and the network, and a screen that reads
 * differently on every visit while the actual blocker stays the same is a screen that is harder
 * to act on, not more delightful to read. The one voiced key is the screen's own introduction,
 * which is exactly the kind of sentence the funny-level sliders exist to style - it never
 * changes what the tool does, only how enthusiastically it says so.
 */

import type { FixedString } from "../../components/setup/setupStrings.js";

export const WORLDDOWNLOADER_VOICED = {
    "worldDownloader.help": {
        en: [
            "Connects to a Minecraft server as a normal client and saves every chunk it is sent to a folder on this computer, using the bundled Fabric Carpet world downloader.",
            "Connects to a Minecraft server as a normal client and saves every chunk it is sent to a folder on this computer, using the bundled Fabric Carpet world downloader. Nothing here is a mod for the server.",
            "Connects to a Minecraft server as an ordinary client and saves every chunk the server sends, to a folder on this computer, using the bundled Fabric Carpet world downloader. Nothing here is a mod for the server - it runs entirely on this machine.",
            "Pretends to be a normal player, connects to a Minecraft server, and quietly writes down every chunk the server hands over, into a folder on this computer, using the bundled Fabric Carpet world downloader. Nothing here touches the server - it all happens on this machine.",
            "Walks up to a Minecraft server disguised as an ordinary player, and while the server is busy sending chunks like it always does, this squirrels every single one away into a folder on this computer, courtesy of the bundled Fabric Carpet world downloader. The server never installs anything and never knows the difference - the whole trick happens on this machine.",
        ],
        yue: [
            "用普通玩家身份連去 Minecraft 伺服器，將收到嘅每個 chunk 存落呢部電腦嘅資料夾，用嘅係內置嘅 Fabric Carpet world downloader。",
            "用普通玩家身份連去 Minecraft 伺服器，將收到嘅每個 chunk 存落呢部電腦嘅資料夾，用嘅係內置嘅 Fabric Carpet world downloader。呢度冇嘢係伺服器嘅 mod。",
            "以普通玩家身份連線去 Minecraft 伺服器，將伺服器送嚟嘅每個 chunk 存落呢部電腦嘅資料夾，用嘅係內置嘅 Fabric Carpet world downloader。呢度冇嘢係伺服器嘅 mod - 全部都喺呢部機度行。",
            "扮成普通玩家連去 Minecraft 伺服器，靜靜雞將伺服器交出嚟嘅每個 chunk 抄低，存落呢部電腦嘅資料夾，用嘅係內置嘅 Fabric Carpet world downloader。呢度完全冇掂過伺服器 - 全部戲法都喺呢部機度變。",
            "扮成普通玩家行去 Minecraft 伺服器度，趁佢照舊咁送 chunk 出嚟嗰陣，將每一個都靜雞雞抄低，存入呢部電腦嘅資料夾，全靠內置嘅 Fabric Carpet world downloader。伺服器由頭到尾冇裝過任何嘢，都唔知發生咗咩事 - 個戲法完全喺呢部機度變出嚟。",
        ],
    },
} as const;

export const WORLDDOWNLOADER_FIXED = {
    "worldDownloader.title": { en: "Get a world off a server", yue: "由伺服器攞返個世界" },
    "worldDownloader.unavailable": {
        en: "This build cannot reach the world downloader. The desktop bridge is not available.",
        yue: "呢個版本連唔到 world downloader，因為冇桌面版嗰條橋。",
    },

    "worldDownloader.settings.server": { en: "Server address", yue: "伺服器位址" },
    "worldDownloader.settings.serverHint": {
        en: "The address you would type into Minecraft's own server list, host or host:port.",
        yue: "你平時打入 Minecraft 伺服器清單嗰個位址，host 或者 host:port。",
    },
    "worldDownloader.settings.outputFolder": { en: "Save the world to", yue: "世界存去邊" },
    "worldDownloader.settings.declaredVersion": { en: "Server version", yue: "伺服器版本" },
    "worldDownloader.settings.accountMode": { en: "Sign in as", yue: "用邊種方式登入" },
    "worldDownloader.settings.accountMode.microsoft": { en: "Microsoft account", yue: "Microsoft 帳戶" },
    "worldDownloader.settings.accountMode.token": { en: "Existing access token", yue: "現有嘅 access token" },
    "worldDownloader.settings.accountMode.offline": { en: "Offline / cracked server", yue: "離線／cracked 伺服器" },
    "worldDownloader.settings.username": { en: "Username", yue: "使用者名稱" },
    "worldDownloader.settings.save": { en: "Save settings", yue: "儲存設定" },
    "worldDownloader.settings.saved": { en: "Settings saved.", yue: "設定已儲存。" },
    "worldDownloader.settings.usingDefaults": {
        en: "These are the application's own defaults - nothing has been saved yet.",
        yue: "呢啲係程式本身嘅預設值 - 仲未儲存過任何設定。",
    },
    "worldDownloader.settings.openTokenIntake": { en: "Add access token", yue: "新增 access token" },
    "worldDownloader.settings.tokenIntakeExplain": {
        en: "The token is typed into its own window, and this screen never sees the value.",
        yue: "個 token 會喺佢自己嗰個獨立視窗入面打，呢個畫面永遠都睇唔到個值。",
    },
    "worldDownloader.settings.clearToken": { en: "Forget token", yue: "忘記 token" },
    "worldDownloader.settings.tokenHeld": { en: "A token is held for this computer.", yue: "呢部電腦已經記住咗一個 token。" },
    "worldDownloader.settings.tokenNotHeld": { en: "No token is held.", yue: "冇記住任何 token。" },

    "worldDownloader.testConnection": { en: "Test connection", yue: "測試連線" },
    "worldDownloader.testConnection.running": { en: "Testing the connection...", yue: "測試緊連線..." },

    "worldDownloader.status.jar.present": { en: "Downloader tool: ready", yue: "下載工具：已就緒" },
    "worldDownloader.status.jar.missing": { en: "Downloader tool: not downloaded yet", yue: "下載工具：仲未下載" },
    "worldDownloader.status.getJar": { en: "Get the downloader", yue: "攞下載工具" },
    "worldDownloader.status.getJar.running": { en: "Getting the downloader...", yue: "攞緊下載工具..." },
    "worldDownloader.status.java.present": { en: "Java: found", yue: "Java：搵到" },
    "worldDownloader.status.java.missing": {
        en: "Java: not found on this computer. Install a Java runtime to use the downloader.",
        yue: "Java：呢部電腦搵唔到。要用下載工具就要先裝一個 Java runtime。",
    },
    "worldDownloader.status.checkPort": { en: "Check proxy port", yue: "檢查 proxy port" },
    "worldDownloader.status.portFree": { en: "Proxy port is free.", yue: "Proxy port 冇被佔用。" },
    "worldDownloader.status.portTaken": { en: "That port is already taken.", yue: "嗰個 port 已經被人用緊。" },

    "worldDownloader.start": { en: "Start download", yue: "開始下載" },
    "worldDownloader.stop": { en: "Stop", yue: "停止" },
    "worldDownloader.start.blocked": {
        en: "Fix the settings above before starting.",
        yue: "開始之前，請先修正上面嘅設定。",
    },

    "worldDownloader.session.phase.connecting": { en: "Connecting...", yue: "連線緊..." },
    "worldDownloader.session.phase.signing-in": { en: "Signing in...", yue: "登入緊..." },
    "worldDownloader.session.phase.downloading": { en: "Downloading chunks...", yue: "下載緊 chunk..." },
    "worldDownloader.session.phase.finishing": { en: "Finishing up...", yue: "收尾緊..." },
    "worldDownloader.session.phase.done": { en: "Finished.", yue: "完成咗。" },
    "worldDownloader.session.phase.failed": { en: "Failed.", yue: "失敗咗。" },
    "worldDownloader.session.log": { en: "Log", yue: "紀錄" },
    "worldDownloader.session.chunks": { en: "Chunks saved", yue: "已存 chunk" },
    "worldDownloader.session.bytes": { en: "Bytes written", yue: "已寫入位元組" },
    "worldDownloader.session.dimensions": { en: "By dimension", yue: "按維度分類" },
    "worldDownloader.session.notes": { en: "Notes", yue: "備註" },

    "worldDownloader.search.placeholder": { en: "Filter the log", yue: "篩選紀錄" },
} as const satisfies Record<string, FixedString>;

export const WORLDDOWNLOADER_FACTS = {
    // "Fabric Carpet world downloader" is the real, exact name of the bundled tool; it stays
    // put at every funny level so nobody goes looking for a tool with a rewritten name.
    "worldDownloader.help": {
        en: ["Fabric Carpet world downloader"],
        yue: ["Fabric Carpet world downloader"],
    },
} as const satisfies Record<
    keyof typeof WORLDDOWNLOADER_VOICED,
    { readonly en: readonly string[]; readonly yue: readonly string[] }
>;
