/**
 * The guard for the quick entry beside every Settings pointer.
 *
 * A rule that only checks the entries already on a list passes on a pointer nobody listed,
 * because it never looked. So this does three things: it holds the hand-written inventory to
 * its own claims (a `wired` surface really mounts the control, an `exempt` or `unfinished`
 * one says why), it scans the source for pointer-shaped wording and fails when the file that
 * holds it is not named in the inventory, and it proves the quick entry and the Settings row
 * write one stored value rather than two.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAP_STORAGE_DIR_KEY } from "../../setup/mapStorage.js";
import { SETTINGS_SECTIONS } from "../settingsSections.js";
import {
    QUICK_ADD_POINTERS,
    QUICK_ADD_TARGETS,
    quickAddControlFor,
    type QuickAddPointer,
} from "./quickAddPointers.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function vueFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === "node_modules") continue;
            vueFiles(full, found);
        } else if (entry.endsWith(".vue")) {
            found.push(full);
        }
    }
    return found;
}

function rel(file: string): string {
    return relative(SRC, file).replace(/\\/g, "/");
}

function read(path: string): string {
    return readFileSync(join(SRC, path), "utf8");
}

const surfacesOf = (pointer: QuickAddPointer): string[] => [pointer.surface, ...(pointer.alsoOn ?? [])];

describe("the hand-written inventory", () => {
    it("lists the pointer surfaces that must carry a quick entry", () => {
        // Hand-written on purpose. Deleting a row here must be a visible decision.
        const wired = QUICK_ADD_POINTERS.filter((pointer) => pointer.status === "wired")
            .map((pointer) => pointer.id)
            .sort();
        expect(wired).toEqual([
            "cirender-consent",
            "config-field-consent",
            "config-run-consent",
            "download-row-remedy",
            "render-console-advice",
            "wizard-review-consent",
        ]);
    });

    it("mounts the control on every surface marked wired", () => {
        const missing: string[] = [];
        for (const pointer of QUICK_ADD_POINTERS.filter((entry) => entry.status === "wired")) {
            for (const surface of surfacesOf(pointer)) {
                if (!read(surface).includes("<SettingsQuickAdd")) missing.push(`${pointer.id}: ${surface}`);
            }
        }
        expect(missing, "a wired pointer lost its quick entry").toEqual([]);
    });

    it("says why on every pointer that is not wired", () => {
        for (const pointer of QUICK_ADD_POINTERS.filter((entry) => entry.status !== "wired")) {
            expect(pointer.reason, pointer.id).toBeTruthy();
        }
    });

    it("only names real files and real Settings sections", () => {
        for (const pointer of QUICK_ADD_POINTERS) {
            for (const surface of surfacesOf(pointer)) {
                expect(() => read(surface), `${pointer.id}: ${surface}`).not.toThrow();
            }
            for (const anchor of pointer.anchors) {
                expect(SETTINGS_SECTIONS as readonly string[], pointer.id).toContain(anchor);
            }
        }
    });

    it("gives every target either a control and a stored key, or a reason", () => {
        for (const target of QUICK_ADD_TARGETS) {
            if (target.control === null) {
                expect(target.reason, target.anchor).toBeTruthy();
                expect(target.settingsKey, target.anchor).toBeNull();
            } else {
                expect(target.settingsKey, target.anchor).toBeTruthy();
                expect(target.reason, target.anchor).toBeNull();
            }
        }
    });

    it("has a quick entry for every anchor a wired pointer can name, or says why not", () => {
        for (const pointer of QUICK_ADD_POINTERS.filter((entry) => entry.status === "wired")) {
            for (const anchor of pointer.anchors) {
                const target = QUICK_ADD_TARGETS.find((entry) => entry.anchor === anchor);
                expect(target, `${pointer.id} names ${anchor} with no target row`).toBeDefined();
            }
        }
    });
});

describe("the source scan", () => {
    const listed = new Set(QUICK_ADD_POINTERS.flatMap(surfacesOf));

    // Wording that tells the person to go and do something in Settings.
    const POINTER = /"[^"\n]*(Open the (?:download |consent )?setting\b|GitHub accounts in Settings)[^"\n]*"/;

    it("finds no file with pointer wording that the inventory does not name", () => {
        const unlisted: string[] = [];
        for (const file of vueFiles(SRC)) {
            const path = rel(file);
            if (path.endsWith(".test.vue")) continue;
            if (POINTER.test(readFileSync(file, "utf8")) && !listed.has(path)) unlisted.push(path);
        }
        expect(
            unlisted,
            "a message tells the person to use Settings and has no entry in QUICK_ADD_POINTERS. " +
                "Wire a quick entry beside it and list it, or list it with the reason it cannot have one.",
        ).toEqual([]);
    });

    it("notices an unlisted pointer: the scan is not vacuous", () => {
        expect(POINTER.test('t("x", "Open the setting")')).toBe(true);
        expect(POINTER.test('t("x", "Sign in from GitHub accounts in Settings.")')).toBe(true);
        expect(POINTER.test('t("x", "Nothing to see")')).toBe(false);
    });
});

describe("one stored value, not two", () => {
    it("writes the maps folder under the key the Settings row stores", () => {
        const target = QUICK_ADD_TARGETS.find((entry) => entry.anchor === "map-storage-directory");
        expect(target?.settingsKey).toBe(MAP_STORAGE_DIR_KEY);
        expect(quickAddControlFor("map-storage-directory")).toBe("folder");
    });

    it("drives the quick entry from the very controllers the Settings sheet uses", () => {
        const quickAdd = read("components/settings/quickAdd/SettingsQuickAdd.vue");
        const sheet = read("components/settings/AppSettings.vue");
        expect(quickAdd).toContain("createMapStorageSetting()");
        expect(sheet).toContain("createMapStorageSetting()");
        expect(quickAdd).toContain("createConsentSettings(");
        expect(read("components/setup/ConsentSettingsRow.vue")).toContain("createConsentSettings(");
    });

    it("has the Settings sheet reload its rows when a quick entry saves", () => {
        const sheet = read("components/settings/AppSettings.vue");
        expect(sheet).toContain("lastQuickAddSave");
        expect(sheet).toContain("storage.load()");
        expect(sheet).toContain("consentRow.value?.reload()");
    });
});
