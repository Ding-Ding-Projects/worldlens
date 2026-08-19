/**
 * The always-present private wording picker. It reports an honest empty state before a file
 * exists, while keeping the replacement feature itself inactive until validation succeeds.
 *
 * This is the unusual half of the vocabulary rule made concrete: with no file installed the
 * The file input is local-only and accepts only the shared object payload; no private mapping is
 * bundled here.
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
    const status = el("p", { class: "md-field__help mb-help", attrs: { role: "status", "aria-live": "polite" } });
    const picker = el("input", { class: "mb-vocabulary-file", attrs: { type: "file", accept: "application/json,.json" } }) as HTMLInputElement;
    const choose = el("button", { class: "md-button md-button--tonal", attrs: { type: "button" } });
    choose.addEventListener("click", () => picker.click());
    picker.addEventListener("change", () => {
        const file = picker.files?.[0];
        picker.value = "";
        if (file === undefined) return;
        void file.text().then((text) => {
            const loaded = vocabulary.load(text);
            status.textContent = loaded.ok ? t("vocab.installedCount", { count: loaded.count }) : t("vocab.refused.wrong-shape");
            announce(status.textContent);
            refresh();
            options.onChange();
        }).catch(() => {
            status.textContent = t("vocab.refused.not-json");
            announce(status.textContent);
        });
    });
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
        el("div", { class: "mb-property-row" }, label, choose, remove),
        picker,
        count,
        status,
        removeHelp,
        note,
    );

    function refresh(): void {
        // `hidden` rather than removal, so the element the settings page already appended stays
        // in place and simply stops existing for a visitor and for assistive technology alike.
        // Rebuilding the group on every change would move focus out from under anyone who was
        // using a neighbouring control at the time.
        wrapper.hidden = false;
        choose.textContent = vocabulary.installed ? t("vocab.replaceFile") : t("vocab.chooseFile");
        choose.setAttribute("aria-label", choose.textContent);
        remove.hidden = !vocabulary.installed;
        label.textContent = t("vocab.installedLabel");
        if (!vocabulary.installed) {
            count.textContent = t("vocab.empty");
            note.textContent = t("vocab.note");
            removeHelp.textContent = "";
            return;
        }
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
