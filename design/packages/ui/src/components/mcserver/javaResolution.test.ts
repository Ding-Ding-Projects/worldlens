import { describe, expect, it, vi } from "vitest";
import {
    createServerStore,
    isJavaProvisionProgress,
    isJavaResolution,
    normaliseJavaResolution,
    type JavaProvisionProgress,
    type McServerHost,
} from "./serverStore.js";

describe("Java bridge normalization", () => {
    it("accepts the complete normalized bundled-runtime shape", () => {
        const value = {
            found: true,
            executable: "C:/app/resources/bundled/java/bin/java.exe",
            source: "bundled",
            version: "25.0.1",
            requiredFeature: 25,
            message: "Bundled Java is ready.",
        };
        expect(isJavaResolution(value)).toBe(true);
        expect(normaliseJavaResolution(value, "25")).toEqual(value);
    });

    it("translates raw discovery while preserving bundled source and required feature", () => {
        expect(
            normaliseJavaResolution(
                {
                    installation: {
                        source: "bundled",
                        executable: "C:/app/resources/bundled/java/bin/java.exe",
                        version: { version: "25.0.1" },
                    },
                    rejected: [],
                    required: 25,
                },
                "25",
            ),
        ).toMatchObject({ found: true, source: "bundled", requiredFeature: 25 });
    });

    it("uses the Minecraft feature number rather than the leading version digit", () => {
        expect(
            normaliseJavaResolution(
                { installation: null, rejected: [] },
                "1.21.4",
            ),
        ).toMatchObject({ found: false, requiredFeature: 21 });
    });

    it("rejects malformed answers instead of manufacturing a runtime", () => {
        expect(normaliseJavaResolution({ found: true, executable: 42 }, "21")).toBeNull();
        expect(isJavaResolution({ found: false, executable: "leftover", source: null, version: null, requiredFeature: 21, message: "no" })).toBe(false);
    });

    it("keeps validated rejection reasons in the missing-runtime message", () => {
        expect(
            normaliseJavaResolution(
                {
                    required: 21,
                    installation: null,
                    rejected: [{ source: "JAVA_HOME", reason: "reports feature 17" }],
                },
                "21",
            )?.message,
        ).toContain("JAVA_HOME: reports feature 17");
    });
});

describe("Java progress bridge", () => {
    it.each<JavaProvisionProgress["phase"]>([
        "resolving",
        "downloading",
        "extracting",
        "verifying",
        "installing",
        "done",
        "failed",
    ])("accepts the %s phase", (phase) => {
        expect(isJavaProvisionProgress({ phase, receivedBytes: 0, totalBytes: null, message: phase })).toBe(true);
    });

    it("adapts the two-argument host callback and drops malformed events", () => {
        let emit: ((serverId: string, event: unknown) => void) | undefined;
        const host: McServerHost = {
            java: {
                resolve: async () => ({ ok: true, value: { found: false, executable: null, source: null, version: null, requiredFeature: 21, message: "none" } }),
                onProgress: (listener: (serverId: string, event: unknown) => void) => {
                    emit = listener;
                    return () => undefined;
                },
            },
        } as unknown as McServerHost;
        const store = createServerStore({ host });
        const seen: JavaProvisionProgress[] = [];
        store.onJavaProgress((progress) => seen.push(progress));
        emit?.("server-1", { phase: "resolving", receivedBytes: 0, totalBytes: null, message: "Resolving Java" });
        emit?.("server-1", { phase: "not-a-phase", receivedBytes: 0, totalBytes: null, message: "bad" });
        emit?.("server-1", { phase: "done", receivedBytes: -1, totalBytes: 1, message: "bad" });
        expect(seen).toHaveLength(1);
        expect(seen[0]?.phase).toBe("resolving");
    });

});
