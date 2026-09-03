/**
 * What this file is for, stated plainly, because it is carrying real weight.
 *
 * `createWorldlensBridge` returns `bridge as TBridge`. That cast is the one unchecked step
 * in the whole package, and it exists for a reason given at length in `factory.ts`: the
 * contract names ~92 types spread across 20 feature modules in the package that depends on
 * this one, so importing them back would be a build cycle. The compiler therefore cannot
 * tell you that a method is missing, that a channel name is misspelt, or that an event
 * subscription forgot to unsubscribe.
 *
 * None of which the compiler was ever going to tell you anyway - a typo inside a string
 * literal is invisible to it, and channel names are string literals. So these tests are not
 * a consolation prize for the cast. They check things the type system was never checking.
 */
import { describe, expect, it } from "vitest";
import { createWorldlensBridge } from "./factory.js";
import type { BridgeTransport } from "./transport.js";

interface Recorded {
    readonly invoked: { channel: string; args: readonly unknown[] }[];
    readonly listening: string[];
    readonly stoppedListening: string[];
}

function recordingTransport(): { transport: BridgeTransport; log: Recorded } {
    const log: Recorded = { invoked: [], listening: [], stoppedListening: [] };
    const transport: BridgeTransport = {
        invoke: (channel, ...args) => {
            log.invoked.push({ channel, args });
            return Promise.resolve(null);
        },
        on: (channel) => {
            log.listening.push(channel);
        },
        off: (channel) => {
            log.stoppedListening.push(channel);
        },
        sendSync: () => null,
        setZoomFactor: () => undefined,
        getPathForFile: () => null,
        pathSeparator: "/",
    };
    return { transport, log };
}

/** Every function on the object, including nested ones, as dotted paths. */
function methodPaths(value: unknown, prefix = ""): string[] {
    if (value === null || typeof value !== "object") return [];
    const found: string[] = [];
    for (const [key, member] of Object.entries(value as Record<string, unknown>)) {
        const path = prefix === "" ? key : `${prefix}.${key}`;
        if (typeof member === "function") found.push(path);
        else if (member !== null && typeof member === "object")
            found.push(...methodPaths(member, path));
    }
    return found;
}

describe("the object the factory builds", () => {
    it("carries the whole bridge rather than whichever half survived the move", () => {
        const { transport } = recordingTransport();
        const bridge = createWorldlensBridge<Record<string, unknown>>(transport);
        const methods = methodPaths(bridge);

        // A floor rather than an exact count, deliberately: pinning the exact number would
        // fail on every legitimate addition and teach the next person to edit the number
        // rather than read the failure. What it catches is the failure that matters - a
        // whole namespace silently not arriving.
        expect(methods.length).toBeGreaterThan(300);

        // One representative from each corner of the object, chosen so that a namespace
        // going missing wholesale cannot pass.
        for (const path of [
            "getVersion",
            "getBuildProvenance",
            "schoolMode.read",
            "mcserver.list",
            "mcserver.hostProfiles.list",
            "mcserver.backup.issueRestoreChallenge",
            "dockerHosting.create",
            "history.status",
            "project.readProject",
            "gallery.list",
            "converter.catalog",
            "ollama.runtimeEnsure",
            "runtimeSettings.status",
            "dialog.pickFolder",
            "locks.vault.put",
            "repair.issueReport.draft",
        ]) {
            expect(methods, `${path} is missing from the built bridge`).toContain(path);
        }
    });

    it("reaches the channel each method claims, not a neighbouring one", async () => {
        const { transport, log } = recordingTransport();
        const bridge = createWorldlensBridge<Record<string, never>>(transport);

        // A misspelt channel is the exact defect the compiler cannot see, because it is a
        // string literal. These pairs are the check for it.
        const calls: [() => Promise<unknown>, string][] = [
            [
                () => (bridge as never as { getVersion(): Promise<unknown> }).getVersion(),
                "app:version",
            ],
            [
                () =>
                    (
                        bridge as never as { getBuildProvenance(): Promise<unknown> }
                    ).getBuildProvenance(),
                "app:buildProvenance",
            ],
            [
                () =>
                    (
                        bridge as never as { schoolMode: { read(): Promise<unknown> } }
                    ).schoolMode.read(),
                "schoolMode:read",
            ],
            [
                () =>
                    (
                        bridge as never as { history: { status(): Promise<unknown> } }
                    ).history.status(),
                "history:status",
            ],
            [
                () =>
                    (
                        bridge as never as {
                            mcserver: {
                                catalogue: { verifyWiki(version: string): Promise<unknown> };
                            };
                        }
                    ).mcserver.catalogue.verifyWiki("1.21.4"),
                "mcserver:catalogue:wikiVerify",
            ],
            [
                () =>
                    (
                        bridge as never as {
                            mcserver: { hostProfiles: { get(id: string): Promise<unknown> } };
                        }
                    ).mcserver.hostProfiles.get("host-1"),
                "mcserver:hostProfiles:get",
            ],
            [
                () =>
                    (
                        bridge as never as {
                            mcserver: {
                                backup: {
                                    issueRestoreChallenge(
                                        id: string,
                                        request: unknown,
                                    ): Promise<unknown>;
                                };
                            };
                        }
                    ).mcserver.backup.issueRestoreChallenge("server-1", {
                        owner: "owner",
                        repo: "repo",
                        tag: "v1",
                    }),
                "mcserver:backup:restore:challenge",
            ],
            [
                () =>
                    (
                        bridge as never as { converter: { catalog(): Promise<unknown> } }
                    ).converter.catalog(),
                "converter:catalog",
            ],
            [
                () =>
                    (
                        bridge as never as {
                            converter: { openInEditor(path: string): Promise<unknown> };
                        }
                    ).converter.openInEditor("C:/maps/export.json"),
                "converter:openInEditor",
            ],
            [
                () =>
                    (
                        bridge as never as { ollama: { catalogRefresh(): Promise<unknown> } }
                    ).ollama.catalogRefresh(),
                "ollama:catalogRefresh",
            ],
            [
                () =>
                    (
                        bridge as never as { ollama: { runtimeEnsure(): Promise<unknown> } }
                    ).ollama.runtimeEnsure(),
                "ollama:runtimeEnsure",
            ],
            [
                () =>
                    (
                        bridge as never as {
                            ollama: {
                                generate(request: unknown, operationId: string): Promise<unknown>;
                            };
                        }
                    ).ollama.generate({ model: "local-model" }, "operation-1"),
                "ollama:generate",
            ],
            [
                () =>
                    (
                        bridge as never as {
                            ollama: { cancel(operationId: string): Promise<unknown> };
                        }
                    ).ollama.cancel("operation-1"),
                "ollama:cancel",
            ],
            [
                () =>
                    (
                        bridge as never as { runtimeSettings: { status(): Promise<unknown> } }
                    ).runtimeSettings.status(),
                "runtimeSettings:status",
            ],
            [
                () =>
                    (
                        bridge as never as {
                            runtimeSettings: {
                                saveHomeAssistant(input: unknown): Promise<unknown>;
                            };
                        }
                    ).runtimeSettings.saveHomeAssistant({ id: "home" }),
                "runtimeSettings:saveHomeAssistant",
            ],
            [
                () =>
                    (
                        bridge as never as {
                            runtimeSettings: { statusHubRegister(): Promise<unknown> };
                        }
                    ).runtimeSettings.statusHubRegister(),
                "runtimeSettings:statusHubRegister",
            ],
            [
                () =>
                    (
                        bridge as never as {
                            runtimeSettings: { historyRestore(id: string): Promise<unknown> };
                        }
                    ).runtimeSettings.historyRestore("revision-1"),
                "runtimeSettings:historyRestore",
            ],
        ];
        for (const [call, expected] of calls) {
            log.invoked.length = 0;
            await call();
            expect(log.invoked.map((entry) => entry.channel)).toEqual([expected]);
        }
    });

    it("hands back an unsubscribe that actually stops the listener it started", () => {
        const { transport, log } = recordingTransport();
        const bridge = createWorldlensBridge<Record<string, never>>(transport);

        const subscribe = (
            bridge as never as {
                onRenderEvent(listener: () => void): () => void;
            }
        ).onRenderEvent;
        const stop = subscribe(() => undefined);

        expect(log.listening).toEqual(["render:event"]);
        expect(log.stoppedListening).toEqual([]);
        stop();
        // Same channel, and it happened because the returned closure was called - a method
        // that subscribed and returned nothing usable would leak a listener on every mount.
        expect(log.stoppedListening).toEqual(["render:event"]);
    });

    it("subscribes and unsubscribes both local-model progress streams", () => {
        const { transport, log } = recordingTransport();
        const bridge = createWorldlensBridge<Record<string, never>>(transport) as never as {
            ollama: {
                onStreamProgress(listener: () => void): () => void;
                onRuntimeProgress(listener: () => void): () => void;
            };
        };

        const stopStream = bridge.ollama.onStreamProgress(() => undefined);
        const stopRuntime = bridge.ollama.onRuntimeProgress(() => undefined);

        expect(log.listening).toEqual(["ollama:streamProgress", "ollama:runtimeProgress"]);
        expect(log.stoppedListening).toEqual([]);
        stopStream();
        stopRuntime();
        expect(log.stoppedListening).toEqual(["ollama:streamProgress", "ollama:runtimeProgress"]);
    });

    it("never touches the transport merely by being built", () => {
        // Construction has to be free of side effects: the preload builds this before the
        // renderer exists, and a stray invoke here would fire against a main process that
        // has not finished registering its handlers.
        const { transport, log } = recordingTransport();
        createWorldlensBridge<Record<string, never>>(transport);

        expect(log.invoked).toEqual([]);
        expect(log.listening).toEqual([]);
    });
});
