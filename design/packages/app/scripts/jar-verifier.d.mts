export interface JarVerification {
    readonly ok: boolean;
    readonly reason: string | null;
}

export function verifyJarFile(path: string): Promise<JarVerification>;
export function verifyJarBytes(bytes: Uint8Array): JarVerification;
