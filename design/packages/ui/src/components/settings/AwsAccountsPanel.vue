<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertCircleOutline, mdiCashSync, mdiPencilOutline, mdiRefresh, mdiTagOutline } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VChip, VIcon, VList, VListItem, VProgressLinear, VTextField } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { createAwsAccountsSetting, awsAccountSearchText, AWS_ACCOUNT_ALIAS } from "./awsAccountsSetting.js";
import type { AwsAccountsBridge } from "./awsAccountsBridge.js";

/**
 * Every AWS account this machine's CLI profiles can reach: identity, reachability
 * and spend, with a search bar and an inline prompt to name an account that has no
 * alias. See `awsAccountsSetting.ts` for the honesty rules this panel renders
 * without softening: credits applied is not a balance, and Cost Explorer is billed
 * per request so nothing here polls.
 */
const props = defineProps<{ bridge?: AwsAccountsBridge | null }>();

const { t } = useI18n();

const setting = createAwsAccountsSetting(props.bridge === undefined ? {} : { bridge: props.bridge });
onMounted(() => void setting.load());

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));
const visible = computed(() => setting.accounts.value.filter((account) => matcher.value.test(awsAccountSearchText(account))));
const sample = computed(() => setting.accounts.value.map((account) => awsAccountSearchText(account)).join("\n"));

const searchSummary = computed(() => {
    if (matcher.value.error !== null) {
        return t("awsAccounts.list.badPattern", "The pattern is not valid, so nothing is listed.");
    }
    if (!matcher.value.active) return "";
    return t(
        "awsAccounts.list.searchSummary",
        { shown: visible.value.length, total: setting.accounts.value.length },
        "Showing {shown} of {total}.",
    );
});

/** Draft alias text and the last refusal reason, keyed by profile. */
const aliasDrafts = reactive<Record<string, string>>({});
const aliasErrors = reactive<Record<string, string | null>>({});
const aliasEditing = reactive<Record<string, boolean>>({});
const aliasSaving = reactive<Record<string, boolean>>({});

function startAliasEdit(profile: string): void {
    aliasEditing[profile] = true;
    aliasDrafts[profile] = aliasDrafts[profile] ?? "";
    aliasErrors[profile] = null;
}

function cancelAliasEdit(profile: string): void {
    aliasEditing[profile] = false;
    aliasErrors[profile] = null;
}

const aliasHint = t(
    "awsAccounts.alias.hint",
    "Lower-case letters, numbers and hyphens. 3 to 63 characters. Cannot start or end with a hyphen.",
);

async function saveAlias(profile: string): Promise<void> {
    const draft = (aliasDrafts[profile] ?? "").trim();
    if (!AWS_ACCOUNT_ALIAS.test(draft)) {
        aliasErrors[profile] = aliasHint;
        return;
    }
    aliasSaving[profile] = true;
    aliasErrors[profile] = null;
    try {
        const result = await setting.setAlias(profile, draft);
        if (result.ok) {
            aliasEditing[profile] = false;
        } else {
            aliasErrors[profile] = result.message;
        }
    } finally {
        aliasSaving[profile] = false;
    }
}

function creditsAgeLabel(fetchedAt: string): string {
    const then = Date.parse(fetchedAt);
    if (Number.isNaN(then)) return "";
    const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
    if (minutes < 1) return t("awsAccounts.credits.justNow", "fetched just now");
    if (minutes === 1) return t("awsAccounts.credits.oneMinuteAgo", "fetched 1 minute ago");
    return t("awsAccounts.credits.minutesAgo", { minutes }, "fetched {minutes} minutes ago");
}
</script>

<template>
    <div class="mb-aws-accounts">
        <VAlert v-if="!setting.available" type="info" variant="tonal" density="comfortable" class="mb-3">
            {{ t("awsAccounts.unavailable", "This build cannot reach AWS accounts. Run it as the desktop application to see this list.") }}
        </VAlert>

        <template v-else>
            <div class="mb-aws-accounts__toolbar">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('awsAccounts.search.label', 'Search accounts')"
                    :sample="sample"
                    :summary="searchSummary"
                />
                <VBtn
                    :prepend-icon="mdiRefresh"
                    variant="tonal"
                    :loading="setting.loading.value"
                    @click="setting.load()"
                >
                    {{ t("awsAccounts.refresh", "Refresh") }}
                </VBtn>
            </div>

            <VProgressLinear v-if="setting.loading.value" indeterminate class="mb-3" />

            <VAlert v-if="setting.loadError.value" type="error" variant="tonal" density="comfortable" class="mb-3">
                {{ setting.loadError.value }}
            </VAlert>

            <VAlert
                v-if="!setting.loading.value && setting.accounts.value.length === 0 && setting.loadError.value === null"
                type="info"
                variant="tonal"
                density="comfortable"
            >
                {{ t("awsAccounts.empty", "No AWS CLI profiles were found on this machine.") }}
            </VAlert>

            <VList v-if="visible.length > 0" class="mb-aws-accounts__list" role="list" :aria-label="t('awsAccounts.list.label', 'AWS accounts')">
                <VListItem v-for="account in visible" :key="account.profile" class="mb-aws-accounts__row" role="listitem">
                    <VCard variant="tonal" class="mb-aws-accounts__card" :color="account.reachable ? undefined : 'error'">
                        <VCardText>
                            <div class="mb-aws-accounts__header">
                                <span class="mb-aws-accounts__profile">{{ account.profile }}</span>
                                <VChip
                                    :color="account.reachable ? 'success' : 'error'"
                                    size="small"
                                    variant="flat"
                                >
                                    {{ account.reachable ? t("awsAccounts.reachable", "Reachable") : t("awsAccounts.unreachable", "Unreachable") }}
                                </VChip>
                            </div>

                            <p v-if="account.accountId" class="mb-aws-accounts__field">
                                {{ t("awsAccounts.accountId", "Account") }}: {{ account.accountId }}
                            </p>
                            <p v-if="account.arn" class="mb-aws-accounts__field">
                                {{ t("awsAccounts.identity", "Identity") }}: {{ account.arn }}
                            </p>

                            <VAlert v-if="!account.reachable && account.problem" type="warning" variant="text" density="compact" :icon="mdiAlertCircleOutline">
                                {{ account.problem }}
                            </VAlert>

                            <!-- Naming prompt: an account with no alias is twelve digits, indistinguishable from the next one. -->
                            <div v-if="account.alias" class="mb-aws-accounts__field mb-aws-accounts__alias">
                                <VIcon :icon="mdiTagOutline" size="small" />
                                {{ account.alias }}
                            </div>
                            <div v-else class="mb-aws-accounts__alias-prompt">
                                <template v-if="!aliasEditing[account.profile]">
                                    <VAlert type="warning" variant="tonal" density="compact">
                                        {{ t("awsAccounts.alias.none", "This account has no name. It is twelve digits, indistinguishable from any other unnamed account.") }}
                                    </VAlert>
                                    <VBtn
                                        :prepend-icon="mdiPencilOutline"
                                        variant="text"
                                        size="small"
                                        :disabled="!account.reachable"
                                        @click="startAliasEdit(account.profile)"
                                    >
                                        {{ t("awsAccounts.alias.set", "Set a name") }}
                                    </VBtn>
                                    <p v-if="!account.reachable" class="mb-aws-accounts__disabled-reason">
                                        {{ t("awsAccounts.alias.needsReachable", "This account must be reachable before it can be named.") }}
                                    </p>
                                </template>
                                <template v-else>
                                    <VTextField
                                        :model-value="aliasDrafts[account.profile] ?? ''"
                                        @update:model-value="(value: string) => { aliasDrafts[account.profile] = value; }"
                                        :label="t('awsAccounts.alias.field', 'Account name')"
                                        :hint="aliasHint"
                                        persistent-hint
                                        density="compact"
                                        variant="outlined"
                                        :error-messages="aliasErrors[account.profile] ?? null"
                                        @keyup.enter="saveAlias(account.profile)"
                                    />
                                    <div class="mb-aws-accounts__alias-actions">
                                        <VBtn size="small" variant="tonal" :loading="!!aliasSaving[account.profile]" @click="saveAlias(account.profile)">
                                            {{ t("awsAccounts.alias.save", "Save") }}
                                        </VBtn>
                                        <VBtn size="small" variant="text" @click="cancelAliasEdit(account.profile)">
                                            {{ t("awsAccounts.alias.cancel", "Cancel") }}
                                        </VBtn>
                                    </div>
                                </template>
                            </div>

                            <!-- Credits: applied is not a balance. AWS publishes no API for the remaining balance. -->
                            <div class="mb-aws-accounts__credits">
                                <VBtn
                                    :prepend-icon="mdiCashSync"
                                    variant="text"
                                    size="small"
                                    :disabled="!account.reachable"
                                    :loading="setting.creditsLoading.value.has(account.profile)"
                                    @click="setting.fetchCredits(account.profile)"
                                >
                                    {{ t("awsAccounts.credits.fetch", "Check spending") }}
                                </VBtn>

                                <VAlert v-if="setting.creditsError.value.get(account.profile)" type="error" variant="text" density="compact">
                                    {{ setting.creditsError.value.get(account.profile) }}
                                </VAlert>

                                <div v-if="setting.credits.value.get(account.profile)" class="mb-aws-accounts__credits-detail">
                                    <p>
                                        {{
                                            t(
                                                "awsAccounts.credits.applied",
                                                {
                                                    amount: setting.credits.value.get(account.profile)!.creditsApplied.toFixed(2),
                                                    currency: setting.credits.value.get(account.profile)!.currency,
                                                },
                                                "{amount} {currency} in credits applied this period",
                                            )
                                        }}
                                    </p>
                                    <p>
                                        {{
                                            t(
                                                "awsAccounts.credits.net",
                                                {
                                                    amount: setting.credits.value.get(account.profile)!.netUsd.toFixed(2),
                                                    currency: setting.credits.value.get(account.profile)!.currency,
                                                },
                                                "{amount} {currency} actually charged after credits",
                                            )
                                        }}
                                    </p>
                                    <VAlert type="info" variant="text" density="compact">
                                        {{ setting.credits.value.get(account.profile)!.balanceUnavailableReason }}
                                    </VAlert>
                                    <p class="mb-aws-accounts__credits-age">
                                        {{ creditsAgeLabel(setting.credits.value.get(account.profile)!.fetchedAt) }}
                                    </p>
                                </div>
                            </div>
                        </VCardText>
                    </VCard>
                </VListItem>
            </VList>
        </template>
    </div>
</template>

<style>
.mb-aws-accounts__toolbar {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    flex-wrap: wrap;
    margin-block-end: 12px;
}

.mb-aws-accounts__toolbar .mb-config-search {
    flex: 1 1 240px;
}

.mb-aws-accounts__toolbar .v-btn {
    min-block-size: 44px;
}

.mb-aws-accounts__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: transparent;
}

.mb-aws-accounts__row {
    padding: 0;
}

.mb-aws-accounts__card {
    inline-size: 100%;
}

.mb-aws-accounts__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-block-end: 6px;
}

.mb-aws-accounts__profile {
    font-weight: 600;
    overflow-wrap: anywhere;
}

.mb-aws-accounts__field {
    margin: 2px 0;
    font-size: 0.875rem;
    overflow-wrap: anywhere;
}

.mb-aws-accounts__alias {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
}

.mb-aws-accounts__alias-prompt {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-block-start: 6px;
}

.mb-aws-accounts__alias-actions {
    display: flex;
    gap: 8px;
}

.mb-aws-accounts__alias-actions .v-btn,
.mb-aws-accounts__alias-prompt .v-btn {
    min-block-size: 44px;
}

.mb-aws-accounts__disabled-reason {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-aws-accounts__credits {
    margin-block-start: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.mb-aws-accounts__credits .v-btn {
    min-block-size: 44px;
    align-self: flex-start;
}

.mb-aws-accounts__credits-detail {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.875rem;
}

.mb-aws-accounts__credits-age {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
