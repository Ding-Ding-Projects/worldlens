/**
 * "Search all five steps": which of the guide's steps a query is about.
 *
 * The guide's search field sits above the step header and filters nothing away. It marks the
 * steps whose own words match, so a person who knows the setting they want ("ambient light",
 * "storage") is pointed at the step that asks for it without walking through the others.
 *
 * What a step "says" is its title in the header, the heading of its page, and - for the
 * options step - every map setting it is responsible for, by label, key and upstream comment.
 * That last part comes from `optionFields()`, never a hand-written list, so a setting added to
 * the schema is searchable here the day it appears in the step.
 */

import { createSettingMatcher } from "../config/regexEngine.js";
import { WIZARD_STEP_META, optionFields, type WizardStep } from "./wizardSteps.js";

/** The translate function the caller already has; only the `(key, fallback)` form is used. */
export type StepSearchTranslate = (key: string, fallback: string) => string;

/** Each step's page heading, as the step components themselves render it. */
const STEP_HEADINGS: Readonly<Record<WizardStep, readonly [string, string]>> = {
    world: ["world.folder.question", "Which world?"],
    identity: ["world.identity.title", "Name the map and pick its dimension"],
    options: ["world.options.title", "How the map should look"],
    storage: ["world.storage.title", "Where the map is written"],
    review: ["world.review.title", "What is about to happen"],
};

/** The fields each non-options step asks for, by the label it shows them under. */
const STEP_FIELDS: Readonly<Record<WizardStep, readonly (readonly [string, string])[]>> = {
    world: [["world.folder.label", "World folder"]],
    identity: [
        ["world.identity.name", "Map name"],
        ["world.identity.id", "Map id"],
        ["world.identity.dimension", "Dimension"],
        ["world.identity.sorting", "Sort order"],
    ],
    options: [],
    storage: [["world.storage.folder", "Folder for rendered maps"]],
    review: [["world.review.plan", "The render"]],
};

/** Everything a step can be found by, as one searchable string. */
export function stepSearchText(step: WizardStep, t: StepSearchTranslate): string {
    const meta = WIZARD_STEP_META.find((candidate) => candidate.id === step);
    const parts: string[] = [];
    if (meta !== undefined) parts.push(t(meta.key, meta.label));
    const [headingKey, headingFallback] = STEP_HEADINGS[step];
    parts.push(t(headingKey, headingFallback));
    for (const [key, fallback] of STEP_FIELDS[step]) parts.push(t(key, fallback));
    if (step === "options") {
        for (const field of optionFields()) parts.push(field.label, field.path, field.doc);
    }
    return parts.join("\n");
}

export interface StepSearchResult {
    /** The steps that match, or null when there is no query and nothing is being searched. */
    readonly matched: ReadonlySet<WizardStep> | null;
    /** The pattern's own complaint, when regex mode is on and it does not compile. */
    readonly error: string | null;
}

/**
 * Which steps match a query, in the same plain-text-by-default, regex-on-request way every
 * other search in the product does - `createSettingMatcher` is the one engine all of them use.
 */
export function searchSteps(
    query: string,
    regex: boolean,
    flags: string,
    t: StepSearchTranslate,
): StepSearchResult {
    const matcher = createSettingMatcher(query, regex, flags);
    if (!matcher.active) return { matched: null, error: null };
    const matched = new Set<WizardStep>();
    for (const meta of WIZARD_STEP_META) {
        if (matcher.test(stepSearchText(meta.id, t))) matched.add(meta.id);
    }
    return { matched, error: matcher.error };
}
