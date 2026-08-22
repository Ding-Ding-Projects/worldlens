<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAccountPlus, mdiDelete, mdiRefresh } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VCheckbox,
    VChip,
    VDialog,
    VMenu,
    VList,
    VListItem,
    VSelect,
    VSwitch,
    VTab,
    VTabs,
    VTable,
    VTextField,
    VWindow,
    VWindowItem,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { useServerStore } from "./useServers.js";
import { writeBlockReason } from "./serverModel.js";
import { playersAction, playersList, type PlayerActionKind, type PlayerRecord } from "./mcserverBridge.js";

/**
 * Who is online right now, plus the three flat-file lists (ops, whitelist, bans) as real
 * record tables. The online tab talks to the running server through `players.*`; the list
 * tabs read and rewrite the JSON files directly, exactly as before.
 */
const props = defineProps<{ serverId: string }>();

const { t } = useI18n();
const store = useServerStore();

type ListKind = "online" | "ops" | "whitelist" | "bans";
const FILES: Record<Exclude<ListKind, "online">, string> = {
    ops: "ops.json",
    whitelist: "whitelist.json",
    bans: "banned-players.json",
};

interface Entry {
    readonly name: string;
    readonly raw: Record<string, unknown>;
}

const tab = ref<ListKind>("online");
const lists = reactive<Record<Exclude<ListKind, "online">, Entry[]>>({ ops: [], whitelist: [], bans: [] });
const hashes = reactive<Record<Exclude<ListKind, "online">, string | null>>({ ops: null, whitelist: null, bans: null });
const failure = ref<string | null>(null);
const addDialog = ref(false);
const newName = ref("");
const newReason = ref("");
/** Default to picking a known name; typing one is an explicit opt-in. */
const addAsCustom = ref(false);

const online = ref<PlayerRecord[]>([]);
const onlineFailure = ref<string | null>(null);
const query = ref("");
const useRegex = ref(false);
const flags = ref("i");
const selected = ref<Set<string>>(new Set());

function parseList(text: string): Entry[] {
    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
            .map((entry) => ({ name: String(entry["name"] ?? entry["uuid"] ?? ""), raw: entry }));
    } catch {
        return [];
    }
}

async function loadList(kind: Exclude<ListKind, "online">): Promise<void> {
    const result = await store.files.read(props.serverId, FILES[kind]);
    if (result.ok && result.value) {
        lists[kind] = parseList(new TextDecoder().decode(result.value.bytes));
        hashes[kind] = result.value.hash;
        failure.value = null;
    } else if (result.ok === false && result.failure?.code === "not-found") {
        lists[kind] = [];
        hashes[kind] = null;
    } else {
        failure.value = result.failure?.message ?? t("mcserver.players.readFailed", "That list could not be read.");
    }
}

async function loadOnline(): Promise<void> {
    const result = await playersList(props.serverId);
    if (result.ok) {
        online.value = [...(result.value ?? [])];
        onlineFailure.value = null;
    } else {
        onlineFailure.value = result.failure?.message ?? t("mcserver.players.onlineFailed", "Could not reach the running server.");
        online.value = [];
    }
}

async function loadAll(): Promise<void> {
    await Promise.all([loadOnline(), loadList("ops"), loadList("whitelist"), loadList("bans")]);
}

onMounted(loadAll);
watch(() => props.serverId, loadAll);

const capabilities = computed(() => store.capabilitiesFor(props.serverId));
const server = computed(() => store.get(props.serverId));
const blockReason = computed(() => (server.value ? writeBlockReason(server.value, capabilities.value) : null));

/**
 * Every player name this app already knows about, from the currently-online roster plus
 * every flat-file list it has read - never invented. The add dialog offers these as a
 * picker by default; typing a name not yet known to the app is an explicit opt-in.
 */
const knownNames = computed(() => {
    const names = new Set<string>();
    for (const p of online.value) names.add(p.name);
    for (const kind of ["ops", "whitelist", "bans"] as const) {
        for (const entry of lists[kind]) names.add(entry.name);
    }
    if (tab.value !== "online") {
        for (const entry of lists[tab.value as Exclude<ListKind, "online">]) names.delete(entry.name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
});

async function persist(kind: Exclude<ListKind, "online">): Promise<void> {
    const result = await store.files.write(props.serverId, FILES[kind], {
        text: JSON.stringify(
            lists[kind].map((entry) => entry.raw),
            null,
            2,
        ),
        expectedHash: hashes[kind],
    });
    if (result.ok && result.value) {
        hashes[kind] = result.value.hash;
        failure.value = null;
    } else {
        failure.value = result.failure?.message ?? t("mcserver.players.saveFailed", "Could not save.");
    }
}

function nameValid(name: string): string | null {
    if (name.trim() === "") return t("mcserver.players.nameRequired", "A player name is required.");
    if (!/^[A-Za-z0-9_]{1,16}$/.test(name.trim())) {
        return t("mcserver.players.nameInvalid", "Minecraft names are 1-16 characters of letters, digits and underscores.");
    }
    return null;
}
const newNameError = computed(() => (newName.value === "" ? null : nameValid(newName.value)));

function openAdd(): void {
    newName.value = "";
    newReason.value = "";
    addAsCustom.value = knownNames.value.length === 0;
    addDialog.value = true;
}

async function confirmAdd(): Promise<void> {
    if (tab.value === "online" || nameValid(newName.value) !== null) return;
    const kind = tab.value;
    const raw: Record<string, unknown> =
        kind === "bans"
            ? { name: newName.value.trim(), reason: newReason.value.trim() || "Banned by an operator." }
            : kind === "ops"
              ? { name: newName.value.trim(), level: 4, bypassesPlayerLimit: false }
              : { name: newName.value.trim() };
    lists[kind] = [...lists[kind], { name: newName.value.trim(), raw }];
    await persist(kind);
    addDialog.value = false;
}

async function remove(kind: Exclude<ListKind, "online">, name: string): Promise<void> {
    lists[kind] = lists[kind].filter((entry) => entry.name !== name);
    await persist(kind);
}

async function bulkRemove(kind: Exclude<ListKind, "online">): Promise<void> {
    const targets = selected.value;
    lists[kind] = lists[kind].filter((entry) => !targets.has(entry.name));
    selected.value = new Set();
    await persist(kind);
}

const filteredOnline = computed(() => {
    if (query.value.trim() === "") return online.value;
    if (!useRegex.value) {
        const needle = query.value.toLowerCase();
        return online.value.filter((p) => p.name.toLowerCase().includes(needle));
    }
    try {
        const pattern = new RegExp(query.value, flags.value);
        return online.value.filter((p) => pattern.test(p.name));
    } catch {
        return [];
    }
});

async function act(name: string, action: PlayerActionKind, reason?: string): Promise<void> {
    const request: { action: PlayerActionKind; name: string; reason?: string } = reason === undefined ? { action, name } : { action, name, reason };
    const result = await playersAction(props.serverId, request);
    if (result.ok) await loadOnline();
    else onlineFailure.value = result.failure?.message ?? t("mcserver.players.actionFailed", "That action failed.");
}

function toggleSelect(name: string): void {
    const next = new Set(selected.value);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    selected.value = next;
}

async function bulkKick(): Promise<void> {
    for (const name of selected.value) await act(name, "kick", t("mcserver.players.bulkKickReason", "Removed by an operator.") as string);
    selected.value = new Set();
}
</script>

<template>
    <div class="wl-mcserver-players">
        <VAlert v-if="failure" type="warning" variant="tonal" class="mb-2">{{ failure }}</VAlert>
        <VAlert v-if="blockReason" type="info" variant="tonal" class="mb-2">{{ blockReason }}</VAlert>

        <VTabs v-model="tab">
            <VTab value="online">{{ t("mcserver.players.online", "Online") }}</VTab>
            <VTab value="whitelist">{{ t("mcserver.players.whitelist", "Whitelist") }}</VTab>
            <VTab value="ops">{{ t("mcserver.players.ops", "Operators") }}</VTab>
            <VTab value="bans">{{ t("mcserver.players.bans", "Bans") }}</VTab>
        </VTabs>

        <div class="wl-mcserver-players__toolbar">
            <ConfigSearchField
                v-if="tab === 'online'"
                v-model="query"
                v-model:regex="useRegex"
                v-model:flags="flags"
                :label="t('mcserver.players.search', 'Search players')"
                :sample="online.map((p) => p.name).join(' ')"
                class="wl-mcserver-players__search"
            />
            <VBtn :prepend-icon="mdiRefresh" variant="text" size="small" @click="loadAll">
                {{ t("mcserver.players.refresh", "Refresh") }}
            </VBtn>
            <VBtn
                v-if="tab !== 'online'"
                :prepend-icon="mdiAccountPlus"
                variant="tonal"
                color="primary"
                size="small"
                :disabled="!!blockReason"
                :title="blockReason ?? undefined"
                @click="openAdd"
            >
                {{ t("mcserver.players.add", "Add player") }}
            </VBtn>
            <VBtn
                v-if="tab !== 'online' && selected.size > 0"
                :prepend-icon="mdiDelete"
                variant="tonal"
                size="small"
                :disabled="!!blockReason"
                :title="blockReason ?? undefined"
                @click="bulkRemove(tab as Exclude<ListKind, 'online'>)"
            >
                {{ t("mcserver.players.bulkRemove", { n: selected.size }, "Remove {n}") }}
            </VBtn>
            <VBtn v-if="tab === 'online' && selected.size > 0" :prepend-icon="mdiDelete" variant="tonal" size="small" @click="bulkKick">
                {{ t("mcserver.players.bulkKick", { n: selected.size }, "Kick {n}") }}
            </VBtn>
        </div>

        <VWindow v-model="tab">
            <VWindowItem value="online">
                <VAlert v-if="onlineFailure" type="warning" variant="tonal">{{ onlineFailure }}</VAlert>
                <VTable v-else-if="filteredOnline.length > 0">
                    <thead>
                        <tr>
                            <th></th>
                            <th>{{ t("mcserver.players.name", "Name") }}</th>
                            <th>{{ t("mcserver.players.actions", "Actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="p in filteredOnline" :key="p.name">
                            <td><VCheckbox :model-value="selected.has(p.name)" hide-details density="compact" @update:model-value="toggleSelect(p.name)" /></td>
                            <td>
                                {{ p.name }}
                                <VChip v-if="p.op" size="x-small" color="primary" variant="tonal">op</VChip>
                                <VChip v-if="p.banned" size="x-small" color="error" variant="tonal">banned</VChip>
                            </td>
                            <td>
                                <VMenu>
                                    <template #activator="{ props: menuProps }">
                                        <VBtn v-bind="menuProps" size="small" variant="text">{{ t("mcserver.players.act", "Act...") }}</VBtn>
                                    </template>
                                    <VList>
                                        <VListItem @click="act(p.name, 'kick')">{{ t("mcserver.players.kick", "Kick") }}</VListItem>
                                        <VListItem @click="act(p.name, 'ban')">{{ t("mcserver.players.ban", "Ban") }}</VListItem>
                                        <VListItem @click="act(p.name, 'pardon')">{{ t("mcserver.players.pardon", "Pardon") }}</VListItem>
                                        <VListItem @click="act(p.name, p.op ? 'deop' : 'op')">
                                            {{ p.op ? t("mcserver.players.deop", "Deop") : t("mcserver.players.op", "Op") }}
                                        </VListItem>
                                        <VListItem @click="act(p.name, p.whitelisted ? 'whitelist-remove' : 'whitelist-add')">
                                            {{ p.whitelisted ? t("mcserver.players.unwhitelist", "Remove from whitelist") : t("mcserver.players.whitelistAdd", "Add to whitelist") }}
                                        </VListItem>
                                    </VList>
                                </VMenu>
                            </td>
                        </tr>
                    </tbody>
                </VTable>
                <VAlert v-else type="info" variant="tonal">{{ t("mcserver.players.noneOnline", "Nobody is online right now.") }}</VAlert>
            </VWindowItem>

            <VWindowItem v-for="kind in (['whitelist', 'ops', 'bans'] as const)" :key="kind" :value="kind">
                <VTable v-if="lists[kind].length > 0">
                    <thead>
                        <tr>
                            <th></th>
                            <th>{{ t("mcserver.players.name", "Name") }}</th>
                            <th>{{ t("mcserver.players.actions", "Actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="entry in lists[kind]" :key="entry.name">
                            <td><VCheckbox :model-value="selected.has(entry.name)" hide-details density="compact" @update:model-value="toggleSelect(entry.name)" /></td>
                            <td>{{ entry.name }}</td>
                            <td>
                                <VBtn
                                    :icon="mdiDelete"
                                    variant="text"
                                    size="small"
                                    :disabled="!!blockReason"
                                    :title="blockReason ?? t('mcserver.players.remove', 'Remove')"
                                    :aria-label="t('mcserver.players.removeAria', { name: entry.name }, 'Remove {name}')"
                                    @click="remove(kind, entry.name)"
                                />
                            </td>
                        </tr>
                    </tbody>
                </VTable>
                <VAlert v-else type="info" variant="tonal">
                    {{ t("mcserver.players.empty", "Nobody is on this list.") }}
                </VAlert>
            </VWindowItem>
        </VWindow>

        <VDialog v-model="addDialog" max-width="420" persistent>
            <VCard>
                <VCardTitle>{{ t("mcserver.players.addTitle", "Add player") }}</VCardTitle>
                <VCardText>
                    <VSelect
                        v-if="!addAsCustom"
                        v-model="newName"
                        :items="knownNames"
                        :label="t('mcserver.players.playerNamePick', 'Player name')"
                        :error-messages="newNameError ? [newNameError] : []"
                    />
                    <VTextField
                        v-else
                        v-model="newName"
                        :label="t('mcserver.players.playerName', 'Player name')"
                        :error-messages="newNameError ? [newNameError] : []"
                    />
                    <VSwitch
                        v-model="addAsCustom"
                        :label="t('mcserver.players.enterUnlisted', 'Enter a name not listed')"
                        :disabled="knownNames.length === 0"
                        :hint="knownNames.length === 0 ? t('mcserver.players.noKnownNames', 'No known player names yet - nobody has been online or listed, so typing is the only option.') : undefined"
                        persistent-hint
                        density="compact"
                        @update:model-value="newName = ''"
                    />
                    <VTextField
                        v-if="tab === 'bans'"
                        v-model="newReason"
                        :label="t('mcserver.players.banReason', 'Reason')"
                    />
                </VCardText>
                <VCardActions>
                    <VBtn variant="text" @click="addDialog = false">{{ t("common.cancel", "Cancel") }}</VBtn>
                    <VBtn color="primary" variant="tonal" :disabled="nameValid(newName) !== null" @click="confirmAdd">
                        {{ t("mcserver.players.add", "Add player") }}
                    </VBtn>
                </VCardActions>
            </VCard>
        </VDialog>
    </div>
</template>

<style scoped>
.wl-mcserver-players__toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 12px 0;
    flex-wrap: wrap;
}
.wl-mcserver-players__search {
    flex: 1 1 260px;
}
</style>
