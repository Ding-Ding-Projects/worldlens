/**
 * Fixed labels for the Docker hosting manager's guided create surface.
 *
 * These labels keep the create flow's facts visible in both supported language modes:
 * the instance identity, digest-pinned image boundary, loopback-only ports, installation-
 * owned volumes, validation messages, disabled reasons, and the create operation states.
 * They are fixed rather than funny-level voiced because a field label or validation fact
 * should not move around between visits or imply a different safety boundary at another
 * setting.
 */

import type { FixedString } from "../../components/setup/setupStrings.js";

export const DOCKERHOSTING_VOICED = {} as const;

export const DOCKERHOSTING_FIXED = {
    "dockerHosting.create.title": {
        en: "Create an app-owned container",
        yue: "建立一個由呢個程式擁有嘅 container",
    },
    "dockerHosting.create.help": {
        en: "Choose real Docker data below. Creation uses the selected image's declared ENTRYPOINT/CMD, a digest-pinned image, loopback-only ports, and installation-owned volumes; Create runs no arbitrary command and does not start the container. Use Start explicitly.",
        yue: "喺下面揀真實 Docker 資料。建立時會用所選 image 聲明嘅 ENTRYPOINT/CMD、digest 鎖定嘅 image、只限 loopback 嘅 ports，同由呢個安裝擁有嘅 volumes；Create 唔會執行任意指令，亦唔會啟動 container。要明確撳 Start。",
    },
    "dockerHosting.create.id": { en: "Instance id", yue: "實例 id" },
    "dockerHosting.create.name": { en: "Display name", yue: "顯示名稱" },
    "dockerHosting.create.imageChoice": {
        en: "Digest-pinned image from Docker",
        yue: "Docker 提供嘅 digest 鎖定 image",
    },
    "dockerHosting.create.imageChoiceHint": {
        en: "Only images ending in a verified sha256 digest are offered.",
        yue: "只會提供以已驗證 sha256 digest 結尾嘅 image。",
    },
    "dockerHosting.create.imageFree": {
        en: "Or enter an exact digest-pinned image",
        yue: "或者輸入完整 digest 鎖定 image",
    },
    "dockerHosting.create.ports": { en: "Loopback ports", yue: "Loopback ports" },
    "dockerHosting.create.portsHint": {
        en: "Optional comma-separated ports; Docker binds each one to 127.0.0.1 only.",
        yue: "可選，用逗號分隔 ports；Docker 只會將每個 port 綁定到 127.0.0.1。",
    },
    "dockerHosting.create.volumeChoice": {
        en: "Owned Docker volumes",
        yue: "由呢個安裝擁有嘅 Docker volumes",
    },
    "dockerHosting.create.volumeChoiceHint": {
        en: "Choose only volumes reported as owned by this installation.",
        yue: "只揀標記為由呢個安裝擁有嘅 volumes。",
    },
    "dockerHosting.create.volumeFree": {
        en: "Or enter owned volume names",
        yue: "或者輸入由呢個安裝擁有嘅 volume 名稱",
    },
    "dockerHosting.create.volumeFreeHint": {
        en: "Optional comma-separated names; each must begin with worldlens-.",
        yue: "可選，用逗號分隔名稱；每個都要以 worldlens- 開頭。",
    },
    "dockerHosting.create.noDigestImages": {
        en: "Docker reported no digest-pinned images. Enter an exact digest reference to continue; the manager will not guess a tag or pull an image for you.",
        yue: "Docker 回報冇 digest 鎖定嘅 image。請輸入完整 digest reference 先可以繼續；管理器唔會幫你估 tag 或拉 image。",
    },
    "dockerHosting.create.imageRequired": {
        en: "Choose a digest-pinned image or enter one below.",
        yue: "揀一個 digest 鎖定嘅 image，或者喺下面輸入一個。",
    },
    "dockerHosting.create.imageInvalid": {
        en: "Use an image reference ending in @sha256: followed by 64 lowercase hexadecimal characters.",
        yue: "請用以 @sha256: 加 64 個小寫十六進制字元結尾嘅 image reference。",
    },
    "dockerHosting.create.idRequired": {
        en: "Enter a lowercase id beginning with a letter; use only letters, numbers, and hyphens.",
        yue: "輸入一個以字母開頭嘅小寫 id；只可以用字母、數字同連字號。",
    },
    "dockerHosting.create.idInvalid": {
        en: "The id must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens (1–63 characters).",
        yue: "id 必須以小寫字母開頭，只可以包含小寫字母、數字同連字號（1–63 個字元）。",
    },
    "dockerHosting.create.nameRequired": {
        en: "Enter a display name for this app-owned container.",
        yue: "輸入呢個由程式擁有嘅 container 顯示名稱。",
    },
    "dockerHosting.create.nameInvalid": {
        en: "The display name must be 1–120 characters and cannot contain line breaks.",
        yue: "顯示名稱必須有 1–120 個字元，而且唔可以包含換行。",
    },
    "dockerHosting.create.portsInvalid": {
        en: "Use unique loopback ports as comma-separated integers from 1 through 65535.",
        yue: "請用逗號分隔、由 1 到 65535 嘅唯一 loopback port 整數。",
    },
    "dockerHosting.create.volumesInvalid": {
        en: "Volumes must be installation-owned names beginning with worldlens-; separate names with commas.",
        yue: "Volumes 必須係以 worldlens- 開頭、由呢個安裝擁有嘅名稱；用逗號分隔各個名稱。",
    },
    "dockerHosting.create.bridgeUnavailable": {
        en: "The desktop bridge is unavailable, so Docker creation cannot start.",
        yue: "桌面 bridge 未能使用，所以 Docker 建立流程未可以開始。",
    },
    "dockerHosting.create.snapshotRequired": {
        en: "Refresh Docker before creating an app-owned container.",
        yue: "建立由程式擁有嘅 container 之前，請先重新整理 Docker。",
    },
    "dockerHosting.create.daemonNotReady": {
        en: "Docker is not ready; creation stays disabled until the daemon is ready.",
        yue: "Docker 未準備好；要等 daemon ready 先會解除建立停用狀態。",
    },
    "dockerHosting.create.disabledReason": {
        en: "Creation disabled: {reason}",
        yue: "建立已停用：{reason}",
    },
    "dockerHosting.create.action": { en: "Create container", yue: "建立 container" },
    "dockerHosting.create.progress": {
        en: "Creating app-owned container",
        yue: "建立緊由程式擁有嘅 container",
    },
    "dockerHosting.create.created": {
        en: "App-owned container created and verified in the refreshed snapshot.",
        yue: "由程式擁有嘅 container 已建立，並已喺重新整理嘅 snapshot 入面驗證。",
    },
    "dockerHosting.create.createdRefreshFailed": {
        en: "Docker accepted the container creation, but refreshing the verified snapshot failed; review the error above before managing it.",
        yue: "Docker 接受咗建立 container，但重新整理已驗證 snapshot 失敗；管理之前請先查看上面嘅錯誤。",
    },
    /* Catalogue-coverage sweep: no answer on this side, so every language and every
       funny level showed the English written at the call site. */
    "dockerHosting.cancel": { en: "Cancel", yue: "取消" },
    "dockerHosting.cancelled": { en: "Operation cancelled; no further Docker action was started.", yue: "已經取消；冇再開多任何 Docker 動作。" },
    "dockerHosting.clearSelection": { en: "Clear", yue: "清除" },
    "dockerHosting.empty": { en: "No app-owned BlueMap server containers are available.", yue: "冇呢個程式管住嘅 BlueMap 伺服器 container。" },
    "dockerHosting.export": { en: "Export", yue: "匯出" },
    "dockerHosting.logs": { en: "Operation log", yue: "操作記錄" },
    "dockerHosting.noPorts": { en: "No published ports", yue: "冇對外開過 port" },
    "dockerHosting.ready": { en: "Docker ready", yue: "Docker 準備好" },
    "dockerHosting.refresh": { en: "Refresh", yue: "重新讀取" },
    "dockerHosting.remove": { en: "Remove", yue: "移除" },
    "dockerHosting.restart": { en: "Restart", yue: "重新開" },
    "dockerHosting.running": { en: "Running", yue: "行緊" },
    "dockerHosting.selected": { en: "{count} selected", yue: "揀咗 {count} 個" },
    "dockerHosting.server": { en: "Daemon {version}", yue: "Daemon {version}" },
    "dockerHosting.start": { en: "Start", yue: "開" },
    "dockerHosting.stop": { en: "Stop", yue: "停" },
    "dockerHosting.stopped": { en: "Stopped", yue: "停咗" },
    "dockerHosting.title": { en: "Docker hosting manager", yue: "Docker 寄存管理" },
    "dockerHosting.unavailable": { en: "This build cannot manage Docker. The desktop bridge is not available.", yue: "呢個版本管唔到 Docker，因為冇桌面版嗰條橋。" },
    "dockerHosting.update": { en: "Update", yue: "更新" },
    "dockerHosting.removeBody": { en: "This removes only the selected app-owned container. Volumes and unrelated workloads are kept.", yue: "呢個只會刪走你揀嗰個由本 app 擁有嘅容器。磁碟區同其他唔相關嘅工作照樣保留。" },
    "dockerHosting.removeTitle": { en: "Confirm removing this server", yue: "確認刪走呢部伺服器" },
    "dockerHosting.search": { en: "Search owned containers", yue: "搵本 app 擁有嘅容器" },
    "dockerHosting.select": { en: "Select {name}", yue: "揀 {name}" },
    "dockerHosting.stopBody": { en: "Stopping is safe: it ends this app-owned container, keeps its volumes, and does not touch unrelated Docker workloads.", yue: "停係安全嘅：只會結束呢個由本 app 擁有嘅容器，保留佢啲磁碟區，亦唔會掂到其他唔相關嘅 Docker 工作。" },
    "dockerHosting.stopTitle": { en: "Confirm stopping this server", yue: "確認停低呢部伺服器" },
    "dockerHosting.updateDisabled": { en: "Update is disabled until a transactional recreate plan is available; no running workload will be replaced implicitly.", yue: "喺有一套可以一次過完成嘅重建方案之前，更新都會停用；唔會靜靜雞換走緊行緊嘅工作。" },
} as const satisfies Record<string, FixedString>;

export const DOCKERHOSTING_FACTS = {} as const satisfies Record<
    keyof typeof DOCKERHOSTING_VOICED,
    { readonly en: readonly string[]; readonly yue: readonly string[] }
>;
