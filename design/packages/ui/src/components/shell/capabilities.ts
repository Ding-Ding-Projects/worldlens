/**
 * Whether a catalogue row's destination actually exists in this build.
 *
 * Seven Set up & help rows and two Language rows describe surfaces whose only implementation is
 * a contract that is not in this public checkout. The approved design accounts for them - the
 * eighty-five is a contract of its own - and the honest thing to do with a row whose destination
 * does not exist is to remove the row, not to draw it as a card with invented status values. A
 * status card with demo values is still a fake integration, and a clickable no-op is worse than
 * an absence because it teaches somebody the application is broken.
 *
 * So availability is resolved here, from things that are genuinely observable:
 *
 *  - `memory-console` - the shared cross-application console. **Absent.** Nothing in this
 *    repository implements it, and inventing a control plane, a sync attestation or a secret
 *    intake to fill the gap would put private implementation details into a public repository by
 *    implication.
 *  - `restricted-mode` - **present.** The main process owns the shared application-data record,
 *    verifier, file watcher and safe IPC event; the renderer exposes the real Settings route.
 *  - `personal-vocabulary` - **present.** Settings always exposes the local JSON picker; the
 *    replacement data itself remains absent until the user supplies a valid private file.
 *  - `narrator` - **absent.** `docs/contracts/localization.md` specifies it; no settings row
 *    implements it yet. The row stays in the manifest and stays out of the interface until one
 *    does, rather than routing to a settings section that is not there.
 *  - `scheduled-settings` - **absent.** The contract exists, but this build has neither the rule
 *    editor nor the runtime that would apply one.
 *  - `shared-localization-contract` - **present**, because the article genuinely is bundled. This
 *    one is resolved by asking the docs registry rather than by a constant, so it stops being
 *    available the moment the article stops being shipped.
 *
 * Each of these is a documented boundary rather than a silent gap. `capabilities.test.ts` pins
 * the reasons so a later change has to state its own.
 */

import { DOCS_ARTICLE_IDS } from "../docs/docsContent.js";

/** What a capability resolver answers. */
export interface CapabilityState {
    readonly available: boolean;
    /**
     * Why, in one sentence, for the documentation boundary and for a development-time warning.
     * Never shown as a disabled tooltip on a control the user can see: an unavailable feature is
     * absent, not greyed out.
     */
    readonly reason: string;
}

const PRESENT: CapabilityState = { available: true, reason: "" };

function absent(reason: string): CapabilityState {
    return { available: false, reason };
}

/**
 * The resolvers, by capability name.
 *
 * Functions rather than constants so a capability that becomes observable later - the docs one
 * already is - can start answering from real state without every caller changing.
 */
const RESOLVERS: Record<string, () => CapabilityState> = {
    "memory-console": () =>
        absent(
            "No public implementation of the shared console, control plane, attestation or secret intake exists in this checkout, and a demonstration of one would be a fake integration.",
        ),
    "restricted-mode": () => PRESENT,
    "personal-vocabulary": () => PRESENT,
    narrator: () =>
        absent(
            "The spoken narrator is specified in the localization contract and has no settings row yet. The row stays out of the interface until one exists rather than routing to a section that is not there.",
        ),
    "scheduled-settings": () =>
        absent(
            "Scheduled language and appearance rules have no editor or runtime in this build, so the catalogue route stays absent rather than opening an unrelated settings row.",
        ),
    "shared-localization-contract": () =>
        DOCS_ARTICLE_IDS.has("localization-contract") || DOCS_ARTICLE_IDS.has("localization")
            ? PRESENT
            : absent("The localization contract article is not bundled in this build."),
};

/**
 * The state of one capability. An unknown name is available, deliberately: a row that names no
 * capability is unconditional, and this is called with `undefined` from exactly that path.
 */
export function capabilityState(name: string | undefined): CapabilityState {
    if (name === undefined) return PRESENT;
    const resolver = RESOLVERS[name];
    return resolver === undefined ? PRESENT : resolver();
}

/** Convenience for the common question. */
export function capabilityAvailable(name: string | undefined): boolean {
    return capabilityState(name).available;
}

/** Every capability this build knows how to answer for, for the documentation boundary test. */
export function knownCapabilities(): readonly string[] {
    return Object.keys(RESOLVERS);
}
