/** One runtime the installer promises, as `bundled-runtimes.manifest.json` records it. */
export interface BundledRuntimeEntry {
    /** Where the running app reads it, relative to `resourcesPath`. Forward slashes. */
    readonly packagedPath: string;
    readonly sha256?: string;
    readonly sizeBytes?: number;
    readonly version?: string;
    readonly asset?: string;
    readonly url?: string;
}

export interface BundledRuntimeManifest {
    readonly schemaVersion: 1;
    readonly chunker: BundledRuntimeEntry;
    readonly java: BundledRuntimeEntry;
}

export interface ProvedRuntime {
    readonly name: string;
    readonly file: string;
    readonly size: number;
}

export function readBundledRuntimeManifest(path?: string): Promise<BundledRuntimeManifest>;

export function assertPackagedBundles(
    resourcesDirectory: string,
    options?: { readonly manifest?: BundledRuntimeManifest },
): Promise<readonly ProvedRuntime[]>;
