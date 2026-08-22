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
    VDialog,
    VTab,
    VTabs,
    VTable,
    VTextField,
    VWindow,
    VWindowItem,
} from "vuetify/components";
import { useServerStore } from "./useServers.js";
import { writeBlockReason } from "./serverModel.js";

/**
 * Ops, the whitelist and bans, as three record tables rather than three JSON files nobody
 * is asked to hand-edit. Each of Minecraft's own list files (`ops.json`, `whitelist.json`,
 * `banned-players.json`) is a flat JSON array of `{ name/uuid, ... }` records; this reads,
 * renders and rewrites that array through the same file bridge every other write here uses.
 */
const props = defineProps<{ serverId: string }>();

const { t } = useI18n();
const store = useServerStore();

type ListKind = "ops" | "whitelist" | "bans";
const FILES: Record<ListKind, string> = {
    ops: "ops.json",
    whitelist: "whitelist.json",
    bans: "banned-players.json",
};

interface Entry {
    readonly name: string;
    readonly raw: Record<string, unknown>;
}

const tab = ref<ListKind>("whitelist");
const lists = reactive<Record<ListKind, Entry[]>>({ ops: [], whitelist: [], bans: [] });
const hashes = reactive<Record<ListKind, string | null>>({ ops: null, whitelist: null, bans: null });
const failure = ref<string | null>(null);
const addDialog = ref(false);
const newName = ref("");
const newReason = ref("");

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

async function loadList(kind: ListKind): Promise<void> {
    const result = await store.files.read(props.serverId, FILES[kind]);
    if (result.ok && result.value) {
        lists[kind] = parseList(new TextDecoder().decode(result.value.bytes));
        hashes[kind] = result.value.hash;
        failure.value = null;
    } else if (result.ok === false && result.failure?.code === "not-found") {
        // No file yet means an empty list, not a failure - Minecraft only writes these once
        // something is added.
        lists[kind] = [];
        hashes[kind] = null;
    } else {
        failure.value = result.failure?.message ?? t("mcserver.players.readFailed", "That list could not be read.");
    }
}

async function loadAll(): Promise<void> {
    await Promise.all((Object.keys(FILES) as ListKind[]).map(loadList));
}

onMounted(loadAll);
watch(() => props.serverId, loadAll);

const capabilities = computed(() => store.capabilitiesFor(props.serverId));
const server = computed(() => store.get(props.serverId));
const blockReason = computed(() => (server.value ? writeBlockReason(server.value, capabilities.value) : null));

async function persist(kind: ListKind): Promise<void> {
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

function openAdd(): void {
    newName.value = "";
    newReason.value = "";
    addDialog.value = true;
}

async function confirmAdd(): Promise<void> {
    if (newName.value.trim() === "") return;
    const raw: Record<string, unknown> =
        tab.value === "bans"
            ? { name: newName.value.trim(), reason: newReason.value.trim() || "Banned by an operator." }
            : tab.value === "ops"
              ? { name: newName.value.trim(), level: 4, bypassesPlayerLimit: false }
              : { name: newName.value.trim() };
    lists[tab.value] = [...lists[tab.value], { name: newName.value.trim(), raw }];
    await persist(tab.value);
    addDialog.value = false;
}

async function remove(kind: ListKind, name: string): Promise<void> {
    lists[kind] = lists[kind].filter((entry) => entry.name !== name);
    await persist(kind);
}
</script>

<template>
    <div class="wl-mcserver-players">
        <VAlert v-if="failure" type="warning" variant="tonal" class="mb-2">{{ failure }}</VAlert>
        <VAlert v-if="blockReason" type="info" variant="tonal" class="mb-2">{{ blockReason }}</VAlert>

        <VTabs v-model="tab">
            <VTab value="whitelist">{{ t("mcserver.players.whitelist", "Whitelist") }}</VTab>
            <VTab value="ops">{{ t("mcserver.players.ops", "Operators") }}</VTab>
            <VTab value="bans">{{ t("mcserver.players.bans", "Bans") }}</VTab>
        </VTabs>

        <div class="wl-mcserver-players__toolbar">
            <VBtn :prepend-icon="mdiRefresh" variant="text" size="small" @click="loadAll">
                {{ t("mcserver.players.refresh", "Refresh") }}
            </VBtn>
            <VBtn
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
        </div>

        <VWindow v-model="tab">
            <VWindowItem v-for="kind in (['whitelist', 'ops', 'bans'] as const)" :key="kind" :value="kind">
                <VTable v-if="lists[kind].length > 0">
                    <thead>
                        <tr>
                            <th>{{ t("mcserver.players.name", "Name") }}</th>
                            <th>{{ t("mcserver.players.actions", "Actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="entry in lists[kind]" :key="entry.name">
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

        <VDialog v-model="addDialog" max-width="420">
            <VCard>
                <VCardTitle>{{ t("mcserver.players.addTitle", "Add player") }}</VCardTitle>
                <VCardText>
                    <VTextField v-model="newName" :label="t('mcserver.players.playerName', 'Player name')" />
                    <VTextField
                        v-if="tab === 'bans'"
                        v-model="newReason"
                        :label="t('mcserver.players.banReason', 'Reason')"
                    />
                </VCardText>
                <VCardActions>
                    <VBtn variant="text" @click="addDialog = false">{{ t("common.cancel", "Cancel") }}</VBtn>
                    <VBtn color="primary" variant="tonal" :disabled="newName.trim() === ''" @click="confirmAdd">
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
    margin: 12px 0;
}
</style>
