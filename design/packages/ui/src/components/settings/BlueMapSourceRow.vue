<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn } from "vuetify/components";
import {
    attachBlueMapSourceBridge,
    blueMapSourceStore,
    checkBlueMapUpstream,
    refreshBlueMapSource,
} from "./bluemapSourceStore.js";

/**
 * Which BlueMap this installation renders with, and whether upstream has moved past it.
 *
 * The row shows what is recorded and nothing beyond it. That restraint is the feature: the
 * jars are upstream's own code compiled unmodified from a pinned submodule commit, so the only
 * honest source for "which BlueMap is this" is the record the build wrote beside them. When
 * that record is missing the row says the jars cannot be shown to have come from any
 * particular commit, rather than reading the pin out of the checkout and presenting it as
 * though it described the jar sitting on disk. Those two are the same sentence and a
 * completely different claim.
 *
 * The upstream half is asked only when the button is pressed, and its failures are reported as
 * failures. "GitHub could not be asked" is never rendered as "you are up to date", which is
 * the one wrong answer a section like this can give that nobody would notice.
 */
const { t } = useI18n();

onMounted(() => {
    attachBlueMapSourceBridge();
    void refreshBlueMapSource();
});

const report = computed(() => blueMapSourceStore.report);
const jars = computed(() => report.value?.jars ?? null);
const upstream = computed(() => report.value?.upstream ?? null);

/**
 * When the build ran, in the reader's own locale, or null when the record did not say.
 *
 * A stamp written by an older build may carry no time at all, and an unparseable one is
 * treated the same way: the row shows the fields it genuinely has rather than the string
 * `Invalid Date`, which reads as a defect in the app rather than as a gap in the record.
 */
const builtAt = computed<string | null>(() => {
    const raw = jars.value?.builtAt ?? null;
    if (raw === null) return null;
    const when = new Date(raw);
    return Number.isNaN(when.getTime()) ? null : when.toLocaleString();
});

const publishedAt = computed<string | null>(() => {
    const raw = upstream.value?.publishedAt ?? null;
    if (raw === null) return null;
    const when = new Date(raw);
    return Number.isNaN(when.getTime()) ? null : when.toLocaleString();
});

/**
 * The one sentence about the upstream comparison, chosen by a literal `t()` per branch.
 *
 * A key assembled from `comparison` would read as four catalogue entries nobody calls, and the
 * coverage guard cannot tell an assembled key from one whose call site was deleted.
 */
const comparisonText = computed<string | null>(() => {
    const found = upstream.value;
    if (found === null) return null;
    switch (found.comparison) {
        case "level":
            return t(
                "settings.bluemapSource.level",
                "These jars were built from the newest BlueMap release. Nothing to do.",
            );
        case "behind":
            return t(
                "settings.bluemapSource.behind",
                "A newer BlueMap release exists. Nothing has changed in this installation: moving to it compiles and ships new third-party code, so it is a deliberate step somebody takes rather than something this app does on its own.",
            );
        case "ahead":
            return t(
                "settings.bluemapSource.ahead",
                "These jars were built from a commit newer than the newest release, which is what a pin advanced past a tag looks like.",
            );
        case "diverged":
            return t(
                "settings.bluemapSource.diverged",
                "The commit these jars were built from and the newest release have both moved since they last shared history.",
            );
    }
});

function onCheck(): void {
    void checkBlueMapUpstream();
}
</script>

<template>
    <div class="mb-bluemap-source">
        <p class="mb-bluemap-source__note">
            {{
                t(
                    "settings.bluemapSource.unmodified",
                    "The rendering engine is BlueMap's own code, compiled unmodified from a pinned copy of its source that ships with this repository. Nothing below is this app's version number.",
                )
            }}
        </p>

        <p v-if="!blueMapSourceStore.available" class="mb-bluemap-source__note">
            {{
                t(
                    "settings.bluemapSource.unavailable",
                    "This build cannot look at the jars on disk, so it cannot say which BlueMap they came from. The desktop app can; a browser tab has no access to the files.",
                )
            }}
        </p>

        <template v-else>
            <dl v-if="jars !== null" class="mb-bluemap-source__facts">
                <dt>{{ t("settings.bluemapSource.builtFrom", "Built from BlueMap commit") }}</dt>
                <dd><code>{{ jars.shortCommit }}</code></dd>

                <template v-if="jars.version !== null">
                    <dt>{{ t("settings.bluemapSource.version", "BlueMap version") }}</dt>
                    <dd>{{ jars.version }}</dd>
                </template>

                <template v-if="builtAt !== null">
                    <dt>{{ t("settings.bluemapSource.builtAt", "Built") }}</dt>
                    <dd>{{ builtAt }}</dd>
                </template>

                <dt>{{ t("settings.bluemapSource.jarPath", "Jar") }}</dt>
                <dd><code>{{ jars.jarPath }}</code></dd>
            </dl>

            <v-alert
                v-else-if="report !== null && report.jarsReason !== null"
                type="warning"
                variant="tonal"
                density="comfortable"
                class="mb-bluemap-source__alert"
            >
                {{ report.jarsReason }}
            </v-alert>

            <div class="mb-bluemap-source__actions">
                <v-btn
                    :loading="blueMapSourceStore.busy"
                    :disabled="blueMapSourceStore.busy"
                    variant="tonal"
                    @click="onCheck"
                >
                    {{ t("settings.bluemapSource.check", "Check for a newer BlueMap") }}
                </v-btn>
            </div>

            <dl v-if="upstream !== null" class="mb-bluemap-source__facts">
                <dt>{{ t("settings.bluemapSource.newestRelease", "Newest BlueMap release") }}</dt>
                <dd>{{ upstream.ref }} (<code>{{ upstream.shortCommit }}</code>)</dd>

                <template v-if="publishedAt !== null">
                    <dt>{{ t("settings.bluemapSource.published", "Published") }}</dt>
                    <dd>{{ publishedAt }}</dd>
                </template>

                <template v-if="upstream.commitsBehind > 0">
                    <dt>{{ t("settings.bluemapSource.commitsBehind", "Commits behind that release") }}</dt>
                    <dd>{{ upstream.commitsBehind }}</dd>
                </template>
            </dl>

            <p v-if="comparisonText !== null" class="mb-bluemap-source__note" role="status" aria-live="polite">
                {{ comparisonText }}
            </p>

            <v-alert
                v-else-if="report !== null && report.upstreamReason !== null"
                type="info"
                variant="tonal"
                density="comfortable"
                class="mb-bluemap-source__alert"
                role="status"
                aria-live="polite"
            >
                {{ report.upstreamReason }}
            </v-alert>

            <p class="mb-bluemap-source__note">
                {{
                    t(
                        "settings.bluemapSource.advance",
                        "Moving to a newer BlueMap is done in the repository this app is built from, by advancing the pinned copy of BlueMap's source and rebuilding the jars. It is never done from this screen, and this screen never does it on your behalf.",
                    )
                }}
            </p>
        </template>
    </div>
</template>

<style scoped>
.mb-bluemap-source {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/*
 * A definition list rather than a table: these are labelled facts, not rows to compare, and a
 * grid keeps the label and its value on one line at comfortable widths while letting the value
 * wrap on its own at narrow ones. A jar path is long enough that it must be allowed to wrap
 * anywhere rather than pushing the panel sideways.
 */
.mb-bluemap-source__facts {
    display: grid;
    grid-template-columns: minmax(0, auto) minmax(0, 1fr);
    gap: 4px 16px;
    margin: 0;
}

.mb-bluemap-source__facts dt {
    font-weight: 600;
}

.mb-bluemap-source__facts dd {
    margin: 0;
    overflow-wrap: anywhere;
}

.mb-bluemap-source__note {
    margin: 0;
    opacity: 0.85;
}

.mb-bluemap-source__actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-bluemap-source__alert {
    margin: 0;
}
</style>
