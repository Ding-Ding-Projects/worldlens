/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import GhEntityPicker from "./GhEntityPicker.vue";

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
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
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

const PickerTriplet = defineComponent({
    components: { GhEntityPicker },
    setup() {
        return {
            account: ref<string | null>("github.com:octocat"),
            owner: ref<string | null>("acme"),
            repository: ref<string | null>("acme/atlas"),
            accounts: [
                { title: "octocat (active)", value: "github.com:octocat", searchText: "github.com repo" },
                { title: "mona", value: "github.com:mona", searchText: "github.com gist" },
            ],
            owners: [
                { title: "octocat (personal)", value: "octocat", searchText: "user" },
                { title: "acme (organization)", value: "acme", searchText: "organization" },
            ],
            repositories: [
                { title: "acme/atlas (private)", value: "acme/atlas", searchText: "acme atlas" },
                { title: "octocat/maps", value: "octocat/maps", searchText: "octocat maps" },
            ],
        };
    },
    template: `
        <GhEntityPicker v-model="account" :items="accounts" search-label="Search accounts"
            select-label="Account" selected-label="Selected account" empty-message="No accounts"
            no-match-message="No account matches" data-test-base="test-account" />
        <GhEntityPicker v-model="owner" :items="owners" search-label="Search owners"
            select-label="Owner" selected-label="Selected owner" empty-message="No owners"
            no-match-message="No owner matches" data-test-base="test-owner" />
        <GhEntityPicker v-model="repository" :items="repositories" search-label="Search repositories"
            select-label="Repository" selected-label="Selected repository" empty-message="No repositories"
            no-match-message="No repository matches" data-test-base="test-repository" />
    `,
});

async function settle(wrapper: { vm: { $nextTick: () => Promise<void> } }): Promise<void> {
    await flushPromises();
    await wrapper.vm.$nextTick();
}

describe("real gh entity pickers", () => {
    it("keeps account, owner, and repository search and regex state independent", async () => {
        const wrapper = mount(PickerTriplet, { global: { plugins: [i18n, vuetify] } });
        const accountSearch = wrapper.find('[data-test="test-account-search"]');
        const ownerSearch = wrapper.find('[data-test="test-owner-search"]');
        const repositorySearch = wrapper.find('[data-test="test-repository-search"]');

        await accountSearch.find("input").setValue("^mona");
        await accountSearch
            .find('button[aria-label="Search with a regular expression"]')
            .trigger("click");
        await settle(wrapper);

        expect(accountSearch.text()).toContain("Showing 1 of 2 choices");
        expect(
            accountSearch
                .find('button[aria-label="Search plain text instead of a regular expression"]')
                .attributes("aria-pressed"),
        ).toBe("true");
        expect((ownerSearch.find("input").element as HTMLInputElement).value).toBe("");
        expect((repositorySearch.find("input").element as HTMLInputElement).value).toBe("");
        expect(
            ownerSearch
                .find('button[aria-label="Search with a regular expression"]')
                .attributes("aria-pressed"),
        ).toBe("false");
        expect(
            repositorySearch
                .find('button[aria-label="Search with a regular expression"]')
                .attributes("aria-pressed"),
        ).toBe("false");
    });

    it("shows each selected value and exposes keyboard-named search and select controls", () => {
        const wrapper = mount(PickerTriplet, { global: { plugins: [i18n, vuetify] } });

        expect(wrapper.get('[data-test="test-account-selected"]').text()).toContain(
            "Selected account: octocat (active)",
        );
        expect(wrapper.get('[data-test="test-owner-selected"]').text()).toContain(
            "Selected owner: acme (organization)",
        );
        expect(wrapper.get('[data-test="test-repository-selected"]').text()).toContain(
            "Selected repository: acme/atlas (private)",
        );
        for (const base of ["test-account", "test-owner", "test-repository"]) {
            expect(wrapper.get(`[data-test="${base}-search"]`).find('[role="searchbox"]').exists()).toBe(
                true,
            );
            expect(wrapper.get(`[data-test="${base}-select"]`).find('[role="combobox"]').exists()).toBe(
                true,
            );
        }
        expect(
            wrapper.findAll('button[aria-label="Open the regex builder"]'),
        ).toHaveLength(3);
    });
});
