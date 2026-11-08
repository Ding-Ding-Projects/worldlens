// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import LiveChart from "./LiveChart.vue";

beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    globalThis.matchMedia ??= ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof matchMedia;
});

const i18n = () => createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false, messages: { en: {} } });
const now = Date.now();
const samples = [
    { t: now - 30_000, v: 1.2 },
    { t: now - 20_000, v: 1.8 },
    { t: now - 10_000, v: 2.6 },
];
const format = (v: number) => `${v.toFixed(1)}%/min`;

describe("the live chart", () => {
    it("summarises the latest reading and trend for a screen reader and shows the value badge", async () => {
        const w = mount(LiveChart, { props: { samples, state: "live", label: "Render speed", format }, global: { plugins: [i18n()] } });
        await flushPromises();
        expect(w.find("canvas").attributes("aria-label")).toBe("Render speed: 2.6%/min, rising.");
        expect(w.find(".wl-live__badge").text()).toContain("▲");
        expect(w.text()).toContain("Live");
    });

    it("scrubs with the arrow keys to real readings only", async () => {
        const w = mount(LiveChart, { props: { samples, state: "live", label: "Render speed", format }, global: { plugins: [i18n()] } });
        await flushPromises();
        await w.find("canvas").trigger("keydown", { key: "ArrowLeft" });
        expect(w.find("[data-test=chart-scrub]").text()).toContain("2.6%/min");
        await w.find("canvas").trigger("keydown", { key: "Home" });
        expect(w.find("[data-test=chart-scrub]").text()).toContain("1.2%/min");
        await w.find("canvas").trigger("keydown", { key: "ArrowLeft" });
        expect(w.find("[data-test=chart-scrub]").text()).toContain("1.2%/min");
        await w.find("canvas").trigger("keydown", { key: "Escape" });
        expect(w.find("[data-test=chart-scrub]").exists()).toBe(false);
    });

    it("says plainly when it is loading, paused or stale", async () => {
        for (const [state, words] of [["loading", "Waiting for the first readings"], ["paused", "Paused"], ["stale", "gone quiet"]] as const) {
            const w = mount(LiveChart, { props: { samples: state === "loading" ? [] : samples, state, label: "Render speed", format }, global: { plugins: [i18n()] } });
            await flushPromises();
            expect(w.find("[data-test=chart-state]").text(), state).toContain(words);
        }
    });
});
