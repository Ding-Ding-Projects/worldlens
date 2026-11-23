<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn } from "vuetify/components";
import PathField from "../PathField.vue";
import { formatBytes } from "./nbtEditorModel.js";
import type { ProjectFile, ProjectListing, RegionChunk } from "./nbtEditorBridge.js";

/**
 * The project's files: the folders Minecraft keeps NBT in, with region files that open into a
 * chunk list. "Open any NBT file" is always here, for a file that is not part of a world.
 */
const props = defineProps<{
    listing: ProjectListing | null;
    openPath: string | null;
    chunkList: { path: string; chunks: readonly RegionChunk[] } | null;
    openChunkIndex: number | null;
    projectDir: string | null;
}>();
const emit = defineEmits<{
    "open-project": [dir: string];
    "open-file": [relativePath: string];
    "show-chunks": [relativePath: string];
    "open-chunk": [relativePath: string, index: number];
    "pick-file": [];
}>();
const { t } = useI18n();

const folder = ref(props.projectDir ?? "");
const groups = computed(() => {
    const out: { name: string; files: ProjectFile[] }[] = [];
    for (const file of props.listing?.files ?? []) {
        let group = out.find((g) => g.name === file.group);
        if (group === undefined) {
            group = { name: file.group, files: [] };
            out.push(group);
        }
        group.files.push(file);
    }
    return out;
});

function submitFolder(): void {
    const value = folder.value.trim();
    if (value !== "") emit("open-project", value);
}

const readableChunks = computed(() => props.chunkList?.chunks ?? []);
</script>

<template>
    <nav class="wl-nbt-files" :aria-label="t('nbt.files.label', 'Files')">
        <form class="wl-nbt-files__folder" @submit.prevent="submitFolder">
            <PathField
                v-model="folder"
                :field="t('nbt.files.folderField', 'world folder')"
                semantic="folder"
                :label="t('nbt.files.folder', 'World folder')"
                :placeholder="t('nbt.files.folderHint', 'the folder holding level.dat')"
                density="compact"
            />
            <v-btn type="submit" size="small" variant="tonal" :disabled="folder.trim() === ''">{{ t('nbt.files.open', 'Open') }}</v-btn>
        </form>

        <p v-if="!listing" class="wl-nbt-files__hint">{{ t('nbt.files.none', 'Enter a world folder, or open a single NBT file below.') }}</p>
        <p v-else-if="listing.files.length === 0" class="wl-nbt-files__hint">{{ t('nbt.files.empty', 'No NBT or region files were found in this folder.') }}</p>

        <div class="wl-nbt-files__list">
            <section v-for="group in groups" :key="group.name" class="wl-nbt-files__group">
                <h3>{{ group.name }}</h3>
                <template v-for="file in group.files" :key="file.relativePath">
                    <button
                        v-if="file.kind !== 'region'"
                        type="button"
                        class="wl-nbt-file"
                        :class="{ 'is-open': openPath === file.relativePath }"
                        :aria-current="openPath === file.relativePath ? 'true' : undefined"
                        @click="emit('open-file', file.relativePath)"
                    >
                        <span>{{ file.name }}</span>
                        <small>{{ formatBytes(file.size) }}</small>
                    </button>
                    <template v-else>
                        <button
                            type="button"
                            class="wl-nbt-file"
                            :class="{ 'is-open': chunkList?.path === file.relativePath }"
                            :aria-expanded="chunkList?.path === file.relativePath ? 'true' : 'false'"
                            @click="emit('show-chunks', file.relativePath)"
                        >
                            <span>{{ file.name }}</span>
                            <small>{{ formatBytes(file.size) }}</small>
                        </button>
                        <div v-if="chunkList?.path === file.relativePath" class="wl-nbt-chunks" role="group" :aria-label="t('nbt.files.chunks', { name: file.name }, 'Chunks in {name}')">
                            <p class="wl-nbt-files__hint">{{ t('nbt.files.chunkCount', { count: readableChunks.length }, '{count} chunks stored') }}</p>
                            <button
                                v-for="chunk in readableChunks"
                                :key="chunk.index"
                                type="button"
                                class="wl-nbt-chunk"
                                :class="{ 'is-open': openChunkIndex === chunk.index && openPath === file.relativePath }"
                                :disabled="!chunk.readable"
                                :title="chunk.unsupported ?? undefined"
                                @click="emit('open-chunk', file.relativePath, chunk.index)"
                            >
                                {{ chunk.x }}, {{ chunk.z }}
                                <small v-if="!chunk.readable">{{ t('nbt.files.unreadable', 'cannot edit') }}</small>
                            </button>
                        </div>
                    </template>
                </template>
            </section>
            <p v-if="listing?.truncated" class="wl-nbt-files__hint">{{ t('nbt.files.truncated', 'Only the first files are listed.') }}</p>
        </div>

        <v-btn class="wl-nbt-files__pick" variant="outlined" rounded="pill" size="small" @click="emit('pick-file')">{{ t('nbt.files.pick', 'Open any NBT file...') }}</v-btn>
    </nav>
</template>

<style scoped>
.wl-nbt-files { display: flex; flex-direction: column; gap: 8px; min-height: 0; padding: 12px; border-radius: 16px; background: rgb(var(--v-theme-surface-container, var(--v-theme-surface))); font-size: 13px; }
.wl-nbt-files__folder { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.wl-nbt-files__folder > :first-child { flex: 1 1 100%; min-width: 0; }
.wl-nbt-files__folder :deep(.mb-path-field__row) { flex-wrap: nowrap; }
.wl-nbt-files__folder :deep(.mb-path-field__row > .v-input) { flex: 1 1 auto; min-width: 0; }
.wl-nbt-files__hint { margin: 0; font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-nbt-files__list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.wl-nbt-files__group h3 { margin: 6px 8px 2px; font-size: 11px; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; color: rgb(var(--v-theme-on-surface-variant)); overflow-wrap: anywhere; }
.wl-nbt-file { display: flex; justify-content: space-between; gap: 8px; width: 100%; text-align: left; padding: 8px; min-height: 36px; border: 0; border-radius: 8px; background: transparent; color: rgb(var(--v-theme-on-surface)); cursor: pointer; font: inherit; }
.wl-nbt-file:hover { background: rgba(var(--v-theme-primary), 0.08); }
.wl-nbt-file.is-open { background: rgba(var(--v-theme-primary), 0.18); }
.wl-nbt-file small { color: rgb(var(--v-theme-on-surface-variant)); }
.wl-nbt-chunks { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 4px; padding: 4px 8px 8px; max-height: 240px; overflow: auto; }
.wl-nbt-chunk { min-height: 32px; border-radius: 8px; border: 1px solid rgba(var(--v-theme-on-surface), 0.2); background: transparent; color: rgb(var(--v-theme-on-surface)); cursor: pointer; font: 12px "Roboto Mono", monospace; }
.wl-nbt-chunk.is-open { background: rgba(var(--v-theme-primary), 0.22); }
.wl-nbt-chunk:disabled { opacity: 0.5; cursor: not-allowed; }
.wl-nbt-chunk small { display: block; font-size: 9px; }
.wl-nbt-file:focus-visible, .wl-nbt-chunk:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.wl-nbt-files__pick { margin-top: auto; align-self: stretch; }
@media (max-width: 720px) { .wl-nbt-file { min-height: 48px; } .wl-nbt-chunk { min-height: 48px; } }
</style>
