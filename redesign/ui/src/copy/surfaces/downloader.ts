/**
 * Downloading a Minecraft world by walking through it, through a proxy the game connects to.
 *
 * The job screen here is unlike every other one in this application, because the thing it
 * produces is not computed from something that already exists. A render reads a world folder
 * that is already on the disk; this screen *makes* the world folder, one chunk at a time, out
 * of whatever the person happens to walk past while their game is connected through it. That
 * single difference is the fact pinned into every level of every entry below, because it is
 * the fact that decides whether the result looks broken:
 *
 * - **only what has actually been walked through is saved.** A fresh download is mostly
 *   empty, and the map fills in behind the player. Somebody who does not know that opens the
 *   result, sees a hole where their base is, and concludes the tool failed.
 *
 * Three of the entries are warnings rather than explanations, and they keep their own facts
 * at every level for the usual reason: a warning nobody can act on is a broken warning, not a
 * funny one. The token warning names the exposure honestly (the token is on a command line
 * while the tool runs, so anything on this computer that can list processes can read it) as
 * well as the mitigation (this side keeps it in the operating system credential store). The
 * sweep and auto-reply warnings say plainly that the player is made to act, and that a server
 * can notice.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const DOWNLOADER_VOICED = {
    "downloader.page.lede": {
        en: [
            "This is a proxy your game connects to instead of connecting to the server directly. Only what you walk through is saved, so a fresh download is mostly empty and the map fills in behind you.",
            "This is a proxy your game connects to instead of connecting to the server directly. Only what you walk through is saved, so a fresh download is mostly empty and the map fills in behind you.",
            "This is a proxy your game connects to rather than the server itself. Only what you walk through is saved, so a fresh download starts mostly empty and the map fills in behind you as you go.",
            "Your game connects to this proxy instead of straight to the server, and it writes down the scenery on the way past. Only what you walk through is saved, so a fresh download starts almost entirely empty and the map fills in behind you.",
            "Point your game at this proxy instead of at the server, then go for a wander. Only what you walk through is saved, so a fresh download starts as one big blank nothing and the map quietly fills in behind you, a footstep at a time.",
        ],
        yue: [
            "呢個係一個 proxy,你部遊戲會連去佢,唔係直接連去伺服器。淨係你行過嘅地方先至會儲低,所以啱啱開始嗰陣張圖差唔多係空嘅,行過先會慢慢補返。",
            "呢個係一個 proxy,你部遊戲會連去佢,唔係直接連去伺服器。淨係你行過嘅地方先至會儲低,所以啱啱開始嗰陣張圖差唔多係空嘅,行過先會慢慢補返。",
            "呢個係一個 proxy,你部遊戲要連佢,而唔係直接連伺服器。淨係你行過嘅地方先會儲低,所以新開一個下載差唔多係一片空白,行到邊張圖就補到邊。",
            "你部遊戲連嘅係呢個 proxy,唔係伺服器本身,行到邊佢就抄低邊。淨係你行過嘅地方會儲低,所以啱開始嗰陣張圖幾乎乜都冇,你行過之後先會慢慢填返出嚟。",
            "叫你部遊戲連呢個 proxy,唔好直接撲去伺服器,然後就出去行街。淨係你行過嘅地方會儲低,所以新下載一開始係一大片白茫茫,你行一步佢就喺你後面補一步,好似有人跟住你畫地圖咁。",
        ],
    },

    "downloader.emptyState": {
        en: [
            "Nothing has connected yet. This is waiting for your game to connect through the address above.",
            "Nothing has connected yet. This is waiting for your game to connect through the address above.",
            "Nothing has connected yet, so there is nothing to save. This is waiting for your game to connect through the address above.",
            "Nothing has connected yet, so there is nothing to save and nothing to show. This is still waiting for your game to connect through the address above.",
            "Not a single chunk yet, because nothing has connected and there is nothing to save. It is sitting here waiting for your game to connect through the address above, and it can wait all day.",
        ],
        yue: [
            "重未有嘢連過嚟。而家喺度等你部遊戲用上面嗰個地址連入嚟。",
            "重未有嘢連過嚟。而家喺度等你部遊戲用上面嗰個地址連入嚟。",
            "重未有嘢連過嚟,所以冇嘢可以儲。而家喺度等你部遊戲用上面嗰個地址連入嚟。",
            "一格 chunk 都未有,因為重未有嘢連過嚟,冇嘢可以儲。佢仲喺度等你部遊戲用上面嗰個地址連入嚟。",
            "一格 chunk 都未見過,因為根本重未有嘢連過嚟,想儲都冇得儲。佢就係咁喺度等你部遊戲用上面嗰個地址連入嚟,等幾耐都得。",
        ],
    },

    "downloader.connect.instruction": {
        en: [
            "Add {address} as a server in Minecraft's multiplayer list, then connect to it instead of the real server.",
            "Add {address} as a server in Minecraft's multiplayer list, then connect to it instead of the real server.",
            "Add {address} to Minecraft's multiplayer list as if it were a server, then connect to it instead of the real server.",
            "In Minecraft's multiplayer list, add {address} as though it were an ordinary server, and connect to that instead of the real server.",
            "Open Minecraft's multiplayer list, add {address} like it is just another server, and connect to that instead of the real server. Your game will never know the difference.",
        ],
        yue: [
            "喺 Minecraft 嘅多人遊戲清單度加 {address} 做一個伺服器,然後連去佢,唔好連去真嗰個伺服器。",
            "喺 Minecraft 嘅多人遊戲清單度加 {address} 做一個伺服器,然後連去佢,唔好連去真嗰個伺服器。",
            "喺 Minecraft 嘅多人遊戲清單度加多個伺服器,地址填 {address},之後連去佢,唔好連去真嗰個伺服器。",
            "打開 Minecraft 嘅多人遊戲清單,當 {address} 係一個好普通嘅伺服器咁加入去,連嗰個,唔好連去真嗰個伺服器。",
            "去 Minecraft 嘅多人遊戲清單,當 {address} 係一個好普通嘅伺服器咁加落去,之後連佢,唔好連去真嗰個伺服器,你部遊戲根本分唔出。",
        ],
    },

    "downloader.account.microsoft.explain": {
        en: [
            "A code is shown here. You approve it in your own browser, signed in as yourself. No password is typed here.",
            "A code is shown here. You approve it in your own browser, signed in as yourself. No password is typed here.",
            "A code appears here, you approve it in your own browser while signed in as yourself, and no password is typed here.",
            "This shows you a code. You take it to your own browser, approve it there as yourself, and come back. No password is typed here at any point.",
            "A code turns up here, you carry it across to your own browser, approve it there as yourself, and wander back. No password is typed here, not once, not ever.",
        ],
        yue: [
            "呢度會顯示一個驗證碼。你喺自己嘅瀏覽器度用自己個帳戶批准佢就得,唔使喺呢度打密碼。",
            "呢度會顯示一個驗證碼。你喺自己嘅瀏覽器度用自己個帳戶批准佢就得,唔使喺呢度打密碼。",
            "呢度會出一個驗證碼,你攞去自己嘅瀏覽器度,用自己個帳戶批准佢,唔使喺呢度打密碼。",
            "呢度會出一個驗證碼,你捧住佢去自己嘅瀏覽器,喺嗰度用自己身份撳批准,再返嚟。由頭到尾唔使喺呢度打密碼。",
            "呢度會彈個驗證碼出嚟,你拎住佢去自己嘅瀏覽器,用自己身份撳個批准,再慢慢行返嚟。全程唔使喺呢度打密碼,一次都唔使。",
        ],
    },

    "downloader.account.token.warning": {
        en: [
            "The tool takes the token on its command line. While it runs, the token is visible to anything on this computer that can list processes. It is kept in the operating system credential store.",
            "The tool takes the token on its command line. While it runs, the token is visible to anything on this computer that can list processes. It is kept in the operating system credential store.",
            "The tool takes the token on its command line, so while it runs the token is visible to anything on this computer that can list processes. Here it is kept in the operating system credential store.",
            "The tool wants the token on its command line, which means that while it runs the token is readable by anything on this computer that can list processes. On this side it is kept in the operating system credential store.",
            "The tool insists on the token on its command line, so for as long as it runs that token sits in plain view of anything on this computer that can list processes. On this side it lives in the operating system credential store, which is the good half of the story.",
        ],
        yue: [
            "呢個工具係喺 command line 度收 token 嘅。佢行緊嗰陣,呢部電腦上面任何列到 process 嘅嘢都望到個 token。我哋呢邊會將佢放喺作業系統嘅憑證儲存區。",
            "呢個工具係喺 command line 度收 token 嘅。佢行緊嗰陣,呢部電腦上面任何列到 process 嘅嘢都望到個 token。我哋呢邊會將佢放喺作業系統嘅憑證儲存區。",
            "呢個工具要喺 command line 度接個 token,所以佢行緊嘅時候,呢部電腦上面任何列到 process 嘅嘢都望到個 token。我哋呢邊會將佢收喺作業系統嘅憑證儲存區。",
            "個工具堅持要喺 command line 度攞 token,即係佢行緊嗰陣,呢部電腦上面淨係識列 process 嘅嘢都望到晒。喺我哋呢邊,個 token 係收喺作業系統嘅憑證儲存區。",
            "個工具死都要喺 command line 度攞個 token,所以佢一日行緊,個 token 就一日大剌剌企喺度,畀呢部電腦上面任何列到 process 嘅嘢睇通睇透。好彩喺我哋呢邊,佢係收喺作業系統嘅憑證儲存區入面。",
        ],
    },

    "downloader.account.offline.explain": {
        en: [
            "This only works on a server that does not check accounts. It takes a username and nothing else.",
            "This only works on a server that does not check accounts. It takes a username and nothing else.",
            "This only works on a server that does not check accounts, and it takes a username and nothing else.",
            "This works only on a server that does not check accounts. All it takes is a username, and nothing else at all.",
            "This works on exactly one kind of server: one that does not check accounts. All it wants is a username, nothing else, no questions asked.",
        ],
        yue: [
            "呢個淨係喺唔會檢查帳戶嘅伺服器先用得。佢淨係要一個用戶名,其他乜都唔使。",
            "呢個淨係喺唔會檢查帳戶嘅伺服器先用得。佢淨係要一個用戶名,其他乜都唔使。",
            "呢個淨係喺唔會檢查帳戶嘅伺服器先用得,而且淨係要一個用戶名,其他乜都唔使。",
            "呢個淨係喺唔會檢查帳戶嗰種伺服器先行得通。佢要嘅得一個用戶名,其他乜都唔問。",
            "呢個淨係喺一種伺服器先行得通:唔會檢查帳戶嗰種。佢要嘅只係一個用戶名,其他乜都唔問,問都唔問。",
        ],
    },

    "downloader.sweep.warning": {
        en: [
            "The container sweep makes your player perform actions you did not perform. A server watching for automation can notice. This is experimental.",
            "The container sweep makes your player perform actions you did not perform. A server watching for automation can notice. This is experimental.",
            "The container sweep has your player perform actions you did not perform, and a server watching for automation can notice that. This is experimental.",
            "The container sweep drives your player through actions you did not perform. Any server watching for automation can notice, and this is experimental.",
            "The container sweep quietly puppets your player through actions you did not perform, one chest after another. A server watching for automation can absolutely notice, and the whole thing is experimental.",
        ],
        yue: [
            "容器掃描會令你個角色做一啲你自己冇做過嘅動作。有留意自動化行為嘅伺服器會察覺到。呢個功能係實驗性嘅。",
            "容器掃描會令你個角色做一啲你自己冇做過嘅動作。有留意自動化行為嘅伺服器會察覺到。呢個功能係實驗性嘅。",
            "容器掃描會叫你個角色做一啲你自己冇做過嘅動作,而有留意自動化行為嘅伺服器係察覺到嘅。呢個功能係實驗性嘅。",
            "容器掃描會操控你個角色去做一啲你自己冇做過嘅動作。任何有留意自動化行為嘅伺服器都察覺到,而且呢個功能係實驗性嘅。",
            "容器掃描會靜靜雞郁你個角色,做一大堆你自己冇做過嘅動作,一個箱掃完再掃下一個。有留意自動化行為嘅伺服器實會察覺到,而且成件事都仲係實驗性嘅。",
        ],
    },

    "downloader.autoReply.warning": {
        en: [
            "This sends real chat messages as your account. Servers enforcing signed chat may reject them. This is experimental.",
            "This sends real chat messages as your account. Servers enforcing signed chat may reject them. This is experimental.",
            "This sends real chat messages as your account, and servers enforcing signed chat may reject them. This is experimental.",
            "This puts real chat messages in the channel under your account. Servers enforcing signed chat may reject them outright, and this is experimental.",
            "This says real chat messages out loud, in public, under your account, exactly as if you had typed them yourself. Servers enforcing signed chat may reject the lot, and the whole feature is still experimental.",
        ],
        yue: [
            "呢個會用你個帳戶發出真嘅聊天訊息。強制要求已簽名聊天嘅伺服器可能會拒收。呢個功能係實驗性嘅。",
            "呢個會用你個帳戶發出真嘅聊天訊息。強制要求已簽名聊天嘅伺服器可能會拒收。呢個功能係實驗性嘅。",
            "呢個會用你個帳戶發出真嘅聊天訊息,而強制要求已簽名聊天嘅伺服器可能會拒收。呢個功能係實驗性嘅。",
            "呢個係真係喺頻道度用你個帳戶講嘢,發出嘅係真嘅聊天訊息。強制要求已簽名聊天嘅伺服器可能會照拒,而且呢個功能係實驗性嘅。",
            "呢個會用你個帳戶,喺大庭廣眾之下發出真嘅聊天訊息,同你自己親手打一模一樣。強制要求已簽名聊天嘅伺服器可能會全部拒收,而成個功能都仲係實驗性嘅。",
        ],
    },

    "downloader.stop.confirmBody": {
        en: [
            "Chunks already written stay on disk. The connection to the server drops, and your game will disconnect.",
            "Chunks already written stay on disk. The connection to the server drops, and your game will disconnect.",
            "Chunks already written stay on disk, so nothing saved so far is lost. The connection to the server drops, and your game will disconnect.",
            "The chunks already written stay on disk, so nothing saved so far is lost. The connection to the server drops the moment this stops, and your game will disconnect.",
            "The chunks already written stay on disk, so nothing you walked through goes anywhere. But the connection to the server drops the second this stops, and your game will disconnect, mid stride, wherever you happen to be standing.",
        ],
        yue: [
            "已經寫低咗嘅 chunk 會留喺硬碟度。同伺服器嘅連線會斷,你部遊戲會斷線。",
            "已經寫低咗嘅 chunk 會留喺硬碟度。同伺服器嘅連線會斷,你部遊戲會斷線。",
            "已經寫低咗嘅 chunk 會留喺硬碟度,儲咗嘅嘢唔會冇。同伺服器嘅連線會斷,你部遊戲會斷線。",
            "已經寫低咗嘅 chunk 會留喺硬碟度,之前儲落嘅嘢一樣都唔會少。不過一停,同伺服器嘅連線會斷,你部遊戲會斷線。",
            "已經寫低咗嘅 chunk 會乖乖留喺硬碟度,你行過嘅嘢一格都唔會走。但係一撳停,同伺服器嘅連線會斷,你部遊戲會斷線,唔理你當時企緊喺邊。",
        ],
    },

    "downloader.discard.confirmBody": {
        en: [
            "This deletes the world folder and every chunk in it. It cannot be undone from here.",
            "This deletes the world folder and every chunk in it. It cannot be undone from here.",
            "This deletes the world folder and every chunk in it that has been saved so far. It cannot be undone from here.",
            "This deletes the world folder and every chunk in it, including everything walked through so far. It cannot be undone from here, and no undo button is waiting anywhere on this screen.",
            "This deletes the world folder and every chunk in it, every last block you walked past to earn. It cannot be undone from here, and there is no undo button hiding anywhere on this screen either.",
        ],
        yue: [
            "呢個操作會刪走個世界資料夾,同埋入面每一格 chunk。喺呢度冇得復原。",
            "呢個操作會刪走個世界資料夾,同埋入面每一格 chunk。喺呢度冇得復原。",
            "呢個操作會刪走個世界資料夾,同埋入面每一格 chunk,包括到而家為止儲落嘅。喺呢度冇得復原。",
            "呢個操作會刪走個世界資料夾,連同入面每一格 chunk,包括你行到而家儲落嘅全部。喺呢度冇得復原,呢版都冇個復原掣等緊你。",
            "呢個操作會刪走個世界資料夾,連同入面每一格 chunk,你一步一步行返嚟嘅嘢一格都唔留。喺呢度冇得復原,呢版邊個角落都冇個復原掣匿埋等你。",
        ],
    },

    "downloader.progress.explain": {
        en: [
            "The count comes from the region files on disk. It is what was actually saved, not what the tool reported.",
            "The count comes from the region files on disk. It is what was actually saved, not what the tool reported.",
            "The count is read from the region files on disk, so it is what was actually saved rather than what the tool reported.",
            "This number is counted off the region files on disk, which means it is what was actually saved and not simply what the tool reported.",
            "This number is counted straight off the region files on disk, so it is what was actually saved rather than what the tool reported it had saved. The disk gets the last word.",
        ],
        yue: [
            "呢個數字係數硬碟上面嘅 region 檔案得出嚟嘅。佢代表真係儲低咗嘅嘢,唔係個工具講儲咗幾多。",
            "呢個數字係數硬碟上面嘅 region 檔案得出嚟嘅。佢代表真係儲低咗嘅嘢,唔係個工具講儲咗幾多。",
            "呢個數字係由硬碟上面嘅 region 檔案數返出嚟,所以佢係真係儲低咗嘅嘢,而唔係個工具講幾多就幾多。",
            "呢個數字係直接數硬碟上面嘅 region 檔案得返嚟,即係真係儲低咗嘅嘢,唔係個工具講咗就算數。",
            "呢個數字係老老實實數硬碟上面嘅 region 檔案數返出嚟,所以佢係真係儲低咗嘅嘢,唔係個工具講咗就當數。硬碟先係話事嗰個。",
        ],
    },

    "downloader.version.explain": {
        en: [
            "The tool works the version out from the game client that connects to it. This choice is used to check the server and to show the right notes.",
            "The tool works the version out from the game client that connects to it. This choice is used to check the server and to show the right notes.",
            "The tool works the version out from the game client that connects to it, so this choice is used to check the server and to show the right notes.",
            "The tool works the version out from the game client that connects to it, whatever is set here. This choice is used to check the server and to show the right notes.",
            "The tool works the version out from the game client that connects to it and pays this box no attention whatsoever. This choice is used to check the server and to show the right notes, and that is the whole of its job.",
        ],
        yue: [
            "個工具係睇連入嚟嗰個遊戲客戶端自己判斷版本嘅。呢度揀嘅係用嚟檢查伺服器同埋顯示啱嘅版本說明。",
            "個工具係睇連入嚟嗰個遊戲客戶端自己判斷版本嘅。呢度揀嘅係用嚟檢查伺服器同埋顯示啱嘅版本說明。",
            "個工具會睇連入嚟嗰個遊戲客戶端自己判斷版本,所以呢度揀嘅係用嚟檢查伺服器同埋顯示啱嘅版本說明。",
            "無論呢度揀乜,個工具都係睇連入嚟嗰個遊戲客戶端自己判斷版本。呢度揀嘅淨係用嚟檢查伺服器同埋顯示啱嘅版本說明。",
            "個工具根本唔理你呢格揀咗乜,佢係睇連入嚟嗰個遊戲客戶端自己判斷版本。呢度揀嘅淨係用嚟檢查伺服器同埋顯示啱嘅版本說明,得咁多。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const DOWNLOADER_FIXED = {
    "downloader.page.title": {
        en: "Download a world by walking through it",
        yue: "行一轉,順手下載個世界",
    },
    "downloader.page.footnote": {
        en: "The map fills in behind you. Anything you have not walked through is not saved.",
        yue: "你行到邊,張圖就補到邊;冇行過嘅嘢係唔會儲低嘅。",
    },
    "downloader.start": { en: "Start", yue: "開始" },
    "downloader.stop": { en: "Stop", yue: "停止" },
    "downloader.testConnection": { en: "Test connection", yue: "試下連線" },
    "downloader.testing": { en: "Testing", yue: "試緊" },
    "downloader.getTool": { en: "Get the tool", yue: "攞個工具返嚟" },
    "downloader.toolReady": { en: "Tool ready", yue: "工具準備好" },
    "downloader.toolMissing": { en: "Tool not installed", yue: "工具重未裝" },
    "downloader.server": { en: "Server", yue: "伺服器" },
    "downloader.serverHint": {
        en: "The address you normally connect to",
        yue: "你平時連嗰個地址",
    },
    "downloader.outputFolder": { en: "World folder", yue: "世界資料夾" },
    "downloader.proxyPort": { en: "Proxy port", yue: "Proxy 連接埠" },
    "downloader.version": { en: "Minecraft version", yue: "Minecraft 版本" },
    "downloader.account": { en: "Account", yue: "帳戶" },
    "downloader.account.microsoft": { en: "Microsoft account", yue: "Microsoft 帳戶" },
    "downloader.account.token": { en: "Access token", yue: "存取權杖" },
    "downloader.account.offline": { en: "Offline mode", yue: "離線模式" },
    "downloader.username": { en: "Username", yue: "用戶名" },
    "downloader.token": { en: "Token", yue: "Token" },
    "downloader.tokenStored": { en: "Token stored", yue: "Token 已經儲低" },
    "downloader.tokenCleared": { en: "Token cleared", yue: "Token 已經清走" },
    "downloader.signInCode": { en: "Sign-in code", yue: "登入驗證碼" },
    "downloader.signInOpen": { en: "Open the sign-in page", yue: "打開登入嗰版" },
    "downloader.copyCode": { en: "Copy the code", yue: "複製驗證碼" },
    "downloader.search": { en: "Search these settings", yue: "搵呢度嘅設定" },
    "downloader.group.connection": { en: "Connection", yue: "連線" },
    "downloader.group.world": { en: "World", yue: "世界" },
    "downloader.group.map": { en: "Map", yue: "地圖" },
    "downloader.group.containers": { en: "Containers", yue: "容器" },
    "downloader.group.chat": { en: "Chat", yue: "聊天" },
    "downloader.group.advanced": { en: "Advanced", yue: "進階" },
    "downloader.sweepLevel": { en: "Container sweep", yue: "容器掃描" },
    "downloader.sweepLevel.custom": { en: "Custom", yue: "自訂" },
    "downloader.chosen": {
        en: "Set here. The tool's own value is {value}.",
        yue: "喺呢度揀咗。個工具自己嘅值係 {value}。",
    },
    "downloader.usingDefault": {
        en: "Not chosen, so the tool uses {value}.",
        yue: "未揀過,所以個工具用緊 {value}。",
    },
    "downloader.explain.more": { en: "Explain this", yue: "解釋下" },
    "downloader.explain.less": { en: "Hide the explanation", yue: "收埋解釋" },
    "downloader.state.idle": { en: "Not running", yue: "未行緊" },
    "downloader.state.starting": { en: "Starting", yue: "開緊" },
    "downloader.state.waiting": { en: "Waiting for your game", yue: "等緊你部遊戲" },
    "downloader.state.connected": { en: "Connected, saving chunks", yue: "連咗,儲緊 chunk" },
    "downloader.state.stopped": { en: "Stopped", yue: "停咗" },
    "downloader.state.failed": { en: "Failed", yue: "失敗咗" },
    "downloader.chunksSaved": { en: "Chunks saved", yue: "儲低咗嘅 chunk" },
    "downloader.log": { en: "Log", yue: "紀錄" },
    "downloader.stop.confirmTitle": {
        en: "Confirm stopping this download",
        yue: "確認停止呢個下載",
    },
    "downloader.discard": { en: "Delete this download", yue: "刪走呢個下載" },
    "downloader.discard.confirmTitle": {
        en: "Confirm deleting this partial download",
        yue: "確認刪走呢個未完成嘅下載",
    },
    "downloader.noMatches": { en: "Nothing here matches that", yue: "呢度冇嘢啱到" },
} as const satisfies Record<string, FixedString>;

export const DOWNLOADER_FACTS = {
    "downloader.page.lede": {
        en: ["proxy", "what you walk through"],
        yue: ["proxy", "行過"],
    },
    "downloader.emptyState": {
        en: ["waiting", "the address above"],
        yue: ["等", "地址"],
    },
    "downloader.connect.instruction": {
        en: ["{address}", "multiplayer", "instead of the real server"],
        yue: ["{address}", "多人遊戲", "唔好連去真嗰個伺服器"],
    },
    "downloader.account.microsoft.explain": {
        en: ["code", "your own browser", "password is typed here"],
        yue: ["驗證碼", "瀏覽器", "唔使喺呢度打密碼"],
    },
    "downloader.account.token.warning": {
        en: ["command line", "list processes", "credential store"],
        yue: ["command line", "process", "憑證儲存區"],
    },
    "downloader.account.offline.explain": {
        en: ["does not check accounts", "username"],
        yue: ["唔會檢查帳戶", "用戶名"],
    },
    "downloader.sweep.warning": {
        en: ["actions you did not perform", "automation", "experimental"],
        yue: ["你自己冇做過", "自動化", "實驗性"],
    },
    "downloader.autoReply.warning": {
        en: ["real chat", "your account", "signed chat", "experimental"],
        yue: ["真嘅聊天", "你個帳戶", "已簽名聊天", "實驗性"],
    },
    "downloader.stop.confirmBody": {
        en: ["already written stay on disk", "connection to the server drops", "your game will disconnect"],
        yue: ["留喺硬碟", "連線會斷", "斷線"],
    },
    "downloader.discard.confirmBody": {
        en: ["world folder and every chunk in it", "cannot be undone from here"],
        yue: ["世界資料夾", "每一格 chunk", "喺呢度冇得復原"],
    },
    "downloader.progress.explain": {
        en: ["region files on disk", "actually saved", "what the tool reported"],
        yue: ["region 檔案", "真係儲低咗", "工具講"],
    },
    "downloader.version.explain": {
        en: ["works the version out from the game client", "check the server", "the right notes"],
        yue: ["連入嚟嗰個遊戲客戶端", "檢查伺服器", "版本說明"],
    },
} as const satisfies Record<keyof typeof DOWNLOADER_VOICED, { en: readonly string[]; yue: readonly string[] }>;
