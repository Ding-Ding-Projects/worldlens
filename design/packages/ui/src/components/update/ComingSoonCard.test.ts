// @vitest-environment jsdom

/**
 * The "Update coming soon" card, mounted.
 *
 * The rules underneath are tested in `comingSoonModel.test.ts`; this is the wiring: that
 * nothing renders with no build in flight, that every stage spells its state as a word, that
 * the bar is the count of finished stages, that each honest state has its own wording, that
 * the card carries no control other than a re-check, and that it steps aside when the
 * ordinary updater offers the build.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import { h } from "vue";
import ComingSoonCard from "./ComingSoonCard.vue";
import { unknownUpdateState } from "./updateModel.js";
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";
import { reloadSetupLanguage, resetSetupLanguage, setLanguageMode } from "../setup/setupI18n.js";
import type { ComingSoonState, UpdateState } from "./updateBridge.js";

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
});

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
    setLanguageMode("en");
});

const mounted: VueWrapper[] = [];
afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    resetSetupLanguage();
});

const NOW = Date.parse("2026-11-25T12:00:00Z");
const minutesAgo = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString();

type Building = Extract<ComingSoonState, { kind: "building" }>;

function building(overrides: Partial<Building> = {}): Building {
    return {
        kind: "building",
        runNumber: 2401,
        version: "1.0.2401",
        phase: "running",
        createdAt: minutesAgo(21),
        startedAt: minutesAgo(20),
        stalled: false,
        lastActivityAt: minutesAgo(2),
        stages: [
            { id: "source", kind: "source", label: "", state: "done", startedAt: null, completedAt: null },
            { id: "queue", kind: "queue", label: "", state: "done", startedAt: null, completedAt: null },
            { id: "job-1", kind: "part", label: "Windows installer", state: "running", startedAt: null, completedAt: null },
            { id: "job-2", kind: "part", label: "Container image", state: "failed", startedAt: null, completedAt: null },
            { id: "job-3", kind: "publish", label: "Publish release", state: "waiting", startedAt: null, completedAt: null },
        ],
        stagesDone: 2,
        stagesTotal: 5,
        estimate: { typicalMs: 40 * 60_000, sampleCount: 5 },
        contents: {
            commits: [
                { sha: "b", subject: "Newer change" },
                { sha: "a", subject: "Older change" },
            ],
            total: 9,
            truncated: true,
        },
        contentsUnavailable: null,
        replacedRun: null,
        checkedAt: minutesAgo(0),
        ...overrides,
    };
}

const installed = (overrides: Partial<UpdateState> = {}): UpdateState => ({
    ...unknownUpdateState("1.0.2400"),
    status: "up-to-date",
    ...overrides,
});

function render(comingSoon: ComingSoonState | null, update: UpdateState = installed()): VueWrapper {
    const vuetify = createVuetify();
    const wrapper = mount(
        {
            render: () =>
                h(VApp, null, {
                    default: () => [
                        h(ComingSoonCard, {
                            comingSoon,
                            updateState: update,
                            now: () => NOW,
                        }),
                    ],
                }),
        },
        { global: { plugins: [vuetify] } },
    );
    mounted.push(wrapper);
    return wrapper;
}

describe("ComingSoonCard", () => {
    it("renders nothing at all when no build is in flight", () => {
        expect(render(null).find("[data-testid=coming-soon]").exists()).toBe(false);
        expect(
            render({ kind: "none", checkedAt: null, lastOutcome: null })
                .find("[data-testid=coming-soon]")
                .exists(),
        ).toBe(false);
    });

    it("shows the build number, every stage with its state as a word, and the times", () => {
        const wrapper = render(building());
        const text = wrapper.text();
        expect(text).toContain("Update coming soon");
        expect(text).toContain("Build 1.0.2401 is being made and is not published yet.");

        const rows = wrapper.findAll("[data-testid=coming-soon-stages] li").map((row) => row.text());
        expect(rows).toHaveLength(5);
        expect(rows[0]).toContain("Source received");
        expect(rows[0]).toContain("done");
        expect(rows[2]).toContain("Windows installer");
        expect(rows[2]).toContain("running");
        expect(rows[3]).toContain("failed");
        expect(rows[4]).toContain("waiting");

        // A real count, and times a person can read on a 24-hour clock.
        expect(text).toContain("2 of 5 stages done");
        expect(wrapper.find("[data-testid=coming-soon-started]").text()).toMatch(/^\d{2}:\d{2}$/);
        expect(wrapper.find("[data-testid=coming-soon-elapsed]").text()).toBe("20 min");
    });

    it("labels the estimate as an estimate and says what it came from", () => {
        const text = render(building()).find("[data-testid=coming-soon-estimate]").text();
        expect(text).toContain("About 20 min left");
        expect(text).toContain("estimate");
        expect(text).toContain("last 5 builds");
    });

    it("says there is no estimate rather than inventing one, and says so when it is overrun", () => {
        expect(
            render(building({ estimate: null })).find("[data-testid=coming-soon-estimate]").text(),
        ).toContain("No estimate");
        const slow = render(building({ estimate: { typicalMs: 10 * 60_000, sampleCount: 4 } }))
            .find("[data-testid=coming-soon-estimate]")
            .text();
        expect(slow).toContain("longer than the usual");
        expect(slow).not.toContain("left");
    });

    it("lists what it will contain as subjects, and says how many more there are", () => {
        const wrapper = render(building());
        const items = wrapper.findAll("[data-testid=coming-soon-contents] li").map((li) => li.text());
        expect(items).toEqual(["Newer change", "Older change"]);
        expect(wrapper.text()).toContain("and 7 more changes not listed here");
    });

    it("says the list of changes could not be read instead of showing an empty list", () => {
        const wrapper = render(building({ contents: null, contentsUnavailable: "no-base" }));
        expect(wrapper.find("[data-testid=coming-soon-contents]").exists()).toBe(false);
        expect(wrapper.find("[data-testid=coming-soon-contents-note]").text()).toContain(
            "could not be read",
        );
    });

    it("says a queued build is waiting its turn", () => {
        const wrapper = render(building({ phase: "queued", startedAt: null }));
        expect(wrapper.text()).toContain("waiting its turn");
        expect(wrapper.find("[data-testid=coming-soon-started]").exists()).toBe(false);
    });

    it("says a stalled build looks stalled, and that a replaced build was replaced", () => {
        const wrapper = render(building({ stalled: true, replacedRun: 2400 }));
        expect(wrapper.find("[data-testid=coming-soon-stalled]").text()).toContain("stalled");
        expect(wrapper.find("[data-testid=coming-soon-replaced]").text()).toContain(
            "Build 2400 ended without publishing",
        );
    });

    it("gives a failed build its own wording, and promises nothing was installed", () => {
        const wrapper = render({
            kind: "failed",
            runNumber: 2401,
            version: "1.0.2401",
            conclusion: "failure",
            failedStage: "Windows installer",
            endedAt: minutesAgo(1),
            checkedAt: minutesAgo(0),
        });
        const text = wrapper.text();
        expect(text).toContain("The coming build did not finish");
        expect(text).toContain("Nothing was installed and your version is unchanged");
        expect(wrapper.find("[data-testid=coming-soon-failed-stage]").text()).toContain(
            "Windows installer",
        );
        expect(wrapper.find("[role=alert]").exists()).toBe(true);
    });

    it("gives offline, rate-limited and unavailable their own wording, with no stages", () => {
        const offline = render({ kind: "unknown", reason: "offline", retryAt: null, checkedAt: null });
        expect(offline.text()).toContain("could not reach the public build record");
        expect(offline.find("[data-testid=coming-soon-stages]").exists()).toBe(false);

        const limited = render({
            kind: "unknown",
            reason: "rate-limited",
            retryAt: "2026-11-25T12:30:00Z",
            checkedAt: null,
        });
        expect(limited.text()).toContain("hourly limit is used up");
        expect(limited.text()).toMatch(/look again at \d{2}:\d{2}/);

        const unavailable = render({
            kind: "unknown",
            reason: "unavailable",
            retryAt: null,
            checkedAt: null,
        });
        expect(unavailable.text()).toContain("did not answer as expected");
    });

    it("steps aside when the ordinary updater already offers the build", () => {
        const wrapper = render(building(), installed({ status: "available", newVersion: "1.0.2401" }));
        expect(wrapper.find("[data-testid=coming-soon]").exists()).toBe(false);
    });

    it("carries one control, a re-check, and no install, download or restart control", async () => {
        const wrapper = render(building());
        const buttons = wrapper.findAll("button");
        expect(buttons).toHaveLength(1);
        expect(buttons[0]?.text()).toBe("Check again");
        expect(wrapper.text().toLowerCase()).toContain("nothing is downloaded or installed");
        for (const button of buttons) {
            expect(button.text().toLowerCase()).not.toMatch(/install|download|restart/);
        }

        await buttons[0]?.trigger("click");
        const card = wrapper.findComponent(ComingSoonCard);
        expect(card.emitted("refresh")).toHaveLength(1);
    });

    it("exposes the bar as the count of finished stages, and announces the current stage politely", () => {
        const wrapper = render(building());
        const bar = wrapper.find("[role=progressbar]");
        expect(bar.exists()).toBe(true);
        expect(bar.attributes("aria-valuenow")).toBe("40");
        const live = wrapper.find("[data-testid=coming-soon-live]");
        expect(live.attributes("aria-live")).toBe("polite");
        expect(live.text()).toBe(
            "Build 1.0.2401: 2 of 5 stages done. Current stage: Windows installer.",
        );
    });

    it("shows English and Cantonese together in bilingual mode, with the Cantonese marked", () => {
        setLanguageMode("bilingual");
        const wrapper = render(building());
        expect(wrapper.text()).toContain("Build 1.0.2401 is being made");
        expect(wrapper.text()).toContain("版本 1.0.2401 製作緊");
        expect(wrapper.find("[lang]").exists()).toBe(true);
    });

    it("shows Cantonese only in Cantonese mode", () => {
        setLanguageMode("yue");
        const text = render(building()).text();
        expect(text).toContain("更新即將推出");
        expect(text).not.toContain("Build 1.0.2401 is being made");
    });
});
