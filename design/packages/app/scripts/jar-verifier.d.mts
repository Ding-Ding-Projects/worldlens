export interface JarVerification {
    readonly ok: boolean;
    readonly reason: string | null;
    readonly size?: number;
    readonly sha256?: string;
}

export function verifyJarFile(
    path: string,
    options?: { readonly root?: string },
): Promise<JarVerification>;
export function verifyJarBytes(bytes: Uint8Array): JarVerification;
