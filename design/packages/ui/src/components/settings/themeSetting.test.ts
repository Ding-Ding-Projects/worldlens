// @vitest-environment jsdom

/**
 * The shell-level theme choice: that it reads and writes the viewer's own stored record
 * (same key, same JSON encoding), that a choice made with no map open reaches the next
 * viewer to start - including one whose map never opted into `useCookies` and so loads
 * no stored settings of its own - that a change made through the in-map menu survives
 * that viewer being torn down, and that a theme the viewer resolved for itself is never
 * written to the record as though somebody had chosen it.
 *
 * The Vuetify half - `useBlueMapTheme` falling back to this module's `currentTheme` when
 * no app is running - is asserted through `currentTheme` itself here: that computed is
 * the exact value the bridge reads.
 */

import { nextTick, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlueMapApp } from "@worldlens/viewer";
import { blueMapApp, setBlueMapApp } from "../../stores/bluemap.js";
import {
    FRESH_INSTALL_THEME,
    THEME_CHOICES,
    THEME_STORAGE_KEY,
    changeTheme,
    currentTheme,
    readStoredTheme,
    type ThemeChoice,
} from "./themeSetting.js";

interface FakeApp {
    appState: { theme: string | null };
    setTheme: ReturnType<typeof vi.fn>;
}

/** The two members this module touches, reactive the way the real viewer's state is. */
function fakeApp(theme: string | null = null): FakeApp {
    const appState = reactive({ theme });
    const app: FakeApp = {
        appState,
        setTheme: vi.fn((choice: string | null) => {
            appState.theme = choice;
        }),
    };
    return app;
}

function install(app: FakeApp): void {
    setBlueMapApp(app as unknown as BlueMapApp);
}

beforeEach(async () => {
    setBlueMapApp(null);
    localStorage.clear();
    changeTheme(null);
    await nextTick();
});

afterEach(async () => {
    setBlueMapApp(null);
    localStorage.clear();
    changeTheme(null);
    await nextTick();
});

describe("the stored record", () => {
    it("is the viewer's own: same key, same JSON encoding", () => {
        changeTheme("dark");
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(JSON.stringify("dark"));
    });

    it("reads back every choice, including follow-the-system", () => {
        for (const choice of THEME_CHOICES) {
            changeTheme(choice);
            expect(readStoredTheme()).toBe(choice);
        }
    });

    it("answers the fresh-install default for a value that is not a theme", () => {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify("neon"));
        expect(readStoredTheme()).toBe(FRESH_INSTALL_THEME);
        localStorage.setItem(THEME_STORAGE_KEY, "not json {");
        expect(readStoredTheme()).toBe(FRESH_INSTALL_THEME);
    });

    /**
     * The distinction this pair guards is the one `readStoredTheme` exists to make: an
     * absent record means nobody has chosen, so the fresh-install default applies, while a
     * stored `null` is somebody having chosen to follow the system and must survive.
     * Collapsing the two would silently overwrite a deliberate choice on the next launch,
     * and the failure would look like the theme setting simply not persisting.
     */
    it("answers the fresh-install default when nothing has ever been stored", () => {
        localStorage.removeItem(THEME_STORAGE_KEY);
        expect(readStoredTheme()).toBe(FRESH_INSTALL_THEME);
    });

    it("keeps a stored follow-the-system rather than treating it as never having chosen", () => {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(null));
        expect(readStoredTheme()).toBeNull();
    });
});

describe("with no viewer running", () => {
    it("a change lands in currentTheme immediately, which is what the Vuetify bridge reads", () => {
        changeTheme("contrast");
        expect(currentTheme.value).toBe("contrast");
        expect(blueMapApp.value).toBeNull();
    });
});

describe("when a viewer starts", () => {
    it("pushes the stored choice into an app that loaded none of its own", async () => {
        changeTheme("dark");

        const app = fakeApp(null);
        install(app);
        await nextTick();

        expect(app.setTheme).toHaveBeenCalledWith("dark");
        expect(currentTheme.value).toBe("dark");
    });

    it("leaves an app alone when it already loaded the same record", async () => {
        changeTheme("light");

        const app = fakeApp("light");
        install(app);
        await nextTick();

        expect(app.setTheme).not.toHaveBeenCalled();
    });

    it("a choice made on the settings surface reaches the live app too", async () => {
        const app = fakeApp(null);
        install(app);
        await nextTick();

        changeTheme("contrast");
        expect(app.setTheme).toHaveBeenCalledWith("contrast");
        expect(currentTheme.value).toBe("contrast");
    });
});

describe("when the in-map menu changes the theme", () => {
    /**
     * The in-map menu and the palette both call `changeTheme` now rather than writing
     * `appState.theme`, so the choice is durable at the moment it is made instead of at
     * the moment a watcher notices. This asserts the outcome the old mirror-back arm
     * existed to produce - the choice outliving the viewer - through the path that
     * actually produces it.
     */
    it("keeps the choice after the viewer is torn down", async () => {
        const app = fakeApp(null);
        install(app);
        await nextTick();

        changeTheme("light");
        await nextTick();

        expect(app.setTheme).toHaveBeenCalledWith("light" satisfies ThemeChoice);

        setBlueMapApp(null);
        await nextTick();

        expect(currentTheme.value).toBe("light" satisfies ThemeChoice);
        expect(readStoredTheme()).toBe("light");
    });
});

/**
 * The regression this module was rewritten for.
 *
 * `appState.theme` is not written only by people. `BlueMapApp`'s constructor builds a
 * `MaterialShell`, which resolves `localStorage.getItem("bluemap-theme") || "light"` and
 * writes the answer back unencoded; `loadUserSettings()` then reads that unparseable
 * record through `getLocalStorage`, gets the raw string back because `JSON.parse` threw,
 * and calls `setTheme("light")`. All of that happens *after* `MapView` has installed the
 * app into the store - it calls `setBlueMapApp(app)` and only then awaits `app.load()` -
 * so it arrives here as a change to the same app that was already being watched.
 *
 * The old watcher treated that as somebody having pressed Light and wrote it into the
 * record, which `readStoredTheme` then honoured on every launch afterwards. What these
 * assert is the *persisted record*, not the rendered theme: a session in which nobody
 * touched a theme control must leave the stored record exactly as it found it.
 */
describe("when the viewer resolves a theme of its own", () => {
    it("does not persist it as a choice, on a profile that has never chosen", async () => {
        // A genuinely fresh profile: nothing stored, so the fresh-install default applies.
        changeTheme(FRESH_INSTALL_THEME);
        localStorage.removeItem(THEME_STORAGE_KEY);

        const app = fakeApp(null);
        install(app);
        await nextTick();
        expect(app.setTheme).toHaveBeenCalledWith(FRESH_INSTALL_THEME);

        // The viewer's own startup, several steps into `load()`. Nobody pressed anything.
        app.appState.theme = "light";
        await nextTick();

        setBlueMapApp(null);
        await nextTick();

        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
        expect(readStoredTheme()).toBe(FRESH_INSTALL_THEME);
        expect(currentTheme.value).toBe(FRESH_INSTALL_THEME);
    });

    it("does not overwrite a choice that was made", async () => {
        changeTheme("contrast");

        const app = fakeApp(null);
        install(app);
        await nextTick();

        app.appState.theme = "light";
        await nextTick();

        expect(readStoredTheme()).toBe("contrast");
        expect(currentTheme.value).toBe("contrast" satisfies ThemeChoice);
    });

    /**
     * A stored follow-the-system is the case with the most to lose, because `null` is the
     * one choice the viewer's own resolution can never produce - it always lands on a
     * concrete theme - so a mirror-back arm destroyed it every single time a map opened.
     */
    it("does not destroy a stored follow-the-system", async () => {
        changeTheme(null);

        const app = fakeApp(null);
        install(app);
        await nextTick();

        app.appState.theme = "light";
        await nextTick();

        expect(readStoredTheme()).toBeNull();
        expect(currentTheme.value).toBeNull();
    });

    /** The correction is applied to the live viewer, not merely withheld from the record. */
    it("puts the chosen theme back into the viewer that wandered off it", async () => {
        changeTheme("dark");

        const app = fakeApp("dark");
        install(app);
        await nextTick();

        app.appState.theme = "light";
        await nextTick();

        expect(app.setTheme).toHaveBeenLastCalledWith("dark" satisfies ThemeChoice);
        expect(app.appState.theme).toBe("dark");
    });
});
