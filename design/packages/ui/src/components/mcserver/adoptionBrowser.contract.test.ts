/**
 * @vitest-environment jsdom
 *
 * Adoption answers for every outcome, and the shell can never go back to guessing.
 *
 * ## The defect this exists to stop
 *
 * `App.vue` used to run adoption in four lines: call `adoptDiscover()`, read
 * `discovered.ok ? discovered.value?.[0] : undefined`, and return early when that was
 * falsy. Three failures, and all three look like nothing at all from the outside.
 *
 * The `Answer`'s `failure` was dropped, so a host that has not wired the namespace, a
 * refused Docker permission, and a machine with no containers on it were the same event.
 * The early return meant the button opened no dialog and reported no error, which is
 * exactly what a control that looks live is forbidden from doing. And index zero silently
 * chose one candidate, so a machine with three adoptable containers offered the user
 * precisely one and never mentioned the rest.
 *
 * The design prototype had already named it, in its own words: "Adoption is built, but the
 * button is not wired ... Clicking it today opens nothing and shows no error."
 *
 * ## Why this file asserts on two different things
 *
 * Mounting the browser proves it can answer honestly. It cannot prove the shell asks it,
 * and the original bug lived in the shell rather than in any component. So the second
 * half reads `App.vue` itself: the discarded-failure pattern must be gone, and the browser
 * must be mounted at every site the review dialog is, because a shell variant that mounts
 * the review dialog without the browser is a variant whose adopt button opens nothing
 * again.
 *
 * Both halves fail closed. A component that renders none of its states, and a shell that
 * mounts the browser in two places out of three, each turn this red.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import AdoptionBrowser from "./AdoptionBrowser.vue";
import { SERVER_STORE } from "./useServers.js";
import { createServerStore } from "./serverStore.js";
import type { AdoptionCandidate, Answer } from "./serverStore.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    // Vuetify overlays read `window.visualViewport` when they position themselves, and jsdom
    // ships no such object. Without this the dialog throws before rendering a single state,
    // so every assertion below would fail for a reason that has nothing to do with adoption.
    (globalThis as { visualViewport?: unknown }).visualViewport = {
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        scale: 1,
        addEventListener: () => {},
        removeEventListener: () => {},
    };
    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
});

const candidate = (n: number): AdoptionCandidate => ({
    containerId: `c0ffee${n}`,
    containerName: `minecraft-${n}`,
    image: `itzg/minecraft-server:tag${n}`,
    guessedFlavour: n === 1 ? "paper" : null,
    guessedVersion: n === 1 ? "1.21" : null,
});

/** Mounts the browser already open, against a discovery that answers exactly `answer`. */
async function mountBrowser(answer: Answer<readonly AdoptionCandidate[]>): Promise<void> {
    document.body.innerHTML = "";
    const discover = vi.fn().mockResolvedValue(answer);
    const host = {
        name: "fake",
        list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
        get: vi.fn().mockResolvedValue({ ok: false }),
        save: vi.fn().mockResolvedValue({ ok: false }),
        forget: vi.fn().mockResolvedValue({ ok: true }),
        probe: vi.fn().mockResolvedValue({ ok: false }),
        status: vi.fn().mockResolvedValue({ ok: false }),
        start: vi.fn().mockResolvedValue({ ok: true }),
        stop: vi.fn().mockResolvedValue({ ok: true }),
        files: {
            list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
            read: vi.fn().mockResolvedValue({ ok: false }),
            write: vi.fn().mockResolvedValue({ ok: false }),
        },
        logTail: vi.fn().mockResolvedValue({ ok: true, value: [] }),
        adopt: { discover, confirm: vi.fn(), release: vi.fn() },
    };
    (globalThis as { worldlens?: unknown }).worldlens = { mcserver: host };
    const store = createServerStore({ host: host as never });
    await store.load();
    mount(AdoptionBrowser, {
        props: { modelValue: true },
        global: {
            plugins: [
                createI18n({ legacy: false, locale: "en", messages: { en: {} } }),
                createVuetify(),
            ],
            provide: { [SERVER_STORE as symbol]: store },
        },
        attachTo: document.body,
    });
    await flushPromises();
    await flushPromises();
}

/** The whole dialog's rendered text, including the teleported overlay content. */
const shownText = (): string => document.body.textContent ?? "";

describe("the adoption browser answers for every outcome", () => {
    it("shows the discovery failure's own words instead of swallowing it", async () => {
        await mountBrowser({
            ok: false,
            failure: {
                code: "not-wired",
                message: "This build has not wired up adopting existing containers yet.",
                detail: null,
            },
        });

        // The exact sentence the store produced, not a paraphrase. A user told "nothing
        // found" when the truth is "this build cannot do it" goes hunting for containers
        // that were never the problem.
        expect(shownText()).toContain("has not wired up adopting existing containers");
    });

    it("says something when the machine has no containers, rather than closing silently", async () => {
        await mountBrowser({ ok: true, value: [] });

        // Something must be on screen. The original bug's whole signature was that
        // nothing was.
        expect(shownText()).toContain("Adopt an existing container");
    });

    it("offers every candidate, not the first one it happened to receive", async () => {
        const all = [candidate(1), candidate(2), candidate(3)];
        await mountBrowser({ ok: true, value: all });

        // The regression in one expression: `value?.[0]`. All three names have to be
        // reachable, or the user is being quietly shown a subset of their own machine.
        for (const one of all) {
            expect(shownText(), `${one.containerName} must be offered`).toContain(one.containerName);
        }
    });

    it("labels a guessed flavour as a guess", async () => {
        await mountBrowser({ ok: true, value: [candidate(1), candidate(2)] });

        // `guessedFlavour` and `guessedVersion` are guesses in the type and must read as
        // guesses on screen. Rendering one as established fact is how somebody adopts the
        // wrong container and finds out later.
        expect(shownText().toLowerCase()).toContain("guess");
    });
});

const appSource = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "App.vue"),
    "utf8",
);

/** `source` with block and line comments removed, so a guard reads code and not prose. */
const codeOf = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("the shell cannot go back to guessing a candidate", () => {
    it("no longer takes whichever candidate came back first", () => {
        // The exact shape of the original line, rather than a loose substring: this is what
        // made two of the three containers on a machine unreachable.
        //
        // Comments are stripped first. `App.vue` and this file both describe the old line in
        // prose so the next reader knows what it cost, and a guard that matched its own
        // explanation would fail the moment somebody documented the fix properly. That is not
        // hypothetical: it is exactly what this assertion did on its first run.
        expect(codeOf(appSource)).not.toMatch(/adoptDiscover\(\)[\s\S]{0,200}?value\?\.\[0\]/);
    });

    it("mounts the browser everywhere it mounts the review dialog", () => {
        // The review dialog is mounted once per shell variant, and every one of them needs
        // the browser too. A variant with the dialog and no browser is a variant whose
        // adopt button opens nothing, which is the original bug surviving in a corner.
        const dialogs = appSource.match(/<AdoptionReviewDialog\b/g) ?? [];
        const browsers = appSource.match(/<AdoptionBrowser\b/g) ?? [];
        expect(dialogs.length, "the review dialog should still be mounted").toBeGreaterThan(0);
        expect(browsers.length).toBe(dialogs.length);
    });

    it("routes the browser's pick into the review dialog", () => {
        expect(appSource).toMatch(/@picked="reviewMcServerCandidate"/);
        expect(appSource).toMatch(/function reviewMcServerCandidate\(/);
    });
});
