/**
 * The Java seam, against the shapes the real bridge actually delivers.
 *
 * Every existing Java test in `CreateServerWizard.test.ts` injects a host whose `resolve`
 * already returns a finished `JavaResolution`, so all of them passed while the shipped app
 * showed an empty banner and a button that did nothing. The main process answers
 * `mcserver:java:resolve` with its own discovery report - `{requirement, installation,
 * rejected}` - and the store passed that straight through, so `found` was `undefined` and
 * `message` was `""` on a machine with a perfectly good runtime. The same seam delivered
 * progress as `(id, event)` while the reader expected one object.
 *
 * These tests therefore speak the main process's shapes rather than the store's, which is
 * the only way this class of defect can fail a suite.
 */

import { describe, expect, it, vi } from "vitest";
import { createServerStore, type McServerHost, type JavaProvisionProgress } from "./serverStore.js";

/** `mcserver:java:resolve`'s real answer, as `main/mcserver/ipc.ts` builds it. */
function discoveryReport(options: {
    feature: number;
    installed?: { source: string; executable: string; version: string } | null;
    rejected?: readonly { source: string; executable: string; reason: string }[];
}): unknown {
    return {
        requirement: { known: true, feature: options.feature },
        installation:
            options.installed === undefined || options.installed === null
                ? null
                : {
                      source: options.installed.source,
                      executable: options.installed.executable,
                      home: null,
                      version: { version: options.installed.version, feature: options.feature },
                  },
        rejected: options.rejected ?? [],
    };
}

function hostOptions(java: NonNullable<McServerHost["java"]>): { host: McServerHost } {
    return {
        host: { list: async () => ({ ok: true, value: [] }), java } as unknown as McServerHost,
    };
}

describe("the Java resolve seam", () => {
    it("reads a real discovery report as a found runtime", async () => {
        const store = createServerStore(
            hostOptions({
                resolve: (async () =>
                    ({
                        ok: true,
                        value: discoveryReport({
                            feature: 21,
                            installed: {
                                source: "PATH",
                                executable: "C:/java/bin/java.exe",
                                version: "21.0.4",
                            },
                        }),
                    }) as never) as never,
            }),
        );

        const result = await store.javaResolve("21");
        expect(result.ok).toBe(true);
        expect(result.value?.found).toBe(true);
        expect(result.value?.version).toBe("21.0.4");
        expect(result.value?.executable).toBe("C:/java/bin/java.exe");
        expect(result.value?.requiredFeature).toBe(21);
        expect(result.value?.message).not.toBe("");
    });

    it("reads a report with no installation as not found, and says why", async () => {
        const store = createServerStore(
            hostOptions({
                resolve: (async () =>
                    ({
                        ok: true,
                        value: discoveryReport({
                            feature: 21,
                            installed: null,
                            rejected: [
                                {
                                    source: "PATH",
                                    executable: "/usr/bin/java",
                                    reason: "is Java 17, older than the 21 this version needs",
                                },
                            ],
                        }),
                    }) as never) as never,
            }),
        );

        const result = await store.javaResolve("21");
        expect(result.value?.found).toBe(false);
        expect(result.value?.requiredFeature).toBe(21);
        // The banner renders this string; an empty one is the defect that was shipped.
        expect(result.value?.message).toContain("21");
        expect(result.value?.message).toContain("older than the 21");
    });

    it("still says something when nothing at all was rejected", async () => {
        const store = createServerStore(
            hostOptions({
                resolve: (async () =>
                    ({
                        ok: true,
                        value: discoveryReport({ feature: 21, installed: null }),
                    }) as never) as never,
            }),
        );

        const result = await store.javaResolve("21");
        expect(result.value?.found).toBe(false);
        expect(result.value?.message.length).toBeGreaterThan(0);
    });
});

describe("the Java progress seam", () => {
    it("delivers the event, not the server id", async () => {
        // A holder rather than a bare `let`. The assignment happens inside the onProgress
        // callback, which TypeScript cannot see from here, so it narrowed the variable to
        // exactly `null` at every use below and reported the calls as not callable. A
        // property access keeps the declared union, which is what is true at runtime.
        const captured: { sink: ((id: string, event: unknown) => void) | null } = { sink: null };
        const store = createServerStore(
            hostOptions({
                resolve: (async () => ({
                    ok: true,
                    value: discoveryReport({ feature: 21 }),
                })) as never,
                onProgress: (listener) => {
                    captured.sink = listener as (id: string, event: unknown) => void;
                    return () => {
                        captured.sink = null;
                    };
                },
            }),
        );

        const seen: JavaProvisionProgress[] = [];
        const stop = store.onJavaProgress((progress) => seen.push(progress));
        expect(captured.sink).not.toBeNull();

        captured.sink?.("srv-1", {
            phase: "downloading",
            receivedBytes: 1024,
            totalBytes: 4096,
            message: "Downloading Java 21",
        });
        expect(seen).toHaveLength(1);
        expect(seen[0]?.phase).toBe("downloading");
        expect(seen[0]?.receivedBytes).toBe(1024);

        // Anything that is not a progress event is ignored rather than rendered as NaN.
        captured.sink?.("srv-1", "srv-1");
        captured.sink?.("srv-1", null);
        expect(seen).toHaveLength(1);
        stop();
    });
});

describe("the Java provision seam", () => {
    it("reads an already-installed answer as a found runtime", async () => {
        const provision = vi.fn(async () => ({
            ok: true as const,
            value: {
                outcome: "already-installed",
                feature: 21,
                version: "21",
                java: {
                    source: "PATH",
                    executable: "C:/java/bin/java.exe",
                    home: null,
                    version: { version: "21.0.4" },
                },
            },
        }));
        const store = createServerStore(
            hostOptions({
                resolve: (async () => ({
                    ok: true,
                    value: discoveryReport({ feature: 21 }),
                })) as never,
                provision: provision as never,
            }),
        );

        const result = await store.javaProvision("21");
        expect(provision).toHaveBeenCalledWith("21");
        expect(result.value?.found).toBe(true);
        expect(result.value?.source).toBe("provisioned");
        expect(result.value?.version).toBe("21.0.4");
    });
});
