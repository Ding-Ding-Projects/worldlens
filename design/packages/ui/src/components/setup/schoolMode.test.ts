import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));

import { languageSearchLabels } from "./languageSearch.js";
import {
    funnyLevel,
    languageMode,
    pair,
    reloadSetupLanguage,
    setFunnyLevel,
    setLanguageMode,
} from "./setupI18n.js";
import { memoryStorage, setSetupStorage, setupStorage } from "./setupPrefs.js";
import {
    SCHOOL_MODE_RECORD_KEY,
    deleteSchoolModeLocalRecord,
    enableSchoolMode,
    reloadSchoolMode,
    renameSchoolMode,
    resetSchoolModeRecordAdapter,
    schoolModeEnabled,
    schoolModeName,
    setSchoolModeRecordAdapter,
    type SchoolModeRecordAdapter,
} from "./schoolMode.js";

beforeEach(() => {
    setSetupStorage(memoryStorage());
    resetSchoolModeRecordAdapter();
    reloadSetupLanguage();
});

afterEach(() => {
    deleteSchoolModeLocalRecord();
    resetSchoolModeRecordAdapter();
});

describe("the renderer-local School mode record", () => {
    it("persists only the local enabled state and chosen name", () => {
        renameSchoolMode("Classroom focus");
        enableSchoolMode();

        expect(schoolModeEnabled()).toBe(true);
        expect(schoolModeName("School mode")).toBe("Classroom focus");
        expect(JSON.parse(setupStorage().read(SCHOOL_MODE_RECORD_KEY) ?? "{}")).toEqual({
            version: 1,
            enabled: true,
            name: "Classroom focus",
        });

        reloadSchoolMode();
        expect(schoolModeEnabled()).toBe(true);
        expect(schoolModeName("School mode")).toBe("Classroom focus");
    });

    it("uses an injected read/write adapter without assuming a preload or a credential", () => {
        const values = new Map<string, string>();
        const adapter: SchoolModeRecordAdapter = {
            read: () => values.get("record") ?? null,
            write: (serialized) => values.set("record", serialized),
            remove: () => values.delete("record"),
        };

        setSchoolModeRecordAdapter(adapter);
        renameSchoolMode("Library rules");
        enableSchoolMode();

        expect(values.get("record")).toContain('"name":"Library rules"');
        expect(values.get("record")).not.toContain("credential");
        expect(values.get("record")).not.toContain("pin");

        deleteSchoolModeLocalRecord();
        expect(values.has("record")).toBe(false);
    });
});

describe("the effective School mode policy", () => {
    it("forces English and fully serious copy without overwriting saved choices", () => {
        setLanguageMode("bilingual");
        setFunnyLevel("en", 5);
        setFunnyLevel("yue", 4);
        enableSchoolMode();

        expect(languageMode()).toBe("en");
        expect(funnyLevel("en")).toBe(1);
        expect(funnyLevel("yue")).toBe(1);
        expect(pair("welcome.heading").secondary).toBeNull();

        // The policy is a read-time override. The user's stored values remain untouched and
        // come back as soon as the local record is removed.
        expect(setupStorage().read("worldlens.language.mode")).toBe("bilingual");
        expect(setupStorage().read("worldlens.language.funny.en")).toBe("5");
        expect(setupStorage().read("worldlens.language.funny.yue")).toBe("4");

        deleteSchoolModeLocalRecord();
        expect(languageMode()).toBe("bilingual");
        expect(funnyLevel("en")).toBe(5);
        expect(funnyLevel("yue")).toBe(4);
    });

    it("keeps the chosen name discoverable but removes language and tone search labels", () => {
        renameSchoolMode("Quiet study");
        enableSchoolMode();

        const labels = languageSearchLabels().join("\n");
        expect(labels).toContain("Quiet study");
        expect(labels).not.toContain("School mode");
        expect(labels.toLowerCase()).not.toContain("funny");
        expect(labels.toLowerCase()).not.toContain("cantonese");
    });
});
