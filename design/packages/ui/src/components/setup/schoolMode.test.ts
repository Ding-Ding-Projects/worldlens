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
    schoolModeRestriction,
    setSchoolModeRecordAdapter,
    useSchoolMode,
    type SchoolModeRecordAdapter,
    type SchoolModeSnapshot,
} from "./schoolMode.js";

const disabled: SchoolModeSnapshot = {
    version: 1,
    enabled: false,
    name: null,
    credentialConfigured: false,
};

beforeEach(async () => {
    setSetupStorage(memoryStorage());
    await resetSchoolModeRecordAdapter();
    reloadSetupLanguage();
});

afterEach(async () => {
    await deleteSchoolModeLocalRecord();
    await resetSchoolModeRecordAdapter();
});

describe("the explicit browser/test-local fallback", () => {
    it("persists only local enabled state and chosen name, never a credential or shared claim", async () => {
        await renameSchoolMode("Classroom focus");
        await enableSchoolMode({ name: "Classroom focus", credential: "not-persisted" });

        expect(schoolModeEnabled()).toBe(true);
        expect(schoolModeName("School mode")).toBe("Classroom focus");
        expect(useSchoolMode().source.value).toBe("local-fallback");
        expect(JSON.parse(setupStorage().read(SCHOOL_MODE_RECORD_KEY) ?? "{}")).toEqual({
            version: 1,
            enabled: true,
            name: "Classroom focus",
        });
        expect(setupStorage().read(SCHOOL_MODE_RECORD_KEY)).not.toContain("not-persisted");
        expect(useSchoolMode().credentialConfigured.value).toBe(false);

        await reloadSchoolMode();
        expect(schoolModeEnabled()).toBe(true);
        expect(schoolModeName("School mode")).toBe("Classroom focus");
    });
});

describe("the shared preload adapter", () => {
    it("uses only bridge-safe snapshots and never copies a credential into reactive state", async () => {
        let snapshot: SchoolModeSnapshot = disabled;
        const enable = vi.fn(async (request: { name: string | null; credential: string }) => {
            snapshot = { version: 1, enabled: true, name: request.name, credentialConfigured: true };
            return { ok: true as const, state: snapshot };
        });
        const adapter: SchoolModeRecordAdapter = {
            source: "shared",
            read: async () => ({ ok: true, state: snapshot }),
            enable,
            rename: async (name) => {
                snapshot = { ...snapshot, name };
                return { ok: true, state: snapshot };
            },
            disable: async () => {
                snapshot = { ...snapshot, enabled: false };
                return { ok: true, state: snapshot };
            },
            reset: async () => ({ ok: true, state: disabled }),
        };

        await setSchoolModeRecordAdapter(adapter);
        const credential = "test-only-unlock";
        await enableSchoolMode({ name: "Quiet study", credential });

        expect(enable).toHaveBeenCalledWith({ name: "Quiet study", credential });
        expect(useSchoolMode().source.value).toBe("shared");
        expect(useSchoolMode().credentialConfigured.value).toBe(true);
        const restriction = JSON.stringify(schoolModeRestriction());
        expect(restriction).not.toContain(credential);
        expect(restriction).not.toContain("hash");
        expect(restriction).not.toContain("salt");
    });

    it("does not fall back to browser storage when a packaged host read fails", async () => {
        await enableSchoolMode({ name: "Browser-only state", credential: "not-persisted" });
        const fallbackRecord = setupStorage().read(SCHOOL_MODE_RECORD_KEY);
        const failingHost: SchoolModeRecordAdapter = {
            source: "shared",
            read: async () => ({
                ok: false as const,
                code: "storage-unavailable",
                message: "The shared mode record could not be read.",
                state: null,
            }),
            enable: async () => ({ ok: true as const, state: disabled }),
            rename: async () => ({ ok: true as const, state: disabled }),
            disable: async () => ({ ok: true as const, state: disabled }),
            reset: async () => ({ ok: true as const, state: disabled }),
        };

        await setSchoolModeRecordAdapter(failingHost);

        expect(useSchoolMode().source.value).toBe("unavailable");
        expect(schoolModeEnabled()).toBe(false);
        expect(schoolModeName("School mode")).toBe("School mode");
        expect(setupStorage().read(SCHOOL_MODE_RECORD_KEY)).toBe(fallbackRecord);
        expect(languageSearchLabels()).toContain("The packaged app could not read the shared mode record. Local fallback is not used, so no shared state is being claimed.");
    });
});

describe("the effective School-mode policy", () => {
    it("forces English and fully serious copy without overwriting saved choices", async () => {
        setLanguageMode("bilingual");
        setFunnyLevel("en", 5);
        setFunnyLevel("yue", 4);
        await enableSchoolMode({ name: "Focus", credential: "not-persisted" });

        expect(languageMode()).toBe("en");
        expect(funnyLevel("en")).toBe(1);
        expect(funnyLevel("yue")).toBe(1);
        expect(pair("welcome.heading").secondary).toBeNull();

        expect(setupStorage().read("worldlens.language.mode")).toBe("bilingual");
        expect(setupStorage().read("worldlens.language.funny.en")).toBe("5");
        expect(setupStorage().read("worldlens.language.funny.yue")).toBe("4");

        await deleteSchoolModeLocalRecord();
        expect(languageMode()).toBe("bilingual");
        expect(funnyLevel("en")).toBe(5);
        expect(funnyLevel("yue")).toBe(4);
    });

    it("keeps a chosen name discoverable but removes language and tone search labels while active", async () => {
        await enableSchoolMode({ name: "Quiet study", credential: "not-persisted" });

        const labels = languageSearchLabels().join("\n");
        expect(labels).toContain("Quiet study");
        expect(labels).not.toContain("School mode");
        expect(labels.toLowerCase()).not.toContain("funny");
        expect(labels.toLowerCase()).not.toContain("cantonese");
    });
});
