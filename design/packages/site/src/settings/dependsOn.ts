/**
 * Honouring `SettingCommon.dependsOn`.
 *
 * The declaration has always carried its own intent: a setting whose effect a
 * visitor cannot see until something else is on is *shown with its dependency
 * named*, never hidden. Hiding is the tempting implementation and the wrong one,
 * because this site's settings are searchable and teleportable — a visitor who
 * searches for "inline" and is sent to a row that does not exist has been told
 * their search was wrong when it was right. Worse, a visitor who finds the row,
 * flips it, and sees nothing change has no way to learn why; the setting is not
 * broken, it is waiting, and only the page can say so.
 *
 * This module is the whole of that logic and none of its rendering. It is pure:
 * definitions in, notes out, with the current values arriving through a reader the
 * caller supplies. That is deliberate — the settings page reads values from a live
 * store with bridges and scheduled overrides behind it, and none of that belongs
 * in a function whose only job is to answer "is this dependency met, and what
 * sentence says so".
 *
 * Every sentence it returns is an i18n key rather than text, for the same reason
 * the schedule guidance is: the dependency names another setting, that setting's
 * name is itself a key, and a name resolved too early is a name that arrives in
 * the wrong language.
 */

import type { GuidanceMessage } from "./scheduleHelp.js";
import "./scheduleHelp.js";
import type { SettingDefinition, SettingValue } from "./types.js";
import { isStoredSetting } from "./types.js";

/**
 * What one declared dependency currently means.
 *
 * `unmet` is the question the caller asked; the message is what to render beside
 * the control while it is true. The ids are kept alongside so a caller — or a
 * test, or somebody reading a console — can identify the pair without parsing a
 * sentence, exactly as the schedule guidance keeps its machine code beside its
 * prose.
 */
export interface DependencyNote extends GuidanceMessage {
    /** The setting that declared the dependency. */
    readonly id: string;
    /** The setting it waits on, whether or not that setting exists. */
    readonly dependsOnId: string;
    /** The value it waits for. */
    readonly requiredValue: SettingValue;
    /** True while the control is visible and operable but its effect cannot be seen. */
    readonly unmet: boolean;
}

/**
 * The note for one setting, or `null` when it declares no dependency.
 *
 * `readValue` returns `undefined` for a setting it cannot read. That is treated as
 * unmet rather than met: a dependency that cannot be confirmed has not been
 * confirmed, and claiming otherwise would tell a visitor their setting is live
 * when nothing knows whether it is.
 */
export function describeDependency(
    setting: SettingDefinition,
    definitions: readonly SettingDefinition[],
    readValue: (id: string) => SettingValue | undefined,
): DependencyNote | null {
    const dependency = setting.dependsOn;
    if (dependency === undefined) return null;

    const base = {
        id: setting.id,
        dependsOnId: dependency.id,
        requiredValue: dependency.equals,
        phraseKeys: {} as Readonly<Record<string, string>>,
        values: {} as Readonly<Record<string, string | number>>,
        field: setting.labelKey,
    };

    const target = definitions.find((candidate) => candidate.id === dependency.id);
    // A dependency on a setting this build does not have — or on an action, which
    // holds no value to compare against — can never be satisfied. Saying so is not
    // pedantry: the control below it will never do anything, and a visitor who is
    // not told that will conclude the site is broken in some more general way.
    if (target === undefined || !isStoredSetting(target)) {
        return {
            ...base,
            code: "missing",
            messageKey: "scheduleHelp.dependsOn.missing",
            unmet: true,
        };
    }

    const current = readValue(dependency.id);
    const unmet = current === undefined || current !== dependency.equals;

    if (target.kind === "toggle" && typeof dependency.equals === "boolean") {
        return {
            ...base,
            code: unmet ? "unmet" : "met",
            messageKey: dependency.equals
                ? "scheduleHelp.dependsOn.on"
                : "scheduleHelp.dependsOn.off",
            phraseKeys: { name: target.labelKey },
            unmet,
        };
    }

    if (target.kind === "select") {
        const option = target.options.find((candidate) => candidate.value === dependency.equals);
        // An option the build does not offer is the same dead end as a missing
        // setting, and it must not be papered over by printing the raw option
        // value: `bilingual` is an internal token, not a thing a visitor selected.
        if (option === undefined) {
            return {
                ...base,
                code: "unmatched-value",
                messageKey: "scheduleHelp.dependsOn.unmatchedValue",
                phraseKeys: { name: target.labelKey },
                unmet: true,
            };
        }
        return {
            ...base,
            code: unmet ? "unmet" : "met",
            messageKey: "scheduleHelp.dependsOn.unmet",
            phraseKeys: { name: target.labelKey, value: option.labelKey },
            unmet,
        };
    }

    // Numbers and free text are their own labels: what the visitor typed is what
    // the sentence can quote, with no key to resolve first.
    return {
        ...base,
        code: unmet ? "unmet" : "met",
        messageKey: "scheduleHelp.dependsOn.unmet",
        values: { value: String(dependency.equals) },
        phraseKeys: { name: target.labelKey },
        unmet,
    };
}

/**
 * Every declared dependency, keyed by the setting that declared it.
 *
 * Settings with no `dependsOn` are absent rather than present-and-null, so a
 * renderer's question is `notes.get(id)` and its answer is either a note to render
 * or nothing to do.
 */
export function describeDependencies(
    definitions: readonly SettingDefinition[],
    readValue: (id: string) => SettingValue | undefined,
): ReadonlyMap<string, DependencyNote> {
    const notes = new Map<string, DependencyNote>();
    for (const setting of definitions) {
        const note = describeDependency(setting, definitions, readValue);
        if (note !== null) notes.set(setting.id, note);
    }
    return notes;
}
