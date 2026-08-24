// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import SshWorldSourcePanel from "./SshWorldSourcePanel.vue";
import type { RemoteBridge, RemoteTarget, TargetStorage } from "../remote/index.js";
import type { SshWorldSourceBridge, SshWorldSourceEvent } from "./sshWorldSourceBridge.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
    Element.prototype.scrollIntoView = () => {};
});

const target: RemoteTarget = {
    id: "server",
    label: "Backyard server",
    host: "server.lan",
    port: 22,
    user: "minecraft",
    identityFile: null,
    workDir: "/srv/bluemap",
    image: "eclipse-temurin:21-jre",
    docker: "docker",
    keepRemoteFiles: false,
};

function memoryStorage(targets: readonly RemoteTarget[] = [target]): TargetStorage {
    const values = new Map<string, string>([
        ["worldlens-remote-targets", JSON.stringify({ version: 1, targets })],
    ]);
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
}

function remoteBridge(): RemoteBridge {
    return {
        validateRemoteTarget: async () => ({ ok: true, target, summary: "valid" }),
        describeRemoteTarget: async () => ({ ok: false, message: "not needed" }),
        remotePreflight: async () => {
            throw new Error("not needed");
        },
        trustRemoteHostKey: async () => ({ ok: false, message: "not needed" }),
        startRemoteRender: async () => {
            throw new Error("not needed");
        },
        cancelRemoteRender: async () => false,
        activeRemoteRenders: async () => [],
        browseRemoteDirectory: async (_target, path) => ({
            ok: true,
            listing: {
                path,
                os: "linux",
                separator: "/",
                entries: [],
                truncated: false,
                totalEntries: 0,
            },
        }),
        canDescribe: false,
        canTrustHostKey: false,
        canCancel: false,
        canSeeActive: false,
        canBrowse: true,
    };
}

function sshBridge() {
    const listeners = new Set<(event: SshWorldSourceEvent) => void>();
    let trusted = false;
    const bridge: SshWorldSourceBridge = {
        validate: vi.fn(async () => ({ ok: true as const, target, summary: "valid" })),
        detect: vi.fn(async () =>
            trusted
                ? { ok: true as const, kind: "posix" as const, detail: "Linux" }
                : {
                      ok: false as const,
                      message: "This host key is unknown.",
                      hostKeys: [
                          {
                              type: "ssh-ed25519",
                              base64: "AAAA",
                              fingerprint: "SHA256:review-me",
                              line: "server ssh-ed25519 AAAA",
                          },
                      ],
                  },
        ),
        trustHostKey: vi.fn(async (_target, fingerprint) => {
            trusted = fingerprint === "SHA256:review-me";
            return {
                ok: trusted,
                message: trusted ? "Fingerprint recorded after re-scan." : "Fingerprint changed.",
            };
        }),
        checkPath: vi.fn(async (path) => ({ ok: true as const, path })),
        survey: vi.fn(async () => ({
            ok: true as const,
            kind: "posix" as const,
            entries: [
                { path: "level.dat", size: 64, mtimeMs: 1 },
                { path: "region/r.0.0.mca", size: 4096, mtimeMs: 2 },
            ],
        })),
        diff: vi.fn(async () => ({
            added: [],
            changed: [],
            removed: [],
            unchanged: 2,
            anyChange: false,
        })),
        fetch: vi.fn(async () => {
            listeners.forEach((listener) =>
                listener({ kind: "line", id: "fetch-1", message: "Sending with rsync" }),
            );
            return {
                id: "fetch-1",
                result: {
                    ok: true as const,
                    kind: "posix" as const,
                    transfer: "rsync" as const,
                    message: "resumable",
                },
            };
        }),
        cancel: vi.fn(async () => true),
        active: vi.fn(async () => []),
        onSshWorldSourceEvent: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    return Object.assign(bridge, {
        fire(event: SshWorldSourceEvent): void {
            listeners.forEach((listener) => listener(event));
        },
    });
}

function mounted(bridge: SshWorldSourceBridge) {
    return mount(SshWorldSourcePanel, {
        props: { bridge, remoteBridge: remoteBridge(), storage: memoryStorage() },
        global: {
            plugins: [
                createVuetify(),
                createI18n({
                    legacy: false,
                    missingWarn: false,
                    fallbackWarn: false,
                    locale: "none",
                    fallbackLocale: "none",
                    messages: {},
                }),
            ],
            stubs: {
                AppearanceTarget: { template: "<section><slot /></section>" },
                ConfigSearchField: { template: "<div data-test='search-with-regex-builder' />" },
                RemoteTargetEditor: { template: "<div data-test='real-target-editor' />" },
                RemoteFileBrowser: { template: "<div data-test='real-remote-browser' />" },
                PathField: { template: "<div data-test='local-path-field' />" },
            },
        },
    });
}

describe("the mounted SSH world-source wizard path", () => {
    it("requires reviewed trust, surveys a real world, fetches it, and hands the local folder back", async () => {
        const bridge = sshBridge();
        const wrapper = mounted(bridge);
        await wrapper.get("[data-test='ssh-open']").trigger("click");
        const vm = wrapper.vm as unknown as {
            chooseTarget(id: string): void;
            detect(): Promise<void>;
            trust(key: {
                type: string;
                base64: string;
                fingerprint: string;
                line: string;
            }): Promise<void>;
            chooseRemoteFolder(path: string): void;
            surveyRemote(): Promise<void>;
            localParent: string;
            fetchWorld(): Promise<void>;
        };

        vm.chooseTarget("server");
        await vm.detect();
        await flushPromises();
        expect(wrapper.text()).toContain("SHA256:review-me");
        expect(wrapper.find("[data-test='ssh-browse']").attributes("disabled")).toBeDefined();

        await vm.trust({
            type: "ssh-ed25519",
            base64: "AAAA",
            fingerprint: "SHA256:review-me",
            line: "server ssh-ed25519 AAAA",
        });
        vm.chooseRemoteFolder("/srv/minecraft/world");
        await vm.surveyRemote();
        vm.localParent = "C:\\Fetched Worlds";
        await vm.fetchWorld();
        await flushPromises();

        expect(bridge.trustHostKey).toHaveBeenCalledWith(target, "SHA256:review-me");
        expect(bridge.survey).toHaveBeenCalledWith(target, "/srv/minecraft/world", "posix");
        expect(bridge.fetch).toHaveBeenCalledWith({
            target,
            remotePath: "/srv/minecraft/world",
            localPath: "C:\\Fetched Worlds",
        });
        expect(wrapper.emitted("use")).toEqual([["C:\\Fetched Worlds\\world"]]);
        expect(wrapper.text()).toContain("1 progress messages received");
        wrapper.unmount();
    });

    it("registers the panel search and the reused target/browser surfaces", async () => {
        const wrapper = mounted(sshBridge());
        await wrapper.get("[data-test='ssh-open']").trigger("click");
        expect(wrapper.find("[data-test='search-with-regex-builder']").exists()).toBe(true);
        expect(wrapper.find("[data-test='real-target-editor']").exists()).toBe(true);
        expect(wrapper.find("[data-test='local-path-field']").exists()).toBe(true);
        wrapper.unmount();
    });

    it("reports cancellation rejection without an unhandled promise", async () => {
        const bridge = sshBridge();
        bridge.cancel = vi.fn(async () => {
            throw new Error("cancel socket refused");
        });
        const wrapper = mounted(bridge);
        const vm = wrapper.vm as unknown as {
            fetchId: string | null;
            cancelFetch(): Promise<boolean>;
            fetchFailure: string | null;
        };
        vm.fetchId = "fetch-1";
        await vm.cancelFetch();
        expect(vm.fetchFailure).toContain("cancel socket refused");
        wrapper.unmount();
    });

    it("keeps a pending close honest when cancellation never settles", async () => {
        vi.useFakeTimers();
        try {
            const bridge = sshBridge();
            let resolveCancel!: (confirmed: boolean) => void;
            bridge.cancel = vi.fn(
                () => new Promise<boolean>((resolve) => {
                    resolveCancel = resolve;
                }),
            );
            const wrapper = mounted(bridge);
            const vm = wrapper.vm as unknown as {
                fetchId: string | null;
                cancelFetch(): Promise<boolean>;
                fetchFailure: string | null;
                fetching: boolean;
                cancellationPending: boolean;
            };
            vm.fetchId = "fetch-1";
            const pending = vm.cancelFetch();
            await vi.advanceTimersByTimeAsync(5000);
            expect(vm.fetching).toBe(false);
            expect(vm.cancellationPending).toBe(true);
            expect(vm.fetchFailure).toContain("not been confirmed after five seconds");
            resolveCancel(true);
            await pending;
            expect(vm.fetching).toBe(false);
            expect(vm.cancellationPending).toBe(false);
            wrapper.unmount();
        } finally {
            vi.useRealTimers();
        }
    });

    it("ignores late progress and success after a timed-out cancellation", async () => {
        vi.useFakeTimers();
        try {
            const bridge = sshBridge();
            type FetchResult = Awaited<ReturnType<SshWorldSourceBridge["fetch"]>>;
            let resolveFetch!: (value: FetchResult) => void;
            bridge.fetch = vi.fn(
                () => new Promise<FetchResult>((resolve) => {
                    resolveFetch = resolve;
                }),
            );
            let resolveCancel!: (confirmed: boolean) => void;
            bridge.cancel = vi.fn(
                () => new Promise<boolean>((resolve) => {
                    resolveCancel = resolve;
                }),
            );
            const wrapper = mounted(bridge);
            const vm = wrapper.vm as unknown as {
                chooseTarget(id: string): void;
                detect(): Promise<void>;
                trust(key: { type: string; base64: string; fingerprint: string; line: string }): Promise<void>;
                chooseRemoteFolder(path: string): void;
                surveyRemote(): Promise<void>;
                localParent: string;
                fetchWorld(): Promise<void>;
                cancelFetch(): Promise<boolean>;
                fetchId: string | null;
                fetching: boolean;
                cancelRequested: boolean;
                cancellationPending: boolean;
                fetchLines: string[];
                fetchFailure: string | null;
            };
            await wrapper.get("[data-test='ssh-open']").trigger("click");
            vm.chooseTarget("server");
            await vm.detect();
            await vm.trust({ type: "ssh-ed25519", base64: "AAAA", fingerprint: "SHA256:review-me", line: "server ssh-ed25519 AAAA" });
            vm.chooseRemoteFolder("/srv/minecraft/world");
            await vm.surveyRemote();
            vm.localParent = "C:\\Fetched Worlds";

            const fetchPromise = vm.fetchWorld();
            await vi.runOnlyPendingTimersAsync();
            await Promise.resolve();
            bridge.fire({ kind: "line", id: "fetch-1", message: "before cancel" });
            expect(vm.fetchId).toBe("fetch-1");

            const cancelPromise = vm.cancelFetch();
            await vi.advanceTimersByTimeAsync(5000);
            expect(vm.cancelRequested).toBe(true);
            expect(vm.fetching).toBe(true);
            expect(vm.cancellationPending).toBe(true);

            bridge.fire({ kind: "line", id: "fetch-1", message: "late progress" });
            resolveFetch({
                id: "fetch-1",
                result: {
                    ok: true,
                    kind: "posix",
                    transfer: "rsync",
                    message: "late success",
                },
            });
            resolveCancel(true);
            await cancelPromise;
            await fetchPromise;
            await flushPromises();

            expect(vm.fetchLines).not.toContain("late progress");
            expect(vm.fetchFailure).toBeNull();
            expect(vm.fetching).toBe(false);
            expect(vm.cancellationPending).toBe(false);
            expect(wrapper.emitted("use")).toBeUndefined();
            wrapper.unmount();
        } finally {
            vi.useRealTimers();
        }
    });

    it("ignores a late failure after cancellation", async () => {
        const bridge = sshBridge();
        type FetchResult = Awaited<ReturnType<SshWorldSourceBridge["fetch"]>>;
        let resolveFetch!: (value: FetchResult) => void;
        bridge.fetch = vi.fn(
            () => new Promise<FetchResult>((resolve) => {
                resolveFetch = resolve;
            }),
        );
        const wrapper = mounted(bridge);
        const vm = wrapper.vm as unknown as {
            chooseTarget(id: string): void;
            detect(): Promise<void>;
            trust(key: { type: string; base64: string; fingerprint: string; line: string }): Promise<void>;
            chooseRemoteFolder(path: string): void;
            surveyRemote(): Promise<void>;
            localParent: string;
            fetchId: string | null;
            fetching: boolean;
            cancelRequested: boolean;
            cancelFetch(): Promise<boolean>;
            fetchFailure: string | null;
            fetchWorld(): Promise<void>;
        };
        await wrapper.get("[data-test='ssh-open']").trigger("click");
        vm.chooseTarget("server");
        await vm.detect();
        await vm.trust({ type: "ssh-ed25519", base64: "AAAA", fingerprint: "SHA256:review-me", line: "server ssh-ed25519 AAAA" });
        vm.chooseRemoteFolder("/srv/minecraft/world");
        await vm.surveyRemote();
        vm.localParent = "C:\\Fetched Worlds";
        const fetchPromise = vm.fetchWorld();
        await flushPromises();
        bridge.fire({ kind: "line", id: "fetch-1", message: "before cancel" });
        expect(vm.fetchId).toBe("fetch-1");
        await vm.cancelFetch();
        resolveFetch({
            id: "fetch-1",
            result: {
                ok: false,
                failure: {
                    code: "late",
                    message: "late failure",
                    detail: null,
                    setting: null,
                    remoteCode: "late",
                    target: null,
                },
                hostKeys: [],
            },
        });
        await fetchPromise;
        await flushPromises();
        expect(vm.cancelRequested).toBe(true);
        expect(vm.fetchFailure).not.toBe("late failure");
        expect(wrapper.emitted("use")).toBeUndefined();
        wrapper.unmount();
    });

    it("waits for confirmed cancellation before switching SSH targets", async () => {
        type FetchResult = Awaited<ReturnType<SshWorldSourceBridge["fetch"]>>;
        const bridge = sshBridge();
        const second: RemoteTarget = { ...target, id: "server-2", label: "Second server" };
        let resolveFetch!: (value: FetchResult) => void;
        const order: string[] = [];
        bridge.fetch = vi.fn(
            () => new Promise<FetchResult>((resolve) => {
                resolveFetch = resolve;
            }),
        );
        bridge.cancel = vi.fn(async () => {
            order.push("cancel");
            return true;
        });
        const wrapper = mount(SshWorldSourcePanel, {
            props: { bridge, remoteBridge: remoteBridge(), storage: memoryStorage([target, second]) },
            global: {
                plugins: [
                    createVuetify(),
                    createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", messages: {} }),
                ],
                stubs: {
                    AppearanceTarget: { template: "<section><slot /></section>" },
                    ConfigSearchField: { template: "<div />" },
                    RemoteTargetEditor: { template: "<div />" },
                    RemoteFileBrowser: { template: "<div />" },
                    PathField: { template: "<div />" },
                },
            },
        });
        const vm = wrapper.vm as unknown as {
            selectedId: string | null;
            chooseTarget(id: string): void;
            fetchId: string | null;
            fetchWorld(): Promise<void>;
            chooseRemoteFolder(path: string): void;
            surveyRemote(): Promise<void>;
            localParent: string;
            detect(): Promise<void>;
            trust(key: { type: string; base64: string; fingerprint: string; line: string }): Promise<void>;
        };
        vm.chooseTarget("server");
        await vm.detect();
        await vm.trust({ type: "ssh-ed25519", base64: "AAAA", fingerprint: "SHA256:review-me", line: "server ssh-ed25519 AAAA" });
        vm.chooseRemoteFolder("/srv/minecraft/world");
        await vm.surveyRemote();
        vm.localParent = "C:\\Fetched Worlds";
        void vm.fetchWorld();
        await flushPromises();
        bridge.fire({ kind: "line", id: "fetch-1", message: "started" });
        expect(vm.fetchId).toBe("fetch-1");

        vm.chooseTarget("server-2");
        expect(vm.selectedId).toBe("server");
        await flushPromises();
        expect(order).toEqual(["cancel"]);
        expect(vm.selectedId).toBe("server-2");
        resolveFetch({
            id: "fetch-1",
            result: { ok: true, kind: "posix", transfer: "rsync", message: "late" },
        });
        await flushPromises();
        expect(wrapper.emitted("use")).toBeUndefined();
        wrapper.unmount();
    });
});
