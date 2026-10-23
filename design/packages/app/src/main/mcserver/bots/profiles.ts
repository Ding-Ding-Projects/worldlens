import { BARITONE_PROFILE } from "./baritone.js";
import { BOT_DEPENDENCIES } from "./mineflayer.js";
export interface BotCapability {
    engine: "mineflayer" | "baritone";
    serverVersion: string;
    available: boolean;
    reason: string | null;
    runtimeVerified: false;
    runtime: Readonly<Record<string, string | number>>;
    source: string;
}
/** Runtime-declared versions are required; a broad version range never proves an exact adapter exists. */
export function describeBotProfiles(
    serverVersion: string,
    installedMineflayerVersions: readonly string[] = [],
): BotCapability[] {
    const mineflayer =
        installedMineflayerVersions.includes(serverVersion) &&
        !/^26\.(?:[2-9]|\d{2,})(?:\.|$)/.test(serverVersion);
    const baritone = serverVersion === BARITONE_PROFILE.minecraft;
    return [
        {
            engine: "mineflayer",
            serverVersion,
            available: mineflayer,
            reason: mineflayer
                ? null
                : "The reviewed installed Mineflayer runtime does not declare this exact version. Documented support ends at 26.1.",
            runtimeVerified: false,
            runtime: BOT_DEPENDENCIES,
            source: "https://github.com/PrismarineJS/mineflayer/blob/7b4bb8d2b56be9cdb832474af873acd37e609746/docs/README.md",
        },
        {
            engine: "baritone",
            serverVersion,
            available: baritone,
            reason: baritone
                ? null
                : "The managed bridge is currently bound to Minecraft 1.21.4. Other official Baritone distributions require a matching verified bridge and client launcher.",
            runtimeVerified: false,
            runtime: {
                minecraft: BARITONE_PROFILE.minecraft,
                javaMajor: BARITONE_PROFILE.javaMajor,
                fabricLoader: BARITONE_PROFILE.fabricLoader,
                baritone: BARITONE_PROFILE.baritone,
                bridge: BARITONE_PROFILE.bridge,
            },
            source: "https://github.com/cabaletta/baritone/releases/tag/v1.13.1",
        },
    ];
}
