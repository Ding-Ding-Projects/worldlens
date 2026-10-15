/** Read-only observations, never installation authority or a reservation of host resources. */
export interface SshProcessPreflightRequest {
    readonly hostId: string;
    readonly minecraftVersion: string;
    readonly memoryMb: number;
    readonly port: number;
}

export type SshProcessReadinessStage =
    "ssh" | "platform" | "supervisor" | "directory" | "java" | "memory" | "disk" | "port";

export interface SshProcessReadinessCheck {
    readonly stage: SshProcessReadinessStage;
    readonly state: "passed" | "blocked" | "unknown";
    readonly code: string;
}

export interface SshProcessPreflightReport {
    readonly kind: "ssh-process";
    readonly catalogueFetchedAt: string;
    readonly hostId: string;
    readonly profileUpdatedAt: string;
    readonly checkedAt: string;
    readonly ready: boolean;
    readonly canCreate: false;
    readonly checks: readonly SshProcessReadinessCheck[];
    readonly requiredJavaFeature: number;
    readonly javaFeature: number | null;
    readonly javaPath: string | null;
    readonly serverParent: string | null;
    readonly availableMemoryMb: number | null;
    readonly freeBytes: number | null;
    readonly minimumFreeBytes: number;
}
