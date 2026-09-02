<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCubeOutline, mdiRefresh } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VChip,
    VDialog,
    VProgressCircular,
    VSelect,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { useServerStore } from "./useServers.js";
import type { AdoptionCandidate, HostProfileRecord } from "./serverStore.js";

/**
 * The candidate browser that "Adopt an existing container" was missing.
 *
 * Before this existed, the caller ran `adoptDiscover()`, threw the `Answer.failure` away,
 * took `[0]` of the successes, and returned silently when there was no `[0]`. Three
 * separate lies came out of that: a build with no host or an unwired `adopt` bridge looked
 * exactly like a machine with nothing to adopt; a real permission error from Docker looked
 * like nothing at all, because the click produced no dialog and no message; and a machine
 * with three adoptable containers let the user reach only the first, never told them the
 * other two existed, and never let them choose.
 *
 * So this dialog renders four states that are never allowed to be confused with each other:
 * discovering, discovery-failed (the failure's own words, plus a Retry at the surface where
 * the failure surfaced), empty (succeeded, zero candidates, said as such and never dressed
 * up as an error), and the full candidate list. The list is never truncated and a candidate
 * is never auto-picked: picking is the user's, which is the whole point of adopting
 * something this app did not create.
 */
const props = defineProps<{ modelValue: boolean; hostId?: string | null }>();
const emit = defineEmits<{
    "update:modelValue": [value: boolean];
    picked: [candidate: AdoptionCandidate, hostId: string | null];
}>();

const { t } = useI18n();
const store = useServerStore();

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const discovering = ref(false);
const candidates = ref<readonly AdoptionCandidate[]>([]);
/**
 * The failure is kept whole rather than flattened to a string, because `detail` carries the
 * part a user can act on (which socket, which permission) and paraphrasing it away is
 * precisely the defect this component exists to fix.
 */
const failure = ref<{ readonly message: string; readonly detail: string | null } | null>(null);
/** Distinguishes "zero candidates" from "we have not looked yet", which read identically otherwise. */
const attempted = ref(false);
const selectedHostId = ref<string | null>(props.hostId ?? null);
const profiles = ref<readonly HostProfileRecord[]>([]);
const profileQuery = ref("");
const profileRegex = ref(false);
const profileFlags = ref("i");
const profileFailure = ref<string | null>(null);
const profileLoading = ref(false);
const profileMatcher = computed(() => createSettingMatcher(profileQuery.value, profileRegex.value, profileFlags.value));
const profileItems = computed(() => profiles.value.filter((profile) => profileMatcher.value.test(`${profile.hostId} ${profile.target.label} ${profile.target.user}@${profile.target.host}`)));

async function loadProfiles(): Promise<void> {
    if (props.hostId !== undefined && props.hostId !== null) {
        selectedHostId.value = props.hostId;
        return;
    }
    profileLoading.value = true;
    profileFailure.value = null;
    const result = await store.hostProfiles.list();
    if (result.ok) profiles.value = result.value ?? [];
    else profileFailure.value = result.failure?.message ?? t("mcserver.adoptBrowser.profileFailure", "SSH host profiles could not be loaded.");
    profileLoading.value = false;
}

async function discover(): Promise<void> {
    discovering.value = true;
    failure.value = null;
    const result = await store.adoptDiscover(selectedHostId.value);
    if (result.ok) {
        candidates.value = result.value ?? [];
    } else {
        // A failed discovery must not leave a stale list behind it, or the previous run's
        // containers would be offered as though this run had found them.
        candidates.value = [];
        failure.value = {
            message: result.failure?.message ?? t("mcserver.adoptBrowser.unknownFailure", "Discovery failed for an unrecorded reason."),
            detail: result.failure?.detail ?? null,
        };
    }
    attempted.value = true;
    discovering.value = false;
}

// Discovery is per-opening, not per-mount: containers appear and disappear on the machine
// while this dialog is closed, so a list cached from the last opening would be fiction.
watch(
    () => props.modelValue,
    (isOpen) => {
        if (isOpen) {
            void loadProfiles();
            void discover();
        }
    },
    { immediate: true },
);

const query = ref("");
const useRegex = ref(false);
const flags = ref("i");
const matcher = computed(() => createSettingMatcher(query.value, useRegex.value, flags.value));

function searchableText(candidate: AdoptionCandidate): string {
    return [
        candidate.containerName,
        candidate.containerId,
        candidate.image,
        candidate.guessedFlavour ?? "",
        candidate.guessedVersion ?? "",
    ].join(" ");
}

const filtered = computed(() => candidates.value.filter((candidate) => matcher.value.test(searchableText(candidate))));

/** The builder previews against the real corpus, one candidate per line, as every other list here does. */
const sampleText = computed(() => candidates.value.map(searchableText).join(String.fromCharCode(10)));

const filterSummary = computed(() =>
    t(
        "mcserver.adoptBrowser.filterSummary",
        { shown: filtered.value.length, total: candidates.value.length },
        "Showing {shown} of {total}",
    ),
);

/**
 * Flavour and version are heuristics read off an image tag, never something the container
 * told us. Rendering them bare would turn a guess into a fact the user then trusts when
 * deciding which container to hand this app control of, so they are always labelled, and
 * their absence is stated instead of left as blank space.
 */
function guessLabel(candidate: AdoptionCandidate): string | null {
    const parts = [candidate.guessedFlavour, candidate.guessedVersion].filter((part): part is string => part !== null);
    if (parts.length === 0) return null;
    return t("mcserver.adoptBrowser.guess", { guess: parts.join(" ") }, "Best guess: {guess}");
}

function choose(candidate: AdoptionCandidate): void {
    emit("picked", candidate, selectedHostId.value);
    open.value = false;
}
</script>

<template>
    <VDialog v-model="open" max-width="640" scrollable>
        <VCard>
            <VCardTitle>{{ t("mcserver.adoptBrowser.title", "Adopt an existing container") }}</VCardTitle>
            <VCardText>
                <div class="wl-adoptbrowser__blurb">
                    {{
                        t(
                            "mcserver.adoptBrowser.blurb",
                            "These are Docker containers already running on this machine that look like Minecraft servers. This app created none of them, so pick the one you want to review before anything is adopted.",
                        )
                    }}
                </div>

                <template v-if="props.hostId === undefined || props.hostId === null">
                    <ConfigSearchField
                        v-if="profiles.length > 0"
                        v-model="profileQuery"
                        v-model:regex="profileRegex"
                        v-model:flags="profileFlags"
                        :label="t('mcserver.adoptBrowser.profileSearch', 'Search SSH host profiles')"
                        :sample="profiles.map((profile) => `${profile.hostId} ${profile.target.label} ${profile.target.host}`).join(String.fromCharCode(10))"
                        class="mb-2"
                    />
                    <VSelect
                        v-model="selectedHostId"
                        :items="[{ title: t('mcserver.adoptBrowser.localHost', 'This computer'), value: null }, ...profileItems.map((profile) => ({ title: `${profile.target.label} · ${profile.target.user}@${profile.target.host}`, value: profile.hostId }))]"
                        item-title="title"
                        item-value="value"
                        :label="t('mcserver.adoptBrowser.target', 'Discovery target')"
                        :loading="profileLoading"
                        clearable
                        class="mb-2"
                    >
                        <template #prepend-item>
                            <div class="pa-2" @click.stop>
                                <ConfigSearchField
                                    v-model="profileQuery"
                                    v-model:regex="profileRegex"
                                    v-model:flags="profileFlags"
                                    :label="t('mcserver.adoptBrowser.dropdownSearch', 'Search this host list')"
                                    :sample="profiles.map((profile) => `${profile.hostId} ${profile.target.label} ${profile.target.host}`).join(String.fromCharCode(10))"
                                />
                            </div>
                        </template>
                    </VSelect>
                    <VAlert v-if="profileFailure" type="warning" variant="tonal" class="mb-2">{{ profileFailure }}</VAlert>
                    <VAlert v-else-if="!profileLoading && profiles.length === 0" type="info" variant="tonal" class="mb-2">
                        {{ t("mcserver.adoptBrowser.noProfiles", "No saved SSH host profiles yet. Local container discovery remains available; add a profile from the server list to inspect a remote host.") }}
                    </VAlert>
                </template>

                <div v-if="discovering" class="wl-adoptbrowser__loading" role="status" aria-live="polite">
                    <VProgressCircular indeterminate size="24" />
                    <span>{{ t("mcserver.adoptBrowser.discovering", "Looking for containers on this machine...") }}</span>
                </div>

                <VAlert v-else-if="failure" type="warning" variant="tonal" role="alert">
                    <div>{{ failure.message }}</div>
                    <div v-if="failure.detail" class="wl-adoptbrowser__detail">{{ failure.detail }}</div>
                    <template #append>
                        <VBtn :prepend-icon="mdiRefresh" variant="text" @click="discover">
                            {{ t("mcserver.adoptBrowser.retry", "Try again") }}
                        </VBtn>
                    </template>
                </VAlert>

                <template v-else-if="attempted && candidates.length === 0">
                    <VAlert type="info" variant="tonal" role="status">
                        {{
                            t(
                                "mcserver.adoptBrowser.empty",
                                "Nothing to adopt yet. This list shows Docker containers on this machine that look like Minecraft servers, so it fills up once such a container exists here. If you have just started one, look again.",
                            )
                        }}
                        <template #append>
                            <VBtn :prepend-icon="mdiRefresh" variant="text" @click="discover">
                                {{ t("mcserver.adoptBrowser.retry", "Try again") }}
                            </VBtn>
                        </template>
                    </VAlert>
                </template>

                <template v-else-if="candidates.length > 0">
                    <ConfigSearchField
                        v-model="query"
                        v-model:regex="useRegex"
                        v-model:flags="flags"
                        :label="t('mcserver.adoptBrowser.search', 'Search containers')"
                        :placeholder="t('mcserver.adoptBrowser.searchHint', 'Name, container id or image')"
                        :sample="sampleText"
                        :summary="filterSummary"
                        class="wl-adoptbrowser__search"
                    />

                    <div v-if="filtered.length === 0" class="wl-adoptbrowser__noMatch" role="status">
                        {{ t("mcserver.adoptBrowser.noMatches", "No container matches that search.") }}
                    </div>

                    <ul v-else class="wl-adoptbrowser__list">
                        <li v-for="candidate in filtered" :key="candidate.containerId">
                            <button
                                type="button"
                                class="wl-adoptbrowser__row"
                                :aria-label="
                                    t(
                                        'mcserver.adoptBrowser.chooseOne',
                                        { name: candidate.containerName },
                                        'Review {name} for adoption',
                                    )
                                "
                                @click="choose(candidate)"
                            >
                                <span class="wl-adoptbrowser__name">{{ candidate.containerName }}</span>
                                <span class="wl-adoptbrowser__mono">{{ candidate.containerId }}</span>
                                <span class="wl-adoptbrowser__mono">{{ candidate.image }}</span>
                                <VChip v-if="guessLabel(candidate)" size="small" variant="tonal" :prepend-icon="mdiCubeOutline">
                                    {{ guessLabel(candidate) }}
                                </VChip>
                                <span v-else class="wl-adoptbrowser__noGuess">
                                    {{ t("mcserver.adoptBrowser.noGuess", "No flavour or version could be guessed from this image.") }}
                                </span>
                            </button>
                        </li>
                    </ul>
                </template>
            </VCardText>
            <VCardActions>
                <VBtn
                    :prepend-icon="mdiRefresh"
                    variant="text"
                    :disabled="discovering"
                    @click="discover"
                >
                    {{ t("mcserver.adoptBrowser.rediscover", "Look again") }}
                </VBtn>
                <VBtn variant="text" @click="open = false">{{ t("common.close", "Close") }}</VBtn>
            </VCardActions>
        </VCard>
    </VDialog>
</template>

<style scoped>
.wl-adoptbrowser__blurb {
    color: rgb(var(--v-theme-on-surface-variant));
    margin-bottom: 12px;
}
.wl-adoptbrowser__loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 24px 0;
}
.wl-adoptbrowser__detail {
    color: rgb(var(--v-theme-on-surface-variant));
    margin-top: 4px;
    font-family: monospace;
}
.wl-adoptbrowser__search {
    margin-bottom: 8px;
}
.wl-adoptbrowser__noMatch {
    color: rgb(var(--v-theme-on-surface-variant));
    padding: 12px 0;
}
.wl-adoptbrowser__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.wl-adoptbrowser__row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    width: 100%;
    min-height: 48px;
    padding: 12px;
    text-align: left;
    cursor: pointer;
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-md);
}
.wl-adoptbrowser__row:hover {
    background: rgb(var(--v-theme-surface-variant));
    box-shadow: var(--md-sys-elevation-shadow-level1);
}
.wl-adoptbrowser__row:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
.wl-adoptbrowser__name {
    font-weight: 600;
}
.wl-adoptbrowser__mono {
    font-family: monospace;
    color: rgb(var(--v-theme-on-surface-variant));
    overflow-wrap: anywhere;
}
.wl-adoptbrowser__noGuess {
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
