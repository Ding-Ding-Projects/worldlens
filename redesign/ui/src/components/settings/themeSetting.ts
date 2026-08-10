/**
 * The theme choice - follow the system, dark, light, or the high-contrast scheme -
 * reachable without a map.
 *
 * The viewer has always offered this, in its own settings menu, and that menu only
 * exists while a map is open. Somebody who has not rendered anything yet - the exact
 * person most likely to be setting the app up to their eyes - had no theme control at
 * all. This module gives the settings surface the same choice against the same stored
 * record, so the two controls can never disagree about what was chosen.
 *
 * ## One record, one authority
 *
 * The stored record is the viewer's own `bluemap-theme` localStorage entry, written
 * through the same JSON encoding `BlueMapApp.saveUserSetting` uses. That record - not
 * the running viewer's `appState.theme` - is the authority, and every control a person
 * can actually press routes through {@link changeTheme}, which writes the record and
 * then pushes the result into whatever viewer happens to be running. `currentTheme`
 * reports the record, `useBlueMapTheme` reads `currentTheme`, and the module watcher
 * below holds the live viewer to it.
 *
 * It used to be the other way round: while a viewer was live its `appState.theme` won,
 * and this module mirrored any change to that field back out into the record. The
 * trouble is that `appState.theme` has writers that are not people. `BlueMapApp`'s
 * constructor builds a `MaterialShell`, whose own constructor resolves
 * `localStorage.getItem("bluemap-theme") || "light"` and writes the result back
 * unencoded; `loadUserSettings()` then reads that unparseable record through
 * `getLocalStorage`, which hands back the raw string on a JSON failure, and calls
 * `setTheme("light")`. That arrives at a mirror-back watcher looking exactly like a
 * person pressing Light, and gets written into the record as a deliberate choice - one
 * that `readStoredTheme` then honours forever, on a profile where nobody ever touched a
 * theme control. Reversing the precedence is what makes that class of forgery
 * impossible rather than merely unlikely: a value can only reach the record by being
 * passed to `changeTheme`, and only a control calls that.
 *
 * `null` is a real choice, not an absence: it means "follow the system", exactly as it
 * does in the viewer.
 */

import { computed, ref, watch } from "vue";
import type { ComputedRef } from "vue";
import { blueMapApp } from "../../stores/bluemap.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

/** Upstream's own value set: null follows the system. */
export type ThemeChoice = "dark" | "light" | "contrast" | null;

/** Every choice, in the order the row lists them. */
export const THEME_CHOICES: readonly ThemeChoice[] = [null, "dark", "light", "contrast"];

/**
 * The viewer's own storage key, spelled the way `BlueMapApp.saveUserSetting` spells it:
 * `"bluemap-" + key`, value JSON-encoded. Written here byte-compatibly so the viewer's
 * `loadUserSettings()` reads a choice made on this screen exactly as it reads its own.
 */
export const THEME_STORAGE_KEY = "bluemap-theme";

function isThemeChoice(value: unknown): value is ThemeChoice {
    return value === null || value === "dark" || value === "light" || value === "contrast";
}

/**
 * The option id a button group or palette row carries, as a choice.
 *
 * Those surfaces spell follow-the-system `"default"` rather than `null`, because a toggle
 * group needs a value for every button and `null` is not one. An id that is neither
 * `"default"` nor a theme cannot come from a rendered control, so it resolves to
 * follow-the-system too - the same answer {@link readStoredTheme} gives an unusable
 * record, and the only answer that cannot leave the interface showing something nobody
 * asked for.
 */
export function themeChoiceFromId(id: string): ThemeChoice {
    if (id === "default") return null;
    return isThemeChoice(id) ? id : null;
}

/**
 * What a profile that has never chosen a theme gets.
 *
 * Dark, not follow-the-system, and the Material Design 3 rewrite is why. The shell is a map
 * viewer: the canvas is a lit 3D world and the chrome around it is a frame, so a light frame puts
 * the brightest thing on screen around the thing you are meant to be looking at. Following the
 * system meant a majority of fresh installs opened light and every screenshot of the product
 * disagreed with every other one.
 *
 * It is a **default**, not a policy. Light and contrast are one press away and a stored choice
 * always wins - `readStoredTheme` returns exactly what was written, including an explicit
 * follow-the-system, so nobody who chose is overridden by this.
 */
export const FRESH_INSTALL_THEME: ThemeChoice = "dark";

/**
 * The stored choice, or the fresh-install default when there is none or it does not parse.
 *
 * A stored `null` is a real value meaning "follow the system", and it is preserved: only the
 * *absence* of a record falls through to {@link FRESH_INSTALL_THEME}. That distinction is the
 * whole reason this is not a coalesce at the call site - conflating "never chose" with "chose to
 * follow the system" would silently overwrite a deliberate choice on the next launch.
 */
export function readStoredTheme(): ThemeChoice {
    try {
        const raw = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
        if (raw === null || raw === undefined) return FRESH_INSTALL_THEME;
        const parsed: unknown = JSON.parse(raw);
        return isThemeChoice(parsed) ? parsed : FRESH_INSTALL_THEME;
    } catch {
        // A blocked store and a value that is not JSON both mean the same thing here: no usable
        // stored choice, so the fresh-install default rather than the system's.
        return FRESH_INSTALL_THEME;
    }
}

/** Writes the choice in the viewer's own encoding, degrading silently where storage is blocked. */
function writeStoredTheme(choice: ThemeChoice): void {
    try {
        globalThis.localStorage?.setItem(THEME_STORAGE_KEY, JSON.stringify(choice));
    } catch {
        // Private mode or a full quota. The choice still applies to this session.
    }
}

/**
 * The chosen theme, as this shell last read or wrote it.
 *
 * A module-level ref for the same reason `uiSizeSetting.ts`'s readout is one: there is
 * exactly one theme, and the settings row and the Vuetify theme bridge must be reading
 * the same value or one of them is lying.
 */
const storedTheme = ref<ThemeChoice>(readStoredTheme());

/**
 * The one answer to "what theme was chosen".
 *
 * Deliberately the record rather than the running viewer's `appState.theme`. Reading the
 * viewer first would mean every surface briefly reports whatever that field happened to
 * be resolved to by the viewer's own startup, which is a value nobody chose; it would
 * also reintroduce, in the readers, exactly the ambiguity the watcher below exists to
 * remove. Where a viewer is running the two agree, because the watcher holds it to this.
 */
export const currentTheme: ComputedRef<ThemeChoice> = computed(() => storedTheme.value);

/**
 * Holds the live viewer to the chosen theme, for the life of the page.
 *
 * A module-level watcher rather than one per component, because it must run even while
 * no settings surface is mounted; it lives as long as the store it watches, exactly like
 * that store itself.
 *
 * **A new viewer app gets the stored choice pushed into it.** The viewer only loads its
 * own persisted settings when the map's `settings.json` opts into `useCookies`, and the
 * fallback when a map ships no such file is `false` - so a freshly opened local map can
 * start at `theme: null` in the face of a stored "dark", and the whole window would snap
 * to the system scheme the moment a map loaded. Pushing is convergent rather than a
 * second opinion: where the viewer *does* load its settings, it reads the very record
 * this module writes, so both writers arrive at the same value in either order.
 *
 * **A change made in the in-map settings menu still survives the viewer being torn down**
 * on a profile switch - but it survives because the menu writes the record itself, not
 * because this watcher copies it out afterwards. `menu/SettingsMenu.vue` and the command
 * palette's viewer section both call {@link changeTheme}, so the choice is durable at the
 * moment it is made, before any of it depends on a watcher noticing.
 *
 * The push is deliberately not restricted to the first time a given app is seen. The
 * viewer resolves its own theme *after* it has been installed into the store - `MapView`
 * calls `setBlueMapApp(app)` and only then awaits `app.load()`, which reaches
 * `loadUserSettings()` several steps in - so a same-app change is the normal way the
 * viewer's startup announces a theme this shell never agreed to. Re-asserting is what
 * turns that into a corrected frame instead of a forged choice.
 */
watch(
    () => [blueMapApp.value, blueMapApp.value?.appState.theme] as const,
    ([app, live]) => {
        if (app === null) return;
        const showing = isThemeChoice(live) ? live : null;
        if (showing !== storedTheme.value) app.setTheme(storedTheme.value);
    },
);

/**
 * Changes the theme. The single way a chosen theme becomes a stored one.
 *
 * The record is written first and unconditionally, because that is what makes the choice
 * durable whether or not a viewer is running and whether or not the map it is showing
 * ever opted into `useCookies`. The live app is then pushed to match, which repaints the
 * map's own marker chrome, and the choice is mirrored into the settings history bag under
 * `theme`, fire-and-forget like every other key `recordAppSetting` carries.
 *
 * Every theme control calls this - the settings row, the in-map settings menu, the
 * command palette. Nothing else may write the record, and nothing that writes
 * `appState.theme` behind this function's back will be persisted, which is the entire
 * point: see the module comment for the viewer's own startup writing "light" into that
 * field on a profile where nobody chose anything.
 */
export function changeTheme(choice: ThemeChoice): void {
    storedTheme.value = choice;
    writeStoredTheme(choice);

    const app = blueMapApp.value;
    if (app !== null && app.appState.theme !== choice) {
        app.setTheme(choice);
    }

    recordAppSetting("theme", choice);
}
