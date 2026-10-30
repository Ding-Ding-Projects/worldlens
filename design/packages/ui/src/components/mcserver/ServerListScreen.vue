<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCubeOutline,
    mdiDns,
    mdiPlay,
    mdiPlus,
    mdiRefresh,
    mdiServerNetwork,
    mdiStop,
    mdiTrashCanOutline,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VBtnToggle,
    VCard,
    VCardText,
    VCheckbox,
    VChip,
    VIcon,
    VProgressCircular,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import ServerJobHeader from "./ServerJobHeader.vue";
import { useServerStore } from "./useServers.js";
import {
    filterServers,
    flavourName,
    lifecycleBlockReason,
    sortServers,
    stateLabel,
    transportSummary,
    type InstanceState,
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
const emit = defineEmits<{
    open: [id: string];
    create: [];
    adopt: [];
    hostProfile: [];
}>();

const { t } = useI18n();
const store = useServerStore();

const query = ref("");
const useRegex = ref(false);
const flags = ref("i");
const sort = ref<ServerSort>("name");
const selected = ref<readonly string[]>([]);
const bulkBusy = ref(false);
const lifecycleErrors = ref<string[]>([]);
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
    if (element !== undefined) {
        element.focus();
        return;
    }

    // The originating control can disappear while the detail panel is open because a
    // search filter changed, the record was removed, or another shell took ownership.
    // Return to a stable list entry instead of leaving keyboard focus on a detached node.
    const search = document.querySelector<HTMLElement>(".wl-mcserver-list__search input");
    if (search !== null) {
        search.focus();
        return;
    }
    const heading = document.querySelector<HTMLElement>('[data-test="mcserver-list-heading"]');
    if (heading !== null) {
        heading.focus();
        return;
    }
    document.querySelector<HTMLElement>("[data-server-control]")?.focus();
}

let statusTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const monitored = new Map<string, number>();
async function pollRunning(): Promise<void> {
    try {
        const ids = new Set(store.servers.value.map((server) => server.id));
        for (const id of monitored.keys()) if (!ids.has(id)) monitored.delete(id);
        for (const server of store.servers.value) {
            if (disposed) return;
            if (store.statuses[server.id]?.running) monitored.set(server.id, 0);
            if (!monitored.has(server.id)) continue;
            const answer = await store.refreshStatus(server.id);
            if (disposed) return;
            if (!answer.ok || answer.value?.state === "unknown") {
                const attempts = (monitored.get(server.id) ?? 0) + 1;
                if (attempts >= 3) monitored.delete(server.id);
                else monitored.set(server.id, attempts);
                continue;
            }
            if (answer.value?.running) monitored.set(server.id, 0);
            else monitored.delete(server.id);
            if (answer.ok && answer.value?.state === "exited") {
                lifecycleErrors.value.push(
                    t(
                        "mcserver.lifecycle.exited",
                        { name: server.name, code: answer.value.exitCode ?? "unknown" },
                        {
                            default:
                                "Server {name} exited (code {code}). Open its console or logs for details.",
                        },
                    ),
                );
            }
        }
    } finally {
        if (!disposed)
            statusTimer = setTimeout(() => {
                void pollRunning();
            }, 2000);
    }
}
onMounted(() => {
    void refreshAll();
    statusTimer = setTimeout(() => {
        void pollRunning();
    }, 2000);
});
onUnmounted(() => {
    disposed = true;
    clearTimeout(statusTimer);
});

async function refreshAll(): Promise<void> {
    await store.load();
    const records = [...store.servers.value];
    for (let offset = 0; offset < records.length; offset += 4) {
        await Promise.allSettled(
            records
                .slice(offset, offset + 4)
                .flatMap((server) => [probeOne(server.id), store.refreshStatus(server.id)]),
        );
    }
}

/**
 * Whether each server's host answered its last probe. Only a settled probe may put a
 * "could not be reached" sentence on a card: before the first answer the capabilities are
 * merely unknown, and saying the host is unreachable then would be a guess shown as a fact.
 */
const probeSettled = reactive<Record<string, "reachable" | "unreachable">>({});
async function probeOne(id: string): Promise<void> {
    try {
        const answer = await store.probe(id);
        probeSettled[id] =
            answer.ok && answer.value?.reachable !== false ? "reachable" : "unreachable";
    } catch {
        probeSettled[id] = "unreachable";
    }
}

/* A one-second clock, so "checked 3 s ago" is computed where it is shown, never stored. */
const now = ref(Date.now());
const clock = setInterval(() => {
    now.value = Date.now();
}, 1000);
onUnmounted(() => clearInterval(clock));

function stateOf(id: string): InstanceState | null {
    return store.statuses[id]?.state ?? null;
}
function isRunning(id: string): boolean {
    const state = stateOf(id);
    return state === "running" || state === "paused";
}
/** The one lifecycle action a card offers: Stop while it runs, Start otherwise. */
function primaryAction(id: string): "start" | "stop" {
    return isRunning(id) ? "stop" : "start";
}
function blockReason(server: ServerRecord, action: "start" | "stop"): string | null {
    return lifecycleBlockReason(
        server,
        store.capabilitiesFor(server.id),
        action,
        stateOf(server.id),
    );
}
/** The sentence a card prints in the error colour: why its own lifecycle control is refused. */
function cardNotice(server: ServerRecord): string | null {
    if (probeSettled[server.id] === undefined) return null;
    if (probeSettled[server.id] === "unreachable") {
        return t(
            "mcserver.list.hostUnreachable",
            "The host cannot be reached, so its state is unknown rather than assumed stopped.",
        );
    }
    return blockReason(server, primaryAction(server.id));
}
function checkedLabel(id: string): string {
    if (probeSettled[id] === "unreachable")
        return t("mcserver.list.unreachableShort", "host unreachable");
    const at = Date.parse(store.statuses[id]?.checkedAt ?? "");
    if (Number.isNaN(at)) return "";
    const seconds = Math.max(0, Math.round((now.value - at) / 1000));
    return seconds < 60
        ? t("mcserver.list.checkedSeconds", { n: seconds }, "checked {n} s ago")
        : t("mcserver.list.checkedMinutes", { n: Math.floor(seconds / 60) }, "checked {n} min ago");
}
function stateColor(id: string): string {
    const state = stateOf(id);
    if (state === "running") return "secondary-container";
    if (state === "paused" || state === "unknown") return "tertiary-container";
    return "surface-container-highest";
}
function memoryMb(server: ServerRecord): number | null {
    return server.ref.kind === "ssh-process" ? server.ref.memoryMb : null;
}

const sortItems = computed(() => [
    { title: t("mcserver.list.sort.name", "Name"), value: "name" as const },
    { title: t("mcserver.list.sort.recent", "Recently changed"), value: "recent" as const },
    { title: t("mcserver.list.sort.state", "Running first"), value: "state" as const },
]);

const filtered = computed(() =>
    sortServers(
        filterServers(store.servers.value, query.value, useRegex.value, flags.value),
        sort.value,
        (id) => store.statuses[id]?.state ?? null,
    ),
);

watch(
    [() => props.returnServerId, () => store.loaded.value, filtered],
    ([returnServerId]) => {
        if (returnServerId !== null && returnServerId !== undefined) {
            void focusReturnedServer(returnServerId);
        }
    },
    { immediate: true },
);

const sampleText = computed(() => store.servers.value.map((s) => s.name).join("\n"));

const allSelected = computed(
    () => filtered.value.length > 0 && filtered.value.every((s) => selected.value.includes(s.id)),
);
const someSelected = computed(() => selected.value.length > 0 && !allSelected.value);

function toggleSelectAll(): void {
    selected.value = allSelected.value ? [] : filtered.value.map((s) => s.id);
    rangeAnchor = null;
}

/*
 * Shift-click selects a range, the way every list on a desktop does. The checkbox's own
 * `click` arrives before its value update, so the modifier is captured there and spent on
 * the update that follows. The range is taken from the list as it is currently shown -
 * filtered and sorted - because that is the order the person is looking at.
 */
let rangeAnchor: string | null = null;
let pendingShift = false;
function noteModifier(event: MouseEvent): void {
    pendingShift = event.shiftKey;
}
function toggleOne(id: string): void {
    const extend = pendingShift;
    pendingShift = false;
    const order = filtered.value.map((s) => s.id);
    const from = rangeAnchor === null ? -1 : order.indexOf(rangeAnchor);
    const to = order.indexOf(id);
    if (extend && from !== -1 && to !== -1) {
        const range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
        const select = !selected.value.includes(id);
        selected.value = select
            ? [...new Set([...selected.value, ...range])]
            : selected.value.filter((x) => !range.includes(x));
    } else {
        selected.value = selected.value.includes(id)
            ? selected.value.filter((x) => x !== id)
            : [...selected.value, id];
    }
    rangeAnchor = id;
}

const selectedRecords = computed<readonly ServerRecord[]>(() =>
    store.servers.value.filter((s) => selected.value.includes(s.id)),
);

async function bulkStart(): Promise<void> {
    lifecycleErrors.value = [];
    bulkBusy.value = true;
    try {
        for (const record of selectedRecords.value) {
            if (
                lifecycleBlockReason(
                    record,
                    store.capabilitiesFor(record.id),
                    "start",
                    store.statuses[record.id]?.state ?? null,
                ) === null
            ) {
                await lifecycle(record.id, "start");
            }
        }
        await refreshAll();
    } finally {
        bulkBusy.value = false;
    }
}

async function bulkStop(): Promise<void> {
    lifecycleErrors.value = [];
    bulkBusy.value = true;
    try {
        for (const record of selectedRecords.value) {
            if (
                lifecycleBlockReason(
                    record,
                    store.capabilitiesFor(record.id),
                    "stop",
                    store.statuses[record.id]?.state ?? null,
                ) === null
            ) {
                await lifecycle(record.id, "stop");
            }
        }
        await refreshAll();
    } finally {
        bulkBusy.value = false;
    }
}

async function bulkForget(): Promise<void> {
    lifecycleErrors.value = [];
    bulkBusy.value = true;
    try {
        const retained: string[] = [];
        for (const record of selectedRecords.value) {
            try {
                const result = await store.forget(record.id);
                if (!result.ok) {
                    retained.push(record.id);
                    lifecycleErrors.value.push(
                        `${record.name}: ${result.failure?.message ?? t("mcserver.lifecycle.incomplete", "The server operation did not complete. Check its status and try again.")}`,
                    );
                }
            } catch {
                retained.push(record.id);
                lifecycleErrors.value.push(
                    t(
                        "mcserver.lifecycle.incomplete",
                        "The server operation did not complete. Check its status and try again.",
                    ),
                );
            }
        }
        selected.value = retained;
    } finally {
        bulkBusy.value = false;
    }
}

async function lifecycle(id: string, action: "start" | "stop"): Promise<void> {
    try {
        const result =
            action === "start" ? await store.start(id) : await store.stop(id, { graceful: true });
        if (!result.ok)
            lifecycleErrors.value.push(
                `${id}: ${result.failure?.message ?? t("mcserver.lifecycle.incomplete", "The server operation did not complete. Check its status and try again.")}${result.failure?.detail ? ` ${result.failure.detail}` : ""}`,
            );
    } catch {
        lifecycleErrors.value.push(
            t(
                "mcserver.lifecycle.incomplete",
                "The server operation did not complete. Check its status and try again.",
            ),
        );
    }
}
async function lifecycleOne(id: string): Promise<void> {
    if (primaryAction(id) === "stop") await stopOne(id);
    else await startOne(id);
}
async function startOne(id: string): Promise<void> {
    lifecycleErrors.value = [];
    await lifecycle(id, "start");
    await store.refreshStatus(id);
}
async function stopOne(id: string): Promise<void> {
    lifecycleErrors.value = [];
    await lifecycle(id, "stop");
    await store.refreshStatus(id);
}
</script>

<template>
    <div class="wl-mcserver-list">
        <VAlert
            v-if="lifecycleErrors.length"
            type="error"
            role="alert"
            closable
            class="mb-4"
            @click:close="lifecycleErrors = []"
            >{{ lifecycleErrors.join("; ") }}</VAlert
        >
        <ServerJobHeader>
            <template #actions>
                <VBtn
                    :prepend-icon="mdiRefresh"
                    variant="text"
                    color="primary"
                    :disabled="!store.canList"
                    :title="
                        !store.canList
                            ? t(
                                  'mcserver.noHost',
                                  'This build cannot reach a Minecraft server host.',
                              )
                            : undefined
                    "
                    @click="refreshAll"
                >
                    {{ t("mcserver.list.refresh", "Refresh") }}
                </VBtn>
                <VBtn
                    v-if="store.hasAdopt"
                    :prepend-icon="mdiCubeOutline"
                    variant="text"
                    color="primary"
                    @click="emit('adopt')"
                >
                    {{ t("mcserver.list.adopt", "Adopt an existing container") }}
                </VBtn>
                <VBtn
                    v-if="store.hasHostProfiles"
                    :prepend-icon="mdiServerNetwork"
                    variant="text"
                    color="primary"
                    @click="emit('hostProfile')"
                >
                    {{ t("mcserver.list.hostProfile", "Add SSH host") }}
                </VBtn>
                <VBtn
                    :prepend-icon="mdiPlus"
                    color="primary-container"
                    variant="flat"
                    :disabled="!store.canList"
                    :title="
                        !store.canList
                            ? t(
                                  'mcserver.noHost',
                                  'This build cannot reach a Minecraft server host.',
                              )
                            : undefined
                    "
                    @click="emit('create')"
                >
                    {{ t("mcserver.list.create", "New server") }}
                </VBtn>
            </template>
        </ServerJobHeader>

        <VAlert v-if="!store.canList" type="info" variant="tonal" class="mb-4">
            {{
                t(
                    "mcserver.noHost",
                    "This build cannot reach a Minecraft server host. The desktop application is what runs them.",
                )
            }}
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
                    density="comfortable"
                    class="wl-mcserver-list__search"
                />
                <VBtnToggle
                    v-model="sort"
                    mandatory
                    class="wl-mcserver-list__sort"
                    :aria-label="t('mcserver.list.sortLabel', 'Sort by')"
                >
                    <VBtn
                        v-for="item in sortItems"
                        :key="item.value"
                        :value="item.value"
                        :variant="sort === item.value ? 'flat' : 'outlined'"
                        :color="sort === item.value ? 'primary-container' : 'on-surface-variant'"
                        :aria-pressed="sort === item.value"
                    >
                        {{ item.title }}
                    </VBtn>
                </VBtnToggle>
            </div>

            <VCard v-if="filtered.length > 0" variant="outlined" class="wl-mcserver-list__bulkbar">
                <VCheckbox
                    :model-value="allSelected"
                    :indeterminate="someSelected"
                    density="compact"
                    hide-details
                    :label="
                        t('mcserver.list.selectAll', { n: filtered.length }, 'Select all ({n})')
                    "
                    @update:model-value="toggleSelectAll"
                />
                <span v-if="selected.length > 0" class="wl-mcserver-list__selected">{{
                    t("mcserver.list.selectedCount", { n: selected.length }, "{n} selected")
                }}</span>
                <span class="wl-mcserver-list__spacer" />
                <VBtn
                    size="small"
                    variant="text"
                    color="primary"
                    :prepend-icon="mdiPlay"
                    :loading="bulkBusy"
                    :disabled="selected.length === 0"
                    @click="bulkStart"
                >
                    {{ t("mcserver.list.bulkStart", "Start") }}
                </VBtn>
                <VBtn
                    size="small"
                    variant="text"
                    color="primary"
                    :prepend-icon="mdiStop"
                    :loading="bulkBusy"
                    :disabled="selected.length === 0"
                    @click="bulkStop"
                >
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
                    :disabled="bulkBusy || selected.length === 0"
                    @confirm="bulkForget"
                >
                    <template #activator="{ props: activatorProps }">
                        <VBtn
                            v-bind="activatorProps"
                            size="small"
                            variant="text"
                            color="error"
                            :prepend-icon="mdiTrashCanOutline"
                        >
                            {{ t("mcserver.list.bulkForget", "Forget") }}
                        </VBtn>
                    </template>
                </ConfigSuperConfirm>
            </VCard>

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
                                class="wl-mcserver-card__check"
                                :aria-label="
                                    t(
                                        'mcserver.list.selectOne',
                                        { name: server.name },
                                        'Select {name}',
                                    )
                                "
                                @click.capture="noteModifier"
                                @update:model-value="toggleOne(server.id)"
                                @click.stop
                            />
                            <VIcon :icon="mdiDns" size="20" class="wl-mcserver-card__icon" />
                            <VBtn
                                class="wl-mcserver-card__title"
                                :ref="(element) => setServerControlRef(element, server.id)"
                                :data-server-control="server.id"
                                variant="text"
                                color="primary"
                                :ripple="false"
                                @click="emit('open', server.id)"
                            >
                                {{ server.name }}
                            </VBtn>
                            <VChip
                                size="small"
                                :color="stateColor(server.id)"
                                variant="flat"
                                class="wl-mcserver-card__state"
                            >
                                {{ stateLabel(stateOf(server.id)).text }}
                            </VChip>
                        </div>
                        <div class="wl-mcserver-card__meta">
                            {{ flavourName(server.flavour) }}
                            <span v-if="server.minecraftVersion">
                                &middot; {{ server.minecraftVersion }}</span
                            >
                            &middot; {{ transportSummary(server) }}
                        </div>
                        <div class="wl-mcserver-card__chips">
                            <VChip
                                v-if="memoryMb(server) !== null"
                                size="small"
                                variant="outlined"
                                class="wl-mcserver-card__chip"
                            >
                                {{ memoryMb(server) }} MB
                            </VChip>
                            <VChip size="small" variant="outlined" class="wl-mcserver-card__chip">
                                <template v-if="server.rconPort">
                                    {{
                                        t("mcserver.list.port", { p: server.rconPort }, "rcon {p}")
                                    }}
                                    &middot;
                                </template>
                                {{
                                    server.hasRconSecret
                                        ? t("mcserver.list.secretHeld", "secret held")
                                        : t("mcserver.list.noSecret", "no rcon secret")
                                }}
                            </VChip>
                            <VChip
                                v-if="server.origin === 'adopted'"
                                size="small"
                                color="tertiary-container"
                                variant="flat"
                            >
                                {{ t("mcserver.list.adopted", "adopted, not created here") }}
                                <template v-if="server.writeScope.length > 0">
                                    &middot; {{ server.writeScope.join(", ") }}
                                </template>
                            </VChip>
                        </div>
                        <div class="wl-mcserver-card__actions">
                            <VBtn
                                size="small"
                                :variant="
                                    primaryAction(server.id) === 'start' &&
                                    blockReason(server, 'start') === null
                                        ? 'flat'
                                        : 'outlined'
                                "
                                :color="
                                    primaryAction(server.id) === 'start' &&
                                    blockReason(server, 'start') === null
                                        ? 'primary-container'
                                        : 'on-surface'
                                "
                                :prepend-icon="
                                    primaryAction(server.id) === 'stop' ? mdiStop : mdiPlay
                                "
                                :disabled="blockReason(server, primaryAction(server.id)) !== null"
                                :title="blockReason(server, primaryAction(server.id)) ?? undefined"
                                @click="lifecycleOne(server.id)"
                            >
                                {{
                                    primaryAction(server.id) === "stop"
                                        ? t("mcserver.list.stop", "Stop")
                                        : t("mcserver.list.start", "Start")
                                }}
                            </VBtn>
                            <!--
                                The other lifecycle action, only while it is genuinely available
                                too: a paused or unknown server may be both started and stopped,
                                and hiding one of those would take an action away.
                            -->
                            <VBtn
                                v-if="
                                    blockReason(
                                        server,
                                        primaryAction(server.id) === 'stop' ? 'start' : 'stop',
                                    ) === null
                                "
                                size="small"
                                variant="outlined"
                                color="on-surface"
                                :prepend-icon="
                                    primaryAction(server.id) === 'stop' ? mdiPlay : mdiStop
                                "
                                @click="
                                    primaryAction(server.id) === 'stop'
                                        ? startOne(server.id)
                                        : stopOne(server.id)
                                "
                            >
                                {{
                                    primaryAction(server.id) === "stop"
                                        ? t("mcserver.list.start", "Start")
                                        : t("mcserver.list.stop", "Stop")
                                }}
                            </VBtn>
                            <VBtn
                                size="small"
                                variant="outlined"
                                color="primary"
                                class="wl-mcserver-card__open"
                                :ref="(element) => setServerControlRef(element, server.id)"
                                :data-server-control="server.id"
                                @click="emit('open', server.id)"
                            >
                                {{ t("mcserver.list.manage", "Open") }}
                            </VBtn>
                            <span class="wl-mcserver-list__spacer" />
                            <span class="wl-mcserver-card__checked">{{
                                checkedLabel(server.id)
                            }}</span>
                        </div>
                        <p v-if="cardNotice(server)" class="wl-mcserver-card__notice">
                            {{ cardNotice(server) }}
                        </p>
                    </VCardText>
                </VCard>
            </div>
        </template>
    </div>
</template>

<style scoped>
/*
 * Measurements read from `Worldlens.dc.html`'s Minecraft servers job: a 26px/40px page inset,
 * a 44px icon tile beside a 24px title, a 46px search row with a segmented sort beside it, a
 * bulk bar card and two fixed columns of 16px-cornered server cards.
 */
.wl-mcserver-list {
    padding: 26px 40px 44px;
}

@media (max-width: 720px) {
    .wl-mcserver-list {
        padding-inline: 16px;
    }
}

.wl-mcserver-list__toolbar {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    flex-wrap: wrap;
    margin-bottom: 14px;
}
.wl-mcserver-list__search {
    flex: 1 1 320px;
    min-width: 240px;
}
/*
 * The prototype's sort control is a row of separate 12px-cornered outlined buttons with 6px
 * between them, the chosen one filled - a segmented choice whose segments do not touch.
 */
.wl-mcserver-list .wl-mcserver-list__sort {
    block-size: 48px;
    gap: 6px;
    flex: 0 0 auto;
    border-radius: 0;
    overflow: visible;
}
.wl-mcserver-list .wl-mcserver-list__sort :deep(.v-btn) {
    block-size: 48px;
    min-block-size: 48px;
    border-radius: var(--md-sys-shape-corner-medium);
    padding-inline: 16px;
    font-weight: 400;
}
.wl-mcserver-list .wl-mcserver-list__sort :deep(.v-btn--variant-outlined) {
    border: 1px solid rgb(var(--v-theme-outline-variant));
}
.wl-mcserver-list__loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 24px 0;
}
.wl-mcserver-list .wl-mcserver-list__bulkbar {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 4px 14px 4px 6px;
    margin-bottom: 14px;
    border-radius: var(--md-sys-shape-corner-medium);
}
.wl-mcserver-list__selected {
    font-size: var(--md-sys-typescale-body-medium-size);
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-list__spacer {
    flex: 1 1 auto;
}
.wl-mcserver-list__grid {
    display: grid;
    /*
     * Two fixed columns, not `auto-fill`, which is what the design file specifies and what
     * this project already decided once before. An auto-fill grid re-flows on a few pixels of
     * window width, so a list of five servers flips between three-and-two and two-and-three
     * while somebody is dragging the window edge, and every card changes size and position
     * under the pointer. One column below the narrow breakpoint, because two 280px cards
     * genuinely do not fit and the alternative is clipped text.
     */
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
}

@media (max-width: 720px) {
    .wl-mcserver-list__grid {
        grid-template-columns: minmax(0, 1fr);
    }
}

.wl-mcserver-list .wl-mcserver-card {
    background: rgb(var(--v-theme-surface-container));
    border-radius: var(--md-sys-shape-corner-large);
}
.wl-mcserver-list .wl-mcserver-card__body {
    display: flex;
    flex-direction: column;
    padding: 12px 18px 16px 8px;
}
.wl-mcserver-card__top {
    display: flex;
    align-items: center;
    gap: 4px;
}
.wl-mcserver-card__check {
    flex: 0 0 auto;
}
.wl-mcserver-card__icon {
    color: rgb(var(--v-theme-on-surface-variant));
    margin-inline-end: 4px;
}
.wl-mcserver-list .wl-mcserver-card__title {
    flex: 1 1 auto;
    justify-content: flex-start;
    min-inline-size: 0;
    min-block-size: 40px;
    padding-inline: 4px;
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: 500;
}
.wl-mcserver-card__title :deep(.v-btn__content) {
    overflow: hidden;
    text-overflow: ellipsis;
}
.wl-mcserver-card__state {
    flex: 0 0 auto;
}
.wl-mcserver-card__meta,
.wl-mcserver-card__chips,
.wl-mcserver-card__actions,
.wl-mcserver-card__notice {
    margin-inline-start: 10px;
}
.wl-mcserver-card__meta {
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 18px;
    color: rgb(var(--v-theme-outline));
}
.wl-mcserver-card__chips {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
}
.wl-mcserver-card__chip {
    font-family: "Roboto Mono", ui-monospace, monospace;
    color: rgb(var(--v-theme-on-surface-variant));
    border-color: rgb(var(--v-theme-outline-variant));
}
.wl-mcserver-card__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 14px;
}
.wl-mcserver-card__checked {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-label-small-size);
    color: rgb(var(--v-theme-outline));
}
.wl-mcserver-list .wl-mcserver-card__notice {
    margin-top: 10px;
    margin-bottom: 0;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 18px;
    color: rgb(var(--v-theme-error));
}
.wl-mcserver-list .wl-mcserver-card--selected {
    border-color: rgb(var(--v-theme-primary));
}
</style>
