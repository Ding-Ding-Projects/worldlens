<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiBandage } from "@mdi/js";
import { VBtn, VCard, VIcon, VProgressCircular } from "vuetify/components";
import {
    resolveRepairBridge,
    type FailureSummary,
    type RepairBridge,
    type RepairDiagnosis,
    type RepairResult,
} from "./repairBridge.js";

/**
 * The repair offer the Renders page carries for a render that failed.
 *
 * `Worldlens.dc.html` puts it on the Renders job itself rather than only in Settings: an
 * error-container card naming the failure, the evidence the diagnosis read, the proposed edit,
 * and two choices - leave it, or apply it. After either choice the card collapses into a one-line
 * note with a way to bring the offer back.
 *
 * Everything here goes through the same {@link RepairBridge} `RepairPanel.vue` uses. Diagnosis is
 * read-only and deterministic, so it runs as soon as the card is shown: that is what lets the card
 * show what it read *before* proposing anything. Applying is `run()`, which only edits after the
 * person presses the button. With no bridge, or no render failure on record, nothing is drawn -
 * an offer for a failure that does not exist would be a fake.
 */
const props = defineProps<{
    /** Injected in tests. Left out, the Electron bridge is probed; `null` means there is none. */
    bridge?: RepairBridge | null | undefined;
}>();

const { t } = useI18n();

const bridge = props.bridge === undefined ? resolveRepairBridge() : props.bridge;

const failures = ref<readonly FailureSummary[]>([]);
const diagnoses = ref<Record<string, readonly RepairDiagnosis[]>>({});
const diagnoseErrors = ref<Record<string, string>>({});
const results = ref<Record<string, RepairResult>>({});
const runErrors = ref<Record<string, string>>({});
const dismissed = ref<Set<string>>(new Set());
const runningId = ref<string | null>(null);

/** Only a render's failure belongs on the Renders page; a web-server failure stays in Settings. */
const renderFailures = computed(() =>
    failures.value.filter((failure) => failure.subject === "render"),
);

async function load(): Promise<void> {
    if (bridge === null) return;
    try {
        failures.value = await bridge.failures();
    } catch {
        failures.value = [];
        return;
    }
    for (const failure of renderFailures.value) void diagnose(failure.id);
}

async function diagnose(id: string): Promise<void> {
    if (bridge === null) return;
    try {
        const answer = await bridge.diagnose(id);
        if (answer.ok) diagnoses.value = { ...diagnoses.value, [id]: answer.diagnoses };
        else diagnoseErrors.value = { ...diagnoseErrors.value, [id]: answer.message };
    } catch (error) {
        diagnoseErrors.value = {
            ...diagnoseErrors.value,
            [id]: error instanceof Error ? error.message : String(error),
        };
    }
}

async function apply(id: string): Promise<void> {
    if (bridge === null || runningId.value !== null) return;
    runningId.value = id;
    try {
        const answer = await bridge.run(id);
        if (answer.ok) {
            results.value = { ...results.value, [id]: answer.result };
            const { [id]: _removed, ...rest } = runErrors.value;
            runErrors.value = rest;
        } else {
            runErrors.value = { ...runErrors.value, [id]: answer.message };
        }
    } finally {
        runningId.value = null;
    }
}

function dismiss(id: string): void {
    const next = new Set(dismissed.value);
    next.add(id);
    dismissed.value = next;
}

/** "Show it again": forget the local choice so the full offer is back on screen. */
function reset(id: string): void {
    const next = new Set(dismissed.value);
    next.delete(id);
    dismissed.value = next;
    const { [id]: _result, ...rest } = results.value;
    results.value = rest;
}

function isDone(id: string): boolean {
    return dismissed.value.has(id) || results.value[id] !== undefined;
}

function doneNote(id: string): string {
    const result = results.value[id];
    if (result !== undefined) return result.summary;
    return t(
        "repair.offer.leftAlone",
        "Left as it was. The failure stays on record under Settings, Diagnostics.",
    );
}

function proposal(id: string): string | null {
    const found = diagnoses.value[id];
    if (found === undefined) return null;
    const first = found.find((diagnosis) => diagnosis.remedy.kind !== "none") ?? found[0];
    return first?.remedy.summary ?? null;
}

onMounted(() => {
    void load();
});
</script>

<template>
    <div v-if="renderFailures.length > 0" class="mb-repair-offer">
        <template v-for="failure in renderFailures" :key="failure.id">
            <v-card
                v-if="!isDone(failure.id)"
                class="mb-repair-offer__card"
                variant="flat"
                :aria-label="t('repair.offer.label', 'A failed render this build can explain')"
                data-test="repair-offer"
            >
                <div class="mb-repair-offer__head">
                    <v-icon :icon="mdiBandage" size="20" aria-hidden="true" />
                    <h2 class="mb-repair-offer__title">
                        {{
                            t(
                                "repair.offer.title",
                                { mode: failure.mode },
                                "A render failed to start ({mode})",
                            )
                        }}
                    </h2>
                    <span class="mb-repair-offer__at">{{ failure.at }}</span>
                </div>
                <p class="mb-repair-offer__lede">
                    {{
                        t(
                            "repair.offer.lede",
                            "Automatic repair shows what it read before it proposes an edit, so the change is yours to approve rather than something that already happened.",
                        )
                    }}
                </p>

                <div class="mb-repair-offer__evidence" role="status" aria-live="polite">
                    <p
                        v-if="diagnoses[failure.id] === undefined && !diagnoseErrors[failure.id]"
                        class="mb-repair-offer__line"
                    >
                        <v-progress-circular indeterminate size="14" width="2" aria-hidden="true" />
                        {{ t("repair.loading", "Reading what is on record...") }}
                    </p>
                    <p v-else-if="diagnoseErrors[failure.id]" class="mb-repair-offer__line">
                        {{ diagnoseErrors[failure.id] }}
                    </p>
                    <template v-else>
                        <p
                            v-for="(diagnosis, index) in diagnoses[failure.id]"
                            :key="index"
                            class="mb-repair-offer__line"
                        >
                            {{ diagnosis.message }}
                        </p>
                        <p v-if="diagnoses[failure.id]?.length === 0" class="mb-repair-offer__line">
                            {{
                                t(
                                    "repair.unexplained",
                                    "This failure did not match anything this build knows how to explain.",
                                )
                            }}
                        </p>
                    </template>
                </div>

                <p v-if="runErrors[failure.id]" class="mb-repair-offer__error" role="alert">
                    {{ runErrors[failure.id] }}
                </p>

                <div class="mb-repair-offer__actions">
                    <p class="mb-repair-offer__proposal">
                        <template v-if="proposal(failure.id) !== null">
                            {{
                                t(
                                    "repair.offer.proposed",
                                    { remedy: proposal(failure.id) ?? "" },
                                    "Proposed: {remedy}",
                                )
                            }}
                        </template>
                    </p>
                    <v-btn
                        variant="outlined"
                        class="mb-repair-offer__dismiss"
                        :disabled="runningId === failure.id"
                        @click="dismiss(failure.id)"
                    >
                        {{ t("repair.offer.notNow", "Not now") }}
                    </v-btn>
                    <v-btn
                        variant="flat"
                        class="mb-repair-offer__apply"
                        :loading="runningId === failure.id"
                        @click="apply(failure.id)"
                    >
                        {{ t("repair.offer.apply", "Apply the repair") }}
                    </v-btn>
                </div>
            </v-card>

            <v-card
                v-else
                class="mb-repair-offer__done"
                variant="flat"
                data-test="repair-offer-done"
            >
                <v-icon :icon="mdiBandage" size="20" aria-hidden="true" />
                <p class="mb-repair-offer__note" role="status">{{ doneNote(failure.id) }}</p>
                <v-btn variant="outlined" color="primary" @click="reset(failure.id)">
                    {{ t("repair.offer.again", "Show it again") }}
                </v-btn>
            </v-card>
        </template>
    </div>
</template>

<style>
.mb-repair-offer {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/*
 * The prototype's error-container card: no outline, the container role as the surface and its
 * on- role for every line of text, so the card reads as one alarm rather than a bordered box with
 * red text inside it.
 */
.v-application .v-card.mb-repair-offer__card {
    padding: 20px 22px;
    border: none;
    border-radius: var(--md-sys-shape-corner-large);
    background: rgb(var(--v-theme-error-container));
    color: rgb(var(--v-theme-on-error-container));
}

.mb-repair-offer__head {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.mb-repair-offer .mb-repair-offer__title {
    flex: 1 1 auto;
    min-inline-size: 0;
    margin: 0;
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: 500;
    line-height: 22px;
    color: inherit;
    overflow-wrap: anywhere;
}

.mb-repair-offer__at {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
}

.mb-repair-offer__lede {
    margin: 10px 0 14px;
    max-inline-size: 68ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    text-wrap: pretty;
}

.mb-repair-offer__evidence {
    margin-block-end: 14px;
    padding: 12px 14px;
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-background));
    color: rgb(var(--v-theme-on-surface));
}

.mb-repair-offer__line {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 20px;
    overflow-wrap: anywhere;
}

.mb-repair-offer__error {
    margin: 0 0 12px;
    font-size: var(--md-sys-typescale-body-medium-size);
}

.mb-repair-offer__actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.mb-repair-offer__proposal {
    flex: 1 1 16rem;
    margin: 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    overflow-wrap: anywhere;
}

.v-application .v-btn.mb-repair-offer__dismiss {
    color: rgb(var(--v-theme-on-error-container));
    border-color: rgb(var(--v-theme-on-error-container));
}

.v-application .v-btn.mb-repair-offer__apply {
    background: rgb(var(--v-theme-on-error-container));
    color: rgb(var(--v-theme-error-container));
}

.v-application .v-card.mb-repair-offer__done {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 16px 20px;
    color: rgb(var(--v-theme-on-secondary-container));
}

.mb-repair-offer__note {
    flex: 1 1 16rem;
    margin: 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
