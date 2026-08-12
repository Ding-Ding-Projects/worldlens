<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VCard, VCardText, VCardTitle, VChip, VSelect, VTextarea } from "vuetify/components";

import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { useLockStore } from "./useLocks.js";

/**
 * The recovery desk, dressed as a support desk, because the bit is the point.
 *
 * Somebody who has forgotten the password to a for-fun lock needs exactly one thing: the
 * folder, and permission to delete it. That could have been a sentence. It is a ticketing
 * system instead - a category, a description, a locally generated ticket number, a severity
 * nobody will honour, a status that advances, and a canned first response delivered with the
 * gravity of a service desk that has read the manual once - and then the "resolution" does
 * the only thing that actually works: it opens the application-data folder so the person can
 * delete it themselves.
 *
 * ## Three things are not jokes, and they are the ones that matter
 *
 * **Nothing is sent anywhere.** No network request, no telemetry, no analytics, nobody
 * reading it. That is stated in one plain line, outside the comedy and unstyled by the funny
 * level, because a person must never sit waiting for a reply that was never coming. It is
 * the one sentence in this component that the joke may not touch.
 *
 * **The folder path is exact, and the button opens that exact folder.** The path shown and
 * the path opened are the same string, from the same source. A recovery route that gestures
 * at "app data" is not a recovery route.
 *
 * **Nothing is deleted here.** The app opens the folder and stands back; the deletion is the
 * person's own act in their own file manager. An in-app delete would be a destructive action
 * and would have to go through the two-key gate like any other - never behind a joke button.
 *
 * ## And one thing that is deliberately absent
 *
 * No real company's support branding, no invented agent's name, no response time that
 * implies a human. The desk is this application's own fictional one. Impersonating a real
 * organisation's support is out of bounds here exactly as it is everywhere else.
 */
const props = defineProps<{
    /** Opens the application-data folder in the platform's file manager. */
    openDataFolder?: (() => Promise<boolean>) | undefined;
}>();

const { t } = useI18n();
const store = useLockStore();

interface Ticket {
    readonly id: string;
    readonly category: string;
    readonly description: string;
    readonly severity: string;
    readonly openedAt: string;
    status: "open" | "triaged" | "resolved";
}

const tickets = ref<Ticket[]>([]);
const category = ref("locked-out");
const description = ref("");
const query = ref("");
const regex = ref(false);
const flags = ref("i");
const openFailed = ref<string | null>(null);

const categories = computed(() => [
    { value: "locked-out", title: t("support.category.lockedOut", "I am locked out of something") },
    { value: "forgot", title: t("support.category.forgot", "I have forgotten a password") },
    { value: "authenticator", title: t("support.category.authenticator", "My authenticator is gone") },
    { value: "other", title: t("support.category.other", "Something else entirely") },
]);

/**
 * A ticket number that looks like a ticket number and is generated entirely on this machine.
 *
 * Deliberately not sequential across restarts: there is no ticket system to be sequential
 * within, and a number that implied a queue position would be the one part of the joke that
 * told somebody something false about the world.
 */
function nextTicketId(): string {
    const digits = new Uint32Array(1);
    crypto.getRandomValues(digits);
    return `WL-${String(digits[0]! % 900000 + 100000)}`;
}

function raise(): void {
    if (description.value.trim() === "") return;
    tickets.value = [
        {
            id: nextTicketId(),
            category: category.value,
            description: description.value.trim(),
            severity: t("support.severity.urgent", "Urgent - Priority One"),
            openedAt: new Date().toISOString(),
            status: "triaged",
        },
        ...tickets.value,
    ];
    description.value = "";
}

const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));
const listed = computed(() =>
    tickets.value.filter((ticket) => matcher.value.test(`${ticket.id} ${ticket.description}`)),
);
const sample = computed(() => tickets.value.map((ticket) => ticket.description).join("\n"));

const summary = computed(() =>
    matcher.value.error !== null
        ? t("support.badPattern", "The pattern is not valid, so nothing is listed.")
        : matcher.value.active
          ? t(
                "support.listSummary",
                { shown: listed.value.length, total: tickets.value.length },
                "{shown} of {total} tickets match.",
            )
          : "",
);

/**
 * The resolution: open the folder, and let the person do the deleting.
 *
 * Reports honestly when the file manager cannot be launched rather than marking the ticket
 * resolved and leaving somebody staring at a desktop where nothing happened.
 */
async function resolve(ticket: Ticket): Promise<void> {
    openFailed.value = null;
    if (props.openDataFolder === undefined) {
        openFailed.value = t(
            "support.cannotOpen",
            "This build cannot open a file manager. The folder is named above; open it yourself.",
        );
        return;
    }
    const opened = await props.openDataFolder();
    if (!opened) {
        openFailed.value = t(
            "support.openFailed",
            "The file manager did not open. The folder is named above; open it yourself.",
        );
        return;
    }
    ticket.status = "resolved";
}
</script>

<template>
    <section class="mb-support" data-test="support-tickets">
        <h2 class="mb-page-title">{{ t("support.title", "Support Tickets") }}</h2>

        <!--
            The one line the funny level may not touch. Somebody must never sit waiting for a
            reply that was never coming, so this is stated plainly, before the comedy, and
            never softened.
        -->
        <VAlert
            type="info"
            variant="tonal"
            density="compact"
            class="mb-4"
            data-test="support-disclosure"
            role="status"
        >
            {{
                t(
                    "support.disclosure",
                    "Nothing here is sent anywhere. No ticket exists outside this computer, no network request is made, no data is collected, and nobody is reading it. This desk is part of this application and is not a real support service.",
                )
            }}
        </VAlert>

        <VCard class="mb-4">
            <VCardTitle>{{ t("support.raise", "Raise a ticket") }}</VCardTitle>
            <VCardText>
                <VSelect
                    v-model="category"
                    :items="categories"
                    :label="t('support.category', 'What has happened')"
                    density="compact"
                    data-test="support-category"
                />
                <VTextarea
                    v-model="description"
                    :label="t('support.describe', 'Describe the problem in your own words')"
                    rows="3"
                    density="compact"
                    data-test="support-description"
                />
                <VBtn
                    color="primary"
                    :disabled="description.trim() === ''"
                    data-test="support-submit"
                    @click="raise"
                >
                    {{ t("support.submit", "Submit ticket") }}
                </VBtn>
            </VCardText>
        </VCard>

        <!--
            The exact folder, in text, beside the button that opens that exact folder. The
            path shown and the path opened come from the same source, so they cannot disagree.
        -->
        <VCard class="mb-4">
            <VCardTitle>{{ t("support.knownResolution", "Known resolution") }}</VCardTitle>
            <VCardText>
                <p class="mb-2">
                    {{
                        t(
                            "support.resolutionText",
                            "Every lock on this computer is cleared by deleting this application's local data folder. Your worlds and your rendered maps are not in it. Your settings, your history and your tickets are, and they go too.",
                        )
                    }}
                </p>
                <p v-if="store.dataFolder" class="mb-support__path" data-test="support-folder">
                    {{ store.dataFolder }}
                </p>
                <p v-else class="text-medium-emphasis mb-2" data-test="support-folder-unknown">
                    {{
                        t(
                            "support.folderUnknown",
                            "This build cannot say where that folder is, so it cannot open it either.",
                        )
                    }}
                </p>
                <p class="text-medium-emphasis" data-test="support-no-delete">
                    {{
                        t(
                            "support.weDoNotDelete",
                            "This application does not delete it for you. It opens the folder; the deleting is yours to do.",
                        )
                    }}
                </p>
            </VCardText>
        </VCard>

        <ConfigSearchField
            v-model="query"
            v-model:regex="regex"
            v-model:flags="flags"
            :label="t('support.search', 'Search your tickets')"
            :sample="sample"
            :summary="summary"
        />

        <p v-if="tickets.length === 0" class="text-medium-emphasis mt-3" data-test="support-empty">
            {{ t("support.empty", "No tickets. Nothing has gone wrong yet, or nothing you have told this desk about.") }}
        </p>

        <VCard v-for="ticket in listed" :key="ticket.id" class="mt-3" data-test="support-ticket">
            <VCardTitle class="d-flex align-center ga-2 flex-wrap">
                <span>{{ ticket.id }}</span>
                <VChip size="small" variant="tonal">{{ ticket.severity }}</VChip>
                <VChip size="small" variant="outlined" data-test="support-status">
                    {{
                        ticket.status === "resolved"
                            ? t("support.status.resolved", "Resolved")
                            : t("support.status.triaged", "Triaged - awaiting your action")
                    }}
                </VChip>
            </VCardTitle>
            <VCardText>
                <p class="mb-2">{{ ticket.description }}</p>
                <!--
                    The canned first response. Played straight, which is what makes it work,
                    and it never claims a person wrote it.
                -->
                <blockquote class="mb-support__reply" data-test="support-reply">
                    {{
                        t(
                            "support.cannedReply",
                            "Thank you for contacting Support. Your ticket has been assigned Priority One and escalated to the only engineer, who is this application. Having reviewed the case in depth, the recommended resolution is the one below, which is also the only one.",
                        )
                    }}
                </blockquote>
                <VBtn
                    variant="tonal"
                    :disabled="store.dataFolder === null"
                    data-test="support-resolve"
                    @click="resolve(ticket)"
                >
                    {{ t("support.openFolder", "Open the folder so I can delete it") }}
                </VBtn>
            </VCardText>
        </VCard>

        <VAlert
            v-if="openFailed !== null"
            type="warning"
            variant="tonal"
            density="compact"
            class="mt-3"
            data-test="support-open-failed"
            role="alert"
        >
            {{ openFailed }}
        </VAlert>
    </section>
</template>

<style scoped>
.mb-support__path {
    font-family: var(--mb-font-mono, monospace);
    overflow-wrap: anywhere;
    margin-bottom: 0.5rem;
}

.mb-support__reply {
    border-left: 3px solid rgb(var(--v-theme-primary, 0 0 0));
    padding-left: 0.75rem;
    margin-bottom: 0.75rem;
    font: var(--mb-body-small, inherit);
}
</style>
