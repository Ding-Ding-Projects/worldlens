<script setup lang="ts">
/**
 * One Work tab holding several tools: a list on the left, the picked tool beside it.
 *
 * It is a list-detail page, not a second tab strip. The list is a navigation list with one
 * current item; the tool itself is the host's own slot for that job id, rendered unchanged,
 * so nothing about a tool behaves differently for living here. See `toolHubs.ts` for which
 * jobs live in which hub, and `design/design-sources/work-strip-declutter/` for the boards.
 *
 * Narrow panes swap the list for a select above the tool, because a 280 px column beside a
 * tool on a phone-width window leaves the tool no room at all.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VIcon, VList, VListItem, VSelect } from "vuetify/components";
import { findJob } from "./jobRegistry.js";
import type { ToolHubDefinition } from "./toolHubs.js";

const props = defineProps<{
    hub: ToolHubDefinition;
    /** Members this build can show; capability-gated ones are left out by the host. */
    available: readonly string[];
    modelValue: string | null;
}>();

const emit = defineEmits<{ "update:modelValue": [id: string] }>();

const { t } = useI18n();

const tools = computed(() =>
    props.available
        .map((id) => findJob(id))
        .filter((job): job is NonNullable<typeof job> => job !== null)
        .map((job) => ({ id: job.id, title: t(job.labelKey, job.labelFallback), icon: job.icon })),
);

const current = computed<string | null>(() => {
    const wanted = props.modelValue;
    if (wanted !== null && tools.value.some((tool) => tool.id === wanted)) return wanted;
    return tools.value[0]?.id ?? null;
});

const currentTitle = computed(
    () => tools.value.find((tool) => tool.id === current.value)?.title ?? "",
);

function pick(id: string): void {
    if (id !== current.value) emit("update:modelValue", id);
}

const listLabel = computed(() => t(props.hub.labelKey, props.hub.labelFallback));
</script>

<template>
    <div class="wl-hub" :data-hub="hub.id">
        <header class="wl-hub__head">
            <h1 class="wl-hub__title">{{ listLabel }}</h1>
            <p class="wl-hub__lede">{{ t(hub.ledeKey, hub.ledeFallback) }}</p>
        </header>

        <p v-if="tools.length === 0" class="wl-hub__empty">
            {{ t("toolHub.empty", "This build has none of these tools.") }}
        </p>

        <div v-else class="wl-hub__body">
            <nav class="wl-hub__list" :aria-label="listLabel">
                <VList nav density="comfortable" bg-color="transparent" class="wl-hub__vlist">
                    <VListItem
                        v-for="tool in tools"
                        :key="tool.id"
                        :title="tool.title"
                        :active="tool.id === current"
                        :aria-current="tool.id === current ? 'page' : undefined"
                        :data-tool="tool.id"
                        rounded="xl"
                        color="secondary"
                        @click="pick(tool.id)"
                    >
                        <template #prepend>
                            <VIcon :icon="tool.icon" aria-hidden="true" />
                        </template>
                    </VListItem>
                </VList>
            </nav>

            <div class="wl-hub__picker">
                <VSelect
                    :model-value="current"
                    :items="tools"
                    item-title="title"
                    item-value="id"
                    :label="t('toolHub.pick', 'Tool')"
                    variant="outlined"
                    density="comfortable"
                    hide-details
                    @update:model-value="(value: string) => pick(value)"
                />
            </div>

            <section
                class="wl-hub__tool"
                :aria-label="currentTitle"
                :data-current-tool="current ?? ''"
            >
                <slot v-if="current !== null" :tool-id="current" />
            </section>
        </div>
    </div>
</template>

<style scoped>
.wl-hub {
    container-type: inline-size;
    block-size: 100%;
    min-block-size: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px 24px 0;
    box-sizing: border-box;
}

.wl-hub__title {
    margin: 0;
    font-size: 1.75rem;
    line-height: 2.25rem;
    font-weight: 400;
}

.wl-hub__lede {
    margin: 4px 0 0;
    max-inline-size: 72ch;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-hub__empty {
    margin: 0;
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-hub__body {
    flex: 1 1 auto;
    min-block-size: 0;
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    grid-template-areas: "list tool";
    gap: 16px;
}

.wl-hub__list {
    grid-area: list;
    min-block-size: 0;
    overflow: auto;
    border-radius: 28px;
    background: rgb(var(--v-theme-surface-container));
    padding: 8px;
}

.wl-hub__picker {
    grid-area: picker;
    display: none;
}

.wl-hub__tool {
    grid-area: tool;
    min-inline-size: 0;
    min-block-size: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
}

@container (max-width: 720px) {
    .wl-hub__body {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr);
        grid-template-areas: "picker" "tool";
    }

    .wl-hub__list {
        display: none;
    }

    .wl-hub__picker {
        display: block;
    }
}
</style>
