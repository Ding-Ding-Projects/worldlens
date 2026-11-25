// @vitest-environment jsdom

/**
 * The data folders section, mounted over a fake bridge: what each control shows, that Apply
 * says why it is unavailable, that it asks the main process (and only then), and that the
 * history and remote controls follow what the status says.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VSwitch } from "vuetify/components";
import DataFoldersRow from "./DataFoldersRow.vue";
import type { DataFoldersBridge, DataFoldersStatusReadout } from "./dataFoldersBridge.js";
import { createDataFoldersStore } from "./dataFoldersStore.js";

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

const vuetify = createVuetify();
const i18n = createI18n({ legacy: false, locale: "en", fallbackLocale: "en", missingWarn: false, fallbackWarn: false, messages: { en: {} } });

function baseStatus(overrides: Partial<DataFoldersStatusReadout> = {}): DataFoldersStatusReadout {
    return {
        profile: { current: "C:\\P", default: "C:\\P", pendingFolder: null, unreachable: null, removableOldFolder: null },
        save: { current: "C:\\P\\maps", default: "C:\\P\\maps", pendingFolder: null, unreachable: null, removableOldFolder: null },
        pointerProblem: null,
        history: {
            available: true,
            gitVersion: "2.45",
            unavailableReason: null,
            initialised: true,
            last: { sha: "abc", at: "2026-11-25T10:00:00Z", subject: "Update profile files: settings.json" },
            lastFailure: null,
        },
        remote: {
            enabled: false,
            url: null,
            includeCredentials: false,
            accountId: null,
            lastPush: null,
            lastError: null,
            isLocalNetwork: false,
            credentialFilesPresent: false,
            excluded: ["Folders named github-accounts, and everything inside them."],
        },
        ...overrides,
    };
}

async function mountSection(
    statusValue: DataFoldersStatusReadout,
    bridgeOverrides: Partial<DataFoldersBridge> = {},
): Promise<{ wrapper: VueWrapper; bridge: DataFoldersBridge }> {
    const bridge: DataFoldersBridge = {
        dataFoldersStatus: vi.fn(async () => statusValue),
        dataFoldersValidate: vi.fn(async (request) => ({ ok: true as const, folder: request.folder, exists: false, freeBytes: 2_000_000_000 })),
        dataFoldersMove: vi.fn(async (request) => ({
            ok: true as const,
            kind: request.kind,
            mode: request.mode,
            folder: request.folder,
            needsRestart: request.kind === "profile",
            copiedFiles: 2,
            copiedBytes: 20,
            skipped: [],
            historyIntact: true,
            oldFolderRemovable: null,
            message: "The new profile folder is ready.",
        })),
        dataFoldersRestart: vi.fn(async () => ({ ok: true })),
        ...bridgeOverrides,
    };
    const store = createDataFoldersStore({ bridge });
    const wrapper = mount(DataFoldersRow, {
        props: { store },
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    });
    await flushPromises();
    return { wrapper, bridge };
}

function credentialSwitch(wrapper: VueWrapper) {
    const found = wrapper
        .findAllComponents(VSwitch)
        .find((candidate) => String(candidate.props("label")).includes("sign-in files"));
    if (found === undefined) throw new Error("The sign-in files switch is not on screen.");
    return found;
}

describe("the data folders section", () => {
    it("shows both folders with where they are now and their defaults", async () => {
        const { wrapper } = await mountSection(baseStatus());
        expect(wrapper.find('[data-kind="profile"] [data-test="current-folder"]').text()).toBe("C:\\P");
        expect(wrapper.find('[data-kind="save"] [data-test="default-folder"]').text()).toContain("C:\\P\\maps");
        wrapper.unmount();
    });

    it("gives each folder a native browse control and a way to treat the existing data", async () => {
        const { wrapper } = await mountSection(baseStatus());
        for (const kind of ["profile", "save"]) {
            const row = wrapper.find(`[data-kind="${kind}"]`);
            expect(row.findAll('input[type="radio"]')).toHaveLength(3);
            expect(row.find(".mb-path-field").exists()).toBe(true);
        }
        wrapper.unmount();
    });

    it("says why Apply is unavailable until a different, valid folder is chosen", async () => {
        const { wrapper } = await mountSection(baseStatus());
        const row = wrapper.find('[data-kind="profile"]');
        expect(row.find('[data-test="apply-reason"]').text()).toContain("already in use");
        expect(row.find('[data-test="reset-reason"]').text()).toContain("already the default");
        expect(row.find('button[type="submit"]').attributes("disabled")).toBeDefined();
        wrapper.unmount();
    });

    it("asks the main process to move only after a valid choice, and shows the restart prompt", async () => {
        const status = baseStatus();
        const { wrapper, bridge } = await mountSection(status);
        const row = wrapper.find('[data-kind="profile"]');
        const input = row.find(".mb-path-field input");
        await input.setValue("D:\\Data\\Worldlens");
        await flushPromises();
        expect(bridge.dataFoldersValidate).toHaveBeenCalledWith({ kind: "profile", folder: "D:\\Data\\Worldlens", mode: "move" });
        expect(row.find('[data-test="free-space"]').exists()).toBe(true);
        expect(row.find('button[type="submit"]').attributes("disabled")).toBeUndefined();

        await row.trigger("submit");
        await flushPromises();
        expect(bridge.dataFoldersMove).toHaveBeenCalledWith({ kind: "profile", folder: "D:\\Data\\Worldlens", mode: "move" });
        expect(row.find('[data-test="result"]').text()).toContain("The new profile folder is ready.");
        wrapper.unmount();
    });

    it("shows a refusal under the field and never calls move", async () => {
        const { wrapper, bridge } = await mountSection(baseStatus(), {
            dataFoldersValidate: vi.fn(async () => ({ ok: false as const, code: "system-folder", message: "That is a system folder." })),
        });
        const row = wrapper.find('[data-kind="profile"]');
        await row.find(".mb-path-field input").setValue("C:\\Windows\\x");
        await flushPromises();
        expect(row.text()).toContain("system folder");
        await row.trigger("submit");
        await flushPromises();
        expect(bridge.dataFoldersMove).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it("tells the person a new profile folder waits for a restart, and offers one", async () => {
        const { wrapper, bridge } = await mountSection(
            baseStatus({ profile: { ...baseStatus().profile, pendingFolder: "D:\\Data\\Worldlens" } }),
        );
        const pending = wrapper.find('[data-test="pending"]');
        expect(pending.text()).toContain("D:\\Data\\Worldlens");
        await pending.find("button").trigger("click");
        expect(bridge.dataFoldersRestart).toHaveBeenCalled();
        wrapper.unmount();
    });

    it("reports a chosen folder that could not be reached, with both ways out", async () => {
        const { wrapper, bridge } = await mountSection(
            baseStatus({ profile: { ...baseStatus().profile, unreachable: "E:\\Gone" } }),
            { dataFoldersForgetUnreachable: vi.fn(async () => ({ ok: true, message: "ok" })) },
        );
        const warning = wrapper.find('[data-test="unreachable"]');
        expect(warning.text()).toContain("E:\\Gone");
        expect(warning.findAll("button")).toHaveLength(2);
        await warning.findAll("button")[1]?.trigger("click");
        expect(bridge.dataFoldersForgetUnreachable).toHaveBeenCalled();
        wrapper.unmount();
    });

    it("offers to remove an old folder only when one is waiting", async () => {
        const without = await mountSection(baseStatus());
        expect(without.wrapper.find('[data-test="removal"]').exists()).toBe(false);
        without.wrapper.unmount();

        const withOld = await mountSection(baseStatus({ save: { ...baseStatus().save, removableOldFolder: "C:\\old\\maps" } }));
        expect(withOld.wrapper.find('[data-kind="save"] [data-test="removal"]').text()).toContain("C:\\old\\maps");
        withOld.wrapper.unmount();
    });

    it("says when there is no Git, and that everything else still works", async () => {
        const { wrapper } = await mountSection(
            baseStatus({ history: { ...baseStatus().history, available: false, unavailableReason: "Git is not installed on this machine." } }),
        );
        expect(wrapper.find('[data-test="no-git"]').text()).toContain("Git is not installed");
        expect(wrapper.find('[data-test="last-version"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it("keeps sending off, and says what is missing before it can be turned on", async () => {
        const { wrapper } = await mountSection(baseStatus());
        expect(wrapper.find('[data-test="enable-reason"]').text()).toContain("Save the address");
        expect(wrapper.find('[data-test="send-reason"]').text()).toContain("Turn on sending first");
        wrapper.unmount();
    });

    it("recommends a server on the person's own network when sign-in files exist, and keeps that option off until one is set", async () => {
        const base = baseStatus();
        const { wrapper } = await mountSection(
            baseStatus({
                remote: { ...base.remote, url: "https://github.com/me/x.git", credentialFilesPresent: true, isLocalNetwork: false },
            }),
        );
        expect(wrapper.find('[data-test="credentials-recommendation"]').text()).toContain("your own network");
        expect(wrapper.find('[data-test="credentials-reason"]').text()).toContain("own network");
        expect(credentialSwitch(wrapper).props("disabled")).toBe(true);
        wrapper.unmount();
    });

    it("lets the sign-in option be turned on for a server on the person's own network", async () => {
        const base = baseStatus();
        const { wrapper } = await mountSection(
            baseStatus({
                remote: { ...base.remote, url: "https://gitlab.lan/me/x.git", credentialFilesPresent: true, isLocalNetwork: true },
            }),
        );
        expect(wrapper.find('[data-test="credentials-reason"]').exists()).toBe(false);
        expect(credentialSwitch(wrapper).props("disabled")).toBe(false);
        wrapper.unmount();
    });

    it("shows the push result and the last confirmed send", async () => {
        const base = baseStatus();
        const { wrapper } = await mountSection(
            baseStatus({
                remote: {
                    ...base.remote,
                    enabled: true,
                    url: "https://github.com/me/x.git",
                    lastPush: { at: "2026-11-25T10:00:00Z", sha: "abc", verified: true },
                },
            }),
            {
                dataFoldersPushNow: vi.fn(async () => ({
                    status: "pushed" as const,
                    message: "Sent, and the remote was read back to confirm it.",
                    sha: "abc",
                    verified: true,
                    excluded: [],
                })),
            },
        );
        expect(wrapper.find('[data-test="last-push"]').text()).toContain("confirmed");
        const send = wrapper.findAll("button").find((button) => button.text().includes("Send now"));
        await send?.trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="push-result"]').text()).toContain("read back");
        wrapper.unmount();
    });

    it("lists what is left out of what is sent", async () => {
        const { wrapper } = await mountSection(baseStatus());
        expect(wrapper.find("details").text()).toContain("github-accounts");
        wrapper.unmount();
    });

    it("says plainly that folders cannot be changed where there is no desktop bridge", async () => {
        const store = createDataFoldersStore({ bridge: null });
        const wrapper = mount(DataFoldersRow, { props: { store }, global: { plugins: [vuetify, i18n] } });
        await flushPromises();
        expect(wrapper.find('[data-test="unavailable"]').exists()).toBe(true);
        expect(wrapper.find('[data-kind="profile"] button[type="submit"]').attributes("disabled")).toBeDefined();
        wrapper.unmount();
    });
});
