/**
 * State and behaviour for the AWS accounts settings panel, kept out of the `.vue`
 * file so it is testable without mounting anything.
 *
 * Three things this store is careful about, because the panel exists to be honest
 * about them:
 *
 * - An account with no alias is twelve digits. The store exposes `needsAlias` per
 *   account so the panel can prompt inline rather than leaving three identical rows.
 * - Credits are billed per request (Cost Explorer). Nothing here polls; `fetchCredits`
 *   is called once per account, on request, and the result carries `fetchedAt` so the
 *   panel can show an age instead of asking again.
 * - An unreachable account stays in the list with its `problem`, never filtered out.
 */

import { ref, shallowRef, type Ref } from "vue";
import {
    resolveAwsAccountsBridge,
    canListAwsAccounts,
    type AwsAccount,
    type AwsAccountsBridge,
    type AwsAccountSpend,
} from "./awsAccountsBridge.js";

/**
 * AWS's own rule for an account alias, mirrored from `main/mcserver/aws/accounts.ts`
 * `ACCOUNT_ALIAS` so the panel can refuse an invalid name before ever calling the
 * main process: lower case, digits and hyphens, no leading or trailing hyphen, 3 to
 * 63 characters.
 */
export const AWS_ACCOUNT_ALIAS = /^(?!-)[a-z0-9-]{3,63}(?<!-)$/;

export interface AwsAccountsSettingOptions {
    readonly bridge?: AwsAccountsBridge | null;
}

export interface AwsAccountsSetting {
    readonly bridge: AwsAccountsBridge | null;
    readonly available: boolean;
    readonly loading: Ref<boolean>;
    readonly accounts: Ref<readonly AwsAccount[]>;
    readonly loadError: Ref<string | null>;
    readonly credits: Ref<Map<string, AwsAccountSpend>>;
    readonly creditsError: Ref<Map<string, string>>;
    readonly creditsLoading: Ref<Set<string>>;
    load(): Promise<void>;
    fetchCredits(profile: string): Promise<void>;
    setAlias(profile: string, alias: string): Promise<{ ok: true } | { ok: false; message: string }>;
}

function needsQuotesAsSearchText(account: AwsAccount): string {
    return [
        account.profile,
        account.accountId ?? "",
        account.alias ?? "",
        account.arn ?? "",
        account.reachable ? "reachable" : "unreachable",
        account.problem ?? "",
    ].join(" ");
}

export { needsQuotesAsSearchText as awsAccountSearchText };

export function createAwsAccountsSetting(options: AwsAccountsSettingOptions = {}): AwsAccountsSetting {
    const bridge = options.bridge === undefined ? resolveAwsAccountsBridge() : options.bridge;
    const available = canListAwsAccounts(bridge);

    const loading = ref(false);
    const accounts = shallowRef<readonly AwsAccount[]>([]);
    const loadError = ref<string | null>(null);

    const creditsMap = ref<Map<string, AwsAccountSpend>>(new Map());
    const creditsErrorMap = ref<Map<string, string>>(new Map());
    const creditsLoadingSet = ref<Set<string>>(new Set());

    async function load(): Promise<void> {
        if (bridge?.list === undefined) {
            loadError.value = "This build cannot reach AWS accounts.";
            return;
        }
        loading.value = true;
        loadError.value = null;
        try {
            const answer = await bridge.list();
            if (answer.ok) {
                accounts.value = answer.value;
            } else {
                loadError.value = answer.message;
            }
        } finally {
            loading.value = false;
        }
    }

    async function fetchCredits(profile: string): Promise<void> {
        if (bridge?.credits === undefined) {
            creditsErrorMap.value = new Map(creditsErrorMap.value).set(
                profile,
                "This build cannot read AWS billing.",
            );
            return;
        }
        const nextLoading = new Set(creditsLoadingSet.value);
        nextLoading.add(profile);
        creditsLoadingSet.value = nextLoading;
        try {
            const answer = await bridge.credits({ profile });
            if (answer.ok) {
                creditsMap.value = new Map(creditsMap.value).set(profile, answer.value);
                const cleared = new Map(creditsErrorMap.value);
                cleared.delete(profile);
                creditsErrorMap.value = cleared;
            } else {
                creditsErrorMap.value = new Map(creditsErrorMap.value).set(profile, answer.message);
            }
        } finally {
            const done = new Set(creditsLoadingSet.value);
            done.delete(profile);
            creditsLoadingSet.value = done;
        }
    }

    async function setAlias(profile: string, alias: string): Promise<{ ok: true } | { ok: false; message: string }> {
        if (!AWS_ACCOUNT_ALIAS.test(alias)) {
            return {
                ok: false,
                message:
                    "An account name uses lower-case letters, numbers and hyphens, is 3 to 63 characters, and cannot start or end with a hyphen.",
            };
        }
        if (bridge?.setAlias === undefined) {
            return { ok: false, message: "This build cannot name AWS accounts." };
        }
        const answer = await bridge.setAlias({ profile, alias });
        if (!answer.ok) {
            return { ok: false, message: answer.message };
        }
        accounts.value = accounts.value.map((account) => (account.profile === profile ? { ...account, alias } : account));
        return { ok: true };
    }

    return {
        bridge,
        available,
        loading,
        accounts,
        loadError,
        credits: creditsMap,
        creditsError: creditsErrorMap,
        creditsLoading: creditsLoadingSet,
        load,
        fetchCredits,
        setAlias,
    };
}
