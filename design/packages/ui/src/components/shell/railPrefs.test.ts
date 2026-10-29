// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryStorage, setSetupStorage, setupStorage } from "../setup/setupPrefs.js";
import { buildPaletteCatalog } from "../palette/paletteCatalog.js";
import {
    DEFAULT_RAIL_MODE,
    RAIL_MODE_KEY,
    changeRailMode,
    currentRailMode,
    isRailMode,
    readRailMode,
    toggleRailMode,
} from "./railPrefs.js";

const t = (_key: string, ...rest: unknown[]): string => {
    const fallback = rest[rest.length - 1];
    return typeof fallback === "string" ? fallback : String(rest[0] ?? "");
};

let previous = setupStorage();

beforeEach(() => {
    previous = setupStorage();
    setSetupStorage(memoryStorage());
    currentRailMode.value = DEFAULT_RAIL_MODE;
});

afterEach(() => {
    setSetupStorage(previous);
});

describe("the rail width preference", () => {
    it("defaults to expanded", () => {
        expect(DEFAULT_RAIL_MODE).toBe("expanded");
        expect(readRailMode()).toBe("expanded");
    });

    it("discards a stored value that is not one of the two modes", () => {
        setSetupStorage(memoryStorage({ [RAIL_MODE_KEY]: "sideways" }));
        expect(readRailMode()).toBe("expanded");
        expect(isRailMode("compact")).toBe(true);
        expect(isRailMode(1)).toBe(false);
    });

    it("persists a change and round-trips it", () => {
        changeRailMode("compact");
        expect(currentRailMode.value).toBe("compact");
        expect(setupStorage().read(RAIL_MODE_KEY)).toBe("compact");
        expect(readRailMode()).toBe("compact");
    });

    it("toggles between the two modes", () => {
        toggleRailMode();
        expect(currentRailMode.value).toBe("compact");
        toggleRailMode();
        expect(currentRailMode.value).toBe("expanded");
    });

    it("is a live toggle row in the command palette on the same shared value", () => {
        const items = buildPaletteCatalog({
            t,
            app: null,
            locale: "en",
            canRouteConfigScreens: false,
            size: "card",
            setSize: () => {},
            actions: {
                revealSetting: () => {},
                openSettings: () => {},
                openConfig: () => {},
                openProfiles: () => {},
            },
        });
        const row = items.find((item) => item.id === "display.railExpanded");
        expect(row?.kind).toBe("setting");
        if (row?.kind !== "setting" || row.control.kind !== "toggle") {
            throw new Error("the rail row is not a toggle setting");
        }
        expect(row.control.value).toBe(true);
        row.control.set(false);
        expect(currentRailMode.value).toBe("compact");
        expect(readRailMode()).toBe("compact");
    });
});
