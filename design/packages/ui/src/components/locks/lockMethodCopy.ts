/**
 * The words for each way a lock can open, shared by the wizard and the list so the two can
 * never name the same method differently.
 */

import type { LockMethod } from "./lockModel.js";

type Translate = (key: string, fallback: string) => string;

/** A short name for a method, for a radio label or a list row. */
export function lockMethodLabel(t: Translate, method: LockMethod): string {
    switch (method) {
        case "pin":
            return t("locks.method.pin", "A PIN");
        case "password":
            return t("locks.method.password", "A password");
        case "pin+password":
            return t("locks.method.pinPassword", "A PIN and a password");
        case "password+totp":
            return t("locks.method.passwordTotp", "A password and an authenticator code");
        case "pin+totp":
            return t("locks.method.pinTotp", "A PIN and an authenticator code");
        case "password+pin+totp":
            return t("locks.method.all", "A password, a PIN and an authenticator code");
        case "totp":
            return t("locks.method.totp", "An authenticator code");
    }
}
