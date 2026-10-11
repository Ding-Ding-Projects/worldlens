<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const version = ref<string | null>(null);
const updatedAt = ref<string | null>(null);

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
    <div class="wl-front-build" data-testid="front-build-provenance" aria-live="polite">
        <span data-testid="front-build-version">
            {{
                version === null
                    ? t("frontBuild.versionUnavailable", "Version unavailable")
                    : t("frontBuild.version", { version }, "Version {version}")
            }}
        </span>
        <span data-testid="front-build-updated">
            <time v-if="localUpdatedAt !== null" :datetime="updatedAt!">
                {{
                    t(
                        "frontBuild.updated",
                        { timestampEn: localUpdatedAt.en, timestampYue: localUpdatedAt.yue },
                        "Updated {timestampEn}",
                    )
                }}
            </time>
            <template v-else>{{
                t("frontBuild.updatedUnavailable", "Updated time unavailable")
            }}</template>
        </span>
    </div>
</template>

<style scoped>
.wl-front-build {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    padding-inline: 8px;
    font-size: 14px;
    line-height: 18px;
    overflow-wrap: anywhere;
}
</style>
