import type { FlavourId } from "./flavours/catalogue.js";
import { requiredJavaFeature } from "./flavours/javaRequirement.js";
import { fail, ok, type Answer } from "./transport/types.js";

export const SERVER_CREATION_FLAVOURS = ["vanilla", "paper", "purpur", "spigot", "fabric", "forge", "neoforge", "velocity"] as const;
export type ServerCreationFlavour = FlavourId | "spigot";

/** Image contracts are documented by itzg/docker-minecraft-server and itzg/docker-mc-proxy. */
export function dockerServerProfile(input: {
    flavour: ServerCreationFlavour;
    version: string;
    gameVersion?: string;
    loaderVersion?: string;
}): Answer<{
    imageRepository: string;
    serverDir: string;
    javaFeature: number;
    env: Record<string, string>;
}> {
    const { flavour, version } = input;
    if (flavour === "velocity") {
        const match = /^([^#]+)#([0-9]+)$/.exec(version);
        if (!match)
            return fail(
                "invalid-request",
                "Choose an exact Velocity version and build from the catalogue.",
            );
        return ok({
            imageRepository: "itzg/mc-proxy",
            serverDir: "/server",
            javaFeature: 21,
            env: { TYPE: "VELOCITY", VELOCITY_VERSION: match[1]!, VELOCITY_BUILD_ID: match[2]! },
        });
    }
    let game = version;
    const env: Record<string, string> = { TYPE: flavour.toUpperCase() };
    if (flavour === "spigot") env.BUILD_FROM_SOURCE = "true";
    if (flavour === "paper" || flavour === "purpur") {
        const match = /^([^#]+)(?:#([0-9]+))?$/.exec(version);
        if (!match) return fail("invalid-request", "Choose a valid server version and build.");
        game = match[1]!;
        if (match[2]) env[flavour === "paper" ? "PAPER_BUILD" : "PURPUR_BUILD"] = match[2];
    } else if (flavour === "forge") {
        const match = /^(1\.[0-9]+(?:\.[0-9]+)?)-([0-9][0-9.]*)$/.exec(version);
        if (!match)
            return fail(
                "invalid-request",
                "Choose the exact Minecraft-Forge version pair from the catalogue.",
            );
        game = match[1]!;
        if (input.loaderVersion && input.loaderVersion !== match[2])
            return fail(
                "invalid-request",
                "The Forge loader differs from the selected catalogue build.",
            );
        env.FORGE_VERSION = match[2]!;
    } else if (flavour === "neoforge") {
        const match = /^([0-9]+)\.([0-9]+)\.[0-9]+(?:-beta)?$/.exec(version);
        if (!match || Number(match[1]) < 20)
            return fail(
                "invalid-request",
                "This NeoForge version has no supported Minecraft version mapping.",
            );
        game = `1.${match[1]}${match[2] === "0" ? "" : `.${match[2]}`}`;
        if (input.loaderVersion && input.loaderVersion !== version)
            return fail(
                "invalid-request",
                "The NeoForge loader differs from the selected catalogue build.",
            );
        env.NEOFORGE_VERSION = version;
    } else if (flavour === "fabric") {
        if (
            !input.gameVersion ||
            !/^(?:1\.[0-9]+(?:\.[0-9]+)?|[0-9]{2}\.[0-9]+(?:\.[0-9]+)?)$/.test(input.gameVersion)
        )
            return fail(
                "invalid-request",
                "Choose a Minecraft game version separately from the Fabric loader.",
            );
        if (input.loaderVersion && input.loaderVersion !== version)
            return fail(
                "invalid-request",
                "The Fabric loader differs from the selected catalogue build.",
            );
        game = input.gameVersion;
        env.FABRIC_LOADER_VERSION = version;
    }
    env.VERSION = game;
    const requirement = requiredJavaFeature(game);
    const javaFeature = requirement.known
        ? requirement.feature
        : /^(?:2[6-9]|[3-9][0-9])\./.test(game)
          ? 25
          : 21;
    return ok({ imageRepository: "itzg/minecraft-server", serverDir: "/data", javaFeature, env });
}
