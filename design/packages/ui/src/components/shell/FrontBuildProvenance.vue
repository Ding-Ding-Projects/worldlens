<script setup lang="ts">
import { computed, onMounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { mdiInformationOutline } from "@mdi/js";
import { VBtn, VIcon, VTooltip } from "vuetify/components";

/**
 * Which build this is, one press away from the title bar.
 *
 * The title bar is one 40 px line in the approved design - logo, name, current job, window
 * controls - so the version and the recorded update time are no longer two stacked lines of
 * body text in it. They are behind a compact information button at the end of the caption:
 * hovering or focusing it shows a tooltip with both lines, pressing it pins the same tooltip
 * open (Escape closes it), and the lines are always in the document as the button's accessible
 * description, so a screen reader hears them without opening anything.
 *
 * Unavailable stays honest. A missing version reads "Version unavailable" and a missing or
 * unclassified timestamp reads "Updated time unavailable" rather than being filled in from the
 * launch clock, which is a fact about this session and not about the build.
 */
const { t } = useI18n();
const version = ref<string | null>(null);
const updatedAt = ref<string | null>(null);
const pinned = ref(false);
const tooltipOpen = ref(false);
const detailsId = `wl-front-build-${useId()}`;

const localUpdatedAt = computed(() => {
    if (updatedAt.value === null) return null;
    const instant = new Date(updatedAt.value);
    const format = (language: "en" | "zh-HK") => {
        try {
            return new Intl.DateTimeFormat(language, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZoneName: "short",
            }).format(instant);
        } catch {
            return instant.toISOString();
        }
    };
    return { en: format("en"), yue: format("zh-HK") };
});

const versionLine = computed(() =>
    version.value === null
        ? t("frontBuild.versionUnavailable", "Version unavailable")
        : t("frontBuild.version", { version: version.value }, "Version {version}"),
);

const updatedLine = computed(() =>
    localUpdatedAt.value === null
        ? t("frontBuild.updatedUnavailable", "Updated time unavailable")
        : t(
              "frontBuild.updated",
              { timestampEn: localUpdatedAt.value.en, timestampYue: localUpdatedAt.value.yue },
              "Updated {timestampEn}",
          ),
);

const buttonLabel = computed(() => t("frontBuild.details", "About this build"));

/** Pressing pins the tooltip open, so it can be read without holding the pointer still. */
function togglePinned(): void {
    pinned.value = !pinned.value;
    tooltipOpen.value = pinned.value;
}

/** Hover and focus still open and close it, except that a pinned tooltip stays put. */
function onTooltip(open: boolean): void {
    tooltipOpen.value = pinned.value || open;
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && pinned.value) {
        pinned.value = false;
        tooltipOpen.value = false;
        event.stopPropagation();
    }
}

onMounted(async () => {
    const bridge = (
        globalThis as {
            worldlens?: { getBuildProvenance?: () => Promise<unknown> };
        }
    ).worldlens;
    if (typeof bridge?.getBuildProvenance !== "function") return;
    try {
        const result = await bridge.getBuildProvenance();
        if (!result || typeof result !== "object" || Array.isArray(result)) return;
        const record = result as Record<string, unknown>;
        if (
            typeof record.version === "string" &&
            record.version.trim().length > 0 &&
            record.version.length <= 128 &&
            !/[\u0000-\u001f\u007f]/.test(record.version)
        ) {
            version.value = record.version.trim();
        }
        if (
            (record.timestampOrigin === "build" || record.timestampOrigin === "release") &&
            typeof record.updatedAt === "string" &&
            /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.updatedAt) &&
            Number.isFinite(Date.parse(record.updatedAt)) &&
            new Date(record.updatedAt).toISOString() === record.updatedAt
        ) {
            updatedAt.value = record.updatedAt;
        }
    } catch {
        // Missing provenance stays unavailable. Launch time is never a build timestamp.
    }
});
</script>

<template>
    <span class="wl-front-build" data-testid="front-build-provenance">
        <v-btn
            class="wl-front-build__button"
            variant="text"
            size="small"
            density="comfortable"
            :icon="true"
            :aria-label="buttonLabel"
            :aria-describedby="detailsId"
            :aria-pressed="pinned ? 'true' : 'false'"
            data-testid="front-build-button"
            @click="togglePinned"
            @keydown="onKeydown"
        >
            <v-icon :icon="mdiInformationOutline" size="16" />
            <v-tooltip
                :model-value="tooltipOpen"
                activator="parent"
                location="bottom start"
                @update:model-value="onTooltip"
            >
                <span class="wl-front-build__tooltip">
                    <span>{{ versionLine }}</span>
                    <span>{{ updatedLine }}</span>
                </span>
            </v-tooltip>
        </v-btn>
        <!--
            The description the button points at, always in the document so assistive
            technology reads it without opening anything. Visually hidden, because the tooltip
            above shows the same two lines to everyone else.
        -->
        <span :id="detailsId" class="wl-front-build__details" aria-live="polite">
            <span data-testid="front-build-version">{{ versionLine }}</span>
            <span data-testid="front-build-updated">
                <time v-if="localUpdatedAt !== null" :datetime="updatedAt!">{{ updatedLine }}</time>
                <template v-else>{{ updatedLine }}</template>
            </span>
        </span>
    </span>
</template>

<style scoped>
.wl-front-build {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    -webkit-app-region: no-drag;
    app-region: no-drag;
}

.wl-front-build__button.v-btn {
    color: rgb(var(--v-theme-outline));
}

.wl-front-build__button.v-btn:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 0;
}

.wl-front-build__tooltip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-wrap: anywhere;
}

.wl-front-build__details {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}
</style>
