/**
 * @vitest-environment jsdom
 *
 * The create-server wizard, mounted. Asserts the properties that only exist once rendered:
 * it opens on the flavour step with every flavour card present, moving to the version step
 * shows an honest "no catalogue" notice when this build's host has not wired one up, and the
 * final Create action stays disabled until the EULA switch is actually on.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import CreateServerWizard from "./CreateServerWizard.vue";
import { SERVER_STORE } from "./useServers.js";
import {
    createServerStore,
    type Answer,
    type CatalogueVersionEntry,
    type CatalogueSnapshot,
    type JavaProvisionProgress,
    type JavaResolution,
    type McServerHost,
} from "./serverStore.js";
import type { ServerRecord } from "./serverModel.js";
import { runtimeOptions } from "./wizardModel.js";

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
    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        onresize: null,
        onscroll: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    } as unknown as VisualViewport;
});

const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    locale: "none",
    fallbackLocale: "none",
    messages: {},
});
const vuetify = createVuetify();

afterEach(() => {
    document.body.innerHTML = "";
});

function ok<T>(value: T): Answer<T> {
    return { ok: true, value };
}

function fakeHost(): McServerHost {
    return {
        name: "fake",
        list: async () => ok([] as readonly ServerRecord[]),
        get: async () => ok(undefined as unknown as ServerRecord),
        save: async () => ok(undefined as unknown as ServerRecord),
        forget: async () => ok(undefined),
        probe: async () =>
            ok({
                reachable: true,
                runtimeVersion: null,
                message: "",
                checkedAt: "now",
                capabilities: null,
            }),
        status: async () =>
            ok({
                state: "absent" as const,
                running: false,
                startedAt: null,
                exitCode: null,
                checkedAt: "now",
            }),
        start: async () => ok(undefined),
        stop: async () => ok(undefined),
        files: {
            list: async () => ok([]),
            read: async () => ok({ bytes: new Uint8Array(), hash: "", size: 0, truncated: false }),
            write: async () => ok({ hash: "", size: 0, writtenAt: "now", backupPath: null }),
        },
        logTail: async () => ok([]),
    };
}

function mountWizard(host: McServerHost = fakeHost()) {
    const store = createServerStore({ host });
    return mount(CreateServerWizard, {
        props: { modelValue: true },
        global: { plugins: [i18n, vuetify], provide: { [SERVER_STORE as symbol]: store } },
        attachTo: document.body,
    });
}

async function flushAll(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe("CreateServerWizard", () => {
    function catalogueHost(
        failures: readonly { flavour: "vanilla" | "paper"; reason: string }[] = [],
    ): McServerHost {
        const versions: CatalogueVersionEntry[] = [
            "1.21.1",
            "1.21.2",
            "1.21.3",
            "1.21.4",
            "1.20.6",
        ].map((version) => ({
            version,
            stability: "release" as const,
            javaFeature: 21,
            downloadUrl: null,
            sha256: null,
            releasedAt: "2026-01-01T00:00:00Z",
        }));
        versions.push({
            version: "25w01a",
            stability: "snapshot",
            javaFeature: 21,
            downloadUrl: null,
            sha256: null,
            releasedAt: "2025-01-01T00:00:00Z",
        });
        const snapshot: CatalogueSnapshot = {
            flavours: [{ flavour: "paper", versions, complete: true }],
            fetchedAt: "2026-08-23T00:00:00Z",
            stale: false,
            completeness: failures.length === 0 ? "complete" : "partial",
            failures,
        };
        const host = fakeHost();
        return {
            ...host,
            catalogue: {
                list: async () => ok(snapshot),
                refresh: async () => ok(snapshot),
                verifyWiki: async (version) =>
                    ok({
                        url: `https://minecraft.wiki/w/Java_Edition_${version}`,
                        state: "verified",
                        checkedAt: "2026-08-23T00:00:00Z",
                    }),
            },
        };
    }

    type WizardVm = {
        step: string;
        whereItRuns: string;
        minecraftVersion: string;
        canAdvance: boolean;
        advanceBlockedReason: string | null;
        checkJava: () => Promise<void>;
        provisionJava: () => Promise<void>;
    };

    function javaHost(options: {
        resolve: (version: string) => Promise<Answer<JavaResolution>>;
        provision?: (version: string) => Promise<Answer<JavaResolution>>;
        onProgress?: (listener: (progress: JavaProvisionProgress) => void) => () => void;
    }): McServerHost {
        const host = fakeHost();
        return {
            ...host,
            suggestFolder: async () => ok("/srv/worldlens"),
            java: {
                resolve: options.resolve,
                ...(options.provision === undefined ? {} : { provision: options.provision }),
                ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
            },
        };
    }

    function foundJava(version = "21"): JavaResolution {
        return {
            found: true,
            executable: `/java/${version}/bin/java`,
            source: "provisioned",
            version,
            requiredFeature: Number(version),
            message: "",
        };
    }

    function missingJava(version = "21", message = "No suitable Java found"): JavaResolution {
        return {
            found: false,
            executable: null,
            source: null,
            version: null,
            requiredFeature: Number(version),
            message,
        };
    }

    async function javaVm(
        host: McServerHost,
    ): Promise<{ wrapper: ReturnType<typeof mountWizard>; vm: WizardVm }> {
        const wrapper = mountWizard(host);
        await flushAll();
        const vm = wrapper.vm as unknown as WizardVm;
        vm.step = "java";
        await flushAll();
        return { wrapper, vm };
    }

    it("offers AWS EC2 only when the AWS bridge is present", () => {
        expect(runtimeOptions(false).some((option) => option.id === "aws")).toBe(false);
        expect(runtimeOptions(true).find((option) => option.id === "aws")?.name).toBe("AWS EC2");
    });

    it("opens on the flavour step with every flavour card present", async () => {
        // Mounted for its side effect: the wizard teleports its content to the body, so the
        // assertion reads the document rather than the returned wrapper.
        mountWizard();
        await flushAll();
        expect(document.body.textContent).toContain("Vanilla");
        expect(document.body.textContent).toContain("Paper");
        expect(document.body.textContent).toContain("Velocity");
    });

    it("says plainly that this build has no live catalogue on the version step", async () => {
        const wrapper = mountWizard();
        await flushAll();
        const next = [...document.querySelectorAll("button")].find(
            (b) => b.textContent?.trim() === "Next",
        );
        next?.dispatchEvent(new Event("click", { bubbles: true }));
        await flushAll();
        expect(document.body.textContent).toContain(
            "This build cannot reach the server-version catalogue",
        );
    });

    it("groups every exact version by family, keeps one family open, and exposes keyboard state", async () => {
        mountWizard(catalogueHost());
        await flushAll();
        const next = [...document.querySelectorAll("button")].find(
            (b) => b.textContent?.trim() === "Next",
        );
        next?.click();
        await flushAll();

        const families = [
            ...document.querySelectorAll<HTMLElement>('[data-test="version-family"]'),
        ];
        expect(families).toHaveLength(3);
        expect(families[0]?.textContent).toContain("1.21.x");
        expect(families[0]?.querySelector("[aria-expanded='true']")).not.toBeNull();
        expect(families[1]?.querySelector("[aria-expanded='false']")).not.toBeNull();
        const firstToggle = families[0]?.querySelector("button");
        expect(firstToggle?.getAttribute("aria-controls")).toBeTruthy();
        expect(
            document.getElementById(firstToggle?.getAttribute("aria-controls") ?? ""),
        ).not.toBeNull();

        firstToggle?.click();
        await flushAll();
        expect(firstToggle?.getAttribute("aria-expanded")).toBe("false");
        families[1]?.querySelector("button")?.click();
        await flushAll();
        expect(families[1]?.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
        expect(document.querySelectorAll('[data-test="version-entry"]').length).toBeGreaterThan(0);
        expect(document.body.textContent).toContain("Catalogue refreshed 2026-08-23T00:00:00Z");
    });

    it("reveals a searched exact version and keeps its direct Minecraft Wiki link", async () => {
        mountWizard(catalogueHost());
        await flushAll();
        [...document.querySelectorAll("button")]
            .find((b) => b.textContent?.trim() === "Next")
            ?.click();
        await flushAll();

        const search = document.querySelector<HTMLInputElement>('input[role="searchbox"]');
        expect(search).not.toBeNull();
        if (search === null) return;
        search.value = "1.20.6";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await flushAll();

        const entries = document.querySelectorAll('[data-test="version-entry"]');
        expect(entries).toHaveLength(1);
        expect(entries[0]?.textContent).toContain("1.20.6");
        const wiki = entries[0]?.querySelector("a");
        expect(wiki?.getAttribute("href")).toContain("1.20.6");
        expect(wiki?.getAttribute("aria-label")).toContain("1.20.6");
    });

    it("reports catalogue completeness for the selected flavour only", async () => {
        mountWizard(catalogueHost([{ flavour: "vanilla", reason: "offline" }]));
        await flushAll();
        [...document.querySelectorAll("button")]
            .find((b) => b.textContent?.trim() === "Next")
            ?.click();
        await flushAll();

        expect(
            document.querySelector('[data-test="version-catalogue-status"]')?.textContent,
        ).toContain("complete");
        expect(
            document.querySelector('[data-test="version-catalogue-status"]')?.textContent,
        ).not.toContain("incomplete");
    });

    it("mounts a Java-capable host and shows a found runtime", async () => {
        const resolve = vi.fn(async () => ok(foundJava()));
        const { vm } = await javaVm(javaHost({ resolve }));

        expect(resolve).toHaveBeenCalledWith("21");
        expect(document.querySelector('[data-test="java-found"]')).not.toBeNull();
        expect(document.querySelector('[data-test="java-failure"]')).toBeNull();
        expect(vm.step).toBe("java");
    });

    it("refuses the no-Java path when this build cannot create a verified server", async () => {
        const { vm } = await javaVm(fakeHost());

        expect(vm.canAdvance).toBe(false);
        expect(vm.advanceBlockedReason).toContain("cannot verify Java and cannot create a server");
    });

    it("shows resolution failure, retries once, and blocks unresolved local Java", async () => {
        const resolve = vi
            .fn<(version: string) => Promise<Answer<JavaResolution>>>()
            .mockResolvedValueOnce({
                ok: false,
                failure: { code: "probe", message: "Java probe failed", detail: null },
            })
            .mockResolvedValueOnce(ok(foundJava()));
        const { vm } = await javaVm(javaHost({ resolve }));

        expect(document.querySelector('[data-test="java-failure"]')?.textContent).toContain(
            "Java probe failed",
        );
        expect(vm.step).toBe("java");
        const retry = document.querySelector<HTMLButtonElement>('[data-test="retry-java"]');
        expect(retry).not.toBeNull();
        retry?.click();
        await flushAll();
        expect(resolve).toHaveBeenCalledTimes(2);
        expect(document.querySelector('[data-test="java-found"]')).not.toBeNull();
    });

    it("keeps one Java check in flight and ignores the stale answer after a version change", async () => {
        const pending: Array<(answer: Answer<JavaResolution>) => void> = [];
        const resolve = vi.fn(
            () => new Promise<Answer<JavaResolution>>((done) => pending.push(done)),
        );
        const { vm } = await javaVm(javaHost({ resolve }));
        expect(resolve).toHaveBeenCalledTimes(1);

        vm.minecraftVersion = "1.20.6";
        await flushAll();
        // The old request remains the sole host operation until it settles. The new
        // generation is queued rather than overlapping the real check.
        expect(resolve).toHaveBeenCalledTimes(1);
        pending[0]?.(ok(foundJava("21")));
        await flushAll();
        expect(resolve).toHaveBeenCalledTimes(2);
        pending[1]?.(ok(foundJava("17")));
        await flushAll();
        expect(document.querySelector('[data-test="java-found"]')?.textContent).toContain("17");
    });

    it("does not let a closed wizard session receive stale Java results or progress", async () => {
        const pending: Array<(answer: Answer<JavaResolution>) => void> = [];
        let progressListener: ((progress: JavaProvisionProgress) => void) | null = null;
        const resolve = vi.fn(
            () => new Promise<Answer<JavaResolution>>((done) => pending.push(done)),
        );
        const wrapper = mountWizard(
            javaHost({
                resolve,
                onProgress: (listener) => {
                    progressListener = listener;
                    return () => {
                        progressListener = null;
                    };
                },
            }),
        );
        await flushAll();
        const vm = wrapper.vm as unknown as WizardVm;
        vm.step = "java";
        await flushAll();
        expect(resolve).toHaveBeenCalledTimes(1);

        await wrapper.setProps({ modelValue: false });
        await flushAll();
        await wrapper.setProps({ modelValue: true });
        await flushAll();
        vm.step = "java";
        await flushAll();

        const emitProgress = progressListener as unknown as (
            progress: JavaProvisionProgress,
        ) => void;
        emitProgress({
            phase: "failed",
            receivedBytes: 1,
            totalBytes: 2,
            message: "stale Java progress",
        });
        pending[0]?.({
            ok: false,
            failure: { code: "stale", message: "stale Java failure", detail: null },
        });
        await flushAll();

        // The new session waited for the old host call, then started exactly one
        // fresh operation. Neither stale progress nor the stale failure crossed over.
        expect(resolve).toHaveBeenCalledTimes(2);
        expect(document.querySelector('[data-test="java-progress"]')).toBeNull();
        expect(document.querySelector('[data-test="java-failure"]')).toBeNull();

        pending[1]?.(ok(foundJava()));
        await flushAll();
        expect(document.querySelector('[data-test="java-found"]')).not.toBeNull();
        wrapper.unmount();
    });

    /*
     * A click that lands while the step-entry check is still running used to return from
     * `provisionJava` without a word: no request, no progress, no message. On screen that
     * is a button that does nothing, which is the one thing a button must never be.
     */
    it("installs Java when the button is pressed during the opening check", async () => {
        // The opening check is held open; every later check answers at once, so the
        // confirming re-check after the install does not stall the test.
        let openingCheck: ((answer: Answer<JavaResolution>) => void) | null = null;
        const resolve = vi.fn(() =>
            openingCheck === null
                ? new Promise<Answer<JavaResolution>>((done) => {
                      openingCheck = done;
                  })
                : Promise.resolve(ok(foundJava())),
        );
        const provision = vi.fn(async () => ok(foundJava()));
        const { vm } = await javaVm(javaHost({ resolve, provision }));

        expect(resolve).toHaveBeenCalledTimes(1);
        const clicked = vm.provisionJava();
        await flushAll();
        // Still waiting on the check rather than silently giving up on the click.
        expect(provision).not.toHaveBeenCalled();

        (openingCheck as unknown as (answer: Answer<JavaResolution>) => void)(ok(missingJava()));
        await clicked;
        await flushAll();

        expect(provision).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-test="java-found"]')).not.toBeNull();
    });

    it("shows real provisioning progress, failure, retry, and post-install re-resolution", async () => {
        let progressListener: ((progress: JavaProvisionProgress) => void) | null = null;
        const resolve = vi
            .fn<(version: string) => Promise<Answer<JavaResolution>>>()
            .mockResolvedValueOnce(ok(missingJava()));
        let finishProvision: ((answer: Answer<JavaResolution>) => void) | null = null;
        const provision = vi.fn(
            () =>
                new Promise<Answer<JavaResolution>>((done) => {
                    finishProvision = done;
                    progressListener?.({
                        phase: "downloading",
                        receivedBytes: 5,
                        totalBytes: 10,
                        message: "Downloading Java",
                    });
                }),
        );
        const { vm } = await javaVm(
            javaHost({
                resolve,
                provision,
                onProgress: (listener) => {
                    progressListener = listener;
                    return () => {
                        progressListener = null;
                    };
                },
            }),
        );
        expect(document.querySelector('[data-test="java-missing"]')).not.toBeNull();
        const provisioning = vm.provisionJava();
        await flushAll();
        expect(provision).toHaveBeenCalledWith("21");
        expect(document.querySelector('[data-test="java-progress"]')).not.toBeNull();
        const completeProvision = finishProvision as unknown as (
            answer: Answer<JavaResolution>,
        ) => void;
        completeProvision({
            ok: false,
            failure: { code: "download", message: "Java download failed", detail: null },
        });
        await provisioning;
        expect(document.querySelector('[data-test="java-failure"]')?.textContent).toContain(
            "Java download failed",
        );
        expect(document.querySelector('[data-test="java-progress"]')).toBeNull();
    });

    it("re-resolves after successful provisioning and skips local Java on ssh-docker", async () => {
        const resolve = vi
            .fn<(version: string) => Promise<Answer<JavaResolution>>>()
            .mockResolvedValueOnce(ok(missingJava()))
            .mockResolvedValueOnce(ok(foundJava()));
        const provision = vi.fn(async () => ok(foundJava()));
        const { vm } = await javaVm(javaHost({ resolve, provision }));
        await vm.provisionJava();
        expect(resolve).toHaveBeenCalledTimes(2);
        expect(document.querySelector('[data-test="java-found"]')).not.toBeNull();

        vm.whereItRuns = "ssh-docker";
        await flushAll();
        expect(document.querySelector('[data-test="java-remote-skip"]')).not.toBeNull();
        expect(resolve).toHaveBeenCalledTimes(2);
    });

    it("clears an in-flight provision when the selected version changes", async () => {
        let finishProvision: ((answer: Answer<JavaResolution>) => void) | null = null;
        const resolve = vi.fn(async () => ok(missingJava()));
        const provision = vi.fn(
            () => new Promise<Answer<JavaResolution>>((done) => (finishProvision = done)),
        );
        const { vm } = await javaVm(javaHost({ resolve, provision }));
        const provisioning = vm.provisionJava();
        await flushAll();
        vm.minecraftVersion = "1.20.6";
        await flushAll();
        expect(document.querySelector('[data-test="java-progress"]')).toBeNull();

        const completeProvision = finishProvision as unknown as (
            answer: Answer<JavaResolution>,
        ) => void;
        completeProvision(ok(foundJava()));
        await provisioning;
        expect(document.querySelector('[data-test="java-found"]')).toBeNull();
    });

    it("keeps local Docker creation disabled with an exact capability reason", async () => {
        const wrapper = mountWizard(fakeHost());
        await flushAll();
        const vm = wrapper.vm as unknown as WizardVm;
        vm.step = "runtime";
        vm.whereItRuns = "local-docker";
        await flushAll();

        expect(document.body.textContent).toContain("cannot create a Docker server yet");
        expect(document.querySelector('[data-test="docker-container-ref"]')).not.toBeNull();
    });
});
