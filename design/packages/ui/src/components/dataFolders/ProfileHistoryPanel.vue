<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertCircleOutline, mdiCheckCircleOutline, mdiContentSave, mdiSend } from "@mdi/js";
import { VAlert, VBtn, VIcon, VSelect, VSwitch, VTextField } from "vuetify/components";
import type { DataFoldersStore, OwnerChoice } from "./dataFoldersStore.js";

/**
 * The profile folder's version history and the optional, off-by-default send to a remote.
 *
 * History is local and always on when Git is available. Sending is a separate choice: nothing
 * leaves this computer until it is switched on, a private repository is the recommendation and
 * the only kind this creates, and files that hold sign-in details are left out of what is sent
 * unless the remote is a Git server on the person's own network and they say so.
 */
const props = defineProps<{ store: DataFoldersStore }>();
const emit = defineEmits<{ "open-github": [] }>();

const { t } = useI18n();
const uid = useId();

const status = computed(() => props.store.status.value);
const history = computed(() => status.value?.history ?? null);
const remote = computed(() => status.value?.remote ?? null);

const addressDraft = ref("");
const repositoryName = ref("worldlens-profile");
const accountId = ref<string | null>(null);
const owner = ref<OwnerChoice | null>(null);

watch(
    () => remote.value?.url,
    (url) => {
        addressDraft.value = url ?? "";
    },
    { immediate: true },
);
watch(
    () => remote.value?.accountId,
    (id) => {
        if (id !== undefined && id !== null) accountId.value = id;
    },
    { immediate: true },
);
watch(
    () => props.store.accounts.value,
    (accounts) => {
        if (accountId.value === null && accounts.length > 0) accountId.value = accounts[0]?.id ?? null;
    },
    { immediate: true },
);
watch(accountId, (id) => void props.store.loadOwners(id), { immediate: true });
watch(
    () => props.store.owners.value,
    (list) => {
        if (owner.value === null || !list.some((entry) => entry.login === owner.value?.login)) owner.value = list[0] ?? null;
    },
    { immediate: true },
);

onMounted(() => void props.store.loadOwners(accountId.value));

const accountItems = computed(() =>
    props.store.accounts.value.map((account) => ({ title: `${account.login} (${account.host})`, value: account.id })),
);
const ownerItems = computed(() =>
    props.store.owners.value.map((entry) => ({
        title: entry.kind === "organization" ? `${entry.login} (${t("dataFolders.remote.organization", "organization")})` : entry.login,
        value: entry.login,
    })),
);

const lastVersionText = computed(() => {
    const last = history.value?.last;
    if (last === null || last === undefined) return t("dataFolders.history.none", "No version has been saved yet.");
    return t(
        "dataFolders.history.last",
        { subject: last.subject, when: formatTime(last.at) },
        "Last saved version: {subject} ({when})",
    );
});

const addressDirty = computed(() => addressDraft.value.trim() !== (remote.value?.url ?? ""));
const canTurnOn = computed(() => (remote.value?.url ?? null) !== null && !addressDirty.value);
const turnOnReason = computed(() => {
    if ((remote.value?.url ?? null) === null) return t("dataFolders.remote.needAddress", "Save the address of a private repository first.");
    if (addressDirty.value) return t("dataFolders.remote.saveFirst", "Save the changed address first.");
    return null;
});
const canIncludeCredentials = computed(
    () => remote.value !== null && remote.value.credentialFilesPresent && remote.value.isLocalNetwork,
);
const credentialsReason = computed(() => {
    if (remote.value === null || !remote.value.credentialFilesPresent) {
        return t("dataFolders.credentials.none", "There are no sign-in files in the profile folder.");
    }
    if (remote.value.url === null || !remote.value.isLocalNetwork) {
        return t(
            "dataFolders.credentials.needLocal",
            "Sign-in files can only go to a Git server on your own network. Set the address of one first.",
        );
    }
    return null;
});
const sendReason = computed(() => {
    if (remote.value === null || !remote.value.enabled) return t("dataFolders.remote.offReason", "Turn on sending first.");
    if (props.store.pushing.value) return t("dataFolders.remote.sending", "Sending...");
    return null;
});

const pushResult = computed(() => props.store.pushResult.value);

function formatTime(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function saveAddress(): void {
    const value = addressDraft.value.trim();
    void props.store.changeRemote({ url: value === "" ? null : value, ...(value === "" ? { enabled: false } : {}) });
}

function createRepository(): void {
    if (owner.value === null) return;
    void props.store.createPrivateRepository({ accountId: accountId.value, owner: owner.value, name: repositoryName.value });
}

function onOwner(login: string): void {
    owner.value = props.store.owners.value.find((entry) => entry.login === login) ?? owner.value;
}
</script>

<template>
    <section class="mb-profile-history" :aria-labelledby="`${uid}-history`">
        <h3 :id="`${uid}-history`" class="mb-profile-history__title">
            {{ t("dataFolders.history.title", "Profile history") }}
        </h3>

        <v-alert v-if="history !== null && !history.available" type="info" variant="tonal" density="compact" data-test="no-git">
            {{
                history.unavailableReason ??
                t("dataFolders.history.noGit", "Git is not available, so no history is kept. Everything else works as usual.")
            }}
        </v-alert>
        <template v-else>
            <p data-test="last-version">{{ lastVersionText }}</p>
            <p class="text-medium-emphasis mb-profile-history__note">
                {{
                    t(
                        "dataFolders.history.explain",
                        "A new version is saved a little while after your settings settle, and when the app closes. Caches, locks and logs are left out. Files that hold sign-in details are kept here on this computer exactly as they are.",
                    )
                }}
            </p>
            <v-alert v-if="history?.lastFailure" type="warning" variant="tonal" density="compact" data-test="history-failure">
                {{ history.lastFailure }}
            </v-alert>
            <div class="mb-profile-history__actions">
                <v-btn variant="tonal" :prepend-icon="mdiContentSave" :disabled="history === null" @click="store.commitNow()">
                    {{ t("dataFolders.history.saveNow", "Save a version now") }}
                </v-btn>
            </div>
            <p v-if="store.historyMessage.value" role="status" class="mb-profile-history__note">{{ store.historyMessage.value }}</p>
        </template>

        <h3 class="mb-profile-history__title">{{ t("dataFolders.remote.title", "Send the history to a repository (optional)") }}</h3>
        <p class="text-medium-emphasis mb-profile-history__note">
            {{
                t(
                    "dataFolders.remote.explain",
                    "Off until you turn it on. A private repository is strongly recommended, and is the only kind created here. The history is only ever added to, never overwritten.",
                )
            }}
        </p>

        <v-text-field
            v-model="addressDraft"
            :label="t('dataFolders.remote.address', 'Repository address')"
            :placeholder="t('dataFolders.remote.addressHint', 'https://github.com/you/worldlens-profile.git')"
            variant="outlined"
            density="compact"
            spellcheck="false"
            autocomplete="off"
            hide-details="auto"
            @keydown.enter.prevent="saveAddress"
        />
        <div class="mb-profile-history__actions">
            <v-btn variant="tonal" :disabled="!addressDirty" @click="saveAddress">
                {{ t("dataFolders.remote.saveAddress", "Save address") }}
            </v-btn>
        </div>
        <p v-if="!addressDirty" class="text-medium-emphasis mb-profile-history__note" data-test="address-reason">
            {{ t("dataFolders.remote.addressUnchanged", "Save address is unavailable: the address has not changed.") }}
        </p>

        <v-switch
            :model-value="remote?.enabled ?? false"
            :label="t('dataFolders.remote.enable', 'Send the history to this repository')"
            color="primary"
            hide-details
            :disabled="!canTurnOn && !(remote?.enabled ?? false)"
            @update:model-value="store.changeRemote({ enabled: Boolean($event) })"
        />
        <p v-if="turnOnReason !== null && !(remote?.enabled ?? false)" class="text-medium-emphasis mb-profile-history__note" data-test="enable-reason">
            {{ turnOnReason }}
        </p>

        <fieldset class="mb-profile-history__create">
            <legend>{{ t("dataFolders.remote.createTitle", "Create a private repository on GitHub") }}</legend>
            <template v-if="store.accounts.value.length === 0">
                <p class="mb-profile-history__note">
                    {{ t("dataFolders.remote.signInFirst", "Sign in with GitHub CLI first. The sign-in is done in the GitHub account section of these settings, and no token is ever typed here.") }}
                </p>
                <v-btn variant="tonal" @click="emit('open-github')">
                    {{ t("dataFolders.remote.openSignIn", "Go to GitHub sign-in") }}
                </v-btn>
            </template>
            <template v-else>
                <v-select
                    v-model="accountId"
                    :items="accountItems"
                    :label="t('dataFolders.remote.account', 'GitHub account')"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                />
                <v-select
                    :model-value="owner?.login ?? null"
                    :items="ownerItems"
                    :label="t('dataFolders.remote.owner', 'Owner')"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    :disabled="ownerItems.length === 0"
                    @update:model-value="onOwner(String($event))"
                />
                <v-text-field
                    v-model="repositoryName"
                    :label="t('dataFolders.remote.name', 'Repository name')"
                    variant="outlined"
                    density="compact"
                    spellcheck="false"
                    autocomplete="off"
                    hide-details="auto"
                />
                <div class="mb-profile-history__actions">
                    <v-btn
                        variant="tonal"
                        :loading="store.creating.value"
                        :disabled="owner === null || repositoryName.trim() === ''"
                        @click="createRepository"
                    >
                        {{ t("dataFolders.remote.create", "Create private repository") }}
                    </v-btn>
                </div>
                <p v-if="owner === null" class="text-medium-emphasis mb-profile-history__note">
                    {{ t("dataFolders.remote.noOwner", "Create is unavailable: no owner could be read for this account.") }}
                </p>
            </template>
        </fieldset>

        <v-alert
            v-if="remote?.credentialFilesPresent"
            type="info"
            variant="tonal"
            density="compact"
            data-test="credentials-recommendation"
        >
            {{
                t(
                    "dataFolders.credentials.recommend",
                    "Some files in the profile folder hold sign-in details. They are never sent to a public or third-party host by default. If you want them in the remote as well, use a Git server on your own network, such as a self-hosted GitLab, and turn the option below on.",
                )
            }}
        </v-alert>
        <v-switch
            :model-value="remote?.includeCredentials ?? false"
            :label="t('dataFolders.credentials.include', 'Also send sign-in files (own-network servers only)')"
            color="warning"
            hide-details
            :disabled="!canIncludeCredentials && !(remote?.includeCredentials ?? false)"
            @update:model-value="store.changeRemote({ includeCredentials: Boolean($event) })"
        />
        <p v-if="credentialsReason !== null && !(remote?.includeCredentials ?? false)" class="text-medium-emphasis mb-profile-history__note" data-test="credentials-reason">
            {{ credentialsReason }}
        </p>
        <p v-if="remote?.includeCredentials" class="mb-profile-history__note" data-test="credentials-warning">
            {{
                t(
                    "dataFolders.credentials.warning",
                    "Sign-in files are included. Turning this off later stops sending them, but copies already sent stay in the remote's history.",
                )
            }}
        </p>

        <details class="mb-profile-history__excluded">
            <summary>{{ t("dataFolders.excluded.summary", "What is left out when sending") }}</summary>
            <ul>
                <li v-for="line in remote?.excluded ?? []" :key="line">{{ line }}</li>
            </ul>
        </details>

        <div class="mb-profile-history__actions">
            <v-btn color="primary" variant="flat" :prepend-icon="mdiSend" :loading="store.pushing.value" :disabled="sendReason !== null" @click="store.pushNow()">
                {{ t("dataFolders.remote.send", "Send now") }}
            </v-btn>
        </div>
        <p v-if="sendReason !== null && !store.pushing.value" class="text-medium-emphasis mb-profile-history__note" data-test="send-reason">
            {{ sendReason }}
        </p>

        <v-alert
            v-if="pushResult !== null"
            :type="pushResult.status === 'pushed' || pushResult.status === 'up-to-date' ? 'success' : 'error'"
            variant="tonal"
            density="compact"
            data-test="push-result"
        >
            <template #prepend>
                <v-icon :icon="pushResult.status === 'pushed' || pushResult.status === 'up-to-date' ? mdiCheckCircleOutline : mdiAlertCircleOutline" aria-hidden="true" />
            </template>
            {{ pushResult.message }}
        </v-alert>
        <p v-if="remote?.lastPush" class="mb-profile-history__note" data-test="last-push">
            <template v-if="remote.lastPush.verified">
                {{
                    t(
                        "dataFolders.remote.lastPushVerified",
                        { when: formatTime(remote.lastPush.at) },
                        "Last sent and confirmed on the remote: {when}",
                    )
                }}
            </template>
            <template v-else>
                {{
                    t(
                        "dataFolders.remote.lastPushUnverified",
                        { when: formatTime(remote.lastPush.at) },
                        "Last sent, but not confirmed on the remote: {when}",
                    )
                }}
            </template>
        </p>
        <v-alert v-if="remote?.lastError" type="warning" variant="tonal" density="compact" data-test="last-error">
            {{ remote.lastError }}
        </v-alert>
        <p v-if="store.remoteMessage.value" role="alert" class="mb-profile-history__note" data-test="remote-message">
            {{ store.remoteMessage.value }}
        </p>
    </section>
</template>

<style scoped>
.mb-profile-history {
    display: grid;
    gap: 10px;
}
.mb-profile-history__title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
}
.mb-profile-history__note,
.mb-profile-history p {
    margin: 0;
    font-size: 0.875rem;
}
.mb-profile-history__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
.mb-profile-history__create {
    display: grid;
    gap: 8px;
    border: 1px solid rgba(var(--v-theme-outline), 0.32);
    border-radius: 8px;
    padding: 12px;
}
.mb-profile-history__create legend {
    padding-inline: 6px;
    font-size: 0.875rem;
}
.mb-profile-history__excluded ul {
    margin: 6px 0 0;
    padding-inline-start: 20px;
    font-size: 0.875rem;
}
</style>
