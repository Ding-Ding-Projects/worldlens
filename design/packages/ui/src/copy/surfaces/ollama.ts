/**
 * Every word `OllamaScreen.vue` and its children put on screen.
 *
 * `OLLAMA_VOICED` is where the per-language funny level is actually allowed to move the
 * words: the introduction, the runtime recovery guidance and the cart's not-commerce
 * disclaimer are all places somebody reads once and moves on, exactly the kind of copy the
 * shared instructions ask for the sliders to reach. `OLLAMA_FIXED` holds control labels,
 * state names and disabled-reason text, none of which a level is allowed to restyle, because
 * a "Delete" button whose label moves under somebody between two visits is a button they have
 * to re-read every time, and a disabled-control reason is a fact rather than a mood.
 *
 * `OLLAMA_FACTS` pins the one thing that must survive every level unchanged: the not-commerce
 * disclaimer keeps saying "no price" and "no account" at level 1 and at level 5 alike, and the
 * runtime-missing guidance keeps naming that Ollama itself, not this app, is what is missing.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const OLLAMA_FIXED = {
    "ollama.title": { en: "Ollama", yue: "Ollama" },
    "ollama.runtime.missing": { en: "Ollama is not installed", yue: "未安裝 Ollama" },
    "ollama.runtime.stopped": { en: "Ollama is not running", yue: "Ollama 未開機" },
    "ollama.runtime.unhealthy": { en: "Ollama answered oddly", yue: "Ollama 答得怪怪哋" },
    "ollama.runtime.ready": { en: "Ollama is ready", yue: "Ollama 準備好喇" },
    "ollama.runtime.checking": { en: "Checking for Ollama…", yue: "檢查緊 Ollama…" },
    "ollama.runtime.recheck": { en: "Check again", yue: "再檢查一次" },
    "ollama.runtime.openDownload": {
        en: "Open the official Ollama download page",
        yue: "開返 Ollama 官方下載頁",
    },
    "ollama.store.title": { en: "Model Store", yue: "模型商店" },
    "ollama.store.search": { en: "Search models and tags", yue: "搜尋模型同標籤" },
    "ollama.store.refresh": { en: "Refresh catalogue", yue: "更新目錄" },
    "ollama.store.stale": {
        en: "Showing the last verified catalogue. It is stale.",
        yue: "而家顯示緊上次驗證嘅目錄，已經過時。",
    },
    "ollama.store.filter.installed": { en: "Installed", yue: "已安裝" },
    "ollama.store.filter.fit": { en: "Hardware fit", yue: "硬件合適度" },
    "ollama.fit.runsWell": { en: "Runs well", yue: "跑得順" },
    "ollama.fit.runsWithLimits": { en: "Runs with limits", yue: "有限制咁跑" },
    "ollama.fit.unlikely": { en: "Unlikely", yue: "應該唔得" },
    "ollama.fit.unknown": { en: "Unknown", yue: "唔知道" },
    "ollama.model.addToCart": { en: "Add to pull cart", yue: "加入落載清單" },
    "ollama.model.delete": { en: "Delete this model", yue: "刪除呢個模型" },
    "ollama.model.deleteConfirmTitle": { en: "Delete this model?", yue: "刪除呢個模型？" },
    "ollama.model.deleteConfirmLabel": { en: "Delete model forever", yue: "永久刪除模型" },
    "ollama.model.deleteAction": {
        en: "This deletes the local copy of {name}. Nothing else on this machine is touched, and it would have to be pulled again to use it.",
        yue: "呢個操作會刪除 {name} 喺呢部機嘅本機複本。其他嘢唔會受影響，之後要再落載先用得。",
    },
    "ollama.cart.title": { en: "Pull cart", yue: "落載清單" },
    "ollama.cart.empty": { en: "Nothing queued yet.", yue: "未有嘢排緊隊。" },
    "ollama.cart.start": { en: "Start pulling", yue: "開始落載" },
    "ollama.chat.title": { en: "Chat", yue: "對話" },
    "ollama.chat.newSession": { en: "New chat", yue: "開新對話" },
    "ollama.chat.rename": { en: "Rename chat", yue: "改對話名" },
    "ollama.chat.delete": { en: "Delete chat", yue: "刪除對話" },
    "ollama.chat.deleteConfirmTitle": { en: "Delete this chat?", yue: "刪除呢個對話？" },
    "ollama.chat.deleteConfirmLabel": { en: "Delete chat forever", yue: "永久刪除對話" },
    "ollama.chat.deleteAction": {
        en: "This deletes {count} messages in this chat. Nothing else is touched, and a deleted chat cannot be recovered.",
        yue: "呢個操作會刪除呢個對話入面 {count} 個訊息。其他嘢唔會受影響，刪除咗嘅對話冇得復原。",
    },
    "ollama.chat.search": { en: "Search chats", yue: "搜尋對話" },
    "ollama.chat.storageFailure": {
        en: "Saved chats could not be read, so this screen will not overwrite them. Resolve the local storage problem, then reopen this tab. Details: {reason}",
        yue: "讀唔到已儲存嘅對話，所以呢個畫面唔會覆蓋佢哋。處理好本機儲存問題，再重新開呢個分頁。詳情：{reason}",
    },
    "ollama.chat.systemPrompt": { en: "System prompt", yue: "系統提示" },
    "ollama.chat.send": { en: "Send", yue: "發送" },
    "ollama.chat.stop": { en: "Stop", yue: "停止" },
    "ollama.chat.retry": { en: "Retry", yue: "再試一次" },
    "ollama.chat.modelLabel": { en: "Model", yue: "模型" },
    "ollama.disabled.noRuntime": { en: "Ollama is not ready yet.", yue: "Ollama 仲未準備好。" },
    "ollama.disabled.noModel": { en: "Choose a model first.", yue: "先揀個模型。" },
    "ollama.disabled.noMessage": { en: "Type a message first.", yue: "先打段訊息。" },
    "ollama.disabled.emptyQueue": { en: "The pull cart is empty.", yue: "落載清單係空嘅。" },
} as const satisfies Record<string, FixedString>;

export const OLLAMA_VOICED = {
    "ollama.intro": {
        en: [
            "Run language models on this machine, with no cloud account required.",
            "Run language models right here, no cloud account needed.",
            "This is where you run models locally, with your machine doing all the work.",
            "Welcome to the local model workshop: your machine, your models, nobody else's server.",
            "Behold: models running entirely on this machine, asking nothing of any cloud whatsoever.",
        ],
        yue: [
            "喺呢部機度跑語言模型，唔使雲端帳戶。",
            "喺呢度跑語言模型，唔使開雲端帳戶。",
            "呢度係你本機跑模型嘅地方，全部嘢由你部機做。",
            "歡迎嚟到本機模型工作坊：你部機，你嘅模型，同雲端服務器冇關係。",
            "睇吓：模型完全喺呢部機度跑，乜雲端都唔使求。",
        ],
    },
    "ollama.runtime.missingGuidance": {
        en: [
            "Ollama itself is not installed. Install it, then check again.",
            "Ollama itself is not installed on this machine. Install it, then check again.",
            "This app found no Ollama here at all. Grab the official installer, then check again.",
            "Ollama has not moved in yet. Install the official build, then knock again with Check again.",
            "No Ollama in sight. Fetch the official installer and this app will happily wait right here.",
        ],
        yue: [
            "呢部機未裝 Ollama。裝咗佢，再檢查一次。",
            "Ollama 呢個程式本身未裝喺呢部機。裝咗佢，再檢查一次。",
            "呢個程式喺呢部機搵唔到 Ollama。攞返官方安裝程式，再檢查一次。",
            "Ollama 都未搬入嚟。裝返官方版本，再撳「再檢查一次」。",
            "周圍都搵唔到 Ollama。攞個官方安裝程式返嚟，呢個程式會喺度乖乖等。",
        ],
    },
    "ollama.runtime.stoppedGuidance": {
        en: [
            "Ollama is installed but not currently running. Start it, then check again.",
            "Ollama is installed but is not running right now. Start it, then check again.",
            "Ollama is here, just not awake yet. Start it up, then check again.",
            "Ollama is installed and taking a nap. Wake it up, then knock again with Check again.",
            "Ollama is installed and fast asleep. Give it a nudge, then this app will check right away.",
        ],
        yue: [
            "Ollama 已裝但而家未開機。開返佢，再檢查一次。",
            "Ollama 已經裝咗，但而家未跑緊。開返佢，再檢查一次。",
            "Ollama 喺度，不過未瞓醒。開返佢，再檢查一次。",
            "Ollama 裝咗喺度瞓緊覺。叫醒佢，再撳「再檢查一次」。",
            "Ollama 裝咗喺度瞓到好熟。搖醒佢，呢個程式即刻幫你檢查。",
        ],
    },
    "ollama.runtime.unhealthyGuidance": {
        en: [
            "Ollama answered, but not in the shape this app expected. Check again once it settles.",
            "Ollama answered, but not in the shape this app expected. Check again once it settles.",
            "Ollama picked up the phone and said something odd. Give it a moment, then check again.",
            "Ollama is up but talking nonsense right now. Let it settle, then knock again.",
            "Ollama answered in a language even Ollama doesn't usually speak. Wait a moment, then check again.",
        ],
        yue: [
            "Ollama 有答，但答嘅嘢唔係呢個程式睇得明嘅樣。等佢定返啲，再檢查一次。",
            "Ollama 有答，不過個格式唔係呢個程式期望嘅。等一陣，再檢查一次。",
            "Ollama 聽咗電話但講嘢有啲怪。俾佢定一定，再檢查一次。",
            "Ollama 而家開緊機但講緊胡言亂語。等佢定返，再撳一次。",
            "Ollama 答返嚟嘅嘢連 Ollama 自己都唔識講。等一陣，再檢查一次。",
        ],
    },
    "ollama.cart.notCommerce": {
        en: [
            "This is a download queue: no price, no checkout, no account and no payment.",
            "This is a download queue only: no price, no checkout, no account and no payment.",
            "Nothing here costs a cent: no price, no checkout, no account, no payment, just a download queue.",
            "Relax, wallet: this cart has no price, no checkout, no account and no payment, only a queue of downloads.",
            "This cart is a delightful impostor: it looks like shopping, but there is no price, no checkout, no account and no payment anywhere.",
        ],
        yue: [
            "呢度淨係落載清單：冇價錢、冇結帳、冇帳戶、冇付款。",
            "呢度只係落載排隊清單：冇價錢、冇結帳、冇帳戶、冇付款。",
            "呢度乜錢都唔使：冇價錢、冇結帳、冇帳戶、冇付款，淨係落載排隊。",
            "荷包放心：呢個「購物車」冇價錢、冇結帳、冇帳戶、冇付款，淨係排隊落載。",
            "呢個「購物車」係扮相靚仔嘅假貨：睇落似買嘢，但冇價錢、冇結帳、冇帳戶、冇付款。",
        ],
    },
    "ollama.chat.empty": {
        en: [
            "No messages yet. Choose a model and start typing.",
            "No messages yet. Choose a model and start typing.",
            "Nothing said yet. Pick a model, then break the silence.",
            "A blank page waiting for its first line. Pick a model and go.",
            "Total silence so far. Pick a model and give this chat something to talk about.",
        ],
        yue: [
            "未有訊息。揀個模型，開始打字。",
            "未有任何訊息。揀個模型，打字啦。",
            "仲未講過嘢。揀個模型，打破沉默。",
            "白紙一張等緊第一句。揀個模型，開始啦。",
            "而家靜晒。揀個模型，俾呢個對話啲嘢傾。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const OLLAMA_FACTS = {
    "ollama.intro": { en: ["models"], yue: ["模型"] },
    "ollama.runtime.missingGuidance": { en: ["Ollama"], yue: ["Ollama"] },
    "ollama.runtime.stoppedGuidance": { en: ["Ollama"], yue: ["Ollama"] },
    "ollama.runtime.unhealthyGuidance": { en: ["Ollama"], yue: ["Ollama"] },
    "ollama.cart.notCommerce": {
        en: ["no price", "no checkout", "no account", "no payment"],
        yue: ["冇價錢", "冇結帳", "冇帳戶", "冇付款"],
    },
    "ollama.chat.empty": { en: ["model"], yue: ["模型"] },
} as const satisfies Record<
    keyof typeof OLLAMA_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
