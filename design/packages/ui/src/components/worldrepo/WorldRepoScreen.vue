<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCheckDecagram,
    mdiCloudSyncOutline,
    mdiContentCopy,
    mdiDatabaseSearchOutline,
    mdiDeleteSweepOutline,
    mdiFolderSearchOutline,
    mdiGithub,
    mdiPlus,
    mdiRefresh,
    mdiSelectAll,
    mdiSelectOff,
    mdiSourceRepository,
    mdiStop,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VCheckbox,
    VCheckboxBtn,
    VChip,
    VDivider,
    VIcon,
    VList,
    VListItem,
    VProgressCircular,
    VProgressLinear,
    VRadio,
    VRadioGroup,
    VSelect,
    VTextField,
} from "vuetify/components";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import PathField from "../PathField.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import GhEntityPicker from "../github/GhEntityPicker.vue";
import {
    createGhCliAccountsStore,
    defaultGhCliAccountId,
} from "../github/ghCliAccountsStore.js";
import type { GhCliBridge } from "../github/ghCliBridge.js";
import { raiseNotice } from "../../stores/notices.js";
import { resolveBackupBridge } from "../backup/backupBridge.js";
import type { BackupBridge, RepositoryChoice } from "../backup/backupBridge.js";
import { useProjectHost } from "../project/projectHost.js";
import type { ProjectHost } from "../project/projectHost.js";
import type { ProjectFile } from "@worldlens/config";
import {
    DEFAULT_WORLD_BRANCH,
    createWorldRepo,
    formatBytes,
    phaseLabel,
    sizeLine,
    targetKey,
} from "./worldRepo.js";
import type { WorldRepoRow } from "./worldRepo.js";
import { resolveWorldRepoBridge } from "./worldRepoBridge.js";
import type {
    WorldRepoAdoptionCandidate,
    WorldRepoAdoptionSignal,
    WorldRepoAdoptionStatus,
    WorldRepoBridge,
    WorldRepoRecord,
    WorldRepoTarget,
} from "./worldRepoBridge.js";

/**
 * Keeping a Minecraft world in a git repository, so a render never has to re-zip it - and
 * recognising, on a computer that has never touched it before, a repository this application
 * already prepared somewhere else.
 *
 * Follows two proven patterns rather than inventing a third: `PagesScreen.vue`'s flow (an
 * owner picked from a real list, a repository field, a preflight report read *before*
 * anything destructive, an explicit acknowledgement), and `BackupScreen.vue`'s **explicit**
 * "Create this repository" action rather than Pages' silent create-on-publish - a person
 * presses a button that says it creates a repository, and never discovers that syncing did
 * it behind their back.
 *
 * ## Adoption never asserts, and never writes
 *
 * `main/worldrepo/adopt.ts` hedges every recognition with "looks like" rather than "is", and
 * every call it makes is a `GET` - see that module's own doc comment. This screen keeps both
 * disciplines: a candidate's status chip and message are `adopt.ts`'s own wording, rendered
 * verbatim rather than upgraded to a claim of certainty, and "Adopt this repository" writes
 * only the local project file, through `ProjectHost.writeProject` - it never pushes, and it
 * never touches the repository adoption just read from.
 *
 * ## What cannot cross machines is surfaced, never silently restored
 *
 * `plan.needsAttention` names the Minecraft world folder itself, local dependencies, remote
 * host/SSH configuration, and the two fields a project is allowed to carry as absolute paths
 * (`output-folder`, `linked-world`). Every one of those is shown as its own item with a route
 * to fixing it - a folder picker for the world itself, a link to Settings for the other two -
 * rather than folded quietly into a project that looks fully restored when it is not.
 */
const props = withDefaults(
    defineProps<{
        /**
         * Injected in tests. Left out, the Electron bridges are probed, which is why this has
         * no default: `undefined` means probe, `null` means there is deliberately no bridge
         * and the unsupported state is what should be shown.
         */
        bridge?: WorldRepoBridge | null | undefined;
        /**
         * The repository-listing/creation bridge adoption's candidate list and the explicit
         * "Create this repository" action both reuse - the same capability `BackupScreen.vue`
         * already offers, not a second implementation of "repositories this sign-in can write
         * to". `undefined` probes the real Electron bridge; `null` states there is deliberately
         * none.
         */
        repoBridge?: BackupBridge | null | undefined;
        accountsBridge?: GhCliBridge | null | undefined;
        /**
         * What "Adopt this repository" writes the restored project through. `undefined` probes
         * the real Electron bridge (falling back to whatever a parent has `provideProjectHost`-
         * ed); `null` states there is deliberately none, which disables the button rather than
         * drawing one that would throw.
         */
        projectHost?: ProjectHost | null | undefined;
    }>(),
    {},
);

const emit = defineEmits<{
    /** Open the settings surface, optionally at a named anchor. */
    openSettings: [anchor: "github-account" | "java-runtime" | null];
    /** A repository's project was just adopted onto this computer. */
    adopted: [worldPath: string];
}>();

const { t } = useI18n();

const bridge = props.bridge === undefined ? resolveWorldRepoBridge() : props.bridge;
const repoBridge = props.repoBridge === undefined ? resolveBackupBridge() : props.repoBridge;
const projectHost = props.projectHost === undefined ? useProjectHost() : props.projectHost;
const wr = createWorldRepo(bridge);
const accountsList = createGhCliAccountsStore({ bridge: props.accountsBridge ?? null });

/* -------------------------------------------------------------------------- */
/* Which world, and where                                                     */
/* -------------------------------------------------------------------------- */

const worldPath = ref("");
const owner = ref("");
const repo = ref("");
const branch = ref(DEFAULT_WORLD_BRANCH);
const acknowledge = ref(false);
const selectedAccountId = ref<string | null>(null);
const accountsLoaded = ref(false);
const accountOrdered = computed(() =>
    [...accountsList.accounts.value].sort((left, right) =>
        `${left.login}\0${left.host}`.localeCompare(`${right.login}\0${right.host}`),
    ),
);
const effectiveAccountId = computed<string | undefined>(
    () => selectedAccountId.value ?? defaultGhCliAccountId(accountOrdered.value) ?? undefined,
);
const accountItems = computed(() =>
    accountOrdered.value.map((account) => {
        const label = `${account.login} — ${account.host}`;
        const recovery = account.healthy
            ? null
            : t("worldrepo.account.reauthenticationRequired", "reauthentication required");
        return {
            title: `${label}${account.active ? " (active)" : ""}${recovery === null ? "" : ` — ${recovery}`}`,
            value: account.id,
            searchText: [account.login, account.host, ...account.scopes, recovery ?? "", account.stateDetail ?? ""].join(" "),
            props: { disabled: !account.healthy },
        };
    }),
);
const ownerItems = computed(() =>
    wr.owners.value.map((entry) => ({
        title:
            entry.kind === "organization"
                ? t("worldrepo.owner.organization", { login: entry.login }, "{login} (organization)")
                : t("worldrepo.owner.personal", { login: entry.login }, "{login} (personal)"),
        value: entry.login,
        searchText: `${entry.login} ${entry.kind}`,
    })),
);

function chooseOwner(value: unknown): void {
    if (typeof value !== "string") return;
    const choice = wr.owners.value.find((entry) => entry.login === value);
    if (choice === undefined) return;
    owner.value = choice.login;
    createOwnerKind.value = choice.kind;
}

function chooseRepository(value: unknown): void {
    if (typeof value !== "string") return;
    const choice = candidates.value.find((entry) => entry.fullName === value);
    if (choice === undefined) return;
    owner.value = choice.owner;
    repo.value = choice.name;
}

async function loadAccountScope(accountId = effectiveAccountId.value): Promise<void> {
    wr.clearPreflight();
    wr.owners.value = [];
    candidates.value = [];
    await Promise.all([wr.loadOwners(accountId), loadCandidates(accountId)]);
}

function chooseAccount(value: unknown): void {
    if (typeof value !== "string" || value === effectiveAccountId.value) return;
    selectedAccountId.value = value;
    owner.value = "";
    repo.value = "";
    acknowledge.value = false;
    void loadAccountScope(value);
}

async function check(): Promise<void> {
    acknowledge.value = false;
    await wr.check({
        ...(effectiveAccountId.value === undefined ? {} : { accountId: effectiveAccountId.value }),
        worldPath: worldPath.value.trim(),
        owner: owner.value.trim(),
        repo: repo.value.trim(),
        branch: branch.value.trim() || DEFAULT_WORLD_BRANCH,
    });
}

const ghState = computed<{ tone: "info" | "warning"; text: string } | null>(() => {
    const gh = wr.preflight.value?.gh;
    if (gh === undefined) return null;
    if (gh.availability === "ready") {
        return {
            tone: "info",
            text:
                gh.account === null
                    ? t("worldrepo.gh.ready", "The gh command-line tool is installed and signed in.")
                    : t(
                          "worldrepo.gh.readyAs",
                          { account: gh.account, host: gh.host ?? "github.com" },
                          "The gh command-line tool is signed in as {account} on {host}.",
                      ),
        };
    }
    return { tone: "warning", text: gh.message };
});

const blockedBecause = computed<string | null>(() => {
    if (!wr.available) return t("worldrepo.unsupported", "The desktop application is what keeps a world in a repository.");
    const report = wr.preflight.value;
    if (report === null) return t("worldrepo.blocked.check", "Check the repository first.");
    if (report.blockers.length > 0) return report.blockers[0] ?? null;
    if (!acknowledge.value) {
        return t(
            "worldrepo.blocked.acknowledge",
            "Confirm that you mean to sync this world, replacing whatever is on that branch.",
        );
    }
    return null;
});

async function sync(): Promise<void> {
    const result = await wr.sync({
        ...(effectiveAccountId.value === undefined ? {} : { accountId: effectiveAccountId.value }),
        worldPath: worldPath.value.trim(),
        owner: owner.value.trim(),
        repo: repo.value.trim(),
        branch: branch.value.trim() || DEFAULT_WORLD_BRANCH,
        acknowledgeSync: acknowledge.value,
    });
    if (result === null) return;
    if (!result.ok) {
        raiseNotice("error", result.failure.message);
        return;
    }
    raiseNotice(
        result.report.pushVerified ? "success" : "warning",
        result.report.pushVerified
            ? t("worldrepo.notice.synced", "This world was synced and the push was verified.")
            : t(
                  "worldrepo.notice.syncedUnverified",
                  "The push reported success, but GitHub does not yet show that commit on the branch.",
              ),
    );
    void wr.loadRecords();
}

/* -- creating a repository explicitly, beside checking an existing one ------ */

const createOwnerKind = ref<"user" | "organization">("user");
const createVisibility = ref<"public" | "private">("private");
const creatingRepo = ref(false);
const createRepoFailure = ref<string | null>(null);

const canCreateRepository = computed(() => typeof repoBridge?.createBackupRepository === "function");

const createBlockedBecause = computed<string | null>(() => {
    if (!canCreateRepository.value) {
        return t(
            "worldrepo.createRepo.unsupported",
            "This build cannot create a repository from here. Create one on GitHub directly, then check it above.",
        );
    }
    if (owner.value.trim() === "") return t("worldrepo.createRepo.blockedOwner", "Type an owner above before creating a repository.");
    if (repo.value.trim() === "") return t("worldrepo.createRepo.blockedName", "Type a repository name above before creating it.");
    if (creatingRepo.value) return t("worldrepo.createRepo.blockedCreating", "Already creating.");
    return null;
});

async function createRepo(): Promise<void> {
    if (createBlockedBecause.value !== null || repoBridge?.createBackupRepository === undefined) return;
    creatingRepo.value = true;
    createRepoFailure.value = null;
    try {
        const answer = await repoBridge.createBackupRepository({
            ...(effectiveAccountId.value === undefined ? {} : { accountId: effectiveAccountId.value }),
            ownerLogin: owner.value.trim(),
            ownerKind: createOwnerKind.value,
            name: repo.value.trim(),
            private: createVisibility.value === "private",
        });
        if (!answer.ok) {
            createRepoFailure.value = answer.message;
            return;
        }
        owner.value = answer.value.owner;
        repo.value = answer.value.name;
        await check();
    } finally {
        creatingRepo.value = false;
    }
}

/* -------------------------------------------------------------------------- */
/* Worlds this computer is tracking, searchable and with bulk actions         */
/* -------------------------------------------------------------------------- */

const recordsQuery = ref("");
const recordsRegex = ref(false);
const recordsFlags = ref("i");

function recordKey(record: WorldRepoRecord): string {
    return targetKey(record.owner, record.repo, record.branch);
}

function recordText(record: WorldRepoRecord): string {
    return `${record.owner}/${record.repo} ${record.branch}`;
}

const shownRecords = computed(() => {
    const matcher = createSettingMatcher(recordsQuery.value, recordsRegex.value, recordsFlags.value);
    return wr.records.value.filter((record) => matcher.test(recordText(record)));
});

const recordsSample = computed(() => wr.records.value.map(recordText).join("\n"));
const recordsSummary = computed(() =>
    t(
        "worldrepo.records.summary",
        { shown: shownRecords.value.length, total: wr.records.value.length },
        "Showing {shown} of {total}",
    ),
);

const chosenKeys = ref<readonly string[]>([]);

function isChosen(record: WorldRepoRecord): boolean {
    return chosenKeys.value.includes(recordKey(record));
}

function toggleChosen(record: WorldRepoRecord): void {
    const key = recordKey(record);
    chosenKeys.value = isChosen(record) ? chosenKeys.value.filter((entry) => entry !== key) : [...chosenKeys.value, key];
}

function selectAllShown(): void {
    chosenKeys.value = shownRecords.value.map(recordKey);
}

function selectNone(): void {
    chosenKeys.value = [];
}

const chosenRecords = computed(() => wr.records.value.filter((record) => chosenKeys.value.includes(recordKey(record))));

function targetOf(record: WorldRepoRecord): WorldRepoTarget {
    return {
        ...(record.accountId === null ? {} : { accountId: record.accountId }),
        worldPath: record.worldPath,
        owner: record.owner,
        repo: record.repo,
        branch: record.branch,
    };
}

async function removeOne(record: WorldRepoRecord): Promise<void> {
    const ok = await wr.remove(targetOf(record));
    raiseNotice(
        ok ? "success" : "error",
        ok
            ? t(
                  "worldrepo.notice.removed",
                  "Stopped tracking this world. Its branch was deleted; the world folder on this computer was not touched.",
              )
            : (wr.removeFailure.value ?? t("worldrepo.notice.removeFailed", "This world could not be stopped from being tracked.")),
    );
}

async function removeChosen(): Promise<void> {
    const targets = chosenRecords.value;
    chosenKeys.value = [];
    let okCount = 0;
    for (const record of targets) {
        // eslint-disable-next-line no-await-in-loop -- each removal is its own GitHub call; running them serially is the honest cost of a bulk destructive action, not an oversight.
        if (await wr.remove(targetOf(record))) okCount += 1;
    }
    raiseNotice(
        okCount === targets.length ? "success" : "warning",
        t(
            "worldrepo.notice.bulkRemoved",
            { done: okCount, total: targets.length },
            "Stopped tracking {done} of {total} worlds.",
        ),
    );
}

async function resumeOne(record: WorldRepoRecord): Promise<void> {
    const result = await wr.resume(targetOf(record));
    if (result === null) return;
    raiseNotice(result.ok ? "info" : "error", result.ok ? t("worldrepo.notice.resumed", "The interrupted sync is continuing.") : result.failure.message);
}

function copyRepoUrl(record: WorldRepoRecord): void {
    if (record.repositoryUrl === null) return;
    void navigator.clipboard?.writeText(record.repositoryUrl);
    raiseNotice("info", t("worldrepo.notice.copied", "The repository address was copied."));
}

function appearanceIdOfRecord(record: WorldRepoRecord): string {
    return `worldrepo.record.${recordKey(record)}`;
}

function appearanceIdOfRow(row: WorldRepoRow): string {
    return `worldrepo.row.${row.key}`;
}

/* -------------------------------------------------------------------------- */
/* Adoption: which repositories look like ones this application prepared      */
/* -------------------------------------------------------------------------- */

const canListCandidates = computed(() => typeof repoBridge?.listBackupRepositories === "function");
const candidates = ref<readonly RepositoryChoice[]>([]);
const candidatesFailure = ref<string | null>(null);
const loadingCandidates = ref(false);
let candidatesLoadToken = 0;
const adoptBranch = ref(DEFAULT_WORLD_BRANCH);

async function loadCandidates(accountId = effectiveAccountId.value): Promise<void> {
    if (repoBridge === null || repoBridge === undefined) return;
    const token = ++candidatesLoadToken;
    loadingCandidates.value = true;
    candidates.value = [];
    candidatesFailure.value = null;
    try {
        const answer = await repoBridge.listBackupRepositories(accountId);
        if (token !== candidatesLoadToken) return;
        if (answer.ok) candidates.value = answer.value;
        else candidatesFailure.value = answer.message;
    } catch (error) {
        if (token === candidatesLoadToken) {
            candidatesFailure.value = error instanceof Error ? error.message : String(error);
        }
    } finally {
        if (token === candidatesLoadToken) loadingCandidates.value = false;
    }
}

const candidateQuery = ref("");
const candidateRegex = ref(false);
const candidateFlags = ref("i");

const shownCandidates = computed(() => {
    const matcher = createSettingMatcher(candidateQuery.value, candidateRegex.value, candidateFlags.value);
    return candidates.value.filter((candidate) => matcher.test(candidate.fullName));
});

const candidateSample = computed(() => candidates.value.map((candidate) => candidate.fullName).join("\n"));

const chosenCandidates = ref<readonly string[]>([]);

function isCandidateChosen(candidate: RepositoryChoice): boolean {
    return chosenCandidates.value.includes(candidate.fullName);
}

function toggleCandidate(candidate: RepositoryChoice): void {
    chosenCandidates.value = isCandidateChosen(candidate)
        ? chosenCandidates.value.filter((entry) => entry !== candidate.fullName)
        : [...chosenCandidates.value, candidate.fullName];
}

function selectAllShownCandidates(): void {
    chosenCandidates.value = shownCandidates.value.map((candidate) => candidate.fullName);
}

function selectNoCandidates(): void {
    chosenCandidates.value = [];
}

async function probeChosen(): Promise<void> {
    const chosen = candidates.value.filter((candidate) => chosenCandidates.value.includes(candidate.fullName));
    const list: readonly WorldRepoAdoptionCandidate[] = chosen.length > 0 ? chosen.map((c) => ({ owner: c.owner, repo: c.name })) : shownCandidates.value.map((c) => ({ owner: c.owner, repo: c.name }));
    await wr.probeAdoption(
        list,
        adoptBranch.value.trim() || DEFAULT_WORLD_BRANCH,
        effectiveAccountId.value,
    );
}

const STATUS_TONE: Record<WorldRepoAdoptionStatus, "success" | "warning" | "default" | "info"> = {
    prepared: "success",
    "prepared-newer-version": "success",
    "not-prepared": "default",
    "not-checked": "default",
    unknown: "warning",
};

/**
 * Every call written out literally, one per status, rather than a dictionary lookup keyed by
 * a variable. `catalogueCoverage.test.ts`'s own `CALL_TO_T` scanner - and `appCopy.test.ts`'s
 * "every catalogue key has a call site" guard - both read the source text for a literal,
 * quoted first argument to a `t` call; a computed key such as a lookup table indexed by
 * `status` is invisible to both, which is precisely how these five keys would end up looking
 * unused and untranslatable at once. Five literal calls cost nothing and stay visible to
 * every guard in the package.
 */
function statusLabel(status: WorldRepoAdoptionStatus): string {
    switch (status) {
        case "prepared":
            return t("worldrepo.status.prepared", "Looks like yours");
        case "prepared-newer-version":
            return t("worldrepo.status.preparedNewer", "Looks like yours (newer version)");
        case "not-prepared":
            return t("worldrepo.status.notPrepared", "Not one of yours");
        case "not-checked":
            return t("worldrepo.status.notChecked", "Not checked");
        case "unknown":
            return t("worldrepo.status.unknown", "Could not tell");
    }
}

function canView(signal: WorldRepoAdoptionSignal): boolean {
    return signal.status === "prepared" || signal.status === "prepared-newer-version";
}

async function viewPlan(signal: WorldRepoAdoptionSignal): Promise<void> {
    const [signalOwner, signalRepo] = signal.fullName.split("/");
    if (signalOwner === undefined || signalRepo === undefined) return;
    adoptWorldPath.value = "";
    await wr.planAdoption(signalOwner, signalRepo, signal.branch, effectiveAccountId.value);
}

/* -- the plan: what would be restored, and adopting it ---------------------- */

const adoptWorldPath = ref("");
const adopting = ref(false);

const ATTENTION_ICON: Record<string, string> = {
    "world-folder": mdiFolderSearchOutline,
    dependencies: mdiDatabaseSearchOutline,
    "remote-host": mdiCloudSyncOutline,
    "output-folder": mdiSourceRepository,
    "linked-world": mdiSourceRepository,
};

async function adoptPlan(): Promise<void> {
    const current = wr.plan.value;
    if (current === null || !current.ok || projectHost === null) return;
    if (adoptWorldPath.value.trim() === "") return;
    adopting.value = true;
    try {
        const result = await projectHost.writeProject(adoptWorldPath.value.trim(), current.project as unknown as ProjectFile);
        if (result.ok) {
            raiseNotice(
                "success",
                t(
                    "worldrepo.adopt.notice.adopted",
                    { name: current.restoring.projectName },
                    "“{name}” was adopted onto this computer.",
                ),
            );
            emit("adopted", adoptWorldPath.value.trim());
            wr.clearPlan();
        } else {
            raiseNotice("error", t("worldrepo.adopt.notice.adoptFailed", "This project could not be written to that world folder."));
        }
    } finally {
        adopting.value = false;
    }
}

/**
 * False once this screen has gone, so a round trip that outlives it stops rather than
 * writing into a component nobody is looking at.
 *
 * The account load below is a real network round trip and a person can navigate away
 * during it. Unguarded, its continuation ran after teardown and reached `t()` with no
 * `window` left to resolve a message format against, which surfaces as an unhandled
 * rejection with no failing test beside it: every assertion passes and the run still exits
 * non-zero. It only shows up under load, which is the worst way for a defect to announce
 * itself.
 */
let live = true;

onMounted(() => {
    if (bridge !== null) {
        void wr.loadRecords();
    }
    if (accountsList.canList) {
        void accountsList.load().then(() => {
            if (!live) return;
            accountsLoaded.value = true;
            void loadAccountScope();
        });
    } else {
        accountsLoaded.value = true;
        void loadAccountScope();
    }
});

onBeforeUnmount(() => {
    live = false;
    wr.dispose();
});

defineExpose({ wr, worldPath, owner, repo, branch, check, sync, createRepo, chosenKeys, candidates, chosenCandidates, probeChosen, viewPlan, adoptPlan, adoptWorldPath });
</script>

<template>
    <AppearanceTarget id="worldrepo.page" :label="t('worldrepo.title', 'Keep a world in a git repository')" as="div" class="mb-worldrepo" data-tutorial-anchor="worldrepo">
        <VCard variant="tonal" class="mb-4">
            <VCardTitle>{{ t("worldrepo.title", "Keep a world in a git repository") }}</VCardTitle>
            <VCardText>
                <p>
                    {{
                        t(
                            "worldrepo.pitch",
                            "A world does not have to be zipped and re-uploaded whole every time it changes. Kept in a git repository, it updates incrementally: only the region files that actually changed are ever pushed, the same way this application already keeps its own releases up to date.",
                        )
                    }}
                </p>
                <p class="mt-2 text-medium-emphasis">
                    {{
                        t(
                            "worldrepo.caveats",
                            "GitHub refuses any single file over 100 MB outright, and gets noticeably slower well past 1 GB. A live server's world folder is being written to while a sync reads it, so a region file mid-save can be caught torn; turning auto-save off first avoids that.",
                        )
                    }}
                </p>
            </VCardText>
        </VCard>

        <VAlert v-if="!wr.available" type="info" variant="tonal" class="mb-4" data-test="unsupported">
            {{ t("worldrepo.unsupported", "The desktop application is what keeps a world in a repository.") }}
        </VAlert>

        <template v-else>
            <!-- Which world, and where --------------------------------------- -->
            <VCard class="mb-4">
                <VCardTitle>{{ t("worldrepo.section.where", "Which world, and where") }}</VCardTitle>
                <VCardText>
                    <PathField
                        v-model="worldPath"
                        field="world folder"
                        semantic="folder"
                        :label="t('worldrepo.field.worldPath', 'World folder')"
                    />

                    <GhEntityPicker
                        v-if="accountsLoaded && accountItems.length > 0"
                        :items="accountItems"
                        :model-value="effectiveAccountId"
                        :search-label="t('worldrepo.account.search', 'Search signed-in accounts')"
                        :select-label="t('worldrepo.account.pick', 'Sync as')"
                        :selected-label="t('worldrepo.account.selected', 'Selected account')"
                        :empty-message="t('worldrepo.account.empty', 'No GitHub CLI accounts are signed in.')"
                        :no-match-message="t('worldrepo.account.noMatch', 'No signed-in account matches that search.')"
                        :hint="t('worldrepo.account.help', 'The selected GitHub CLI account drives every owner, repository, preflight, sync, removal, and adoption request without exposing its credential. Another gh process can still change that machine-wide account between commands, so avoid running gh account changes while this operation is active.')"
                        class="mt-2"
                        data-test-base="worldrepo-account-picker"
                        @update:model-value="chooseAccount"
                    />

                    <GhEntityPicker
                        v-if="ownerItems.length > 0"
                        :items="ownerItems"
                        :model-value="owner || null"
                        :search-label="t('worldrepo.owner.search', 'Search personal and writable organization owners')"
                        :select-label="t('worldrepo.field.owner', 'Repository owner')"
                        :selected-label="t('worldrepo.owner.selected', 'Selected owner')"
                        :empty-message="t('worldrepo.owner.empty', 'No writable owners were returned by GitHub CLI.')"
                        :no-match-message="t('worldrepo.owner.noMatch', 'No real owner matches that search.')"
                        :hint="t('worldrepo.owner.help', 'Organizations appear only when GitHub confirms that the selected account may create repositories there.')"
                        class="mt-2"
                        data-test-base="worldrepo-owner-picker"
                        @update:model-value="chooseOwner"
                    />

                    <GhEntityPicker
                        v-if="candidates.length > 0"
                        :items="candidates.map((entry) => ({ title: entry.fullName, value: entry.fullName, searchText: `${entry.owner} ${entry.name} ${entry.private ? 'private' : 'public'}` }))"
                        :model-value="owner && repo ? `${owner}/${repo}` : null"
                        :search-label="t('worldrepo.repo.search', 'Search writable repositories')"
                        :select-label="t('worldrepo.repo.pick', 'Choose an existing repository')"
                        :selected-label="t('worldrepo.repo.selected', 'Selected repository')"
                        :empty-message="t('worldrepo.repo.empty', 'No writable repositories were returned by GitHub CLI.')"
                        :no-match-message="t('worldrepo.repo.noMatch', 'No real repository matches that search.')"
                        :hint="t('worldrepo.repo.help', 'Up to 300 real writable repositories returned for the selected GitHub CLI account.')"
                        class="mt-2"
                        data-test-base="worldrepo-repository-picker"
                        @update:model-value="chooseRepository"
                    />

                    <div class="d-flex ga-2 flex-wrap mt-2">
                        <VTextField v-model="owner" :label="t('worldrepo.field.owner', 'Repository owner')" density="compact" />
                        <VTextField v-model="repo" :label="t('worldrepo.field.repo', 'Repository name')" density="compact" />
                        <VTextField v-model="branch" :label="t('worldrepo.field.branch', 'Branch')" density="compact" />
                    </div>

                    <VBtn :prepend-icon="mdiRefresh" :loading="wr.checking.value" variant="tonal" class="mt-2" data-test="check" @click="check">
                        {{ t("worldrepo.check", "Check before anything is pushed") }}
                    </VBtn>
                    <VAlert v-if="wr.preflightFailure.value !== null" type="error" variant="tonal" class="mt-3" data-test="preflight-failure">
                        {{ wr.preflightFailure.value }}
                    </VAlert>

                    <!--
                        The explicit create action, beside checking - never behind syncing.
                        Reuses the exact same "create a repository" capability
                        BackupScreen.vue offers, so a person presses a button that says it
                        creates a repository rather than discovering that Sync did.
                    -->
                    <VCard variant="tonal" class="mt-4 pa-3" data-test="create-repo">
                        <p class="text-medium-emphasis mb-2">
                            {{
                                t(
                                    "worldrepo.createRepo.lead",
                                    "Nothing there yet? Create a brand-new repository with the owner and name above.",
                                )
                            }}
                        </p>
                        <VRadioGroup v-model="createOwnerKind" inline density="compact" hide-details class="mb-2" :label="t('worldrepo.createRepo.ownerKind', 'The owner above is')">
                            <VRadio :label="t('worldrepo.createRepo.ownerKind.user', 'my own account')" value="user" />
                            <VRadio :label="t('worldrepo.createRepo.ownerKind.org', 'an organization I belong to')" value="organization" />
                        </VRadioGroup>
                        <VRadioGroup v-model="createVisibility" inline density="compact" hide-details class="mb-2" :label="t('worldrepo.createRepo.visibility', 'Visibility')">
                            <VRadio :label="t('worldrepo.createRepo.visibility.private', 'Private')" value="private" />
                            <VRadio :label="t('worldrepo.createRepo.visibility.public', 'Public')" value="public" />
                        </VRadioGroup>
                        <VBtn
                            :prepend-icon="mdiPlus"
                            :disabled="createBlockedBecause !== null"
                            :title="createBlockedBecause ?? undefined"
                            :loading="creatingRepo"
                            variant="tonal"
                            color="primary"
                            data-test="create-repo-button"
                            @click="createRepo"
                        >
                            {{ t("worldrepo.createRepo.button", "Create this repository") }}
                        </VBtn>
                        <p v-if="createBlockedBecause !== null" class="text-medium-emphasis mt-2" data-test="create-repo-blocked">
                            {{ createBlockedBecause }}
                        </p>
                        <VAlert v-if="createRepoFailure !== null" type="warning" variant="tonal" class="mt-2" data-test="create-repo-failure">
                            {{ createRepoFailure }}
                        </VAlert>
                    </VCard>
                </VCardText>
            </VCard>

            <!-- What this would do --------------------------------------------- -->
            <VCard v-if="wr.preflight.value !== null" class="mb-4">
                <VCardTitle>{{ t("worldrepo.section.report", "What this would do") }}</VCardTitle>
                <VCardText>
                    <VAlert v-if="ghState !== null" :type="ghState.tone" variant="tonal" class="mb-3" data-test="gh">
                        {{ ghState.text }}
                    </VAlert>

                    <p data-test="size-line">{{ sizeLine(wr.preflight.value.world, t) }}</p>

                    <VAlert v-for="blocker in wr.preflight.value.blockers" :key="blocker" type="error" variant="tonal" class="mt-3" data-test="blocker">
                        {{ blocker }}
                    </VAlert>
                    <VAlert v-for="warning in wr.preflight.value.warnings" :key="warning" type="warning" variant="tonal" class="mt-3" data-test="warning">
                        {{ warning }}
                    </VAlert>

                    <VCheckbox
                        v-model="acknowledge"
                        density="compact"
                        data-test="acknowledge"
                        :label="t('worldrepo.ack', 'I understand this pushes the whole world and replaces whatever is on that branch.')"
                    />

                    <VBtn :prepend-icon="mdiCloudSyncOutline" :disabled="blockedBecause !== null" :loading="wr.starting.value" color="primary" data-test="sync" @click="sync">
                        {{ t("worldrepo.sync", "Sync this world") }}
                    </VBtn>
                    <p v-if="blockedBecause !== null" class="text-medium-emphasis mt-2" data-test="blocked">{{ blockedBecause }}</p>
                </VCardText>
            </VCard>

            <VAlert v-if="wr.startFailure.value !== null" type="error" variant="tonal" class="mb-4" data-test="start-failure">
                {{ wr.startFailure.value.message }}
                <VBtn
                    v-if="wr.startFailure.value.needsGhSignIn"
                    class="mt-2"
                    variant="text"
                    data-test="reauthenticate"
                    @click="emit('openSettings', 'github-account')"
                >
                    {{ t("worldrepo.gh.reauthenticate", "Reauthenticate this GitHub CLI account") }}
                </VBtn>
            </VAlert>

            <!-- What is happening right now, with real numbers rather than a spinner. -->
            <AppearanceTarget
                v-for="row in wr.rows.value"
                :id="appearanceIdOfRow(row)"
                :key="row.key"
                :label="row.target"
                as="div"
                class="mb-4"
                data-test="row"
            >
                <VCard>
                    <!--
                        `owner/repo#branch` is typed by whoever set this sync up, and GitHub
                        alone allows a 39-character owner plus a 100-character repo name -
                        long before bilingual mode doubles it again. `VCardTitle` defaults to
                        `overflow: hidden; white-space: nowrap; text-overflow: ellipsis`, and
                        with this row's own `d-flex` turning it into a flex container that
                        ellipsis never actually paints (text-overflow has no effect on a flex
                        formatting context), so the target and the state chip were silently
                        clipped at the card edge with no visible cue anything was missing.
                        `mb-worldrepo-row__title` wins on specificity (a scoped class beats
                        Vuetify's bare `.v-card-title`) and lets the row wrap instead.
                    -->
                    <VCardTitle class="d-flex align-center ga-2 mb-worldrepo-row__title mb-responsive-card-title">
                        <span class="mb-worldrepo-row__name mb-responsive-card-title__text">{{ row.target }}</span>
                        <VChip class="mb-responsive-card-title__meta" size="small" data-test="row-state">{{ row.state }}</VChip>
                        <VProgressCircular v-if="row.state === 'syncing'" indeterminate size="18" />
                    </VCardTitle>
                    <VCardText>
                        <p data-test="row-phase">{{ phaseLabel(row.phase, t) }}</p>
                        <template v-if="row.progress !== null">
                            <VProgressLinear :model-value="row.progress.percent" class="my-2" data-test="progress-bar" />
                            <p class="text-medium-emphasis" data-test="progress">
                                {{ row.progress.description }} -
                                {{ row.progress.unit === "bytes" ? formatBytes(row.progress.done, t) : row.progress.done }} /
                                {{ row.progress.unit === "bytes" ? formatBytes(row.progress.total, t) : row.progress.total }}
                                <span v-if="row.progress.batch !== null && row.progress.batches !== null">
                                    - {{ t("worldrepo.progress.batch", { batch: row.progress.batch, batches: row.progress.batches }, "Batch {batch} / {batches}") }}
                                </span>
                            </p>
                        </template>
                        <VAlert v-if="row.failure !== null" type="error" variant="tonal" class="mt-3" data-test="row-failure">
                            <p>{{ row.failure.message }}</p>
                            <pre v-if="row.failure.detail !== null" class="mb-worldrepo-detail">{{ row.failure.detail }}</pre>
                        </VAlert>
                        <VBtn v-if="row.state === 'syncing'" size="small" variant="text" :loading="row.stopping" data-test="cancel" @click="wr.cancelSync(row.key)">
                            {{ t("worldrepo.cancel", "Stop syncing") }}
                        </VBtn>
                    </VCardText>
                </VCard>
            </AppearanceTarget>

            <!-- Worlds this computer is tracking -------------------------------- -->
            <VCard class="mb-4" data-test="tracking">
                <VCardTitle>{{ t("worldrepo.section.tracking", "Worlds this computer is tracking") }}</VCardTitle>
                <VCardText>
                    <p v-if="wr.records.value.length === 0" class="text-medium-emphasis" data-test="records-empty">
                        {{
                            t(
                                "worldrepo.records.empty",
                                "Nothing has been synced from this computer yet. Once a world above is pushed, it appears here so it can be found again, resumed if interrupted, or stopped.",
                            )
                        }}
                    </p>
                    <template v-else>
                        <ConfigSearchField
                            v-model="recordsQuery"
                            v-model:regex="recordsRegex"
                            v-model:flags="recordsFlags"
                            :label="t('worldrepo.records.search', 'Search tracked worlds')"
                            :sample="recordsSample"
                            :summary="recordsSummary"
                            density="compact"
                        />

                        <div class="d-flex ga-2 flex-wrap align-center my-2" role="group" :aria-label="t('worldrepo.records.bulkLabel', 'Actions on the chosen worlds')">
                            <VBtn :prepend-icon="mdiSelectAll" variant="text" size="small" :disabled="shownRecords.length === 0" @click="selectAllShown">
                                {{ t("worldrepo.selectShown", { shown: shownRecords.length }, "Select the {shown} shown") }}
                            </VBtn>
                            <VBtn :prepend-icon="mdiSelectOff" variant="text" size="small" :disabled="chosenKeys.length === 0" @click="selectNone">
                                {{ t("worldrepo.selectNone", "Clear the selection") }}
                            </VBtn>
                            <ConfigSuperConfirm
                                :title="t('worldrepo.bulkStop.title', 'Stop tracking these worlds')"
                                :action="
                                    t(
                                        'worldrepo.bulkStop.action',
                                        { chosen: chosenKeys.length },
                                        'The branch this application made is deleted for {chosen} world(s). The world folder on this computer is never touched.',
                                    )
                                "
                                :affected="chosenRecords.map((record) => `${record.owner}/${record.repo} (${record.branch})`)"
                                :confirm-label="t('worldrepo.bulkStopTracking', { chosen: chosenKeys.length }, 'Stop tracking {chosen}')"
                                :disabled="chosenKeys.length === 0"
                                @confirm="removeChosen"
                            >
                                <template #activator="{ props: activatorProps }">
                                    <VBtn v-bind="activatorProps" :prepend-icon="mdiDeleteSweepOutline" size="small" variant="text" color="error" :disabled="chosenKeys.length === 0" data-test="bulk-stop">
                                        {{ t("worldrepo.bulkStopTracking", { chosen: chosenKeys.length }, "Stop tracking {chosen}") }}
                                    </VBtn>
                                </template>
                            </ConfigSuperConfirm>
                        </div>

                        <p v-if="shownRecords.length === 0" class="text-medium-emphasis" data-test="records-no-match">
                            {{ t("worldrepo.records.noMatch", "Nothing here matches that search. Clearing it brings the whole list back; nothing was removed.") }}
                        </p>

                        <AppearanceTarget
                            v-for="record in shownRecords"
                            :id="appearanceIdOfRecord(record)"
                            :key="recordKey(record)"
                            :label="`${record.owner}/${record.repo}`"
                            as="div"
                            class="mb-worldrepo-record"
                            data-test="record"
                        >
                            <div class="d-flex align-center ga-2 flex-wrap">
                                <VCheckboxBtn
                                    :model-value="isChosen(record)"
                                    :aria-label="t('worldrepo.records.choose', { name: `${record.owner}/${record.repo}` }, 'Choose {name}')"
                                    density="compact"
                                    hide-details
                                    @update:model-value="toggleChosen(record)"
                                />
                                <span>{{ record.owner }}/{{ record.repo }}</span>
                                <span class="text-medium-emphasis">{{ record.branch }}</span>
                                <VChip v-if="!record.pushVerified" size="x-small" color="warning" variant="flat">
                                    {{ t("worldrepo.records.unverified", "push unverified") }}
                                </VChip>
                                <VChip v-if="record.stage !== 'finished'" size="x-small" color="warning" variant="flat" data-test="record-interrupted">
                                    {{ t("worldrepo.records.interrupted", { stage: record.stage }, "stopped during {stage}") }}
                                </VChip>
                            </div>
                            <p class="text-medium-emphasis mt-1">
                                {{ formatBytes(record.bytes, t) }} - {{ record.fileCount }} - {{ record.syncedAt }}
                            </p>
                            <div class="d-flex ga-2 flex-wrap mt-1">
                                <VBtn v-if="record.stage !== 'finished'" :prepend-icon="mdiRefresh" size="small" variant="tonal" data-test="record-resume" @click="resumeOne(record)">
                                    {{ t("worldrepo.resume", "Continue this sync") }}
                                </VBtn>
                                <VBtn v-if="record.repositoryUrl !== null" :prepend-icon="mdiContentCopy" size="small" variant="text" @click="copyRepoUrl(record)">
                                    {{ t("worldrepo.copy", "Copy the repository address") }}
                                </VBtn>
                                <ConfigSuperConfirm
                                    :title="t('worldrepo.stop.title', 'Stop tracking this world')"
                                    :action="
                                        t(
                                            'worldrepo.stop.action',
                                            { owner: record.owner, repo: record.repo, branch: record.branch },
                                            'The {branch} branch of {owner}/{repo} that this application made is deleted. The world folder on this computer is never touched, and neither is anything else in that repository.',
                                        )
                                    "
                                    :affected="[`${record.owner}/${record.repo} (${record.branch})`]"
                                    :confirm-label="t('worldrepo.stopTracking', 'Stop tracking')"
                                    @confirm="removeOne(record)"
                                >
                                    <template #activator="{ props: activatorProps }">
                                        <VBtn v-bind="activatorProps" :prepend-icon="mdiStop" size="small" variant="text" color="error" data-test="record-stop">
                                            {{ t("worldrepo.stopTracking", "Stop tracking") }}
                                        </VBtn>
                                    </template>
                                </ConfigSuperConfirm>
                            </div>

                            <template #menu="{ close }">
                                <VList density="compact" :aria-label="t('worldrepo.records.rowMenuLabel', 'What this tracked world can do')">
                                    <VListItem v-if="record.repositoryUrl !== null" :prepend-icon="mdiContentCopy" :title="t('worldrepo.copy', 'Copy the repository address')" @click="() => { close(); copyRepoUrl(record); }" />
                                    <VListItem v-if="record.stage !== 'finished'" :prepend-icon="mdiRefresh" :title="t('worldrepo.resume', 'Continue this sync')" @click="() => { close(); resumeOne(record); }" />
                                </VList>
                                <VDivider class="my-1" />
                            </template>
                        </AppearanceTarget>
                    </template>
                    <VAlert v-if="wr.removeFailure.value !== null" type="error" variant="tonal" class="mt-2" data-test="remove-failure">
                        {{ wr.removeFailure.value }}
                    </VAlert>
                </VCardText>
            </VCard>

            <!-- Adoption: a repository this application already prepared -------- -->
            <AppearanceTarget id="worldrepo.adoption" :label="t('worldrepo.section.adopt', 'Adopt a repository from another computer')" as="div" data-test="adoption">
                <VCard class="mb-4">
                    <VCardTitle>{{ t("worldrepo.section.adopt", "Adopt a repository from another computer") }}</VCardTitle>
                    <VCardText>
                        <p class="text-medium-emphasis">
                            {{
                                t(
                                    "worldrepo.adopt.pitch",
                                    "Set this up on one computer, then install the application on a second one, and its sign-in still sees every repository it can write to - which is not the same as knowing which one it already prepared. Checking a repository for this application's own marker answers that, without asserting more than the marker actually proves.",
                                )
                            }}
                        </p>

                        <VTextField v-model="adoptBranch" :label="t('worldrepo.field.branch', 'Branch')" density="compact" class="mt-2" style="max-inline-size: 240px" />

                        <p v-if="!canListCandidates" class="text-medium-emphasis mt-2" data-test="adopt-unsupported">
                            {{ t("worldrepo.adopt.unsupported", "This build cannot list your repositories to check. Type an owner and a repository name above and check it there instead.") }}
                        </p>
                        <template v-else>
                            <p v-if="loadingCandidates" class="text-medium-emphasis mt-2" role="status">{{ t("worldrepo.adopt.loading", "Reading your repositories...") }}</p>
                            <VAlert v-else-if="candidatesFailure !== null" type="warning" variant="tonal" class="mt-2">{{ candidatesFailure }}</VAlert>
                            <p v-else-if="candidates.length === 0" class="text-medium-emphasis mt-2" data-test="adopt-empty">
                                {{ t("worldrepo.adopt.empty", "This account has no repositories to check yet.") }}
                            </p>
                            <template v-else>
                                <ConfigSearchField
                                    v-model="candidateQuery"
                                    v-model:regex="candidateRegex"
                                    v-model:flags="candidateFlags"
                                    :label="t('worldrepo.adopt.search', 'Search your repositories')"
                                    :sample="candidateSample"
                                    density="compact"
                                    class="mt-2"
                                />
                                <p v-if="shownCandidates.length === 0" class="text-medium-emphasis mt-2" data-test="adopt-no-match">
                                    {{ t("worldrepo.adopt.noMatch", "Nothing here matches that search. Clearing it brings the whole list back.") }}
                                </p>
                                <template v-else>
                                    <div class="d-flex ga-2 flex-wrap align-center my-2">
                                        <VBtn :prepend-icon="mdiSelectAll" variant="text" size="small" @click="selectAllShownCandidates">
                                            {{ t("worldrepo.selectShown", { shown: shownCandidates.length }, "Select the {shown} shown") }}
                                        </VBtn>
                                        <VBtn :prepend-icon="mdiSelectOff" variant="text" size="small" :disabled="chosenCandidates.length === 0" @click="selectNoCandidates">
                                            {{ t("worldrepo.selectNone", "Clear the selection") }}
                                        </VBtn>
                                        <VBtn :prepend-icon="mdiDatabaseSearchOutline" variant="tonal" size="small" :loading="wr.probing.value" data-test="adopt-check" @click="probeChosen">
                                            {{
                                                t(
                                                    "worldrepo.adopt.checkSelected",
                                                    { n: chosenCandidates.length > 0 ? chosenCandidates.length : shownCandidates.length },
                                                    "Check {n} repositories",
                                                )
                                            }}
                                        </VBtn>
                                    </div>

                                    <div v-for="candidate in shownCandidates" :key="candidate.fullName" class="d-flex align-center ga-2" data-test="candidate">
                                        <VCheckboxBtn
                                            :model-value="isCandidateChosen(candidate)"
                                            :aria-label="t('worldrepo.adopt.choose', { name: candidate.fullName }, 'Choose {name}')"
                                            density="compact"
                                            hide-details
                                            @update:model-value="toggleCandidate(candidate)"
                                        />
                                        <span>{{ candidate.fullName }}</span>
                                    </div>
                                </template>
                            </template>
                        </template>

                        <VAlert v-if="wr.probeFailure.value !== null" type="warning" variant="tonal" class="mt-3">{{ wr.probeFailure.value }}</VAlert>

                        <div v-if="wr.adoptionSignals.value.length > 0" class="mt-4" data-test="adoption-results">
                            <VDivider class="mb-3" />
                            <div v-for="signal in wr.adoptionSignals.value" :key="signal.fullName" class="mb-worldrepo-signal" data-test="signal">
                                <div class="d-flex align-center ga-2 flex-wrap">
                                    <VChip size="small" :color="STATUS_TONE[signal.status]">
                                        <VIcon v-if="signal.status === 'prepared' || signal.status === 'prepared-newer-version'" :icon="mdiCheckDecagram" start size="14" />
                                        {{ statusLabel(signal.status) }}
                                    </VChip>
                                    <span>{{ signal.fullName }}</span>
                                </div>
                                <p class="text-medium-emphasis mt-1">{{ signal.message }}</p>
                                <VBtn v-if="canView(signal)" :prepend-icon="mdiGithub" size="small" variant="tonal" class="mt-1" :loading="wr.planning.value" data-test="view-plan" @click="viewPlan(signal)">
                                    {{ t("worldrepo.adopt.viewPlan", "View what could be restored") }}
                                </VBtn>
                            </div>
                        </div>

                        <VAlert v-if="wr.planFailure.value !== null" type="warning" variant="tonal" class="mt-3">{{ wr.planFailure.value }}</VAlert>

                        <VCard v-if="wr.plan.value !== null" variant="tonal" class="mt-4 pa-3" data-test="plan">
                            <template v-if="wr.plan.value.ok">
                                <p class="text-h6">{{ wr.plan.value.restoring.projectName }}</p>
                                <p v-if="wr.plan.value.restoring.fromWizard" class="text-medium-emphasis">
                                    {{ t("worldrepo.adopt.plan.fromWizard", "Never opened past the guide on the old computer.") }}
                                </p>
                                <p class="mt-1">
                                    {{ t("worldrepo.adopt.plan.maps", "Maps") }}: {{ wr.plan.value.restoring.maps.map((m) => m.name).join(", ") || "-" }}
                                </p>
                                <p>{{ t("worldrepo.adopt.plan.storages", "Storages") }}: {{ wr.plan.value.restoring.storageIds.join(", ") || "-" }}</p>
                                <p v-if="wr.plan.value.restoring.renderNotes.length > 0">
                                    {{ t("worldrepo.adopt.plan.renderNotes", "Non-default render settings") }}: {{ wr.plan.value.restoring.renderNotes.join(", ") }}
                                </p>

                                <VAlert v-if="wr.plan.value.alreadyLocal !== null" type="info" variant="tonal" class="mt-3" data-test="already-local">
                                    {{
                                        t(
                                            "worldrepo.adopt.alreadyLocal",
                                            { worldPath: wr.plan.value.alreadyLocal.worldPath },
                                            "This computer already has a local project synced from this repository, at {worldPath}. Adopting it again would create a second, duplicate binding to the same remote target.",
                                        )
                                    }}
                                </VAlert>

                                <VDivider class="my-3" />
                                <p class="font-weight-medium">{{ t("worldrepo.adopt.needsAttention", "What will not cross over") }}</p>
                                <div v-for="item in wr.plan.value.needsAttention" :key="`${item.id}-${item.mapId ?? ''}`" class="mt-2" data-test="attention-item">
                                    <div class="d-flex ga-2">
                                        <VIcon :icon="ATTENTION_ICON[item.id] ?? mdiFolderSearchOutline" size="20" />
                                        <p class="text-medium-emphasis">{{ item.message }}</p>
                                    </div>
                                    <VBtn
                                        v-if="item.id === 'dependencies'"
                                        size="small"
                                        variant="text"
                                        :prepend-icon="mdiDatabaseSearchOutline"
                                        class="ms-8"
                                        data-test="attention-dependencies"
                                        @click="emit('openSettings', 'java-runtime')"
                                    >
                                        {{ t("worldrepo.adopt.openDependencies", "Check dependencies in Settings") }}
                                    </VBtn>
                                    <VBtn
                                        v-if="item.id === 'remote-host'"
                                        size="small"
                                        variant="text"
                                        :prepend-icon="mdiCloudSyncOutline"
                                        class="ms-8"
                                        data-test="attention-remote-host"
                                        @click="emit('openSettings', null)"
                                    >
                                        {{ t("worldrepo.adopt.openRemoteSettings", "Open Settings") }}
                                    </VBtn>
                                </div>

                                <PathField
                                    v-model="adoptWorldPath"
                                    field="world folder"
                                    semantic="folder"
                                    :label="t('worldrepo.adopt.worldFolder', 'World folder on this computer')"
                                    class="mt-3"
                                />

                                <VBtn
                                    :prepend-icon="mdiCheckDecagram"
                                    :disabled="adoptWorldPath.trim() === '' || projectHost === null"
                                    :loading="adopting"
                                    color="primary"
                                    class="mt-2"
                                    data-test="adopt-button"
                                    @click="adoptPlan"
                                >
                                    {{ t("worldrepo.adopt.adoptButton", "Adopt this repository") }}
                                </VBtn>
                                <p v-if="adoptWorldPath.trim() === ''" class="text-medium-emphasis mt-2">
                                    {{ t("worldrepo.adopt.chooseFolder", "Choose the world folder this project should be linked to on this computer first.") }}
                                </p>
                                <p v-else-if="projectHost === null" class="text-medium-emphasis mt-2">
                                    {{ t("worldrepo.unsupported", "The desktop application is what keeps a world in a repository.") }}
                                </p>
                            </template>
                            <template v-else>
                                <p>{{ wr.plan.value.message }}</p>
                            </template>
                        </VCard>
                    </VCardText>
                </VCard>
            </AppearanceTarget>
        </template>
    </AppearanceTarget>
</template>

<style scoped>
/*
 * Beats Vuetify's bare `.v-card-title` (overflow: hidden; white-space: nowrap;
 * text-overflow: ellipsis) on specificity: a scoped class compiles to
 * `.mb-worldrepo-row__title[data-v-xxxx]`, two selector components against the
 * framework rule's one, so it wins regardless of source order. `flex-wrap: wrap`
 * lets the state chip and spinner drop to their own line instead of being pushed
 * past the card edge and clipped by the overflow this rule turns off.
 */
.mb-worldrepo-row__title {
    overflow: visible;
    white-space: normal;
    flex-wrap: wrap;
    row-gap: 4px;
}

.mb-worldrepo-row__name {
    min-width: 0;
    overflow-wrap: anywhere;
}

.mb-worldrepo-record + .mb-worldrepo-record {
    margin-block-start: 16px;
    padding-block-start: 16px;
    border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.mb-worldrepo-signal + .mb-worldrepo-signal {
    margin-block-start: 12px;
    padding-block-start: 12px;
    border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.mb-worldrepo-detail {
    white-space: pre-wrap;
    overflow-x: auto;
    max-height: 12rem;
    font-size: 0.8125rem;
}
</style>
