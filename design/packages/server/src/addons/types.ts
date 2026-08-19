export const ADDON_API_VERSION = "1" as const;
export const ADDON_MANIFEST_VERSION = 1 as const;

export const ADDON_CAPABILITIES = ["renderer", "server", "commands", "markers"] as const;
export type AddonCapability = (typeof ADDON_CAPABILITIES)[number];

export interface AddonManifest {
    manifestVersion: 1;
    id: string;
    name: string;
    version: string;
    apiVersion: string;
    entry: string;
    capabilities?: readonly AddonCapability[];
    dependencies?: Readonly<Record<string, string>>;
    conflicts?: readonly string[];
    description?: string;
}

export interface InstalledAddon {
    manifest: AddonManifest;
    directory: string;
    entryPath: string;
    provenance: { manifestSha256: string; entrySha256: string };
    enabled: boolean;
}

export interface AddonDiagnostic {
    addonId: string;
    phase: "manifest" | "resolve" | "start" | "stop" | "hook";
    message: string;
    cause?: unknown;
}

export interface AddonCapabilityRequest {
    addonId: string;
    capabilities: readonly AddonCapability[];
}

export interface AddonRuntimeOptions {
    timeoutMs?: number;
    memoryMb?: number;
    consent?: (request: AddonCapabilityRequest) => boolean | Promise<boolean>;
    onDiagnostic?: (diagnostic: AddonDiagnostic) => void;
}

export interface AddonRuntime {
    start(addon: InstalledAddon): Promise<void>;
    stop(addon: InstalledAddon): Promise<void>;
    invoke(addon: InstalledAddon, hook: string, payload?: unknown): Promise<unknown>;
}
