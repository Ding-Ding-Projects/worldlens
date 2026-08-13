/**
 * Small SemVer comparator for update decisions.
 *
 * Update names are deliberately limited to the three numeric core components and an
 * optional prerelease. Build metadata is not accepted by the feed parser, so it cannot make
 * two packages look different while installing the same bytes.
 */

interface ParsedVersion {
    readonly major: string;
    readonly minor: string;
    readonly patch: string;
    readonly prerelease: readonly string[];
}

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*))?$/;

function parseVersion(value: string): ParsedVersion | null {
    const match = VERSION.exec(value.trim());
    if (match === null) return null;
    const major = match[1];
    const minor = match[2];
    const patch = match[3];
    if (major === undefined || minor === undefined || patch === undefined) return null;
    return {
        major,
        minor,
        patch,
        prerelease: match[4] === undefined ? [] : match[4].split(/[.-]/),
    };
}

function normaliseNumeric(value: string): string {
    const result = value.replace(/^0+(?=\d)/, "");
    return result === "" ? "0" : result;
}

function compareNumeric(left: string, right: string): number {
    const a = normaliseNumeric(left);
    const b = normaliseNumeric(right);
    if (a.length !== b.length) return a.length < b.length ? -1 : 1;
    return a === b ? 0 : a < b ? -1 : 1;
}

function comparePrerelease(left: readonly string[], right: readonly string[]): number {
    if (left.length === 0 || right.length === 0) {
        if (left.length === right.length) return 0;
        return left.length === 0 ? 1 : -1;
    }
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const a = left[index];
        const b = right[index];
        if (a === undefined || b === undefined)
            return left.length === right.length ? 0 : left.length < right.length ? -1 : 1;
        const aNumeric = /^\d+$/.test(a);
        const bNumeric = /^\d+$/.test(b);
        if (aNumeric && bNumeric) {
            const result = compareNumeric(a, b);
            if (result !== 0) return result;
        } else if (aNumeric !== bNumeric) {
            return aNumeric ? -1 : 1;
        } else if (a !== b) {
            return a < b ? -1 : 1;
        }
    }
    return left.length === right.length ? 0 : left.length < right.length ? -1 : 1;
}

/** Returns null when either value is not a supported update version. */
export function compareVersions(left: string, right: string): number | null {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (a === null || b === null) return null;
    for (const [leftPart, rightPart] of [
        [a.major, b.major],
        [a.minor, b.minor],
        [a.patch, b.patch],
    ] as const) {
        const result = compareNumeric(leftPart, rightPart);
        if (result !== 0) return result;
    }
    return comparePrerelease(a.prerelease, b.prerelease);
}

export function isStrictlyNewerVersion(candidate: string, current: string): boolean {
    return compareVersions(candidate, current) === 1;
}
