export function assertPackagedRenderEngines(
    resourcesDirectory: string,
    options?: { readonly probe?: boolean },
): Promise<{
    readonly root: string;
    readonly version: string | null;
    readonly archivePath: string;
    readonly archiveSize: number;
}>;
