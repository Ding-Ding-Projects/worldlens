/**
 * The universal, user-renamable mode that takes the playful half of this site off the table.
 *
 * What it does is easy to state and easy to get subtly wrong: while it is on, the site is
 * English, and Cantonese, bilingual mode, both funny-level sliders, personal vocabulary and
 * the dim sum surprise behave **as if they were never built**. Not greyed out. Not hidden
 * behind a scrollbar. Not present-but-refusing. Their controls, their copy, their labels,
 * their search results, their palette entries and their previews are absent from every
 * surface, because a disabled control is an advertisement for the thing it disables, and an
 * advertisement is exactly what this mode exists to remove.
 *
 * Three consequences follow, and each is a place a naive implementation goes wrong:
 *
 * The visitor's prior choices are **preserved, not overwritten**. Turning the mode on must
 * not write `en` over a stored `bilingual`, because turning it off again has to give the
 * visitor their site back. Suppression is therefore an override applied at read time, in the
 * same spirit as the scheduled-settings layer, and the base preference underneath is never
 * touched.
 *
 * After a rename, **only the chosen name exists**. The shipped words "School mode" must not
 * appear in a label, a description, a search result, a notification or an accessible name.
 * That is why nothing outside this module ever renders the shipped name directly: everything
 * asks `name` and gets either the localised shipped name or exactly what the visitor typed.
 *
 * And it is a **user-experience lock, not a security boundary**, which the copy says in words
 * rather than implying otherwise by looking sturdy. The credential is verified locally against
 * a salted digest; anyone with access to this browser's storage can delete the record and the
 * mode is gone. Saying so is not a weakness in the feature, it is the feature being honest
 * about what a browser can actually promise. Claiming protection we cannot deliver would be
 * the real defect — a teacher who believed the claim would rely on it.
 *
 * The secret itself is never stored, never logged, never exported and never placed in a
 * settings file. Only the salt and the digest are persisted, and `snapshot`-based settings
 * export cannot reach them because they are not settings.
 */

import type { Preferences } from "../platform/Preferences.js";

const ENABLED_KEY = "school.enabled";
const NAME_KEY = "school.name";
const CREDENTIAL_KEY = "school.credential";

/**
 * The settings ids that stop existing while the mode is on.
 *
 * A hand-written closed list rather than a pattern over ids, for the same reason the project's
 * other coverage lists are hand-written: a pattern like "anything starting with `language.`"
 * silently stops matching the day somebody renames a setting, and a suppression rule that
 * silently stops suppressing is indistinguishable from one that was never there. Adding a
 * playful setting means adding it here deliberately, which is the intended cost.
 */
export const SCHOOL_SUPPRESSED_SETTING_IDS: readonly string[] = [
    "language.mode",
    "language.secondaryInline",
    "language.funny.en",
    "language.funny.yue",
];

/**
 * Settings tabs that vanish entirely once every setting inside them is suppressed.
 *
 * An empty tab is worse than an absent one: it is a visible, clickable promise of settings
 * that turns out to hold nothing, which reads as a broken build rather than as a deliberate
 * omission.
 */
export const SCHOOL_SUPPRESSED_TAB_IDS: readonly string[] = ["language"];

/**
 * How the stored credential was digested.
 *
 * Recorded alongside the digest so a future build can tell what it is looking at instead of
 * guessing from the string's length. A record whose kind this build does not recognise is
 * treated as no credential at all rather than as a credential that always fails, because the
 * second one would lock a visitor out of their own browser with no route back.
 */
interface StoredCredential {
    readonly kind: "sha-256";
    readonly salt: string;
    readonly digest: string;
}

function isStoredCredential(value: unknown): StoredCredential | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as Record<string, unknown>;
    if (record["kind"] !== "sha-256") return undefined;
    if (typeof record["salt"] !== "string" || typeof record["digest"] !== "string") return undefined;
    if (record["salt"] === "" || record["digest"] === "") return undefined;
    return { kind: "sha-256", salt: record["salt"], digest: record["digest"] };
}

function toHex(bytes: Uint8Array): string {
    let out = "";
    for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
    return out;
}

/**
 * Whether this browser can verify a credential at all.
 *
 * `crypto.subtle` is absent on a page served over plain HTTP from a non-loopback host, which
 * is a real configuration somebody could publish this site under. Rather than falling back to
 * a hand-rolled digest — inventing cryptography is worse than admitting its absence — the mode
 * refuses to be armed and the surface says why. A lock that cannot be unlocked is the one
 * failure mode this feature must never ship.
 */
export function schoolCredentialAvailable(): boolean {
    return typeof globalThis.crypto?.subtle?.digest === "function";
}

async function digest(secret: string, salt: string): Promise<string> {
    const encoded = new TextEncoder().encode(`${salt}:${secret}`);
    const hashed = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    return toHex(new Uint8Array(hashed));
}

function freshSalt(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return toHex(bytes);
}

export type SchoolModeListener = () => void;

export class SchoolMode {
    private readonly prefs: Preferences;
    private readonly listeners = new Set<SchoolModeListener>();

    constructor(prefs: Preferences) {
        this.prefs = prefs;
    }

    get enabled(): boolean {
        // A mode that is on with no credential recorded would have no route off, so the two
        // facts are read as one. This is not merely belt-and-braces: storage can be cleared
        // partially by a browser reclaiming space, and the half that survives must be the
        // half that leaves the visitor in control of their own site.
        return this.prefs.readBoolean(ENABLED_KEY, false) && this.credential !== undefined;
    }

    /** The visitor's chosen name, or `null` while the shipped name is still in force. */
    get chosenName(): string | null {
        const raw = this.prefs.read(NAME_KEY, "").trim().slice(0, 48).trim();
        return raw === "" ? null : raw;
    }

    get hasCredential(): boolean {
        return this.credential !== undefined;
    }

    private get credential(): StoredCredential | undefined {
        return this.prefs.readJson(CREDENTIAL_KEY, isStoredCredential);
    }

    /**
     * Rename the mode.
     *
     * Renaming is deliberately independent of arming it: a teacher naming the thing before
     * they set a PIN is an ordinary order of operations, and forcing the credential first
     * would make the name feel like part of the lock rather than part of the vocabulary.
     */
    rename(raw: string): void {
        const next = raw.trim().slice(0, 48).trim();
        if (next === "") this.prefs.remove(NAME_KEY);
        else this.prefs.write(NAME_KEY, next);
        this.emit();
    }

    /**
     * Arm the mode with a locally verified secret.
     *
     * Resolves `false` rather than throwing when this browser cannot digest, so a caller can
     * render the honest explanation instead of catching an exception to decide what to draw.
     */
    async enable(secret: string): Promise<boolean> {
        if (!schoolCredentialAvailable()) return false;
        if (secret.trim() === "") return false;
        const salt = freshSalt();
        const stored: StoredCredential = {
            kind: "sha-256",
            salt,
            digest: await digest(secret, salt),
        };
        this.prefs.writeJson(CREDENTIAL_KEY, stored);
        this.prefs.write(ENABLED_KEY, "true");
        this.emit();
        return true;
    }

    /**
     * Verify a secret without changing anything.
     *
     * Separate from `disable` so a surface can tell a visitor their PIN was wrong without
     * having attempted a state change, which is the difference between "that is not the PIN"
     * and "something went wrong".
     */
    async verify(secret: string): Promise<boolean> {
        const stored = this.credential;
        if (stored === undefined || !schoolCredentialAvailable()) return false;
        return (await digest(secret, stored.salt)) === stored.digest;
    }

    /** Turn the mode off, which requires the secret. The stored name and credential remain. */
    async disable(secret: string): Promise<boolean> {
        if (!(await this.verify(secret))) return false;
        this.prefs.write(ENABLED_KEY, "false");
        this.emit();
        return true;
    }

    /**
     * The documented escape hatch: forget the local record entirely.
     *
     * This exists because pretending it does not would be dishonest — a visitor can clear this
     * browser's storage from the browser's own settings and achieve exactly this, so hiding
     * the equivalent action inside the site would buy no protection and would only mislead
     * whoever trusted the lock. The surface says so in the same breath as offering it.
     */
    resetLocalRecord(): void {
        this.prefs.remove(ENABLED_KEY);
        this.prefs.remove(NAME_KEY);
        this.prefs.remove(CREDENTIAL_KEY);
        this.emit();
    }

    /** True when this id must be absent from every surface right now. */
    suppresses(settingId: string): boolean {
        return this.enabled && SCHOOL_SUPPRESSED_SETTING_IDS.includes(settingId);
    }

    suppressesTab(tabId: string): boolean {
        return this.enabled && SCHOOL_SUPPRESSED_TAB_IDS.includes(tabId);
    }

    subscribe(listener: SchoolModeListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit(): void {
        for (const listener of [...this.listeners]) listener();
    }
}
