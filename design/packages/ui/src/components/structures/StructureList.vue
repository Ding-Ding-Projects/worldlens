<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCubeOutline, mdiOpenInNew } from "@mdi/js";
import { VAlert, VBtn, VCheckbox, VList, VListItem } from "vuetify/components";

import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    groupByNamespace,
    renderedStructureSearchText,
    structureSearchText,
    type RenderedStructure,
    type StructureFile,
} from "./structureModel.js";
import {
    recordRender,
    removeRenderedStructures,
    renderedFor,
    structureStore,
} from "./structureStore.js";

/**
 * Every structure file a world scan found, and one render per structure.
 *
 * A structure block's capture sits on disk doing nothing until somebody asks to see it; this
 * is that ask. Discovered files are grouped by namespace so a data pack's structures do not
 * interleave with the world's own, and rendering one is a single button rather than a form -
 * there is nothing to configure about "render exactly this file".
 *
 * ## Why the two lists are not one list
 *
 * A structure file and its render have different lifetimes: the file can vanish (a world
 * moved, a structure block deleted) without the render it produced becoming meaningless, and
 * a file can sit there unrendered for as long as nobody has asked. Keeping them as two lists
 * keeps both of those states honest instead of inventing a "rendered: unknown" row.
 *
 * ## Opening a render is not this component's job
 *
 * `open` is emitted rather than acted on here, because what "open" means - a viewer route, a
 * new window, a panel - depends on where this list is mounted, and this component has no
 * business assuming which.
 */
const props = withDefaults(
    defineProps<{
        /** What the last scan of the world's `structures`/`generated/*\/structures` found. */
        files: readonly StructureFile[];
        /** False when this build has no way to scan a world's filesystem at all. */
        canScan?: boolean;
    }>(),
    { canScan: true },
);

const emit = defineEmits<{
    open: [rendered: RenderedStructure];
}>();

const { t } = useI18n();

/* -------------------------------------------------------------------------- */
/* Discovered structures                                                      */
/* -------------------------------------------------------------------------- */

const discoveredQuery = ref("");
const discoveredRegex = ref(false);
const discoveredFlags = ref("i");

const discoveredMatcher = computed(() =>
    createSettingMatcher(discoveredQuery.value, discoveredRegex.value, discoveredFlags.value),
);

const filteredFiles = computed(() =>
    props.files.filter((file) => discoveredMatcher.value.test(structureSearchText(file))),
);

const groups = computed(() => groupByNamespace(filteredFiles.value));

const discoveredCorpus = computed(() => props.files.map(structureSearchText).join("\n"));

const discoveredSummary = computed(() =>
    discoveredQuery.value === ""
        ? ""
        : t(
              "structures.list.discoveredSummary",
              { shown: filteredFiles.value.length, total: props.files.length },
              "{shown} of {total} structures match.",
          ),
);

function render(file: StructureFile): void {
    recordRender({
        id: crypto.randomUUID(),
        structureId: file.id,
        name: file.name,
        dataRoot: file.path,
        renderedAt: new Date().toISOString(),
    });
}

/* -------------------------------------------------------------------------- */
/* Rendered structures                                                        */
/* -------------------------------------------------------------------------- */

const renderedQuery = ref("");
const renderedRegex = ref(false);
const renderedFlags = ref("i");

const renderedMatcher = computed(() =>
    createSettingMatcher(renderedQuery.value, renderedRegex.value, renderedFlags.value),
);

const filteredRendered = computed(() =>
    structureStore.rendered.filter((entry) => renderedMatcher.value.test(renderedStructureSearchText(entry))),
);

const renderedCorpus = computed(() => structureStore.rendered.map(renderedStructureSearchText).join("\n"));

const renderedSummary = computed(() =>
    renderedQuery.value === ""
        ? ""
        : t(
              "structures.list.renderedSummary",
              { shown: filteredRendered.value.length, total: structureStore.rendered.length },
              "{shown} of {total} rendered structures match.",
          ),
);

/* Bulk select and delete, exactly as every other list in this application has. */

const selected = ref(new Set<string>());
const confirming = ref(false);
const removedCount = ref<number | null>(null);

function toggleSelected(id: string): void {
    const next = new Set(selected.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected.value = next;
}

/** Over what is filtered, never past the filter - the count previewed is the set acted on. */
function selectFiltered(): void {
    selected.value = new Set(filteredRendered.value.map((entry) => entry.id));
}

function selectNone(): void {
    selected.value = new Set();
}

function removeSelected(): void {
    removedCount.value = removeRenderedStructures([...selected.value]);
    selected.value = new Set();
    confirming.value = false;
}

function isRendered(file: StructureFile): boolean {
    return renderedFor(file.id) !== null;
}
</script>

<template>
    <section class="mb-structure-list" data-test="structure-list">
        <h2 class="mb-structure-list__title">
            {{ t("structures.list.title", "Structures") }}
        </h2>

        <VAlert
            v-if="structureStore.failure !== null"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
            role="alert"
        >
            <span data-test="structure-failure">
                {{
                    t(
                        "structures.list.unreadable",
                        { message: structureStore.failure },
                        "Your saved structures could not be read, so this is not an empty list - it is an unknown one, and nothing has been written over: {message}",
                    )
                }}
            </span>
        </VAlert>

        <template v-if="!canScan">
            <p class="mb-structure-list__empty" data-test="structure-cannot-scan">
                {{
                    t(
                        "structures.list.cannotScan",
                        "This build cannot look at a world's files, so it cannot find structures on its own.",
                    )
                }}
            </p>
        </template>

        <template v-else>
            <p v-if="files.length === 0" class="mb-structure-list__empty" data-test="structure-empty">
                {{ t("structures.list.empty", "No structures found in this world.") }}
            </p>

            <template v-else>
                <ConfigSearchField
                    v-model="discoveredQuery"
                    v-model:regex="discoveredRegex"
                    v-model:flags="discoveredFlags"
                    :label="t('structures.list.discoveredSearch', 'Search structure files')"
                    :sample="discoveredCorpus"
                    :summary="discoveredSummary"
                    data-test="structure-discovered-search"
                />

                <p
                    v-if="filteredFiles.length === 0"
                    class="mb-structure-list__empty"
                    data-test="structure-no-match"
                >
                    {{ t("structures.list.noMatch", "No structure file matches that search.") }}
                </p>

                <div
                    v-for="group in groups"
                    :key="group.namespace"
                    class="mb-structure-list__group"
                    data-test="structure-group"
                >
                    <h3 class="mb-structure-list__namespace" data-test="structure-namespace">
                        {{ group.namespace }}
                    </h3>
                    <VList density="compact">
                        <VListItem
                            v-for="file in group.files"
                            :key="file.id"
                            :title="file.name"
                            :subtitle="file.path"
                            data-test="structure-file-row"
                        >
                            <template #append>
                                <VBtn
                                    size="small"
                                    variant="tonal"
                                    color="primary"
                                    :prepend-icon="mdiCubeOutline"
                                    :disabled="isRendered(file)"
                                    data-test="structure-render"
                                    @click="render(file)"
                                >
                                    {{
                                        isRendered(file)
                                            ? t("structures.list.alreadyRendered", "Rendered")
                                            : t("structures.list.render", "Render this structure")
                                    }}
                                </VBtn>
                            </template>
                        </VListItem>
                    </VList>
                </div>
            </template>
        </template>

        <h2 class="mb-structure-list__title mt-4">
            {{ t("structures.list.renderedTitle", "Rendered structures") }}
        </h2>

        <!--
            Outside the toggle below on purpose. It used to sit inside the "there are renders"
            branch, so deleting the last one emptied the list and took this line away with it:
            the one moment somebody most needs to be told what just happened was the one moment
            it could not be said.
        -->
        <p
            v-if="removedCount !== null"
            class="text-medium-emphasis"
            data-test="structure-removed"
            role="status"
            aria-live="polite"
        >
            {{ t("structures.list.removed", { count: removedCount }, "Deleted {count} rendered structures.") }}
        </p>

        <p
            v-if="structureStore.rendered.length === 0"
            class="mb-structure-list__empty"
            data-test="structure-rendered-empty"
        >
            {{
                t(
                    "structures.list.renderedEmpty",
                    "Nothing rendered yet. Render a structure above and it appears here.",
                )
            }}
        </p>

        <template v-else>
            <ConfigSearchField
                v-model="renderedQuery"
                v-model:regex="renderedRegex"
                v-model:flags="renderedFlags"
                :label="t('structures.list.renderedSearch', 'Search rendered structures')"
                :sample="renderedCorpus"
                :summary="renderedSummary"
                data-test="structure-rendered-search"
            />

            <div class="d-flex ga-2 flex-wrap align-center mt-2">
                <VBtn size="small" variant="text" data-test="structure-select-filtered" @click="selectFiltered">
                    {{
                        t(
                            "structures.list.selectFiltered",
                            { count: filteredRendered.length },
                            "Select the {count} shown",
                        )
                    }}
                </VBtn>
                <VBtn
                    v-if="selected.size > 0"
                    size="small"
                    variant="text"
                    data-test="structure-select-none"
                    @click="selectNone"
                >
                    {{ t("structures.list.selectNone", "Select none") }}
                </VBtn>
                <VBtn
                    v-if="selected.size > 0"
                    size="small"
                    color="error"
                    variant="tonal"
                    data-test="structure-remove-selected"
                    @click="confirming = true"
                >
                    {{
                        t(
                            "structures.list.removeSelected",
                            { count: selected.size },
                            "Delete {count} renders",
                        )
                    }}
                </VBtn>
            </div>

            <VAlert v-if="confirming" type="warning" variant="tonal" density="compact" class="mt-2">
                <span data-test="structure-remove-confirm">
                    {{
                        t(
                            "structures.list.confirmRemove",
                            { count: selected.size },
                            "Delete {count} rendered structures? The source structure files on disk are not touched.",
                        )
                    }}
                </span>
                <div class="d-flex ga-2 mt-2">
                    <VBtn size="small" color="error" data-test="structure-remove-go" @click="removeSelected">
                        {{ t("structures.list.confirmYes", "Delete them") }}
                    </VBtn>
                    <VBtn size="small" variant="text" @click="confirming = false">
                        {{ t("structures.list.confirmNo", "Keep them") }}
                    </VBtn>
                </div>
            </VAlert>

            <p
                v-if="filteredRendered.length === 0"
                class="mb-structure-list__empty"
                data-test="structure-rendered-no-match"
            >
                {{ t("structures.list.renderedNoMatch", "No rendered structure matches that search.") }}
            </p>

            <VList v-else density="compact">
                <VListItem
                    v-for="entry in filteredRendered"
                    :key="entry.id"
                    :title="entry.name"
                    :subtitle="entry.dataRoot"
                    data-test="structure-rendered-row"
                >
                    <template #prepend>
                        <VCheckbox
                            :model-value="selected.has(entry.id)"
                            :aria-label="
                                t('structures.list.selectOne', { name: entry.name }, 'Select {name}')
                            "
                            density="compact"
                            hide-details
                            @update:model-value="toggleSelected(entry.id)"
                        />
                    </template>
                    <template #append>
                        <VBtn
                            size="small"
                            variant="text"
                            :prepend-icon="mdiOpenInNew"
                            data-test="structure-open"
                            @click="emit('open', entry)"
                        >
                            {{ t("structures.list.open", "Open") }}
                        </VBtn>
                    </template>
                </VListItem>
            </VList>
        </template>
    </section>
</template>

<style scoped>
.mb-structure-list {
    padding: 12px;
}

.mb-structure-list__title {
    margin: 0;
    font-size: 1.05rem;
}

.mb-structure-list__empty {
    margin: 8px 0;
    font-size: 0.8125rem;
    opacity: 0.8;
}

.mb-structure-list__group {
    margin-top: 12px;
}

.mb-structure-list__namespace {
    margin: 0 0 4px;
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: lowercase;
    opacity: 0.7;
}
</style>
