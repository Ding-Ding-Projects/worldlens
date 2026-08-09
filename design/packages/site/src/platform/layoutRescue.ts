import type { Preferences } from "./Preferences.js";

/**
 * A way out of a layout preference that has made the site unusable, reachable without clicking.
 *
 * Every other reset this site offers lives inside the site: a control on the settings page, an
 * entry in the command palette, a menu item. All of them assume the visitor can still operate
 * the interface, which is exactly the assumption that fails when the broken thing is the
 * interface. A visitor whose dock choice left them looking at a page that will not respond has
 * no working control to press, and the choice survives a reload, so waiting does not help
 * either - the site has locked itself and posted the key inside.
 *
 * The address bar is the one control that keeps working when the page does not. It needs no
 * pointer target, no visible affordance and no functioning layout; it is equally available on a
 * phone, which matters, because the layout most likely to strand somebody is the one that only
 * misbehaves at phone widths. So `?reset=layout` forgets the tab dock and the rail's collapsed
 * state, and `?reset=all` forgets every preference the site owns.
 *
 * This is deliberately a rescue rather than a repair. It does not try to detect an unusable
 * layout and correct it on the visitor's behalf: a guard that decides for itself when a screen
 * is unusable will eventually decide wrongly, and silently discarding a preference somebody
 * chose is its own kind of defect. The visitor asks, in words, and gets exactly what they asked
 * for.
 *
 * The parameter is stripped from the address afterwards. Left in place it would survive a
 * bookmark and a refresh, and a URL that quietly wipes preferences every time it is opened is a
 * worse trap than the one this exists to escape.
 */

/** The preferences that decide the shape of the frame, and nothing else. */
export const LAYOUT_PREFERENCE_KEYS = ["tabs.state", "tabs.sidebarCollapsed"] as const;

export const RESET_PARAMETER = "reset";

export type LayoutRescueOutcome = "none" | "layout" | "all";

export interface LayoutRescueSurroundings {
    readonly href: string;
    /** Rewrite the address without navigating. Omitted where no history API exists. */
    readonly replace?: (url: string) => void;
}

/**
 * Honour a `?reset=` request, if one is present, and report what was forgotten.
 *
 * Called before anything reads a preference, so the shell is built from the rescued state
 * rather than being built from the broken one and corrected a frame later.
 */
export function applyLayoutRescue(
    prefs: Preferences,
    surroundings: LayoutRescueSurroundings,
): LayoutRescueOutcome {
    let url: URL;
    try {
        url = new URL(surroundings.href);
    } catch {
        return "none";
    }

    const requested = url.searchParams.get(RESET_PARAMETER);
    if (requested !== "layout" && requested !== "all") return "none";

    if (requested === "all") {
        prefs.resetAll();
    } else {
        for (const key of LAYOUT_PREFERENCE_KEYS) prefs.remove(key);
    }

    url.searchParams.delete(RESET_PARAMETER);
    // `URL` renders an empty query as a bare "?", which is a visible change to an address the
    // visitor typed. Drop it, so the rescued URL is the one they would have arrived at anyway.
    const cleaned = `${url.origin}${url.pathname}${url.search === "?" ? "" : url.search}${url.hash}`;
    surroundings.replace?.(cleaned);

    return requested;
}
