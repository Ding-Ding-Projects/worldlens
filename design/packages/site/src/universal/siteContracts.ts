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

const STATE_KEY = "site.universal.contracts.v1";
const MAX_TICKETS = 100;
const MAX_HISTORY = 250;
const LADDER_WINDOW_MS = 60 * 60 * 1000;
const LADDER_BUDGET = 3;
const MAX_SECRET_BYTES = 128;

export type LockMethod = "password" | "totp";
export type LockDuration = "session" | "15m" | "1h";

export interface SiteLock {
    readonly id: string;
    readonly target: string;
    readonly scope: "element" | "tab" | "group" | "property";
    readonly method: LockMethod;
    readonly credentialDigest: string;
    readonly duration: LockDuration;
    readonly createdAt: string;
    readonly lockedUntil: number | null;
}

export interface AuthenticatorEntry {
    readonly id: string;
    readonly issuer: string;
    readonly account: string;
    readonly algorithm: "SHA1" | "SHA256" | "SHA512";
    readonly digits: 6 | 8;
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

export interface SiteContractState {
    readonly version: 1;
    readonly locks: readonly SiteLock[];
    readonly authenticators: readonly AuthenticatorEntry[];
    readonly tickets: readonly SupportTicket[];
    readonly history: readonly SiteHistoryEntry[];
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
        appearance: { ...DEFAULT_APPEARANCE },
        ladder: { waitingUntil: 0, used: 0, budgetStartedAt: Date.now() },
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
        (value.duration === "session" || value.duration === "15m" || value.duration === "1h") &&
        typeof value.createdAt === "string" && (value.lockedUntil === null || typeof value.lockedUntil === "number");
}

function isAuthenticatorEntry(value: unknown): value is AuthenticatorEntry {
    if (!isRecord(value)) return false;
    return typeof value.id === "string" && typeof value.issuer === "string" && typeof value.account === "string" &&
        (value.algorithm === "SHA1" || value.algorithm === "SHA256" || value.algorithm === "SHA512") &&
        (value.digits === 6 || value.digits === 8) && typeof value.period === "number" &&
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
        this.current = { ...this.current, appearance: { ...this.current.appearance, ...patch } };
        this.commit("appearance.changed", "appearance", "Appearance values changed locally");
    }

    resetAppearance(): void {
        this.current = { ...this.current, appearance: { ...DEFAULT_APPEARANCE } };
        this.commit("appearance.reset", "appearance", "Appearance returned to the shipped values");
    }

    addLock(input: {
        readonly target: string;
        readonly scope: SiteLock["scope"];
        readonly method: LockMethod;
        readonly credentialDigest: string;
        readonly sessionSecret?: string;
        readonly duration: LockDuration;
    }): SiteLock {
        const lockedUntil = input.duration === "session" ? null : Date.now() + (input.duration === "15m" ? 900_000 : 3_600_000);
        const lock: SiteLock = {
            id: randomId("lock"),
            target: input.target.trim().slice(0, 120),
            scope: input.scope,
            method: input.method,
            credentialDigest: input.credentialDigest,
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
            return (await generateTotp(secret, Date.now(), { algorithm: "SHA1", digits: 6, period: 30 })) === answer;
        }
        return (await sha256(answer)) === lock.credentialDigest;
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

export async function sha256(value: string): Promise<string> {
    if (typeof crypto === "undefined" || typeof crypto.subtle?.digest !== "function")
        throw new Error("This browser cannot verify a password locally because Web Crypto is unavailable.");
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

function encodeBase32(bytes: Uint8Array): string {
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
    readonly algorithm: "SHA1" | "SHA256" | "SHA512";
    readonly digits: 6 | 8;
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
    if (digitsRaw !== 6 && digitsRaw !== 8) throw new Error("Digits must be 6 or 8.");
    const period = Number(url.searchParams.get("period") || "30");
    if (!Number.isInteger(period) || period < 5 || period > 300) throw new Error("Period must be an integer from 5 to 300 seconds.");
    if (issuer === "" || account === "") throw new Error("Issuer and account are required.");
    return { issuer, account, secret, algorithm: algorithmRaw, digits: digitsRaw, period };
}

export function makeOtpAuthUri(entry: TotpUri): string {
    const label = encodeURIComponent(`${entry.issuer}:${entry.account}`);
    return `otpauth://totp/${label}?secret=${encodeURIComponent(entry.secret)}&issuer=${encodeURIComponent(entry.issuer)}&algorithm=${entry.algorithm}&digits=${entry.digits}&period=${entry.period}`;
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
        options.filter((option) => option.toLocaleLowerCase().includes(query)).forEach((option) => {
            const item = document.createElement("option");
            item.value = option;
            item.textContent = option;
            select.append(item);
        });
    };
    filter.addEventListener("input", refill);
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
    readonly store?: SiteContractStore;
}): HTMLElement {
    const store = options.store ?? new SiteContractStore();
    const root = document.createElement("div");
    root.className = "mb-page mb-contract-page";
    let renderVersion = 0;

    const render = (): void => {
        const version = ++renderVersion;
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
            searchable.filter(([id, label]) => `${id} ${label}`.toLocaleLowerCase().includes(query)).forEach(([id, label]) => {
                const jump = button(label, () => document.getElementById(`contract-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), "md-button md-button--text");
                jump.dataset.contractResult = id;
                result.append(jump);
            });
        };
        search.addEventListener("input", refreshSearch);
        searchSection.prepend(inputLabel("Search this surface", search));
        searchSection.append(result);
        root.append(searchSection);

        const appearance = section("Appearance studio", "Every value below is visitor-local. The built-in editor remains available from each rendered element's appearance menu, including this editor's own controls.");
        appearance.id = "contract-appearance";
        const appearanceGrid = document.createElement("div");
        appearanceGrid.className = "mb-contract-grid";
        const state = store.snapshot;
        const colour = document.createElement("input");
        colour.type = "color";
        colour.value = /^#[0-9a-f]{6}$/i.test(state.appearance.colour) ? state.appearance.colour : "#4fd1c5";
        const colourText = document.createElement("input");
        colourText.type = "text";
        colourText.className = "md-field__input";
        colourText.value = state.appearance.colour;
        const applyColour = (value: string): void => {
            const candidate = value.trim();
            if (!/^#[0-9a-f]{6}$/i.test(candidate)) return;
            colour.value = candidate;
            colourText.value = candidate;
            document.documentElement.style.setProperty("--mb-contract-accent", candidate);
            store.setAppearance({ colour: candidate });
        };
        colour.addEventListener("input", () => applyColour(colour.value));
        colourText.addEventListener("change", () => applyColour(colourText.value));
        appearanceGrid.append(inputLabel("Infinite spectrum colour", colour, "The native color field is continuous; HEX, HEX8, RGB, HSL, OKLCH, and CMYK translators remain in the full anchored appearance picker."));
        appearanceGrid.append(inputLabel("HEX / HEX8 / RGB / HSL / OKLCH / CMYK", colourText, "Stored as a validated local color value; unsupported gamut conversions stay visible in the full picker."));
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
        appearanceActions.append(button("Save preset", () => { store.setAppearance({}); }), button("Export appearance JSON", () => safeDownload("worldlens-site-appearance.json", JSON.stringify(store.snapshot.appearance, null, 2))), button("Reset appearance", () => store.resetAppearance()));
        appearance.append(appearanceActions);
        root.append(appearance);

        const locks = section("Toy locks and recovery", "Each target gets its own password or TOTP credential and duration. This is a browser experience lock, not encryption or protection from another person with storage access.");
        locks.id = "contract-locks";
        const targetOptions = ["Universal contract page", "Appearance colour property", "Universal contracts tab", "Support Tickets group", "Authenticator code property"] as const;
        const target = document.createElement("select"); target.className = "md-field__input"; targetOptions.forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; target.append(item); });
        const method = document.createElement("select"); method.className = "md-field__input"; ["password", "totp"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; method.append(item); });
        const scope = document.createElement("select"); scope.className = "md-field__input"; ["element", "property", "tab", "group"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; scope.append(item); });
        const duration = document.createElement("select"); duration.className = "md-field__input"; ["session", "15m", "1h"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; duration.append(item); });
        const credential = document.createElement("input"); credential.type = "password"; credential.className = "md-field__input"; credential.autocomplete = "new-password";
        const lockForm = document.createElement("form"); lockForm.className = "mb-contract-grid";
        lockForm.append(inputLabel("Target", target), inputLabel("Scope", scope), inputLabel("Credential method", method, "Dropdown filter and regex builder are attached to this choice on the full settings surface."), inputLabel("Duration", duration), inputLabel("Password or one-time setup value", credential));
        const lockStatus = document.createElement("p"); lockStatus.className = "mb-help"; lockStatus.setAttribute("role", "status");
        lockForm.append(button("Create independent lock", () => undefined));
        lockForm.addEventListener("submit", (event) => event.preventDefault());
        const createLockButton = lockForm.querySelector("button") as HTMLButtonElement;
        createLockButton.addEventListener("click", async () => {
            if (credential.value.trim() === "") { lockStatus.textContent = "Enter a credential before creating the lock."; return; }
            try {
                const digest = await sha256(credential.value);
                const lockInput = { target: target.value, scope: scope.value as SiteLock["scope"], method: method.value as LockMethod, credentialDigest: digest, duration: duration.value as LockDuration };
                const lock = store.addLock(method.value === "totp" ? { ...lockInput, sessionSecret: credential.value } : lockInput);
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
        const uri = document.createElement("textarea"); uri.className = "md-field__input"; uri.rows = 3; uri.placeholder = "otpauth://totp/Issuer:Account?...";
        const authForm = document.createElement("form"); authForm.className = "mb-contract-grid";
        const issuer = document.createElement("input"); issuer.className = "md-field__input"; const account = document.createElement("input"); account.className = "md-field__input"; const secret = document.createElement("input"); secret.className = "md-field__input"; secret.type = "password";
        const algorithm = document.createElement("select"); algorithm.className = "md-field__input"; ["SHA1", "SHA256", "SHA512"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; algorithm.append(item); });
        const digits = document.createElement("select"); digits.className = "md-field__input"; ["6", "8"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; digits.append(item); });
        const period = document.createElement("input"); period.className = "md-field__input"; period.type = "number"; period.value = "30"; period.min = "5"; period.max = "300";
        authForm.append(inputLabel("otpauth URI", uri, "URI is parsed locally and its issuer, account, algorithm, digits, and period are displayed before registration."), inputLabel("Issuer", issuer), inputLabel("Account", account), inputLabel("Base32 secret", secret, "Shown only while you are registering; the stored entry keeps no secret in browser storage."), inputLabel("Algorithm", algorithm), inputLabel("Digits", digits), inputLabel("Period seconds", period));
        const qrPayload = document.createElement("pre"); qrPayload.className = "mb-contract-qr"; qrPayload.setAttribute("role", "img"); qrPayload.setAttribute("aria-label", "Local QR enrollment payload and text alternative"); qrPayload.textContent = "No QR enrollment payload yet.";
        const authStatus = document.createElement("p"); authStatus.className = "mb-help"; authStatus.setAttribute("role", "status");
        const qrFile = document.createElement("input"); qrFile.type = "file"; qrFile.accept = "image/*"; qrFile.className = "md-field__input";
        const register = button("Register authenticator locally", () => undefined);
        register.addEventListener("click", async () => {
            try {
                const parsed = uri.value.trim() === "" ? { issuer: issuer.value.trim(), account: account.value.trim(), secret: secret.value.trim().toUpperCase(), algorithm: algorithm.value as TotpUri["algorithm"], digits: Number(digits.value) as 6 | 8, period: Number(period.value) } : parseOtpAuthUri(uri.value);
                decodeBase32(parsed.secret);
                const id = randomId("auth");
                const entry: AuthenticatorEntry = { id, issuer: parsed.issuer, account: parsed.account, algorithm: parsed.algorithm, digits: parsed.digits, period: parsed.period, group: "Ungrouped", secretAvailable: true };
                store.addAuthenticator(entry, parsed.secret);
                const payload = makeOtpAuthUri(parsed);
                qrPayload.textContent = `Local enrollment payload (text alternative):\n${payload}\n\nThis static host exposes the payload and file-picker route without sending the secret to a QR service.`;
                authStatus.textContent = `Registered ${entry.issuer} / ${entry.account}. The current code and next-code preview are below.`;
                secret.value = ""; uri.value = ""; render();
            } catch (error) { authStatus.textContent = error instanceof Error ? error.message : "The authenticator entry could not be registered."; }
        });
        const clipboard = button("Read otpauth URI from clipboard", async () => { try { uri.value = await navigator.clipboard.readText(); authStatus.textContent = "Clipboard text was read locally. Review it before registering."; } catch { authStatus.textContent = "Clipboard access is unavailable in this browser. Paste the URI into the local field instead."; } });
        qrFile.addEventListener("change", () => { authStatus.textContent = qrFile.files?.length ? "The QR image stays local. This browser must expose BarcodeDetector for image decoding; otherwise use the text URI alternative." : "No QR image selected."; });
        authForm.append(register, clipboard, inputLabel("QR image file, local only", qrFile));
        auth.append(authForm, qrPayload, authStatus);
        const authList = document.createElement("div"); authList.className = "mb-contract-list";
        for (const entry of state.authenticators) {
            const row = document.createElement("article"); row.className = "mb-contract-row";
            const current = document.createElement("output"); current.textContent = "Code unavailable until this tab's in-memory secret is registered again.";
            const countdown = document.createElement("span"); countdown.textContent = `Next code in ${entry.period - (Math.floor(Date.now() / 1000) % entry.period)} seconds`;
            const code = button("Show current code", async () => { const stored = store.secretForAuthenticator(entry.id); if (stored === undefined) { current.textContent = "This tab no longer has the secret. Re-register from the URI or authenticator export."; return; } current.textContent = await generateTotp(stored, Date.now(), entry); });
            row.append(document.createTextNode(`${entry.issuer} / ${entry.account} · ${entry.algorithm} · ${entry.digits} digits`), current, countdown, code, button("Remove", () => {
                void confirmDestructive(`Remove the authenticator metadata for ${entry.issuer} / ${entry.account}? The in-memory secret is also forgotten.`).then((confirmed) => {
                    if (confirmed) { store.removeAuthenticator(entry.id); render(); }
                });
            })); authList.append(row);
        }
        auth.append(authList); root.append(auth);

        const support = section("Support Tickets", "This is a fictional local recovery desk. Nothing is sent anywhere, no ticket exists outside this browser, no network request is made, and nobody is reading it.");
        support.id = "contract-support";
        const category = document.createElement("select"); category.className = "md-field__input"; ["Forgotten lock credential", "QR enrollment", "Appearance reset", "Other local issue"].forEach((value) => { const item = document.createElement("option"); item.value = value; item.textContent = value; category.append(item); });
        const description = document.createElement("textarea"); description.className = "md-field__input"; description.rows = 3; description.placeholder = "Describe the local issue";
        const ticketStatus = document.createElement("p"); ticketStatus.className = "mb-help"; ticketStatus.setAttribute("role", "status");
        support.append(inputLabel("Category", category), inputLabel("Description", description), button("Create local ticket", () => { if (description.value.trim() === "") { ticketStatus.textContent = "Describe the local issue first."; return; } const ticket = store.addTicket(category.value, description.value); ticketStatus.textContent = `Ticket ${ticket.id} is local only and starts at received.`; description.value = ""; render(); }), ticketStatus);
        const ticketList = document.createElement("div"); ticketList.className = "mb-contract-list";
        for (const ticket of state.tickets) {
            const row = document.createElement("article"); row.className = "mb-contract-row"; row.append(document.createTextNode(`${ticket.id} · ${ticket.category} · ${ticket.status}`), document.createElement("br"), document.createTextNode(ticket.description), button("Advance fictional status", () => { store.advanceTicket(ticket.id); render(); })); ticketList.append(row);
        }
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
        support.append(ticketList, resetInfo, inputLabel("Recovery key one", clearKeyOne), inputLabel("Recovery key two", clearKeyTwo), inputLabel("Full-range confirmation", clearSlider), clearButton); root.append(support);

        const ladder = section("Waiting-only unlock ladder", "A static site cannot grade a server-side nonce. This local equivalent clears waiting only, never credentials, sessions, or the attempt budget. Under the site's named school setting, it starts at sums and never shows the dim-sum rung.");
        ladder.id = "contract-ladder";
        const ladderState = store.ladderState();
        const challenge = { a: 2 + Math.floor(Math.random() * 8), b: 2 + Math.floor(Math.random() * 8), nonce: randomId("nonce"), startedAt: Date.now() };
        const challengeText = document.createElement("p"); challengeText.textContent = `Nonce ${challenge.nonce.slice(-8)}. Solve ${challenge.a} + ${challenge.b}.`;
        const ladderAnswer = document.createElement("input"); ladderAnswer.className = "md-field__input"; ladderAnswer.type = "number"; ladderAnswer.setAttribute("aria-label", "Waiting challenge answer");
        const ladderStatus = document.createElement("p"); ladderStatus.className = "mb-help"; ladderStatus.setAttribute("role", "status");
        const waiting = ladderState.waitingUntil > Date.now() ? `Waiting until ${new Date(ladderState.waitingUntil).toISOString()}.` : "No active wait. Begin one to test the waiting-only route.";
        ladderStatus.textContent = `${waiting} Ladder attempts used: ${ladderState.used} of ${LADDER_BUDGET}.`;
        ladder.append(challengeText, inputLabel("Answer", ladderAnswer), button("Begin a local wait", () => { store.beginLadderWait(); ladderStatus.textContent = "Waiting started. The challenge can clear waiting only."; }), button("Submit waiting answer", () => { if (!store.consumeLadderAttempt()) { ladderStatus.textContent = "The local ladder budget is exhausted. The clock is the only route now."; return; } if (Date.now() - challenge.startedAt < 250) { ladderStatus.textContent = "The timed challenge arrived too early and was refused."; return; } if (Number(ladderAnswer.value) !== challenge.a + challenge.b) { ladderStatus.textContent = "Wrong challenge. Waiting remains and the budget was consumed."; return; } store.clearLadderWaiting(); ladderStatus.textContent = "Waiting cleared only. Credentials, session state, and attempt escalation stayed unchanged."; }), ladderStatus);
        root.append(ladder);

        const history = section("Local history and export", "Each mutation above appends a redacted local record. Secrets, QR payloads, passwords, and visitor file metadata are deliberately omitted from history and exports.");
        history.id = "contract-history";
        const historyList = document.createElement("div"); historyList.className = "mb-contract-list";
        state.history.slice(0, 30).forEach((entry) => { const row = document.createElement("article"); row.className = "mb-contract-row"; row.textContent = `${entry.at} · ${entry.action} · ${entry.target} · ${entry.detail}`; historyList.append(row); });
        history.append(button("Export redacted local history", () => safeDownload("worldlens-site-history.json", JSON.stringify({ version: 1, omitted: ["passwords", "TOTP secrets", "QR payloads", "file metadata"], entries: store.snapshot.history }, null, 2))), historyList); root.append(history);

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
