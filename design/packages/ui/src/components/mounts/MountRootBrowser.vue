<script setup lang="ts">
/**
 * The folder picker for a deployment that has no desktop to draw one on.
 *
 * ## Why this is a browser and not a text box
 *
 * The obvious hosted replacement for a native picker is a field somebody types a path into.
 * It is also the wrong one, and not mainly for security: the server already refuses anything
 * outside a mounted folder, so a typed path that escapes gets refused rather than obeyed.
 * The problem is that a text box asks a person to already know the answer. They are looking
 * at a filesystem inside a container they did not lay out, whose paths are whatever the
 * operator's `-v` flags said. Typing is guessing, and every wrong guess comes back as a
 * refusal, which reads as broken software rather than as a wrong path.
 *
 * So the mounted folders are the browsing surface, and they are also the boundary. The same
 * list is both, which is what makes it impossible to be shown something you cannot then use.
 *
 * ## The states this has to tell apart
 *
 * An empty folder, a folder that could not be read, and a folder whose entries were all
 * dropped for pointing outside the mount look identical if all three render as "nothing
 * here". Only the first means there is nothing there. Each gets its own words.
 */
import { computed, ref, watch } from "vue";
import { mdiArrowUp, mdiFile, mdiFolder, mdiFolderOpen, mdiLock } from "@mdi/js";
import { useI18n } from "vue-i18n";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    resolveMountBrowserBridge,
    type MountBrowserBridge,
    type MountEntrySummary,
    type MountListingSummary,
    type MountRootSummary,
} from "./mountBrowserHost.js";

const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        title: string;
        /** `folder` returns the folder being viewed; `file` returns a chosen file. */
        mode?: "folder" | "file";
        /** Extensions without the dot. Empty means every file, as the native picker does. */
        extensions?: readonly string[];
        /** Only offer folders the deployment may write to. */
        writableOnly?: boolean;
        /** Injected in tests; production resolves the real bridge. */
        bridge?: MountBrowserBridge | null;
    }>(),
    { mode: "folder", extensions: () => [], writableOnly: false, bridge: undefined },
);

const emit = defineEmits<{
    "update:modelValue": [value: boolean];
    choose: [path: string];
}>();

const { t } = useI18n();

const bridge = computed<MountBrowserBridge | null>(() =>
    props.bridge === undefined ? resolveMountBrowserBridge() : props.bridge,
);

const roots = ref<readonly MountRootSummary[]>([]);
const listing = ref<MountListingSummary | null>(null);
const problem = ref<string | null>(null);
const busy = ref(false);
const selectedFile = ref<string | null>(null);

const query = ref("");
const regex = ref(false);
const flags = ref("i");

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const offeredRoots = computed(() =>
    props.writableOnly ? roots.value.filter((root) => root.writable) : roots.value,
);

function extensionAllows(name: string): boolean {
    if (props.extensions.length === 0) return true;
    const dot = name.lastIndexOf(".");
    if (dot < 0) return false;
    const suffix = name.slice(dot + 1).toLowerCase();
    return props.extensions.some((allowed) => allowed.toLowerCase() === suffix);
}

/** In folder mode a file cannot be the answer, so it is not offered as one. */
const visibleEntries = computed<readonly MountEntrySummary[]>(() => {
    const all = listing.value?.entries ?? [];
    const relevant = all.filter(
        (entry) => entry.kind === "folder" || (props.mode === "file" && extensionAllows(entry.name)),
    );
    const matcher = createSettingMatcher(query.value, regex.value, flags.value);
    return relevant.filter((entry) => matcher.test(entry.name));
});

/** Honest "showing X of Y", so a filter that hides everything is visibly a filter. */
const summary = computed(() => {
    const total = listing.value?.entries.length ?? 0;
    if (total === 0) return "";
    return t("mounts.search.summary", { shown: String(visibleEntries.value.length), total: String(total) }, `Showing ${visibleEntries.value.length} of ${total}`);
});

/** The builder previews against real names from this folder rather than invented ones. */
const sample = computed(() => (listing.value?.entries ?? []).map((entry) => entry.name).join("\n"));

async function loadRoots(): Promise<void> {
    const api = bridge.value;
    if (api === null) {
        problem.value = t(
            "mounts.unavailable",
            {},
            "This build cannot list mounted folders, so there is nothing to browse.",
        );
        return;
    }
    busy.value = true;
    problem.value = null;
    try {
        roots.value = await api.list();
    } catch {
        problem.value = t("mounts.listFailed", {}, "The mounted folders could not be listed.");
    } finally {
        busy.value = false;
    }
}

async function openRoot(rootId: string, path: string | null): Promise<void> {
    const api = bridge.value;
    if (api === null) return;
    busy.value = true;
    problem.value = null;
    selectedFile.value = null;
    try {
        const outcome = await api.browse(rootId, path);
        if (outcome.ok) {
            listing.value = outcome.listing;
            query.value = "";
        } else {
            problem.value = outcome.reason;
        }
    } catch {
        problem.value = t("mounts.browseFailed", {}, "That folder could not be opened.");
    } finally {
        busy.value = false;
    }
}

function activate(entry: MountEntrySummary): void {
    if (entry.kind === "folder") {
        void openRoot(listing.value?.rootId ?? "", entry.path);
        return;
    }
    selectedFile.value = entry.path;
}

function goUp(): void {
    const current = listing.value;
    if (current === null || current.parent === null) return;
    void openRoot(current.rootId, current.parent);
}

function backToRoots(): void {
    listing.value = null;
    selectedFile.value = null;
    query.value = "";
    problem.value = null;
}

const canChoose = computed(() => {
    if (listing.value === null) return false;
    if (props.mode === "file") return selectedFile.value !== null;
    return true;
});

function choose(): void {
    const current = listing.value;
    if (current === null) return;
    const chosen = props.mode === "file" ? selectedFile.value : current.path;
    if (chosen === null) return;
    emit("choose", chosen);
    open.value = false;
}

watch(
    () => props.modelValue,
    (isOpen) => {
        if (!isOpen) return;
        listing.value = null;
        selectedFile.value = null;
        query.value = "";
        problem.value = null;
        void loadRoots();
    },
    { immediate: true },
);
</script>

<template>
    <v-dialog v-model="open" max-width="720" scrollable>
        <v-card class="mb-mount-browser">
            <v-card-title class="mb-mount-browser__title">
                {{ title }}
            </v-card-title>

            <v-card-subtitle v-if="listing" class="mb-mount-browser__where">
                <v-icon :icon="mdiFolderOpen" size="small" class="mr-1" />
                <span>{{ listing.rootLabel }}</span>
                <v-chip
                    v-if="!listing.writable"
                    size="x-small"
                    variant="tonal"
                    class="ml-2"
                    :prepend-icon="mdiLock"
                >
                    {{ t("mounts.readOnly", {}, "read-only") }}
                </v-chip>
                <code class="mb-mount-browser__path">{{ listing.path }}</code>
            </v-card-subtitle>

            <v-card-text>
                <v-alert v-if="problem" type="warning" variant="tonal" density="compact" class="mb-3">
                    {{ problem }}
                </v-alert>

                <!-- No root chosen yet: the mounted folders themselves. -->
                <template v-if="!listing">
                    <p v-if="offeredRoots.length === 0 && !busy" class="mb-mount-browser__empty">
                        {{
                            t(
                                "mounts.noneMounted",
                                {},
                                "This deployment has no folders mounted, so there is nothing to choose from. The operator mounts them when the container is started.",
                            )
                        }}
                    </p>
                    <v-list v-else lines="two" role="listbox" :aria-label="title">
                        <v-list-item
                            v-for="root in offeredRoots"
                            :key="root.id"
                            role="option"
                            :aria-selected="false"
                            :prepend-icon="mdiFolder"
                            :title="root.label"
                            :subtitle="
                                root.writable
                                    ? t('mounts.writable', {}, 'The application may write here')
                                    : t('mounts.readOnly.long', {}, 'Read-only')
                            "
                            @click="openRoot(root.id, null)"
                            @keydown.enter="openRoot(root.id, null)"
                        />
                    </v-list>
                </template>

                <!-- Inside a root. -->
                <template v-else>
                    <div class="mb-mount-browser__bar">
                        <v-btn
                            :prepend-icon="mdiArrowUp"
                            variant="text"
                            size="small"
                            :disabled="listing.parent === null"
                            @click="goUp"
                        >
                            {{ t("mounts.up", {}, "Up") }}
                        </v-btn>
                        <v-btn variant="text" size="small" @click="backToRoots">
                            {{ t("mounts.allFolders", {}, "All mounted folders") }}
                        </v-btn>
                    </div>

                    <ConfigSearchField
                        v-model="query"
                        v-model:regex="regex"
                        v-model:flags="flags"
                        :label="t('mounts.search.label', {}, 'Search this folder')"
                        :sample="sample"
                        :summary="summary"
                    />

                    <p v-if="listing.truncated" class="mb-mount-browser__note">
                        {{
                            t(
                                "mounts.truncated",
                                {},
                                "This folder holds more than can be listed at once, so only the first entries are shown. Search to narrow it.",
                            )
                        }}
                    </p>

                    <p v-if="listing.entries.length === 0" class="mb-mount-browser__empty">
                        {{ t("mounts.emptyFolder", {}, "This folder is empty.") }}
                    </p>
                    <p v-else-if="visibleEntries.length === 0" class="mb-mount-browser__empty">
                        {{ t("mounts.noMatches", {}, "Nothing here matches that search.") }}
                    </p>

                    <v-list v-else role="listbox" :aria-label="listing.path">
                        <v-list-item
                            v-for="entry in visibleEntries"
                            :key="entry.path"
                            role="option"
                            :aria-selected="selectedFile === entry.path"
                            :active="selectedFile === entry.path"
                            :prepend-icon="entry.kind === 'folder' ? mdiFolder : mdiFile"
                            :title="entry.name"
                            @click="activate(entry)"
                            @keydown.enter="activate(entry)"
                        />
                    </v-list>
                </template>
            </v-card-text>

            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="open = false">
                    {{ t("mounts.cancel", {}, "Cancel") }}
                </v-btn>
                <v-btn variant="tonal" :disabled="!canChoose" @click="choose">
                    {{
                        mode === "file"
                            ? t("mounts.useFile", {}, "Use this file")
                            : t("mounts.useFolder", {}, "Use this folder")
                    }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style scoped>
.mb-mount-browser__where {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem;
}

.mb-mount-browser__path {
    /* The full path, because a person deciding whether this is the right folder needs it,
       and an ellipsis in the middle of a path hides exactly the part that distinguishes
       two folders with the same name. */
    flex: 1 1 100%;
    overflow-wrap: anywhere;
    font-size: 0.75rem;
    opacity: 0.75;
}

.mb-mount-browser__bar {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
}

.mb-mount-browser__empty,
.mb-mount-browser__note {
    margin: 0.75rem 0;
    opacity: 0.8;
}
</style>
