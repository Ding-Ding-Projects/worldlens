/**
 * @vitest-environment jsdom
 *
 * The two surfaces a person actually meets: the wizard that makes a lock and the prompt
 * that opens one.
 *
 * What is checked here is mostly *honesty*, because that is what these two are for. The
 * wizard has to say it is a toy before somebody chooses a password rather than after; the
 * prompt has to name the way out before somebody needs it; and neither may ever render a
 * credential or say anything about one. A control that merely looks right passes none of
 * these by accident.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import LockWizard from "./LockWizard.vue";
import UnlockPrompt from "./UnlockPrompt.vue";
import { createLockStore, type LockHost, type LockStore } from "./lockStore.js";
import { createLock, type LockRecord, type LockVault } from "./lockModel.js";
import { decodeBase32, totp } from "./totp.js";
import { LOCK_STORE } from "./useLocks.js";

const SECRET = "JBSWY3DPEHPK3PXP";
const target = { surface: "settings", path: "appearance.fontSize", label: "Font size" };

function host(withVault = true): LockHost {
    let stored: readonly LockRecord[] = [];
    const secrets = new Map<string, string>();
    const vault: LockVault = {
        put: async (id, secret) => void secrets.set(id, secret),
        get: async (id) => secrets.get(id) ?? null,
        remove: async (id) => void secrets.delete(id),
    };
    return {
        name: "test",
        dataFolder: "C:/Users/test/AppData/Roaming/Worldlens",
        vault: withVault ? vault : null,
        load: async () => stored,
        save: async (locks) => void (stored = locks),
    };
}

beforeAll(() => {
    // jsdom has no layout engine and Vuetify's fields and overlays observe their own size.
    // The same stubs every component suite in this package installs, for the same reason:
    // without them a component that renders perfectly well in the app throws inside a
    // watcher and looks broken here.
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
        addEventListener: () => {},
        removeEventListener: () => {},
    } as unknown as typeof globalThis.visualViewport;
});

function mountWith(component: unknown, props: Record<string, unknown>, store: LockStore) {
    return mount(component as never, {
        // `mount` narrows props from the component type, and the component is deliberately
        // `unknown` here so one helper can drive both surfaces.
        props: props as never,
        global: {
            plugins: [
                createVuetify(),
                createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false }),
            ],
            // Provided directly rather than through a wrapper component: a wrapper would
            // swallow the events these tests assert on.
            provide: { [LOCK_STORE as unknown as symbol]: store },
        },
    });
}

async function passwordRecord(password = "open sesame"): Promise<LockRecord> {
    const made = await createLock(target, { method: "password", password }, { iterations: 1000 });
    if (!made.ok) throw new Error(made.message);
    return made.record;
}

describe("the wizard says what kind of lock this is, before the credential", () => {
    it("states plainly that it is for fun and names the reset route", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(LockWizard, { target }, store);
        await flushPromises();

        const note = wrapper.find('[data-test="lock-wizard-toy-note"]').text();
        expect(note).toContain("for-fun");
        expect(note).toContain("not encryption");
        // The remedy, said up front rather than discovered after being locked out.
        expect(note).toContain("local data folder");
        wrapper.unmount();
    });

    it("says the password opens this element and nothing else", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(LockWizard, { target }, store);
        await flushPromises();
        expect(wrapper.find('[data-test="lock-own-credential"]').text()).toContain(
            "no master password",
        );
        wrapper.unmount();
    });
});

describe("the wizard refuses a lock nothing could open", () => {
    it("will not create one from a typo, and says which condition is unmet", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(LockWizard, { target }, store);
        await flushPromises();

        await wrapper.find('[data-test="lock-password"] input').setValue("correct horse");
        await wrapper.find('[data-test="lock-password-confirm"] input').setValue("correct hoarse");
        await flushPromises();

        expect(wrapper.find('[data-test="lock-blocked"]').text()).toContain("do not match");
        expect(store.locks.value).toHaveLength(0);
        wrapper.unmount();
    });

    it("creates one once the two agree", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(LockWizard, { target }, store);
        await flushPromises();

        await wrapper.find('[data-test="lock-password"] input').setValue("correct horse");
        await wrapper.find('[data-test="lock-password-confirm"] input').setValue("correct horse");
        await flushPromises();
        await wrapper.find('[data-test="lock-create"]').trigger("click");
        // PBKDF2 at the real cost is hundreds of milliseconds of genuine work, so one
        // microtask flush is not enough to see the end of it.
        await vi.waitFor(() => expect(store.locks.value).toHaveLength(1));
        expect(wrapper.emitted("created")).toBeTruthy();
        wrapper.unmount();
    });

    it("proves an authenticator pairing before arming, and refuses a wrong code", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(LockWizard, { target }, store);
        await flushPromises();

        await wrapper.find('[data-test="lock-method-totp"] input').setValue(true);
        await flushPromises();
        await wrapper.find('[data-test="lock-pairing-code"] input').setValue("000000");
        await flushPromises();
        await wrapper.find('[data-test="lock-create"]').trigger("click");
        // The failure this prevents: a mis-scanned secret makes a lock its owner cannot
        // open, discovered at the exact moment they need it.
        await vi.waitFor(() =>
            expect(wrapper.find('[data-test="lock-problem"]').text()).toContain("does not match"),
        );
        expect(store.locks.value).toHaveLength(0);
        wrapper.unmount();
    });

    it("says why the authenticator route is unavailable rather than hiding it", async () => {
        const store = createLockStore({ host: host(false) });
        await store.load();
        const wrapper = mountWith(LockWizard, { target }, store);
        await flushPromises();

        expect(wrapper.find('[data-test="lock-method-totp"] input').attributes("disabled")).toBeDefined();
        expect(wrapper.find('[data-test="lock-no-vault"]').text()).toContain("nowhere safe");
        wrapper.unmount();
    });
});

describe("the wizard renders the secret for somebody who cannot scan", () => {
    it("shows the secret in text and the pairing URI beside it", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(LockWizard, { target }, store);
        await flushPromises();
        await wrapper.find('[data-test="lock-method-totp"] input').setValue(true);
        await flushPromises();

        const uri = wrapper.find('[data-test="lock-pairing-uri"]').text();
        expect(uri).toContain("otpauth://totp/");
        // Every parameter written out, so a reader's authenticator cannot assume a
        // different hash and produce codes nothing accepts.
        expect(uri).toContain("algorithm=SHA1");
        expect(uri).toContain("digits=6");
        expect(uri).toContain("period=30");
        expect(wrapper.find('[data-test="lock-secret"] input').attributes("readonly")).toBeDefined();
        wrapper.unmount();
    });
});

describe("the prompt in front of a locked element", () => {
    it("names the way out before anybody has failed once", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(
            UnlockPrompt,
            { lock: await passwordRecord(), dataFolder: "C:/data/Worldlens" },
            store,
        );
        await flushPromises();

        const recovery = wrapper.find('[data-test="unlock-recovery"]').text();
        expect(recovery).toContain("C:/data/Worldlens");
        expect(wrapper.find('[data-test="unlock-support"]').exists()).toBe(true);
        wrapper.unmount();
    });

    it("says it cannot name the folder rather than inventing one", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(
            UnlockPrompt,
            { lock: await passwordRecord(), dataFolder: null },
            store,
        );
        await flushPromises();
        expect(wrapper.find('[data-test="unlock-recovery"]').text()).toContain("cannot say where");
        wrapper.unmount();
    });

    it("says a wrong password is wrong, and nothing else about it", async () => {
        const record = await passwordRecord("open sesame");
        const store = createLockStore({ host: host() });
        await store.load();
        // The store has to know the lock for an attempt to reach it.
        await store.add(target, { method: "password", password: "open sesame" });
        const wrapper = mountWith(
            UnlockPrompt,
            { lock: store.locks.value[0], dataFolder: null },
            store,
        );
        await flushPromises();

        await wrapper.find('[data-test="unlock-answer"] input').setValue("open sesam");
        await wrapper.find('[data-test="unlock-submit"]').trigger("click");
        await vi.waitFor(() =>
            expect(wrapper.find('[data-test="unlock-problem"]').exists()).toBe(true),
        );

        const problem = wrapper.find('[data-test="unlock-problem"]').text();
        expect(problem).toContain("did not match");
        // No hint about length, composition, or how close it came.
        expect(problem).not.toMatch(/\d+ character|close|almost|starts with/i);
        expect(record.verifier).not.toBeNull();
        wrapper.unmount();
    });

    it("opens on the right password and tells the host", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(target, { method: "password", password: "open sesame" });
        const wrapper = mountWith(
            UnlockPrompt,
            { lock: store.locks.value[0], dataFolder: null },
            store,
        );
        await flushPromises();

        await wrapper.find('[data-test="unlock-answer"] input').setValue("open sesame");
        await wrapper.find('[data-test="unlock-submit"]').trigger("click");
        await vi.waitFor(() => expect(wrapper.emitted("unlocked")).toBeTruthy());
        expect(store.isLocked("settings", "appearance.fontSize")).toBe(false);
        wrapper.unmount();
    });

    it("blames the vault, not the person, when the secret has gone", async () => {
        const backing = host();
        const store = createLockStore({ host: backing });
        await store.load();
        await store.add(target, { method: "totp", secretBase32: SECRET });
        await backing.vault!.remove(store.locks.value[0]!.id);

        const wrapper = mountWith(
            UnlockPrompt,
            { lock: store.locks.value[0], dataFolder: null },
            store,
        );
        await flushPromises();
        await wrapper.find('[data-test="unlock-answer"] input').setValue("123456");
        await wrapper.find('[data-test="unlock-submit"]').trigger("click");
        await flushPromises();

        const problem = wrapper.find('[data-test="unlock-problem"]').text();
        expect(problem).toContain("Your authenticator is fine");
        wrapper.unmount();
    });

    it("opens on a live authenticator code", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(target, { method: "totp", secretBase32: SECRET });
        const decoded = decodeBase32(SECRET);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) return;

        const wrapper = mountWith(
            UnlockPrompt,
            { lock: store.locks.value[0], dataFolder: null },
            store,
        );
        await flushPromises();
        await wrapper
            .find('[data-test="unlock-answer"] input')
            .setValue(await totp(decoded.bytes, Date.now()));
        await wrapper.find('[data-test="unlock-submit"]').trigger("click");
        await vi.waitFor(() => expect(wrapper.emitted("unlocked")).toBeTruthy());
        wrapper.unmount();
    });

    it("says it is a toy on the prompt too, not only in the wizard", async () => {
        // Somebody meeting a lock on a shared machine may never have seen the wizard.
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(
            UnlockPrompt,
            { lock: await passwordRecord(), dataFolder: null },
            store,
        );
        await flushPromises();
        expect(wrapper.find('[data-test="unlock-toy-note"]').text()).toContain("just for fun");
        wrapper.unmount();
    });
});

describe("neither surface ever leaks what it is holding", () => {
    it("never renders a password anywhere in the prompt's markup", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(target, { method: "password", password: "correct horse battery" });
        const wrapper = mountWith(
            UnlockPrompt,
            { lock: store.locks.value[0], dataFolder: null },
            store,
        );
        await flushPromises();
        expect(wrapper.html()).not.toContain("correct horse");
        expect(wrapper.html()).not.toContain("battery");
        wrapper.unmount();
    });

    it("does not log a credential while creating or opening one", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(LockWizard, { target }, store);
        await flushPromises();
        await wrapper.find('[data-test="lock-password"] input').setValue("correct horse");
        await wrapper.find('[data-test="lock-password-confirm"] input').setValue("correct horse");
        await wrapper.find('[data-test="lock-create"]').trigger("click");
        await flushPromises();
        expect(log).not.toHaveBeenCalled();
        log.mockRestore();
        wrapper.unmount();
    });
});
