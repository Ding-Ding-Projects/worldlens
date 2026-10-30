/**
 * Lets a job screen open another job in the Work strip it lives in.
 *
 * `WorkPane` provides it and every job slot it renders can inject it, which is how the guide's
 * **Open the full editor instead** reaches the Projects job without the guide knowing about the
 * shell, and without a new emit threaded through every place `WorldScreen` is mounted. Kid
 * Mode's shell hosts its own `WorkPane`, so the same route works there too.
 *
 * A screen mounted with no Work around it (a test, a dialog) injects null and must then not
 * draw the control at all, rather than draw one that does nothing.
 */

import { inject, provide, type InjectionKey } from "vue";

export type JobOpener = (pageId: string) => void;

const JOB_OPENER: InjectionKey<JobOpener> = Symbol("worldlens.job-opener");

export function provideJobOpener(open: JobOpener): void {
    provide(JOB_OPENER, open);
}

export function useJobOpener(): JobOpener | null {
    return inject(JOB_OPENER, null);
}

/** The injection key, for tests that mount a job screen as though Work were around it. */
export const JOB_OPENER_FOR_TESTS = JOB_OPENER;
