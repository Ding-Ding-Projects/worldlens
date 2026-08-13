/**
 * Validates a candidate custom logo file by its actual bytes, never by its filename
 * extension or the browser's own MIME-sniffed `File.type`.
 *
 * A file picker's `accept` attribute and a `File.type` string are both just labels the
 * operating system or the browser attached; neither is proof of what the bytes actually
 * are. So every check here reads the magic numbers and the format's own header fields
 * straight out of the buffer, the same way `vocabularySchema.ts` parses and bounds a
 * candidate vocabulary file before anything from it is trusted. A file that fails any one
 * check is rejected whole - there is no such thing as half a logo, so "apply the parts that
 * validated" is never a path this module offers.
 *
 * Four bounds are enforced, each independently, because a crafted file can pass one and
 * fail another: the raw byte count (before anything is parsed at all), the decoded pixel
 * count (width times height, which a tiny file can still declare to be enormous - the
 * decompression-bomb shape), either dimension on its own (a single absurd axis can pass a
 * pixel-count check that multiplies it against something small), and the frame count (an
 * animated file smuggled in under a still-image format).
 */

export const LOGO_MAX_INPUT_BYTES = 2_097_152; // 2 MiB, generous for a small app mark
export const LOGO_MAX_DIMENSION = 4096; // pixels, either axis
export const LOGO_MAX_DECODED_PIXELS = LOGO_MAX_DIMENSION * LOGO_MAX_DIMENSION;
export const LOGO_MAX_FRAME_COUNT = 1; // a still application mark, never an animation

export type LogoImageFormat = "png" | "jpeg" | "webp" | "svg";

export type LogoRejectionReason =
    | "too-large"
    | "unsupported-format"
    | "malformed"
    | "dimension-too-large"
    | "too-many-pixels"
    | "animated-not-supported"
    | "svg-unsafe-content"
    | "read-failed";

export interface LogoValidationFailure {
    readonly ok: false;
    readonly reason: LogoRejectionReason;
}

export interface LogoValidatedImage {
    readonly format: LogoImageFormat;
    /** `null` for SVG: a vector mark has no fixed raster size to report. */
    readonly width: number | null;
    readonly height: number | null;
    readonly frameCount: number;
}

export interface LogoValidationSuccess {
    readonly ok: true;
    readonly image: LogoValidatedImage;
}

export type LogoValidationResult = LogoValidationFailure | LogoValidationSuccess;

function fail(reason: LogoRejectionReason): LogoValidationFailure {
    return { ok: false, reason };
}

/** True when `bytes` starts with `signature` at `offset`. */
function matchesAt(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
    if (offset + signature.length > bytes.length) return false;
    for (let index = 0; index < signature.length; index += 1) {
        if (bytes[offset + index] !== signature[index]) return false;
    }
    return true;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
    return (
        ((bytes[offset] ?? 0) << 24) |
        ((bytes[offset + 1] ?? 0) << 16) |
        ((bytes[offset + 2] ?? 0) << 8) |
        (bytes[offset + 3] ?? 0)
    );
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
    return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/**
 * Walks a PNG's chunk stream to find its `IHDR` (always first, and mandatory) and any
 * `acTL` (present only on an animated PNG, and naming the frame count directly). Bounded
 * by `bytes.length` on every step, so a corrupt or truncated chunk length can only ever
 * shorten the walk, never loop or read past the buffer.
 */
function parsePng(bytes: Uint8Array): LogoValidatedImage | null {
    if (!matchesAt(bytes, 0, PNG_SIGNATURE)) return null;

    let offset = 8;
    let width: number | null = null;
    let height: number | null = null;
    let frameCount = 1;

    while (offset + 8 <= bytes.length) {
        const length = readUint32BE(bytes, offset);
        const type = String.fromCharCode(
            bytes[offset + 4] ?? 0,
            bytes[offset + 5] ?? 0,
            bytes[offset + 6] ?? 0,
            bytes[offset + 7] ?? 0,
        );
        const dataStart = offset + 8;

        if (type === "IHDR") {
            if (dataStart + 8 > bytes.length) return null;
            width = readUint32BE(bytes, dataStart);
            height = readUint32BE(bytes, dataStart + 4);
        } else if (type === "acTL") {
            // acTL's own num_frames field, the first four bytes of its data.
            if (dataStart + 4 <= bytes.length) frameCount = readUint32BE(bytes, dataStart);
        } else if (type === "IEND") {
            break;
        }

        // length + 4-byte type + 4-byte length + 4-byte CRC, guarded against overflow so a
        // corrupt length cannot push `offset` backwards and spin the loop forever.
        const next = dataStart + length + 4;
        if (next <= offset) return null;
        offset = next;
    }

    if (width === null || height === null || width <= 0 || height <= 0) return null;
    return { format: "png", width, height, frameCount };
}

/** Scans JPEG markers for the first Start-Of-Frame, which carries the real pixel size. */
function parseJpeg(bytes: Uint8Array): LogoValidatedImage | null {
    if (!matchesAt(bytes, 0, JPEG_SIGNATURE)) return null;

    let offset = 2;
    while (offset + 4 <= bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = bytes[offset + 1] ?? 0;
        // Markers with no payload: standalone or restart markers carry no length field.
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }
        const segmentLength = readUint16BE(bytes, offset + 2);
        const isStartOfFrame =
            marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isStartOfFrame) {
            const dataStart = offset + 4;
            if (dataStart + 5 > bytes.length) return null;
            const height = readUint16BE(bytes, dataStart + 1);
            const width = readUint16BE(bytes, dataStart + 3);
            if (width <= 0 || height <= 0) return null;
            // A JPEG bitstream is always a single still frame; there is no JPEG animation
            // format this application accepts, so the frame count is fixed at one.
            return { format: "jpeg", width, height, frameCount: 1 };
        }
        const next = offset + 2 + segmentLength;
        if (next <= offset) return null;
        offset = next;
    }
    return null;
}

/**
 * Parses a RIFF/WebP container. Simple (non-extended) WebP has no animation format at all,
 * so only the `VP8X` + `ANIM` shape can be animated; frame count there is the number of
 * `ANMF` sub-chunks actually present, counted directly rather than trusted from a header
 * field a crafted file could lie about.
 */
function parseWebp(bytes: Uint8Array): LogoValidatedImage | null {
    if (!matchesAt(bytes, 0, [0x52, 0x49, 0x46, 0x46])) return null; // "RIFF"
    if (!matchesAt(bytes, 8, [0x57, 0x45, 0x42, 0x50])) return null; // "WEBP"

    let width: number | null = null;
    let height: number | null = null;
    let isAnimated = false;
    let frameCount = 1;

    let offset = 12;
    while (offset + 8 <= bytes.length) {
        const fourCc = String.fromCharCode(
            bytes[offset] ?? 0,
            bytes[offset + 1] ?? 0,
            bytes[offset + 2] ?? 0,
            bytes[offset + 3] ?? 0,
        );
        const chunkLength = (bytes[offset + 4] ?? 0) | ((bytes[offset + 5] ?? 0) << 8) |
            ((bytes[offset + 6] ?? 0) << 16) | ((bytes[offset + 7] ?? 0) << 24);
        const dataStart = offset + 8;

        if (fourCc === "VP8X") {
            if (dataStart + 10 > bytes.length) return null;
            const flags = bytes[dataStart] ?? 0;
            isAnimated = (flags & 0x02) !== 0;
            // 24-bit width-minus-one / height-minus-one, little-endian, at bytes 4..6 and 7..9.
            const canvasWidth =
                ((bytes[dataStart + 4] ?? 0) | ((bytes[dataStart + 5] ?? 0) << 8) |
                    ((bytes[dataStart + 6] ?? 0) << 16)) + 1;
            const canvasHeight =
                ((bytes[dataStart + 7] ?? 0) | ((bytes[dataStart + 8] ?? 0) << 8) |
                    ((bytes[dataStart + 9] ?? 0) << 16)) + 1;
            width = canvasWidth;
            height = canvasHeight;
        } else if (fourCc === "VP8L" && width === null) {
            // 14-bit width-minus-one / height-minus-one packed across 4 bytes after a 1-byte
            // signature (0x2f).
            if (dataStart + 5 > bytes.length) return null;
            const b0 = bytes[dataStart + 1] ?? 0;
            const b1 = bytes[dataStart + 2] ?? 0;
            const b2 = bytes[dataStart + 3] ?? 0;
            const b3 = bytes[dataStart + 4] ?? 0;
            width = (b0 | ((b1 & 0x3f) << 8)) + 1;
            height = ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) + 1;
        } else if (fourCc === "VP8 " && width === null) {
            // The lossy bitstream's own 14-bit width/height sit six bytes into its frame
            // tag, little-endian, each masked to 14 bits.
            if (dataStart + 10 > bytes.length) return null;
            const widthField =
                ((bytes[dataStart + 6] ?? 0) | ((bytes[dataStart + 7] ?? 0) << 8)) & 0x3fff;
            const heightField =
                ((bytes[dataStart + 8] ?? 0) | ((bytes[dataStart + 9] ?? 0) << 8)) & 0x3fff;
            width = widthField;
            height = heightField;
        } else if (fourCc === "ANMF") {
            frameCount += 1;
        }

        const padded = chunkLength + (chunkLength % 2);
        const next = dataStart + padded;
        if (next <= offset) return null;
        offset = next;
    }

    if (width === null || height === null || width <= 0 || height <= 0) return null;
    // `frameCount` starts at 1 and gains one per real `ANMF` chunk found, so a
    // non-animated file that never declared `VP8X`'s animation flag still reports 1 - the
    // flag is only used to decide whether *finding* zero `ANMF` chunks is itself suspicious.
    if (isAnimated && frameCount < 2) return null;
    return { format: "webp", width, height, frameCount };
}

const SVG_UNSAFE_PATTERN = /<\s*script\b|on[a-z]+\s*=|javascript\s*:/i;

/**
 * A vector mark has no raster dimensions to bound, so its only checks are the byte-size
 * bound already applied by the caller and a small denylist against the shapes that would
 * turn "display an icon" into "run script in this application's own renderer". This is
 * deliberately narrow: it is not a general SVG sanitizer, only the gate that keeps a
 * logo upload from being a script-injection vector.
 */
type SvgParseResult =
    | { readonly kind: "not-svg" }
    | { readonly kind: "unsafe" }
    | { readonly kind: "ok"; readonly image: LogoValidatedImage };

function parseSvg(bytes: Uint8Array): SvgParseResult {
    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return { kind: "not-svg" };
    }
    const trimmed = text.replace(/^﻿/, "").trimStart();
    const looksLikeSvg = /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(trimmed);
    if (!looksLikeSvg) return { kind: "not-svg" };
    if (SVG_UNSAFE_PATTERN.test(text)) return { kind: "unsafe" };
    return { kind: "ok", image: { format: "svg", width: null, height: null, frameCount: 1 } };
}

/**
 * Validates the complete byte payload of a candidate logo file before any pixel from it is
 * displayed, converted, or cached. Detection is by magic number and header field only -
 * the caller's `File.name` and `File.type` are never consulted here.
 */
export function validateLogoBytes(bytes: Uint8Array): LogoValidationResult {
    if (bytes.length === 0) return fail("malformed");
    if (bytes.length > LOGO_MAX_INPUT_BYTES) return fail("too-large");

    let image: LogoValidatedImage | null;
    if (matchesAt(bytes, 0, PNG_SIGNATURE)) {
        image = parsePng(bytes);
    } else if (matchesAt(bytes, 0, JPEG_SIGNATURE)) {
        image = parseJpeg(bytes);
    } else if (matchesAt(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matchesAt(bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
        image = parseWebp(bytes);
    } else {
        const svg = parseSvg(bytes);
        if (svg.kind === "unsafe") return fail("svg-unsafe-content");
        if (svg.kind === "not-svg") {
            // Bytes matched none of the three raster signatures and did not parse as a
            // plain `<svg>` document either, so this is simply not one of the four
            // formats this application accepts.
            return fail("unsupported-format");
        }
        image = svg.image;
    }

    if (image === null) return fail("malformed");

    if (image.frameCount > LOGO_MAX_FRAME_COUNT) return fail("animated-not-supported");

    if (image.width !== null && image.height !== null) {
        if (image.width > LOGO_MAX_DIMENSION || image.height > LOGO_MAX_DIMENSION) {
            return fail("dimension-too-large");
        }
        if (image.width * image.height > LOGO_MAX_DECODED_PIXELS) return fail("too-many-pixels");
    }

    return { ok: true, image };
}

