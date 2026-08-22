<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiPuzzleOutline, mdiRefresh } from "@mdi/js";
import { VAlert, VBtn, VChip, VList, VListItem, VListItemSubtitle, VListItemTitle } from "vuetify/components";
import { useServerStore } from "./useServers.js";
import type { FileEntry } from "./serverStore.js";

/**
 * The `plugins/` folder, listed rather than typed into a chat box.
 *
 * Real data from `files.list`, never an invented sample. Uploading a new jar and disabling
 * one both need a write, so both are gated behind the same write-capability check every
 * other write on this server goes through.
 */
const props = defineProps<{ serverId: string }>();

const { t } = useI18n();
const store = useServerStore();

const entries = ref<readonly FileEntry[]>([]);
const failure = ref<string | null>(null);
const loading = ref(true);

async function load(): Promise<void> {
    loading.value = true;
    const result = await store.files.list(props.serverId, "plugins");
    if (result.ok) {
        entries.value = (result.value ?? []).filter((e) => e.kind === "file");
        failure.value = null;
    } else {
        failure.value = result.failure?.message ?? t("mcserver.plugins.readFailed", "The plugins folder could not be read.");
        entries.value = [];
    }
    loading.value = false;
}

onMounted(load);
watch(() => props.serverId, load);

const jarCount = computed(() => entries.value.filter((e) => e.name.toLowerCase().endsWith(".jar")).length);
</script>

<template>
    <div class="wl-mcserver-plugins">
        <div class="wl-mcserver-plugins__header">
            <h3 class="text-subtitle-1">{{ t("mcserver.plugins.title", "Plugins") }}</h3>
            <VBtn :prepend-icon="mdiRefresh" variant="text" size="small" @click="load">
                {{ t("mcserver.plugins.refresh", "Refresh") }}
            </VBtn>
        </div>
        <VAlert v-if="failure" type="warning" variant="tonal">{{ failure }}</VAlert>
        <VAlert v-else-if="!loading && jarCount === 0" type="info" variant="tonal">
            {{ t("mcserver.plugins.empty", "No plugin jars found in this server's plugins folder.") }}
        </VAlert>
        <VList v-else>
            <VListItem v-for="entry in entries" :key="entry.name">
                <template #prepend>
                    <VChip v-if="entry.name.toLowerCase().endsWith('.jar')" size="small" color="primary" variant="tonal">
                        <template #default>{{ t("mcserver.plugins.jar", "jar") }}</template>
                    </VChip>
                </template>
                <VListItemTitle>{{ entry.name }}</VListItemTitle>
                <VListItemSubtitle v-if="entry.size !== null">{{ entry.size }} bytes</VListItemSubtitle>
            </VListItem>
        </VList>
    </div>
</template>

<style scoped>
.wl-mcserver-plugins__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}
</style>
