import { TagType, tagTypeName } from "../TagType.js";
import { IllegalStateException, NumberFormatException } from "../Exceptions.js";
import type { NBTReader } from "../NBTReader.js";
import type { TypeAdapter } from "../TypeAdapter.js";

/**
 * Lenient primitive readers accepting any number-tag (and strings) for any primitive
 * target-type, mirroring upstream PrimitiveDeserializerFactory including Java's
 * primitive-cast semantics, plus the matching TypeAdapters
 * (write-side mirrors PrimitiveSerializerFactory).
 */

// -- Java primitive-cast semantics --

/** Java (int) cast of a double: NaN -> 0, out-of-range clamps, otherwise truncates towards zero */
export function javaIntCast(value: number): number {
    if (Number.isNaN(value)) return 0;
    if (value >= 2147483647) return 2147483647;
    if (value <= -2147483648) return -2147483648;
    return Math.trunc(value);
}

/** Java (byte) cast of a double (JLS 5.1.3: double -> int -> byte) */
export function javaByteCast(value: number): number {
    return (javaIntCast(value) << 24) >> 24;
}

/** Java (short) cast of a double (JLS 5.1.3: double -> int -> short) */
export function javaShortCast(value: number): number {
    return (javaIntCast(value) << 16) >> 16;
}

/** Java (long) cast of a double: NaN -> 0, out-of-range clamps, otherwise truncates towards zero */
export function javaLongCast(value: number): bigint {
    if (Number.isNaN(value)) return 0n;
    if (value >= 9223372036854775807) return 9223372036854775807n;
    if (value <= -9223372036854775808) return -9223372036854775808n;
    return BigInt(Math.trunc(value));
}

// -- Java number-parsing (Byte/Short/Integer/Long.parseXxx & Float/Double.parseXxx) --

const INTEGRAL = /^[+-]?[0-9]+$/;
const DECIMAL_FLOAT = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?[fFdD]?$/;
const HEX_FLOAT = /^([+-]?)0[xX]([0-9a-fA-F]+(?:\.[0-9a-fA-F]*)?|\.[0-9a-fA-F]+)[pP]([+-]?[0-9]+)[fFdD]?$/;
const DOUBLE_BITS = new DataView(new ArrayBuffer(8));

function parseIntegral(value: string, min: number, max: number): number {
    if (!INTEGRAL.test(value)) throw new NumberFormatException('For input string: "' + value + '"');
    const parsed = Number(value);
    if (parsed < min || parsed > max)
        throw new NumberFormatException('For input string: "' + value + '"');
    return parsed;
}

function parseLongString(value: string): bigint {
    if (!INTEGRAL.test(value)) throw new NumberFormatException('For input string: "' + value + '"');
    const parsed = BigInt(value);
    if (parsed < -9223372036854775808n || parsed > 9223372036854775807n)
        throw new NumberFormatException('For input string: "' + value + '"');
    return parsed;
}

/** Rounds an unsigned integer divided by 2^shift to nearest, ties to even. */
function roundRight(value: bigint, shift: number, bitLength: number): bigint {
    if (shift <= 0) return value << BigInt(-shift);
    if (shift > bitLength) return 0n;

    const amount = BigInt(shift);
    const rounded = value >> amount;
    const remainder = value - (rounded << amount);
    const halfway = 1n << (amount - 1n);
    if (remainder > halfway || (remainder === halfway && (rounded & 1n) !== 0n)) {
        return rounded + 1n;
    }
    return rounded;
}

function doubleFromBits(negative: boolean, exponent: number, fraction: bigint): number {
    const sign = negative ? 1n << 63n : 0n;
    DOUBLE_BITS.setBigUint64(0, sign | (BigInt(exponent) << 52n) | fraction);
    return DOUBLE_BITS.getFloat64(0);
}

/** Converts Java's hexadecimal floating-point syntax to an exactly rounded IEEE-754 double. */
function parseHexFloating(match: RegExpExecArray): number {
    const negative = match[1] === "-";
    const significand = match[2]!;
    const dot = significand.indexOf(".");
    const fractionalDigits = dot < 0 ? 0 : significand.length - dot - 1;
    const coefficient = BigInt("0x" + significand.replace(".", ""));
    if (coefficient === 0n) return negative ? -0 : 0;

    const exponent2 = Number(match[3]!) - fractionalDigits * 4;
    if (exponent2 === Number.POSITIVE_INFINITY) return negative ? -Infinity : Infinity;
    if (exponent2 === Number.NEGATIVE_INFINITY) return negative ? -0 : 0;

    const bitLength = coefficient.toString(2).length;
    let unbiasedExponent = bitLength - 1 + exponent2;
    if (unbiasedExponent > 1023) return negative ? -Infinity : Infinity;

    if (unbiasedExponent >= -1022) {
        let significandBits = roundRight(coefficient, bitLength - 53, bitLength);
        if (significandBits === 1n << 53n) {
            significandBits >>= 1n;
            unbiasedExponent++;
            if (unbiasedExponent > 1023) return negative ? -Infinity : Infinity;
        }
        return doubleFromBits(negative, unbiasedExponent + 1023, significandBits - (1n << 52n));
    }

    const subnormalBits = roundRight(coefficient, -(exponent2 + 1074), bitLength);
    if (subnormalBits === 0n) return negative ? -0 : 0;
    if (subnormalBits >= 1n << 52n) return doubleFromBits(negative, 1, 0n);
    return doubleFromBits(negative, 0, subnormalBits);
}

function parseFloating(value: string): number {
    // Float.parseFloat/Double.parseDouble trim only characters <= U+0020 (String.trim()).
    const trimmed = value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "");
    if (trimmed.length === 0) throw new NumberFormatException("empty String");
    if (/^[+-]?(?:Infinity|NaN)$/.test(trimmed)) return Number(trimmed);

    const hex = HEX_FLOAT.exec(trimmed);
    if (hex !== null) return parseHexFloating(hex);

    if (!DECIMAL_FLOAT.test(trimmed))
        throw new NumberFormatException('For input string: "' + value + '"');
    const unsuffixed = /[fFdD]$/.test(trimmed) ? trimmed.slice(0, -1) : trimmed;
    return Number(unsuffixed);
}

// -- lenient primitive readers (PrimitiveDeserializerFactory.readXxx) --

export function readBool(reader: NBTReader): boolean {
    const type = reader.peek();
    switch (type) {
        case TagType.BYTE:
            return reader.nextByte() !== 0;
        case TagType.SHORT:
            return reader.nextShort() !== 0;
        case TagType.INT:
            return reader.nextInt() !== 0;
        case TagType.LONG:
            return reader.nextLong() !== 0n;
        case TagType.FLOAT:
            return reader.nextFloat() !== 0;
        case TagType.DOUBLE:
            return reader.nextDouble() !== 0;
        case TagType.STRING:
            return /^true$/i.test(reader.nextString());
        default:
            throw new IllegalStateException(
                "STRING or any number tag expected but got " +
                    tagTypeName(type) +
                    ". At: " +
                    reader.path(),
            );
    }
}

export function readByte(reader: NBTReader): number {
    const type = reader.peek();
    switch (type) {
        case TagType.BYTE:
            return reader.nextByte();
        case TagType.SHORT:
            return (reader.nextShort() << 24) >> 24;
        case TagType.INT:
            return (reader.nextInt() << 24) >> 24;
        case TagType.LONG:
            return Number(BigInt.asIntN(8, reader.nextLong()));
        case TagType.FLOAT:
            return javaByteCast(reader.nextFloat());
        case TagType.DOUBLE:
            return javaByteCast(reader.nextDouble());
        case TagType.STRING:
            return parseIntegral(reader.nextString(), -128, 127);
        default:
            throw new IllegalStateException(
                "BYTE tag expected but got " + tagTypeName(type) + ". At: " + reader.path(),
            );
    }
}

export function readShort(reader: NBTReader): number {
    const type = reader.peek();
    switch (type) {
        case TagType.BYTE:
            return reader.nextByte();
        case TagType.SHORT:
            return reader.nextShort();
        case TagType.INT:
            return (reader.nextInt() << 16) >> 16;
        case TagType.LONG:
            return Number(BigInt.asIntN(16, reader.nextLong()));
        case TagType.FLOAT:
            return javaShortCast(reader.nextFloat());
        case TagType.DOUBLE:
            return javaShortCast(reader.nextDouble());
        case TagType.STRING:
            return parseIntegral(reader.nextString(), -32768, 32767);
        default:
            throw new IllegalStateException(
                "SHORT tag expected but got " + tagTypeName(type) + ". At: " + reader.path(),
            );
    }
}

export function readInt(reader: NBTReader): number {
    const type = reader.peek();
    switch (type) {
        case TagType.BYTE:
            return reader.nextByte();
        case TagType.SHORT:
            return reader.nextShort();
        case TagType.INT:
            return reader.nextInt();
        case TagType.LONG:
            return Number(BigInt.asIntN(32, reader.nextLong()));
        case TagType.FLOAT:
            return javaIntCast(reader.nextFloat());
        case TagType.DOUBLE:
            return javaIntCast(reader.nextDouble());
        case TagType.STRING:
            return parseIntegral(reader.nextString(), -2147483648, 2147483647);
        default:
            throw new IllegalStateException(
                "INT tag expected but got " + tagTypeName(type) + ". At: " + reader.path(),
            );
    }
}

export function readLong(reader: NBTReader): bigint {
    const type = reader.peek();
    switch (type) {
        case TagType.LONG:
            return reader.nextLong();
        case TagType.BYTE:
            return BigInt(reader.nextByte());
        case TagType.SHORT:
            return BigInt(reader.nextShort());
        case TagType.INT:
            return BigInt(reader.nextInt());
        case TagType.FLOAT:
            return javaLongCast(reader.nextFloat());
        case TagType.DOUBLE:
            return javaLongCast(reader.nextDouble());
        case TagType.STRING:
            return parseLongString(reader.nextString());
        default:
            throw new IllegalStateException(
                "LONG tag expected but got " + tagTypeName(type) + ". At: " + reader.path(),
            );
    }
}

export function readFloat(reader: NBTReader): number {
    const type = reader.peek();
    switch (type) {
        case TagType.FLOAT:
            return reader.nextFloat();
        case TagType.BYTE:
            return reader.nextByte();
        case TagType.SHORT:
            return reader.nextShort();
        case TagType.INT:
            return Math.fround(reader.nextInt());
        case TagType.LONG:
            return Math.fround(Number(reader.nextLong()));
        case TagType.DOUBLE:
            return Math.fround(reader.nextDouble());
        case TagType.STRING:
            return Math.fround(parseFloating(reader.nextString()));
        default:
            throw new IllegalStateException(
                "FLOAT tag expected but got " + tagTypeName(type) + ". At: " + reader.path(),
            );
    }
}

export function readDouble(reader: NBTReader): number {
    const type = reader.peek();
    switch (type) {
        case TagType.DOUBLE:
            return reader.nextDouble();
        case TagType.BYTE:
            return reader.nextByte();
        case TagType.SHORT:
            return reader.nextShort();
        case TagType.INT:
            return reader.nextInt();
        case TagType.LONG:
            return Number(reader.nextLong());
        case TagType.FLOAT:
            return reader.nextFloat();
        case TagType.STRING:
            return parseFloating(reader.nextString());
        default:
            throw new IllegalStateException(
                "DOUBLE tag expected but got " + tagTypeName(type) + ". At: " + reader.path(),
            );
    }
}

export function readString(reader: NBTReader): string {
    const type = reader.peek();
    switch (type) {
        case TagType.STRING:
            return reader.nextString();
        case TagType.BYTE:
            return String(reader.nextByte());
        case TagType.SHORT:
            return String(reader.nextShort());
        case TagType.INT:
            return String(reader.nextInt());
        case TagType.LONG:
            return reader.nextLong().toString();
        // note: JS number-formatting can differ from Java's Float/Double.toString for non-exact values
        case TagType.FLOAT:
            return String(reader.nextFloat());
        case TagType.DOUBLE:
            return String(reader.nextDouble());
        default:
            throw new IllegalStateException(
                "STRING tag expected but got " + tagTypeName(type) + ". At: " + reader.path(),
            );
    }
}

// -- primitive TypeAdapters --

export const BOOLEAN: TypeAdapter<boolean> = {
    read: readBool,
    write: (value, writer) => writer.valueByte(value ? 1 : 0),
    type: () => TagType.BYTE,
};

export const BYTE: TypeAdapter<number> = {
    read: readByte,
    write: (value, writer) => writer.valueByte(value),
    type: () => TagType.BYTE,
};

export const SHORT: TypeAdapter<number> = {
    read: readShort,
    write: (value, writer) => writer.valueShort(value),
    type: () => TagType.SHORT,
};

export const INT: TypeAdapter<number> = {
    read: readInt,
    write: (value, writer) => writer.valueInt(value),
    type: () => TagType.INT,
};

export const LONG: TypeAdapter<bigint> = {
    read: readLong,
    write: (value, writer) => writer.valueLong(value),
    type: () => TagType.LONG,
};

/**
 * Convenience adapter for LONG data as a JS number (safe for values within
 * Number.MAX_SAFE_INTEGER — timestamps, seeds-as-display, etc.; see docs/decisions.md D1).
 */
export const LONG_AS_NUMBER: TypeAdapter<number> = {
    read: (reader) => Number(readLong(reader)),
    write: (value, writer) => writer.valueLong(value),
    type: () => TagType.LONG,
};

export const FLOAT: TypeAdapter<number> = {
    read: readFloat,
    write: (value, writer) => writer.valueFloat(value),
    type: () => TagType.FLOAT,
};

export const DOUBLE: TypeAdapter<number> = {
    read: readDouble,
    write: (value, writer) => writer.valueDouble(value),
    type: () => TagType.DOUBLE,
};

export const STRING: TypeAdapter<string> = {
    read: readString,
    write: (value, writer) => writer.valueString(value),
    type: () => TagType.STRING,
};
