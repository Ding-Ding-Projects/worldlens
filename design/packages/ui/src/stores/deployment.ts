/**
 * Whether this copy is running on a desktop or being served from a container.
 *
 * ## Why this is asked rather than inferred
 *
 * The obvious test is "does `window.worldlens.mounts` exist", and it is wrong. The bridge is
 * built by one factory for both hosts on purpose, so every method exists everywhere; on a
 * desktop the mount channels simply have no handler and answer saying so. Feature-detecting
 * the method would therefore report every desktop build as hosted, which is the exact class
 * of bug the single factory was introduced to remove.
 *
 * So the deployment is asked, once, over the channel that exists to answer it.
 *
 * ## What callers get before the answer arrives
 *
 * `null`, meaning not known yet, and they are expected to treat that as "desktop" rather than
 * as "hosted". Two reasons. A desktop build is the overwhelmingly common case, so guessing it
 * is right far more often. And the failure directions are not symmetric: guessing desktop in a
 * hosted deployment shows a browse button that reports a refusal, which is recoverable and
 * says what to do, while guessing hosted on a desktop replaces a working native picker with a
 * folder browser that has nothing to list.
 */
import { readonly, ref } from "vue";

export interface DeploymentFacts {
    /** True only when the application is being served rather than installed. */
    readonly hosted: boolean;
}

const state = ref<DeploymentFacts | null>(null);
let started = false;

interface DeploymentBridge {
    getDeployment(): Promise<unknown>;
}

function resolveBridge(): DeploymentBridge | null {
    if (typeof window === "undefined") return null;
    const root = (window as { worldlens?: { getDeployment?: unknown } }).worldlens;
    if (!root || typeof root.getDeployment !== "function") return null;
    return root as unknown as DeploymentBridge;
}

/**
 * Read it once and remember.
 *
 * A deployment cannot change from hosted to desktop while the page is open, so re-asking
 * would be a request per component that mounts, for an answer that cannot have moved.
 */
export async function loadDeployment(): Promise<void> {
    if (started) return;
    started = true;

    const bridge = resolveBridge();
    if (bridge === null) {
        // Nothing to ask. Not an error: a plain browser build of the interface has no bridge
        // at all, and "unknown" is the honest value rather than a guess dressed as a fact.
        return;
    }

    try {
        const answer = (await bridge.getDeployment()) as { hosted?: unknown } | null;
        // A desktop's `app:deployment` has no handler and comes back as an error envelope
        // rather than a throw, so the shape is checked rather than trusted.
        state.value = { hosted: answer?.hosted === true };
    } catch {
        // Left unknown deliberately. A failed read is not evidence of either host, and
        // recording one would make a transient failure permanent for this page.
        state.value = null;
    }
}

/** The answer, or `null` while it is unknown. Read-only: only {@link loadDeployment} writes. */
export const deployment = readonly(state);

/** True only when the deployment has actually said it is hosted. */
export function isHosted(): boolean {
    return state.value?.hosted === true;
}

/** Test seam. Production never calls this; every test that sets it must reset it. */
export function setDeploymentForTesting(facts: DeploymentFacts | null): void {
    state.value = facts;
    started = facts !== null;
}
