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
    "dockerHosting.create.failed": {
        en: "Docker could not create this app-owned container.",
        yue: "Docker 未能建立呢個由程式擁有嘅 container。",
    },
} as const satisfies Record<string, FixedString>;

export const DOCKERHOSTING_FACTS = {} as const satisfies Record<
    keyof typeof DOCKERHOSTING_VOICED,
    { readonly en: readonly string[]; readonly yue: readonly string[] }
>;
