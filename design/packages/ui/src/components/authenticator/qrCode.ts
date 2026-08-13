/**
 * A dependency-free QR encoder, drawn entirely in-process.
 *
 * Registering an authenticator secret means showing a QR code, and a secret is exactly the
 * kind of value that must never leave this machine on its way to being drawn as one. A
 * third-party chart API or a CDN-hosted QR library would hand the secret to a stranger's
 * server for the sake of a picture; this module exists so that never has to be a trade-off.
 * No network call, no worker, nothing but arithmetic and a string builder.
 *
 * Implements QR Code Model 2 (ISO/IEC 18004), byte mode only - which is what an `otpauth://`
 * URI is - at error correction level M, auto-selecting the smallest version (1 through 40)
 * that the payload fits in. The output is an SVG string, because that is what every surface
 * in this application already knows how to render, theme, and keep crisp at any size.
 */

/* -------------------------------------------------------------------------- */
/* Error-correction-level M capacity tables (ISO/IEC 18004, Annex D)          */
/* -------------------------------------------------------------------------- */

/** Error-correction codewords per block, level M, indexed by version (1-40). */
const ECC_CODEWORDS_PER_BLOCK: readonly number[] = [
    0, // unused index 0
    10, 16, 26, 18, 24, 16, 18, 22, 22, 26,
    30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
    26, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];

/** Number of error-correction blocks, level M, indexed by version (1-40). */
const NUM_ERROR_CORRECTION_BLOCKS: readonly number[] = [
    0, // unused index 0
    1, 1, 1, 2, 2, 4, 4, 4, 5, 5,
    5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
    17, 17, 18, 20, 21, 23, 25, 26, 28, 29,
    31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

/** How many raw bit-modules a symbol of this version carries, before splitting into bytes. */
function numRawDataModules(version: number): number {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
        const numAlign = Math.floor(version / 7) + 2;
        result -= (25 * numAlign - 10) * numAlign - 55;
        if (version >= 7) result -= 36;
    }
    return result;
}

function numDataCodewords(version: number): number {
    const totalCodewords = Math.floor(numRawDataModules(version) / 8);
    const eccCodewords = ECC_CODEWORDS_PER_BLOCK[version]! * NUM_ERROR_CORRECTION_BLOCKS[version]!;
    return totalCodewords - eccCodewords;
}

/* -------------------------------------------------------------------------- */
/* Bit buffer                                                                 */
/* -------------------------------------------------------------------------- */

class BitBuffer {
    private readonly bits: number[] = [];

    get length(): number {
        return this.bits.length;
    }

    appendBits(value: number, length: number): void {
        for (let index = length - 1; index >= 0; index -= 1) {
            this.bits.push((value >>> index) & 1);
        }
    }

    appendBit(bit: number): void {
        this.bits.push(bit & 1);
    }

    toArray(): readonly number[] {
        return this.bits;
    }
}

/* -------------------------------------------------------------------------- */
/* Reed-Solomon error correction, GF(256) with primitive polynomial 0x11D     */
/* -------------------------------------------------------------------------- */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function buildGaloisTables(): void {
    let x = 1;
    for (let index = 0; index < 255; index += 1) {
        GF_EXP[index] = x;
        GF_LOG[x] = index;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d;
    }
    for (let index = 255; index < 512; index += 1) GF_EXP[index] = GF_EXP[index - 255]!;
})();

function gfMultiply(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

/** The generator polynomial for `degree` error-correction codewords, coefficients high-first. */
function generatorPolynomial(degree: number): number[] {
    let coefficients = [1];
    for (let index = 0; index < degree; index += 1) {
        const next = new Array<number>(coefficients.length + 1).fill(0);
        for (let position = 0; position < coefficients.length; position += 1) {
            next[position] = (next[position] ?? 0) ^ gfMultiply(coefficients[position]!, 1);
            next[position + 1] = (next[position + 1] ?? 0) ^ gfMultiply(coefficients[position]!, GF_EXP[index]!);
        }
        coefficients = next;
    }
    return coefficients;
}

/** The error-correction codewords for one block of data codewords. */
function reedSolomonRemainder(data: readonly number[], eccLength: number): number[] {
    const generator = generatorPolynomial(eccLength);
    const remainder = new Array<number>(eccLength).fill(0);
    for (const byte of data) {
        const factor = byte ^ remainder[0]!;
        remainder.shift();
        remainder.push(0);
        for (let index = 0; index < eccLength; index += 1) {
            remainder[index]! ^= gfMultiply(generator[index + 1]!, factor);
        }
    }
    return remainder;
}

/* -------------------------------------------------------------------------- */
/* BCH error correction for format and version information strips            */
/* -------------------------------------------------------------------------- */

const FORMAT_GENERATOR = 0x537;
const FORMAT_MASK = 0x5412;
const VERSION_GENERATOR = 0x1f25;

function bitLength(value: number): number {
    let length = 0;
    let remaining = value;
    while (remaining !== 0) {
        length += 1;
        remaining >>>= 1;
    }
    return length;
}

function bchEncode(data: number, generator: number): number {
    let remainder = data;
    const generatorBits = bitLength(generator);
    while (bitLength(remainder) >= generatorBits) {
        remainder ^= generator << (bitLength(remainder) - generatorBits);
    }
    return remainder;
}

/** The 15-bit format string for level M (indicator `00`) at this mask pattern. */
function formatInfoBits(maskPattern: number): number {
    const data = (0b00 << 3) | maskPattern;
    const remainder = bchEncode(data << 10, FORMAT_GENERATOR);
    return ((data << 10) | remainder) ^ FORMAT_MASK;
}

/** The 18-bit version string, only placed on symbols of version 7 and above. */
function versionInfoBits(version: number): number {
    const remainder = bchEncode(version << 12, VERSION_GENERATOR);
    return (version << 12) | remainder;
}

/* -------------------------------------------------------------------------- */
/* Data segment assembly                                                     */
/* -------------------------------------------------------------------------- */

/** Byte-mode character-count indicator length, which changes once at version 10. */
function charCountBits(version: number): number {
    return version < 10 ? 8 : 16;
}

export interface QrEncodeResult {
    readonly ok: true;
    readonly svg: string;
    readonly version: number;
    readonly moduleCount: number;
}

export interface QrEncodeFailure {
    readonly ok: false;
    readonly message: string;
}

/** Picks the smallest version whose level-M capacity holds this many payload bytes. */
function chooseVersion(byteLength: number): number | null {
    for (let version = 1; version <= 40; version += 1) {
        const headerBits = 4 + charCountBits(version);
        const capacityBits = numDataCodewords(version) * 8;
        if (headerBits + byteLength * 8 <= capacityBits) return version;
    }
    return null;
}

function buildDataCodewords(bytes: Uint8Array, version: number): number[] {
    const buffer = new BitBuffer();
    buffer.appendBits(0b0100, 4); // byte mode
    buffer.appendBits(bytes.length, charCountBits(version));
    for (const byte of bytes) buffer.appendBits(byte, 8);

    const capacityBits = numDataCodewords(version) * 8;
    const terminatorLength = Math.min(4, capacityBits - buffer.length);
    for (let index = 0; index < terminatorLength; index += 1) buffer.appendBit(0);
    while (buffer.length % 8 !== 0) buffer.appendBit(0);

    const codewords: number[] = [];
    const bits = buffer.toArray();
    for (let index = 0; index < bits.length; index += 8) {
        let byte = 0;
        for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) byte = (byte << 1) | bits[index + bitIndex]!;
        codewords.push(byte);
    }

    const padBytes = [0xec, 0x11];
    let padIndex = 0;
    while (codewords.length < capacityBits / 8) {
        codewords.push(padBytes[padIndex % 2]!);
        padIndex += 1;
    }
    return codewords;
}

interface Block {
    readonly data: readonly number[];
    readonly ecc: readonly number[];
}

function splitIntoBlocks(codewords: readonly number[], version: number): Block[] {
    const eccLength = ECC_CODEWORDS_PER_BLOCK[version]!;
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[version]!;
    const totalData = codewords.length;
    const shortBlockDataLength = Math.floor(totalData / numBlocks);
    const numLongBlocks = totalData % numBlocks;

    const blocks: Block[] = [];
    let offset = 0;
    for (let index = 0; index < numBlocks; index += 1) {
        const dataLength = shortBlockDataLength + (index >= numBlocks - numLongBlocks ? 1 : 0);
        const data = codewords.slice(offset, offset + dataLength);
        offset += dataLength;
        blocks.push({ data, ecc: reedSolomonRemainder(data, eccLength) });
    }
    return blocks;
}

function interleave(blocks: readonly Block[]): number[] {
    const out: number[] = [];
    const maxData = Math.max(...blocks.map((block) => block.data.length));
    for (let index = 0; index < maxData; index += 1) {
        for (const block of blocks) if (index < block.data.length) out.push(block.data[index]!);
    }
    const eccLength = blocks[0]!.ecc.length;
    for (let index = 0; index < eccLength; index += 1) {
        for (const block of blocks) out.push(block.ecc[index]!);
    }
    return out;
}

/* -------------------------------------------------------------------------- */
/* Module placement                                                          */
/* -------------------------------------------------------------------------- */

function alignmentPatternPositions(version: number): readonly number[] {
    if (version === 1) return [];
    const numAlign = Math.floor(version / 7) + 2;
    const step =
        version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const positions = [6];
    let position = version * 4 + 10;
    for (let index = numAlign - 2; index >= 0; index -= 1) {
        positions.splice(1, 0, position);
        position -= step;
    }
    return positions;
}

/** false = not yet placed, true = function module the data pass must skip. */
function drawFunctionPatterns(
    matrix: boolean[][],
    isFunction: boolean[][],
    version: number,
    size: number,
): void {
    function setModule(x: number, y: number, dark: boolean): void {
        matrix[y]![x] = dark;
        isFunction[y]![x] = true;
    }

    function drawFinder(centerX: number, centerY: number): void {
        for (let dy = -4; dy <= 4; dy += 1) {
            for (let dx = -4; dx <= 4; dx += 1) {
                const x = centerX + dx;
                const y = centerY + dy;
                if (x < 0 || x >= size || y < 0 || y >= size) continue;
                const distance = Math.max(Math.abs(dx), Math.abs(dy));
                setModule(x, y, distance !== 2 && distance !== 4);
            }
        }
    }

    // Timing patterns first, so the finders and alignment patterns drawn afterwards
    // correctly overwrite the modules they overlap.
    for (let index = 0; index < size; index += 1) {
        setModule(6, index, index % 2 === 0);
        setModule(index, 6, index % 2 === 0);
    }

    drawFinder(3, 3);
    drawFinder(size - 4, 3);
    drawFinder(3, size - 4);

    const alignments = alignmentPatternPositions(version);
    for (const centerY of alignments) {
        for (const centerX of alignments) {
            // Skip the three positions that would collide with a finder pattern.
            const nearTopLeft = centerX < 8 && centerY < 8;
            const nearTopRight = centerX > size - 9 && centerY < 8;
            const nearBottomLeft = centerX < 8 && centerY > size - 9;
            if (nearTopLeft || nearTopRight || nearBottomLeft) continue;
            for (let dy = -2; dy <= 2; dy += 1) {
                for (let dx = -2; dx <= 2; dx += 1) {
                    const distance = Math.max(Math.abs(dx), Math.abs(dy));
                    setModule(centerX + dx, centerY + dy, distance !== 1);
                }
            }
        }
    }

    // The one module whose value never depends on data, mask, or format - always dark.
    setModule(8, size - 8, true);

    // Reserve the format-information strips around the top-left finder, and the two
    // short strips beside the top-right and bottom-left finders, with placeholder
    // values. The real bits go in once the mask is chosen.
    for (let index = 0; index < 9; index += 1) {
        if (index !== 6) setModule(8, index, false);
        if (index !== 6) setModule(index, 8, false);
    }
    for (let index = 0; index < 8; index += 1) {
        setModule(size - 1 - index, 8, false);
        setModule(8, size - 1 - index, false);
    }

    if (version >= 7) {
        for (let index = 0; index < 18; index += 1) {
            const row = Math.floor(index / 3);
            const col = index % 3;
            setModule(size - 11 + col, row, false);
            setModule(row, size - 11 + col, false);
        }
    }
}

function placeFormatAndVersionInfo(
    matrix: boolean[][],
    version: number,
    size: number,
    maskPattern: number,
): void {
    const format = formatInfoBits(maskPattern);
    for (let index = 0; index <= 5; index += 1) matrix[8]![index] = ((format >>> index) & 1) === 1;
    matrix[8]![7] = ((format >>> 6) & 1) === 1;
    matrix[8]![8] = ((format >>> 7) & 1) === 1;
    matrix[7]![8] = ((format >>> 8) & 1) === 1;
    for (let index = 9; index <= 14; index += 1) matrix[14 - index]![8] = ((format >>> index) & 1) === 1;

    for (let index = 0; index <= 7; index += 1) matrix[size - 1 - index]![8] = ((format >>> index) & 1) === 1;
    for (let index = 8; index <= 14; index += 1) matrix[8]![size - 15 + index] = ((format >>> index) & 1) === 1;

    if (version < 7) return;
    const info = versionInfoBits(version);
    for (let index = 0; index < 18; index += 1) {
        const bit = ((info >>> index) & 1) === 1;
        const row = Math.floor(index / 3);
        const col = index % 3;
        matrix[row]![size - 11 + col] = bit;
        matrix[size - 11 + col]![row] = bit;
    }
}

/** Draws the interleaved codewords into the matrix, in the standard boustrophedon path. */
function drawCodewords(
    matrix: boolean[][],
    isFunction: boolean[][],
    codewords: readonly number[],
    size: number,
): void {
    const bits: number[] = [];
    for (const byte of codewords) for (let index = 7; index >= 0; index -= 1) bits.push((byte >>> index) & 1);

    let bitIndex = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vertical = 0; vertical < size; vertical += 1) {
            const y = upward ? size - 1 - vertical : vertical;
            for (let offset = 0; offset < 2; offset += 1) {
                const x = right - offset;
                if (isFunction[y]![x]) continue;
                const bit = bitIndex < bits.length ? bits[bitIndex]! : 0;
                matrix[y]![x] = bit === 1;
                bitIndex += 1;
            }
        }
        upward = !upward;
    }
}

function applyMask(dark: boolean, x: number, y: number, pattern: number): boolean {
    let invert: boolean;
    switch (pattern) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
    }
    return invert ? !dark : dark;
}

function maskedCopy(
    matrix: readonly boolean[][],
    isFunction: readonly boolean[][],
    pattern: number,
    size: number,
): boolean[][] {
    const out: boolean[][] = [];
    for (let y = 0; y < size; y += 1) {
        const row: boolean[] = [];
        for (let x = 0; x < size; x += 1) {
            row.push(isFunction[y]![x] ? matrix[y]![x]! : applyMask(matrix[y]![x]!, x, y, pattern));
        }
        out.push(row);
    }
    return out;
}

/** The standard four-rule penalty score. Lower is more scannable. */
function penaltyScore(matrix: readonly boolean[][], size: number): number {
    let penalty = 0;

    for (let y = 0; y < size; y += 1) {
        let runColor = matrix[y]![0]!;
        let runLength = 1;
        for (let x = 1; x < size; x += 1) {
            if (matrix[y]![x] === runColor) {
                runLength += 1;
            } else {
                if (runLength >= 5) penalty += runLength - 2;
                runColor = matrix[y]![x]!;
                runLength = 1;
            }
        }
        if (runLength >= 5) penalty += runLength - 2;
    }
    for (let x = 0; x < size; x += 1) {
        let runColor = matrix[0]![x]!;
        let runLength = 1;
        for (let y = 1; y < size; y += 1) {
            if (matrix[y]![x] === runColor) {
                runLength += 1;
            } else {
                if (runLength >= 5) penalty += runLength - 2;
                runColor = matrix[y]![x]!;
                runLength = 1;
            }
        }
        if (runLength >= 5) penalty += runLength - 2;
    }

    for (let y = 0; y < size - 1; y += 1) {
        for (let x = 0; x < size - 1; x += 1) {
            const c = matrix[y]![x]!;
            if (matrix[y]![x + 1] === c && matrix[y + 1]![x] === c && matrix[y + 1]![x + 1] === c) {
                penalty += 3;
            }
        }
    }

    const finderLike = [true, false, true, true, true, false, true];
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x + 6 < size; x += 1) {
            let matches = true;
            for (let index = 0; index < 7; index += 1) if (matrix[y]![x + index] !== finderLike[index]) matches = false;
            if (matches) penalty += 40;
        }
    }
    for (let x = 0; x < size; x += 1) {
        for (let y = 0; y + 6 < size; y += 1) {
            let matches = true;
            for (let index = 0; index < 7; index += 1) if (matrix[y + index]![x] !== finderLike[index]) matches = false;
            if (matches) penalty += 40;
        }
    }

    let darkCount = 0;
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (matrix[y]![x]) darkCount += 1;
    const darkPercent = (darkCount * 100) / (size * size);
    const deviation = Math.abs(Math.ceil(darkPercent / 5) * 5 - 50) / 5;
    penalty += deviation * 10;

    return penalty;
}

/* -------------------------------------------------------------------------- */
/* Public entry point                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Encodes UTF-8 text as a QR code SVG, choosing the smallest version that fits and the mask
 * pattern with the lowest standard penalty score.
 *
 * `moduleSize` is CSS pixels per module before the quiet zone; the SVG's own `viewBox` keeps
 * it scalable regardless, so this mostly affects how large the raw markup describes itself as.
 */
export function encodeQrSvg(text: string, moduleSize = 6): QrEncodeResult | QrEncodeFailure {
    const bytes = new TextEncoder().encode(text);
    const version = chooseVersion(bytes.length);
    if (version === null) {
        return { ok: false, message: "That is too much text for a QR code this build can draw." };
    }

    const dataCodewords = buildDataCodewords(bytes, version);
    const blocks = splitIntoBlocks(dataCodewords, version);
    const interleaved = interleave(blocks);

    const size = version * 4 + 17;
    const matrix: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

    drawFunctionPatterns(matrix, isFunction, version, size);
    drawCodewords(matrix, isFunction, interleaved, size);

    let bestPattern = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestMatrix: boolean[][] = matrix;
    for (let pattern = 0; pattern < 8; pattern += 1) {
        const candidate = maskedCopy(matrix, isFunction, pattern, size);
        placeFormatAndVersionInfo(candidate, version, size, pattern);
        const score = penaltyScore(candidate, size);
        if (score < bestScore) {
            bestScore = score;
            bestPattern = pattern;
            bestMatrix = candidate;
        }
    }
    // placeFormatAndVersionInfo above already wrote the winning candidate's own strip, but
    // it was evaluated once per candidate above and `bestMatrix` already carries it - this
    // call is a no-op safeguard in case a future edit reorders the loop.
    placeFormatAndVersionInfo(bestMatrix, version, size, bestPattern);

    const quietZone = 4;
    const total = size + quietZone * 2;
    const parts: string[] = [];
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            if (bestMatrix[y]![x]) parts.push(`M${x + quietZone},${y + quietZone}h1v1h-1z`);
        }
    }
    const pixelSize = total * moduleSize;
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
        `width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges" role="img">` +
        `<rect width="${total}" height="${total}" fill="#ffffff" />` +
        `<path d="${parts.join(" ")}" fill="#000000" />` +
        `</svg>`;

    return { ok: true, svg, version, moduleCount: size };
}
