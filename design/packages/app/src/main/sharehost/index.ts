export { createShareHostService, type ShareHostOptions, type ShareHostService } from "./service.js";
export { registerShareHostHandlers, SHARE_HOST_CHANNELS, SHARE_HOST_EVENT_CHANNEL, parseRequest, parseTarget, type ShareHostIpc, type ShareHostIpcOptions } from "./ipc.js";
export { hostMap, validateRequest, formatBytes, type HostMapDeps } from "./hostMap.js";
export { ShareHostManager, type ManagerAnswer } from "./manager.js";
export { createFileRegistry, createMemoryRegistry, type InstanceRegistry } from "./registry.js";
export { readBundledImage, archFromDocker, BundledImageError, type BundledImage, type ImageArch } from "./bundledImage.js";
export { packMap, listMapSizes, hostedSettings } from "./mapPack.js";
export { generateAccess, verifierFor, ACCESS_NAME } from "./access.js";
export { wordingFrom, wordingFromStore, plainWording, type Wording } from "./wording.js";
export * from "./types.js";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where the bundled map server images are: `resources/mapserver` in a packaged app, and the
 * build script's output folder in a checkout. Both hold `mapserver-image.json`.
 */
export function defaultBundledImageDir(): string {
    const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    if (resources !== undefined && process.defaultApp !== true) return join(resources, "mapserver");
    return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "build", "mapserver");
}
