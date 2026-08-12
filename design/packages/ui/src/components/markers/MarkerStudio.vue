<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    VAlert,
    VBtn,
    VCheckbox,
    VChip,
    VList,
    VListItem,
    VTextField,
    VTextarea,
} from "vuetify/components";
import { mdiMapMarkerPlusOutline, mdiPencilOutline } from "@mdi/js";

import MarkerSearchField from "./MarkerSearchField.vue";
import { compileSearchPattern, includesCI, type SearchMode } from "./markerFilter.js";
import {
    DEFAULT_MARKER_COLOUR,
    draftFrom,
    emptyDraft,
    markerSearchText,
    type MarkerDraft,
    type StudioMarker,
} from "./markerStudio.js";
import {
    addMarker,
    markerStudioStore,
    markersFor,
    removeMarkers,
    setMarkerVisible,
    updateMarker,
} from "./markerStudioStore.js";

/**
 * Making markers, which until now this application could not do at all.
 *
 * It could render them, filter them, search them and lay them over a map - every one of them
 * somebody else's, out of a marker file or a live server's API. Open a map of your own world
 * and the panel said "This marker set has nothing in it", with nothing underneath it that
 * could put something in.
 *
 * ## Yours, and never mixed into the server's
 *
 * These live in their own set. A marker file is refetched and replaced wholesale, so a user
 * marker merged into one would vanish at the next poll with nothing to explain it. Kept
 * apart, they survive - and the interface can always answer "did I make this, or did the
 * server?", which is the question somebody asks the moment two markers disagree.
 *
 * ## The form is filled in for you where the answer is knowable
 *
 * A new marker starts at wherever the camera is, because that is where somebody looking at
 * a place and pressing "add a marker" means. Typing three coordinates read off another
 * screen is the thing this feature exists to save.
 */
const props = withDefaults(
    defineProps<{
        /** Which map these belong to. Markers on the nether do not appear over the overworld. */
        mapId: string;
        /** Where the camera is, so a new marker starts there rather than at the origin. */
        cameraPosition?: { x: number; y: number; z: number } | null;
    }>(),
    { cameraPosition: null },
);

const { t } = useI18n();

const query = ref("");
/** The shared marker search's own vocabulary, so the field and this agree on what a mode is. */
const mode = ref<SearchMode>("text");
const flags = ref("i");

/**
 * The same two behaviours the marker list already has, over this surface's own text.
 *
 * `createMarkerMatcher` next door matches against the viewer's marker records rather than a
 * string, so it cannot be reused directly - but the rules it follows are reused exactly: an
 * invalid pattern reports its error and matches nothing, rather than silently re-running
 * whichever pattern last happened to compile.
 */
const matcher = computed<{ test: (text: string) => boolean; error: string | null }>(() => {
    if (query.value === "") return { test: () => true, error: null };
    if (mode.value === "regex") {
        const { regexp, error } = compileSearchPattern(query.value, flags.value);
        if (!regexp) return { test: () => false, error };
        return { test: (text: string) => regexp.test(text), error: null };
    }
    return { test: (text: string) => includesCI(text, query.value), error: null };
});

const listed = computed(() =>
    markersFor(props.mapId).value.filter((marker) => matcher.value.test(markerSearchText(marker))),
);

const all = computed(() => markersFor(props.mapId).value);

const corpus = computed(() => all.value.map(markerSearchText).join("\n"));

const summary = computed(() =>
    query.value === ""
        ? ""
        : t(
              "markers.studio.summary",
              { shown: listed.value.length, total: all.value.length },
              "{shown} of {total} markers match.",
          ),
);

/* -------------------------------------------------------------------------- */
/* Making and editing one                                                     */
/* -------------------------------------------------------------------------- */

const editing = ref<string | null>(null);
const formOpen = ref(false);
const draft = ref<MarkerDraft>(emptyDraft());
const problems = ref<readonly { field: string; message: string }[]>([]);

/**
 * The message for one field, or null.
 *
 * Null rather than undefined because Vuetify's `error-messages` accepts null and this
 * project builds with `exactOptionalPropertyTypes`, under which an explicit `undefined` is
 * not the same as an absent prop.
 */
function problemFor(field: string): string | null {
    return problems.value.find((problem) => problem.field === field)?.message ?? null;
}

function startNew(): void {
    editing.value = null;
    // Where the camera is, because that is where "add a marker" means when somebody is
    // looking at a place. Falls back to the origin only when nothing knows better.
    draft.value = emptyDraft(props.cameraPosition ?? undefined);
    problems.value = [];
    formOpen.value = true;
}

function startEdit(marker: StudioMarker): void {
    editing.value = marker.id;
    draft.value = draftFrom(marker);
    problems.value = [];
    formOpen.value = true;
}

function cancel(): void {
    formOpen.value = false;
    problems.value = [];
}

function save(): void {
    const result =
        editing.value === null
            ? addMarker(props.mapId, draft.value)
            : updateMarker(editing.value, draft.value);
    if (result.ok) {
        formOpen.value = false;
        problems.value = [];
        return;
    }
    problems.value = result.problems;
}

/* -------------------------------------------------------------------------- */
/* Bulk actions, exactly as every other list in this application has           */
/* -------------------------------------------------------------------------- */

const selected = ref(new Set<string>());
const confirming = ref(false);

function toggle(id: string): void {
    const next = new Set(selected.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected.value = next;
}

/** Over what is listed, never past the filter - the count previewed is the set acted on. */
function selectListed(): void {
    selected.value = new Set(listed.value.map((marker) => marker.id));
}

function selectNone(): void {
    selected.value = new Set();
}

const removedCount = ref<number | null>(null);

function removeSelected(): void {
    removedCount.value = removeMarkers([...selected.value]);
    selected.value = new Set();
    confirming.value = false;
}

function positionText(marker: StudioMarker): string {
    return `${marker.position.x}, ${marker.position.y}, ${marker.position.z}`;
}
</script>

<template>
    <section class="mb-marker-studio" data-test="marker-studio">
        <div class="d-flex align-center ga-2 flex-wrap">
            <h2 class="mb-marker-studio__title">
                {{ t("markers.studio.title", "Marker studio") }}
            </h2>
            <VBtn
                :prepend-icon="mdiMapMarkerPlusOutline"
                color="primary"
                variant="tonal"
                size="small"
                data-test="marker-new"
                @click="startNew"
            >
                {{ t("markers.studio.add", "Add a marker") }}
            </VBtn>
        </div>

        <p class="mb-marker-studio__lede">
            {{
                t(
                    "markers.studio.lede",
                    "Markers you make yourself, kept separate from anything a server publishes so a refresh cannot take them away. They stay on this computer.",
                )
            }}
        </p>

        <VAlert
            v-if="markerStudioStore.failure !== null"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
            data-test="marker-studio-failure"
            role="alert"
        >
            {{
                t(
                    "markers.studio.unreadable",
                    { message: markerStudioStore.failure },
                    "Your saved markers could not be read, so this is not an empty studio - it is an unknown one, and nothing has been written over: {message}",
                )
            }}
        </VAlert>

        <!-- The form: one panel for both making and editing, because they are one thing. -->
        <div v-if="formOpen" class="mb-marker-studio__form" data-test="marker-form">
            <VTextField
                v-model="draft.label"
                :label="t('markers.studio.label', 'Name')"
                :error-messages="problemFor('label')"
                density="compact"
                data-test="marker-label"
            />
            <div class="d-flex ga-2 flex-wrap">
                <VTextField
                    v-model.number="draft.position.x"
                    label="X"
                    type="number"
                    density="compact"
                    class="mb-marker-studio__coord"
                    data-test="marker-x"
                />
                <VTextField
                    v-model.number="draft.position.y"
                    label="Y"
                    type="number"
                    density="compact"
                    class="mb-marker-studio__coord"
                    data-test="marker-y"
                />
                <VTextField
                    v-model.number="draft.position.z"
                    label="Z"
                    type="number"
                    density="compact"
                    class="mb-marker-studio__coord"
                    data-test="marker-z"
                />
            </div>
            <p
                v-if="problemFor('position')"
                class="text-error mb-2"
                data-test="marker-position-problem"
            >
                {{ problemFor("position") }}
            </p>

            <VTextarea
                v-model="draft.detail"
                :label="t('markers.studio.detail', 'Note (optional)')"
                rows="2"
                density="compact"
                data-test="marker-detail"
            />
            <VTextField
                v-model="draft.colour"
                :label="t('markers.studio.colour', 'Colour')"
                :error-messages="problemFor('colour')"
                :placeholder="DEFAULT_MARKER_COLOUR"
                density="compact"
                data-test="marker-colour"
            />

            <div class="d-flex ga-2">
                <VBtn color="primary" data-test="marker-save" @click="save">
                    {{
                        editing === null
                            ? t("markers.studio.create", "Add it")
                            : t("markers.studio.saveEdit", "Save changes")
                    }}
                </VBtn>
                <VBtn variant="text" data-test="marker-cancel" @click="cancel">
                    {{ t("markers.studio.cancel", "Never mind") }}
                </VBtn>
            </div>
        </div>

        <MarkerSearchField
            v-if="all.length"
            v-model="query"
            v-model:mode="mode"
            v-model:flags="flags"
            :error="matcher.error"
            :sample-seed="corpus"
        />
        <p v-if="summary" class="mb-marker-studio__lede" data-test="marker-summary">
            {{ summary }}
        </p>

        <!--
            Outside the list block on purpose. It used to sit inside it, so deleting the last
            marker emptied the list and took this line away with it: the one moment somebody
            most needs to be told what just happened was the one moment it could not be said.
        -->
        <p
            v-if="removedCount !== null"
            class="text-medium-emphasis mt-2"
            data-test="marker-removed"
            role="status"
            aria-live="polite"
        >
            {{ t("markers.studio.removed", { count: removedCount }, "Deleted {count} markers.") }}
        </p>

        <p v-if="!all.length" class="mb-marker-studio__empty" data-test="marker-studio-empty">
            {{
                t(
                    "markers.studio.empty",
                    "No markers on this map yet. Add one and it appears here and on the map.",
                )
            }}
        </p>

        <template v-else>
            <div class="d-flex ga-2 flex-wrap align-center mt-2">
                <VBtn size="small" variant="text" data-test="marker-select-listed" @click="selectListed">
                    {{
                        t(
                            "markers.studio.selectListed",
                            { count: listed.length },
                            "Select the {count} shown",
                        )
                    }}
                </VBtn>
                <VBtn
                    v-if="selected.size > 0"
                    size="small"
                    variant="text"
                    data-test="marker-select-none"
                    @click="selectNone"
                >
                    {{ t("markers.studio.selectNone", "Select none") }}
                </VBtn>
                <VBtn
                    v-if="selected.size > 0"
                    size="small"
                    color="error"
                    variant="tonal"
                    data-test="marker-remove-selected"
                    @click="confirming = true"
                >
                    {{
                        t(
                            "markers.studio.removeSelected",
                            { count: selected.size },
                            "Delete {count} markers",
                        )
                    }}
                </VBtn>
            </div>

            <VAlert
                v-if="confirming"
                type="warning"
                variant="tonal"
                density="compact"
                class="mt-2"
            >
                <!--
                    The hook is on a plain element inside the alert rather than on the alert
                    itself: a component's fallthrough attribute is not reliably queryable
                    from a test, and a preview nobody can assert on is a preview that can
                    silently stop naming the right count.
                -->
                <span data-test="marker-remove-confirm">
                    {{
                        t(
                            "markers.studio.confirmRemove",
                            { count: selected.size },
                            "Delete {count} markers? Nothing else on the map is touched.",
                        )
                    }}
                </span>
                <div class="d-flex ga-2 mt-2">
                    <VBtn size="small" color="error" data-test="marker-remove-go" @click="removeSelected">
                        {{ t("markers.studio.confirmYes", "Delete them") }}
                    </VBtn>
                    <VBtn size="small" variant="text" @click="confirming = false">
                        {{ t("markers.studio.confirmNo", "Keep them") }}
                    </VBtn>
                </div>
            </VAlert>

            <VList density="compact" class="mt-2">
                <VListItem
                    v-for="marker in listed"
                    :key="marker.id"
                    :title="marker.label"
                    :subtitle="positionText(marker)"
                    data-test="marker-row"
                >
                    <template #prepend>
                        <VCheckbox
                            :model-value="selected.has(marker.id)"
                            :aria-label="
                                t(
                                    'markers.studio.selectOne',
                                    { label: marker.label },
                                    'Select {label}',
                                )
                            "
                            density="compact"
                            hide-details
                            @update:model-value="toggle(marker.id)"
                        />
                    </template>
                    <template #append>
                        <div class="d-flex ga-2 align-center flex-wrap">
                            <!-- Functional data colour: the marker's own, not chrome. -->
                            <VChip
                                size="x-small"
                                variant="outlined"
                                :style="{ color: marker.colour }"
                                data-test="marker-colour-chip"
                            >
                                {{ marker.colour }}
                            </VChip>
                            <VBtn
                                size="small"
                                variant="text"
                                :prepend-icon="mdiPencilOutline"
                                data-test="marker-edit"
                                @click="startEdit(marker)"
                            >
                                {{ t("markers.studio.edit", "Edit") }}
                            </VBtn>
                            <VBtn
                                size="small"
                                variant="text"
                                data-test="marker-toggle-visible"
                                @click="setMarkerVisible(marker.id, !marker.visible)"
                            >
                                {{
                                    marker.visible
                                        ? t("markers.studio.hide", "Hide on map")
                                        : t("markers.studio.show", "Show on map")
                                }}
                            </VBtn>
                        </div>
                    </template>
                </VListItem>
            </VList>

            <p v-if="!listed.length" class="mb-marker-studio__empty" data-test="marker-no-match">
                {{ t("markers.studio.noMatch", "No marker matches that search.") }}
            </p>
        </template>
    </section>
</template>

<style scoped>
.mb-marker-studio {
    padding: 12px;
}

.mb-marker-studio__title {
    flex: 1 1 auto;
    margin: 0;
    font-size: 1.05rem;
}

.mb-marker-studio__lede,
.mb-marker-studio__empty {
    margin: 8px 0;
    font-size: 0.8125rem;
    opacity: 0.8;
}

.mb-marker-studio__form {
    margin: 8px 0 12px;
    padding: 12px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 12px;
}

.mb-marker-studio__coord {
    flex: 1 1 5rem;
    min-width: 4.5rem;
}
</style>
