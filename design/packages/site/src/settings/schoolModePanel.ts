/**
 * The surface that arms, disarms and renames the mode described in `schoolMode.ts`.
 *
 * It is a hand-built panel rather than a declared setting because arming it needs a secret,
 * and no `SettingDefinition` kind can express "a field whose value is verified and then
 * deliberately not stored". A toggle that pretended to be an ordinary setting would also have
 * been exportable, and a settings export carrying a PIN is precisely the leak the rule about
 * credential material forbids.
 *
 * Two pieces of copy on this panel are load-bearing rather than decorative, and both stay
 * visible at all times rather than hiding behind the disclosure the ordinary rows use. The
 * first says this is a user-experience lock and not a security boundary; the second says the
 * local record can simply be deleted. A teacher who does not read them may rely on protection
 * that was never claimed, and a control that invites that misreading is worse than no control.
 *
 * The mode's name is never written here. Every label interpolates `{name}` from the
 * controller, because after a rename the shipped words must not survive anywhere — including
 * in an accessible name, which is the copy most easily forgotten and least easily noticed.
 */

import { el, uniqueId } from "../platform/dom.js";
import { announce } from "./dom.js";
import { fillPhrase, t } from "./i18n.js";
import { schoolCredentialAvailable, type SchoolMode } from "./schoolMode.js";

export interface SchoolModePanelOptions {
    readonly mode: SchoolMode;
    /** Called after any state change so the settings page can rebuild what the mode suppresses. */
    readonly onChange: () => void;
    readonly confirmDestructive: (message: string) => Promise<boolean>;
}

export interface SchoolModePanelView {
    readonly element: HTMLElement;
    /** The mode's current name, so the group heading around this panel can use it too. */
    name(): string;
    refresh(): void;
    destroy(): void;
}

export function createSchoolModePanel(options: SchoolModePanelOptions): SchoolModePanelView {
    const { mode } = options;

    /**
     * The one place the shipped name can still appear, and only while the visitor has not
     * replaced it. Everything downstream interpolates whatever this returns, so a rename
     * propagates to every label, description, button title and accessible name at once
     * instead of to the ones somebody remembered to update.
     */
    const name = (): string => mode.chosenName ?? t("school.shippedName");

    const wrapper = el("div", { class: "mb-transfer mb-school" });

    const state = el("p", {
        class: "md-field__help mb-help",
        attrs: { role: "status", "aria-live": "polite" },
    });

    const description = el("p", { class: "md-field__help mb-help" });

    /* ---- Rename ---------------------------------------------------------- */

    const renameId = uniqueId("mb-school-name");
    const renameLabel = el("label", { class: "md-field__label", attrs: { for: renameId } });
    const renameInput = el("input", {
        class: "md-field__input",
        attrs: { id: renameId, type: "text", autocomplete: "off", maxlength: 48 },
    });
    renameInput.value = mode.chosenName ?? "";
    renameInput.addEventListener("change", () => {
        mode.rename(renameInput.value);
        refresh();
        options.onChange();
        announce(t("school.renameDesc"));
    });
    const renameHelp = el("p", { class: "md-field__help mb-help" });

    /* ---- Secret and the on/off action ------------------------------------ */

    const secretId = uniqueId("mb-school-secret");
    const secretLabel = el("label", { class: "md-field__label", attrs: { for: secretId } });
    const secretInput = el("input", {
        class: "md-field__input",
        attrs: {
            id: secretId,
            type: "password",
            autocomplete: "off",
            // The field is never read back and never persisted, so an autofill offer here would
            // be a password manager storing a value nothing will ever ask it for again.
            "aria-describedby": `${secretId}-status`,
        },
    });
    const secretStatus = el("p", {
        class: "md-field__help mb-help",
        attrs: { id: `${secretId}-status`, role: "status", "aria-live": "polite" },
    });

    const action = el("button", { class: "md-button md-button--tonal", attrs: { type: "button" } });
    action.addEventListener("click", () => {
        void (async (): Promise<void> => {
            const secret = secretInput.value;
            if (mode.enabled) {
                const ok = await mode.disable(secret);
                secretStatus.textContent = ok ? "" : t("school.wrongSecret");
                if (!ok) {
                    secretInput.setAttribute("aria-invalid", "true");
                    announce(t("school.wrongSecret"));
                    return;
                }
            } else {
                if (secret.trim() === "") {
                    secretStatus.textContent = t("school.needSecret");
                    secretInput.setAttribute("aria-invalid", "true");
                    announce(secretStatus.textContent);
                    return;
                }
                const ok = await mode.enable(secret);
                if (!ok) {
                    secretStatus.textContent = t("school.unavailable");
                    announce(secretStatus.textContent);
                    return;
                }
            }
            // The secret is cleared the instant it has been used, in both directions. Leaving it
            // in the field would put a PIN on screen for anyone walking past, which is a far
            // more realistic exposure for this feature's audience than anything cryptographic.
            secretInput.value = "";
            secretInput.removeAttribute("aria-invalid");
            secretStatus.textContent = "";
            refresh();
            options.onChange();
        })();
    });

    /* ---- The two honest notes, and the documented escape hatch ------------ */

    const lockNote = el("p", { class: "mb-capability-note", attrs: { role: "note" } });
    const reportingNote = el("p", { class: "md-field__help mb-help" });

    const resetLabel = el("span", { class: "md-field__label" });
    const resetHelp = el("p", { class: "md-field__help mb-help" });
    const resetButton = el("button", {
        class: "md-button md-button--outlined md-button--danger",
        attrs: { type: "button" },
    });
    resetButton.addEventListener("click", () => {
        void (async (): Promise<void> => {
            const confirmed = await options.confirmDestructive(t("school.resetRecordDesc"));
            if (!confirmed) return;
            mode.resetLocalRecord();
            renameInput.value = "";
            refresh();
            options.onChange();
        })();
    });

    wrapper.append(
        state,
        description,
        el("div", { class: "mb-property-row" }, renameLabel, renameInput),
        renameHelp,
        el("div", { class: "mb-property-row" }, secretLabel, secretInput),
        secretStatus,
        el("div", { class: "mb-property-row" }, action),
        lockNote,
        reportingNote,
        el("div", { class: "mb-property-row" }, resetLabel, resetButton),
        resetHelp,
    );

    function refresh(): void {
        const current = name();
        fillPhrase(state, mode.enabled ? "school.stateOn" : "school.stateOff", { name: current });
        fillPhrase(description, "school.description", { name: current });
        fillPhrase(renameLabel, "school.renameLabel");
        fillPhrase(renameHelp, "school.renameDesc");
        fillPhrase(secretLabel, "school.secretLabel");
        secretInput.placeholder = t("school.secretPlaceholder");
        action.textContent = mode.enabled ? t("school.turnOff") : t("school.turnOn");
        // The accessible name names the mode as well as the verb, because "Turn on" read out of
        // context in a list of controls says nothing about what is being turned on.
        action.setAttribute(
            "aria-label",
            `${mode.enabled ? t("school.turnOff") : t("school.turnOn")} — ${current}`,
        );
        fillPhrase(lockNote, "school.lockNote");
        fillPhrase(reportingNote, "school.reportingNote");
        fillPhrase(resetLabel, "school.resetRecord");
        fillPhrase(resetHelp, "school.resetRecordDesc");
        resetButton.textContent = t("school.resetRecord");
        resetButton.setAttribute("aria-label", `${t("school.resetRecord")} — ${current}`);
        // Disabling the arm button on a browser that cannot digest would leave a dead control
        // with no explanation, so the reason is stated in the field's own status line instead
        // and the button stays operable enough to produce it.
        secretInput.disabled = !schoolCredentialAvailable() && !mode.enabled;
        if (!schoolCredentialAvailable() && !mode.enabled) {
            secretStatus.textContent = t("school.unavailable");
        }
        resetButton.disabled = !mode.hasCredential && mode.chosenName === null;
    }

    refresh();
    const unsubscribe = mode.subscribe(refresh);

    return {
        element: wrapper,
        name,
        refresh,
        destroy(): void {
            unsubscribe();
            wrapper.remove();
        },
    };
}
