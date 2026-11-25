import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";
import { createUpdates } from "./useUpdates.js";
import { resolveUpdateBridge, type ComingSoonState, type UpdateBridge } from "./updateBridge.js";
import { unknownUpdateState } from "./updateModel.js";

beforeEach(() => {
    setSetupStorage(memoryStorage());
});

afterEach(() => {
    delete (globalThis as { worldlens?: unknown }).worldlens;
});

const none: ComingSoonState = { kind: "none", checkedAt: null, lastOutcome: null };

const buildingState = (version: string): ComingSoonState => ({
    kind: "building",
    runNumber: 1,
    version,
    phase: "running",
    createdAt: null,
    startedAt: null,
    stalled: false,
    lastActivityAt: null,
    stages: [],
    stagesDone: 0,
    stagesTotal: 0,
    estimate: null,
    contents: null,
    contentsUnavailable: null,
    replacedRun: null,
    checkedAt: "2026-11-25T12:00:00.000Z",
});

function bridgeWithComing(first: ComingSoonState) {
    const watched: boolean[] = [];
    let pushListener: ((state: ComingSoonState) => void) | null = null;
    let refreshes = 0;
    let unsubscribed = false;
    const bridge: UpdateBridge = {
        state: async () => unknownUpdateState("0.1.0"),
        acknowledgeInstallOutcome: async () => {},
        check: async () => unknownUpdateState("0.1.0"),
        restart: async () => ({ ok: false, code: "unsupported", message: "no" }),
        onUpdateEvent: () => () => {},
        canRestart: false,
        canCheck: true,
        comingSoon: {
            state: async () => first,
            refresh: async () => {
                refreshes += 1;
                return buildingState("9.9.9");
            },
            watch: async (open) => {
                watched.push(open);
                return first;
            },
            onEvent: (listener) => {
                pushListener = listener;
                return () => {
                    unsubscribed = true;
                    pushListener = null;
                };
            },
        },
    };
    return {
        bridge,
        watched,
        push: (state: ComingSoonState) => pushListener?.(state),
        refreshes: () => refreshes,
        unsubscribed: () => unsubscribed,
    };
}

describe("the coming build in the shared updater", () => {
    it("reads the first answer and follows pushes", async () => {
        const fake = bridgeWithComing(none);
        const updates = createUpdates({ bridge: fake.bridge });
        expect(updates.comingSoon.value).toBeNull();
        await Promise.resolve();
        await Promise.resolve();
        expect(updates.comingSoon.value).toEqual(none);

        fake.push(buildingState("1.0.5"));
        expect(updates.comingSoon.value).toMatchObject({ kind: "building", version: "1.0.5" });

        updates.stop();
        expect(fake.unsubscribed()).toBe(true);
    });

    it("never lets an older first answer overwrite a push that overtook it", async () => {
        const fake = bridgeWithComing(none);
        const updates = createUpdates({ bridge: fake.bridge });
        fake.push(buildingState("1.0.7"));
        await Promise.resolve();
        await Promise.resolve();
        expect(updates.comingSoon.value).toMatchObject({ kind: "building", version: "1.0.7" });
    });

    it("tells the main process whether the surface is open, and looks again on request", async () => {
        const fake = bridgeWithComing(none);
        const updates = createUpdates({ bridge: fake.bridge });
        updates.watchComingSoon(true);
        updates.watchComingSoon(false);
        expect(fake.watched).toEqual([true, false]);

        await updates.refreshComingSoon();
        expect(fake.refreshes()).toBe(1);
        expect(updates.comingSoon.value).toMatchObject({ kind: "building", version: "9.9.9" });
    });

    it("has no coming build, and no failure, when the build cannot report one", async () => {
        const fake = bridgeWithComing(none);
        const without: UpdateBridge = { ...fake.bridge, comingSoon: null };
        const updates = createUpdates({ bridge: without });
        updates.watchComingSoon(true);
        await updates.refreshComingSoon();
        expect(updates.comingSoon.value).toBeNull();

        const missing = createUpdates({ bridge: null });
        missing.watchComingSoon(true);
        await missing.refreshComingSoon();
        expect(missing.comingSoon.value).toBeNull();
    });

    it("probes the host's four methods together and resolves none when any is missing", () => {
        const base = {
            updateState: async () => unknownUpdateState("1.0.0"),
            onUpdateEvent: () => () => {},
        };
        (globalThis as { worldlens?: unknown }).worldlens = {
            ...base,
            comingSoonState: async () => none,
        };
        expect(resolveUpdateBridge()?.comingSoon).toBeNull();

        (globalThis as { worldlens?: unknown }).worldlens = {
            ...base,
            comingSoonState: async () => none,
            refreshComingSoon: async () => none,
            watchComingSoon: async () => none,
            onComingSoonEvent: () => () => {},
        };
        expect(resolveUpdateBridge()?.comingSoon).not.toBeNull();
    });
});
