/**
 * Where the chosen app-logo presentation is kept: which preset or custom mark is active,
 * and how it is cropped, fitted, and backed.
 *
 * Local storage only, beside `markerStudioStore.ts` and `vocabularyStore.ts` for the same
 * reason both of those live there and nowhere else: this is a private display choice about
 * *this* installation, and sending it anywhere would be a surprise nobody asked for.
 * Nothing in this module makes a network request, and a custom mark's bytes never leave
 * `localStorage` on this machine.
 *
 * ## Presentation only, never identity
 *
 * This store answers exactly one question: what image does `AppTitleBar.vue`,
 * `InfoPage.vue`, and any other chrome that renders "the app's mark" draw right now. It
 * has no way to reach, and must never grow a way to reach, the application's package
 * identity, its executable filename, its installer identity, its update feed, or its data
 * directory - none of those are settings a picture can carry, and nothing here is wired to
 * any of them. Changing the picture changes the picture.
 *
 * ## A read that fails is not a silently reset logo
 *
 * `markerStudioStore.ts`'s own doc comment makes the point this store follows exactly:
 * answering an unreadable store by quietly falling back to the shipped mark would look
 * identical to a deliberate reset, and there would be no way to tell "you chose this" from
 * "your choice could not be read back". So an unreadable cache reports a `failure` string,
 * the store refuses to persist while that failure stands (so a doomed write cannot turn
 * "could not be read" into "was silently overwritten"), and the row surfaces the failure in
 * words rather than rendering as if nothing had ever been chosen.
 */

import { reactive, watch } from "vue";
import { DEFAULT_LOGO_PRESET_ID, type LogoPresetId, LOGO_PRESET_IDS } from "./logoPresets.js";
import type { LogoImageFormat } from "./logoValidation.js";

/** Exported so a test can point a stand-in `localStorage` at the same key this store writes. */
export const LOGO_STORAGE_KEY = "worldlens-app-logo";

export type LogoFit = "fill" | "contain";
export type LogoBackground = "transparent" | "solid";

export interface LogoCrop {
    /** Each inset is a percentage (0-40) trimmed from that edge before the mark is drawn. */
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
}

export interface LogoFocalPoint {
    /** Percentages (0-100) locating the point that stays centred under `contain`/`fill`. */
    readonly x: number;
    readonly y: number;
}

export interface LogoCustomMark {
    /** A `data:` URL: the whole point is that this never becomes a network request. */
    readonly dataUrl: string;
    readonly format: LogoImageFormat;
    readonly width: number | null;
    readonly height: number | null;
}

export interface LogoCreativeOwnership {
    readonly token: string;
    readonly revision: number;
}

export const DEFAULT_CROP: LogoCrop = { top: 0, right: 0, bottom: 0, left: 0 };
export const DEFAULT_FOCAL_POINT: LogoFocalPoint = { x: 50, y: 50 };
export const DEFAULT_FIT: LogoFit = "contain";
export const DEFAULT_BACKGROUND: LogoBackground = "transparent";
export const DEFAULT_BACKGROUND_COLOR = "#1e1e1e";

interface LogoState {
    /** `null` means the active mark is the preset named by `presetId`. */
    custom: LogoCustomMark | null;
    presetId: LogoPresetId;
    crop: LogoCrop;
    fit: LogoFit;
    focalPoint: LogoFocalPoint;
    background: LogoBackground;
    backgroundColor: string;
    ownership: LogoCreativeOwnership | null;
    /** Non-null when the stored presentation could not be read. Never confused with "unset". */
    failure: string | null;
}

function defaultState(): LogoState {
    return {
        custom: null,
        presetId: DEFAULT_LOGO_PRESET_ID,
        crop: DEFAULT_CROP,
        fit: DEFAULT_FIT,
        focalPoint: DEFAULT_FOCAL_POINT,
        background: DEFAULT_BACKGROUND,
        backgroundColor: DEFAULT_BACKGROUND_COLOR,
        ownership: null,
        failure: null,
    };
}

function isLogoPresetId(value: unknown): value is LogoPresetId {
    return typeof value === "string" && (LOGO_PRESET_IDS as readonly string[]).includes(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function readCrop(value: unknown): LogoCrop | null {
    if (value === null || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const { top, right, bottom, left } = record;
    if (![top, right, bottom, left].every(isFiniteNumber)) return null;
    return { top: top as number, right: right as number, bottom: bottom as number, left: left as number };
}

function readFocalPoint(value: unknown): LogoFocalPoint | null {
    if (value === null || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (!isFiniteNumber(record.x) || !isFiniteNumber(record.y)) return null;
    return { x: record.x, y: record.y };
}

function readCustom(value: unknown): LogoCustomMark | null | undefined {
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record.dataUrl !== "string" || record.dataUrl.length === 0) return undefined;
    if (
        record.format !== "png" &&
        record.format !== "jpeg" &&
        record.format !== "webp" &&
        record.format !== "svg"
    ) {
        return undefined;
    }
    const width = isFiniteNumber(record.width) ? record.width : null;
    const height = isFiniteNumber(record.height) ? record.height : null;
    return { dataUrl: record.dataUrl, format: record.format, width, height };
}

function readOwnership(value: unknown): LogoCreativeOwnership | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    return typeof record.token === "string" && Number.isInteger(record.revision) && (record.revision as number) >= 0
        ? { token: record.token, revision: record.revision as number }
        : null;
}

function load(): LogoState {
    try {
        const raw = localStorage.getItem(LOGO_STORAGE_KEY);
        if (raw === null) return defaultState();

        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const presetId = isLogoPresetId(parsed.presetId) ? parsed.presetId : DEFAULT_LOGO_PRESET_ID;
        const crop = readCrop(parsed.crop) ?? DEFAULT_CROP;
        const focalPoint = readFocalPoint(parsed.focalPoint) ?? DEFAULT_FOCAL_POINT;
        const fit = parsed.fit === "fill" || parsed.fit === "contain" ? parsed.fit : DEFAULT_FIT;
        const background =
            parsed.background === "transparent" || parsed.background === "solid"
                ? parsed.background
                : DEFAULT_BACKGROUND;
        const backgroundColor =
            typeof parsed.backgroundColor === "string" ? parsed.backgroundColor : DEFAULT_BACKGROUND_COLOR;
        const custom = readCustom(parsed.custom);
        const ownership = readOwnership(parsed.ownership);
        if (custom === undefined) {
            return {
                ...defaultState(),
                failure: "The saved logo presentation is not in a shape this build recognises.",
            };
        }

        return { custom, presetId, crop, fit, focalPoint, background, backgroundColor, ownership, failure: null };
    } catch (error) {
        return { ...defaultState(), failure: error instanceof Error ? error.message : String(error) };
    }
}

export const logoStore = reactive<LogoState>(load());

let persisting = true;

/** Stops persistence while a test rearranges the store, so one test cannot write another's. */
export function setLogoPersistence(on: boolean): void {
    persisting = on;
}

/** Re-reads storage. Used after a test replaces `localStorage`, and by a restore. */
export function reloadLogoStore(): void {
    const fresh = load();
    logoStore.custom = fresh.custom;
    logoStore.presetId = fresh.presetId;
    logoStore.crop = fresh.crop;
    logoStore.fit = fresh.fit;
    logoStore.focalPoint = fresh.focalPoint;
    logoStore.background = fresh.background;
    logoStore.backgroundColor = fresh.backgroundColor;
    logoStore.ownership = fresh.ownership;
    logoStore.failure = fresh.failure;
}

watch(
    () => ({
        custom: logoStore.custom,
        presetId: logoStore.presetId,
        crop: logoStore.crop,
        fit: logoStore.fit,
        focalPoint: logoStore.focalPoint,
        background: logoStore.background,
        backgroundColor: logoStore.backgroundColor,
        ownership: logoStore.ownership,
    }),
    (snapshot) => {
        // A store that failed to read must not write over what it could not read: that
        // would turn "I could not parse your logo choice" into "your logo choice is
        // gone", the same failure one step further along and no longer recoverable.
        if (!persisting || logoStore.failure !== null) return;
        try {
            localStorage.setItem(LOGO_STORAGE_KEY, JSON.stringify(snapshot));
        } catch {
            // A full or refused quota is not worth taking the row down for; the choice
            // stays correct in memory and the next successful write catches up.
        }
    },
    { deep: true },
);

/** Switches the active mark to one of the shipped presets, clearing any custom upload. */
export function selectLogoPreset(id: LogoPresetId): void {
    logoStore.presetId = id;
    logoStore.custom = null;
    logoStore.ownership = null;
}

/** Commits a validated, already-converted custom mark as the active logo. */
export function setCustomLogo(mark: LogoCustomMark): void {
    logoStore.custom = mark;
    logoStore.ownership = null;
}

export function setCreativeOwnedLogo(mark: LogoCustomMark, ownership: LogoCreativeOwnership): void {
    logoStore.custom = mark;
    logoStore.ownership = ownership;
}

export function clearCreativeLogoOwnership(): void {
    logoStore.ownership = null;
}

export function updateLogoCrop(crop: LogoCrop): void {
    logoStore.crop = crop;
    logoStore.ownership = null;
}

export function updateLogoFit(fit: LogoFit): void {
    logoStore.fit = fit;
    logoStore.ownership = null;
}

export function updateLogoFocalPoint(focalPoint: LogoFocalPoint): void {
    logoStore.focalPoint = focalPoint;
    logoStore.ownership = null;
}

export function updateLogoBackground(background: LogoBackground, color: string): void {
    logoStore.background = background;
    logoStore.backgroundColor = color;
    logoStore.ownership = null;
}

/**
 * Restores every choice to the shipped mark in one action: the default preset, no custom
 * upload, and every crop/fit/background choice back to its own shipped default. Reversible
 * in the same sense `clearVocabulary` is - the person still holds whatever file they
 * uploaded, and choosing it again reaches the exact same state - so this is a plain action
 * rather than one behind the destructive-action gate.
 */
export function resetLogoToShipped(): void {
    logoStore.custom = null;
    logoStore.presetId = DEFAULT_LOGO_PRESET_ID;
    logoStore.crop = DEFAULT_CROP;
    logoStore.fit = DEFAULT_FIT;
    logoStore.focalPoint = DEFAULT_FOCAL_POINT;
    logoStore.background = DEFAULT_BACKGROUND;
    logoStore.backgroundColor = DEFAULT_BACKGROUND_COLOR;
    logoStore.ownership = null;
    if (!persisting) return;
    try {
        localStorage.removeItem(LOGO_STORAGE_KEY);
    } catch {
        // Nothing to recover to; the in-memory state is already correct.
    }
}
