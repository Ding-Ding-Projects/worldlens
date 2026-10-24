import { reactive, ref } from "vue";
interface Answer<T> {
    ok: boolean;
    value?: T;
    failure?: { code?: string; message: string };
}
export interface AccessReceipt {
    reference: string;
    username: string;
    state: "prepared" | "provisioned" | "verified";
}
export interface HostingProfile {
    id: string;
    name: string;
    target: "native-windows" | "native-wsl" | "container";
    origin: string;
    port: number;
    dataRoot: string;
    tlsCert: string;
    tlsKey: string;
    distribution: string;
}
export interface HostingBridge {
    profiles?: {
        list(): Promise<Answer<HostingProfile[]>>;
        save(profile: HostingProfile): Promise<Answer<HostingProfile>>;
        remove(id: string): Promise<Answer<{ removed: boolean }>>;
        readiness(request: {
            profileId: string;
            context: string;
            target: string;
            port: number;
        }): Promise<Answer<{ state: string; trust: string; health: string; lanVerified: boolean }>>;
    };
    access?: {
        prepare(request: { username: string; password: string }): Promise<Answer<AccessReceipt>>;
        read(reference: string): Promise<Answer<AccessReceipt>>;
    };
    exportContext?(request: {
        renderId: string;
        destination: string;
        target: string;
    }): Promise<Answer<{ context?: string; contextFingerprint: string; state: string }>>;
    build?(request: {
        context: string;
        localTag: string;
    }): Promise<Answer<{ imageId: string; contextFingerprint: string }>>;
    save?(request: {
        imageId: string;
        path: string;
        context: string;
    }): Promise<Answer<{ path: string; sha256: string; bytes: number }>>;
    signIn?(): Promise<Answer<{ state: string; verificationUrl?: string; userCode?: string }>>;
    signInCancel?(): Promise<Answer<{ state: string }>>;
    stop?(
        id: string,
    ): Promise<Answer<{ operationId: string; state: string; url?: string; health?: string }>>;
    signInStatus?(): Promise<
        Answer<{ state: string; verificationUrl?: string; userCode?: string }>
    >;
    upload?(request: {
        imageId: string;
        destination: { registry: string; namespace: string; repository: string; tag: string };
        confirmed: boolean;
    }): Promise<Answer<{ reference: string; digest: string }>>;
    deploy?(request: {
        context: string;
        target: string;
        accessReference: string;
        port: number;
        profileId?: string;
    }): Promise<Answer<{ operationId: string; state: string; url?: string; health?: string }>>;
    status?(
        id: string,
    ): Promise<Answer<{ operationId: string; state: string; url?: string; health?: string }>>;
}
export function hostingBridge(): HostingBridge | null {
    return (
        (globalThis as unknown as { worldlens?: { managedHosting?: HostingBridge } }).worldlens
            ?.managedHosting ?? null
    );
}
export const preparedAccess = ref<AccessReceipt | null>(null);
export const ACCESS_REFERENCE_KEY = "worldlens.hosting.access-reference.v1";

/** Transient protected-input draft. Never serialized or included in history/export. */
export const accessPreparationDraft = reactive({ username: "", password: "" });
