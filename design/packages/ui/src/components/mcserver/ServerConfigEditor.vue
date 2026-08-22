<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentSave } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VSelect, VSwitch, VTextField } from "vuetify/components";
import { useServerStore } from "./useServers.js";
import { writeBlockReason } from "./serverModel.js";

/**
 * `server.properties`, rendered as real typed controls rather than a raw text box.
 *
 * A `server.properties` file is a flat list of `key=value` lines, and the game's own set of
 * keys is finite and well known. Booleans get a switch, the small set of enumerated keys get
 * a select, everything else - `motd`, `level-name` - is genuine prose and stays a text field.
 * Nothing here is a free-text box standing in for a picker that could exist.
 */
const props = defineProps<{ serverId: string }>();

const { t } = useI18n();
const store = useServerStore();

const PATH = "server.properties";
const BOOLEAN_KEYS = new Set([
    "online-mode",
    "pvp",
    "hardcore",
    "allow-flight",
    "allow-nether",
    "enable-command-block",
    "spawn-monsters",
    "spawn-animals",
    "generate-structures",
    "white-list",
    "enable-rcon",
]);
const DIFFICULTY = ["peaceful", "easy", "normal", "hard"];
const GAMEMODE = ["survival", "creative", "adventure", "spectator"];

const raw = ref<Record<string, string>>({});
const originalHash = ref<string | null>(null);
const loading = ref(true);
const failure = ref<string | null>(null);
const saved = ref(false);

function parseProperties(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index === -1) continue;
        out[trimmed.slice(0, index)] = trimmed.slice(index + 1);
    }
    return out;
}

function serializeProperties(values: Record<string, string>): string {
    return Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
}

async function load(): Promise<void> {
    loading.value = true;
    failure.value = null;
    const result = await store.files.read(props.serverId, PATH);
    if (result.ok && result.value) {
        raw.value = parseProperties(new TextDecoder().decode(result.value.bytes));
        originalHash.value = result.value.hash;
    } else {
        failure.value = result.failure?.message ?? t("mcserver.config.readFailed", "server.properties could not be read.");
    }
    loading.value = false;
}

onMounted(load);
watch(() => props.serverId, load);

const capabilities = computed(() => store.capabilitiesFor(props.serverId));
const server = computed(() => store.get(props.serverId));
const blockReason = computed(() => (server.value ? writeBlockReason(server.value, capabilities.value) : null));

function boolValue(key: string): boolean {
    return raw.value[key] === "true";
}
function setBool(key: string, value: boolean): void {
    raw.value = { ...raw.value, [key]: String(value) };
}

async function save(): Promise<void> {
    saved.value = false;
    const result = await store.files.write(props.serverId, PATH, {
        text: serializeProperties(raw.value),
        expectedHash: originalHash.value,
    });
    if (result.ok && result.value) {
        originalHash.value = result.value.hash;
        saved.value = true;
    } else {
        failure.value = result.failure?.message ?? t("mcserver.config.saveFailed", "Could not save.");
    }
}
</script>

<template>
    <div class="wl-mcserver-config">
        <VAlert v-if="blockReason" type="info" variant="tonal" class="mb-3">{{ blockReason }}</VAlert>
        <VAlert v-if="failure" type="warning" variant="tonal" class="mb-3">{{ failure }}</VAlert>
        <VAlert v-if="saved" type="success" variant="tonal" class="mb-3">
            {{ t("mcserver.config.saved", "Saved.") }}
        </VAlert>

        <VCard v-if="!loading" variant="outlined">
            <VCardText class="wl-mcserver-config__grid">
                <VTextField
                    v-model="raw['motd']"
                    :label="t('mcserver.config.motd', 'Message of the day')"
                    :disabled="!!blockReason"
                />
                <VTextField
                    v-model="raw['level-name']"
                    :label="t('mcserver.config.levelName', 'World folder name')"
                    :disabled="!!blockReason"
                />
                <VSelect
                    v-model="raw['difficulty']"
                    :items="DIFFICULTY"
                    :label="t('mcserver.config.difficulty', 'Difficulty')"
                    :disabled="!!blockReason"
                />
                <VSelect
                    v-model="raw['gamemode']"
                    :items="GAMEMODE"
                    :label="t('mcserver.config.gamemode', 'Default game mode')"
                    :disabled="!!blockReason"
                />
                <VTextField
                    v-model.number="raw['max-players']"
                    type="number"
                    :min="1"
                    :max="2000"
                    :label="t('mcserver.config.maxPlayers', 'Max players')"
                    :disabled="!!blockReason"
                />
                <VTextField
                    v-model.number="raw['server-port']"
                    type="number"
                    :min="1"
                    :max="65535"
                    :label="t('mcserver.config.serverPort', 'Server port')"
                    :disabled="!!blockReason"
                />
                <VSwitch
                    v-for="key in BOOLEAN_KEYS"
                    :key="key"
                    :model-value="boolValue(key)"
                    :label="key"
                    :disabled="!!blockReason"
                    @update:model-value="(v) => setBool(key, v === true)"
                />
            </VCardText>
        </VCard>

        <VBtn
            class="mt-3"
            color="primary"
            variant="tonal"
            :prepend-icon="mdiContentSave"
            :disabled="!!blockReason || loading"
            :title="blockReason ?? undefined"
            @click="save"
        >
            {{ t("mcserver.config.save", "Save") }}
        </VBtn>
    </div>
</template>

<style scoped>
.wl-mcserver-config__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
}
</style>
