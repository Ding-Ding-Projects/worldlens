/**
 * The line under a setting that says where its current value came from.
 *
 * It exists as its own module, and as a pure function, because the truthful version of this
 * line has to name a value, and naming a value truthfully is more work than the one-line
 * `t(\`settings.provenance.${kind}\`)` it replaces. A select stores an id and shows an option
 * label; a toggle stores a boolean and shows a word; a number stores a bare number and shows
 * one with a unit beside it. A line that quoted the stored form would be reporting something
 * the visitor cannot see anywhere on screen, which is a different failure from the one it was
 * written to fix but not a smaller one.
 *
 * Nothing here touches the DOM or the store. Everything it needs arrives as an argument, so
 * the whole of it can be checked against every setting in the schema without building a page.
 */

import { t } from "./i18n.js";
import type { SettingsStore } from "./store.js";
import type { SettingValue, StoredSetting } from "./types.js";

/**
 * The provenance kinds, taken from the store rather than restated here.
 *
 * Restating them would produce a list that compiles happily while the store has grown a fifth
 * kind this module renders as an empty string. Deriving it means a new kind is a type error in
 * `provenanceLine`'s switch on the day it is added, which is the only moment anybody is in a
 * position to write the sentence for it.
 */
export type ProvenanceKind = ReturnType<SettingsStore["provenance"]>;

export interface ProvenanceLineInput {
    readonly definition: StoredSetting;
    /** What `SettingsStore.provenance(id)` reports for this setting right now. */
    readonly kind: ProvenanceKind;
    /** The value actually in force, as `SettingsStore.get(id)` returns it. */
    readonly value: SettingValue;
    /**
     * A caller-supplied rendering for a value this module cannot name on its own.
     *
     * A font setting stores a family id and the visitor sees a family name, but the mapping
     * between the two lives in the appearance controller rather than in the setting's own
     * declaration. Rather than reach for that controller from here - which would make a pure
     * function depend on a live singleton to render one word - the caller that already holds
     * it passes the name in. Left out, the stored value is rendered as it stands, which is
     * still honest, just less friendly.
     */
    readonly displayValue?: string | undefined;
}

/**
 * The finished sentence, in the visitor's language, naming the value in force.
 *
 * Callers pass the setting's own declaration rather than just its id so this stays independent
 * of any particular store instance: the same call renders correctly for a settings page, for a
 * test with a hand-built definition, and for any future surface that shows a value's source.
 */
export function provenanceLine(input: ProvenanceLineInput): string {
    const value = settingValueText(input.definition, input.value, input.displayValue);
    switch (input.kind) {
        case "stored":
            return t("settings.provenance.stored", { value });
        case "compiled-default":
            return t("settings.provenance.compiled-default", { value });
        case "responsive-default": {
            /*
             * Only a toggle can declare a responsive default in the schema, but a bridged
             * setting can report this kind from a controller that owns the breakpoint itself
             * (the side navigation does exactly that). Quoting a width the schema does not
             * hold would be inventing a fact, so the breakpoint-free wording is used instead
             * of a guess.
             */
            const responsive =
                input.definition.kind === "toggle" ? input.definition.responsiveDefault : undefined;
            if (responsive === undefined) {
                return t("settings.provenance.responsive-default.unbounded", { value });
            }
            return t("settings.provenance.responsive-default", {
                value,
                width: responsive.compactMaxWidth,
            });
        }
        case "scheduled-override":
            return t("settings.provenance.scheduled-override", { value });
    }
}

/**
 * A value rendered the way the visitor sees it on screen.
 *
 * This is deliberately the same set of transformations each control already performs when it
 * paints itself - the select shows an option's label, the stepper shows its unit, the funny
 * sliders show a named stop rather than a bare 1 to 5 - so the provenance line and the control
 * above it can never disagree about what the current value is called.
 */
export function settingValueText(
    definition: StoredSetting,
    value: SettingValue,
    displayValue?: string | undefined,
): string {
    if (displayValue !== undefined && displayValue !== "") return displayValue;

    switch (definition.kind) {
        case "toggle":
            return value === true ? t("settings.value.on") : t("settings.value.off");
        case "select": {
            const option = definition.options.find((candidate) => candidate.value === value);
            return option === undefined ? String(value) : t(option.labelKey);
        }
        case "slider": {
            // A named stop wins over the number: "3, relaxed" is what the slider's own readout
            // and its `aria-valuetext` both say, and a provenance line reading "3" beside a
            // control reading "3, relaxed" makes a visitor check whether they are the same
            // thing.
            if (definition.stopLabelKeyPrefix !== undefined) {
                return t(`${definition.stopLabelKeyPrefix}.${value}`);
            }
            return withUnit(String(value), definition.unit);
        }
        case "number":
            return withUnit(String(value), definition.unit);
        case "text":
        case "color":
        case "font":
            return value === "" ? t("settings.value.empty") : String(value);
    }
}

/**
 * The unit is a bare token from the schema (`px`) rather than a localised phrase, and it is
 * joined with a space because that is exactly how the stepper renders it beside the input. A
 * setting with no unit gets the number alone rather than a trailing space.
 */
function withUnit(value: string, unit: string | undefined): string {
    return unit === undefined || unit === "" ? value : `${value} ${unit}`;
}
