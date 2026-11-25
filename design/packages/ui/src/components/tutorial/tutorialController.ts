/**
 * The tours' own state machine: which tour and step are showing, and what survives a restart.
 *
 * Modelled on `components/setup/firstRunFlow.ts`'s `createFirstRunController`: plain
 * functions over refs, storage-backed, nothing that requires mounting a component to prove.
 * Persistence goes through `setupStorage()` (`components/setup/setupPrefs.ts`), the same
 * storage seam the first-run flow and the language settings use - it degrades to an
 * in-memory store under Vitest and in a private-browsing window, so a test never has to stub
 * `localStorage` to exercise this file.
 *
 * ## One controller, several tours
 *
 * `start(tour)` opens any tour in `TUTORIAL_TOURS`; `start()` with no argument opens the overall
 * first-run tour exactly as before. Each tour keeps its own saved position and its own finished
 * flag. The overall tour's keys are the original, unsuffixed ones, so a position saved by an
 * earlier build still resumes; every other tour's keys carry the tour id.
 *
 * ## The three things persistence remembers
 *
 *  - **Completed.** Once every step of a tour has been stepped past (Next or Finish on the last
 *    one), that tour never reopens on its own. `completed` and `tutorialCompleted()` still mean
 *    "the overall tour was finished", because the one-time invitation in `App.vue` and the
 *    "Replay" labels only care about that tour. A finished short tour restarts at its first step.
 *  - **In-progress position.** Exiting before the last step - the always-visible close
 *    control, or Escape - does not throw the walkthrough away. `start()` on an incomplete
 *    tour resumes at the step it was left on.
 *  - **Offered.** A single flag, separate from both of the above, that only the one-time
 *    invitation toast in `App.vue` reads and writes.
 *
 * Nothing here touches the DOM, an anchor selector, or a page id. `TutorialOverlay.vue` is
 * what turns `currentStep` into a highlighted control and a page switch.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import { setupStorage, type SetupStorage } from "../setup/setupPrefs.js";
import {
    TUTORIAL_TOURS,
    type TutorialStep,
    type TutorialTourId,
} from "./tutorialSteps.js";

const COMPLETED_KEY = "worldlens.tutorial.completed";
const OFFERED_KEY = "worldlens.tutorial.offered";
const PROGRESS_KEY = "worldlens.tutorial.progress";

function progressKey(tour: TutorialTourId): string {
    return tour === "overall" ? PROGRESS_KEY : `${PROGRESS_KEY}.${tour}`;
}

function completedKey(tour: TutorialTourId): string {
    return tour === "overall" ? COMPLETED_KEY : `${COMPLETED_KEY}.${tour}`;
}

export interface TutorialController {
    /** Whether the overlay should be on screen. */
    readonly open: Ref<boolean>;
    /** The tour currently open, or the last one opened. */
    readonly tourId: Ref<TutorialTourId>;
    readonly stepIndex: Ref<number>;
    readonly currentStep: ComputedRef<TutorialStep>;
    /** One-based, for "Step 3 of 7". */
    readonly stepNumber: ComputedRef<number>;
    /** The number of steps in the current tour. */
    readonly stepCount: ComputedRef<number>;
    readonly canGoBack: ComputedRef<boolean>;
    readonly isLastStep: ComputedRef<boolean>;
    /** Whether the overall first-run tour has ever been completed, in any run. */
    readonly completed: Ref<boolean>;

    /**
     * Opens a tour: resumes an incomplete run where it left off, restarts a finished one.
     * With no argument it opens the overall tour.
     */
    start(tour?: TutorialTourId): void;
    /** Moves to the next step, or completes the tour from the last one. */
    next(): void;
    /** Moves to the previous step. Does nothing on the first one. */
    back(): void;
    /** Moves on without doing what the step suggested. The same motion as `next()`. */
    skip(): void;
    /** Closes the overlay without discarding progress, unless this was the last step. */
    exit(): void;
    /** Marks the current tour finished and closes it. */
    finish(): void;
    /** Whether a given tour has ever been finished. */
    tourCompleted(tour: TutorialTourId): boolean;
    /** Whether the one-time invitation has already been shown, this install or ever since. */
    hasBeenOffered(): boolean;
    /** Records that the one-time invitation has now been shown. */
    markOffered(): void;
}

/**
 * Whether the overall tour has ever been completed, without constructing a whole controller.
 *
 * Every launcher outside the overlay itself (Info's button, the docs browser's button, the
 * command palette row) needs exactly this one bit to decide between "Take a tour" and
 * "Replay the tour" - see `tutorial.launch.start`/`tutorial.launch.replay` in
 * `copy/surfaces/tutorial.ts`.
 */
export function tutorialCompleted(storage: SetupStorage = setupStorage()): boolean {
    return storage.read(COMPLETED_KEY) === "1";
}

/**
 * Whether the one-time invitation toast has ever been shown, without constructing a whole
 * controller. `App.vue`'s own mount hook is the only caller: it checks this once, at most
 * raises the notice once, and calls {@link markTutorialOffered} in the same breath.
 */
export function tutorialOffered(storage: SetupStorage = setupStorage()): boolean {
    return storage.read(OFFERED_KEY) === "1";
}

/** Records that the one-time invitation has now been shown. */
export function markTutorialOffered(storage: SetupStorage = setupStorage()): void {
    storage.write(OFFERED_KEY, "1");
}

function readStoredIndex(storage: SetupStorage, tour: TutorialTourId): number {
    const raw = storage.read(progressKey(tour));
    if (raw === null) return 0;
    const parsed = Number.parseInt(raw, 10);
    const length = TUTORIAL_TOURS[tour].length;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed >= length) return 0;
    return parsed;
}

export function createTutorialController(
    storage: SetupStorage = setupStorage(),
): TutorialController {
    const open = ref(false);
    const tourId = ref<TutorialTourId>("overall");
    const completed = ref(storage.read(COMPLETED_KEY) === "1");
    const stepIndex = ref(0);

    const steps = computed<readonly TutorialStep[]>(() => TUTORIAL_TOURS[tourId.value]);
    const currentStep = computed<TutorialStep>(
        () => steps.value[stepIndex.value] ?? (steps.value[0] as TutorialStep),
    );
    const stepNumber = computed(() => stepIndex.value + 1);
    const stepCount = computed(() => steps.value.length);
    const canGoBack = computed(() => stepIndex.value > 0);
    const isLastStep = computed(() => stepIndex.value >= steps.value.length - 1);

    function tourCompleted(tour: TutorialTourId): boolean {
        return storage.read(completedKey(tour)) === "1";
    }

    function persistProgress(): void {
        storage.write(progressKey(tourId.value), String(stepIndex.value));
    }

    function start(tour: TutorialTourId = "overall"): void {
        tourId.value = tour;
        const done = tourCompleted(tour);
        stepIndex.value = done ? 0 : readStoredIndex(storage, tour);
        if (!done) persistProgress();
        open.value = true;
    }

    function finish(): void {
        if (tourId.value === "overall") completed.value = true;
        storage.write(completedKey(tourId.value), "1");
        storage.remove(progressKey(tourId.value));
        open.value = false;
    }

    function next(): void {
        if (isLastStep.value) {
            finish();
            return;
        }
        stepIndex.value += 1;
        persistProgress();
    }

    function back(): void {
        if (stepIndex.value === 0) return;
        stepIndex.value -= 1;
        persistProgress();
    }

    function exit(): void {
        open.value = false;
    }

    function hasBeenOffered(): boolean {
        return storage.read(OFFERED_KEY) === "1";
    }

    function markOffered(): void {
        storage.write(OFFERED_KEY, "1");
    }

    return {
        open,
        tourId,
        stepIndex,
        currentStep,
        stepNumber,
        stepCount,
        canGoBack,
        isLastStep,
        completed,
        start,
        next,
        back,
        skip: next,
        exit,
        finish,
        tourCompleted,
        hasBeenOffered,
        markOffered,
    };
}
