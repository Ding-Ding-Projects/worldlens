// @vitest-environment jsdom

/**
 * The destination somebody chose is the destination whose section they get - and the one
 * they get back next launch.
 *
 * Both halves are here because both failed at once in the packaged v1.0.2026 build, and the
 * screenshot that reported it showed exactly what that looks like: the picker with GitHub's
 * runners selected, and underneath it the local-container section, offering an approved Java
 * runtime and a container memory limit for a conversion that was never going to run in a
 * container.
 *
 * The cause was a single misplaced handler. `ChunkerRoutePicker` listened for
 * `update:model-value` on each `VRadio` rather than on the `VRadioGroup` around them, and a
 * radio inside a group does not own a model of its own - the group does, and the group is
 * what emits. So the per-radio handler never fired, `select` never ran, and `update:route`
 * was never emitted. Vuetify's own group state still moved the dot, which is what made it
 * look like a rendering bug in the sections rather than a selection that never happened:
 * the picker and the page held two different answers to "which route is this", and only one
 * of them was on screen.
 *
 * The first test therefore asserts on what the picker *emits*, which is the thing the page
 * acts on, rather than on which radio looks selected. It fails on the old code for every
 * route - including GitHub's runners, the one in the report.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";

import ChunkerRoutePicker from "./ChunkerRoutePicker.vue";
import {
    CHUNKER_ROUTE_IDS,
    defaultRouteFor,
    type ChunkerRoute,
    type ChunkerRouteFacts,
    type ChunkerRouteId,
} from "./chunkerRoute.js";
import {
    initialChunkerRoute,
    loadChunkerRoute,
    saveChunkerRoute,
    type ChunkerRouteStorage,
} from "./chunkerRouteStore.js";

beforeAll(() => {
    // jsdom has no layout engine, so Vuetify's own size observer is absent. Same shim as
    // every other Vuetify mount in this package.
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as never;
});

/** Every route measured as usable, so a refusal can never be what a failure means here. */
const EVERY_ROUTE_READY: ChunkerRouteFacts = {
    local: { supported: true, chunkerInstalled: true },
    docker: {
        supported: true,
        status: "available",
        message: null,
        image: "eclipse-temurin:25-jre",
    },
    githubActions: { supported: true, signedIn: true, account: "someone" },
    ssh: { supported: true, hosts: 2 },
    aws: { supported: true, signedIn: true, provisioned: true, region: "us-east-1" },
};

function mountPicker(route: ChunkerRoute) {
    return mount(ChunkerRoutePicker, {
        // `host: null` and explicit facts keep this off every bridge: the choice is what is
        // under test, not what this machine happens to have installed.
        props: { host: null, facts: EVERY_ROUTE_READY, autoProbe: false, route },
        global: {
            plugins: [
                createVuetify({ components, directives }),
                createI18n({ legacy: false, locale: "en", messages: { en: {} } }),
            ],
        },
    });
}

/** A `Storage` that is only a plain object, so a test never touches the real one. */
function memoryStorage(seed: Record<string, string> = {}): ChunkerRouteStorage {
    const held = new Map(Object.entries(seed));
    return {
        getItem: (key) => held.get(key) ?? null,
        setItem: (key, value) => void held.set(key, value),
    };
}

describe("choosing a destination", () => {
    for (const id of CHUNKER_ROUTE_IDS) {
        it(`emits ${id} when its row is chosen`, async () => {
            // Start somewhere else on purpose, so an emit that merely repeated the route
            // already held would not pass.
            const start: ChunkerRouteId = id === "local" ? "docker" : "local";
            const picker = mountPicker(defaultRouteFor(start));

            const radio = picker.get(
                `[data-test="chunker-route-row-${id}"] input[type="radio"]`,
            );
            await radio.setValue(true);

            const emitted = picker.emitted("update:route");
            expect(emitted, `${id} emitted no route at all`).toBeTruthy();
            expect((emitted?.at(-1)?.[0] as ChunkerRoute).kind).toBe(id);
        });
    }

    it("shows the route the page holds, rather than the one it opened with", async () => {
        const picker = mountPicker(defaultRouteFor("local"));
        await picker.setProps({ route: defaultRouteFor("github-actions") });

        const chosen = picker.get(
            '[data-test="chunker-route-row-github-actions"] input[type="radio"]',
        );
        expect((chosen.element as HTMLInputElement).checked).toBe(true);
    });
});

describe("remembering the destination", () => {
    it("restores the route, and the identifiers that route carries", () => {
        const storage = memoryStorage();
        saveChunkerRoute({ kind: "github-actions", owner: "someone", repo: "worlds" }, storage);

        expect(loadChunkerRoute(storage)).toEqual({
            kind: "github-actions",
            owner: "someone",
            repo: "worlds",
        });
    });

    it("remembers each route's own fields", () => {
        const storage = memoryStorage();
        saveChunkerRoute({ kind: "docker", image: "eclipse-temurin:25-jre" }, storage);
        expect(loadChunkerRoute(storage)).toEqual({
            kind: "docker",
            image: "eclipse-temurin:25-jre",
        });

        saveChunkerRoute({ kind: "ssh", targetId: "abc", label: "the big one" }, storage);
        expect(loadChunkerRoute(storage)).toEqual({
            kind: "ssh",
            targetId: "abc",
            label: "the big one",
        });
    });

    it("falls back to this computer when nothing was remembered", () => {
        expect(initialChunkerRoute(memoryStorage())).toEqual({ kind: "local" });
    });

    it.each([
        ["nothing stored", {}],
        ["not JSON at all", { "worldlens-chunker-route": "{" }],
        ["JSON that is not an object", { "worldlens-chunker-route": '"github-actions"' }],
        ["a kind this build does not have", { "worldlens-chunker-route": '{"kind":"mainframe"}' }],
        ["no kind at all", { "worldlens-chunker-route": '{"owner":"someone"}' }],
    ])("reads %s as nothing remembered rather than throwing", (_case, seed) => {
        expect(loadChunkerRoute(memoryStorage(seed as Record<string, string>))).toBeNull();
    });

    it("drops a stored field of the wrong type instead of restoring it", () => {
        const storage = memoryStorage({
            "worldlens-chunker-route": '{"kind":"github-actions","owner":7,"repo":"worlds"}',
        });
        // The route still restores - the kind is the part that decides the section - but the
        // field that could not be a repository owner comes back as "not chosen yet" rather
        // than as the number somebody's storage happened to hold.
        expect(loadChunkerRoute(storage)).toEqual({
            kind: "github-actions",
            owner: null,
            repo: "worlds",
        });
    });

    it("never throws when storage itself refuses", () => {
        const refusing: ChunkerRouteStorage = {
            getItem: () => {
                throw new Error("storage is blocked");
            },
            setItem: () => {
                throw new Error("storage is blocked");
            },
        };
        expect(loadChunkerRoute(refusing)).toBeNull();
        expect(() => saveChunkerRoute({ kind: "local" }, refusing)).not.toThrow();
        expect(initialChunkerRoute(refusing)).toEqual({ kind: "local" });
    });
});
