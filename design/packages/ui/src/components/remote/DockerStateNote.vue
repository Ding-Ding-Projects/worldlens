<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { mdiChevronDown, mdiChevronUp, mdiPlay } from "@mdi/js";
import { VAlert, VBtn, VProgressCircular } from "vuetify/components";
import type { DockerNote } from "./dockerStates.js";

type StartOutcome = "started" | "already-running" | "timed-out" | "unsupported" | "failed";

interface StartHost {
    startDockerRuntime(): Promise<{
        readonly outcome: StartOutcome;
        readonly message: string;
        readonly detail: string | null;
    }>;
}

/**
 * The bridge, if this build has one.
 *
 * Probed rather than assumed, exactly as `useLocks` probes for its own host: a renderer
 * running beside an older shell must render a disabled control with a reason, not a button
 * that throws when pressed.
 */
function resolveStartHost(): StartHost | null {
    const bridge = (globalThis as { worldlens?: Partial<StartHost> }).worldlens;
    return typeof bridge?.startDockerRuntime === "function" ? (bridge as StartHost) : null;
}

/**
 * One of Docker's five states, rendered as the three sentences it deserves.
 *
 * A headline naming the state (with the version in it whenever Docker was willing to say
 * one), what it means, and the single next thing to do. Docker's own words go behind a
 * disclosure rather than into the paragraph, because they are the precise thing to search
 * for and the least readable thing on the screen.
 *
 * The tone is the note's, not this component's: `available` is a success, a stopped daemon
 * is a warning, a missing installation is merely information - because on a machine that
 * renders locally, Docker not being installed is not a problem at all.
 */
const props = defineProps<{ note: DockerNote }>();
const emit = defineEmits<{ (event: "started"): void }>();

const { t } = useI18n();

const detailOpen = ref(false);
const detailId = useId();

const startHost = resolveStartHost();
const starting = ref(false);
const startResult = ref<{ outcome: StartOutcome; message: string; detail: string | null } | null>(null);

/**
 * Only a stopped engine can be started.
 *
 * A Docker that is not installed needs a download, and offering to start it would be a
 * button that could never work - the decorative control this codebase forbids everywhere
 * else.
 */
const canOffer = computed(() => props.note.status === "daemon-unreachable");

/** Why the button is disabled, in words, rather than a control that is merely grey. */
const disabledReason = computed(() => {
    if (startHost === null) {
        return t(
            "remote.docker.start.noHost",
            "This build cannot start Docker for you.",
        );
    }
    return null;
});

async function start(): Promise<void> {
    if (startHost === null || starting.value) return;
    starting.value = true;
    startResult.value = null;
    try {
        const result = await startHost.startDockerRuntime();
        startResult.value = result;
        // Only a genuine answer from the engine counts as started. "timed-out" means it is
        // probably still coming up, and saying otherwise would be the comfortable lie.
        if (result.outcome === "started" || result.outcome === "already-running") emit("started");
    } catch (error) {
        startResult.value = {
            outcome: "failed",
            message: t("remote.docker.start.failed", "Docker could not be started."),
            detail: error instanceof Error ? error.message : String(error),
        };
    } finally {
        starting.value = false;
    }
}
</script>

<template>
    <v-alert
        :type="note.tone"
        density="compact"
        variant="tonal"
        class="mb-remote-docker"
        :data-docker-status="note.status"
    >
        <p class="mb-remote-docker__headline">{{ note.headline }}</p>
        <p class="mb-remote-docker__line">{{ note.explanation }}</p>
        <p class="mb-remote-docker__line mb-remote-docker__next">
            <strong>{{ t("remote.docker.nextLabel", "Next:") }}</strong>
            {{ note.nextStep }}
        </p>

        <div v-if="canOffer" class="mb-remote-docker__actions">
            <v-btn
                :prepend-icon="starting ? undefined : mdiPlay"
                :disabled="starting || disabledReason !== null"
                variant="tonal"
                size="small"
                density="comfortable"
                data-testid="docker-start"
                @click="start"
            >
                <v-progress-circular
                    v-if="starting"
                    indeterminate
                    size="16"
                    width="2"
                    class="mb-remote-docker__spinner"
                />
                {{
                    starting
                        ? t("remote.docker.start.working", "Starting Docker...")
                        : t("remote.docker.start.action", "Start Docker")
                }}
            </v-btn>
            <p v-if="disabledReason" class="mb-remote-docker__line">{{ disabledReason }}</p>
            <p v-if="starting" class="mb-remote-docker__line">
                {{
                    t(
                        "remote.docker.start.patience",
                        "Docker's engine can take a minute or two to come up. This waits for it to actually answer.",
                    )
                }}
            </p>
            <p v-else-if="startResult" class="mb-remote-docker__line">{{ startResult.message }}</p>
            <p v-if="!starting && startResult?.detail" class="mb-remote-docker__line">
                {{ startResult.detail }}
            </p>
        </div>

        <template v-if="note.detail">
            <v-btn
                :prepend-icon="detailOpen ? mdiChevronUp : mdiChevronDown"
                :aria-expanded="detailOpen ? 'true' : 'false'"
                :aria-controls="detailId"
                variant="text"
                size="small"
                density="comfortable"
                @click="detailOpen = !detailOpen"
            >
                {{
                    detailOpen
                        ? t("remote.docker.hideDetail", "Hide what Docker said")
                        : t("remote.docker.showDetail", "Show what Docker said")
                }}
            </v-btn>
            <pre v-if="detailOpen" :id="detailId" class="mb-remote-docker__detail">{{ note.detail }}</pre>
        </template>
    </v-alert>
</template>

<style>
.mb-remote-docker {
    margin-block-start: 8px;
}

.mb-remote-docker__headline {
    font-weight: 500;
}

/* The detail toggle is size="small", which the shell layer floors at 34px through
   `.mb-shell-layer .v-btn--size-small` - a rule this one has to out-specify, not merely
   follow, to raise the pressable area to the 44px hit-target floor without changing the
   compact type. */
.mb-remote-docker .v-btn,
.mb-shell-layer .mb-remote-docker .v-btn.v-btn--size-small {
    min-block-size: 44px;
}

.mb-remote-docker__actions {
    margin-block-start: 10px;
}

.mb-remote-docker__spinner {
    margin-inline-end: 6px;
}

.mb-remote-docker__line {
    margin-block-start: 4px;
    font-size: 0.8125rem;
    line-height: 1.5;
    text-wrap: pretty;
}

.mb-remote-docker__next {
    margin-block-start: 6px;
}

.mb-remote-docker__detail {
    margin-block-start: 6px;
    max-height: 30vh;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
}
</style>
