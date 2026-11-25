/**
 * The data folders settings: the profile folder, the save folder, the profile history and the
 * optional send to a private repository.
 *
 * All fixed copy, English and Cantonese. These sentences state facts about where data lives
 * and what is and is not sent, so they carry no funny levels: a playful version of "sign-in
 * files are included" would only make the consequence harder to read.
 *
 * The section's own title and description live with every other section heading in
 * `settings.ts`.
 */

export const DATAFOLDERS_FIXED = {
    "settings.dataFolders.title": { en: "Data folders and history", yue: "資料夾同歷史記錄" },
    "settings.dataFolders.description": {
        en: "Choose where the app keeps its profile and where it saves your files. Existing data is checked and copied before anything switches, and the profile keeps a version history of its own that you can optionally send to a private repository.",
        yue: "揀個人設定放喺邊、檔案存喺邊。切換之前會先複製同逐個檔案核對現有資料,而個人設定自己有一份版本歷史,你可以揀擇將佢傳去私人儲存庫。",
    },

    "dataFolders.unavailable": {
        en: "Folders can only be changed in the desktop app. In a browser the app's data lives where the server keeps it.",
        yue: "淨係桌面版先可以轉資料夾。喺瀏覽器入面,資料係放喺伺服器度。",
    },
    "dataFolders.pointerProblem": {
        en: "The default folder is in use. Nothing was deleted.",
        yue: "而家用緊預設資料夾,冇刪過任何嘢。",
    },
    "dataFolders.notice.historyFailed": {
        en: "The profile history could not be saved.",
        yue: "儲存唔到個人設定嘅歷史記錄。",
    },

    "dataFolders.profile.title": { en: "Profile folder", yue: "個人設定資料夾" },
    "dataFolders.profile.field": { en: "profile folder", yue: "個人設定資料夾" },
    "dataFolders.profile.help": {
        en: "Your settings, consent choices, accounts and history. It is kept as a version history of its own, so every change can be looked back on. A new location is used after a restart.",
        yue: "擺放你嘅設定、同意選擇、戶口同歷史。佢有自己一份版本歷史,每次改動都睇返到。新位置要重新啟動之後先用。",
    },
    "dataFolders.save.title": { en: "Save folder", yue: "儲存資料夾" },
    "dataFolders.save.field": { en: "save folder", yue: "儲存資料夾" },
    "dataFolders.save.help": {
        en: "Where rendered maps are saved by default. The change applies straight away, and maps you already have are copied across if you ask.",
        yue: "預設存放渲染地圖嘅位置。改咗即時生效,你要求嘅話,現有嘅地圖會一齊複製過去。",
    },

    "dataFolders.current": { en: "In use now", yue: "而家用緊" },
    "dataFolders.default": { en: "Default", yue: "預設" },
    "dataFolders.newFolder": { en: "New folder", yue: "新資料夾" },
    "dataFolders.freeSpace": { en: "{size} free on that drive.", yue: "嗰個磁碟尚有 {size} 空位。" },

    "dataFolders.mode.label": {
        en: "What happens to the data already there",
        yue: "原有資料點處理",
    },
    "dataFolders.mode.move": {
        en: "Move it: copy everything, check it, then offer to remove the old folder",
        yue: "搬過去:複製晒、核對完,之後先問你要唔要刪走舊資料夾",
    },
    "dataFolders.mode.copy": {
        en: "Copy it: keep the old folder exactly as it is",
        yue: "複製過去:舊資料夾原封不動",
    },
    "dataFolders.mode.fresh": {
        en: "Start fresh, or use what is already in that folder (nothing is copied)",
        yue: "重新開始,或者直接用嗰個資料夾入面現有嘅嘢(唔會複製)",
    },
    "dataFolders.mode.note": {
        en: "Nothing is ever overwritten, and the old folder is kept until you remove it yourself.",
        yue: "唔會覆蓋任何嘢,舊資料夾會保留到你自己決定刪走為止。",
    },

    "dataFolders.apply": { en: "Apply", yue: "套用" },
    "dataFolders.reset": { en: "Reset to default", yue: "還原為預設" },
    "dataFolders.cancel": { en: "Cancel", yue: "取消" },
    "dataFolders.resetUnavailable": {
        en: "Reset is unavailable: this folder is already the default.",
        yue: "用唔到「還原為預設」:呢個資料夾已經係預設。",
    },
    "dataFolders.whyDisabled": { en: "Apply is unavailable: {reason}", yue: "暫時用唔到「套用」:{reason}" },

    "dataFolders.reason.no-bridge": {
        en: "This build cannot change folders. Only the desktop app can.",
        yue: "呢個版本轉唔到資料夾,淨係桌面版先得。",
    },
    "dataFolders.reason.busy": { en: "Another folder change is still running.", yue: "另一個資料夾變更仲喺度進行。" },
    "dataFolders.reason.empty": { en: "Choose a folder first.", yue: "請先揀一個資料夾。" },
    "dataFolders.reason.checking": { en: "Checking the folder...", yue: "檢查緊個資料夾…" },
    "dataFolders.reason.not-absolute": {
        en: "Choose a full folder path, starting from the top of a drive.",
        yue: "請揀完整資料夾路徑,要由磁碟最頂開始。",
    },
    "dataFolders.reason.same-as-current": { en: "That is the folder already in use.", yue: "呢個已經係而家用緊嘅資料夾。" },
    "dataFolders.reason.inside-install-folder": {
        en: "That folder is inside the folder the application is installed in, which an update can replace.",
        yue: "呢個資料夾喺程式安裝位置入面,更新嗰陣可能會被取代。",
    },
    "dataFolders.reason.contains-install-folder": {
        en: "That folder contains the folder the application is installed in.",
        yue: "呢個資料夾包住程式嘅安裝位置。",
    },
    "dataFolders.reason.system-folder": {
        en: "That is a system folder, or contains one. Choose a different folder.",
        yue: "呢個係系統資料夾,或者入面有系統資料夾,請揀第二個。",
    },
    "dataFolders.reason.inside-other-folder": {
        en: "That folder is the same as, or inside, the other data folder. The two must be separate.",
        yue: "呢個資料夾同另一個資料夾一樣,或者喺佢入面。兩個必須分開。",
    },
    "dataFolders.reason.contains-other-folder": {
        en: "That folder contains the other data folder. The two must be separate.",
        yue: "呢個資料夾包住另一個資料夾。兩個必須分開。",
    },
    "dataFolders.reason.not-a-folder": { en: "That path is a file, not a folder.", yue: "呢個路徑係檔案,唔係資料夾。" },
    "dataFolders.reason.not-creatable": {
        en: "That folder cannot be created there.",
        yue: "喺嗰度建立唔到呢個資料夾。",
    },
    "dataFolders.reason.not-writable": { en: "That folder is not writable.", yue: "呢個資料夾寫入唔到。" },
    "dataFolders.reason.not-empty": {
        en: "That folder already has files in it. Nothing is overwritten, so choose an empty or new folder.",
        yue: "呢個資料夾入面已經有檔案。我哋唔會覆蓋任何嘢,請揀一個空嘅或者新嘅資料夾。",
    },

    "dataFolders.progress.label": { en: "Folder change progress", yue: "資料夾變更進度" },
    "dataFolders.progress.starting": { en: "Getting ready...", yue: "準備緊…" },
    "dataFolders.progress.measuring": { en: "Measuring what will be copied...", yue: "計算緊要複製幾多…" },
    "dataFolders.progress.copying": { en: "Copying: {done} of {total} files", yue: "複製緊:{done} / {total} 個檔案" },
    "dataFolders.progress.verifying": {
        en: "Checking each copied file: {done} of {total}",
        yue: "逐個核對已複製嘅檔案:{done} / {total}",
    },

    "dataFolders.result.copied": {
        en: "{files} files ({size}) were copied and checked one by one.",
        yue: "已複製 {files} 個檔案({size}),並逐個核對過。",
    },
    "dataFolders.result.nothingCopied": { en: "Nothing was copied.", yue: "冇複製任何嘢。" },
    "dataFolders.result.historyIntact": {
        en: "The version history arrived intact.",
        yue: "版本歷史完整無缺咁過咗去。",
    },
    "dataFolders.result.skipped": {
        en: "{count} items were left out on purpose: caches, locks and logs that are rebuilt on their own.",
        yue: "特登冇複製 {count} 項:快取、鎖定檔同日誌,佢哋會自己重新產生。",
    },

    "dataFolders.pending": {
        en: "{folder} will be used the next time the app starts. Until then the current folder stays in use.",
        yue: "下次啟動程式就會用 {folder}。喺嗰之前仍然用緊現時嘅資料夾。",
    },
    "dataFolders.restartNow": { en: "Restart now", yue: "即刻重新啟動" },
    "dataFolders.unreachable": {
        en: "The folder you chose, {folder}, cannot be reached, so the default folder is in use for now. Reconnect it and restart to use it again, or go back to the default for good.",
        yue: "你揀嘅資料夾 {folder} 搵唔到,所以暫時用預設資料夾。重新接駁後重新啟動就可以再用返,或者永遠轉返預設。",
    },
    "dataFolders.restartToRetry": { en: "Restart and try again", yue: "重新啟動再試" },
    "dataFolders.useDefaultForGood": { en: "Use the default for good", yue: "永遠用預設" },

    "dataFolders.removal.explain": {
        en: "The old folder {folder} is still on disk. Once you are happy with the new one, you can remove it. The new folder is compared with it first, and nothing is removed if they differ.",
        yue: "舊資料夾 {folder} 仲喺磁碟度。你滿意新嘅之後可以刪走佢。刪之前會先同新資料夾比較,如果有分別就唔會刪。",
    },
    "dataFolders.removal.button": { en: "Remove the old folder...", yue: "刪走舊資料夾…" },
    "dataFolders.removal.title": { en: "Remove the old folder", yue: "刪走舊資料夾" },
    "dataFolders.removal.action": {
        en: "Permanently delete the old folder after proving the new one holds everything.",
        yue: "證實新資料夾包含晒所有嘢之後,永久刪除舊資料夾。",
    },
    "dataFolders.removal.confirm": { en: "Remove the old folder", yue: "刪走舊資料夾" },

    "dataFolders.history.title": { en: "Profile history", yue: "個人設定歷史" },
    "dataFolders.history.noGit": {
        en: "Git is not available, so no history is kept. Everything else works as usual.",
        yue: "用唔到 Git,所以唔會保存歷史。其他功能一切正常。",
    },
    "dataFolders.history.none": { en: "No version has been saved yet.", yue: "未儲存過任何版本。" },
    "dataFolders.history.last": {
        en: "Last saved version: {subject} ({when})",
        yue: "最近儲存嘅版本:{subject}({when})",
    },
    "dataFolders.history.explain": {
        en: "A new version is saved a little while after your settings settle, and when the app closes. Caches, locks and logs are left out. Files that hold sign-in details are kept here on this computer exactly as they are.",
        yue: "設定穩定咗一陣之後,以及關閉程式嗰陣,都會儲存新版本。快取、鎖定檔同日誌唔會入。載有登入資料嘅檔案會原樣保留喺呢部電腦。",
    },
    "dataFolders.history.saveNow": { en: "Save a version now", yue: "即刻儲存一個版本" },

    "dataFolders.remote.title": {
        en: "Send the history to a repository (optional)",
        yue: "將歷史傳去儲存庫(可選)",
    },
    "dataFolders.remote.explain": {
        en: "Off until you turn it on. A private repository is strongly recommended, and is the only kind created here. The history is only ever added to, never overwritten.",
        yue: "你開啟之前都係關閉。強烈建議用私人儲存庫,呢度亦只會建立私人儲存庫。歷史只會不斷加入,永遠唔會覆蓋。",
    },
    "dataFolders.remote.address": { en: "Repository address", yue: "儲存庫地址" },
    "dataFolders.remote.addressHint": {
        en: "https://github.com/you/worldlens-profile.git",
        yue: "https://github.com/你/worldlens-profile.git",
    },
    "dataFolders.remote.saveAddress": { en: "Save address", yue: "儲存地址" },
    "dataFolders.remote.addressUnchanged": {
        en: "Save address is unavailable: the address has not changed.",
        yue: "用唔到「儲存地址」:地址冇改過。",
    },
    "dataFolders.remote.enable": {
        en: "Send the history to this repository",
        yue: "將歷史傳去呢個儲存庫",
    },
    "dataFolders.remote.needAddress": {
        en: "Save the address of a private repository first.",
        yue: "請先儲存私人儲存庫嘅地址。",
    },
    "dataFolders.remote.saveFirst": { en: "Save the changed address first.", yue: "請先儲存改過嘅地址。" },
    "dataFolders.remote.createTitle": {
        en: "Create a private repository on GitHub",
        yue: "喺 GitHub 建立私人儲存庫",
    },
    "dataFolders.remote.signInFirst": {
        en: "Sign in with GitHub CLI first. The sign-in is done in the GitHub account section of these settings, and no token is ever typed here.",
        yue: "請先用 GitHub CLI 登入。登入係喺設定入面嘅 GitHub 戶口部分做,呢度唔使輸入任何權杖。",
    },
    "dataFolders.remote.openSignIn": { en: "Go to GitHub sign-in", yue: "去 GitHub 登入" },
    "dataFolders.remote.account": { en: "GitHub account", yue: "GitHub 戶口" },
    "dataFolders.remote.owner": { en: "Owner", yue: "擁有者" },
    "dataFolders.remote.organization": { en: "organization", yue: "組織" },
    "dataFolders.remote.name": { en: "Repository name", yue: "儲存庫名稱" },
    "dataFolders.remote.create": { en: "Create private repository", yue: "建立私人儲存庫" },
    "dataFolders.remote.noOwner": {
        en: "Create is unavailable: no owner could be read for this account.",
        yue: "用唔到「建立」:讀取唔到呢個戶口可用嘅擁有者。",
    },
    "dataFolders.remote.send": { en: "Send now", yue: "即刻傳送" },
    "dataFolders.remote.sending": { en: "Sending...", yue: "傳送緊…" },
    "dataFolders.remote.offReason": { en: "Turn on sending first.", yue: "請先開啟傳送。" },
    "dataFolders.remote.lastPushVerified": {
        en: "Last sent and confirmed on the remote: {when}",
        yue: "最近一次傳送,並已喺遠端確認:{when}",
    },
    "dataFolders.remote.lastPushUnverified": {
        en: "Last sent, but not confirmed on the remote: {when}",
        yue: "最近一次傳送,但未能喺遠端確認:{when}",
    },

    "dataFolders.credentials.recommend": {
        en: "Some files in the profile folder hold sign-in details. They are never sent to a public or third-party host by default. If you want them in the remote as well, use a Git server on your own network, such as a self-hosted GitLab, and turn the option below on.",
        yue: "個人設定資料夾入面有啲檔案載有登入資料。預設永遠唔會傳去公開或者第三方主機。如果你想連佢哋一齊傳,請用你自己網絡上嘅 Git 伺服器(例如自行架設嘅 GitLab),然後開啟下面嘅選項。",
    },
    "dataFolders.credentials.include": {
        en: "Also send sign-in files (own-network servers only)",
        yue: "連登入資料檔案一齊傳(只限自己網絡嘅伺服器)",
    },
    "dataFolders.credentials.none": {
        en: "There are no sign-in files in the profile folder.",
        yue: "個人設定資料夾入面冇登入資料檔案。",
    },
    "dataFolders.credentials.needLocal": {
        en: "Sign-in files can only go to a Git server on your own network. Set the address of one first.",
        yue: "登入資料檔案只可以傳去你自己網絡上嘅 Git 伺服器。請先設定一個。",
    },
    "dataFolders.credentials.warning": {
        en: "Sign-in files are included. Turning this off later stops sending them, but copies already sent stay in the remote's history.",
        yue: "已經包括登入資料檔案。之後關閉只會停止再傳,已經傳咗嘅副本會留喺遠端歷史入面。",
    },
    "dataFolders.excluded.summary": {
        en: "What is left out when sending",
        yue: "傳送嗰陣會略過咩",
    },
} as const;
