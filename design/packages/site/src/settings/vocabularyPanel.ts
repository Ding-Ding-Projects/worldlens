/**
 * The panel that only exists once a private wording file has been supplied.
 *
 * This is the unusual half of the vocabulary rule made concrete: with no file installed the
 * factory returns an element that renders **nothing**, and the settings page skips it
 * entirely, so a visitor who has never supplied a file sees no vocabulary control, no empty
 * list, no explanatory placeholder and no search result. A disabled control would have
 * advertised a capability the visitor is not using; an empty one would have implied they had
 * misconfigured something. Absence is the specified state and absence is what this renders.
 *
 * There is consequently no "add a vocabulary" button anywhere. The file arrives through the
 * settings import picker that already exists for settings files, which is a generic file
 * intake rather than a vocabulary feature — the distinction the rule turns on. Once a file has
 * been accepted, this panel appears and offers the two things a visitor with one installed
 * actually needs: how many replacements are live, and how to take them away again.
 *
 * Nothing about the file's contents is rendered here, and nothing about its shape is described
 * in copy. That is deliberate and it is why this file is safe to publish: the mechanism is
 * open source, the vocabulary is the visitor's and stays in their browser.
 */

import { el } from "../platform/dom.js";
import { announce } from "./dom.js";
import { fillPhrase, t } from "./i18n.js";
import type { PersonalVocabulary } from "./personalVocabulary.js";

export interface VocabularyPanelOptions {
    readonly vocabulary: PersonalVocabulary;
    /** Called after removal so the page can re-render every string that was being rewritten. */
    readonly onChange: () => void;
    readonly confirmDestructive: (message: string) => Promise<boolean>;
}

export interface VocabularyPanelView {
    readonly element: HTMLElement;
    refresh(): void;
    destroy(): void;
}

export function createVocabularyPanel(options: VocabularyPanelOptions): VocabularyPanelView {
    const { vocabulary } = options;

    const wrapper = el("div", { class: "mb-transfer mb-vocabulary" });
    const label = el("span", { class: "md-field__label" });
    const count = el("p", {
        class: "md-field__help mb-help",
        attrs: { role: "status", "aria-live": "polite" },
    });
    const note = el("p", { class: "md-field__help mb-help" });
    const removeHelp = el("p", { class: "md-field__help mb-help" });
    const remove = el("button", {
        class: "md-button md-button--outlined md-button--danger",
        attrs: { type: "button" },
    });
    remove.addEventListener("click", () => {
        void (async (): Promise<void> => {
            const confirmed = await options.confirmDestructive(t("vocab.removeDesc"));
            if (!confirmed) return;
            vocabulary.clear();
            announce(t("vocab.removeDesc"));
            refresh();
            options.onChange();
        })();
    });

    wrapper.append(
        el("div", { class: "mb-property-row" }, label, remove),
        count,
        removeHelp,
        note,
    );

    function refresh(): void {
        // `hidden` rather than removal, so the element the settings page already appended stays
        // in place and simply stops existing for a visitor and for assistive technology alike.
        // Rebuilding the group on every change would move focus out from under anyone who was
        // using a neighbouring control at the time.
        wrapper.hidden = !vocabulary.installed;
        if (!vocabulary.installed) return;
        fillPhrase(label, "vocab.installedLabel");
        fillPhrase(count, "vocab.installedCount", { count: vocabulary.entryCount });
        fillPhrase(note, "vocab.note");
        fillPhrase(removeHelp, "vocab.removeDesc");
        remove.textContent = t("vocab.remove");
        remove.setAttribute("aria-label", `${t("vocab.remove")} — ${t("vocab.installedLabel")}`);
    }

    refresh();
    const unsubscribe = vocabulary.subscribe(refresh);

    return {
        element: wrapper,
        refresh,
        destroy(): void {
            unsubscribe();
            wrapper.remove();
        },
    };
}
