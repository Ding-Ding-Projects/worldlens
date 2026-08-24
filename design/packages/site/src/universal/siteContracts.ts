/**
 * The static site's own universal-contract playground.
 *
 * A Pages surface cannot own an operating-system credential vault, server-side nonce grader,
 * or a second native window. This module therefore implements the closest honest equivalent:
 * visitor state stays in browser storage, passwords are stored only as SHA-256 digests, TOTP
 * secrets remain in this tab's memory, and every capability says when that boundary matters.
 * No network request is made by this module.
 */

import type { I18n } from "../i18n/I18n.js";
import { Preferences } from "../platform/Preferences.js";
import { confirmDestructive } from "../settings/confirm.js";
import qrcode from "qrcode-generator";
import type { AppearanceController } from "../appearance/controller.js";
import { openAppearanceEditor } from "../appearance/editor/appearanceEditor.js";

const STATE_KEY = "site.universal.contracts.v1";
const MAX_TICKETS = 100;
const MAX_HISTORY = 250;
const LADDER_WINDOW_MS = 60 * 60 * 1000;
const LADDER_BUDGET = 3;
const MAX_SECRET_BYTES = 128;

export type LockMethod = "password" | "totp";
export type LockDuration = "session" | "15m" | "1h";
export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";
export type TotpDigits = 6 | 7 | 8;

export const PBKDF2_ITERATIONS = 120_000;

export interface SiteLock {
    readonly id: string;
    readonly target: string;
    readonly scope: "element" | "tab" | "group" | "property";
    readonly method: LockMethod;
    readonly credentialDigest: string;
    readonly credentialSalt: string;
    readonly kdf: "PBKDF2-SHA-256";
    readonly iterations: number;
    readonly totp: {
        readonly algorithm: TotpAlgorithm;
        readonly digits: TotpDigits;
        readonly period: number;
    } | null;
    readonly duration: LockDuration;
    readonly createdAt: string;
    readonly lockedUntil: number | null;
}

export interface AuthenticatorEntry {
    readonly id: string;
    readonly issuer: string;
    readonly account: string;
    readonly algorithm: TotpAlgorithm;
    readonly digits: TotpDigits;
    readonly period: number;
    readonly group: string;
    readonly secretAvailable: boolean;
}

export interface SupportTicket {
    readonly id: string;
    readonly category: string;
    readonly description: string;
    readonly status: "received" | "triaged" | "resolved";
    readonly createdAt: string;
}

export interface SiteHistoryEntry {
    readonly id: string;
    readonly at: string;
    readonly action: string;
    readonly target: string;
    readonly detail: string;
}

export interface SiteAppearancePreset {
    readonly id: string;
    readonly name: string;
    readonly appearance: SiteContractState["appearance"];
    readonly createdAt: string;
}

export interface SiteContractState {
    readonly version: 1;
    readonly locks: readonly SiteLock[];
    readonly authenticators: readonly AuthenticatorEntry[];
    readonly tickets: readonly SupportTicket[];
    readonly history: readonly SiteHistoryEntry[];
    readonly presets: readonly SiteAppearancePreset[];
    readonly appearance: {
        readonly colour: string;
        readonly rainbow: boolean;
        readonly rainbowSpeed: 1 | 2 | 3 | 4 | 5;
        readonly fontFamily: string;
        readonly fontSize: number;
        readonly weight: number;
        readonly italic: boolean;
        readonly underline: boolean;
        readonly strike: "none" | "single" | "double";
        readonly casing: "normal" | "uppercase" | "small-caps";
        readonly letterSpacing: number;
        readonly wordSpacing: number;
        readonly lineHeight: number;
    };
    readonly ladder: {
        readonly waitingUntil: number;
        readonly used: number;
        readonly budgetStartedAt: number;
    };
    readonly ladderMachine: LadderSnapshot | null;
}

type Listener = (snapshot: SiteContractState) => void;

const DEFAULT_APPEARANCE: SiteContractState["appearance"] = {
    colour: "#4fd1c5",
    rainbow: false,
    rainbowSpeed: 3,
    fontFamily: "system-ui",
    fontSize: 16,
    weight: 500,
    italic: false,
    underline: false,
    strike: "none",
    casing: "normal",
    letterSpacing: 0,
    wordSpacing: 0,
    lineHeight: 1.5,
};

function nowIso(): string {
    return new Date().toISOString();
}

function randomId(prefix: string): string {
    const bytes = new Uint8Array(12);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function")
        crypto.getRandomValues(bytes);
    else bytes.fill(Math.floor(Math.random() * 255));
    return `${prefix}-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function emptyState(): SiteContractState {
    return {
        version: 1,
        locks: [],
        authenticators: [],
        tickets: [],
        history: [],
        presets: [],
        appearance: { ...DEFAULT_APPEARANCE },
        ladder: { waitingUntil: 0, used: 0, budgetStartedAt: Date.now() },
        ladderMachine: null,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isSiteLock(value: unknown): value is SiteLock {
    if (!isRecord(value)) return false;
    return typeof value.id === "string" && typeof value.target === "string" &&
        (value.scope === "element" || value.scope === "tab" || value.scope === "group" || value.scope === "property") &&
        (value.method === "password" || value.method === "totp") && typeof value.credentialDigest === "string" &&
        typeof value.credentialSalt === "string" && value.kdf === "PBKDF2-SHA-256" &&
        typeof value.iterations === "number" && Number.isInteger(value.iterations) && value.iterations >= 100_000 &&
        (value.duration === "session" || value.duration === "15m" || value.duration === "1h") &&
        typeof value.createdAt === "string" && (value.lockedUntil === null || typeof value.lockedUntil === "number") &&
        (value.totp === null || (isRecord(value.totp) &&
            (value.totp.algorithm === "SHA1" || value.totp.algorithm === "SHA256" || value.totp.algorithm === "SHA512") &&
            (value.totp.digits === 6 || value.totp.digits === 7 || value.totp.digits === 8) &&
            typeof value.totp.period === "number" && Number.isInteger(value.totp.period) && value.totp.period >= 5 && value.totp.period <= 300));
}

function isAuthenticatorEntry(value: unknown): value is AuthenticatorEntry {
    if (!isRecord(value)) return false;
    return typeof value.id === "string" && typeof value.issuer === "string" && typeof value.account === "string" &&
        (value.algorithm === "SHA1" || value.algorithm === "SHA256" || value.algorithm === "SHA512") &&
        (value.digits === 6 || value.digits === 7 || value.digits === 8) && typeof value.period === "number" &&
        Number.isInteger(value.period) && value.period >= 5 && value.period <= 300 &&
        typeof value.group === "string" && typeof value.secretAvailable === "boolean";
}

function isSupportTicket(value: unknown): value is SupportTicket {
    if (!isRecord(value)) return false;
    return typeof value.id === "string" && typeof value.category === "string" && typeof value.description === "string" &&
        (value.status === "received" || value.status === "triaged" || value.status === "resolved") &&
        typeof value.createdAt === "string";
}

function isHistoryEntry(value: unknown): value is SiteHistoryEntry {
    if (!isRecord(value)) return false;
    return typeof value.id === "string" && typeof value.at === "string" && typeof value.action === "string" &&
        typeof value.target === "string" && typeof value.detail === "string";
}

function isAppearancePreset(value: unknown): value is SiteAppearancePreset {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.createdAt !== "string") return false;
    return isRecord(value.appearance) && typeof value.appearance.colour === "string";
}

function revive(value: unknown): SiteContractState | undefined {
    if (!isRecord(value) || value.version !== 1) return undefined;
    const base = emptyState();
    const appearance = isRecord(value.appearance) ? value.appearance : {};
    const ladder = isRecord(value.ladder) ? value.ladder : {};
    const locks: unknown[] = Array.isArray(value.locks) ? value.locks : [];
    const authenticators: unknown[] = Array.isArray(value.authenticators) ? value.authenticators : [];
    const tickets: unknown[] = Array.isArray(value.tickets) ? value.tickets : [];
    const history: unknown[] = Array.isArray(value.history) ? value.history : [];
    return {
        version: 1,
        locks: locks.slice(0, 100).filter(isSiteLock),
        authenticators: authenticators.slice(0, 100).filter(isAuthenticatorEntry),
        tickets: tickets.slice(0, MAX_TICKETS).filter(isSupportTicket),
        history: history.slice(0, MAX_HISTORY).filter(isHistoryEntry),
        presets: (Array.isArray(value.presets) ? value.presets : []).slice(0, 50).filter(isAppearancePreset),
        appearance: {
            colour: typeof appearance.colour === "string" ? appearance.colour : base.appearance.colour,
            rainbow: appearance.rainbow === true,
            rainbowSpeed: [1, 2, 3, 4, 5].includes(appearance.rainbowSpeed as number)
                ? (appearance.rainbowSpeed as 1 | 2 | 3 | 4 | 5)
                : 3,
            fontFamily: typeof appearance.fontFamily === "string" ? appearance.fontFamily.slice(0, 120) : base.appearance.fontFamily,
            fontSize: numberInRange(appearance.fontSize, 10, 48, 16),
            weight: numberInRange(appearance.weight, 100, 900, 500),
            italic: appearance.italic === true,
            underline: appearance.underline === true,
            strike: appearance.strike === "single" || appearance.strike === "double" ? appearance.strike : "none",
            casing: appearance.casing === "uppercase" || appearance.casing === "small-caps" ? appearance.casing : "normal",
            letterSpacing: numberInRange(appearance.letterSpacing, -0.2, 1, 0),
            wordSpacing: numberInRange(appearance.wordSpacing, 0, 2, 0),
            lineHeight: numberInRange(appearance.lineHeight, 1, 3, 1.5),
        },
        ladder: {
            waitingUntil: numberInRange(ladder.waitingUntil, 0, Number.MAX_SAFE_INTEGER, 0),
            used: numberInRange(ladder.used, 0, LADDER_BUDGET, 0),
            budgetStartedAt: numberInRange(ladder.budgetStartedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
        },
        ladderMachine: isRecord(value.ladderMachine) ? value.ladderMachine as unknown as LadderSnapshot : null,
    };
}

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.min(max, Math.max(min, value))
        : fallback;
}

/** Site-local state. It never touches files, cookies, network, or another origin's storage. */
export class SiteContractStore {
    private readonly prefs: Preferences;
    private current: SiteContractState;
    private readonly listeners = new Set<Listener>();
    private readonly sessionSecrets = new Map<string, string>();

    constructor(prefs = new Preferences()) {
        this.prefs = prefs;
        this.current = prefs.readJson(STATE_KEY, revive) ?? emptyState();
        prefs.subscribe((key) => {
            if (key !== STATE_KEY) return;
            const next = prefs.readJson(STATE_KEY, revive);
            if (next !== undefined) {
                this.current = next;
                this.emit();
            }
        });
    }

    get snapshot(): SiteContractState {
        return structuredClone(this.current);
    }

    get storageAvailable(): boolean {
        return this.prefs.available;
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    setAppearance(patch: Partial<SiteContractState["appearance"]>): void {
        const next = { ...this.current.appearance, ...patch };
        this.current = { ...this.current, appearance: {
            ...next,
            colour: typeof next.colour === "string" && (/^#[0-9a-f]{6}$/i.test(next.colour) || /^#[0-9a-f]{8}$/i.test(next.colour)) ? next.colour : this.current.appearance.colour,
            fontSize: numberInRange(next.fontSize, 10, 48, this.current.appearance.fontSize),
            weight: numberInRange(next.weight, 100, 900, this.current.appearance.weight),
            letterSpacing: numberInRange(next.letterSpacing, -0.2, 1, this.current.appearance.letterSpacing),
            wordSpacing: numberInRange(next.wordSpacing, 0, 2, this.current.appearance.wordSpacing),
            lineHeight: numberInRange(next.lineHeight, 1, 3, this.current.appearance.lineHeight),
        } };
        this.commit("appearance.changed", "appearance", "Appearance values changed locally");
    }

    resetAppearance(): void {
        this.current = { ...this.current, appearance: { ...DEFAULT_APPEARANCE } };
        this.commit("appearance.reset", "appearance", "Appearance returned to the shipped values");
    }

    saveAppearancePreset(name: string): SiteAppearancePreset {
        const preset: SiteAppearancePreset = { id: randomId("preset"), name: name.trim().slice(0, 80) || "Untitled appearance", appearance: { ...this.current.appearance }, createdAt: nowIso() };
        this.current = { ...this.current, presets: [preset, ...this.current.presets].slice(0, 50) };
        this.commit("appearance.preset.created", preset.id, `Saved appearance preset ${preset.name}`);
        return preset;
    }

    applyAppearancePreset(id: string): boolean {
        const preset = this.current.presets.find((candidate) => candidate.id === id);
        if (preset === undefined) return false;
        this.current = { ...this.current, appearance: { ...preset.appearance } };
        this.commit("appearance.preset.applied", id, `Applied appearance preset ${preset.name}`);
        return true;
    }

    removeAppearancePreset(id: string): void {
        if (!this.current.presets.some((preset) => preset.id === id)) return;
        this.current = { ...this.current, presets: this.current.presets.filter((preset) => preset.id !== id) };
        this.commit("appearance.preset.removed", id, "Removed one local appearance preset");
    }

    addLock(input: {
        readonly target: string;
        readonly scope: SiteLock["scope"];
        readonly method: LockMethod;
        readonly credentialDigest: string;
        readonly credentialSalt: string;
        readonly iterations: number;
        readonly sessionSecret?: string;
        readonly totp?: SiteLock["totp"];
        readonly duration: LockDuration;
    }): SiteLock {
        const lockedUntil = input.duration === "session" ? null : Date.now() + (input.duration === "15m" ? 900_000 : 3_600_000);
        const lock: SiteLock = {
            id: randomId("lock"),
            target: input.target.trim().slice(0, 120),
            scope: input.scope,
            method: input.method,
            credentialDigest: input.credentialDigest,
            credentialSalt: input.credentialSalt,
            kdf: "PBKDF2-SHA-256",
            iterations: input.iterations,
            totp: input.totp ?? null,
            duration: input.duration,
            createdAt: nowIso(),
            lockedUntil,
        };
        if (input.sessionSecret !== undefined) this.sessionSecrets.set(lock.id, input.sessionSecret);
        this.current = { ...this.current, locks: [...this.current.locks, lock] };
        this.commit("lock.created", lock.id, `Created ${lock.method} lock for ${lock.target}`);
        return lock;
    }

    removeLock(id: string): void {
        const found = this.current.locks.find((lock) => lock.id === id);
        if (found === undefined) return;
        this.sessionSecrets.delete(id);
        this.current = { ...this.current, locks: this.current.locks.filter((lock) => lock.id !== id) };
        this.commit("lock.removed", id, `Removed lock for ${found.target}`);
    }

    async verifyLock(id: string, answer: string): Promise<boolean> {
        const lock = this.current.locks.find((candidate) => candidate.id === id);
        if (lock === undefined) return false;
        if (lock.lockedUntil !== null && lock.lockedUntil <= Date.now()) return true;
        if (lock.method === "totp") {
            const secret = this.sessionSecrets.get(id);
            if (secret === undefined) return false;
            return (await generateTotp(secret, Date.now(), lock.totp ?? { algorithm: "SHA1", digits: 6, period: 30 })) === answer;
        }
        return (await deriveCredential(answer, lock.credentialSalt, lock.iterations)) === lock.credentialDigest;
    }

    addAuthenticator(entry: AuthenticatorEntry, secret: string): void {
        this.sessionSecrets.set(entry.id, secret);
        this.current = { ...this.current, authenticators: [...this.current.authenticators, entry] };
        this.commit("authenticator.created", entry.id, `Registered ${entry.issuer} / ${entry.account}`);
    }

    secretForAuthenticator(id: string): string | undefined {
        return this.sessionSecrets.get(id);
    }

    removeAuthenticator(id: string): void {
        this.sessionSecrets.delete(id);
        if (!this.current.authenticators.some((entry) => entry.id === id)) return;
        this.current = { ...this.current, authenticators: this.current.authenticators.filter((entry) => entry.id !== id) };
        this.commit("authenticator.removed", id, "Removed authenticator metadata; no secret entered history");
    }

    reorderAuthenticator(id: string, direction: "up" | "down"): void {
        const entries = [...this.current.authenticators];
        const index = entries.findIndex((entry) => entry.id === id);
        const next = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || next < 0 || next >= entries.length) return;
        [entries[index], entries[next]] = [entries[next]!, entries[index]!];
        this.current = { ...this.current, authenticators: entries };
        this.commit("authenticator.reordered", id, `Moved authenticator ${direction}`);
    }

    addTicket(category: string, description: string): SupportTicket {
        const ticket: SupportTicket = {
            id: randomId("ticket"),
            category: category.trim().slice(0, 80),
            description: description.trim().slice(0, 2000),
            status: "received",
            createdAt: nowIso(),
        };
        this.current = { ...this.current, tickets: [ticket, ...this.current.tickets].slice(0, MAX_TICKETS) };
        this.commit("ticket.created", ticket.id, "Created a local fictional recovery ticket");
        return ticket;
    }

    advanceTicket(id: string): void {
        const ticket = this.current.tickets.find((candidate) => candidate.id === id);
        if (ticket === undefined) return;
        const status = ticket.status === "received" ? "triaged" : ticket.status === "triaged" ? "resolved" : "resolved";
        this.current = { ...this.current, tickets: this.current.tickets.map((candidate) => candidate.id === id ? { ...candidate, status } : candidate) };
        this.commit("ticket.advanced", id, `Ticket status is now ${status}`);
    }

    ladderState(): SiteContractState["ladder"] {
        const ladder = this.current.ladder;
        if (Date.now() - ladder.budgetStartedAt >= LADDER_WINDOW_MS)
            return { waitingUntil: ladder.waitingUntil, used: 0, budgetStartedAt: Date.now() };
        return ladder;
    }

    beginLadderWait(durationMs = 10_000): void {
        this.current = { ...this.current, ladder: { ...this.ladderState(), waitingUntil: Date.now() + durationMs } };
        this.commit("ladder.waiting", "ladder", "Started a local waiting period");
    }

    consumeLadderAttempt(): boolean {
        const ladder = this.ladderState();
        if (ladder.used >= LADDER_BUDGET) return false;
        this.current = { ...this.current, ladder: { ...ladder, used: ladder.used + 1 } };
        this.commit("ladder.attempt", "ladder", `Used local ladder attempt ${ladder.used + 1} of ${LADDER_BUDGET}`);
        return true;
    }

    clearLadderWaiting(): void {
        this.current = { ...this.current, ladder: { ...this.ladderState(), waitingUntil: 0 } };
        this.commit("ladder.waiting.cleared", "ladder", "Cleared waiting only; credentials and attempt budget stayed unchanged");
    }

    saveLadderMachine(snapshot: LadderSnapshot): void {
        this.current = { ...this.current, ladderMachine: structuredClone(snapshot) };
        this.prefs.writeJson(STATE_KEY, this.current);
        this.emit();
    }

    clearSiteState(): void {
        this.sessionSecrets.clear();
        this.current = emptyState();
        this.prefs.remove(STATE_KEY);
        this.emit();
    }

    private commit(action: string, target: string, detail: string): void {
        const entry: SiteHistoryEntry = { id: randomId("history"), at: nowIso(), action, target, detail };
        this.current = { ...this.current, history: [entry, ...this.current.history].slice(0, MAX_HISTORY) };
        this.prefs.writeJson(STATE_KEY, this.current);
        this.emit();
    }

    private emit(): void {
        const snapshot = this.snapshot;
        for (const listener of [...this.listeners]) listener(snapshot);
    }
}

export function freshCredentialSalt(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Bounded, per-lock password KDF. Unsalted SHA-256 is intentionally not accepted here. */
export async function deriveCredential(value: string, salt: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
    if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 500_000)
        throw new Error("Password work factor must be between 100000 and 500000 PBKDF2 iterations.");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(value), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-256" },
        key,
        256,
    );
    return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function decodeBase32(input: string): Uint8Array {
    const clean = input.replace(/[=\s-]/g, "").toUpperCase();
    if (clean.length === 0 || clean.length > MAX_SECRET_BYTES) throw new Error("The base32 secret is empty or too large.");
    let buffer = 0;
    let bits = 0;
    const output: number[] = [];
    for (const character of clean) {
        const value = BASE32.indexOf(character);
        if (value < 0) throw new Error(`Invalid base32 character: ${character}`);
        buffer = (buffer << 5) | value;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            output.push((buffer >> bits) & 0xff);
        }
    }
    return new Uint8Array(output);
}

export function encodeBase32(bytes: Uint8Array): string {
    let buffer = 0;
    let bits = 0;
    let result = "";
    for (const byte of bytes) {
        buffer = (buffer << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            result += BASE32[(buffer >> bits) & 31];
        }
    }
    if (bits > 0) result += BASE32[(buffer << (5 - bits)) & 31];
    return result;
}

export function freshTotpSecret(): string {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    return encodeBase32(bytes);
}

export interface TotpUri {
    readonly issuer: string;
    readonly account: string;
    readonly secret: string;
    readonly algorithm: TotpAlgorithm;
    readonly digits: TotpDigits;
    readonly period: number;
}

export function parseOtpAuthUri(raw: string): TotpUri {
    const url = new URL(raw.trim());
    if (url.protocol !== "otpauth:" || url.hostname !== "totp") throw new Error("Only otpauth://totp URIs are supported here.");
    const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const separator = label.indexOf(":");
    const issuerFromLabel = separator < 0 ? "" : label.slice(0, separator);
    const account = separator < 0 ? label : label.slice(separator + 1);
    const issuer = url.searchParams.get("issuer")?.trim() || issuerFromLabel.trim();
    const secret = url.searchParams.get("secret")?.trim().toUpperCase() ?? "";
    decodeBase32(secret);
    const algorithmRaw = (url.searchParams.get("algorithm") || "SHA1").toUpperCase();
    if (algorithmRaw !== "SHA1" && algorithmRaw !== "SHA256" && algorithmRaw !== "SHA512") throw new Error("Algorithm must be SHA1, SHA256, or SHA512.");
    const digitsRaw = Number(url.searchParams.get("digits") || "6");
    if (digitsRaw !== 6 && digitsRaw !== 7 && digitsRaw !== 8) throw new Error("Digits must be 6, 7, or 8.");
    const period = Number(url.searchParams.get("period") || "30");
    if (!Number.isInteger(period) || period < 5 || period > 300) throw new Error("Period must be an integer from 5 to 300 seconds.");
    if (issuer === "" || account === "") throw new Error("Issuer and account are required.");
    return { issuer, account, secret, algorithm: algorithmRaw, digits: digitsRaw as TotpDigits, period };
}

export function makeOtpAuthUri(entry: TotpUri): string {
    const label = encodeURIComponent(`${entry.issuer}:${entry.account}`);
    return `otpauth://totp/${label}?secret=${encodeURIComponent(entry.secret)}&issuer=${encodeURIComponent(entry.issuer)}&algorithm=${entry.algorithm}&digits=${entry.digits}&period=${entry.period}`;
}

export function matchesContractQuery(subject: string, query: string, pattern = "", flags = "i"): boolean {
    if (pattern.trim() === "") return subject.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    try {
        return new RegExp(pattern.slice(0, 256), flags.replace(/[^dgimsuvy]/g, "")).test(subject);
    } catch {
        return false;
    }
}

/** The encoder is bundled into the site bundle, so QR generation never calls a chart service. */
export function createLocalQrSvg(payload: string): SVGElement {
    const encoder = qrcode(0, "M");
    encoder.addData(payload, "Byte");
    encoder.make();
    const markup = encoder.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    const parsed = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
    if (parsed.localName !== "svg") throw new Error("The bundled QR encoder returned an invalid SVG.");
    parsed.setAttribute("role", "img");
    parsed.setAttribute("aria-label", "Locally generated authenticator QR code");
    return parsed as unknown as SVGElement;
}

interface BarcodeDetectorLike {
    detect(source: ImageBitmapSource | HTMLVideoElement): Promise<readonly { rawValue?: string }[]>;
}
type BarcodeDetectorConstructor = new (options?: { formats?: readonly string[] }) => BarcodeDetectorLike;

function barcodeDetector(): BarcodeDetectorConstructor | null {
    const candidate = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    return typeof candidate === "function" ? candidate : null;
}

export async function decodeLocalQrImage(file: File): Promise<string | null> {
    const Detector = barcodeDetector();
    if (Detector === null) return null;
    const bitmap = await createImageBitmap(file);
    try {
        const results = await new Detector({ formats: ["qr_code"] }).detect(bitmap);
        return results[0]?.rawValue ?? null;
    } finally {
        bitmap.close();
    }
}

export interface CameraDecodeHandle {
    readonly stop: () => void;
}

export async function startLocalQrCamera(
    video: HTMLVideoElement,
    onValue: (value: string) => void,
): Promise<CameraDecodeHandle | null> {
    const Detector = barcodeDetector();
    if (Detector === null || navigator.mediaDevices?.getUserMedia === undefined) return null;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    video.srcObject = stream;
    await video.play();
    const detector = new Detector({ formats: ["qr_code"] });
    let stopped = false;
    const tick = async (): Promise<void> => {
        if (stopped) return;
        const result = await detector.detect(video);
        const value = result[0]?.rawValue;
        if (value !== undefined) onValue(value);
        if (!stopped) window.requestAnimationFrame(() => void tick());
    };
    void tick();
    return {
        stop: () => {
            stopped = true;
            for (const track of stream.getTracks()) track.stop();
            video.srcObject = null;
        },
    };
}

export async function generateTotp(
    secret: string,
    at = Date.now(),
    options: Pick<TotpUri, "algorithm" | "digits" | "period"> = { algorithm: "SHA1", digits: 6, period: 30 },
): Promise<string> {
    const decoded = decodeBase32(secret);
    const hash = options.algorithm === "SHA1" ? "SHA-1" : options.algorithm === "SHA256" ? "SHA-256" : "SHA-512";
    const key = await crypto.subtle.importKey("raw", decoded.buffer as ArrayBuffer, { name: "HMAC", hash }, false, ["sign"]);
    const counter = Math.floor(at / 1000 / options.period);
    const message = new ArrayBuffer(8);
    const view = new DataView(message);
    view.setUint32(0, Math.floor(counter / 0x100000000));
    view.setUint32(4, counter >>> 0);
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
    const offset = signature[signature.length - 1]! & 0xf;
    const binary = ((signature[offset]! & 0x7f) << 24) |
        ((signature[offset + 1]! & 0xff) << 16) |
        ((signature[offset + 2]! & 0xff) << 8) |
        (signature[offset + 3]! & 0xff);
    return String(binary % 10 ** options.digits).padStart(options.digits, "0");
}

export type LadderStage = "dim-sum" | "sums" | "whack-a-mole" | "clock" | "cleared";

export interface LadderSnapshot {
    readonly stage: LadderStage;
    readonly wrongDishes: number;
    readonly sumIndex: number;
    readonly sumAnswers: readonly number[];
    readonly visibleMoles: readonly number[];
    readonly hitMoles: readonly number[];
    readonly moleStartedAt: number | null;
    readonly moleDurationMs: number;
    readonly nonce: string;
    readonly nonceIssuedAt: number;
    readonly nonceConsumed: boolean;
    readonly waitingUntil: number;
    readonly attemptBudgetUsed: number;
    readonly escalation: number;
}

/** Explicit all-rung ladder. It never returns a credential, cookie, or session. */
export class UnlockLadderMachine {
    private state: LadderSnapshot;
    constructor(options: { readonly schoolMode: boolean; readonly now?: number; readonly waitingMs?: number; readonly initial?: LadderSnapshot | null }) {
        const now = options.now ?? Date.now();
        if (options.initial !== null && options.initial !== undefined) {
            this.state = { ...options.initial, visibleMoles: [...options.initial.visibleMoles], hitMoles: [...options.initial.hitMoles], sumAnswers: [...options.initial.sumAnswers] };
            return;
        }
        this.state = {
            stage: options.schoolMode ? "sums" : "dim-sum",
            wrongDishes: 0,
            sumIndex: 0,
            sumAnswers: [7, 14, 19, 23, 31, 38, 44, 52, 67, 81],
            visibleMoles: [],
            hitMoles: [],
            moleStartedAt: null,
            moleDurationMs: 3_000,
            nonce: randomId("ladder-nonce"),
            nonceIssuedAt: now,
            nonceConsumed: false,
            waitingUntil: now + (options.waitingMs ?? 10_000),
            attemptBudgetUsed: 0,
            escalation: 0,
        };
    }

    snapshot(): LadderSnapshot { return { ...this.state, visibleMoles: [...this.state.visibleMoles], hitMoles: [...this.state.hitMoles] }; }
    consumeAttempt(): boolean {
        if (this.state.attemptBudgetUsed >= LADDER_BUDGET) return false;
        this.state = { ...this.state, attemptBudgetUsed: this.state.attemptBudgetUsed + 1 };
        return true;
    }
    answerDish(correct: boolean, now = Date.now()): LadderSnapshot {
        if (this.state.stage !== "dim-sum") return this.snapshot();
        if (!this.takeNonce(now)) return this.expireNonce();
        if (correct) return this.clearWaiting();
        const wrong = this.state.wrongDishes + 1;
        this.state = { ...this.state, wrongDishes: wrong, stage: wrong >= 5 ? "sums" : "dim-sum", nonce: randomId("ladder-nonce"), nonceIssuedAt: now, nonceConsumed: false };
        return this.snapshot();
    }
    answerSum(answer: number, now = Date.now()): LadderSnapshot {
        if (this.state.stage !== "sums") return this.snapshot();
        if (!this.takeNonce(now)) return this.expireNonce();
        if (answer !== this.state.sumAnswers[this.state.sumIndex]) {
            this.state = { ...this.state, stage: "whack-a-mole", visibleMoles: [0, 1, 2, 3, 4], hitMoles: [], moleStartedAt: null, nonce: randomId("ladder-nonce"), nonceIssuedAt: now, nonceConsumed: false };
            return this.snapshot();
        }
        const next = this.state.sumIndex + 1;
        this.state = next >= this.state.sumAnswers.length ? { ...this.state, stage: "cleared", waitingUntil: 0, sumIndex: next } : { ...this.state, sumIndex: next, nonce: randomId("ladder-nonce"), nonceIssuedAt: now, nonceConsumed: false };
        return this.snapshot();
    }
    startMoles(now = Date.now()): LadderSnapshot {
        if (this.state.stage !== "whack-a-mole" || this.state.moleStartedAt !== null) return this.snapshot();
        if (!this.takeNonce(now)) return this.expireNonce();
        this.state = { ...this.state, moleStartedAt: now, nonce: randomId("ladder-nonce"), nonceIssuedAt: now, nonceConsumed: false };
        return this.snapshot();
    }
    hitMole(id: number, now = Date.now()): LadderSnapshot {
        if (this.state.stage !== "whack-a-mole" || !this.nonceValid(now) || this.state.moleStartedAt === null || now < this.state.moleStartedAt || now > this.state.moleStartedAt + this.state.moleDurationMs || !this.state.visibleMoles.includes(id) || this.state.hitMoles.includes(id)) return this.snapshot();
        const hit = [...this.state.hitMoles, id];
        this.state = hit.length === this.state.visibleMoles.length ? { ...this.state, hitMoles: hit, stage: "cleared", waitingUntil: 0 } : { ...this.state, hitMoles: hit };
        return this.snapshot();
    }
    submitMoles(now = Date.now()): LadderSnapshot {
        if (this.state.stage !== "whack-a-mole") return this.snapshot();
        if (!this.nonceValid(now)) return this.expireNonce();
        if (this.state.moleStartedAt === null || now < this.state.moleStartedAt + this.state.moleDurationMs) return this.snapshot();
        if (!this.takeNonce(now)) return this.expireNonce();
        this.state = { ...this.state, stage: "clock", nonce: randomId("ladder-nonce"), nonceIssuedAt: now, nonceConsumed: false, escalation: this.state.escalation + 1 };
        return this.snapshot();
    }
    clearClock(now = Date.now()): LadderSnapshot {
        if (this.state.stage === "clock" && now >= this.state.waitingUntil) return this.clearWaiting();
        return this.snapshot();
    }
    private clearWaiting(): LadderSnapshot {
        this.state = { ...this.state, stage: "cleared", waitingUntil: 0 };
        return this.snapshot();
    }
    private nonceValid(now: number): boolean { return !this.state.nonceConsumed && now - this.state.nonceIssuedAt <= 60_000; }
    private takeNonce(now: number): boolean { if (!this.nonceValid(now)) return false; this.state = { ...this.state, nonceConsumed: true }; return true; }
    private expireNonce(): LadderSnapshot { this.state = { ...this.state, stage: "clock", nonce: randomId("ladder-nonce"), nonceIssuedAt: Date.now(), nonceConsumed: false, escalation: this.state.escalation + 1 }; return this.snapshot(); }
}

function textPair(node: HTMLElement, i18n: I18n, en: string, yue: string): void {
    node.replaceChildren();
    if (i18n.mode === "yue") node.textContent = yue;
    else if (i18n.mode === "bilingual") {
        node.textContent = en;
        const secondary = document.createElement("span");
        secondary.className = "i18n-secondary";
        secondary.lang = "zh-HK";
        secondary.textContent = yue;
        node.append(" ", secondary);
    } else node.textContent = en;
}

function inputLabel(label: string, input: HTMLElement, help?: string): HTMLElement {
    const wrapper = document.createElement("label");
    wrapper.className = "md-field mb-contract-field";
    const title = document.createElement("span");
    title.className = "md-field__label";
    title.textContent = label;
    wrapper.append(title, input);
    if (help !== undefined) {
        const note = document.createElement("span");
        note.className = "md-field__help mb-help";
        note.textContent = help;
        wrapper.append(note);
    }
    return wrapper;
}

function button(label: string, onClick: () => void, className = "md-button md-button--outlined"): HTMLButtonElement {
    const control = document.createElement("button");
    control.type = "button";
    control.className = className;
    control.textContent = label;
    control.addEventListener("click", onClick);
    return control;
}

function regexBuilder(host: HTMLElement, input: HTMLInputElement, label: string): void {
    const details = document.createElement("details");
    details.className = "mb-contract-regex";
    const summary = document.createElement("summary");
    summary.textContent = "Build a regex pattern";
    details.append(summary);
    const pattern = document.createElement("input");
    pattern.type = "text";
    pattern.className = "md-field__input";
    pattern.placeholder = "Pattern, for example: lock|totp";
    const flags = document.createElement("input");
    flags.type = "text";
    flags.className = "md-field__input";
    flags.value = "i";
    const sample = document.createElement("input");
    sample.type = "text";
    sample.className = "md-field__input";
    sample.placeholder = label;
    const result = document.createElement("p");
    result.className = "mb-help";
    const refresh = (): void => {
        try {
            const re = new RegExp(pattern.value.slice(0, 256), flags.value.replace(/[^dgimsuvy]/g, ""));
            result.textContent = pattern.value === "" ? "Plain text mode is active." : `Pattern is valid. Sample matches: ${re.test(sample.value) ? "yes" : "no"}.`;
            input.dataset.regexPattern = pattern.value;
            input.dataset.regexFlags = flags.value;
            input.dispatchEvent(new Event("regexchange"));
        } catch (error) {
            result.textContent = error instanceof Error ? error.message : "Invalid pattern.";
        }
    };
    pattern.addEventListener("input", refresh);
    flags.addEventListener("input", refresh);
    sample.addEventListener("input", refresh);
    details.append(inputLabel("Pattern", pattern), inputLabel("Flags", flags), inputLabel("Sample text", sample), result);
    host.append(details);
}

function filteredSelect(label: string, options: readonly string[], help: string): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "mb-contract-select-wrap";
    const filter = document.createElement("input");
    filter.type = "search";
    filter.className = "md-field__input";
    filter.placeholder = "Filter choices";
    filter.setAttribute("aria-label", `${label} filter`);
    const select = document.createElement("select");
    select.className = "md-field__input";
    const refill = (): void => {
        const query = filter.value.trim().toLocaleLowerCase();
        select.replaceChildren();
        options.filter((option) => matchesContractQuery(option, filter.value, filter.dataset.regexPattern ?? "", filter.dataset.regexFlags ?? "i")).forEach((option) => {
            const item = document.createElement("option");
            item.value = option;
            item.textContent = option;
            select.append(item);
        });
    };
    filter.addEventListener("input", refill);
    filter.addEventListener("regexchange", refill);
    refill();
    wrapper.append(inputLabel(label, select, help), inputLabel("Filter this dropdown", filter));
    regexBuilder(wrapper, filter, label);
    return wrapper;
}

function safeDownload(filename: string, content: string, type = "application/json"): void {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function section(title: string, description: string): HTMLElement {
    const host = document.createElement("section");
    host.className = "mb-section mb-contract-section";
    const heading = document.createElement("h2");
    heading.className = "mb-section-title";
    heading.textContent = title;
    host.append(heading);
    const lede = document.createElement("p");
    lede.className = "mb-section-lede";
    lede.textContent = description;
    host.append(lede);
    return host;
}

/** Build the one-page, local-only contract surface. */
export function createSiteUniversalContractsView(options: {
    readonly i18n: I18n;
    readonly appearance: AppearanceController;
    readonly store?: SiteContractStore;
}): HTMLElement {
    const store = options.store ?? new SiteContractStore();
    const root = document.createElement("div");
    root.className = "mb-page mb-contract-page";
    let renderVersion = 0;
    let pendingAuthenticator: { readonly uri: TotpUri; readonly secret: string } | null = null;
    let activeCamera: CameraDecodeHandle | null = null;
    const activeTimers = new Set<number>();
    let authenticatorQuery = "";
    let ticketQuery = "";

    const render = (): void => {
        const version = ++renderVersion;
        activeCamera?.stop();
        activeCamera = null;
        for (const timer of activeTimers) window.clearInterval(timer);
        activeTimers.clear();
        root.replaceChildren();
        const title = document.createElement("h1");
        title.className = "mb-page-title";
        textPair(title, options.i18n, "Universal site contracts", "網站通用規格");
        root.append(title);
        const boundary = document.createElement("p");
        boundary.className = "mb-page-subtitle";
        textPair(boundary, options.i18n, "This is a landing and documentation surface, not the installed application. State below is visitor-local and does not authenticate anyone.", "呢度係介紹同文件畫面，唔係安裝版程式。以下狀態只留喺訪客瀏覽器，唔會驗證任何人身份。");
        root.append(boundary);

        const searchSection = section("Find a contract", "Search this surface in plain text, or deliberately build a bounded JavaScript regular expression.");
        const search = document.createElement("input");
        search.type = "search";
        search.className = "md-field__input";
        search.placeholder = "Search locks, appearance, authenticator, support, or waiting";
        search.setAttribute("aria-label", "Search universal contracts");
        regexBuilder(searchSection, search, "universal contracts");
        const result = document.createElement("div");
        result.className = "mb-contract-search-results";
        const searchable = [
            ["appearance", "Every-element appearance editor"],
            ["locks", "Independent locks for elements, tabs, groups, and properties"],
            ["authenticator", "Local RFC 6238 authenticator"],
            ["support", "Local Support Tickets recovery"],
            ["waiting", "Waiting-only unlock ladder"],
            ["history", "Append-only visitor history"],
        ] as const;
        const refreshSearch = (): void => {
            const query = search.value.trim().toLocaleLowerCase();
            result.replaceChildren();
            searchable.filter(([id, label]) => matchesContractQuery(`${id} ${label}`, query, search.dataset.regexPattern ?? "", search.dataset.regexFlags ?? "i")).forEach(([id, label]) => {
                const jump = button(label, () => document.getElementById(`contract-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), "md-button md-button--text");
                jump.dataset.contractResult = id;
                result.append(jump);
            });
        };
        search.addEventListener("input", refreshSearch);
        search.addEventListener("regexchange", refreshSearch);
        searchSection.prepend(inputLabel("Search this surface", search));
        searchSection.append(result);
        root.append(searchSection);

        const appearance = section("Appearance studio", "Every value below is visitor-local. The built-in editor remains available from each rendered element's appearance menu, including this editor's own controls.");
        appearance.id = "contract-appearance";
        const appearanceGrid = document.createElement("div");
        appearanceGrid.className = "mb-contract-grid";
        const state = store.snapshot;
        document.documentElement.style.setProperty("--mb-contract-accent", state.appearance.colour);
        document.documentElement.style.setProperty("--mb-contract-font", state.appearance.fontFamily);
        document.documentElement.style.setProperty("--mb-contract-font-size", `${state.appearance.fontSize}px`);
        document.documentElement.style.setProperty("--mb-contract-weight", String(state.appearance.weight));
        document.documentElement.classList.toggle("mb-contract-rainbow", state.appearance.rainbow);
        const colourText = document.createElement("input");
        colourText.type = "text";
        colourText.className = "md-field__input";
        colourText.value = state.appearance.colour;
        const applyColour = (value: string): void => {
            const candidate = value.trim();
            if (!/^#[0-9a-f]{6}$/i.test(candidate)) return;
            colourText.value = candidate;
            document.documentElement.style.setProperty("--mb-contract-accent", candidate);
            store.setAppearance({ colour: candidate });
        };
        colourText.addEventListener("change", () => applyColour(colourText.value));
        const openFullAppearance = button("Open full appearance editor", () => openAppearanceEditor({ anchor: colourText, kind: "card", instance: "universal-contract-colour", instanceLabel: "Universal contract colour", controller: options.appearance }));
        appearanceGrid.append(inputLabel("Infinite spectrum and color translator", colourText, "Use the full anchored editor for HEX8, RGB, HSL, HSV, HWB, CIELAB, LCH, OKLab, OKLCH, CMYK, gamut warnings, contrast, and eyedropper support."), openFullAppearance);
        const rainbow = document.createElement("input");
        rainbow.type = "checkbox";
        rainbow.checked = state.appearance.rainbow;
        const rainbowLabel = inputLabel("Animated rainbow sentinel", rainbow, "RAINBOW is a sentinel, never a CSS color string. Reduced motion settles on one hue.");
        rainbow.addEventListener("change", () => {
            store.setAppearance({ rainbow: rainbow.checked });
            document.documentElement.classList.toggle("mb-contract-rainbow", rainbow.checked);
        });
        appearanceGrid.append(rainbowLabel);
        appearanceGrid.append(filteredSelect("Rainbow speed level", ["1", "2", "3", "4", "5"], "One global speed is shared by every rainbow surface."));
        const font = document.createElement("select");
        font.className = "md-field__input";
        ["system-ui", "Arial", "Georgia", "Courier New", "sans-serif"].forEach((name) => {
            const option = document.createElement("option"); option.value = name; option.textContent = name; option.style.fontFamily = name; font.append(option);
        });
        font.value = state.appearance.fontFamily;
        font.addEventListener("change", () => { document.documentElement.style.setProperty("--mb-contract-font", font.value); store.setAppearance({ fontFamily: font.value }); });
        appearanceGrid.append(inputLabel("Font family with live preview", font, "The browser lists installed families; the full editor also reports unavailable installed-font access honestly."));
        const size = document.createElement("input"); size.type = "number"; size.min = "10"; size.max = "48"; size.step = "1"; size.value = String(state.appearance.fontSize); size.className = "md-field__input";
        size.addEventListener("change", () => { const value = numberInRange(Number(size.value), 10, 48, 16); size.value = String(value); document.documentElement.style.setProperty("--mb-contract-font-size", `${value}px`); store.setAppearance({ fontSize: value }); });
        appearanceGrid.append(inputLabel("Font size", size, "Word-style numeric entry and stepper, bounded to 10 to 48 CSS pixels."));
        const weight = document.createElement("input"); weight.type = "range"; weight.min = "100"; weight.max = "900"; weight.step = "100"; weight.value = String(state.appearance.weight);
        weight.addEventListener("input", () => { document.documentElement.style.setProperty("--mb-contract-weight", weight.value); store.setAppearance({ weight: Number(weight.value) }); });
        appearanceGrid.append(inputLabel("Weight and bold", weight));
        const typographyToggles = document.createElement("div"); typographyToggles.className = "mb-contract-inline-controls";
        for (const [label, key] of [["Italic", "italic"], ["Underline", "underline"]] as const) {
            const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = state.appearance[key]; checkbox.addEventListener("change", () => store.setAppearance({ [key]: checkbox.checked })); typographyToggles.append(inputLabel(label, checkbox));
        }
        const strike = document.createElement("select"); strike.className = "md-field__input"; ["none", "single", "double"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; strike.append(item); }); strike.value = state.appearance.strike; strike.addEventListener("change", () => store.setAppearance({ strike: strike.value as SiteContractState["appearance"]["strike"] }));
        typographyToggles.append(inputLabel("Strikethrough style", strike));
        const casing = document.createElement("select"); casing.className = "md-field__input"; ["normal", "uppercase", "small-caps"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; casing.append(item); }); casing.value = state.appearance.casing; casing.addEventListener("change", () => store.setAppearance({ casing: casing.value as SiteContractState["appearance"]["casing"] }));
        typographyToggles.append(inputLabel("Capitalization and small caps", casing));
        appearanceGrid.append(typographyToggles);
        const spacing = document.createElement("input"); spacing.type = "range"; spacing.min = "-0.2"; spacing.max = "1"; spacing.step = "0.01"; spacing.value = String(state.appearance.letterSpacing); spacing.addEventListener("input", () => store.setAppearance({ letterSpacing: Number(spacing.value) })); appearanceGrid.append(inputLabel("Character spacing", spacing));
        const line = document.createElement("input"); line.type = "number"; line.min = "1"; line.max = "3"; line.step = "0.1"; line.value = String(state.appearance.lineHeight); line.className = "md-field__input"; line.addEventListener("change", () => store.setAppearance({ lineHeight: numberInRange(Number(line.value), 1, 3, 1.5) })); appearanceGrid.append(inputLabel("Line height", line));
        appearance.append(appearanceGrid);
        const appearanceActions = document.createElement("div"); appearanceActions.className = "mb-contract-actions";
        const presetName = document.createElement("input"); presetName.className = "md-field__input"; presetName.placeholder = "Preset name";
        const importPreset = document.createElement("input"); importPreset.type = "file"; importPreset.accept = "application/json"; importPreset.className = "md-field__input";
        importPreset.addEventListener("change", () => {
            const file = importPreset.files?.[0];
            if (file === undefined) return;
            void file.text().then((text) => {
                const parsed = JSON.parse(text) as { name?: unknown; appearance?: unknown };
                if (!isRecord(parsed) || !isRecord(parsed.appearance)) throw new Error("Appearance preset JSON must contain an appearance object.");
                store.setAppearance(parsed.appearance as Partial<SiteContractState["appearance"]>);
                const imported = store.saveAppearancePreset(typeof parsed.name === "string" ? parsed.name : file.name);
                statusMessage.textContent = `Imported and applied ${imported.name}.`;
            }).catch((error) => { statusMessage.textContent = error instanceof Error ? error.message : "The appearance preset could not be imported."; });
        });
        const statusMessage = document.createElement("p"); statusMessage.className = "mb-help"; statusMessage.setAttribute("role", "status");
        appearanceActions.append(inputLabel("Preset name", presetName), button("Save preset", () => { const preset = store.saveAppearancePreset(presetName.value); presetName.value = ""; statusMessage.textContent = `Saved ${preset.name}.`; render(); }), button("Export appearance JSON", () => safeDownload("worldlens-site-appearance.json", JSON.stringify({ version: 1, appearance: store.snapshot.appearance, presets: store.snapshot.presets, omitted: ["visitor secrets", "file metadata"] }, null, 2))), inputLabel("Import preset JSON", importPreset), button("Reset appearance", () => store.resetAppearance()));
        appearance.append(appearanceActions, statusMessage);
        const presetList = document.createElement("div"); presetList.className = "mb-contract-list";
        for (const preset of state.presets) {
            const row = document.createElement("article"); row.className = "mb-contract-row";
            row.append(document.createTextNode(preset.name), button("Apply preset", () => { store.applyAppearancePreset(preset.id); render(); }), button("Remove preset", () => { void confirmDestructive(`Remove appearance preset ${preset.name}?`).then((confirmed) => { if (confirmed) { store.removeAppearancePreset(preset.id); render(); } }); }));
            presetList.append(row);
        }
        appearance.append(presetList);
        root.append(appearance);

        const locks = section("Toy locks and recovery", "Each target gets its own password or TOTP credential and duration. This is a browser experience lock, not encryption or protection from another person with storage access.");
        locks.id = "contract-locks";
        const targetOptions = ["Universal contract page", "Appearance colour property", "Universal contracts tab", "Support Tickets group", "Authenticator code property"] as const;
        const target = document.createElement("select"); target.className = "md-field__input"; targetOptions.forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; target.append(item); });
        const method = document.createElement("select"); method.className = "md-field__input"; ["password", "totp"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; method.append(item); });
        const scope = document.createElement("select"); scope.className = "md-field__input"; ["element", "property", "tab", "group"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; scope.append(item); });
        const duration = document.createElement("select"); duration.className = "md-field__input"; ["session", "15m", "1h"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; duration.append(item); });
        const lockAlgorithm = document.createElement("select"); lockAlgorithm.className = "md-field__input"; ["SHA1", "SHA256", "SHA512"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; lockAlgorithm.append(item); });
        const lockDigits = document.createElement("select"); lockDigits.className = "md-field__input"; ["6", "7", "8"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; lockDigits.append(item); });
        const lockPeriod = document.createElement("input"); lockPeriod.className = "md-field__input"; lockPeriod.type = "number"; lockPeriod.value = "30"; lockPeriod.min = "5"; lockPeriod.max = "300";
        const credential = document.createElement("input"); credential.type = "password"; credential.className = "md-field__input"; credential.autocomplete = "new-password";
        const lockForm = document.createElement("form"); lockForm.className = "mb-contract-grid";
        lockForm.append(inputLabel("Target", target), inputLabel("Scope", scope), inputLabel("Credential method", method, "Dropdown filter and regex builder are attached to this choice on the full settings surface."), inputLabel("Duration", duration), inputLabel("TOTP algorithm", lockAlgorithm), inputLabel("TOTP digits", lockDigits), inputLabel("TOTP period seconds", lockPeriod), inputLabel("Password or one-time setup value", credential));
        const lockStatus = document.createElement("p"); lockStatus.className = "mb-help"; lockStatus.setAttribute("role", "status");
        lockForm.append(button("Create independent lock", () => undefined));
        lockForm.addEventListener("submit", (event) => event.preventDefault());
        const createLockButton = lockForm.querySelector("button") as HTMLButtonElement;
        createLockButton.addEventListener("click", async () => {
            if (credential.value.trim() === "") { lockStatus.textContent = "Enter a credential before creating the lock."; return; }
            try {
                const salt = freshCredentialSalt();
                const digest = await deriveCredential(credential.value, salt);
                const lockInput = { target: target.value, scope: scope.value as SiteLock["scope"], method: method.value as LockMethod, credentialDigest: digest, credentialSalt: salt, iterations: PBKDF2_ITERATIONS, duration: duration.value as LockDuration };
                const totp = { algorithm: lockAlgorithm.value as TotpAlgorithm, digits: Number(lockDigits.value) as TotpDigits, period: numberInRange(Number(lockPeriod.value), 5, 300, 30) };
                const lock = store.addLock(method.value === "totp" ? { ...lockInput, sessionSecret: credential.value, totp } : { ...lockInput, totp: null });
                credential.value = "";
                lockStatus.textContent = `${lock.target} is locked independently. Clearing this site's storage is the recovery route.`;
                render();
            } catch (error) { lockStatus.textContent = error instanceof Error ? error.message : "The browser could not create this local lock."; }
        });
        locks.append(lockForm, lockStatus);
        const lockList = document.createElement("div"); lockList.className = "mb-contract-list";
        for (const lock of state.locks) {
            const row = document.createElement("article"); row.className = "mb-contract-row"; row.dataset.lockId = lock.id;
            const label = document.createElement("strong"); label.textContent = `${lock.target} · ${lock.scope} · ${lock.method} · ${lock.duration}`;
            const answer = document.createElement("input"); answer.type = "password"; answer.className = "md-field__input"; answer.placeholder = "Unlock answer"; answer.setAttribute("aria-label", `Unlock ${lock.target}`);
            const unlock = button("Unlock", async () => { const ok = await store.verifyLock(lock.id, answer.value); row.dataset.unlocked = String(ok); row.classList.toggle("is-unlocked", ok); status.textContent = ok ? `${lock.target} is unlocked for its chosen duration.` : "That answer did not match. Use the local Support Tickets recovery route if needed."; });
            const remove = button("Remove lock", () => {
                void confirmDestructive(`Remove the independent lock for ${lock.target}?`).then((confirmed) => {
                    if (confirmed) { store.removeLock(lock.id); render(); }
                });
            });
            const support = button("Forgotten credential? Open Support Tickets", () => document.getElementById("contract-support")?.scrollIntoView({ behavior: "smooth" }), "md-button md-button--text");
            row.append(label, answer, unlock, remove, support); lockList.append(row);
        }
        const status = document.createElement("p"); status.className = "mb-help"; status.setAttribute("role", "status"); locks.append(lockList, status);
        root.append(locks);

        const auth = section("Local authenticator", "Register an otpauth URI, manual base32 values, clipboard text, or a QR image when this browser exposes a local decoder. Secrets stay in this tab's memory and never enter localStorage, history, export, or the network.");
        auth.id = "contract-authenticator";
        const uri = document.createElement("input"); uri.className = "md-field__input"; uri.type = "password"; uri.placeholder = "otpauth://totp/Issuer:Account?..."; uri.autocomplete = "off";
        const authForm = document.createElement("form"); authForm.className = "mb-contract-grid";
        const issuer = document.createElement("input"); issuer.className = "md-field__input"; const account = document.createElement("input"); account.className = "md-field__input"; const secret = document.createElement("input"); secret.className = "md-field__input"; secret.type = "password";
        const algorithm = document.createElement("select"); algorithm.className = "md-field__input"; ["SHA1", "SHA256", "SHA512"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; algorithm.append(item); });
        const digits = document.createElement("select"); digits.className = "md-field__input"; ["6", "7", "8"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; digits.append(item); });
        const period = document.createElement("input"); period.className = "md-field__input"; period.type = "number"; period.value = "30"; period.min = "5"; period.max = "300";
        authForm.append(inputLabel("otpauth URI", uri, "URI is parsed locally and its issuer, account, algorithm, digits, and period are displayed before registration."), inputLabel("Issuer", issuer), inputLabel("Account", account), inputLabel("Base32 secret", secret, "Shown only while you are registering; the stored entry keeps no secret in browser storage."), inputLabel("Algorithm", algorithm), inputLabel("Digits", digits), inputLabel("Period seconds", period));
        const qrPayload = document.createElement("div"); qrPayload.className = "mb-contract-qr"; qrPayload.setAttribute("role", "group"); qrPayload.setAttribute("aria-label", "Local QR enrollment and text alternative");
        const qrText = document.createElement("pre"); qrText.className = "mb-contract-qr-text"; qrText.textContent = "No QR enrollment payload yet. The secret is deliberately omitted from visible text and metadata.";
        qrPayload.append(qrText);
        const authStatus = document.createElement("p"); authStatus.className = "mb-help"; authStatus.setAttribute("role", "status");
        const qrFile = document.createElement("input"); qrFile.type = "file"; qrFile.accept = "image/*"; qrFile.className = "md-field__input";
        const cameraVideo = document.createElement("video"); cameraVideo.className = "mb-contract-camera"; cameraVideo.autoplay = true; cameraVideo.muted = true; cameraVideo.playsInline = true; cameraVideo.hidden = true;
        const cameraButton = button("Scan QR with local camera", () => {
            cameraVideo.hidden = false;
            void startLocalQrCamera(cameraVideo, (value) => { uri.value = value; authStatus.textContent = "Camera decoded an otpauth URI locally. Review it before preparing registration."; activeCamera?.stop(); activeCamera = null; cameraVideo.hidden = true; }).then((handle) => { activeCamera = handle; if (handle === null) { cameraVideo.hidden = true; authStatus.textContent = "Camera QR scanning is unavailable in this browser. Use the local image, clipboard, URI, or manual route."; } }).catch(() => { cameraVideo.hidden = true; authStatus.textContent = "Camera access was refused or unavailable. Use the local image, clipboard, URI, or manual route."; });
        });
        const register = button("Prepare authenticator registration", () => undefined);
        register.addEventListener("click", () => {
            try {
                const parsed: TotpUri = uri.value.trim() === "" ? { issuer: issuer.value.trim(), account: account.value.trim(), secret: secret.value.trim().toUpperCase(), algorithm: algorithm.value as TotpUri["algorithm"], digits: Number(digits.value) as TotpDigits, period: Number(period.value) } : parseOtpAuthUri(uri.value);
                decodeBase32(parsed.secret);
                const payload = makeOtpAuthUri(parsed);
                pendingAuthenticator = { uri: parsed, secret: parsed.secret };
                qrPayload.replaceChildren(createLocalQrSvg(payload), qrText);
                qrText.textContent = `Local QR generated for ${parsed.issuer} / ${parsed.account}. Algorithm ${parsed.algorithm}, ${parsed.digits} digits, ${parsed.period} second period. The enrollment URI is available only through the explicit copy action.`;
                authStatus.textContent = `Registration is pending. Enter the current code to confirm ${parsed.issuer} / ${parsed.account}.`;
            } catch (error) { authStatus.textContent = error instanceof Error ? error.message : "The authenticator entry could not be prepared."; }
        });
        const confirmCode = document.createElement("input"); confirmCode.className = "md-field__input"; confirmCode.inputMode = "numeric"; confirmCode.placeholder = "Current authenticator code";
        const confirm = button("Confirm current code and finish registration", async () => {
            if (pendingAuthenticator === null) { authStatus.textContent = "Prepare a URI or manual secret first."; return; }
            const candidate = await generateTotp(pendingAuthenticator.secret, Date.now(), pendingAuthenticator.uri);
            if (candidate !== confirmCode.value.trim()) { authStatus.textContent = "The current code did not match. Registration remains pending."; return; }
            const id = randomId("auth");
            const entry: AuthenticatorEntry = { id, issuer: pendingAuthenticator.uri.issuer, account: pendingAuthenticator.uri.account, algorithm: pendingAuthenticator.uri.algorithm, digits: pendingAuthenticator.uri.digits, period: pendingAuthenticator.uri.period, group: "Ungrouped", secretAvailable: true };
            store.addAuthenticator(entry, pendingAuthenticator.secret);
            pendingAuthenticator = null; confirmCode.value = ""; secret.value = ""; uri.value = ""; render();
        });
        const revealUri = button("Reveal URI briefly", () => { uri.type = uri.type === "password" ? "text" : "password"; authStatus.textContent = uri.type === "text" ? "The URI is revealed only in this active field. Hide it again before capturing or sharing the page." : "The URI is hidden again."; });
        const copyUri = button("Copy enrollment URI", async () => { if (pendingAuthenticator === null) { authStatus.textContent = "Prepare registration first."; return; } try { await navigator.clipboard.writeText(makeOtpAuthUri(pendingAuthenticator.uri)); authStatus.textContent = "The URI was copied only after the explicit copy action."; } catch { authStatus.textContent = "Clipboard writing is unavailable. Reveal the URI only when you need to copy it manually."; } });
        const clipboard = button("Read otpauth URI from clipboard", async () => { try { uri.value = await navigator.clipboard.readText(); authStatus.textContent = "Clipboard text was read locally. Review it before preparing registration."; } catch { authStatus.textContent = "Clipboard access is unavailable in this browser. Paste the URI into the hidden local field instead."; } });
        qrFile.addEventListener("change", () => { const file = qrFile.files?.[0]; if (file === undefined) return; void decodeLocalQrImage(file).then((value) => { if (value === null) authStatus.textContent = "This browser has no local QR decoder, so the image was not sent anywhere. Use the URI or manual path."; else { uri.value = value; authStatus.textContent = "QR image decoded locally. Review the URI before preparing registration."; } }).catch(() => { authStatus.textContent = "The local QR image could not be decoded. Use the URI or manual path."; }); });
        authForm.append(register, revealUri, copyUri, clipboard, cameraButton, inputLabel("QR image file, local only", qrFile), cameraVideo, inputLabel("Current code confirmation", confirmCode), confirm);
        auth.append(authForm, qrPayload, authStatus);
        const authSearch = document.createElement("input"); authSearch.type = "search"; authSearch.className = "md-field__input"; authSearch.placeholder = "Search authenticator issuer, account, or group"; authSearch.setAttribute("aria-label", "Search authenticator entries");
        authSearch.value = authenticatorQuery;
        authSearch.addEventListener("input", () => { authenticatorQuery = authSearch.value; render(); });
        regexBuilder(auth, authSearch, "authenticator entries");
        const authList = document.createElement("div"); authList.className = "mb-contract-list";
        const selectedAuth = new Set<string>();
        for (const entry of state.authenticators) {
            if (!matchesContractQuery(`${entry.issuer} ${entry.account} ${entry.group}`, authSearch.value, authSearch.dataset.regexPattern ?? "", authSearch.dataset.regexFlags ?? "i")) continue;
            const row = document.createElement("article"); row.className = "mb-contract-row";
            const selectAuth = document.createElement("input"); selectAuth.type = "checkbox"; selectAuth.checked = selectedAuth.has(entry.id); selectAuth.setAttribute("aria-label", `Select ${entry.issuer} ${entry.account}`); selectAuth.addEventListener("change", () => { if (selectAuth.checked) selectedAuth.add(entry.id); else selectedAuth.delete(entry.id); });
            const current = document.createElement("output"); current.textContent = "Code unavailable until this tab's in-memory secret is registered again.";
            const next = document.createElement("output"); next.textContent = "Next code unavailable until this tab's in-memory secret is registered again.";
            const countdown = document.createElement("span"); countdown.setAttribute("role", "timer");
            const skew = document.createElement("span"); skew.textContent = "Clock skew cannot be measured without a trusted server time on this static host.";
            const refreshCodes = async (): Promise<void> => {
                const stored = store.secretForAuthenticator(entry.id);
                if (stored === undefined) { current.textContent = "This tab no longer has the secret. Re-register from the URI or authenticator export."; next.textContent = "Next code unavailable."; return; }
                const now = Date.now();
                current.textContent = await generateTotp(stored, now, entry);
                next.textContent = await generateTotp(stored, now + entry.period * 1000, entry);
                countdown.textContent = `Next code in ${entry.period - (Math.floor(now / 1000) % entry.period)} seconds`;
            };
            const code = button("Refresh current and next code", () => { void refreshCodes(); });
            void refreshCodes();
            const timer = window.setInterval(() => { void refreshCodes(); }, 1000); activeTimers.add(timer);
            row.append(selectAuth, document.createTextNode(`${entry.issuer} / ${entry.account} · ${entry.group} · ${entry.algorithm} · ${entry.digits} digits`), current, next, countdown, skew, code, button("Move up", () => { store.reorderAuthenticator(entry.id, "up"); render(); }), button("Move down", () => { store.reorderAuthenticator(entry.id, "down"); render(); }), button("Remove", () => {
                void confirmDestructive(`Remove the authenticator metadata for ${entry.issuer} / ${entry.account}? The in-memory secret is also forgotten.`).then((confirmed) => {
                    if (confirmed) { store.removeAuthenticator(entry.id); render(); }
                });
            })); authList.append(row);
        }
        const authActions = document.createElement("div"); authActions.className = "mb-contract-actions";
        authActions.append(button("Export selected metadata, secrets omitted", () => safeDownload("worldlens-authenticator-metadata.json", JSON.stringify({ version: 1, omitted: ["TOTP secrets", "QR payloads"], entries: state.authenticators.filter((entry) => selectedAuth.has(entry.id)) }, null, 2))), button("Remove selected entries", () => { void confirmDestructive(`Remove ${selectedAuth.size} selected authenticator entries? Secrets in this tab will also be forgotten.`).then((confirmed) => { if (!confirmed) return; for (const id of selectedAuth) store.removeAuthenticator(id); render(); }); }));
        auth.append(authSearch, authActions, authList); root.append(auth);

        const support = section("Support Tickets", "This is a fictional local recovery desk. Nothing is sent anywhere, no ticket exists outside this browser, no network request is made, and nobody is reading it.");
        support.id = "contract-support";
        const category = document.createElement("select"); category.className = "md-field__input"; ["Forgotten lock credential", "QR enrollment", "Appearance reset", "Other local issue"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; category.append(item); });
        const description = document.createElement("textarea"); description.className = "md-field__input"; description.rows = 3; description.placeholder = "Describe the local issue";
        const ticketStatus = document.createElement("p"); ticketStatus.className = "mb-help"; ticketStatus.setAttribute("role", "status");
        support.append(inputLabel("Category", category), inputLabel("Description", description), button("Create local ticket", () => { if (description.value.trim() === "") { ticketStatus.textContent = "Describe the local issue first."; return; } const ticket = store.addTicket(category.value, description.value); ticketStatus.textContent = `Ticket ${ticket.id} is local only and starts at received.`; description.value = ""; render(); }), ticketStatus);
        const ticketSearch = document.createElement("input"); ticketSearch.type = "search"; ticketSearch.className = "md-field__input"; ticketSearch.placeholder = "Search local tickets"; ticketSearch.setAttribute("aria-label", "Search Support Tickets");
        ticketSearch.value = ticketQuery;
        ticketSearch.addEventListener("input", () => { ticketQuery = ticketSearch.value; render(); });
        regexBuilder(support, ticketSearch, "Support Tickets");
        const ticketList = document.createElement("div"); ticketList.className = "mb-contract-list";
        const selectedTickets = new Set<string>();
        for (const ticket of state.tickets) {
            if (!matchesContractQuery(`${ticket.id} ${ticket.category} ${ticket.description} ${ticket.status}`, ticketSearch.value, ticketSearch.dataset.regexPattern ?? "", ticketSearch.dataset.regexFlags ?? "i")) continue;
            const row = document.createElement("article"); row.className = "mb-contract-row"; row.append(document.createTextNode(`${ticket.id} · ${ticket.category} · ${ticket.status}`), document.createElement("br"), document.createTextNode(ticket.description), button("Advance fictional status", () => { store.advanceTicket(ticket.id); render(); })); ticketList.append(row);
        }
        const ticketActions = document.createElement("div"); ticketActions.className = "mb-contract-actions";
        ticketActions.append(button("Export redacted ticket list", () => safeDownload("worldlens-support-tickets.json", JSON.stringify({ version: 1, disclosure: "Local fictional tickets only. No network request.", tickets: state.tickets }, null, 2))), button("Select all shown tickets", () => { state.tickets.filter((ticket) => matchesContractQuery(`${ticket.id} ${ticket.category} ${ticket.description} ${ticket.status}`, ticketSearch.value, ticketSearch.dataset.regexPattern ?? "", ticketSearch.dataset.regexFlags ?? "i")).forEach((ticket) => selectedTickets.add(ticket.id)); ticketStatus.textContent = `${selectedTickets.size} local tickets selected.`; }), button("Advance selected tickets", () => { for (const id of selectedTickets) store.advanceTicket(id); render(); }));
        const resetInfo = document.createElement("p"); resetInfo.className = "mb-help"; resetInfo.textContent = "Recovery uses the browser's clear-site-storage action. The site never clears itself without a two-key confirmation.";
        const clearKeyOne = document.createElement("input"); clearKeyOne.className = "md-field__input"; clearKeyOne.placeholder = "Type CLEAR";
        const clearKeyTwo = document.createElement("input"); clearKeyTwo.className = "md-field__input"; clearKeyTwo.placeholder = "Type SITE";
        const clearSlider = document.createElement("input"); clearSlider.type = "range"; clearSlider.min = "0"; clearSlider.max = "100"; clearSlider.value = "0";
        const clearButton = button("Emergency storage reset", () => {
            if (clearKeyOne.value !== "CLEAR" || clearKeyTwo.value !== "SITE" || clearSlider.value !== "100") { resetInfo.textContent = "Two exact keys and the full slider are required. Nothing was cleared."; return; }
            void confirmDestructive("Clear this site's local storage and reset visitor-local state?").then((confirmed) => {
                if (!confirmed) return;
                store.clearSiteState();
                resetInfo.textContent = "Site storage was cleared locally. Refreshing returns the surface to its honest empty state.";
                render();
            });
        });
        support.append(ticketSearch, ticketActions, ticketList, resetInfo, inputLabel("Recovery key one", clearKeyOne), inputLabel("Recovery key two", clearKeyTwo), inputLabel("Full-range confirmation", clearSlider), clearButton); root.append(support);

        const ladder = section("Waiting-only unlock ladder", "A static site cannot grade a server-side nonce. This local equivalent clears waiting only, never credentials, sessions, or the attempt budget. Under the site's named school setting, it starts at sums and never shows the dim-sum rung.");
        ladder.id = "contract-ladder";
        const schoolEnabled = window.localStorage.getItem("mbm-site:school.enabled") === "true";
        const ladderMachine = new UnlockLadderMachine({ schoolMode: schoolEnabled, initial: store.snapshot.ladderMachine });
        const saveLadder = (): void => store.saveLadderMachine(ladderMachine.snapshot());
        const ladderBody = document.createElement("div"); ladderBody.className = "mb-contract-ladder-body";
        const ladderStatus = document.createElement("p"); ladderStatus.className = "mb-help"; ladderStatus.setAttribute("role", "status");
        const renderLadder = (): void => {
            ladderBody.replaceChildren();
            const current = ladderMachine.snapshot();
            ladderStatus.textContent = `Stage: ${current.stage}. Nonce: ${current.nonce.slice(-8)}. Waiting only. Attempts used: ${current.attemptBudgetUsed} of ${LADDER_BUDGET}. Escalation remains ${current.escalation}.`;
            if (current.stage === "dim-sum") {
                const choices = document.createElement("div"); choices.className = "mb-contract-actions";
                ["Har Gow", "Siu Mai", "Cheung Fun", "Egg Tart"].forEach((dish, index) => choices.append(button(dish, () => { if (!ladderMachine.consumeAttempt()) { ladderStatus.textContent = "The rolling ladder budget is exhausted. The clock is the only route."; return; } ladderMachine.answerDish(index === 0); saveLadder(); renderLadder(); })));
                ladderBody.append(document.createTextNode("Choose the correct local dish. A correct answer clears waiting only."), choices);
            } else if (current.stage === "sums") {
                const answer = document.createElement("input"); answer.className = "md-field__input"; answer.type = "number"; answer.setAttribute("aria-label", `Sum ${current.sumIndex + 1} of 10`);
                ladderBody.append(document.createTextNode(`Ten sums. Current item ${current.sumIndex + 1} of 10.`), inputLabel("Answer", answer), button("Submit sum", () => { if (!ladderMachine.consumeAttempt()) { ladderStatus.textContent = "The rolling ladder budget is exhausted. The clock is the only route."; return; } ladderMachine.answerSum(Number(answer.value)); saveLadder(); renderLadder(); }));
            } else if (current.stage === "whack-a-mole") {
                const moleRow = document.createElement("div"); moleRow.className = "mb-contract-actions";
                current.visibleMoles.forEach((id) => moleRow.append(button(`Mole ${id + 1}`, () => { ladderMachine.hitMole(id); saveLadder(); renderLadder(); })));
                ladderBody.append(document.createTextNode("Timed round: each visible mole counts once. Submit is refused before the round ends."), button("Start timed mole round", () => { ladderMachine.startMoles(); saveLadder(); renderLadder(); }), moleRow, button("Submit timed round", () => { ladderMachine.submitMoles(); saveLadder(); renderLadder(); }));
            } else if (current.stage === "clock") {
                ladderBody.append(document.createTextNode("The ladder fell to the clock. No second ladder is offered for this lockout."), button("Check clock", () => { ladderMachine.clearClock(); saveLadder(); renderLadder(); }), button("Open Support Tickets", () => document.getElementById("contract-support")?.scrollIntoView({ behavior: "smooth" }), "md-button md-button--text"));
            } else {
                ladderBody.append(document.createTextNode("Waiting cleared only. Credentials, cookies, sessions, and attempt escalation were not changed."));
            }
        };
        renderLadder();
        ladder.append(ladderBody, ladderStatus);
        root.append(ladder);

        const history = section("Local history and export", "Each mutation above appends a redacted local record. Secrets, QR payloads, passwords, and visitor file metadata are deliberately omitted from history and exports.");
        history.id = "contract-history";
        const historyList = document.createElement("div"); historyList.className = "mb-contract-list";
        state.history.slice(0, 30).forEach((entry) => { const row = document.createElement("article"); row.className = "mb-contract-row"; row.textContent = `${entry.at} · ${entry.action} · ${entry.target} · ${entry.detail}`; historyList.append(row); });
        history.append(button("Export redacted local history", () => safeDownload("worldlens-site-history.json", JSON.stringify({ version: 1, omitted: ["passwords", "TOTP secrets", "QR payloads", "file metadata"], entries: store.snapshot.history }, null, 2))), historyList); root.append(history);

        installUniversalLockWizards(root, (origin, name) => {
            const matching = [...target.options].find((option) => option.value === name);
            if (matching === undefined) { const option = document.createElement("option"); option.value = name; option.textContent = name; target.append(option); }
            target.value = name;
            scope.value = "element";
            locks.scrollIntoView({ behavior: "smooth", block: "start" });
            credential.focus();
            origin.dataset.lockWizardOrigin = name;
        });

        if (version !== renderVersion) return;
    };
    const unsubscribe = store.subscribe(() => {
        // Avoid rebuilding while a field owns focus. Mutating controls already update their own
        // visible value; the next explicit action or language change rebuilds the full page.
    });
    options.i18n.subscribe(render);
    render();
    root.dataset.cleanup = "site-contracts-local-only";
    void unsubscribe;
    return root;
}

function installUniversalLockWizards(root: HTMLElement, openWizard: (origin: HTMLElement, name: string) => void): void {
    const targets = [root, ...root.querySelectorAll<HTMLElement>("*")];
    for (const target of targets) {
        if (target.dataset.contractLockWizard === "true") continue;
        target.dataset.contractLockWizard = "true";
        const name = target.getAttribute("aria-label") ?? target.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "unnamed element";
        const open = (event: Event): void => {
            event.preventDefault();
            const menu = document.createElement("div");
            menu.className = "mb-contract-lock-menu";
            menu.setAttribute("role", "menu");
            menu.tabIndex = -1;
            const filter = document.createElement("input");
            filter.type = "search";
            filter.className = "md-field__input";
            filter.placeholder = "Filter lock actions";
            filter.setAttribute("aria-label", "Filter lock actions");
            const action = button(`Lock this element: ${name}`, () => { menu.remove(); openWizard(target, name); });
            action.setAttribute("role", "menuitem");
            filter.addEventListener("input", () => { action.hidden = !matchesContractQuery(action.textContent ?? "", filter.value, filter.dataset.regexPattern ?? "", filter.dataset.regexFlags ?? "i"); });
            regexBuilder(menu, filter, "lock actions");
            menu.append(filter, action);
            document.body.append(menu);
            if (event instanceof MouseEvent) { menu.style.left = `${Math.min(event.clientX, window.innerWidth - 300)}px`; menu.style.top = `${Math.min(event.clientY, window.innerHeight - 80)}px`; }
            action.focus();
            const dismiss = (next: Event): void => { if (!menu.contains(next.target as Node)) { menu.remove(); document.removeEventListener("pointerdown", dismiss); target.focus(); } };
            document.addEventListener("pointerdown", dismiss);
        };
        target.addEventListener("contextmenu", open);
        target.addEventListener("keydown", (event) => { if (event instanceof KeyboardEvent && event.shiftKey && event.key === "F10") open(event); });
    }
}
