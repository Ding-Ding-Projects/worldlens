<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCubeOutline, mdiPlay, mdiPlus, mdiRefresh, mdiServerNetwork, mdiStop, mdiTrashCanOutline } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCheckbox,
    VChip,
    VIcon,
    VProgressCircular,
    VSelect,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { useServerStore } from "./useServers.js";
import {
    filterServers,
    flavourName,
    lifecycleBlockReason,
    sortServers,
    stateLabel,
    transportSummary,
    type ServerRecord,
    type ServerSort,
} from "./serverModel.js";

/**
 * Every hosted Minecraft server this installation knows about, as real cards: live state,
 * flavour and version, where it runs, memory and ports, with search, sort, and bulk
 * start/stop/forget over a real multi-select. `canList` drives the whole screen: a build
 * with no host says so plainly rather than showing an empty list that reads as "you have
 * no servers".
 */
const props = defineProps<{ returnServerId?: string | null }>();
const emit = defineEmits<{ open: [id: string]; create: []; adopt: [] }>();

const { t } = useI18n();
const store = useServerStore();

const query = ref("");
const useRegex = ref(false);
const flags = ref("i");
const sort = ref<ServerSort>("name");
const selected = ref<readonly string[]>([]);
const bulkBusy = ref(false);
const serverControlRefs = new Map<string, HTMLElement>();

function setServerControlRef(element: unknown, id: string): void {
    if (element instanceof HTMLElement) {
        serverControlRefs.set(id, element);
        return;
    }
    if (
        typeof element === "object" &&
        element !== null &&
        "$el" in element &&
        (element as { $el?: unknown }).$el instanceof HTMLElement
    ) {
        serverControlRefs.set(id, (element as { $el: HTMLElement }).$el);
        return;
    }
    serverControlRefs.delete(id);
}

async function focusReturnedServer(id: string | null | undefined): Promise<void> {
    if (id === null || id === undefined) return;
    await nextTick();
    const element =
        serverControlRefs.get(id) ??
        [...document.querySelectorAll<HTMLElement>("[data-server-control]")].find(
            (candidate) => candidate.dataset.serverControl === id,
        );
    element?.focus();
}

watch(() => props.returnServerId, focusReturnedServer, { immediate: true });
watch(
    () => store.loaded.value,
    (loaded) => {
        if (loaded) void focusReturnedServer(props.returnServerId);
    },
);

onMounted(() => {
    void refreshAll();
});

async function refreshAll(): Promise<void> {
    await store.load();
    for (const server of store.servers.value) {
        void store.refreshStatus(server.id);
    }
}

const filtered = computed(() =>
    sortServers(
        filterServers(store.servers.value, query.value, useRegex.value, flags.value),
        sort.value,
        (id) => store.statuses[id]?.state ?? null,
    ),
);

const sampleText = computed(() => store.servers.value.map((s) => s.name).join("\n"));

const allSelected = computed(() => filtered.value.length > 0 && filtered.value.every((s) => selected.value.includes(s.id)));
const someSelected = computed(() => selected.value.length > 0 && !allSelected.value);

function toggleSelectAll(): void {
    selected.value = allSelected.value ? [] : filtered.value.map((s) => s.id);
}
function toggleOne(id: string): void {
    selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id];
}

const selectedRecords = computed<readonly ServerRecord[]>(() =>
    store.servers.value.filter((s) => selected.value.includes(s.id)),
);

async function bulkStart(): Promise<void> {
    bulkBusy.value = true;
    for (const record of selectedRecords.value) {
        if (lifecycleBlockReason(record, store.capabilitiesFor(record.id), "start", store.statuses[record.id]?.state ?? null) === null) {
            await store.start(record.id);
        }
    }
    await refreshAll();
    bulkBusy.value = false;
}

async function bulkStop(): Promise<void> {
    bulkBusy.value = true;
    for (const record of selectedRecords.value) {
        if (lifecycleBlockReason(record, store.capabilitiesFor(record.id), "stop", store.statuses[record.id]?.state ?? null) === null) {
            await store.stop(record.id, { graceful: true });
        }
    }
    await refreshAll();
    bulkBusy.value = false;
}

async function bulkForget(): Promise<void> {
    bulkBusy.value = true;
    for (const record of selectedRecords.value) {
        await store.forget(record.id);
    }
    selected.value = [];
    bulkBusy.value = false;
}

async function startOne(id: string): Promise<void> {
    await store.start(id);
    await store.refreshStatus(id);
}
async function stopOne(id: string): Promise<void> {
    await store.stop(id, { graceful: true });
    await store.refreshStatus(id);
}

</script>

<template>
    <div class="wl-mcserver-list">
        <div class="wl-mcserver-list__header">
            <div class="text-h6">{{ t("mcserver.list.title", "Minecraft servers") }}</div>
            <div class="wl-mcserver-list__actions">
                <VBtn
                    :prepend-icon="mdiRefresh"
                    variant="text"
                    :disabled="!store.canList"
                    :title="!store.canList ? t('mcserver.noHost', 'This build cannot reach a Minecraft server host.') : undefined"
                    @click="refreshAll"
                >
                    {{ t("mcserver.list.refresh", "Refresh") }}
                </VBtn>
                <VBtn
                    v-if="store.hasAdopt"
                    :prepend-icon="mdiCubeOutline"
                    variant="text"
                    @click="emit('adopt')"
                >
                    {{ t("mcserver.list.adopt", "Adopt an existing container") }}
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

        <template v-else-if="!store.loaded.value">
            <div class="wl-mcserver-list__loading">
                <VProgressCircular indeterminate size="24" />
                <span>{{ t("mcserver.list.loading", "Loading servers…") }}</span>
            </div>
        </template>

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

            <div v-if="filtered.length > 0" class="wl-mcserver-list__bulkbar">
                <VCheckbox
                    :model-value="allSelected"
                    :indeterminate="someSelected"
                    density="compact"
                    hide-details
                    :label="t('mcserver.list.selectAll', { n: filtered.length }, 'Select all ({n})')"
                    @update:model-value="toggleSelectAll"
                />
                <template v-if="selected.length > 0">
                    <span class="text-caption text-medium-emphasis">{{ t("mcserver.list.selectedCount", { n: selected.length }, "{n} selected") }}</span>
                    <VBtn size="small" variant="text" :prepend-icon="mdiPlay" :loading="bulkBusy" @click="bulkStart">
                        {{ t("mcserver.list.bulkStart", "Start") }}
                    </VBtn>
                    <VBtn size="small" variant="text" :prepend-icon="mdiStop" :loading="bulkBusy" @click="bulkStop">
                        {{ t("mcserver.list.bulkStop", "Stop") }}
                    </VBtn>
                    <ConfigSuperConfirm
                        :title="t('mcserver.list.bulkForgetTitle', 'Forget the selected servers')"
                        :action="
                            t(
                                'mcserver.list.bulkForgetAction',
                                { n: selected.length },
                                'Remove {n} server(s) from this app. Their containers, folders, and worlds are never deleted.',
                            )
                        "
                        :affected="selectedRecords.map((r) => r.name)"
                        :confirm-label="t('mcserver.list.bulkForgetConfirm', 'Forget them')"
                        :disabled="bulkBusy"
                        @confirm="bulkForget"
                    >
                        <template #activator="{ props: activatorProps }">
                            <VBtn v-bind="activatorProps" size="small" variant="text" color="error" :prepend-icon="mdiTrashCanOutline">
                                {{ t("mcserver.list.bulkForget", "Forget") }}
                            </VBtn>
                        </template>
                    </ConfigSuperConfirm>
                </template>
            </div>

            <VAlert v-if="filtered.length === 0" type="info" variant="tonal">
                {{
                    store.servers.value.length === 0
                        ? t("mcserver.list.empty", "No servers yet. Create one to get started.")
                        : t("mcserver.list.noMatches", "Nothing matches that search.")
                }}
            </VAlert>

            <div v-else class="wl-mcserver-list__grid">
                <VCard
                    v-for="server in filtered"
                    :key="server.id"
                    class="wl-mcserver-card"
                    :class="{ 'wl-mcserver-card--selected': selected.includes(server.id) }"
                    variant="outlined"
                >
                    <VCardText class="wl-mcserver-card__body">
                        <div class="wl-mcserver-card__top">
                            <VCheckbox
                                :model-value="selected.includes(server.id)"
                                density="compact"
                                hide-details
                                :aria-label="t('mcserver.list.selectOne', { name: server.name }, 'Select {name}')"
                                @update:model-value="toggleOne(server.id)"
                                @click.stop
                            />
                            <VIcon :icon="mdiServerNetwork" />
                            <VBtn
                                class="wl-mcserver-card__title"
                                :ref="(element) => setServerControlRef(element, server.id)"
                                :data-server-control="server.id"
                                variant="text"
                                :ripple="false"
                                @click="emit('open', server.id)"
                            >
                                {{ server.name }}
                            </VBtn>
                            <VChip size="small" :color="stateLabel(store.statuses[server.id]?.state ?? null).color" variant="flat">
                                {{ stateLabel(store.statuses[server.id]?.state ?? null).text }}
                            </VChip>
                        </div>
                        <div class="text-caption text-medium-emphasis">
                            {{ flavourName(server.flavour) }}
                            <span v-if="server.minecraftVersion"> &middot; {{ server.minecraftVersion }}</span>
                            &middot; {{ transportSummary(server) }}
                            <span v-if="server.rconPort"> &middot; {{ t("mcserver.list.port", { p: server.rconPort }, "port {p}") }}</span>
                            <span v-if="server.origin === 'adopted'">
                                &middot; {{ t("mcserver.list.adopted", "adopted, not created here") }}
                            </span>
                        </div>
                        <div class="wl-mcserver-card__actions">
                            <VBtn
                                size="small"
                                variant="tonal"
                                :prepend-icon="mdiPlay"
                                :disabled="lifecycleBlockReason(server, store.capabilitiesFor(server.id), 'start', store.statuses[server.id]?.state ?? null) !== null"
                                :title="lifecycleBlockReason(server, store.capabilitiesFor(server.id), 'start', store.statuses[server.id]?.state ?? null) ?? undefined"
                                @click="startOne(server.id)"
                            >
                                {{ t("mcserver.list.start", "Start") }}
                            </VBtn>
                            <VBtn
                                size="small"
                                variant="tonal"
                                :prepend-icon="mdiStop"
                                :disabled="lifecycleBlockReason(server, store.capabilitiesFor(server.id), 'stop', store.statuses[server.id]?.state ?? null) !== null"
                                :title="lifecycleBlockReason(server, store.capabilitiesFor(server.id), 'stop', store.statuses[server.id]?.state ?? null) ?? undefined"
                                @click="stopOne(server.id)"
                            >
                                {{ t("mcserver.list.stop", "Stop") }}
                            </VBtn>
                            <VBtn
                                size="small"
                                variant="text"
                                :ref="(element) => setServerControlRef(element, server.id)"
                                :data-server-control="server.id"
                                @click="emit('open', server.id)"
                            >
                                {{ t("mcserver.list.manage", "Manage") }}
                            </VBtn>
                        </div>
                    </VCardText>
                </VCard>
            </div>
        </template>
    </div>
</template>

<style scoped>
/*
 * The page's own margins, which this screen simply never had.
 *
 * Every sibling destination pads itself: `CataloguePage.vue` uses 48px inline, dropping to
 * 20px on a narrow window. This one had no rule for its root at all, so its content ran flush
 * to both edges of the shell. Measured on the packaged app at a 1400px viewport, the "New
 * server" button occupied 1258 to 1400: its right edge was exactly the window edge, with the
 * title jammed against the navigation rail on the other side. It read as a screen that had
 * overflowed, and clicks near the edge of that button had nowhere to land.
 *
 * Matching the catalogue's numbers rather than inventing new ones, so the two destinations
 * line up when somebody moves between them.
 */
.wl-mcserver-list {
    padding: 18px 48px 48px;
}

@media (max-width: 720px) {
    .wl-mcserver-list {
        padding-inline: 20px;
    }
}

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
.wl-mcserver-list__loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 24px 0;
}
.wl-mcserver-list__bulkbar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 8px;
}
.wl-mcserver-list__grid {
    display: grid;
    /*
     * Two fixed columns, not `auto-fill`, which is what the design file specifies and what
     * this project already decided once before. An auto-fill grid re-flows on a few pixels of
     * window width, so a list of five servers flips between three-and-two and two-and-three
     * while somebody is dragging the window edge, and every card changes size and position
     * under the pointer. The same reasoning is recorded for the Home catalogue grid.
     *
     * One column below the narrow breakpoint, because two 280px cards genuinely do not fit
     * and the alternative is clipped text, which no amount of design fidelity is worth.
     */
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
}

@media (max-width: 720px) {
    .wl-mcserver-list__grid {
        grid-template-columns: minmax(0, 1fr);
    }
}

.wl-mcserver-card {
    /*
     * The design file gives these cards a filled surface-container background rather than the
     * transparent one `variant="outlined"` leaves behind. On the dark scheme a transparent
     * card over the page background is a rectangle of hairline with nothing inside it, which
     * is why the list read as a wireframe rather than as a set of objects.
     */
    background: rgb(var(--v-theme-surface-container));
}
.wl-mcserver-card__body {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.wl-mcserver-card__top {
    display: flex;
    align-items: center;
    gap: 6px;
}
.wl-mcserver-card__title {
    background: transparent;
    border: none;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    flex: 1;
    padding: 0;
    min-height: 44px;
    display: flex;
    align-items: center;
}
.wl-mcserver-card--selected {
    border-color: rgb(var(--v-theme-primary));
}
.wl-mcserver-card__actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}
</style>
