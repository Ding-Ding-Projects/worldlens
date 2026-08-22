/**
 * What this installation is allowed to do to a container it did not create.
 *
 * `mode` is `"record-only"` far more often than not, and that is deliberate rather than a
 * gap to close later. Docker has no supported way to attach a label to a container that
 * already exists - the label is baked in at `docker create` - so "labelling" an adopted
 * container would mean recreating it under this app's management, which throws away
 * whoever else's tooling, restart policy, and history was pointed at the original. That
 * trade is not this app's to make on someone's behalf, so `record-only` - reading the
 * container's identity and following it by container id, without ever touching Docker's
 * label store - is the only mode most adoptions will ever use.
 *
 * Consent is four independent switches because "I want to adopt this" answers a different
 * question from "I want WorldLens editing its config", "restarting it", "installing
 * plugins into it" or "sending it console commands". Granting one must never imply
 * another - a user who only wants to watch a friend's server's logs should be able to say
 * exactly that.
 */

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWriteTextFile } from "../../storage/atomicReplace.js";
import type { ServerFlavour } from "../registry.js";
import {
    fail,
    ok,
    type Answer,
    type TransportCapabilities,
    type TransportRef,
} from "../transport/types.js";
import { checkFingerprint, computeFingerprint, type FingerprintInput } from "./fingerprint.js";

export const ADOPTION_RECORDS_FILE = "minecraft-adoptions.v1.json";
export const ADOPTION_RECORDS_VERSION = 1;
export const ADOPTION_RECORDS_MAX_BYTES = 1024 * 1024;
export const ADOPTION_RECORDS_MAX_ENTRIES = 500;
const MAX_STRING = 512;

const ID = /^[a-z][a-z0-9-]{0,62}$/;

export type AdoptionMode = "record-only" | "labelled";

export interface AdoptionConsent {
    readonly configWrite: boolean;
    readonly lifecycle: boolean;
    readonly pluginInstall: boolean;
    readonly consoleWrite: boolean;
}

/** Nothing is granted by default. Every switch starts off. */
export const NO_CONSENT: AdoptionConsent = {
    configWrite: false,
    lifecycle: false,
    pluginInstall: false,
    consoleWrite: false,
};

export interface AdoptedDetected {
    readonly flavour: ServerFlavour;
    readonly minecraftVersion: string | null;
}

export interface AdoptionRecord {
    readonly id: string;
    readonly transport: TransportRef;
    readonly containerId: string;
    readonly containerName: string;
    readonly fingerprint: string;
    readonly adoptedAt: string;
    readonly mode: AdoptionMode;
    readonly detected: AdoptedDetected;
    readonly serverDir: string;
    readonly writeScope: readonly string[];
    readonly consent: AdoptionConsent;
    /** Path to a config snapshot taken at adoption time, or null when none was offered. */
    readonly preAdoptionBackup: string | null;
    /** Set once `release.ts` has released it. A released record is kept, not deleted, so
     *  its history is not lost; `remove` in `record.ts` is what actually deletes an entry. */
    readonly releasedAt: string | null;
}

function isString(value: unknown, max = MAX_STRING): value is string {
    return typeof value === "string" && value.length <= max && !/[\0]/.test(value);
}

function isBool(value: unknown): value is boolean {
    return typeof value === "boolean";
}

function validRef(value: unknown): value is TransportRef {
    if (typeof value !== "object" || value === null) return false;
    const ref = value as Record<string, unknown>;
    if (!isString(ref.serverDir)) return false;
    switch (ref.kind) {
        case "local-process":
            return true;
        case "local-docker":
            return isString(ref.containerRef, 128);
        case "ssh-docker":
            return isString(ref.containerRef, 128) && isString(ref.hostId, 128);
        case "aws":
            return (
                isString(ref.region, 128) &&
                isString(ref.instanceId, 128) &&
                isString(ref.publicIp, 128) &&
                isString(ref.sshUser, 128) &&
                (ref.identityFile === null || isString(ref.identityFile, 1024)) &&
                isString(ref.containerRef, 128)
            );
        default:
            return false;
    }
}

export function parseAdoptionRecord(value: unknown): AdoptionRecord | null {
    if (typeof value !== "object" || value === null) return null;
    const raw = value as Record<string, unknown>;
    if (!isString(raw.id, 64) || !ID.test(raw.id)) return null;
    if (!validRef(raw.transport)) return null;
    if (!isString(raw.containerId, 128) || !isString(raw.containerName, 256)) return null;
    if (!isString(raw.fingerprint, 128) || !isString(raw.adoptedAt, 64)) return null;
    if (!isString(raw.serverDir)) return null;
    if (raw.mode !== "record-only" && raw.mode !== "labelled") return null;

    const consentRaw =
        typeof raw.consent === "object" && raw.consent !== null
            ? (raw.consent as Record<string, unknown>)
            : {};
    const consent: AdoptionConsent = {
        configWrite: isBool(consentRaw.configWrite) && consentRaw.configWrite,
        lifecycle: isBool(consentRaw.lifecycle) && consentRaw.lifecycle,
        pluginInstall: isBool(consentRaw.pluginInstall) && consentRaw.pluginInstall,
        consoleWrite: isBool(consentRaw.consoleWrite) && consentRaw.consoleWrite,
    };

    const detectedRaw =
        typeof raw.detected === "object" && raw.detected !== null
            ? (raw.detected as Record<string, unknown>)
            : {};
    const detected: AdoptedDetected = {
        flavour: isString(detectedRaw.flavour, 32)
            ? (detectedRaw.flavour as ServerFlavour)
            : "unknown",
        minecraftVersion: isString(detectedRaw.minecraftVersion, 64)
            ? detectedRaw.minecraftVersion
            : null,
    };

    const writeScope = Array.isArray(raw.writeScope)
        ? raw.writeScope.filter((entry): entry is string => isString(entry, 256))
        : [];

    return {
        id: raw.id,
        transport: raw.transport,
        containerId: raw.containerId,
        containerName: raw.containerName,
        fingerprint: raw.fingerprint,
        adoptedAt: raw.adoptedAt,
        mode: raw.mode,
        detected,
        serverDir: raw.serverDir,
        writeScope,
        consent,
        preAdoptionBackup: isString(raw.preAdoptionBackup, 4_096) ? raw.preAdoptionBackup : null,
        releasedAt: isString(raw.releasedAt, 64) ? raw.releasedAt : null,
    };
}

interface StoredAdoptions {
    readonly version: number;
    readonly records: readonly AdoptionRecord[];
}

export interface AdoptionStoreOptions {
    readonly dataFolder: string;
    readonly now?: () => string;
}

export interface AdoptionStore {
    list(): Promise<Answer<readonly AdoptionRecord[]>>;
    get(id: string): Promise<Answer<AdoptionRecord>>;
    put(record: AdoptionRecord): Promise<Answer<AdoptionRecord>>;
    remove(id: string): Promise<Answer<void>>;
}

export function createAdoptionStore(options: AdoptionStoreOptions): AdoptionStore {
    const file = join(options.dataFolder, ADOPTION_RECORDS_FILE);

    async function load(): Promise<Answer<AdoptionRecord[]>> {
        let text: string;
        try {
            const bytes = await readFile(file);
            if (bytes.byteLength > ADOPTION_RECORDS_MAX_BYTES) {
                return fail(
                    "invalid-request",
                    "The saved list of adopted servers is too large to be a real list.",
                    `${file} is ${bytes.byteLength} bytes.`,
                );
            }
            text = bytes.toString("utf8");
        } catch (error) {
            const code = (error as NodeJS.ErrnoException | null)?.code;
            if (code === "ENOENT") return ok([]);
            return fail(
                "denied",
                "The saved list of adopted servers could not be read.",
                String(error),
            );
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            return fail("invalid-request", "The saved list of adopted servers is not readable.");
        }
        const stored = parsed as Partial<StoredAdoptions>;
        if (typeof stored !== "object" || stored === null || !Array.isArray(stored.records)) {
            return fail(
                "invalid-request",
                "The saved list of adopted servers is not in the expected shape.",
            );
        }

        const records: AdoptionRecord[] = [];
        for (const entry of stored.records.slice(0, ADOPTION_RECORDS_MAX_ENTRIES)) {
            const record = parseAdoptionRecord(entry);
            if (record !== null) records.push(record);
        }
        return ok(records);
    }

    async function save(records: readonly AdoptionRecord[]): Promise<Answer<void>> {
        try {
            await mkdir(dirname(file), { recursive: true });
            const payload: StoredAdoptions = { version: ADOPTION_RECORDS_VERSION, records };
            await atomicWriteTextFile(file, `${JSON.stringify(payload, null, 2)}\n`);
            return ok(undefined);
        } catch (error) {
            return fail("denied", "The list of adopted servers could not be saved.", String(error));
        }
    }

    return {
        async list(): Promise<Answer<readonly AdoptionRecord[]>> {
            return load();
        },
        async get(id: string): Promise<Answer<AdoptionRecord>> {
            const loaded = await load();
            if (!loaded.ok) return loaded;
            const found = loaded.value.find((record) => record.id === id);
            if (found === undefined)
                return fail("not-found", "There is no adopted server with that name here.");
            return ok(found);
        },
        async put(record: AdoptionRecord): Promise<Answer<AdoptionRecord>> {
            if (!ID.test(record.id)) {
                return fail(
                    "invalid-request",
                    "A server name may use lower-case letters, numbers and hyphens.",
                );
            }
            const loaded = await load();
            if (!loaded.ok) return loaded;
            const existing = loaded.value.find((entry) => entry.id === record.id);
            if (existing === undefined && loaded.value.length >= ADOPTION_RECORDS_MAX_ENTRIES) {
                return fail(
                    "invalid-request",
                    `This app keeps at most ${ADOPTION_RECORDS_MAX_ENTRIES} adopted servers.`,
                );
            }
            const next =
                existing === undefined
                    ? [...loaded.value, record]
                    : loaded.value.map((entry) => (entry.id === record.id ? record : entry));
            const saved = await save(next);
            if (!saved.ok) return saved;
            return ok(record);
        },
        async remove(id: string): Promise<Answer<void>> {
            const loaded = await load();
            if (!loaded.ok) return loaded;
            const next = loaded.value.filter((record) => record.id !== id);
            if (next.length === loaded.value.length) {
                return fail("not-found", "There is no adopted server with that name here.");
            }
            return save(next);
        },
    };
}

/**
 * Maps granted consent onto the capability flags a transport actually checks.
 *
 * This is the enforcement point: `factory.ts` already accepts a `capabilities` override
 * for the two Docker transports, and passing this through it means the transport itself -
 * not just the UI - refuses an action nobody consented to. `canCreate` and `canDestroy`
 * are never granted by adoption at all; bringing a server into existence or destroying it
 * is not something a checkbox on someone else's container should be able to authorize.
 */
export function capabilitiesForConsent(consent: AdoptionConsent): Partial<TransportCapabilities> {
    return {
        canCreate: false,
        canLifecycle: consent.lifecycle,
        canWriteFiles: consent.configWrite || consent.pluginInstall,
        canDestroy: false,
        ...(consent.consoleWrite ? {} : { console: "none" as const }),
    };
}

export { checkFingerprint, computeFingerprint };
export type { FingerprintInput };
