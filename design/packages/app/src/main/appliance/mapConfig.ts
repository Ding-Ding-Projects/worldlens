import type { ApplianceWorkload } from "./types.js";
import { randomBytes, scryptSync } from "node:crypto";

/** The words the appliance shows on its console and as page titles, before any vocabulary mapping. */
export const BASE_LABELS = {
    consoleTitle: "Worldlens map",
    consoleReady: "The map is running. Open this address from any computer on the network:",
    consoleStarting: "Starting the map server",
    pageTitle: "Worldlens map",
    accessCodePrompt: "Access code",
} as const;

export type LabelKey = keyof typeof BASE_LABELS;

/**
 * Whole-string replacement from the person's own vocabulary file. A label is replaced only when the
 * whole label is a key; the mapping is read from local storage and never logged or written anywhere
 * except into the appliance image the person is building for themselves.
 */
export function applyVocabularyToLabels(labels: Readonly<Record<LabelKey, string>>, entries: Readonly<Record<string, string>>): Record<LabelKey, string> {
    const out = { ...labels } as Record<LabelKey, string>;
    for (const key of Object.keys(out) as LabelKey[]) {
        const replacement = Object.prototype.hasOwnProperty.call(entries, out[key]) ? entries[out[key]] : undefined;
        if (typeof replacement === "string" && replacement.length > 0 && replacement.length <= 200) out[key] = replacement;
    }
    return out;
}

/** `scrypt$N$r$p$salt$hash`: a salted verifier, never the code itself. */
export function accessCodeVerifier(code: string, salt: Buffer = randomBytes(16)): string {
    const N = 16384;
    const hash = scryptSync(code, salt, 32, { N, r: 8, p: 1 });
    return `scrypt$${N}$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export interface MapConfig {
    readonly schema: 1;
    readonly hostname: string;
    readonly port: number;
    readonly accessCodeVerifier: string | null;
    readonly labels: Readonly<Record<LabelKey, string>>;
    readonly created: string;
    /** Absent for a map appliance; see `ApplianceWorkload`. Read by the boot script. */
    readonly workload?:
        | { readonly kind: "app"; readonly image: string; readonly passwordSha256: string }
        | { readonly kind: "minecraft"; readonly serverImage: string; readonly siteImage: string; readonly eulaAccepted: boolean; readonly memoryGb: number };
}

export function buildMapConfig(input: { hostName: string; port: number; accessCode: string | null; vocabulary: Readonly<Record<string, string>>; now?: Date | undefined; workload?: ApplianceWorkload | undefined }): MapConfig {
    const w = input.workload;
    return {
        ...(w?.kind === "app" ? { workload: { kind: "app" as const, image: w.image, passwordSha256: w.passwordSha256 } } : {}),
        ...(w?.kind === "minecraft" ? { workload: { kind: "minecraft" as const, serverImage: w.serverImage, siteImage: w.siteImage, eulaAccepted: w.eulaAccepted, memoryGb: w.memoryGb } } : {}),
        schema: 1,
        hostname: input.hostName,
        port: input.port,
        accessCodeVerifier: input.accessCode === null ? null : accessCodeVerifier(input.accessCode),
        labels: applyVocabularyToLabels(BASE_LABELS, input.vocabulary),
        created: (input.now ?? new Date()).toISOString(),
    };
}
