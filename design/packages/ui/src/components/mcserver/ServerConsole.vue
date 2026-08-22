<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiRefresh } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { useServerStore } from "./useServers.js";
import type { ConsoleLine } from "./serverStore.js";

/**
 * The read-only log tail for one server, polled through the bridge's `logTail` call.
 *
 * The bridge has no console-send call today, so this is the honest surface a server's
 * `console` capability of `"none"` describes: a live-ish view of what the server is
 * printing, searchable like every other console transcript in this app, with no command
 * box pretending to accept input it cannot deliver.
 */
const props = withDefaults(defineProps<{ serverId: string; pollMs?: number }>(), { pollMs: 4000 });

const { t } = useI18n();
const store = useServerStore();

const lines = ref<readonly ConsoleLine[]>([]);
const failure = ref<string | null>(null);
const query = ref("");
const useRegex = ref(false);
const flags = ref("i");
let timer: ReturnType<typeof setInterval> | null = null;

async function refresh(): Promise<void> {
    const result = await store.logTail(props.serverId, 500);
    if (result.ok) {
        lines.value = result.value ?? [];
        failure.value = null;
    } else {
        failure.value = result.failure?.message ?? t("mcserver.console.readFailed", "The log could not be read.");
    }
}

const filteredLines = computed(() => {
    if (query.value.trim() === "") return lines.value;
    if (!useRegex.value) {
        const needle = query.value.toLowerCase();
        return lines.value.filter((line) => line.text.toLowerCase().includes(needle));
    }
    try {
        const pattern = new RegExp(query.value, flags.value);
        return lines.value.filter((line) => pattern.test(line.text));
    } catch {
        return [];
    }
});

const sampleText = computed(() => lines.value.map((l) => l.text).join("\n"));

onMounted(() => {
    void refresh();
    timer = setInterval(() => void refresh(), props.pollMs);
});
onBeforeUnmount(() => {
    if (timer !== null) clearInterval(timer);
});
watch(
    () => props.serverId,
    () => void refresh(),
);
</script>

<template>
    <div class="wl-mcserver-console">
        <div class="wl-mcserver-console__toolbar">
            <ConfigSearchField
                v-model="query"
                v-model:regex="useRegex"
                v-model:flags="flags"
                :label="t('mcserver.console.search', 'Search log')"
                :sample="sampleText"
                class="wl-mcserver-console__search"
            />
            <VBtn :prepend-icon="mdiRefresh" variant="text" @click="refresh">
                {{ t("mcserver.console.refresh", "Refresh") }}
            </VBtn>
        </div>
        <VAlert v-if="failure" type="warning" variant="tonal" class="mb-2">{{ failure }}</VAlert>
        <VCard variant="outlined">
            <VCardText class="wl-mcserver-console__log" role="log" aria-live="polite">
                <div v-if="filteredLines.length === 0" class="text-medium-emphasis">
                    {{ t("mcserver.console.empty", "No log lines yet.") }}
                </div>
                <div v-for="(line, index) in filteredLines" :key="index" class="wl-mcserver-console__line">
                    <span class="wl-mcserver-console__stream">[{{ line.stream }}]</span> {{ line.text }}
                </div>
            </VCardText>
        </VCard>
    </div>
</template>

<style scoped>
.wl-mcserver-console__toolbar {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 8px;
    flex-wrap: wrap;
}
.wl-mcserver-console__search {
    flex: 1 1 320px;
}
.wl-mcserver-console__log {
    font-family: monospace;
    font-size: 12px;
    max-height: 420px;
    overflow-y: auto;
    white-space: pre-wrap;
}
.wl-mcserver-console__stream {
    opacity: 0.6;
}
</style>
