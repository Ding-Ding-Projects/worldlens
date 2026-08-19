<script setup lang="ts">
/**
 * The built-in authenticator: register arbitrary TOTP accounts, and read their live codes.
 *
 * Registration is deliberately guided through three routes that all avoid retyping a secret
 * by hand where possible - pasting an `otpauth://` link, typing issuer/account/secret, or
 * (implicitly, since this build draws its own QR) scanning what is on screen with a phone.
 * The pairing is proved with one current code before anything is kept, exactly as the toy
 * locks next door prove a TOTP lock's pairing, and for the identical reason: an unproven
 * secret is a secret nobody discovers is wrong until the one moment they actually need it.
 *
 * A stored secret is never rendered again after that one proof. The live code panel reads it
 * from the vault only to compute the current and next code, in memory, on a ticking timer -
 * never displaying the secret itself.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import {
    mdiClose,
    mdiContentCopy,
    mdiDelete,
    mdiPlus,
    mdiQrcode,
    mdiShieldKeyOutline,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VChip,
    VDivider,
    VList,
    VListItem,
    VProgressLinear,
    VRadio,
    VRadioGroup,
    VTextField,
} from "vuetify/components";

import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    otpauthUri,
    parseOtpauthUri,
    totp,
    totpSecondsRemaining,
    TOTP_DEFAULTS,
} from "../locks/totp.js";
import {
    authenticatorCorpus,
    authenticatorStore,
    authenticatorVaultMissingReason,
    entrySearchText,
    orderedEntries,
    registerEntry,
    removeEntry,
    reloadAuthenticatorStore,
    useAuthenticatorVault,
    type AuthenticatorEntry,
} from "./authenticatorStore.js";
import { encodeQrSvg } from "./qrCode.js";

const { t } = useI18n();
const vault = useAuthenticatorVault();

/* -------------------------------------------------------------------------- */
/* Registration                                                              */
/* -------------------------------------------------------------------------- */

type RegisterRoute = "link" | "manual";

const registering = ref(false);
const route = ref<RegisterRoute>("link");
const linkText = ref("");
const issuer = ref("");
const account = ref("");
const secretText = ref("");
const pairingCode = ref("");
const problem = ref<string | null>(null);
const busy = ref(false);

const vaultUnavailable = computed<string | null>(() =>
    vault === null ? authenticatorVaultMissingReason() : null,
);

/** The candidate secret and label, from whichever route was used, before it is proven. */
const candidate = computed(() => {
    if (route.value === "link") {
        if (linkText.value.trim() === "") return null;
        const parsed = parseOtpauthUri(linkText.value.trim());
        return parsed.ok ? parsed.parts : null;
    }
    if (secretText.value.trim() === "" || account.value.trim() === "") return null;
    return {
        issuer: issuer.value.trim(),
        account: account.value.trim(),
        secret: secretText.value.trim(),
        parameters: TOTP_DEFAULTS,
    };
});

const linkError = computed(() => {
    if (route.value !== "link" || linkText.value.trim() === "") return null;
    const parsed = parseOtpauthUri(linkText.value.trim());
    return parsed.ok ? null : parsed.message;
});

/** The pairing QR and its text alternative, drawn locally from whatever has been typed so far. */
const pairing = computed(() => {
    if (candidate.value === null) return null;
    const uri = otpauthUri({
        issuer: candidate.value.issuer,
        account: candidate.value.account,
        secret: candidate.value.secret,
        parameters: candidate.value.parameters,
    });
    const encoded = encodeQrSvg(uri);
    return {
        uri,
        svg: encoded.ok ? encoded.svg : null,
        qrError: encoded.ok ? null : encoded.message,
    };
});

const registerBlocked = computed<string | null>(() => {
    if (vaultUnavailable.value !== null) return vaultUnavailable.value;
    if (candidate.value === null) {
        return route.value === "link"
            ? t("authenticator.register.needLink", "Paste an otpauth:// link to begin.")
            : t(
                  "authenticator.register.needFields",
                  "Name the account and enter its secret to begin.",
              );
    }
    if (pairingCode.value.trim() === "") {
        return t(
            "authenticator.register.needCode",
            "Type one current code from the authenticator that just scanned this, so the pairing is proven before it is kept.",
        );
    }
    return null;
});

async function submitRegistration(): Promise<void> {
    if (busy.value || registerBlocked.value !== null || candidate.value === null) return;
    busy.value = true;
    problem.value = null;
    try {
        const result = await registerEntry(vault, {
            issuer: candidate.value.issuer,
            account: candidate.value.account,
            secretBase32: candidate.value.secret,
            parameters: candidate.value.parameters,
            pairingCode: pairingCode.value.trim(),
        });
        if (!result.ok) {
            problem.value = result.message;
            return;
        }
        resetRegistration();
        registering.value = false;
        selected.value = result.entry.id;
    } finally {
        busy.value = false;
    }
}

function resetRegistration(): void {
    linkText.value = "";
    issuer.value = "";
    account.value = "";
    secretText.value = "";
    pairingCode.value = "";
    problem.value = null;
    route.value = "link";
}

function cancelRegistration(): void {
    resetRegistration();
    registering.value = false;
}

/* -------------------------------------------------------------------------- */
/* The list, and its search bar                                              */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
const flags = ref("g");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const visibleEntries = computed<readonly AuthenticatorEntry[]>(() =>
    orderedEntries.value.filter((entry) => matcher.value.test(entrySearchText(entry))),
);

const searchSummary = computed(() =>
    t(
        "authenticator.search.summary",
        { shown: visibleEntries.value.length, total: orderedEntries.value.length },
        "Showing {shown} of {total}",
    ),
);

const selected = ref<string | null>(null);
const selectedEntry = computed<AuthenticatorEntry | null>(
    () => orderedEntries.value.find((entry) => entry.id === selected.value) ?? null,
);

async function deleteEntry(id: string): Promise<void> {
    await removeEntry(vault, id);
    if (selected.value === id) selected.value = null;
}

/* -------------------------------------------------------------------------- */
/* The live code panel                                                       */
/* -------------------------------------------------------------------------- */

const currentCode = ref<string | null>(null);
const nextCode = ref<string | null>(null);
const secondsRemaining = ref(0);
const codeError = ref<string | null>(null);
let ticking: ReturnType<typeof setInterval> | null = null;

async function refreshCode(): Promise<void> {
    const entry = selectedEntry.value;
    if (entry === null || vault === null) {
        currentCode.value = null;
        nextCode.value = null;
        codeError.value = null;
        return;
    }
    const secret = await vault.get(entry.secretRef);
    if (secret === null) {
        codeError.value = t(
            "authenticator.code.noSecret",
            "This entry's secret is no longer in the vault, so no code can be shown.",
        );
        currentCode.value = null;
        nextCode.value = null;
        return;
    }
    const { decodeBase32 } = await import("../locks/totp.js");
    const decoded = decodeBase32(secret);
    if (!decoded.ok) {
        codeError.value = decoded.message;
        return;
    }
    const now = Date.now();
    currentCode.value = await totp(decoded.bytes, now, entry.parameters);
    nextCode.value = await totp(
        decoded.bytes,
        now + entry.parameters.period * 1000,
        entry.parameters,
    );
    secondsRemaining.value = totpSecondsRemaining(now, entry.parameters.period);
    codeError.value = null;
}

watch(selectedEntry, () => {
    void refreshCode();
});

/** A crude, local-only sanity check: no server round trip is made anywhere in this feature. */
const clockLooksWrong = computed(() => {
    const year = new Date().getFullYear();
    return year < 2024 || year > 2100;
});

function groupDigits(code: string | null): string {
    if (code === null) return "";
    return code.replace(/(.{1,3})/g, "$1 ").trim();
}

async function copyCode(): Promise<void> {
    if (currentCode.value === null) return;
    try {
        await navigator.clipboard.writeText(currentCode.value);
    } catch {
        // Clipboard access can be refused by the platform; the code is still on screen to
        // select and copy by hand, so this is a quiet no-op rather than a surfaced error.
    }
}

onMounted(() => {
    reloadAuthenticatorStore();
    ticking = setInterval(() => {
        void refreshCode();
    }, 1000);
});

onBeforeUnmount(() => {
    if (ticking !== null) clearInterval(ticking);
});
</script>

<template>
    <section
        class="mb-authenticator"
        :aria-label="t('authenticator.title', 'Authenticator')"
        data-test="authenticator-screen"
    >
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
            <h2 class="mb-authenticator__title">
                {{ t("authenticator.title", "Authenticator") }}
            </h2>
            <VBtn
                color="primary"
                :prepend-icon="mdiPlus"
                data-test="authenticator-open-register"
                @click="registering = true"
            >
                {{ t("authenticator.register.open", "Register an account") }}
            </VBtn>
        </div>

        <VAlert
            v-if="authenticatorStore.failure !== null"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-3"
            role="alert"
            data-test="authenticator-store-failure"
        >
            {{
                t(
                    "authenticator.store.failure",
                    { message: authenticatorStore.failure },
                    "Your registered accounts could not be read: {message}. Nothing has been erased; fix the storage and reload.",
                )
            }}
        </VAlert>

        <VAlert
            v-if="vaultUnavailable !== null"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-3"
            data-test="authenticator-no-vault"
        >
            {{ vaultUnavailable }}
        </VAlert>

        <!-- Registration -->
        <VCard
            v-if="registering"
            variant="outlined"
            class="mb-4"
            data-test="authenticator-register-card"
        >
            <VCardTitle>{{ t("authenticator.register.title", "Register an account") }}</VCardTitle>
            <VCardText>
                <VRadioGroup
                    v-model="route"
                    inline
                    :label="t('authenticator.register.route', 'How to add it')"
                >
                    <VRadio
                        :label="t('authenticator.register.routeLink', 'Paste an otpauth:// link')"
                        value="link"
                        data-test="authenticator-route-link"
                    />
                    <VRadio
                        :label="
                            t(
                                'authenticator.register.routeManual',
                                'Type issuer, account and secret',
                            )
                        "
                        value="manual"
                        data-test="authenticator-route-manual"
                    />
                </VRadioGroup>

                <template v-if="route === 'link'">
                    <VTextField
                        v-model="linkText"
                        :label="t('authenticator.register.link', 'otpauth:// link')"
                        :error-messages="linkError ?? []"
                        density="compact"
                        autocomplete="off"
                        spellcheck="false"
                        data-test="authenticator-link"
                    />
                </template>
                <template v-else>
                    <VTextField
                        v-model="issuer"
                        :label="t('authenticator.register.issuer', 'Issuer (optional)')"
                        density="compact"
                        data-test="authenticator-issuer"
                    />
                    <VTextField
                        v-model="account"
                        :label="t('authenticator.register.account', 'Account')"
                        density="compact"
                        data-test="authenticator-account"
                    />
                    <VTextField
                        v-model="secretText"
                        :label="t('authenticator.register.secret', 'Secret (base32)')"
                        density="compact"
                        autocomplete="off"
                        spellcheck="false"
                        data-test="authenticator-secret-input"
                    />
                </template>

                <div
                    v-if="pairing !== null"
                    class="mb-authenticator__pairing"
                    data-test="authenticator-pairing"
                >
                    <div
                        v-if="pairing.svg !== null"
                        class="mb-authenticator__qr"
                        v-html="pairing.svg"
                    />
                    <VAlert v-else type="warning" variant="tonal" density="compact">
                        {{ pairing.qrError }}
                    </VAlert>
                    <p class="mb-authenticator__note">
                        {{
                            t(
                                "authenticator.register.scanOrType",
                                "Scan this in an authenticator, or type the secret in by hand, then prove the pairing with one current code.",
                            )
                        }}
                    </p>
                    <VTextField
                        :model-value="candidate?.secret ?? ''"
                        :label="
                            t(
                                'authenticator.register.secretShown',
                                'The secret, grouped, in case you are typing it',
                            )
                        "
                        readonly
                        density="compact"
                        data-test="authenticator-secret-display"
                    />
                    <p class="mb-authenticator__params" data-test="authenticator-params">
                        {{
                            t(
                                "authenticator.register.params",
                                {
                                    algorithm:
                                        candidate?.parameters.algorithm ?? TOTP_DEFAULTS.algorithm,
                                    digits: candidate?.parameters.digits ?? TOTP_DEFAULTS.digits,
                                    period: candidate?.parameters.period ?? TOTP_DEFAULTS.period,
                                },
                                "{algorithm}, {digits} digits, every {period} seconds",
                            )
                        }}
                    </p>
                    <VTextField
                        v-model="pairingCode"
                        :label="
                            t(
                                'authenticator.register.code',
                                'One current code, to prove the pairing',
                            )
                        "
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        density="compact"
                        data-test="authenticator-pairing-code"
                    />
                </div>

                <VAlert
                    v-if="problem !== null"
                    type="error"
                    variant="tonal"
                    density="compact"
                    class="mt-2"
                    role="alert"
                    data-test="authenticator-register-problem"
                >
                    {{ problem }}
                </VAlert>

                <div class="d-flex ga-2 flex-wrap mt-3">
                    <VBtn
                        color="primary"
                        :disabled="registerBlocked !== null"
                        :loading="busy"
                        data-test="authenticator-register-submit"
                        @click="submitRegistration"
                    >
                        {{ t("authenticator.register.submit", "Prove and register") }}
                    </VBtn>
                    <VBtn
                        variant="text"
                        data-test="authenticator-register-cancel"
                        @click="cancelRegistration"
                    >
                        {{ t("authenticator.register.cancel", "Never mind") }}
                    </VBtn>
                </div>
                <p
                    v-if="registerBlocked !== null"
                    class="text-medium-emphasis mt-2"
                    data-test="authenticator-register-blocked"
                >
                    {{ registerBlocked }}
                </p>
            </VCardText>
        </VCard>

        <ConfigSearchField
            v-model="query"
            :regex="regexMode"
            :flags="flags"
            :label="t('authenticator.search.label', 'Search accounts')"
            :sample="authenticatorCorpus()"
            :summary="searchSummary"
            @update:regex="(value: boolean) => (regexMode = value)"
            @update:flags="(value: string) => (flags = value)"
        />

        <p
            v-if="orderedEntries.length === 0"
            class="text-medium-emphasis mt-3"
            data-test="authenticator-empty"
        >
            {{ t("authenticator.empty", "No accounts are registered yet.") }}
        </p>

        <VList v-else class="mt-3" data-test="authenticator-list">
            <VListItem
                v-for="entry in visibleEntries"
                :key="entry.id"
                :active="selected === entry.id"
                :title="entry.account"
                :subtitle="entry.issuer || ''"
                :prepend-icon="mdiShieldKeyOutline"
                data-test="authenticator-entry"
                @click="selected = entry.id"
            >
                <template #append>
                    <!--
                        The two-key gate rather than a delete button. Removing an entry
                        takes its secret out of the vault, and nothing here can put it
                        back: the person would have to pair the account again from the
                        issuer, which for a second factor usually means recovery codes or
                        a support conversation. That is the loss the gate exists for.
                    -->
                    <ConfigSuperConfirm
                        :title="t('authenticator.list.removeTitle', 'Remove this account')"
                        :action="
                            t(
                                'authenticator.list.removeAction',
                                { account: entry.account, issuer: entry.issuer },
                                'This removes {account} at {issuer} and deletes its secret from this computer. Nothing here can recover it: you would have to pair the account again from the issuer.',
                            )
                        "
                        :affected="[`${entry.issuer}: ${entry.account}`]"
                        :confirm-label="t('authenticator.list.removeConfirm', 'Remove it')"
                        @confirm="deleteEntry(entry.id)"
                    >
                        <template #activator="{ props: activatorProps }">
                            <VBtn
                                v-bind="activatorProps"
                                :icon="mdiDelete"
                                variant="text"
                                size="small"
                                :aria-label="
                                    t(
                                        'authenticator.list.remove',
                                        { account: entry.account },
                                        'Remove {account}',
                                    )
                                "
                                data-test="authenticator-entry-remove"
                                @click.stop
                            />
                        </template>
                    </ConfigSuperConfirm>
                </template>
            </VListItem>
        </VList>

        <p
            v-if="visibleEntries.length === 0 && orderedEntries.length > 0"
            class="text-medium-emphasis mt-2"
            data-test="authenticator-no-match"
        >
            {{ t("authenticator.search.noMatch", "Nothing here matches that search.") }}
        </p>

        <!-- Live code -->
        <VCard
            v-if="selectedEntry !== null"
            variant="outlined"
            class="mt-4"
            data-test="authenticator-code-card"
        >
            <VCardTitle>
                {{
                    selectedEntry.issuer
                        ? `${selectedEntry.issuer} · ${selectedEntry.account}`
                        : selectedEntry.account
                }}
            </VCardTitle>
            <VCardText>
                <VAlert
                    v-if="clockLooksWrong"
                    type="warning"
                    variant="tonal"
                    density="compact"
                    class="mb-3"
                    data-test="authenticator-clock-warning"
                >
                    {{
                        t(
                            "authenticator.code.clockWrong",
                            "This device's clock looks wrong, and a wrong clock means codes get refused. Check the system date and time.",
                        )
                    }}
                </VAlert>
                <VAlert
                    v-if="codeError !== null"
                    type="error"
                    variant="tonal"
                    density="compact"
                    class="mb-3"
                    role="alert"
                    data-test="authenticator-code-error"
                >
                    {{ codeError }}
                </VAlert>

                <div
                    v-if="currentCode !== null"
                    class="mb-authenticator__code"
                    data-test="authenticator-current-code"
                    aria-live="polite"
                >
                    {{ groupDigits(currentCode) }}
                </div>
                <VBtn
                    v-if="currentCode !== null"
                    variant="text"
                    :prepend-icon="mdiContentCopy"
                    data-test="authenticator-copy-code"
                    @click="copyCode"
                >
                    {{ t("authenticator.code.copy", "Copy") }}
                </VBtn>

                <VProgressLinear
                    :model-value="(secondsRemaining / selectedEntry.parameters.period) * 100"
                    height="6"
                    class="my-2"
                    data-test="authenticator-countdown-bar"
                />
                <p class="text-medium-emphasis" data-test="authenticator-countdown-text">
                    {{
                        t(
                            "authenticator.code.seconds",
                            { seconds: secondsRemaining },
                            "{seconds}s left",
                        )
                    }}
                </p>

                <VDivider class="my-3" />

                <p class="text-medium-emphasis" data-test="authenticator-next-label">
                    {{ t("authenticator.code.nextLabel", "Next code") }}
                </p>
                <div
                    v-if="nextCode !== null"
                    class="mb-authenticator__nextCode"
                    data-test="authenticator-next-code"
                >
                    {{ groupDigits(nextCode) }}
                </div>
            </VCardText>
        </VCard>
    </section>
</template>

<style scoped>
.mb-authenticator {
    max-width: 40rem;
}

.mb-authenticator__title {
    font: var(--mb-title-large, inherit);
}

.mb-authenticator__pairing {
    margin-top: 0.75rem;
}

.mb-authenticator__qr {
    max-width: 12rem;
}

.mb-authenticator__qr :deep(svg) {
    width: 100%;
    height: auto;
}

.mb-authenticator__note,
.mb-authenticator__params {
    font: var(--mb-body-small, inherit);
    color: rgb(var(--v-theme-on-surface-variant, 0 0 0));
    margin-block: 0.5rem;
}

.mb-authenticator__code {
    font-family: var(--mb-font-mono, monospace);
    font-size: 2rem;
    font-weight: 600;
    letter-spacing: 0.15em;
}

.mb-authenticator__nextCode {
    font-family: var(--mb-font-mono, monospace);
    font-size: 1.25rem;
    letter-spacing: 0.1em;
    color: rgb(var(--v-theme-on-surface-variant, 0 0 0));
}
</style>
