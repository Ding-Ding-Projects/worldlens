<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiPlus, mdiRefresh, mdiServerNetwork } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VChip, VIcon, VList, VListItem, VListItemTitle, VListItemSubtitle, VSelect } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { useServerStore } from "./useServers.js";
import { filterServers, flavourName, sortServers, stateLabel, transportSummary, type ServerSort } from "./serverModel.js";

/**
 * Every hosted Minecraft server this installation knows about, in one searchable list.
 *
 * `canList` drives the whole screen: a build with no host says so plainly rather than
 * showing an empty list that reads as "you have no servers".
 */
const emit = defineEmits<{ open: [id: string]; create: [] }>();

const { t } = useI18n();
const store = useServerStore();

const query = ref("");
const useRegex = ref(false);
const flags = ref("i");
const sort = ref<ServerSort>("name");

onMounted(() => {
    void store.load();
});

const filtered = computed(() =>
    sortServers(
        filterServers(store.servers.value, query.value, useRegex.value, flags.value),
        sort.value,
        (id) => store.statuses[id]?.state ?? null,
    ),
);

const sampleText = computed(() => store.servers.value.map((s) => s.name).join("\n"));
</script>

<template>
    <div class="wl-mcserver-list">
        <div class="wl-mcserver-list__header">
            <h2 class="text-h6">{{ t("mcserver.list.title", "Minecraft servers") }}</h2>
            <div class="wl-mcserver-list__actions">
                <VBtn
                    :prepend-icon="mdiRefresh"
                    variant="text"
                    :disabled="!store.canList"
                    :title="!store.canList ? t('mcserver.noHost', 'This build cannot reach a Minecraft server host.') : undefined"
                    @click="store.load()"
                >
                    {{ t("mcserver.list.refresh", "Refresh") }}
                </VBtn>
                <VBtn
                    :prepend-icon="mdiPlus"
                    color="primary"
                    variant="tonal"
                    :disabled="!store.canList"
                    :title="!store.canList ? t('mcserver.noHost', 'This build cannot reach a Minecraft server host.') : undefined"
                    @click="emit('create')"
                >
                    {{ t("mcserver.list.create", "New server") }}
                </VBtn>
            </div>
        </div>

        <VAlert v-if="!store.canList" type="info" variant="tonal" class="mb-4">
            {{ t("mcserver.noHost", "This build cannot reach a Minecraft server host. The desktop application is what runs them.") }}
        </VAlert>

        <VAlert v-else-if="store.failure.value" type="warning" variant="tonal" class="mb-4">
            {{ store.failure.value }}
        </VAlert>

        <template v-else>
            <div class="wl-mcserver-list__toolbar">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="useRegex"
                    v-model:flags="flags"
                    :label="t('mcserver.list.search', 'Search servers')"
                    :sample="sampleText"
                    class="wl-mcserver-list__search"
                />
                <VSelect
                    v-model="sort"
                    :items="[
                        { title: t('mcserver.list.sort.name', 'Name'), value: 'name' },
                        { title: t('mcserver.list.sort.recent', 'Recently changed'), value: 'recent' },
                        { title: t('mcserver.list.sort.state', 'Running first'), value: 'state' },
                    ]"
                    :label="t('mcserver.list.sortLabel', 'Sort by')"
                    density="compact"
                    hide-details
                    class="wl-mcserver-list__sort"
                />
            </div>

            <VAlert v-if="store.loaded.value && filtered.length === 0" type="info" variant="tonal">
                {{
                    store.servers.value.length === 0
                        ? t("mcserver.list.empty", "No servers yet. Create one to get started.")
                        : t("mcserver.list.noMatches", "Nothing matches that search.")
                }}
            </VAlert>

            <VList v-else class="wl-mcserver-list__items">
                <VListItem
                    v-for="server in filtered"
                    :key="server.id"
                    class="wl-mcserver-list__item"
                    :title="server.name"
                    @click="emit('open', server.id)"
                >
                    <template #prepend>
                        <VIcon :icon="mdiServerNetwork" />
                    </template>
                    <VListItemTitle>{{ server.name }}</VListItemTitle>
                    <VListItemSubtitle>
                        {{ flavourName(server.flavour) }}
                        <span v-if="server.minecraftVersion"> &middot; {{ server.minecraftVersion }}</span>
                        &middot; {{ transportSummary(server) }}
                        <span v-if="server.origin === 'adopted'">
                            &middot; {{ t("mcserver.list.adopted", "adopted, not created here") }}
                        </span>
                    </VListItemSubtitle>
                    <template #append>
                        <VChip
                            size="small"
                            :color="stateLabel(store.statuses[server.id]?.state ?? null).color"
                            variant="flat"
                        >
                            {{ stateLabel(store.statuses[server.id]?.state ?? null).text }}
                        </VChip>
                    </template>
                </VListItem>
            </VList>
        </template>
    </div>
</template>

<style scoped>
.wl-mcserver-list__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
}
.wl-mcserver-list__actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
.wl-mcserver-list__toolbar {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    flex-wrap: wrap;
    margin-bottom: 12px;
}
.wl-mcserver-list__search {
    flex: 1 1 320px;
    min-width: 240px;
}
.wl-mcserver-list__sort {
    max-width: 220px;
}
.wl-mcserver-list__item {
    cursor: pointer;
}
</style>
