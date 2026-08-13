/**
 * `DimSumSurprise.vue`: the 10%-chance startup toast that names one dish, in both languages.
 *
 * `dimsum.dish.name` is FIXED rather than VOICED, and deliberately not funny-level styled at
 * all: it is the one sentence in this surface whose exact words are the point. `{en}` and
 * `{zhHant}` are filled in by the component from the resolved catalog entry, so whatever the
 * funny level does to the copy *around* the dish, the dish's own bilingual name - "Shrimp
 * dumpling · 蝦餃" - always reads correctly and always in both languages, exactly as the
 * shared instructions ask for. Voicing that string would risk a level rewriting the dish's
 * actual name into something playful and wrong, which is the one thing this feature is not
 * allowed to do.
 *
 * `dimsum.intro` is the one VOICED line: the small sentence introducing the surprise before
 * the name, which is exactly where the per-language funny level is meant to spend itself -
 * the delight is in the telling, never in the dish's identity.
 *
 * `dimsum.alt` builds the screen-reader alt text, and stays FIXED for the same reason a
 * dialog title does elsewhere in this catalogue: it is announced once and should describe
 * the same thing on every visit rather than reading differently depending on the funny-level
 * dial, which a screen-reader user has no way to see moving.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const DIMSUM_FIXED = {
    /** `{en}` and `{zhHant}` are the resolved dish's own names, never rewritten. */
    "dimsum.dish.name": { en: "{en} · {zhHant}", yue: "{en} · {zhHant}" },
    /** The screen-reader alt text for the dish photo, naming the dish it shows. */
    "dimsum.alt": { en: "A photo of {en} ({zhHant})", yue: "{en}（{zhHant}）嘅相" },
    "dimsum.dismiss.aria": { en: "Dismiss the dim sum surprise", yue: "唔顯示呢個點心驚喜" },
} as const satisfies Record<string, FixedString>;

export const DIMSUM_VOICED = {
    "dimsum.intro": {
        en: [
            "A dim sum surprise:",
            "A small dim sum surprise:",
            "Look what just rolled by on the dim sum trolley:",
            "The dim sum trolley stopped by for a second:",
            "Surprise! The dim sum trolley snuck up on you:",
        ],
        yue: [
            "一個小小嘅點心驚喜：",
            "一個細細嘅點心驚喜：",
            "睇下有咩喺點心車度停低：",
            "點心車經過，停低咗一陣：",
            "嘩，點心車靜雞雞走過嚟：",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const DIMSUM_FACTS = {
    // The one fact worth guarding: every level still frames this as a dim sum moment,
    // never as an alert, a warning, or anything that could be mistaken for a real event.
    "dimsum.intro": {
        en: ["dim sum"],
        yue: ["點心"],
    },
} as const satisfies Record<keyof typeof DIMSUM_VOICED, { en: readonly string[]; yue: readonly string[] }>;
