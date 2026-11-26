export function writeDeterministicZip(
    target: string,
    files: ReadonlyArray<{ readonly name: string; readonly path: string }>,
): Promise<{
    readonly entries: number;
    readonly size: number;
    readonly sha256: string;
    readonly uncompressedSize: number;
}>;
