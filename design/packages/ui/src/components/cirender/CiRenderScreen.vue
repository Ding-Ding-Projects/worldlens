<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCalendarSyncOutline,
    mdiCloudSyncOutline,
    mdiFileDocumentPlusOutline,
    mdiFolderSearchOutline,
    mdiOpenInNew,
    mdiRefresh,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VCheckbox,
    VChip,
    VProgressCircular,
    VProgressLinear,
    VSelect,
    VSwitch,
    VTextField,
} from "vuetify/components";
import ActionArtwork from "../actionArtwork/ActionArtwork.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import GhEntityPicker from "../github/GhEntityPicker.vue";
import { createGhCliAccountsStore, defaultGhCliAccountId } from "../github/ghCliAccountsStore.js";
import type { GhCliBridge } from "../github/ghCliBridge.js";
import {
    createProjectFromGeneratedDefaults,
    resolveProjectHost,
    worldLeaf,
    type ProjectHost,
} from "../project/index.js";
import MinecraftWorldList from "../world/MinecraftWorldList.vue";
import { resolveWorldCatalogBridge } from "../world/worldCatalog.js";
import type { WorldCatalogBridge } from "../world/worldCatalog.js";
import {
    createCiRenders,
    formatBytes,
    jobTone,
    phaseLabel,
    repoNameProblem,
    routeLabel,
    runLabel,
    uploadLine,
    waveSummaries,
    worldFolderName,
} from "./ciRenders.js";
import type { CiRow } from "./ciRenders.js";
import { resolveCiRenderBridge } from "./ciRenderBridge.js";
import type {
    CiBootstrapEvent,
    CiBootstrapFailureCode,
    CiBootstrapFileOutcome,
    CiBootstrapPhase,
    CiBootstrapReport,
    CiJobReport,
    CiRenderBridge,
    CiPreflight,
    CiScheduleCadence,
    CiScheduleCheckResultName,
} from "./ciRenderBridge.js";

/**
 * Having GitHub's runners render a world this computer cannot.
 *
 * ## What this screen is for, said out loud
 *
 * Rendering a large world is hours of CPU and gigabytes of disk. On a thin laptop that is
 * an afternoon of the fan at full speed and nothing else usable, and on some machines it
 * simply does not finish. A GitHub runner has four cores, fourteen gigabytes of free disk
 * and nothing else to do. This screen sends the world there and brings the map back.
 *
 * The trade-offs are on the screen too, not in a footnote. Uploading a multi-gigabyte
 * world takes hours on a domestic connection; a private repository's Actions minutes are
 * finite where a public repository's are not; and a world past a release asset's ceiling
 * cannot be dispatched at all. Advertising the upside without those is how somebody spends
 * an afternoon finding them out.
 *
 * ## Three things here are deliberate and read as omissions if they are not stated
 *
 * **Two consents, and neither is pre-ticked.** Uploading a world sends it to GitHub, and a
 * PUBLIC repository makes it downloadable by anybody - a world carries builds, coordinates
 * and whatever a friend left in a chest. The main process refuses without both, because a
 * guard that lives only in the renderer is not a guard.
 *
 * **Mojang's licence is not accepted here.** The workflow accepts it on the repository
 * owner's behalf, which is a real legal acceptance. This screen reports that it has not
 * been given and points at the settings row that already asks; there is no second tick box
 * for it anywhere in this feature.
 *
 * **Which GitHub credential is in play is shown before the button.** A machine typically
 * holds two - this application's sign-in and `gh`'s - and "permission denied" is
 * unactionable when a person cannot tell which one was refused.
 *
 * **More than one signed-in account, and picking one here never touches the others.** The
 * application can hold several GitHub accounts side by side
 * (the GitHub CLI account surface in Settings is where they are added and made active);
 * before this picker existed, every call this screen made - who could own the repository,
 * whether the world was uploaded before, the credential that actually dispatches the
 * workflow - resolved to whichever one was *active*, with no way to render as a different
 * signed-in account short of switching in Settings and back. "Render as" is a *local*
 * choice: picking a different stored account here re-reads the owner list for it and
 * carries its id through the check and the render, but it never calls the active-account
 * switch Settings uses. Downloads, backups and every other GitHub-authenticated feature
 * keep running on whichever account was already active, and leaving the picker untouched
 * behaves exactly as it always did.
 */
const props = withDefaults(
    defineProps<{
        /**
         * Injected in tests. Left out, the Electron bridge is probed, which is why this has
         * no default: `undefined` means probe, `null` means there is deliberately no bridge
         * and the unsupported state is what should be shown.
         */
        bridge?: CiRenderBridge | null | undefined;
        /** Worlds this machine already knows about, offered beside the folder field. */
        worlds?: readonly { folder: string; label: string }[] | undefined;
        /**
         * The world catalog's own bridge, handed down for tests exactly the way
         * `WorldFolderStep.vue` accepts one. Left out, `undefined` means probe the Electron
         * bridge itself; an explicit `null` means there is deliberately none.
         */
        catalogBridge?: WorldCatalogBridge | null | undefined;
        /**
         * The GitHub bridge behind the "Render as" account picker, injected in tests exactly
         * like `catalogBridge` above: `undefined` probes the Electron preload, an explicit
         * `null` means there is deliberately none and the picker never appears. Deliberately
         * a separate probe from `bridge` - the multi-account registry predates CI rendering
         * and belongs to `github/`, not to this screen, so it is fine for a build to carry
         * one bridge and not the other.
         */
        accountsBridge?: GhCliBridge | null | undefined;
        /**
         * What can write a project file into a world folder, behind "Set this world up with the
         * defaults". Probed exactly like the bridges above: `undefined` probes the Electron
         * preload, an explicit `null` means there is deliberately none and the button says so
         * rather than appearing and throwing when pressed.
         */
        projectHost?: ProjectHost | null | undefined;
        /** True when the shell can open settings at a row. */
        canOpenSettings?: boolean | undefined;
    }>(),
    { worlds: () => [], canOpenSettings: false },
);

const emit = defineEmits<{
    /** Open the GitHub sign-in row in settings. */
    signIn: [];
    /** Open the Mojang download consent row in settings. */
    openConsent: [];
    /** Open a URL in the system browser. */
    open: [url: string];
    /** A map arrived and was registered. The shell can select it in the map list. */
    rendered: [where: { renderId: string; dataRoot: string; mapId: string }];
}>();

const { t } = useI18n();

const bridge = props.bridge === undefined ? resolveCiRenderBridge() : props.bridge;
const renders = createCiRenders(bridge);

/**
 * Every GitHub CLI account this computer has stored, and which one is active - the exact same
 * store `GhCliAccountsList.vue` drives from Settings, reused rather than forked so this
 * screen never carries a second idea of what an "account" is. Read-only from here: this
 * screen calls `load()` to list accounts and reads the active row as the picker's default, but
 * never calls the machine-wide switch - see "Render as" below for why. A build carrying no accounts
 * namespace at all reports `canList: false` and the picker section simply never renders.
 */
const accountsList = createGhCliAccountsStore(
    props.accountsBridge === undefined ? {} : { bridge: props.accountsBridge },
);

const worldFolder = ref(props.worlds[0]?.folder ?? "");
const owner = ref("");
const repo = ref("");
const acknowledgeUpload = ref(false);
const acknowledgePublic = ref(false);

/* -------------------------------------------------------------------------- */
/* The world folder: a picker of what this machine already knows about,       */
/* a browse button, and free text that all three keep in step with each other */
/* -------------------------------------------------------------------------- */

/**
 * The world catalog's own bridge, probed exactly as `WorldFolderStep.vue` probes it: left
 * undefined it probes the Electron preload itself, and a build with none of it simply shows
 * no list, leaving the field, the browse button and typing it by hand untouched.
 */
const worldCatalogBridge = computed<WorldCatalogBridge | null>(() =>
    props.catalogBridge === undefined ? resolveWorldCatalogBridge() : props.catalogBridge,
);

/**
 * The shared folder-browse affordance, probed by hand rather than through `useConfigHost()`.
 *
 * This screen is not nested under `provideConfigHost()` the way the config editor is, and
 * `window.worldlens.dialog` asks nothing of its caller beyond existing - it is the
 * same "screen-agnostic path field" surface Settings and the remote target editor already
 * reach through. A build carrying none of it simply hides the Browse button; typing the
 * path, or choosing it from the list below, both still work.
 */
const dialogPickFolder = computed<
    ((options: { title: string; startIn?: string }) => Promise<string | null>) | null
>(() => {
    const host = (
        globalThis as {
            worldlens?: {
                dialog?: {
                    pickFolder?: (options: {
                        title: string;
                        startIn?: string;
                    }) => Promise<string | null>;
                };
            };
        }
    ).worldlens;
    const pick = host?.dialog?.pickFolder;
    return typeof pick === "function" ? pick : null;
});

/**
 * Why the Browse button is dead on this build, or null when it works.
 *
 * The same discipline `checkBlockedBecause` and `blockedBecause` hold their buttons to:
 * a disabled control in this card always says why, sighted or via a screen reader, rather
 * than a button that simply does nothing when clicked.
 */
const browseUnavailableBecause = computed<string | null>(() => {
    if (dialogPickFolder.value !== null) return null;
    return t(
        "cirender.field.world.browseUnavailable",
        "This build cannot open a folder picker. Type the world's path above, or choose it from the list below.",
    );
});

async function browseWorldFolder(): Promise<void> {
    const pick = dialogPickFolder.value;
    if (pick === null) return;
    const chosen = await pick({
        title: t(
            "cirender.field.world.browsePrompt",
            "Choose the world folder, the one that contains level.dat",
        ),
        ...(worldFolder.value.trim() === "" ? {} : { startIn: worldFolder.value.trim() }),
    });
    if (chosen === null) return;
    worldFolder.value = chosen;
    void applySuggestedRepoName(chosen);
}

/** A world picked from the list. Filled in exactly like a typed or browsed one. */
function chooseWorld(folder: string): void {
    worldFolder.value = folder;
    void applySuggestedRepoName(folder);
}

/**
 * Fills the repository name from the world's own folder name, once - never overwriting
 * something already typed.
 *
 * Checked again after the suggestion arrives, not only before asking for it: a person can
 * type a name into the field during the round trip, and that keystroke must win. The world
 * folder is checked too, not just the repo field: choosing world A and then world B before
 * A's round trip has returned leaves two requests in flight, and A's slower-or-faster return
 * must not overwrite the field with a name for a world that is no longer chosen.
 */
async function applySuggestedRepoName(folder: string): Promise<void> {
    if (repo.value.trim() !== "") return;
    const name = worldFolderName(folder);
    if (name === "") return;
    const suggestion = await renders.suggestRepoName(name);
    if (suggestion !== null && repo.value.trim() === "" && worldFolder.value === folder)
        repo.value = suggestion;
}

/* -------------------------------------------------------------------------- */
/* Render as: which signed-in account this render authenticates as, chosen    */
/* on this card and carried through the check and the dispatch - never the   */
/* application-wide active-account switch                                    */
/* -------------------------------------------------------------------------- */

/**
 * Which stored account this render runs as. Null means "whichever account is active",
 * which is the default nobody has to touch: every request this screen sends leaves
 * `accountId` out entirely while this stays null, so the main process resolves it exactly
 * the way it always did for a single-account build. Set only by {@link chooseAccount}.
 */
const selectedAccountId = ref<string | null>(null);

/**
 * True once the account list has answered at least once.
 *
 * The signed-out state below is only ever shown once this is true - the same rule
 * `renders.owners` already follows by starting `null` - so the picker never flashes
 * "nobody is signed in" for the instant before its own first load has come back.
 */
const accountsLoaded = ref(false);

const accountOrdered = computed(() =>
    [...accountsList.accounts.value].sort((a, b) => a.login.localeCompare(b.login)),
);

const brokerDefaultAccountId = computed(() => defaultGhCliAccountId(accountOrdered.value));

/** The concrete account id both the picker displays and every request carries. */
const effectiveAccountId = computed<string | undefined>(
    () => selectedAccountId.value ?? brokerDefaultAccountId.value ?? undefined,
);

/** Shown once the multi-account registry exists on this build and has answered once. */
const showAccountPicker = computed(() => accountsList.canList && accountsLoaded.value);

/** Nobody is signed in to GitHub at all - the "sign in" case, not "one account, nothing to choose". */
const accountSignedOut = computed(() => accountOrdered.value.length === 0);

const accountReauthenticationLabel = computed(() =>
    t("cirender.account.reauthenticationRequired", "reauthentication required"),
);
const accountItems = computed(() =>
    accountOrdered.value.map((account) => {
        const accountLabel = `${account.login} — ${account.host}`;
        const title = account.active
            ? t("cirender.account.itemActive", { login: accountLabel }, "{login} (active)")
            : accountLabel;
        const recovery = account.healthy ? null : accountReauthenticationLabel.value;
        return {
            title: recovery === null ? title : `${title} — ${recovery}`,
            value: account.id,
            searchText: [
                account.login,
                account.host,
                ...account.scopes,
                ...(recovery === null ? [] : [recovery, account.stateDetail ?? ""]),
            ].join(" "),
            props: { disabled: !account.healthy },
        };
    }),
);

/**
 * Why the picker cannot be used to choose anything, or null when a real choice exists.
 *
 * The same discipline every disabled control on this card holds to: naming the unmet
 * condition rather than merely going grey. Exactly one signed-in account has nothing to
 * switch to, so the picker still renders - showing which one it is - but is trivially
 * satisfied rather than hidden outright, per the guided-setup convention this screen
 * already follows for the Browse button and the Check button.
 */
const accountPickerDisabledBecause = computed<string | null>(() => {
    if (accountOrdered.value.length !== 1) return null;
    return t(
        "cirender.account.single",
        "Only one GitHub account is signed in, so this is fixed to it.",
    );
});

/**
 * Chooses which stored account this render authenticates as.
 *
 * Deliberately local to this card and nowhere else: this never calls
 * the machine-wide account switch, so it never touches which account Settings, downloads or
 * backups already resolve to - only which one *this render* does. The owner list is
 * re-resolved for the account just chosen (its own login and organisations, not the
 * previous account's), the repository owner field is cleared because a login or
 * organisation typed for one account may mean nothing under another, and any earlier
 * "Check before anything is sent" report is dropped because it described the account that
 * was in play before this choice.
 */
function chooseAccount(value: unknown): void {
    const current = effectiveAccountId.value;
    if (typeof value !== "string" || value === current) return;
    selectedAccountId.value = value;
    owner.value = "";
    renders.clearPreflight();
    renders.clearSchedule();
    renders.clearNameAvailability();
    if (renders.canListOwners) void renders.loadOwners(value);
    if (renders.canListRepositories) void renders.loadRepositories(value);
}

/* -------------------------------------------------------------------------- */
/* The repository owner: the signed-in account and its organisations          */
/* -------------------------------------------------------------------------- */

const ownerItems = computed(() => {
    const answer = renders.owners.value;
    if (answer === null || !answer.ok) return [];
    return answer.owners.map((choice) => ({
        title:
            choice.kind === "organization"
                ? t("cirender.owner.asOrg", { login: choice.login }, "{login} (organization)")
                : t("cirender.owner.asYou", { login: choice.login }, "{login} (you)"),
        value: choice.login,
        searchText: `${choice.login} ${choice.kind}`,
    }));
});

function chooseOwner(value: unknown): void {
    if (typeof value === "string") owner.value = value;
}

/** Nobody is signed in at all - the "sign in" case, not the "try again" one. */
const ownerSignedOut = computed(() => {
    const answer = renders.owners.value;
    return answer !== null && !answer.ok && !answer.signedIn;
});

/** Somebody is signed in, but the list itself could not be read - "try again" applies here. */
const ownerLoadFailed = computed(() => {
    const answer = renders.owners.value;
    return answer !== null && !answer.ok && answer.signedIn;
});

const ownerFailureMessage = computed(() => {
    const answer = renders.owners.value;
    return answer !== null && !answer.ok ? answer.message : "";
});

/* -------------------------------------------------------------------------- */
/* The repository name: an existing repository picked, or a name checked live */
/* -------------------------------------------------------------------------- */

const repositoryItems = computed(() =>
    renders.repositories.value.map((repository) => ({
        title: repository.private
            ? t("cirender.repo.itemPrivate", { name: repository.fullName }, "{name} (private)")
            : t("cirender.repo.itemPublic", { name: repository.fullName }, "{name} (PUBLIC)"),
        value: repository.fullName,
        searchText: [repository.fullName, repository.owner, repository.name].join(" "),
    })),
);

/**
 * The repository last picked from "One of your repositories", exactly as chosen - or null
 * once nothing on screen still matches it.
 *
 * This is what tells apart the two routes into `owner`/`repo` that used to collapse into
 * one: picking an existing repository out of a list the app itself populated is an act of
 * *choosing*, not of proposing a name, and there is nothing to check it against - GitHub
 * already told this build the repository is there. Typing a name, on the other hand, is a
 * proposal for a repository that may not exist yet, and that is exactly what the live
 * availability check below is for. Without this ref the two were indistinguishable once the
 * fields held the same string, and picking your own repository out of the app's own list
 * produced a "this name already exists" warning about the repository you had just chosen.
 */
const pickedRepository = ref<{ owner: string; repo: string } | null>(null);

/** True while `owner`/`repo` still hold exactly the repository just picked from the list. */
const repositoryIsPicked = computed(
    () =>
        pickedRepository.value !== null &&
        owner.value.trim() === pickedRepository.value.owner &&
        repo.value.trim() === pickedRepository.value.repo,
);

function chooseRepository(value: unknown): void {
    if (typeof value !== "string") return;
    const [chosenOwner, chosenRepo] = value.split("/");
    if (chosenOwner === undefined || chosenRepo === undefined) return;
    owner.value = chosenOwner;
    repo.value = chosenRepo;
    pickedRepository.value = { owner: chosenOwner, repo: chosenRepo };
    // Selecting from the list is the choice, made in full - there is no name being
    // proposed here for the create-path check below to have an opinion about, and any
    // verdict already on screen described a different, typed name that no longer applies.
    renders.clearNameAvailability();
}

/** Which of GitHub's naming rules `repo` breaks, or null when it is fine or still empty. */
const repoProblem = computed(() => repoNameProblem(repo.value, t));

let nameCheckTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Checks the typed name against GitHub, on a delay.
 *
 * A network call on every keystroke would ask GitHub about "w", "wo", "wor" and every
 * letter after - debounced here so it asks about the name somebody actually meant to type,
 * once they have paused rather than mid-keystroke. Any stale verdict is dropped the instant
 * either field changes, so a "taken" from the previous name is never shown beside a new one.
 *
 * A pair that still matches {@link pickedRepository} is left alone entirely: that is the
 * "chosen from the list" route, and running the create-path check against it is exactly how
 * picking your own existing repository used to produce a collision warning about itself.
 * Anything else - the very next keystroke that moves either field away from the picked pair,
 * or a name that was always typed by hand - drops the picked state and checks normally.
 */
watch([owner, repo], ([nextOwner, nextRepo]) => {
    renders.clearNameAvailability();
    if (nameCheckTimer !== null) clearTimeout(nameCheckTimer);
    const trimmedOwner = nextOwner.trim();
    const trimmedRepo = nextRepo.trim();
    if (
        pickedRepository.value !== null &&
        trimmedOwner === pickedRepository.value.owner &&
        trimmedRepo === pickedRepository.value.repo
    ) {
        return;
    }
    if (pickedRepository.value !== null) pickedRepository.value = null;
    if (trimmedOwner === "" || trimmedRepo === "" || repoProblem.value !== null) return;
    nameCheckTimer = setTimeout(() => {
        void renders.checkRepoName(trimmedOwner, trimmedRepo, effectiveAccountId.value);
    }, 600);
});

const repoAvailabilityTone = computed<"success" | "warning" | "muted">(() => {
    if (repositoryIsPicked.value) return "success";
    const availability = renders.nameAvailability.value;
    if (availability === null) return "muted";
    if (availability.status === "available") return "success";
    if (availability.status === "taken") return "warning";
    return "muted";
});

const repoAvailabilityText = computed<string>(() => {
    // Picked from "One of your repositories": a first-class, already-valid state, said
    // plainly rather than run through the create-path collision wording that answers a
    // different question - whether a *typed* name happens to be free.
    if (repositoryIsPicked.value) {
        return t(
            "cirender.repo.selected",
            { owner: owner.value.trim(), repo: repo.value.trim() },
            "{owner}/{repo} is one of your own repositories, picked from the list above.",
        );
    }
    const availability = renders.nameAvailability.value;
    if (availability === null) return "";
    if (availability.status === "available") {
        return t(
            "cirender.repo.available",
            { owner: availability.owner, repo: availability.repo },
            "{owner}/{repo} is free on GitHub.",
        );
    }
    if (availability.status === "taken") {
        return t(
            "cirender.repo.taken",
            { owner: availability.owner, repo: availability.repo },
            "{owner}/{repo} already exists on GitHub.",
        );
    }
    return t(
        "cirender.repo.unknown",
        { owner: availability.owner, repo: availability.repo, message: availability.message },
        "Could not check whether that name is free: {message}",
    );
});

/**
 * Why the Check button will not go yet, in the order somebody fills the card in.
 *
 * The same discipline `blockedBecause` below holds the Render button to: one sentence,
 * naming exactly which field is missing or invalid, rather than a button that simply went
 * grey.
 */
const checkBlockedBecause = computed<string | null>(() => {
    if (!renders.available) return null;
    if (worldFolder.value.trim() === "") {
        return t("cirender.checkBlocked.world", "Choose a world folder before checking.");
    }
    if (owner.value.trim() === "") {
        return t(
            "cirender.checkBlocked.owner",
            "Choose or type a repository owner before checking.",
        );
    }
    if (repo.value.trim() === "") {
        return t("cirender.checkBlocked.repo", "Choose or type a repository name before checking.");
    }
    if (repoProblem.value !== null) return repoProblem.value;
    return null;
});

/**
 * Whether the finished map is published to the repository's Pages site as well as
 * downloaded.
 *
 * Off by default, deliberately. Rendering a world is a private act until somebody says
 * otherwise, and a switch that quietly put a person's world on the open web the first
 * time they used it would be the wrong default even in a public repository.
 */
const publishToPages = ref(false);
const forceUpload = ref(false);

const preflight = computed<CiPreflight | null>(() => renders.preflight.value);
const isPublic = computed(() => preflight.value?.repository?.private === false);
const routeReport = computed(() => preflight.value?.routeReport ?? null);

/**
 * The three situations "no route can dispatch yet" collapses into one alarming message
 * otherwise, told apart using what the preflight report already knows rather than a second
 * network call: `"exists"` when the repository itself was read successfully and this
 * credential can write to it - the ordinary state for a hand-made or just-emptied
 * repository nobody has set up for CI rendering yet; `"missing"` when the repository could
 * not be read at all - the ordinary state right after confirming a name is free, and about
 * to be created; and `null` for a genuine block (a real permission refusal, or a repository
 * this credential truly cannot reach), which gets none of the reassuring framing below.
 *
 * `preflight.repository` answers the first question honestly now that it is read whether
 * or not a dispatch route was found - see `sync.ts`'s `#describeRepository` - so this needs
 * nothing beyond what a plain check already returned.
 */
const readinessNeedsSetup = computed<"exists" | "missing" | null>(() => {
    const report = preflight.value;
    if (report === null || report.routeReport.ready) return null;
    if (report.repository !== null) return report.repository.canWrite ? "exists" : null;
    return "missing";
});

/* Repository creation and preparation stay inside the gh/main-process bridge. */

/** True only when the build carries both halves of the capability - see `ciRenderBridge.ts`. */
const canBootstrapAutomatically = computed(
    () => bridge?.bootstrapCiRepository !== undefined && bridge.onCiBootstrapEvent !== undefined,
);
const canCreateWithCli = computed(() => bridge?.createCiRepository !== undefined);
const selectedOwnerKind = computed<"user" | "organization" | null>(() => {
    const answer = renders.owners.value;
    if (answer === null || !answer.ok) return null;
    return (
        answer.owners.find(
            (choice) =>
                choice.login.localeCompare(owner.value.trim(), undefined, {
                    sensitivity: "accent",
                }) === 0,
        )?.kind ?? null
    );
});
const createPrivate = ref(true);

const bootstrapping = ref(false);
const bootstrapReport = ref<CiBootstrapReport | null>(null);
const bootstrapFailureMessage = ref<string | null>(null);
const bootstrapFailureCode = ref<CiBootstrapFailureCode | null>(null);
const bootstrapConflict = computed(
    () =>
        bootstrapFailureCode.value === "user-authored-conflict" ||
        bootstrapFailureCode.value === "managed-file-modified" ||
        bootstrapFailureCode.value === "newer-marker-version" ||
        bootstrapFailureCode.value === "newer-template-version" ||
        bootstrapFailureCode.value === "concurrent-update",
);
/** True only for the one failure a re-authorisation button actually fixes. */
const bootstrapNeedsReauthentication = ref(false);
/** The single line shown while a bootstrap runs: the current phase, or the latest log line. */
const bootstrapProgressText = ref<string | null>(null);
const repositoryCreationMessage = ref<string | null>(null);
let unsubscribeBootstrap: (() => void) | null = null;

/**
 * One managed file's outcome, in words - a literal `t()` call per branch rather than a
 * key built from `outcome.action`, because the coverage guard that proves every catalogue
 * key still has a call site reads the source for literal calls and cannot follow one that
 * is assembled at runtime.
 */
function bootstrapFileOutcomeText(outcome: {
    readonly path: string;
    readonly action: CiBootstrapFileOutcome["action"];
}): string {
    switch (outcome.action) {
        case "created":
            return t("cirender.bootstrap.file.created", { path: outcome.path }, "Added {path}");
        case "updated":
            return t("cirender.bootstrap.file.updated", { path: outcome.path }, "Updated {path}");
        case "unchanged":
            return t(
                "cirender.bootstrap.file.unchanged",
                { path: outcome.path },
                "{path} was already up to date",
            );
        case "refused":
            return t(
                "cirender.bootstrap.file.refused",
                { path: outcome.path },
                "{path} was not touched",
            );
    }
}

function bootstrapPhaseLabel(phase: CiBootstrapPhase): string {
    switch (phase) {
        case "resolving-credential":
            return t(
                "cirender.bootstrap.phase.resolvingCredential",
                "Selecting the GitHub account...",
            );
        case "checking-scopes":
            return t("cirender.bootstrap.phase.checkingScopes", "Checking sign-in permissions...");
        case "reading-repository":
            return t("cirender.bootstrap.phase.readingRepository", "Reading the repository...");
        case "writing-files":
            return t("cirender.bootstrap.phase.writingFiles", "Adding the render workflow...");
        case "checking-actions":
            return t(
                "cirender.bootstrap.phase.checkingActions",
                "Checking whether GitHub Actions is enabled...",
            );
        case "configuring-pages":
            return t(
                "cirender.bootstrap.phase.configuringPages",
                "Enabling GitHub Pages and verifying the repository homepage...",
            );
        case "finished":
            return t("cirender.bootstrap.phase.finished", "Done.");
    }
}

/**
 * Creates a missing repository and prepares it without opening a browser or guessing from
 * a stale credential. Every external fact comes back from the selected account's gh lease.
 *
 * Never a spinner that hides a failure: every event this receives updates
 * {@link bootstrapProgressText} on screen, and the outcome - every file's real action, the
 * real Actions-enabled answer, or the real refusal - is what is shown afterwards, never a
 * guessed success. A successful run re-checks the repository immediately, so the person who
 * pressed the button lands on the next real decision (starting a render) rather than back
 * where they began.
 */
async function setupRepositoryAutomatically(): Promise<boolean> {
    // The disabled button is the visible guard; this check is the real re-entry guard for
    // keyboard submission and direct calls while the first bootstrap is still in flight.
    if (bootstrapping.value) return false;
    const targetOwner = owner.value.trim();
    const targetRepo = repo.value.trim();
    if (targetOwner === "" || targetRepo === "") return false;
    if (bridge === null || !canBootstrapAutomatically.value) return false;

    bootstrapping.value = true;
    bootstrapReport.value = null;
    bootstrapFailureMessage.value = null;
    bootstrapFailureCode.value = null;
    bootstrapNeedsReauthentication.value = false;
    repositoryCreationMessage.value = null;
    bootstrapProgressText.value = bootstrapPhaseLabel("checking-scopes");
    unsubscribeBootstrap?.();
    unsubscribeBootstrap = bridge.onCiBootstrapEvent!((event: CiBootstrapEvent) => {
        if (event.type === "phase") bootstrapProgressText.value = bootstrapPhaseLabel(event.phase);
        else if (event.type === "log") bootstrapProgressText.value = event.message;
        else if (event.type === "file") {
            bootstrapProgressText.value = bootstrapFileOutcomeText(event.outcome);
        }
    });

    try {
        if (readinessNeedsSetup.value === "missing") {
            if (!canCreateWithCli.value || selectedOwnerKind.value === null) {
                bootstrapFailureMessage.value =
                    "This build cannot create the selected repository through GitHub CLI, or the owner is no longer in the real owner list. Refresh the account and owner pickers.";
                bootstrapProgressText.value = null;
                return false;
            }
            bootstrapProgressText.value = t(
                "cirender.bootstrap.creatingRepository",
                "Creating the repository through GitHub CLI...",
            );
            const created = await bridge.createCiRepository!({
                ...(effectiveAccountId.value === undefined
                    ? {}
                    : { accountId: effectiveAccountId.value }),
                ownerLogin: targetOwner,
                ownerKind: selectedOwnerKind.value,
                name: targetRepo,
                private: createPrivate.value,
            });
            if (!created.ok) {
                bootstrapFailureMessage.value = created.message;
                bootstrapNeedsReauthentication.value = created.needsSignIn === true;
                bootstrapProgressText.value = null;
                return false;
            }
            repositoryCreationMessage.value = t(
                "cirender.bootstrap.repositoryCreated",
                { name: created.repository.fullName },
                "GitHub CLI created and verified {name}. Preparing its render workflow now.",
            );
            pickedRepository.value = { owner: targetOwner, repo: targetRepo };
            await renders.loadRepositories(effectiveAccountId.value);
        }
        const result = await bridge.bootstrapCiRepository!(
            targetOwner,
            targetRepo,
            effectiveAccountId.value,
            publishToPages.value,
        );
        if (result.ok) {
            bootstrapReport.value = result.report;
            bootstrapProgressText.value = null;
            // The workflow now exists (or Actions is now known to be off) - re-read the
            // repository so the card reflects it rather than the stale "needs setup" state.
            await check();
            return result.report.ready;
        } else {
            bootstrapFailureMessage.value = result.failure.message;
            bootstrapFailureCode.value = result.failure.code;
            bootstrapNeedsReauthentication.value = result.failure.code === "missing-scope";
            bootstrapProgressText.value = null;
            return false;
        }
    } catch (error) {
        bootstrapFailureMessage.value = error instanceof Error ? error.message : String(error);
        bootstrapFailureCode.value = null;
        bootstrapProgressText.value = null;
        return false;
    } finally {
        bootstrapping.value = false;
        unsubscribeBootstrap?.();
        unsubscribeBootstrap = null;
    }
}

/**
 * What the selected GitHub CLI account can do, with recovery kept on this surface.
 */
const ghState = computed<{ tone: "info" | "warning"; text: string } | null>(() => {
    const gh = routeReport.value?.gh;
    if (gh === undefined) return null;
    // Never asked, so nothing is said. Reporting an unprobed `gh` as missing would tell
    // somebody to install software they may well already have, on every single check.
    if (gh.availability === "not-checked") return null;
    if (gh.availability === "not-installed") {
        return {
            tone: "warning",
            text: t(
                "cirender.gh.missing",
                "The gh command-line tool is not available, so GitHub operations cannot start. Install it from cli.github.com, then return to GitHub Settings.",
            ),
        };
    }
    if (gh.availability === "signed-out") {
        return {
            tone: "warning",
            text: t(
                "cirender.gh.signedOut",
                "The selected GitHub CLI account is signed out. Reauthenticate it from GitHub Settings, then check again.",
            ),
        };
    }
    return {
        tone: "info",
        text:
            gh.account === null
                ? t("cirender.gh.ready", "The gh command-line tool is installed and signed in.")
                : t(
                      "cirender.gh.readyAs",
                      { account: gh.account, host: gh.host ?? "github.com" },
                      "The gh command-line tool is signed in as {account} on {host}.",
                  ),
    };
});

/** Why the selected GitHub CLI account cannot drive this operation, when it cannot. */
const routeAside = computed<string | null>(() => {
    const report = routeReport.value;
    if (report === null || report.route === null) return null;
    const reason = report.gh.reason;
    return reason === null || reason === "not needed" ? null : reason;
});

/** The selected gh account can be repaired from the same card that reports the refusal. */
const showGhAccountRecovery = computed(
    () =>
        props.canOpenSettings &&
        routeReport.value?.ready === false &&
        routeReport.value.gh.recovery === "github-settings",
);

/* -------------------------------------------------------------------------- */
/* A world nobody has set up yet: offer the defaults rather than a dead end     */
/* -------------------------------------------------------------------------- */

/**
 * Why this is a button and not a sentence.
 *
 * "There is no worldlens.project.json at the root of this world, so this world has no maps
 * set up yet" is a true and completely unactionable thing to read on a screen whose only
 * other control is a Render button that has just gone grey. The remedy it names - render it
 * once in the app, or run the map wizard - lives on two other screens, and somebody who came
 * here precisely *because* this machine cannot render the world is being sent to do the one
 * thing they came here to avoid.
 *
 * A project made of BlueMap's own generated defaults is exactly what the wizard would have
 * written for a world with nothing special about it, so the honest answer is to offer to
 * write it here. It is the same `createProjectFromGeneratedDefaults` the Projects screen
 * uses, not a second sparse idea of what a default project is, and it is written through the
 * same project host - so it lands in the project history like any other save and can be
 * opened and edited in full afterwards.
 */
const projectHost = computed<ProjectHost | null>(() =>
    props.projectHost === undefined ? resolveProjectHost() : props.projectHost,
);

/** True for the one refusal this screen can fix: the world has no project file at all. */
const needsDefaultProject = computed(
    () => preflight.value !== null && preflight.value.planFailureCode === "no-project",
);

const creatingDefaultProject = ref(false);
/** What writing the defaults did or could not do. Never a spinner that hides a refusal. */
const defaultProjectFailure = ref<string | null>(null);
const defaultProjectMessage = ref<string | null>(null);

/** Why the button is dead on this build, or null when it works. */
const defaultProjectUnavailableBecause = computed<string | null>(() => {
    if (projectHost.value !== null) return null;
    return t(
        "cirender.defaultProject.unavailable",
        "This build cannot write a project file, so the world has to be set up from the Projects screen or the map wizard.",
    );
});

/**
 * Writes BlueMap's generated defaults into the chosen world, then re-checks.
 *
 * Re-checking is the point of the last two lines: the person who pressed this wanted to
 * render, not to own a file, so a successful write puts them on the next real decision
 * rather than back in front of the same grey button with a green tick beside it.
 */
async function createDefaultProject(): Promise<void> {
    if (creatingDefaultProject.value) return;
    const host = projectHost.value;
    const world = worldFolder.value.trim();
    if (host === null || world === "") return;

    creatingDefaultProject.value = true;
    defaultProjectFailure.value = null;
    defaultProjectMessage.value = null;
    try {
        const project = createProjectFromGeneratedDefaults(worldLeaf(world), {
            world,
            // The world's own path says which spelling this machine uses; a project written
            // with the wrong one carries HOCON paths that read as another platform's.
            separator: world.includes("\\") ? "\\" : "/",
        });
        const written = await host.writeProject(world, project);
        if (!written.ok) {
            defaultProjectFailure.value = written.message;
            return;
        }
        defaultProjectMessage.value = t(
            "cirender.defaultProject.written",
            { file: written.file },
            "Wrote {file} with BlueMap's generated defaults: an overworld, a nether and an end map. Open it from Projects to change anything.",
        );
        await check();
    } catch (error) {
        defaultProjectFailure.value = error instanceof Error ? error.message : String(error);
    } finally {
        creatingDefaultProject.value = false;
    }
}

/**
 * Whether the button may be pressed.
 *
 * Everything it checks is checked again in the main process. This is not belt and braces
 * for its own sake: a disabled button explains *why* it is disabled, which a refusal
 * arriving after a click cannot do as well - but the refusal is what actually protects the
 * world, because a renderer can be wrong or out of date and the main process cannot.
 */
const blockedBecause = computed<string | null>(() => {
    if (!renders.available) {
        return t("cirender.unsupported", "The desktop application is what starts a CI render.");
    }
    const report = preflight.value;
    if (report === null) return t("cirender.blocked.check", "Check the repository first.");
    if (!report.eulaAccepted) {
        return t(
            "cirender.blocked.eula",
            "Mojang's licence has not been accepted on this computer, and the render needs it.",
        );
    }
    if (report.routeReport.ready !== true) return report.routeReport.describe;
    if (report.planFailure !== null) return report.planFailure;
    if (report.worldFailure !== null) return report.worldFailure;
    if (report.tooLargeToUpload && report.uploadNeeded) {
        return t(
            "cirender.blocked.large",
            { size: formatBytes(report.estimatedArchiveBytes, t) },
            "This world packs to about {size}, past what one GitHub release asset can hold.",
        );
    }
    // The broker-backed route can publish; keep the capability check for future read-only
    // routes and keep recovery on the selected account.
    if (report.uploadNeeded && !report.routeReport.canUpload) {
        return t(
            "cirender.blocked.uploadRoute",
            "The selected GitHub CLI account cannot publish this world. Reauthenticate it from GitHub Settings, then check again.",
        );
    }
    if (report.uploadNeeded && !acknowledgeUpload.value) {
        return t("cirender.blocked.upload", "Confirm that the world may be uploaded to GitHub.");
    }
    if (isPublic.value && !acknowledgePublic.value) {
        return t(
            "cirender.blocked.public",
            "Confirm that you mean to publish this world publicly.",
        );
    }
    return null;
});

async function check(): Promise<void> {
    await renders.check({
        worldFolder: worldFolder.value.trim(),
        owner: owner.value.trim(),
        repo: repo.value.trim(),
        ...(effectiveAccountId.value === undefined ? {} : { accountId: effectiveAccountId.value }),
    });
}

/** Covers bootstrap and dispatch together, so repeated clicks cannot start parallel setup runs. */
const startRequestInFlight = ref(false);

async function start(): Promise<void> {
    if (startRequestInFlight.value) return;
    startRequestInFlight.value = true;

    try {
        // The packaged templates are the source of truth for workflows this app owns. Run the
        // idempotent bootstrap immediately before every manual dispatch: unchanged files cost
        // only a read, an older managed workflow is upgraded automatically, and a user-authored
        // conflict is refused before a render can start against stale instructions.
        if (canBootstrapAutomatically.value && !(await setupRepositoryAutomatically())) return;

        const result = await renders.start({
            worldFolder: worldFolder.value.trim(),
            owner: owner.value.trim(),
            repo: repo.value.trim(),
            acknowledgeUpload: acknowledgeUpload.value,
            acknowledgePublic: acknowledgePublic.value,
            forceUpload: forceUpload.value,
            output: publishToPages.value ? "artifact-and-pages" : "artifact",
            ...(effectiveAccountId.value === undefined
                ? {}
                : { accountId: effectiveAccountId.value }),
        });
        if (result?.ok === true && result.outcome === "rendered") {
            emit("rendered", {
                renderId: result.summary.renderId,
                dataRoot: result.summary.dataRoot,
                mapId: result.summary.mapId,
            });
        }
    } finally {
        startRequestInFlight.value = false;
    }
}

async function retryPostRender(row: CiRow): Promise<void> {
    const result = await renders.retry(row.syncId);
    if (result?.ok === true && result.outcome === "rendered") {
        emit("rendered", {
            renderId: result.summary.renderId,
            dataRoot: result.summary.dataRoot,
            mapId: result.summary.mapId,
        });
    }
}

/* -- the job list, searchable like every other list in the application ------ */

const jobQuery = ref("");
const jobRegex = ref(false);
const jobFlags = ref("i");

function visibleJobs(row: CiRow): readonly CiJobReport[] {
    const matcher = createSettingMatcher(jobQuery.value, jobRegex.value, jobFlags.value);
    return (row.run?.jobs ?? []).filter((job) =>
        matcher.test(`${job.name} ${job.status} ${job.conclusion ?? ""}`),
    );
}

function jobSample(row: CiRow): string {
    return (row.run?.jobs ?? []).map((job) => job.name).join("\n");
}

/* -- scheduled re-rendering: on or off, a cadence, and the last check ------- */

/**
 * Four guided presets plus a bounded custom whole-hour interval - never a cron expression.
 * The main process and workflow validate the same `hours:N` representation again, so a
 * renderer typo cannot become an unbounded Actions schedule.
 */
type CiPresetScheduleCadence = "hourly" | "sixHourly" | "daily" | "weekly";
type ScheduleCadenceChoice = CiPresetScheduleCadence | "custom";

const SCHEDULE_CADENCES: readonly CiPresetScheduleCadence[] = [
    "hourly",
    "sixHourly",
    "daily",
    "weekly",
];
const CUSTOM_SCHEDULE_MIN_HOURS = 1;
const CUSTOM_SCHEDULE_MAX_HOURS = 168;

function cadenceLabel(cadence: CiPresetScheduleCadence): string {
    switch (cadence) {
        case "hourly":
            return t("cirender.schedule.cadence.hourly", "Every hour");
        case "sixHourly":
            return t("cirender.schedule.cadence.sixHourly", "Every 6 hours");
        case "daily":
            return t("cirender.schedule.cadence.daily", "Every day");
        case "weekly":
            return t("cirender.schedule.cadence.weekly", "Every week");
    }
}

/** Only one row's schedule panel is open at a time, an accordion rather than N copies. */
const scheduleOpenSyncId = ref<string | null>(null);
const scheduleCadenceChoice = ref<ScheduleCadenceChoice>("daily");
const scheduleCustomHoursDraft = ref("12");
const scheduleCadenceError = ref<string | null>(null);

function customHours(cadence: CiScheduleCadence): number | null {
    const match = /^hours:([1-9]\d{0,2})$/.exec(cadence);
    if (match === null) return null;
    const hours = Number(match[1]);
    return Number.isInteger(hours) &&
        hours >= CUSTOM_SCHEDULE_MIN_HOURS &&
        hours <= CUSTOM_SCHEDULE_MAX_HOURS
        ? hours
        : null;
}

function loadCadenceDraft(cadence: CiScheduleCadence): void {
    const hours = customHours(cadence);
    if (hours === null) {
        scheduleCadenceChoice.value = cadence as CiPresetScheduleCadence;
    } else {
        scheduleCadenceChoice.value = "custom";
        scheduleCustomHoursDraft.value = String(hours);
    }
    scheduleCadenceError.value = null;
}

function selectedScheduleCadence(): CiScheduleCadence | null {
    if (scheduleCadenceChoice.value !== "custom") return scheduleCadenceChoice.value;
    const hours = Number(scheduleCustomHoursDraft.value);
    if (
        !Number.isInteger(hours) ||
        hours < CUSTOM_SCHEDULE_MIN_HOURS ||
        hours > CUSTOM_SCHEDULE_MAX_HOURS
    ) {
        scheduleCadenceError.value = t(
            "cirender.schedule.custom.invalid",
            "Enter a whole number from 1 to 168 hours.",
        );
        return null;
    }
    scheduleCadenceError.value = null;
    return `hours:${hours}`;
}

function scheduleOwnerRepo(row: CiRow): { owner: string; repo: string } | null {
    const slash = row.repository.indexOf("/");
    if (slash <= 0 || slash === row.repository.length - 1) return null;
    return { owner: row.repository.slice(0, slash), repo: row.repository.slice(slash + 1) };
}

async function toggleSchedule(row: CiRow): Promise<void> {
    if (scheduleOpenSyncId.value === row.syncId) {
        scheduleOpenSyncId.value = null;
        return;
    }
    scheduleOpenSyncId.value = row.syncId;
    const target = scheduleOwnerRepo(row);
    if (target === null) return;
    await renders.loadSchedule(target.owner, target.repo, effectiveAccountId.value);
    const cadence = renders.schedule.value?.cadence;
    if (cadence !== null && cadence !== undefined) loadCadenceDraft(cadence);
}

async function saveScheduleFor(row: CiRow, enabled: boolean): Promise<void> {
    const target = scheduleOwnerRepo(row);
    if (target === null) return;
    const cadence = enabled
        ? selectedScheduleCadence()
        : (renders.schedule.value?.cadence ?? selectedScheduleCadence() ?? "daily");
    if (cadence === null) return;
    await renders.saveSchedule(
        row.syncId,
        target.owner,
        target.repo,
        enabled,
        cadence,
        effectiveAccountId.value,
    );
}

async function scheduleCadenceChoiceChanged(row: CiRow): Promise<void> {
    scheduleCadenceError.value = null;
    if (scheduleCadenceChoice.value !== "custom") await saveScheduleFor(row, true);
}

function scheduleResultText(result: CiScheduleCheckResultName): string {
    switch (result) {
        case "changed":
            return t(
                "cirender.schedule.result.changed",
                "the world had changed, so a render was started",
            );
        case "unchanged":
            return t(
                "cirender.schedule.result.unchanged",
                "the world had not changed, so nothing was rendered",
            );
        case "unknown":
            return t(
                "cirender.schedule.result.unknown",
                "a change could not be cheaply told for this world's source",
            );
        case "error":
            return t(
                "cirender.schedule.result.error",
                "the configured world could not be found by the last check",
            );
    }
}

/**
 * The waves this row's jobs actually named, in the order first seen.
 *
 * Filters out the `wave: null` bucket - jobs the workflow does not shard, like `Build the
 * BlueMap CLI` - so the summary only lists real waves rather than a row for "no wave" that
 * would read as one more wave.
 */
function waves(row: CiRow): readonly { wave: number; done: number; total: number }[] {
    return waveSummaries(row.run?.jobs ?? []).flatMap((summary) =>
        summary.wave === null
            ? []
            : [{ wave: summary.wave, done: summary.done, total: summary.total }],
    );
}

onMounted(() => {
    void renders.loadKnown();
    // What is already going must be on screen before anybody presses anything: a render
    // started in another window, or moments before this screen mounted, would otherwise be
    // invisible here for as long as `loadKnown()` alone takes to catch up (see
    // `CiRenders.reconcile()`'s own doc comment), and could look startable a second time.
    void renders.reconcile();
    if (accountsList.canList) {
        void accountsList.load().then(() => {
            accountsLoaded.value = true;
            if (renders.canListOwners) void renders.loadOwners(effectiveAccountId.value);
            if (renders.canListRepositories)
                void renders.loadRepositories(effectiveAccountId.value);
        });
    } else {
        if (renders.canListOwners) void renders.loadOwners();
        if (renders.canListRepositories) void renders.loadRepositories();
    }
    // A world already prefilled from `props.worlds` is a world chosen too, so the name
    // suggestion applies to it exactly as it would to one picked or browsed after mount.
    if (worldFolder.value.trim() !== "") void applySuggestedRepoName(worldFolder.value);
});

onBeforeUnmount(() => {
    if (nameCheckTimer !== null) clearTimeout(nameCheckTimer);
    renders.dispose();
    unsubscribeBootstrap?.();
});
</script>

<template>
    <div class="ci-render-screen">
        <!--
            The page's own header rather than a tonal card carrying the screen's name.

            A card is a surface inside a page, so using one as the page itself left this screen
            opening on a title rendered at card-title size with its explanation boxed in a tint
            underneath - a dialog somebody stretched rather than a page. The prototype opens
            every job on a heading, a lede saying what the screen is for, and a footnote
            carrying the trade-offs worth knowing before starting, which is what these three
            strings already said in the wrong shape. The artwork follows the words rather than
            leading them: it illustrates a pipeline the reader has just been told about, and
            leading with it puts a picture where the title belongs.
        -->
        <header class="ci-render-screen__header">
            <h1 class="mb-page-title">{{ t("cirender.title", "Render on GitHub") }}</h1>
            <p class="mb-lede">
                {{
                    t(
                        "cirender.pitch",
                        "Built for computers that cannot render a big world themselves. Your machine uploads the world and then waits; GitHub's runners do the rendering, split across as many parallel jobs as the world needs, and the finished map comes back and opens exactly like a local one.",
                    )
                }}
            </p>
            <p class="mb-footnote">
                {{
                    t(
                        "cirender.caveats",
                        "The trade-offs, plainly: uploading a multi-gigabyte world takes time and bandwidth; GitHub's free Actions minutes are finite for private repositories, while public ones get unlimited standard-runner minutes; and a very large world can still exceed a job's budget or be too big to send as one release asset.",
                    )
                }}
            </p>
            <ActionArtwork
                class="ci-render-screen__artwork"
                artwork="cloudRenderSetup"
                :alt="
                    t(
                        'cirender.artwork.alt',
                        'A local Minecraft world travelling through a cloud render pipeline and returning as a finished map',
                    )
                "
                eager
            />
        </header>

        <VAlert v-if="!renders.available" type="info" variant="tonal" class="mb-4">
            {{ t("cirender.unsupported", "The desktop application is what starts a CI render.") }}
        </VAlert>

        <template v-else>
            <VCard class="mb-4">
                <VCardTitle>{{ t("cirender.where.title", "What, and where") }}</VCardTitle>
                <VCardText>
                    <!--
                        "Render as": local to this card, never the application-wide
                        active-account switch. Nobody signed in offers the sign-in action
                        rather than a dead picker; exactly one signed-in account still shows
                        the picker, naming why it is fixed, per the guided-setup convention
                        this card already follows for the Browse and Check buttons.
                    -->
                    <div v-if="showAccountPicker" class="mb-4">
                        <VAlert
                            v-if="accountSignedOut"
                            type="info"
                            variant="tonal"
                            density="compact"
                            data-test="account-signed-out"
                            role="status"
                            aria-live="polite"
                        >
                            {{
                                t(
                                    "cirender.account.signedOut",
                                    "Nobody is signed in to GitHub, so there is no account to render as. Sign in from Settings.",
                                )
                            }}
                            <VBtn
                                v-if="props.canOpenSettings"
                                size="small"
                                variant="text"
                                class="mt-1"
                                @click="emit('signIn')"
                            >
                                {{ t("cirender.signIn", "Open the GitHub sign-in") }}
                            </VBtn>
                        </VAlert>
                        <template v-else>
                            <GhEntityPicker
                                :items="accountItems"
                                :model-value="effectiveAccountId"
                                :search-label="
                                    t('cirender.account.search', 'Search signed-in accounts')
                                "
                                :select-label="t('cirender.account.pick', 'Render as')"
                                :selected-label="t('cirender.account.selected', 'Selected account')"
                                :empty-message="
                                    t(
                                        'cirender.account.empty',
                                        'No GitHub CLI accounts are signed in.',
                                    )
                                "
                                :no-match-message="
                                    t(
                                        'cirender.account.noMatch',
                                        'No signed-in account matches that search.',
                                    )
                                "
                                :hint="
                                    t(
                                        'cirender.account.help',
                                        'Which signed-in account this render authenticates as. The broker selects it for each gh command and restores the account that was active immediately afterwards. Another gh process can still change that machine-wide account between commands, so avoid running gh account changes while this operation is active.',
                                    )
                                "
                                :disabled="accountPickerDisabledBecause !== null"
                                :disabled-reason="accountPickerDisabledBecause"
                                data-test-base="cirender-account-picker"
                                @update:model-value="chooseAccount"
                            />
                        </template>
                    </div>

                    <!--
                        The world folder: a text field kept in step with a picker of what
                        this machine already knows about and a browse button, exactly the
                        three routes `WorldFolderStep.vue` offers for the same choice. None
                        of the three is the "real" one; they all write the same ref.
                    -->
                    <div class="d-flex ga-2 flex-wrap align-start">
                        <VTextField
                            v-model="worldFolder"
                            :label="t('cirender.field.world', 'World folder')"
                            :hint="
                                t(
                                    'cirender.field.world.help',
                                    'Pick a world below, browse for one, or type its full path.',
                                )
                            "
                            persistent-hint
                            density="compact"
                            data-test="world-field"
                            class="flex-grow-1"
                            style="min-width: 220px"
                        />
                        <VBtn
                            :prepend-icon="mdiFolderSearchOutline"
                            :disabled="dialogPickFolder === null"
                            :title="browseUnavailableBecause ?? undefined"
                            :aria-label="
                                browseUnavailableBecause !== null
                                    ? t(
                                          'cirender.field.world.browseUnavailableLabel',
                                          { reason: browseUnavailableBecause },
                                          'Browse: {reason}',
                                      )
                                    : undefined
                            "
                            variant="tonal"
                            data-test="world-browse"
                            @click="browseWorldFolder"
                        >
                            {{ t("cirender.field.world.browse", "Browse") }}
                        </VBtn>
                    </div>
                    <p
                        v-if="browseUnavailableBecause !== null"
                        class="text-medium-emphasis mt-1"
                        data-test="world-browse-unavailable"
                    >
                        {{ browseUnavailableBecause }}
                    </p>

                    <MinecraftWorldList
                        :model-value="worldFolder"
                        :bridge="worldCatalogBridge"
                        @choose="chooseWorld"
                    />

                    <!--
                        The repository owner: signed out points at the sign-in row that
                        already exists rather than opening a second one; signed in but
                        unreadable offers a retry; either way the free-text field beneath
                        keeps working on its own.
                    -->
                    <VAlert
                        v-if="ownerSignedOut"
                        type="info"
                        variant="tonal"
                        density="compact"
                        class="mt-4 mb-2"
                        data-test="owner-signed-out"
                        role="status"
                        aria-live="polite"
                    >
                        {{
                            t(
                                "cirender.owner.signedOut",
                                "Nobody is signed in to GitHub, so there is no real owner list. Sign in from Settings before choosing where to render.",
                            )
                        }}
                        <VBtn
                            v-if="props.canOpenSettings"
                            size="small"
                            variant="text"
                            class="mt-1"
                            @click="emit('signIn')"
                        >
                            {{ t("cirender.signIn", "Open the GitHub sign-in") }}
                        </VBtn>
                    </VAlert>
                    <VAlert
                        v-else-if="ownerLoadFailed"
                        type="warning"
                        variant="tonal"
                        density="compact"
                        class="mt-4 mb-2"
                        data-test="owner-load-failed"
                        role="alert"
                    >
                        {{ ownerFailureMessage }}
                        <VBtn
                            size="small"
                            variant="text"
                            class="mt-1"
                            @click="renders.loadOwners(effectiveAccountId)"
                        >
                            {{ t("cirender.owner.retry", "Try again") }}
                        </VBtn>
                    </VAlert>

                    <GhEntityPicker
                        v-if="ownerItems.length > 0"
                        :items="ownerItems"
                        :model-value="owner || null"
                        :search-label="
                            t('cirender.owner.search', 'Search personal and organization owners')
                        "
                        :select-label="t('cirender.owner.pick', 'Choose an owner')"
                        :selected-label="t('cirender.owner.selected', 'Selected owner')"
                        :empty-message="
                            t('cirender.owner.empty', 'No owners were returned by GitHub CLI.')
                        "
                        :no-match-message="
                            t('cirender.owner.noMatch', 'No real owner matches that search.')
                        "
                        :hint="
                            t(
                                'cirender.owner.help',
                                'Owners are read through GitHub CLI for the selected account and revalidated before a repository is created.',
                            )
                        "
                        class="mb-2"
                        data-test-base="cirender-owner-picker"
                        @update:model-value="chooseOwner"
                    />

                    <GhEntityPicker
                        v-if="repositoryItems.length > 0"
                        :items="repositoryItems"
                        :model-value="owner && repo ? `${owner}/${repo}` : null"
                        :search-label="t('cirender.repo.search', 'Search your repositories')"
                        :select-label="t('cirender.repo.pick', 'One of your repositories')"
                        :selected-label="t('cirender.repo.selectedLabel', 'Selected repository')"
                        :empty-message="
                            t(
                                'cirender.repo.empty',
                                'No writable repositories were returned by GitHub CLI.',
                            )
                        "
                        :no-match-message="
                            t('cirender.repo.noMatch', 'No real repository matches that search.')
                        "
                        :hint="
                            t(
                                'cirender.repo.loadedHint',
                                'Most recently active first, up to 300 real repositories returned by GitHub CLI.',
                            )
                        "
                        class="mb-2"
                        data-test-base="cirender-repository-picker"
                        @update:model-value="chooseRepository"
                    />
                    <p
                        v-else-if="renders.loadingRepositories.value"
                        class="text-medium-emphasis mb-2"
                        data-test="repositories-loading"
                    >
                        {{ t("cirender.repo.loadingRepositories", "Reading your repositories...") }}
                    </p>
                    <VAlert
                        v-else-if="renders.repositoriesFailure.value !== null"
                        type="warning"
                        variant="tonal"
                        density="compact"
                        class="mb-2"
                        data-test="repositories-failure"
                    >
                        {{ renders.repositoriesFailure.value }}
                    </VAlert>

                    <div class="d-flex ga-2 flex-wrap">
                        <VTextField
                            v-model="repo"
                            :label="t('cirender.field.repo', 'Repository name')"
                            :hint="
                                repoProblem ??
                                t(
                                    'cirender.field.repo.help',
                                    'A name is suggested once you choose a world. It stays yours to change before checking.',
                                )
                            "
                            :error="repoProblem !== null"
                            persistent-hint
                            density="compact"
                            data-test="repo-field"
                            class="flex-grow-1"
                            style="min-width: 200px"
                        />
                    </div>

                    <p
                        v-if="renders.checkingName.value && !repositoryIsPicked"
                        class="text-medium-emphasis mt-1"
                        data-test="repo-availability"
                        role="status"
                        aria-live="polite"
                    >
                        {{ t("cirender.repo.checking", "Checking whether that name is free...") }}
                    </p>
                    <p
                        v-else-if="repositoryIsPicked || renders.nameAvailability.value !== null"
                        class="mt-1"
                        :class="{
                            'text-success': repoAvailabilityTone === 'success',
                            'text-warning': repoAvailabilityTone === 'warning',
                            'text-medium-emphasis': repoAvailabilityTone === 'muted',
                        }"
                        data-test="repo-availability"
                        role="status"
                        aria-live="polite"
                    >
                        {{ repoAvailabilityText }}
                    </p>

                    <VBtn
                        :prepend-icon="mdiRefresh"
                        :disabled="checkBlockedBecause !== null"
                        :loading="renders.checking.value"
                        variant="tonal"
                        class="mt-3"
                        @click="check"
                    >
                        {{ t("cirender.check", "Check before anything is sent") }}
                    </VBtn>
                    <p
                        v-if="checkBlockedBecause !== null"
                        class="text-medium-emphasis mt-2"
                        data-test="check-blocked"
                    >
                        {{ checkBlockedBecause }}
                    </p>
                    <VAlert
                        v-if="renders.preflightFailure.value !== null"
                        type="error"
                        variant="tonal"
                        class="mt-3"
                    >
                        {{ renders.preflightFailure.value }}
                    </VAlert>
                </VCardText>
            </VCard>

            <VCard v-if="preflight !== null" class="mb-4">
                <VCardTitle>{{ t("cirender.report.title", "What this would do") }}</VCardTitle>
                <VCardText>
                    <!--
                        Which selected GitHub CLI account is driving, before the button rather
                        than after a 403. Accounts are not interchangeable, so the refusal
                        stays attached to the account the user selected.
                    -->
                    <VAlert
                        :type="routeReport?.ready === true ? 'info' : 'warning'"
                        variant="tonal"
                        class="mb-3"
                        data-test="route"
                    >
                        {{ routeReport?.describe }}
                        <p
                            v-if="routeAside !== null"
                            class="mt-1 text-medium-emphasis"
                            data-test="route-aside"
                        >
                            {{
                                t(
                                    "cirender.route.other",
                                    { reason: routeAside },
                                    "The other sign-in was not used: {reason}",
                                )
                            }}
                        </p>
                        <p
                            v-if="ghState !== null"
                            class="mt-1 text-medium-emphasis"
                            data-test="route-gh"
                        >
                            {{ ghState.text }}
                        </p>
                        <VBtn
                            v-if="showGhAccountRecovery"
                            size="small"
                            variant="tonal"
                            class="mt-2"
                            data-test="route-gh-recovery"
                            @click="emit('signIn')"
                        >
                            {{ t("cirender.gh.openAccounts", "Open GitHub accounts") }}
                        </VBtn>
                    </VAlert>

                    <!--
                        Not every "no route yet" is a block: an existing repository nobody
                        has set up for CI rendering, or a name just confirmed free and about
                        to be created, are both ordinary points on the happy path and say so
                        here - in `info` tone, with the real next step - rather than reading
                        as the same alarm as a genuine permission refusal above.
                    -->
                    <VAlert
                        v-if="readinessNeedsSetup !== null"
                        type="info"
                        variant="tonal"
                        class="mb-3"
                        data-test="needs-setup"
                        role="status"
                        aria-live="polite"
                    >
                        {{
                            readinessNeedsSetup === "exists"
                                ? t(
                                      "cirender.readiness.exists",
                                      { owner: owner.trim(), repo: repo.trim() },
                                      "{owner}/{repo} exists and this credential can write to it, but it is not set up for a GitHub render yet - it has no render workflow. Setting it up is the next step, not a sign-in problem.",
                                  )
                                : t(
                                      "cirender.readiness.missing",
                                      { owner: owner.trim(), repo: repo.trim() },
                                      "{owner}/{repo} is not visible to the selected GitHub CLI account. A confirmed missing name can be created here; a CLI failure stays a failure and is never guessed to mean nonexistent.",
                                  )
                        }}

                        <!--
                            Creation and setup are both main-process gh operations. There
                            is deliberately no browser-link fallback on this surface.
                        -->
                        <div
                            v-if="
                                canBootstrapAutomatically &&
                                (readinessNeedsSetup === 'exists' || canCreateWithCli)
                            "
                        >
                            <VSwitch
                                v-if="readinessNeedsSetup === 'missing'"
                                v-model="createPrivate"
                                :label="
                                    t(
                                        'cirender.bootstrap.private',
                                        'Create as a private repository',
                                    )
                                "
                                color="primary"
                                hide-details="auto"
                                class="mt-2"
                                data-test="create-private"
                            />
                            <VBtn
                                size="small"
                                variant="tonal"
                                color="primary"
                                class="mt-2"
                                data-test="bootstrap-repository"
                                :loading="bootstrapping"
                                :disabled="bootstrapping"
                                @click="setupRepositoryAutomatically"
                            >
                                {{
                                    readinessNeedsSetup === "missing"
                                        ? t(
                                              "cirender.bootstrap.createAction",
                                              "Create and set this repository up",
                                          )
                                        : t("cirender.bootstrap.action", "Set this repository up")
                                }}
                            </VBtn>
                            <p
                                v-if="bootstrapping"
                                class="text-medium-emphasis mt-2"
                                data-test="bootstrap-progress"
                                role="status"
                                aria-live="polite"
                            >
                                <VProgressCircular indeterminate size="16" width="2" class="mr-2" />
                                {{ bootstrapProgressText }}
                            </p>
                        </div>
                        <p
                            v-else
                            class="text-medium-emphasis mt-2"
                            role="status"
                            data-test="setup-unavailable"
                        >
                            {{
                                t(
                                    "cirender.readiness.cliUnavailable",
                                    "This build cannot complete repository setup through GitHub CLI. No browser page was opened; update or repair the desktop application, then try again.",
                                )
                            }}
                        </p>
                    </VAlert>

                    <VAlert
                        v-if="repositoryCreationMessage !== null"
                        type="success"
                        variant="tonal"
                        class="mb-3"
                        data-test="repository-created"
                        role="status"
                    >
                        {{ repositoryCreationMessage }}
                    </VAlert>

                    <!-- The real outcome of a bootstrap attempt: per-file, honest, and never a green tick over a disabled Actions setting. -->
                    <VAlert
                        v-if="bootstrapReport !== null"
                        :type="bootstrapReport.ready ? 'success' : 'warning'"
                        variant="tonal"
                        class="mb-3"
                        data-test="bootstrap-result"
                    >
                        <p>{{ bootstrapReport.credentialDescribe }}</p>
                        <ul class="mt-1">
                            <li v-for="file in bootstrapReport.files" :key="file.path">
                                {{ bootstrapFileOutcomeText(file) }}
                            </li>
                        </ul>
                        <p class="mt-2">{{ bootstrapReport.actionsMessage }}</p>
                        <p
                            v-if="bootstrapReport.pages !== undefined"
                            class="mt-2"
                            data-test="pages-homepage-ready"
                        >
                            {{
                                t(
                                    "cirender.bootstrap.pagesReadyLead",
                                    "GitHub Pages is configured for workflow publishing at",
                                )
                            }}
                            <a
                                :href="bootstrapReport.pages.url"
                                @click.prevent="emit('open', bootstrapReport.pages.url)"
                            >
                                {{ bootstrapReport.pages.url }}
                            </a>
                            {{
                                t(
                                    "cirender.bootstrap.pagesReadyHomepage",
                                    "The repository homepage now points to this exact URL. The first successful Pages render publishes the site.",
                                )
                            }}
                        </p>
                        <p
                            v-for="note in bootstrapReport.notes"
                            :key="note"
                            class="mt-1 text-medium-emphasis"
                        >
                            {{ note }}
                        </p>
                    </VAlert>

                    <VAlert
                        v-if="bootstrapFailureMessage !== null"
                        type="error"
                        variant="tonal"
                        class="mb-3"
                        data-test="bootstrap-failure"
                    >
                        <p
                            v-if="bootstrapConflict"
                            class="font-weight-medium"
                            data-test="bootstrap-conflict"
                        >
                            {{
                                t(
                                    "cirender.bootstrap.conflict",
                                    "Managed workflow conflict: no repository files were changed.",
                                )
                            }}
                        </p>
                        {{ bootstrapFailureMessage }}
                        <div v-if="bootstrapNeedsReauthentication" class="mt-2">
                            <VBtn
                                size="small"
                                variant="tonal"
                                color="primary"
                                @click="emit('signIn')"
                            >
                                {{ t("cirender.bootstrap.reauth", "Open GitHub accounts") }}
                            </VBtn>
                        </div>
                    </VAlert>

                    <VAlert
                        v-if="preflight.eulaAccepted !== true"
                        type="warning"
                        variant="tonal"
                        class="mb-3"
                        data-test="eula"
                    >
                        {{
                            t(
                                "cirender.eula",
                                "The render workflow downloads a Minecraft client jar for its block models and textures, which needs Mojang's licence to have been accepted. This application will not accept it for you.",
                            )
                        }}
                        <VBtn
                            v-if="props.canOpenSettings"
                            size="small"
                            variant="text"
                            class="mt-2"
                            @click="emit('openConsent')"
                        >
                            {{ t("cirender.eula.open", "Open the consent setting") }}
                        </VBtn>
                    </VAlert>

                    <VAlert
                        v-if="preflight.repository?.warning != null"
                        :type="
                            preflight.repository.warning.level === 'warning' ? 'warning' : 'info'
                        "
                        variant="tonal"
                        class="mb-3"
                        data-test="repository-warning"
                    >
                        {{ preflight.repository.warning.message }}
                    </VAlert>
                    <VAlert
                        v-if="preflight.repository === null && preflight.repositoryFailure !== null"
                        type="warning"
                        variant="tonal"
                        class="mb-3"
                        data-test="repository-unknown"
                    >
                        {{
                            t(
                                "cirender.repository.unknown",
                                "The selected GitHub CLI account could not read the repository, so whether it is public could not be checked. Nothing will be uploaded until that account can.",
                            )
                        }}
                    </VAlert>
                    <!--
                        The warning above came from the chosen route rather than from the
                        application's own sign-in. Said out loud, because the wording differs
                        and somebody comparing two machines deserves to know why.
                    -->
                    <p
                        v-else-if="preflight.repositoryFailure !== null"
                        class="text-medium-emphasis mb-3"
                        data-test="repository-fallback"
                    >
                        {{
                            t(
                                "cirender.repository.fallback",
                                "This application's own GitHub sign-in could not read the repository, so the note above was read with the credential that will do the work instead.",
                            )
                        }}
                    </p>

                    <p data-test="upload-line">{{ uploadLine(preflight, t) }}</p>

                    <p
                        v-if="preflight.plan?.configuration?.complete === true"
                        class="text-medium-emphasis mt-2"
                        data-test="config-transport"
                    >
                        {{
                            t(
                                "cirender.configCarried",
                                { file: preflight.plan.configuration.file },
                                "Every map setting is carried in {file} inside the world archive and applied by the runner, including the complete render mask.",
                            )
                        }}
                    </p>

                    <VCheckbox
                        v-if="preflight.uploadNeeded"
                        v-model="acknowledgeUpload"
                        density="compact"
                        data-test="ack-upload"
                        :label="
                            t(
                                'cirender.ack.upload',
                                'I understand this uploads the whole world folder to GitHub.',
                            )
                        "
                    />
                    <VCheckbox
                        v-if="isPublic"
                        v-model="acknowledgePublic"
                        density="compact"
                        data-test="ack-public"
                        :label="
                            t(
                                'cirender.ack.public',
                                'I understand this repository is PUBLIC and anybody could download the world.',
                            )
                        "
                    />
                    <VCheckbox
                        v-model="forceUpload"
                        density="compact"
                        data-test="force-upload"
                        :label="
                            t('cirender.force', 'Upload again even if the world looks unchanged')
                        "
                    />
                    <VCheckbox
                        v-model="publishToPages"
                        density="compact"
                        data-test="publish-pages"
                        :label="
                            t(
                                'cirender.pages.publish',
                                'Also host the finished map on this repository’s GitHub Pages site',
                            )
                        "
                    />
                    <p v-if="publishToPages" class="text-caption text-medium-emphasis mb-2">
                        {{
                            t(
                                "cirender.pages.explain",
                                "The map is published under the documentation site at /map/, so publishing it does not take that site down. Anybody with the link can see the map, whether or not the repository is private.",
                            )
                        }}
                        {{
                            t(
                                "cirender.pages.parts",
                                "A world too large to assemble on one runner is delivered in parts instead, and a map in parts cannot be hosted this way. The run says so plainly and the map is still downloadable.",
                            )
                        }}
                    </p>

                    <VBtn
                        :prepend-icon="mdiCloudSyncOutline"
                        :disabled="blockedBecause !== null || startRequestInFlight || bootstrapping"
                        :loading="startRequestInFlight || renders.starting.value || bootstrapping"
                        color="primary"
                        data-test="start"
                        @click="start"
                    >
                        {{ t("cirender.start", "Render on GitHub") }}
                    </VBtn>
                    <p
                        v-if="blockedBecause !== null"
                        class="text-medium-emphasis mt-2"
                        data-test="blocked"
                    >
                        {{ blockedBecause }}
                    </p>

                    <!--
                        The world has no project file. Rather than leaving the sentence above
                        pointing at two other screens, offer to write the same generated
                        defaults the wizard would have written - here, where the person is.
                    -->
                    <div v-if="needsDefaultProject" class="mt-3" data-test="default-project">
                        <VBtn
                            :prepend-icon="mdiFileDocumentPlusOutline"
                            :disabled="defaultProjectUnavailableBecause !== null"
                            :loading="creatingDefaultProject"
                            :title="defaultProjectUnavailableBecause ?? undefined"
                            variant="tonal"
                            data-test="default-project-create"
                            @click="createDefaultProject"
                        >
                            {{
                                t(
                                    "cirender.defaultProject.create",
                                    "Set this world up with the defaults",
                                )
                            }}
                        </VBtn>
                        <p class="text-caption text-medium-emphasis mt-2">
                            {{
                                t(
                                    "cirender.defaultProject.explain",
                                    "Writes a project file into the world holding BlueMap's own generated settings and an overworld, nether and end map. Nothing else in the world is touched, and everything in it stays editable from the Projects screen.",
                                )
                            }}
                        </p>
                        <p
                            v-if="defaultProjectUnavailableBecause !== null"
                            class="text-medium-emphasis mt-1"
                            data-test="default-project-unavailable"
                        >
                            {{ defaultProjectUnavailableBecause }}
                        </p>
                        <VAlert
                            v-if="defaultProjectFailure !== null"
                            type="error"
                            variant="tonal"
                            density="compact"
                            class="mt-2"
                            data-test="default-project-failure"
                            role="alert"
                        >
                            {{ defaultProjectFailure }}
                        </VAlert>
                        <p
                            v-else-if="defaultProjectMessage !== null"
                            class="text-success mt-2"
                            data-test="default-project-written"
                            role="status"
                            aria-live="polite"
                        >
                            {{ defaultProjectMessage }}
                        </p>
                    </div>
                </VCardText>
            </VCard>

            <VAlert
                v-if="renders.startFailure.value !== null"
                type="error"
                variant="tonal"
                class="mb-4"
                data-test="start-failure"
            >
                {{ renders.startFailure.value.message }}
                <VBtn
                    v-if="renders.startFailure.value.needsSignIn && props.canOpenSettings"
                    size="small"
                    variant="text"
                    class="mt-2"
                    @click="emit('signIn')"
                >
                    {{
                        renders.startFailure.value.route === "gh"
                            ? t("cirender.gh.openAccounts", "Open GitHub accounts")
                            : t("cirender.signIn", "Open the GitHub sign-in")
                    }}
                </VBtn>
                <VBtn
                    v-if="renders.startFailure.value.needsEula && props.canOpenSettings"
                    size="small"
                    variant="text"
                    class="mt-2"
                    @click="emit('openConsent')"
                >
                    {{ t("cirender.eula.open", "Open the consent setting") }}
                </VBtn>
            </VAlert>

            <!--
                This screen otherwise offers only a form, with nothing telling a first-time
                visitor what sending a render to GitHub buys them over the "Make a map" tab's
                local render. Shown only before the first sync of this session or a resumed
                one is known, so it never sits above a real row pretending the list is empty.
            -->
            <p
                v-if="renders.rows.value.length === 0"
                class="text-medium-emphasis mb-3"
                data-test="no-runs"
            >
                {{
                    t(
                        "cirender.list.empty",
                        'This lists renders sent to GitHub\'s own computers instead of yours, useful for a big world or a computer you would rather not tie up for hours. Nothing has been sent yet; fill in the form above and press "Render on GitHub" to start one.',
                    )
                }}
            </p>

            <VCard v-for="row in renders.rows.value" :key="row.syncId" class="mb-3" data-test="row">
                <!--
                    `owner/repo` is typed by whoever set this render up, and GitHub alone
                    allows a 39-character owner plus a 100-character repo name - long before
                    bilingual mode doubles it again. `VCardTitle` defaults to `overflow:
                    hidden; white-space: nowrap; text-overflow: ellipsis`, and this row's own
                    `d-flex` turns it into a flex container that ellipsis never actually
                    paints (text-overflow has no effect on a flex formatting context), so the
                    title and the state chip were silently clipped at the card edge with no
                    visible cue anything was missing. `ci-row__title` wins on specificity
                    (a scoped class beats Vuetify's bare `.v-card-title`) and lets the row
                    wrap instead.
                -->
                <VCardTitle class="d-flex align-center ga-2 ci-row__title">
                    <span class="ci-row__name">{{ row.repository || row.syncId }}</span>
                    <VChip size="small" data-test="row-state">{{ row.state }}</VChip>
                    <VProgressCircular v-if="row.state === 'running'" indeterminate size="18" />
                </VCardTitle>
                <VCardText>
                    <p>{{ phaseLabel(row.phase, t) }}</p>

                    <!--
                        Which credential is actually driving this sync. Null for the moment
                        between `started` and the first `phase` event - the route genuinely
                        is not known yet, so nothing is shown rather than a placeholder.
                    -->
                    <p v-if="row.route !== null" class="text-medium-emphasis" data-test="row-route">
                        {{ routeLabel(row.route, t) }}
                    </p>

                    <!--
                        The upload's own byte count, and the pieces those bytes are made of.
                        A world is gigabytes and a domestic connection is hours, so a phase
                        label with no number beside it is indistinguishable from a hang for
                        most of an afternoon.
                    -->
                    <template v-if="row.transfer !== null">
                        <VProgressLinear
                            :model-value="row.transfer.percent"
                            class="my-2"
                            data-test="transfer-bar"
                        />
                        <p class="text-medium-emphasis" data-test="transfer">
                            {{ row.transfer.description }} -
                            {{
                                t(
                                    "cirender.transfer.bytes",
                                    {
                                        done: formatBytes(row.transfer.bytesDone, t),
                                        total: formatBytes(row.transfer.bytesTotal, t),
                                    },
                                    "{done} of {total}",
                                )
                            }}
                            <template v-if="row.transfer.assetsTotal > 0">
                                -
                                {{
                                    t(
                                        "cirender.transfer.items",
                                        {
                                            done: row.transfer.assetsDone,
                                            total: row.transfer.assetsTotal,
                                        },
                                        "{done} of {total} pieces",
                                    )
                                }}
                            </template>
                        </p>
                    </template>

                    <p data-test="run-label">{{ runLabel(row.run, t) }}</p>

                    <!--
                        Which wave each shard is in, summed per wave. The workflow runs
                        shards in sequential waves of at most 256; this is the one real
                        proportion available inside a wave still in progress.
                    -->
                    <ul v-if="waves(row).length > 0" class="ci-waves" data-test="wave-summary">
                        <li v-for="w in waves(row)" :key="w.wave">
                            {{
                                t(
                                    "cirender.wave.summary",
                                    { wave: w.wave, done: w.done, total: w.total },
                                    "Wave {wave}: {done} of {total}",
                                )
                            }}
                        </li>
                    </ul>

                    <VBtn
                        v-if="row.run !== null"
                        :prepend-icon="mdiOpenInNew"
                        size="small"
                        variant="text"
                        @click="emit('open', row.run.htmlUrl)"
                    >
                        {{ t("cirender.openRun", "Open the run on GitHub") }}
                    </VBtn>

                    <template v-if="row.run !== null && row.run.jobs.length > 0">
                        <ConfigSearchField
                            v-model="jobQuery"
                            v-model:regex="jobRegex"
                            v-model:flags="jobFlags"
                            :label="t('cirender.jobs.search', 'Search jobs')"
                            :sample="jobSample(row)"
                            density="compact"
                        />
                        <ul class="ci-jobs">
                            <li v-for="job in visibleJobs(row)" :key="job.id" data-test="job">
                                <VChip size="x-small" :color="jobTone(job)">{{ job.status }}</VChip>
                                <span class="ml-2">{{ job.name }}</span>
                                <span
                                    v-if="job.wave !== null"
                                    class="ml-2 text-medium-emphasis"
                                    data-test="job-wave"
                                >
                                    {{ t("cirender.job.wave", { wave: job.wave }, "Wave {wave}") }}
                                </span>
                                <span
                                    v-if="job.conclusion !== null"
                                    class="ml-2 text-medium-emphasis"
                                >
                                    {{ job.conclusion }}
                                </span>
                            </li>
                        </ul>
                    </template>

                    <VAlert
                        v-if="row.failure !== null"
                        type="error"
                        variant="tonal"
                        class="mt-3"
                        data-test="row-failure"
                    >
                        <p>{{ row.failure.message }}</p>
                        <p
                            v-if="row.failure.failingJob !== null"
                            class="mt-2"
                            data-test="failing-job"
                        >
                            {{
                                t(
                                    "cirender.failingJob",
                                    { job: row.failure.failingJob },
                                    "The job that failed: {job}",
                                )
                            }}
                        </p>
                        <p
                            v-if="(row.failure.failingStep ?? null) !== null"
                            class="mt-2"
                            data-test="failing-step"
                        >
                            {{
                                t(
                                    "cirender.failingStep",
                                    { step: row.failure.failingStep },
                                    "The step that failed: {step}",
                                )
                            }}
                        </p>
                        <pre
                            v-if="row.failure.logExcerpt !== null"
                            class="ci-log"
                            data-test="log-excerpt"
                            >{{ row.failure.logExcerpt }}</pre>
                    </VAlert>

                    <VAlert
                        v-if="row.postRenderWarning !== null"
                        type="warning"
                        variant="tonal"
                        class="mt-3"
                        data-test="post-render-warning"
                    >
                        <p>
                            {{
                                t(
                                    "cirender.postRenderWarning.title",
                                    "The map is ready locally, but GitHub Pages was not published.",
                                )
                            }}
                        </p>
                        <p class="mt-1 text-medium-emphasis">
                            {{
                                t(
                                    "cirender.postRenderWarning.detail",
                                    {
                                        run: row.postRenderWarning.runId,
                                        step: row.postRenderWarning.failingStep,
                                    },
                                    'Run {run} produced a verified map, but GitHub Pages was not published because "{step}" failed. The original failed run remains linked as evidence.',
                                )
                            }}
                        </p>
                        <VBtn
                            v-if="renders.canList"
                            size="small"
                            variant="text"
                            class="mt-2"
                            :loading="renders.starting.value"
                            data-test="retry-post-render"
                            @click="retryPostRender(row)"
                        >
                            {{
                                t(
                                    "cirender.postRenderWarning.retry",
                                    "Retry Pages with the uploaded world",
                                )
                            }}
                        </VBtn>
                    </VAlert>

                    <VAlert
                        v-if="row.summary !== null"
                        type="success"
                        variant="tonal"
                        class="mt-3"
                        data-test="row-summary"
                    >
                        {{
                            t(
                                "cirender.done",
                                { map: row.summary.mapName },
                                "{map} is in the map list, rendered on GitHub.",
                            )
                        }}
                        <span
                            v-if="!row.summary.verified"
                            class="d-block mt-1 text-medium-emphasis"
                        >
                            {{
                                t(
                                    "cirender.recorded",
                                    "GitHub published no checksum for the artifact, so its SHA-256 was recorded rather than verified.",
                                )
                            }}
                        </span>
                    </VAlert>

                    <VBtn
                        v-if="row.state === 'running' && renders.canCancel"
                        size="small"
                        variant="text"
                        :loading="row.stopping"
                        data-test="stop"
                        @click="renders.stop(row.syncId)"
                    >
                        {{ t("cirender.stop", "Stop watching") }}
                    </VBtn>

                    <!--
                        Scheduled re-rendering: on or off, one of the four honest cadences,
                        and the workflow's own last check - never a free-typed cron
                        expression. See docs/scheduled-render.md. Absent entirely on a build
                        without both bridge methods, exactly like the guided owner/repository
                        pickers above degrade when their own bridge methods are missing.
                    -->
                    <div v-if="renders.canManageSchedule" class="mt-3" data-test="schedule">
                        <VBtn
                            size="small"
                            variant="text"
                            :prepend-icon="mdiCalendarSyncOutline"
                            data-test="schedule-toggle"
                            @click="toggleSchedule(row)"
                        >
                            {{ t("cirender.schedule.title", "Scheduled re-rendering") }}
                        </VBtn>

                        <VCard
                            v-if="scheduleOpenSyncId === row.syncId"
                            variant="tonal"
                            class="mt-2 pa-3"
                        >
                            <p v-if="renders.loadingSchedule.value" data-test="schedule-loading">
                                {{ t("cirender.schedule.loading", "Reading the schedule...") }}
                            </p>
                            <template v-else-if="renders.schedule.value !== null">
                                <p
                                    v-if="renders.savingSchedule.value"
                                    class="text-medium-emphasis"
                                    data-test="schedule-saving"
                                >
                                    {{ t("cirender.schedule.saving", "Saving...") }}
                                </p>

                                <VSwitch
                                    :model-value="renders.schedule.value.enabled"
                                    :label="t('cirender.schedule.enable', 'Check automatically')"
                                    :loading="renders.savingSchedule.value"
                                    :disabled="renders.savingSchedule.value"
                                    density="compact"
                                    data-test="schedule-enable"
                                    @update:model-value="
                                        (value: boolean | null) =>
                                            saveScheduleFor(row, value === true)
                                    "
                                />

                                <VSelect
                                    v-model="scheduleCadenceChoice"
                                    :items="[
                                        ...SCHEDULE_CADENCES.map((c) => ({
                                            title: cadenceLabel(c),
                                            value: c,
                                        })),
                                        {
                                            title: t(
                                                'cirender.schedule.cadence.custom',
                                                'Custom interval',
                                            ),
                                            value: 'custom',
                                        },
                                    ]"
                                    :label="t('cirender.schedule.cadence', 'How often')"
                                    :disabled="
                                        !renders.schedule.value.enabled ||
                                        renders.savingSchedule.value
                                    "
                                    density="compact"
                                    data-test="schedule-cadence"
                                    @update:model-value="scheduleCadenceChoiceChanged(row)"
                                />

                                <VTextField
                                    v-if="scheduleCadenceChoice === 'custom'"
                                    v-model="scheduleCustomHoursDraft"
                                    type="number"
                                    :min="CUSTOM_SCHEDULE_MIN_HOURS"
                                    :max="CUSTOM_SCHEDULE_MAX_HOURS"
                                    step="1"
                                    :label="
                                        t(
                                            'cirender.schedule.custom.hours',
                                            'Run every this many hours',
                                        )
                                    "
                                    :hint="
                                        t(
                                            'cirender.schedule.custom.hint',
                                            'Choose a whole number from 1 to 168. GitHub checks the schedule while this computer is off.',
                                        )
                                    "
                                    :error-messages="
                                        scheduleCadenceError === null ? [] : [scheduleCadenceError]
                                    "
                                    :disabled="
                                        !renders.schedule.value.enabled ||
                                        renders.savingSchedule.value
                                    "
                                    persistent-hint
                                    density="compact"
                                    data-test="schedule-custom-hours"
                                    @change="saveScheduleFor(row, true)"
                                />

                                <p class="text-medium-emphasis" data-test="schedule-help">
                                    {{
                                        t(
                                            "cirender.schedule.help",
                                            { count: renders.schedule.value.checksPerMonth ?? 0 },
                                            "Checks this world for changes about {count} times a month, and only starts a render when it actually finds one.",
                                        )
                                    }}
                                </p>

                                <p data-test="schedule-lastCheck">
                                    {{ t("cirender.schedule.lastCheck", "Last checked") }}:
                                    {{
                                        renders.schedule.value.lastCheckAt ??
                                        t("cirender.schedule.lastCheck.never", "Never yet")
                                    }}
                                    <template
                                        v-if="renders.schedule.value.lastCheckResult !== null"
                                    >
                                        -
                                        {{
                                            scheduleResultText(
                                                renders.schedule.value.lastCheckResult,
                                            )
                                        }}
                                    </template>
                                </p>
                                <p
                                    v-if="renders.schedule.value.lastCheckReason !== null"
                                    class="text-medium-emphasis"
                                    data-test="schedule-reason"
                                >
                                    {{
                                        t(
                                            "cirender.schedule.reason",
                                            { reason: renders.schedule.value.lastCheckReason },
                                            "Why: {reason}",
                                        )
                                    }}
                                </p>
                                <p
                                    v-if="renders.schedule.value.nextCheckAt !== null"
                                    data-test="schedule-nextCheck"
                                >
                                    {{ t("cirender.schedule.nextCheck", "Next check") }}:
                                    {{ renders.schedule.value.nextCheckAt }}
                                </p>
                                <p
                                    v-if="renders.schedule.value.lastRenderAt !== null"
                                    data-test="schedule-lastRender"
                                >
                                    {{ t("cirender.schedule.lastRender", "Last render started") }}:
                                    {{ renders.schedule.value.lastRenderAt }}
                                </p>
                            </template>

                            <VAlert
                                v-if="
                                    renders.scheduleFailure.value !== null &&
                                    renders.scheduleFailure.value.length > 0
                                "
                                type="warning"
                                variant="tonal"
                                density="compact"
                                class="mt-2"
                                data-test="schedule-failure"
                            >
                                {{ renders.scheduleFailure.value }}
                            </VAlert>
                        </VCard>
                    </div>
                </VCardText>
            </VCard>
        </template>
    </div>
</template>

<style scoped>
/*
 * The prototype's page gutter and measure, exactly as `ProjectsScreen.vue` states them:
 * 30px top, 40px side, 48px bottom, with the content held to 900px so a paragraph never runs
 * the full width of a 1440px window. This screen had no rule of its own at all, so it took
 * whatever inset the shell happened to give it and ran as wide as the window allowed - which
 * on this screen in particular is a long way, because it is mostly prose about consents and
 * runners. Stated here rather than inherited so the screen is correct wherever it is hosted.
 */
.ci-render-screen {
    inline-size: 100%;
    max-inline-size: 900px;
    margin-inline: auto;
    padding: 30px 40px 48px;
}

@media (max-width: 900px) {
    .ci-render-screen {
        padding: 20px 16px 32px;
    }
}

.ci-render-screen__header {
    margin-block-end: 18px;
}

/*
 * The footnote above the artwork already carries the shared sheet's 26px bottom margin, so
 * the picture only needs its own gap underneath it before the first card begins.
 */
.ci-render-screen__artwork {
    margin-block-end: 6px;
}

.ci-jobs,
.ci-waves {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
}

/*
 * The wave list and the run log are the prototype's meta measurement: 12px on
 * on-surface-variant, which is the one colour this application greys text with. Vuetify's
 * `--v-medium-emphasis-opacity` is a translucency over the foreground rather than a role, so
 * two greys that were meant to match did not.
 */
.ci-waves li {
    font-size: 12px;
    line-height: 18px;
    color: rgb(var(--v-theme-on-surface-variant));
}

.ci-log {
    white-space: pre-wrap;
    overflow-x: auto;
    max-height: 16rem;
    font-size: 13px;
    line-height: 19px;
}

/*
 * Beats Vuetify's bare `.v-card-title` (overflow: hidden; white-space: nowrap;
 * text-overflow: ellipsis) on specificity: a scoped class compiles to
 * `.ci-row__title[data-v-xxxx]`, two selector components against the framework
 * rule's one, so it wins regardless of source order. `flex-wrap: wrap` lets the
 * state chip and spinner drop to their own line instead of being pushed past
 * the card edge and clipped by the overflow this rule turns off.
 */
.ci-row__title {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    flex-wrap: wrap;
    row-gap: 4px;
}

.ci-row__name {
    min-width: 0;
    overflow-wrap: anywhere;
}
</style>
