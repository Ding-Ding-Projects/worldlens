/**
 * Which Java feature version a Minecraft server version needs to boot.
 *
 * A pure lookup, deliberately kept apart from the network-touching catalogue module so
 * it can be tested with plain assertions and reused wherever a version has to be turned
 * into a Java requirement - `create.ts` reads it before it ever provisions anything.
 *
 * The table below is Mojang's own published requirement, not a guess: 1.17 raised the
 * floor to Java 16, 1.18 raised it again to 17, and 1.20.5 raised it to 21. Everything
 * before 1.17 runs on Java 8, back to the versions this app can reasonably be asked to
 * host at all (1.12).
 *
 * A version this table has never heard of - a snapshot with an odd tag, a version older
 * than the table's floor - gets an explicit "unknown" answer rather than a guessed
 * number. Guessing a Java feature version and being wrong means a server that refuses to
 * start with a class-file error, which is a worse failure than saying plainly that the
 * requirement could not be determined.
 */

export interface JavaRequirementKnown {
    readonly known: true;
    readonly feature: number;
}

export interface JavaRequirementUnknown {
    readonly known: false;
    readonly reason: string;
}

export type JavaRequirement = JavaRequirementKnown | JavaRequirementUnknown;

function known(feature: number): JavaRequirementKnown {
    return { known: true, feature };
}

function unknown(reason: string): JavaRequirementUnknown {
    return { known: false, reason };
}

/**
 * A version's leading `major.minor` component, e.g. `1.20.4` -> `[1, 20]`, `1.20.5` ->
 * `[1, 20]`. The patch component is read separately below, because the one boundary that
 * falls mid-minor (1.20.5) needs it.
 */
function leadingComponents(version: string): readonly number[] | null {
    const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim());
    if (match === null) return null;
    const major = Number.parseInt(match[1] ?? "", 10);
    const minor = Number.parseInt(match[2] ?? "", 10);
    const patch = match[3] === undefined ? 0 : Number.parseInt(match[3], 10);
    if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
    return [major, minor, patch];
}

/**
 * Maps a release version string (`1.20.4`, `1.21.1`) to the Java feature version it
 * needs. Snapshots and other non-numeric tags are deliberately out of scope here - the
 * catalogue records a `stability` field precisely so a caller can decide whether to trust
 * a snapshot's own reported requirement, or to refuse it as `unknown`.
 */
export function requiredJavaFeature(minecraftVersion: string): JavaRequirement {
    const components = leadingComponents(minecraftVersion);
    if (components === null) {
        return unknown(`"${minecraftVersion}" is not a version this app recognizes.`);
    }
    const [major, minor, patch] = components;
    if (major === undefined || minor === undefined) {
        return unknown(`"${minecraftVersion}" is not a version this app recognizes.`);
    }

    if (major !== 1) {
        return unknown(`"${minecraftVersion}" is outside the versions this app can map to a Java requirement.`);
    }
    if (minor < 12) {
        return unknown(`"${minecraftVersion}" is older than this app's supported floor (1.12).`);
    }
    if (minor <= 16) return known(8);
    if (minor === 17) return known(16);
    if (minor <= 20 && !(minor === 20 && (patch ?? 0) >= 5)) return known(17);
    return known(21);
}
