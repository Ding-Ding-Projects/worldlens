/**
 * Pure logic for the create-server wizard: which flavours exist, what each one is for,
 * how to search and group the versions the catalogue actually returned, and how to size
 * the memory slider against the machine the wizard is running on. No Vue, no bridge.
 */

import type { ServerFlavour } from "./serverModel.js";
import type { CatalogueFlavourId, CatalogueVersionEntry } from "./serverStore.js";

export const MOD_LOADER_FLAVOURS = ["fabric", "forge", "neoforge"] as const;
export type ModLoaderFlavour = (typeof MOD_LOADER_FLAVOURS)[number];

export function isModLoaderFlavour(flavour: ServerFlavour): flavour is ModLoaderFlavour {
    return (MOD_LOADER_FLAVOURS as readonly string[]).includes(flavour);
}

export interface ModLoaderProfile {
    readonly loaderVersion: string;
    readonly modsDirectory: string;
    readonly preinstallApiLibraries: readonly string[];
}

export const DEFAULT_MODS_DIRECTORY = "mods";
export const MOD_LOADER_MEMORY_MB = 4096;

export function recommendedMemoryMb(flavour: ServerFlavour): number {
    return isModLoaderFlavour(flavour) ? MOD_LOADER_MEMORY_MB : 2048;
}

export function validateModsDirectory(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed === "") return "Choose a folder name for installed mods.";
    if (trimmed === "." || trimmed === ".." || /[\\/:*?"<>|]/.test(trimmed)) {
        return "The mods folder must be one safe folder name, not a path.";
    }
    return null;
}

export interface FlavourCard {
    readonly id: ServerFlavour;
    readonly name: string;
    readonly tagline: string;
    readonly description: string;
    /** True when the catalogue can actually list versions for this flavour today. */
    readonly cataloguedId: CatalogueFlavourId | null;
}

export const FLAVOUR_CARDS: readonly FlavourCard[] = [
    {
        id: "vanilla",
        name: "Vanilla",
        tagline: "The real thing, unmodified",
        description:
            "Mojang's own server, exactly as released. No plugins, no mods - the version everyone else is built from.",
        cataloguedId: "vanilla",
    },
    {
        id: "paper",
        name: "Paper",
        tagline: "Faster, and plugin-friendly",
        description:
            "A high-performance fork of Vanilla with a large plugin ecosystem. The usual pick for a survival or community server.",
        cataloguedId: "paper",
    },
    {
        id: "purpur",
        name: "Purpur",
        tagline: "Paper, with extra knobs",
        description:
            "Builds on Paper with a long list of additional gameplay settings. Good when Paper is close but not quite configurable enough.",
        cataloguedId: "purpur",
    },
    {
        id: "spigot",
        name: "Spigot",
        tagline: "The plugin API Paper is built on",
        description:
            "The original plugin-capable server Paper forked from. Still widely supported, though Paper usually outperforms it.",
        cataloguedId: null,
    },
    {
        id: "fabric",
        name: "Fabric",
        tagline: "Lightweight mod loader",
        description:
            "A lightweight, fast-updating mod loader favoured for smaller, focused modpacks.",
        cataloguedId: "fabric",
    },
    {
        id: "forge",
        name: "Forge",
        tagline: "The classic mod loader",
        description:
            "The long-established mod loader with the largest back catalogue of existing mods. Heavier than Fabric to update.",
        cataloguedId: null,
    },
    {
        id: "neoforge",
        name: "NeoForge",
        tagline: "Forge's modern successor",
        description:
            "A community-maintained continuation of Forge, aimed at newer versions and cleaner internals.",
        cataloguedId: null,
    },
    {
        id: "velocity",
        name: "Velocity",
        tagline: "Proxy, not a game server",
        description:
            "A modern proxy that sits in front of several backend servers so players can move between them on one address. Not a world by itself.",
        cataloguedId: "velocity",
    },
];

export function flavourCard(id: ServerFlavour): FlavourCard | undefined {
    return FLAVOUR_CARDS.find((card) => card.id === id);
}

export interface VersionGroup {
    readonly stability: "release" | "snapshot";
    readonly versions: readonly CatalogueVersionEntry[];
}

export interface VersionFamily {
    readonly key: string;
    readonly label: string;
    readonly stability: "release" | "snapshot";
    readonly versions: readonly CatalogueVersionEntry[];
}

/**
 * Groups exact provider versions into a family without dropping any build row.
 * Release families use `major.minor.x`; snapshots stay separate so a dated snapshot
 * never looks like a stable release. Entries retain provider order within each family.
 */
export function groupVersionFamilies(
    versions: readonly CatalogueVersionEntry[],
): readonly VersionFamily[] {
    const families: VersionFamily[] = [];
    const byKey = new Map<string, VersionFamily>();
    for (const entry of versions) {
        const match = /^(\d+)\.(\d+)/.exec(entry.version);
        const base = match === null ? entry.version : `${match[1]}.${match[2]}.x`;
        const key = `${entry.stability}:${base}`;
        const existing = byKey.get(key);
        if (existing !== undefined) {
            const replacement = { ...existing, versions: [...existing.versions, entry] };
            byKey.set(key, replacement);
            families[families.indexOf(existing)] = replacement;
            continue;
        }
        const family: VersionFamily = {
            key,
            label: entry.stability === "snapshot" ? `Snapshots ${base}` : base,
            stability: entry.stability,
            versions: [entry],
        };
        byKey.set(key, family);
        families.push(family);
    }
    return families;
}

/** Newest first within each group, releases before snapshots. */
export function groupVersions(versions: readonly CatalogueVersionEntry[]): readonly VersionGroup[] {
    const releases = versions.filter((v) => v.stability === "release");
    const snapshots = versions.filter((v) => v.stability === "snapshot");
    const groups: VersionGroup[] = [];
    if (releases.length > 0) groups.push({ stability: "release", versions: releases });
    if (snapshots.length > 0) groups.push({ stability: "snapshot", versions: snapshots });
    return groups;
}

export function matchesVersionSearch(entry: CatalogueVersionEntry, query: string): boolean {
    const trimmed = query.trim();
    if (trimmed === "") return true;
    return versionSearchText(entry).toLowerCase().includes(trimmed.toLowerCase());
}

export function versionSearchText(entry: CatalogueVersionEntry): string {
    return [
        entry.version,
        entry.stability,
        `Java ${entry.javaFeature}`,
        entry.releasedAt ?? "",
    ].join(" ");
}

export function filterVersions(
    versions: readonly CatalogueVersionEntry[],
    query: string,
    useRegex: boolean,
    flags = "i",
): readonly CatalogueVersionEntry[] {
    if (query.trim() === "") return versions;
    if (!useRegex) return versions.filter((entry) => matchesVersionSearch(entry, query));
    try {
        const pattern = new RegExp(query, flags);
        return versions.filter((entry) => pattern.test(versionSearchText(entry)));
    } catch {
        return [];
    }
}

/** Clamp a candidate memory allocation to what the machine can actually spare. */
export function clampMemoryToMachine(memoryMb: number, totalMachineMb: number): number {
    // Leave at least 1 GB, or a quarter of the machine, for the OS and everything else.
    const reserve = Math.max(1024, Math.round(totalMachineMb * 0.25));
    const ceiling = Math.max(512, totalMachineMb - reserve);
    return Math.min(Math.max(memoryMb, 512), ceiling);
}

export function memorySliderMax(totalMachineMb: number): number {
    const reserve = Math.max(1024, Math.round(totalMachineMb * 0.25));
    return Math.max(1024, totalMachineMb - reserve);
}

export type WhereItRuns = "local-process" | "local-docker" | "ssh-docker" | "aws";

export interface RuntimeOption {
    readonly id: WhereItRuns;
    readonly name: string;
    readonly description: string;
}

export const RUNTIME_OPTIONS: readonly RuntimeOption[] = [
    {
        id: "local-process",
        name: "Local process",
        description:
            "Runs directly on this computer as an ordinary program. Simplest option, no container engine needed.",
    },
    {
        id: "local-docker",
        name: "Local container",
        description: "Runs on this computer inside Docker, isolated from the rest of the system.",
    },
    {
        id: "ssh-docker",
        name: "Remote container (SSH)",
        description: "Runs on another machine you reach over SSH, inside Docker there.",
    },
    {
        id: "aws",
        name: "AWS EC2",
        description: "Provision an EC2 host, then run this server in Docker there.",
    },
];

/** Runtime choices are capability-driven: an older shell without the AWS bridge keeps the
 * option out of the wizard instead of offering a button that can never do anything. */
export function runtimeOptions(awsAvailable: boolean): readonly RuntimeOption[] {
    return awsAvailable ? RUNTIME_OPTIONS : RUNTIME_OPTIONS.filter((option) => option.id !== "aws");
}

export const WIZARD_STEPS = [
    "flavour",
    "version",
    "mod-loader",
    "runtime",
    "java",
    "resources",
    "world",
    "review",
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export function stepIndex(step: WizardStep): number {
    return WIZARD_STEPS.indexOf(step);
}
