import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * The Java feature release every job that builds or runs the vendored BlueMap renderer must
 * install.
 *
 * The vendored sources pin `JavaLanguageVersion.of(25)` in `buildSrc/bluemap.java.gradle.kts`,
 * and neither their `settings.gradle.kts` nor their `gradle.properties` applies a toolchain
 * resolver, so Gradle cannot provision that JDK itself: it has to already be on the runner or the
 * build stops at "No matching toolchains found". The jars that build produces are class-file
 * version 69, so a job that only runs the jar needs the same release from the other side - a
 * lower JVM refuses it with `UnsupportedClassVersionError` before a single tile is drawn.
 */
const RENDERER_JAVA_FEATURE = "25";

interface JavaJob {
    readonly workflow: string;
    readonly job: string;
    /** Every `java-version` the job installs, in the order its steps run. */
    readonly versions: readonly string[];
    /** Whether the job builds or runs the vendored BlueMap renderer. */
    readonly renderer: boolean;
    readonly why: string;
}

/**
 * Completeness guard, intentionally hand-written. Every job that installs a JDK is named here,
 * with the exact versions it installs and whether those versions serve the renderer. Adding,
 * removing, or re-versioning a `setup-java` step must update this inventory in the same commit.
 *
 * A rule alone would not be enough: a rule about the JDKs a job installs is satisfied trivially
 * by a job that installs none, so the discovered set is compared against this list in both
 * directions.
 */
const JAVA_JOBS: readonly JavaJob[] = [
    {
        workflow: "build-jars.yml",
        job: "build",
        versions: ["8", "25"],
        renderer: true,
        why: "Builds the renderer. JDK 8 is installed first for ForgeGradle's own toolchain lookup, so 25 stays the default JAVA_HOME that launches Gradle.",
    },
    {
        workflow: "chunk-world.yml",
        job: "plan",
        versions: ["21"],
        renderer: false,
        why: "Runs Chunker, a different project whose floor is Java 17.",
    },
    {
        workflow: "chunk-world.yml",
        job: "convert",
        versions: ["21"],
        renderer: false,
        why: "Runs Chunker, a different project whose floor is Java 17.",
    },
    {
        workflow: "ci.yml",
        job: "test-world",
        versions: ["25"],
        renderer: true,
        why: "Runs the built renderer jar over a generated world.",
    },
    {
        workflow: "render-private-world.yml",
        job: "cli",
        versions: ["25"],
        renderer: true,
        why: "Builds the renderer from the vendored sources.",
    },
    {
        workflow: "render-private-world.yml",
        job: "render",
        versions: ["25"],
        renderer: true,
        why: "Runs the renderer jar built by the cli job.",
    },
    {
        workflow: "render-shard-wave.yml",
        job: "render",
        versions: ["25"],
        renderer: true,
        why: "Runs the renderer jar published by build-jars.yml.",
    },
    {
        workflow: "render-world.yml",
        job: "cli",
        versions: ["25"],
        renderer: true,
        why: "Builds the renderer from the vendored sources.",
    },
];

function workflowNames(): string[] {
    return readdirSync(join(repositoryRoot, ".github", "workflows"))
        .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
        .sort();
}

function workflowText(name: string): string {
    return readFileSync(join(repositoryRoot, ".github", "workflows", name), "utf8");
}

function jobBlocks(text: string): Map<string, string> {
    const jobsIndex = text.search(/^jobs:\s*$/m);
    expect(jobsIndex, "workflow must contain a top-level jobs mapping").toBeGreaterThanOrEqual(0);
    const jobsText = text.slice(jobsIndex);
    const starts = [...jobsText.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((match) => ({
        name: match[1] as string,
        index: match.index,
    }));
    const blocks = new Map<string, string>();
    starts.forEach((start, index) => {
        blocks.set(
            start.name,
            jobsText.slice(start.index, starts[index + 1]?.index ?? jobsText.length),
        );
    });
    return blocks;
}

/**
 * Comment lines are dropped before anything is matched, the way the runner policy check does it
 * and for the same reason: these workflows explain themselves at length, and several comments
 * name a jar, a Gradle task, or a Java release that the steps beside them never touch. Matching
 * prose would put the renderer's requirement on jobs that do not build or run it.
 */
function codeLines(block: string): string[] {
    return block.split(/\r?\n/).filter((line) => !/^\s*#/.test(line));
}

function javaVersions(block: string): string[] {
    return [
        ...codeLines(block)
            .join("\n")
            .matchAll(/^\s*java-version:\s*['"]?([^'"\s]+)['"]?\s*$/gm),
    ].map((match) => match[1] as string);
}

/**
 * Whether a job actually puts the vendored renderer through a JVM, as opposed to merely carrying
 * its jar somewhere. `ci.yml:package` downloads the jar and bundles it into the desktop package
 * without ever executing it, so it installs no JDK and needs none; a job that both handles the
 * renderer and runs `java -jar` or the Gradle wrapper does need one, at the pinned release.
 */
function runsRendererToolchain(block: string): boolean {
    const lines = codeLines(block);
    const body = lines.join("\n");
    const handlesRenderer = /:cli:shadowJar/.test(body) || /\bbluemap(-jar)?-cli\b/.test(body);
    const executesJava = lines.some((line) =>
        /(^|[\s"'`])(java\s+[^\n]*-jar|\.\/gradlew)\b/.test(line),
    );
    return handlesRenderer && executesJava;
}

function rendererJavaProblems(workflow: string, text: string): string[] {
    const problems: string[] = [];
    for (const [job, block] of jobBlocks(text)) {
        if (!runsRendererToolchain(block)) continue;
        const versions = javaVersions(block);
        if (versions.length === 0) {
            problems.push(`${workflow}:${job} runs the renderer without installing a JDK`);
            continue;
        }
        // The last install wins: actions/setup-java points the plain JAVA_HOME at whichever
        // JDK it installed most recently, which is the one Gradle and a bare `java` both use.
        const active = versions[versions.length - 1] as string;
        if (active !== RENDERER_JAVA_FEATURE) {
            problems.push(
                `${workflow}:${job} runs the renderer on Java ${active}, not ${RENDERER_JAVA_FEATURE}`,
            );
        }
    }
    return problems;
}

describe("Java toolchain policy", () => {
    it("inventories every job that installs a JDK, by hand", () => {
        const discovered = workflowNames().flatMap((workflow) =>
            [...jobBlocks(workflowText(workflow))]
                .filter(([, block]) => javaVersions(block).length > 0)
                .map(([job]) => `${workflow}:${job}`),
        );
        expect(discovered.sort()).toEqual(
            JAVA_JOBS.map((entry) => `${entry.workflow}:${entry.job}`).sort(),
        );
    });

    it("installs exactly the declared releases in exactly the declared order", () => {
        for (const entry of JAVA_JOBS) {
            const block = jobBlocks(workflowText(entry.workflow)).get(entry.job);
            expect(block, `${entry.workflow}:${entry.job} must exist`).toBeDefined();
            expect(
                javaVersions(block ?? ""),
                `${entry.workflow}:${entry.job}: ${entry.why}`,
            ).toEqual(entry.versions);
        }
    });

    it("gives every job that builds or runs the renderer the pinned release as its default JDK", () => {
        for (const workflow of workflowNames()) {
            expect(rendererJavaProblems(workflow, workflowText(workflow)), workflow).toEqual([]);
        }
    });

    it("agrees with the hand-written inventory about which jobs serve the renderer", () => {
        for (const entry of JAVA_JOBS) {
            const block = jobBlocks(workflowText(entry.workflow)).get(entry.job) ?? "";
            expect(runsRendererToolchain(block), `${entry.workflow}:${entry.job}`).toBe(
                entry.renderer,
            );
            if (entry.renderer) {
                expect(entry.versions[entry.versions.length - 1]).toBe(RENDERER_JAVA_FEATURE);
            }
        }
    });

    it("would notice a renderer job dropped back to an older release", () => {
        for (const entry of JAVA_JOBS.filter((candidate) => candidate.renderer)) {
            const text = workflowText(entry.workflow);
            for (const quote of ["'", '"', ""]) {
                const mutated = text.replace(
                    `java-version: ${quote}${RENDERER_JAVA_FEATURE}${quote}`,
                    `java-version: ${quote}21${quote}`,
                );
                if (mutated === text) continue;
                expect(
                    rendererJavaProblems(entry.workflow, mutated),
                    `${entry.workflow} with Java 21`,
                ).not.toEqual([]);
            }
        }
    });

    it("would notice a renderer job that installs no JDK at all", () => {
        const text = workflowText("render-private-world.yml");
        const stripped = text
            .split(/\r?\n/)
            .filter((line) => !/^\s*java-version:/.test(line))
            .join("\n");
        expect(stripped).not.toBe(text);
        expect(rendererJavaProblems("render-private-world.yml", stripped)).not.toEqual([]);
    });
});
