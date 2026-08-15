/**
 * The drive surface: everything `test/capture.spec.ts` (or any other script) uses to put Kid Mode
 * into a specific, reproducible state before photographing it.
 *
 * Every function here does one of two things, and says which:
 *
 *   - writes a real persisted preference the real renderer reads at boot, then reloads the page so
 *     the change actually takes effect. This is not a shortcut invented for this harness - it is the
 *     exact idiom `packages/app/test/screenshots.spec.ts`'s own `pointAppAtCaptureTarget` already
 *     uses for the same reason: several of these stores are read once, at module load, into a
 *     `reactive` singleton (`components/setup/setupI18n.ts`'s own `state`, for one), so a value
 *     written after the module has already loaded has no effect until the module is re-evaluated -
 *     which a full page reload is the honest way to force.
 *   - drives the real DOM: clicks the rail, opens a job through the same new-tab menu a person would
 *     use, types into the grown-up gate's own password field. Nothing here reaches into a component's
 *     internals or calls an exposed method directly - `KidShell.vue`'s `defineExpose({ensureJob,
 *     revealJob, award})` has no `window`-level handle a Node-side script could reach anyway, and
 *     driving the real controls is what proves the seam a unit test's injected dependency cannot.
 *
 * Every localStorage key and every DOM selector below is copied from the real source it drives,
 * with a citation, rather than guessed - this package owns none of `packages/ui/src` and can add no
 * `data-testid` hooks to it, so a selector that is wrong here fails loudly rather than silently
 * matching the wrong element.
 */
import { expect, type ElectronApplication, type Page } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/* Storage keys, copied from their owning modules                             */
/* -------------------------------------------------------------------------- */

/** `design/packages/ui/src/components/setup/setupI18n.ts` */
const LANGUAGE_MODE_KEY = "worldlens.language.mode";
const FUNNY_EN_KEY = "worldlens.language.funny.en";
const FUNNY_YUE_KEY = "worldlens.language.funny.yue";

/** `design/packages/ui/src/components/settings/themeSetting.ts` - JSON-encoded, `null` is real. */
const THEME_KEY = "bluemap-theme";

/** `design/packages/ui/src/kid/useKidProgress.ts` - JSON-encoded `{xp, won: [{id, at}]}`. */
const KID_PROGRESS_KEY = "bluemap-kid-progress";

export type LanguageMode = "en" | "yue" | "bilingual";
export type FunnyLevel = 1 | 2 | 3 | 4 | 5;
export type ThemeChoice = "dark" | "light" | "contrast" | null;
export type KidDestination = "home" | "map" | "work" | "stickers" | "grown-ups";

/**
 * The eight stickers `design/packages/ui/src/kid/useKidProgress.ts` defines. Kept here as a bare id
 * union (not the whole definition table, which also carries icon path data this harness never
 * renders anything with) so `seedKidProgress` below can be called with a real id and nothing else.
 */
export type StickerId =
    | "first-map"
    | "world-finder"
    | "speed-racer"
    | "pin-dropper"
    | "safe-keeper"
    | "sharer"
    | "fixer"
    | "time-traveller";

/**
 * The kid label text `design/packages/ui/src/kid/kidLabels.ts`'s `KID_CATALOGUE_LABELS` gives each
 * of the five catalogues. `KidHome.vue` renders this text as a plain hard-coded string - it is not
 * run through `t()` - so unlike a rail button's label it stays the same across every language mode,
 * which makes it a stable selector rather than one that would need re-deriving per language.
 *
 * Deliberately not typed as `Readonly<Record<string, string>>`: with `noUncheckedIndexedAccess`,
 * that broad index-signature type makes every lookup `string | undefined` regardless of how precise
 * the key type is, even when the key comes from `keyof typeof KID_CATALOGUE_LABELS` and TypeScript
 * therefore already knows the property exists. Leaving the type inferred from the literal below is
 * what lets `openCatalogue`'s lookup stay a plain `string` rather than needing a runtime check for a
 * case that cannot actually occur.
 */
const KID_CATALOGUE_LABELS = {
    make: "Make a map",
    maps: "Your maps",
    share: "Show people",
    copy: "Keep it safe",
    setup: "Buttons & help",
};

/**
 * A credential this harness owns end to end: seeded through the real `enable()`/`disable()` pair
 * (see `schoolModeStore.ts`'s `seedConfiguredCredential`) and typed back into the gate's own field
 * by `attemptUnlock` below. It is not a secret anything real depends on - it exists only inside one
 * Kid Check process's in-memory store, which is discarded the moment that process exits - so it is
 * fine to keep in source rather than generate per run.
 */
export const TEST_CREDENTIAL = "kid-check-drive-4242";

/* -------------------------------------------------------------------------- */
/* Waiting for the app to be in a stable, driveable state                     */
/* -------------------------------------------------------------------------- */

/**
 * Reloads the page and waits for Kid Mode's own shell to have actually rendered.
 *
 * `#app` exists the instant Vue mounts, which is too early: the very first render pass still has to
 * run before `.wl-kid-rail` exists, and every localStorage-driven preference change in this file
 * needs a reload to take effect at all (see this module's own doc comment for why). Every other
 * function below that changes a persisted preference calls this rather than repeating the wait.
 */
export async function reload(page: Page): Promise<void> {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#app", { timeout: 30_000 });
    await page.waitForSelector(".wl-kid-rail", { timeout: 30_000 });
}

/**
 * Waits for the very first boot, rather than reloading a page that has never loaded anything.
 * `capture.spec.ts` calls this once per Electron launch; every later state change goes through
 * {@link reload} instead.
 */
export async function waitForFirstBoot(page: Page): Promise<void> {
    await page.waitForSelector("#app", { timeout: 30_000 });
    await page.waitForSelector(".wl-kid-rail", { timeout: 30_000 });
}

/* -------------------------------------------------------------------------- */
/* Language mode and both funny-level sliders                                 */
/* -------------------------------------------------------------------------- */

/** Plain strings, not JSON - `setLanguageMode` in `setupI18n.ts` writes `state.mode` verbatim. */
export async function setLanguageMode(page: Page, mode: LanguageMode): Promise<void> {
    await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, value),
        { key: LANGUAGE_MODE_KEY, value: mode },
    );
    await reload(page);
}

/** Plain stringified numbers - `setFunnyLevel` writes `String(clamped)`, one key per language. */
export async function setFunnyLevel(page: Page, language: "en" | "yue", level: FunnyLevel): Promise<void> {
    const key = language === "en" ? FUNNY_EN_KEY : FUNNY_YUE_KEY;
    await page.evaluate(
        ({ storageKey, value }) => window.localStorage.setItem(storageKey, value),
        { storageKey: key, value: String(level) },
    );
    await reload(page);
}

/**
 * The underlying app-level theme preference. Kid Mode's own shell pins the "kid" Vuetify theme
 * unconditionally while `kid.enabled` is true (`App.vue`'s own watcher on it, and a second watcher
 * that snaps any stray `theme.name` back to "kid") - so this preference has **no visible effect on
 * any kid surface**, by the design documented in `vuetify.ts`'s own header. It is still real and
 * still exercised: `capture.spec.ts` writes both a light and a dark choice and captures Home under
 * each, which is what proves the pinning is deliberate pixel-invariance rather than this drive
 * function silently doing nothing.
 */
export async function setTheme(page: Page, choice: ThemeChoice): Promise<void> {
    await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
        { key: THEME_KEY, value: choice },
    );
    await reload(page);
}

/** True OS-level "prefers-reduced-motion", via CDP - no localStorage key involved. */
export async function setReducedMotion(page: Page, reduced: boolean): Promise<void> {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
}

export async function setViewport(page: Page, size: { width: number; height: number }): Promise<void> {
    await page.setViewportSize(size);
}

/* -------------------------------------------------------------------------- */
/* Kid progress: XP, level and stickers                                       */
/* -------------------------------------------------------------------------- */

export interface KidProgressSeed {
    readonly xp: number;
    readonly won: readonly StickerId[];
}

/** Writes the ledger `useKidProgress.ts` reads, in its own encoding, then reloads. */
export async function seedKidProgress(page: Page, seed: KidProgressSeed): Promise<void> {
    await page.evaluate(
        ({ key, ledger }) => window.localStorage.setItem(key, JSON.stringify(ledger)),
        {
            key: KID_PROGRESS_KEY,
            ledger: { xp: seed.xp, won: seed.won.map((id) => ({ id, at: new Date().toISOString() })) },
        },
    );
    await reload(page);
}

export async function clearKidProgress(page: Page): Promise<void> {
    await page.evaluate((key) => window.localStorage.removeItem(key), KID_PROGRESS_KEY);
    await reload(page);
}

/* -------------------------------------------------------------------------- */
/* The grown-up gate's two `credentialConfigured` states                      */
/* -------------------------------------------------------------------------- */

/**
 * Clears the harness's own school-mode store, so the gate's `credentialConfigured` reads false and
 * `KidGrownUpGate.vue` draws its "no grown-up code is set" branch. Mutating the main-process store
 * has no effect on an already-mounted renderer - `ensureSchoolModeReady()` memoises its result for
 * the life of the module - so this reloads afterwards, the same way every localStorage-driven change
 * in this file does.
 */
export async function forceGrownUpGateUnlocked(app: ElectronApplication, page: Page): Promise<void> {
    await app.evaluate(async () => {
        const store = (globalThis as unknown as { __kidCheckSchoolMode?: { reset(): unknown } })
            .__kidCheckSchoolMode;
        await store?.reset();
    });
    await reload(page);
}

/**
 * Seeds a real credential through the store's own `enable()`/`disable()` pair - the same sequence a
 * grown-up who set a shared code and then turned the mode back off would leave behind - so the gate
 * reads `credentialConfigured: true`, `enabled: false` and draws its "type the shared code" branch.
 * See `schoolModeStore.ts`'s own doc comment on why this is a seeding shortcut rather than a second,
 * fabricated code path: it calls the exact methods `KidGrownUpGate.vue`'s own unlock flow calls.
 */
export async function forceGrownUpGateLocked(
    app: ElectronApplication,
    page: Page,
    credential: string = TEST_CREDENTIAL,
): Promise<void> {
    await app.evaluate(async (_electron, cred) => {
        const store = (globalThis as unknown as {
            __kidCheckSchoolMode?: { seedConfiguredCredential(credential: string): Promise<void> };
        }).__kidCheckSchoolMode;
        await store?.seedConfiguredCredential(cred);
    }, credential);
    await reload(page);
}

/**
 * Types a code into the gate's own field and presses its own unlock button - real DOM interaction,
 * not a shortcut. Used both to prove a wrong code fails honestly (`credential` deliberately wrong)
 * and, if a caller wants it, to prove the real credential succeeds.
 */
export async function attemptUnlock(page: Page, credential: string): Promise<void> {
    const field = page.locator(".wl-kid-gate__field input");
    await field.waitFor({ state: "visible", timeout: 15_000 });
    await field.fill(credential);
    await page.locator(".wl-kid-gate__go").click();
    await page.waitForTimeout(400);
}

/* -------------------------------------------------------------------------- */
/* Getting anywhere in Kid Mode                                               */
/* -------------------------------------------------------------------------- */

/**
 * `.wl-kid-rail__big` (home/map/work/stickers, in template order) and `.wl-kid-rail__small`
 * (find/messages/grown-ups, in template order) from `KidRail.vue`. Positional rather than
 * text-matched on purpose: every rail label is run through `t()` and therefore changes with the
 * active language mode, while the class names and template order do not.
 */
const BIG_RAIL_ORDER: readonly ("home" | "map" | "work" | "stickers")[] = ["home", "map", "work", "stickers"];

export async function goToDestination(page: Page, destination: KidDestination): Promise<void> {
    if (destination === "grown-ups") {
        await page.locator(".wl-kid-rail__small").nth(2).click();
    } else {
        const index = BIG_RAIL_ORDER.indexOf(destination);
        await page.locator(".wl-kid-rail__big").nth(index).click();
    }
    // The status bar and the chosen pane both remount on a destination change; a short settle
    // avoids photographing a half-transitioned frame the way `parkPointer`'s own wait does in the
    // shipped app's harness.
    await page.waitForTimeout(300);
}

/**
 * Opens one of the five lands from Home, by its kid label (see {@link KID_CATALOGUE_LABELS}).
 * Requires Home to already be the active view - it does not navigate there itself, the same way
 * `openJob` below does not select the Work destination silently either, so a caller's own capture
 * sequence stays legible about what it actually drove.
 */
export async function openCatalogue(page: Page, catalogueId: keyof typeof KID_CATALOGUE_LABELS): Promise<void> {
    const label = KID_CATALOGUE_LABELS[catalogueId];
    await page
        .locator(".wl-kid-home__land", { hasText: label })
        .first()
        .click({ timeout: 15_000 });
    await page.waitForTimeout(300);
}

/**
 * Opens one job in the Work view, through the same new-tab menu a person would use.
 *
 * `WorkPane.vue` (re-hosted verbatim by `KidJobStrip.vue`) renders `.wl-work__tabs` as its tab strip
 * and tags a pinned tab with `data-tutorial-anchor="tab-<jobId>"` - the exact selectors
 * `packages/app/test/screenshots.spec.ts`'s own `openJob` helper already uses for the adult shell,
 * because it is the identical `WorkPane` instance. `kidLabel` is what the new-tab menu shows once
 * `KidJobStrip.applyKidLabels()` has renamed it (kid mode's own kid-label table,
 * `design/packages/ui/src/kid/kidLabels.ts`'s `KID_JOB_LABELS`); `shippedLabel` is the fallback in
 * case a menu row is read before that rename has applied.
 *
 * Deliberately simpler than the adult harness's own `openJob`: a fresh Kid Check workspace opens at
 * most the two or three jobs this drive module ever asks for, so the group-collapse and
 * tab-overflow fallbacks that helper needs on a sixteen-tab seeded workspace have nothing to do here.
 */
export async function openJob(
    page: Page,
    jobId: string,
    kidLabel: string,
    shippedLabel: string,
): Promise<void> {
    await goToDestination(page, "work");
    const strip = page.locator(".wl-work__tabs");
    const tab = strip.locator(`[data-tutorial-anchor="tab-${jobId}"]`).first();

    if ((await tab.count()) === 0) {
        await strip.locator('[aria-label="Open a new tab"]').first().click({ timeout: 15_000 });
        const byKidLabel = page
            .locator(".mb-tabs-strip__sheet:visible .v-list-item")
            .filter({ hasText: kidLabel });
        const byShippedLabel = page
            .locator(".mb-tabs-strip__sheet:visible .v-list-item")
            .filter({ hasText: shippedLabel });
        const item = (await byKidLabel.count()) > 0 ? byKidLabel.first() : byShippedLabel.first();
        await item.waitFor({ state: "visible", timeout: 15_000 });
        await item.click({ timeout: 15_000 });
        await page.waitForTimeout(400);
        return;
    }

    if ((await tab.getAttribute("aria-selected")) === "true") return;
    const label = tab.locator(".mb-tabs-strip__label");
    const aim = (await label.count()) > 0 ? label.first() : tab;
    await aim.click({ timeout: 15_000 });
    await page.waitForTimeout(400);
}

/** A quick sanity check a capture step can call before trusting a screenshot means anything. */
export async function expectKidShellVisible(page: Page): Promise<void> {
    await expect(page.locator(".wl-kid-rail")).toBeVisible();
}
