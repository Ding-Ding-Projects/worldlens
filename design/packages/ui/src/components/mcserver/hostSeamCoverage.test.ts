import { describe, expect, it, vi } from "vitest";

import {
    createServerStore,
    type Answer,
    type SshReadinessRequest,
    type SshReadinessResult,
} from "./serverStore.js";

import { resolveServerHost } from "./useServers.js";

/**
 * Every method the preload bridge offers must reach the host object the store calls.
 *
 * This is written from a real defect that had already happened twice in different forms. A
 * suggested-folder seam was added end to end - a channel in the main process, a method on
 * the preload bridge, a call in the store, and a wizard that asked for it - and
 * `resolveServerHost` was never told to carry it across. So `host.suggestFolder` was
 * undefined, the store returned null, the folder field stayed empty, and the creation wizard
 * refused to advance past the step that owns that field.
 *
 * Nothing failed. Every layer was correct on its own, the type checker was satisfied because
 * the property is optional, and the only symptom was a wizard demanding something it was
 * supposed to fill in for you.
 *
 * The check is deliberately shaped as "the bridge offers it, so the host must carry it",
 * because that is the invariant. A hand-written list of method names would drift from the
 * bridge the first time somebody added one.
 */
function bridgeWith(extra: Record<string, unknown> = {}): unknown {
    const fn = () => Promise.resolve({ ok: true, value: null });
    return {
        worldlens: {
            mcserver: {
                list: fn,
                get: fn,
                save: fn,
                forget: fn,
                probe: fn,
                status: fn,
                start: fn,
                stop: fn,
                logTail: fn,
                files: { list: fn, read: fn, write: fn },
                ...extra,
            },
        },
    };
}

describe("the host carries every optional method the bridge offers", () => {
    it("resolves a host at all from a minimal bridge", () => {
        // Without this the checks below would pass on a resolver that returns null for
        // everything, which is a guard that has quietly stopped guarding.
        expect(resolveServerHost(bridgeWith())).not.toBeNull();
    });

    it("carries suggestFolder when the bridge offers it", () => {
        const suggestFolder = vi.fn().mockResolvedValue({ ok: true, value: "C:/servers/demo" });
        const host = resolveServerHost(bridgeWith({ suggestFolder }));
        expect(host).not.toBeNull();
        expect(
            typeof host?.suggestFolder,
            "the bridge offers suggestFolder and the host dropped it, so the creation " +
                "wizard's folder field can never be filled in and its runtime step cannot " +
                "be passed",
        ).toBe("function");
    });

    it("leaves suggestFolder off when the bridge does not offer it", () => {
        // An older shell must degrade rather than produce a host with a method that throws.
        const host = resolveServerHost(bridgeWith());
        expect(host?.suggestFolder).toBeUndefined();
    });
});

describe("SSH readiness host forwarding", () => {
    const request: SshReadinessRequest = {
        hostId: "host-one",
        parentDirectory: "/srv/servers",
        javaPath: "/usr/bin/java",
        memoryMb: 2048,
        port: 25565,
        flavour: "vanilla",
        version: "1.21.4",
    };

    it("preserves function identity and delegates through the resolved store", async () => {
        const response: Answer<SshReadinessResult> = {
            ok: false,
            failure: { code: "unsupported", message: "not observed", detail: null },
        };
        const sshProcessPreflight = vi.fn().mockResolvedValue(response);
        const host = resolveServerHost(bridgeWith({ sshProcessPreflight }));
        expect(host?.sshProcessPreflight).toBe(sshProcessPreflight);
        const store = createServerStore({ host });
        expect(store.hasSshReadiness).toBe(true);
        expect(await store.sshProcessPreflight(request)).toBe(response);
        expect(sshProcessPreflight).toHaveBeenCalledExactlyOnceWith(request);
    });

    it.each([undefined, null, false, 1, "check", {}, []].map((value) => ({ value })))(
        "omits non-function readiness $value without rejecting the legacy host",
        async ({ value: sshProcessPreflight }) => {
            const host = resolveServerHost(bridgeWith({ sshProcessPreflight }));
            expect(host).not.toBeNull();
            expect(host).not.toHaveProperty("sshProcessPreflight");
            const store = createServerStore({ host });
            expect(store.hasSshReadiness).toBe(false);
            expect((await store.sshProcessPreflight(request)).ok).toBe(false);
        },
    );
});
