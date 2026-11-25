/**
 * Asking the shell-mounted tour to open itself, from somewhere else in the tree.
 *
 * `TutorialOverlay.vue` is mounted once, at the shell, exactly like `CommandPalette.vue` and
 * `ConfigNotifications.vue`. Several surfaces need to open it - the Info page, the docs
 * browser, Settings, Home, and the command palette - and none of them is a parent of the
 * overlay or of each other. The doorbell pattern from `shell/revealRequests.ts` is the
 * established answer to exactly this shape in this package, so this is that pattern, kept in
 * its own module rather than folded into `revealRequests.ts`'s closed `RevealRequest` union.
 *
 * A request may name a tour (`requestTutorialLaunch("map")`); with no argument it opens the
 * overall first-run tour, which is what every existing caller wants.
 */

import { ref, watch, type Ref } from "vue";
import type { TutorialTourId } from "./tutorialSteps.js";

const counter: Ref<number> = ref(0);
let requestedTour: TutorialTourId = "overall";

/** Asks the tour to open (or reopen) itself. Does nothing observable when nobody is listening. */
export function requestTutorialLaunch(tour: TutorialTourId = "overall"): void {
    requestedTour = tour;
    counter.value += 1;
}

/** The raw counter, for a test that wants to assert a launch was requested without mounting the tour. */
export function tutorialLaunchCount(): Ref<number> {
    return counter;
}

/**
 * Runs `handler` every time the tour is asked to open, with the tour that was asked for.
 *
 * Call it from `setup`, where the watcher it creates is bound to the calling component and
 * stops with it.
 */
export function onTutorialLaunchRequested(handler: (tour: TutorialTourId) => void): void {
    watch(counter, () => {
        handler(requestedTour);
    });
}

/** Resets the counter. For tests, so one case cannot leave a request visible to the next. */
export function resetTutorialLaunchRequests(): void {
    counter.value = 0;
    requestedTour = "overall";
}
