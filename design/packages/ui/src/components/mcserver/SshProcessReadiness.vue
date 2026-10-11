<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VChip, VSlider, VTextField } from "vuetify/components";
import { useServerStore } from "./useServers.js";
import type { SshReadinessRequest, SshReadinessResult } from "./serverStore.js";

const props = defineProps<{ hostId: string; parentDirectory: string; flavour: string; version: string }>();
const { t } = useI18n();
const store = useServerStore();
const javaPath = ref("/usr/bin/java");
const memoryMb = ref(2048);
const port = ref(25565);
const busy = ref(false);
const result = ref<SshReadinessResult | null>(null);
const failed = ref(false);
let generation = 0;
let disposed = false;
const request = computed<SshReadinessRequest>(() => ({ hostId: props.hostId,
    parentDirectory: props.parentDirectory, javaPath: javaPath.value, memoryMb: memoryMb.value,
    port: port.value, flavour: props.flavour, version: props.version }));
const signature = computed(() => JSON.stringify(request.value));
const valid = computed(() => props.hostId !== "" && props.parentDirectory.startsWith("/") &&
    javaPath.value.startsWith("/") && Number.isInteger(memoryMb.value) && memoryMb.value >= 128 &&
    memoryMb.value <= 1_048_576 && Number.isInteger(port.value) && port.value > 0 && port.value <= 65535);
watch(signature, () => { generation += 1; result.value = null; failed.value = false; }, { flush: "sync" });
onUnmounted(() => { disposed = true; generation += 1; });
async function check(): Promise<void> {
    if (busy.value || !valid.value || !store.hasSshReadiness) return;
    const own = ++generation;
    const selected = { ...request.value };
    busy.value = true; failed.value = false; result.value = null;
    try {
        const answer = await store.sshProcessPreflight(selected);
        if (disposed || own !== generation) return;
        if (answer.ok && answer.value && Object.entries(selected).every(([key, value]) =>
            answer.value!.request[key as keyof SshReadinessRequest] === value)) result.value = answer.value;
        else failed.value = true;
    } catch { if (!disposed && own === generation) failed.value = true; }
    finally { if (!disposed) busy.value = false; }
}
const labels: Record<string, string> = {
    platform: "Linux host", systemd: "systemd 254 or newer", "user-manager": "User service manager",
    linger: "User lingering", directory: "Existing writable parent", java: "Catalogue Java feature",
    memory: "Available memory (MiB)", disk: "Free storage (bytes)", port: "TCP listening port",
};
const reasons: Record<string, string> = {
    linux: "Linux was observed.", "linux-required": "This route requires Linux.",
    "systemd-254-required": "systemd 254 or newer is required.",
    "user-manager-running": "The user service manager must answer and report version 254 or newer.",
    "linger-required": "Lingering must already be enabled by the host administrator.",
    "existing-canonical-writable-parent": "The saved parent must exist, resolve to the same canonical path and allow writing and directory search.",
    "catalogue-java-feature-required": "Java must match the selected catalogue feature. Unknown requirements remain unverified.",
    "available-memory-plus-512-mib-reserve": "Available memory must cover this allocation plus a 512 MiB reserve.",
    "free-bytes-observed-not-size-estimate": "This is observed free space, not an estimate of future world storage.",
    "tcp-listener-snapshot": "No TCP listener may currently occupy the port. This check does not reserve it.",
    "not-observed": "This check has not produced a verified observation.",
};
const rows = computed(() => Object.keys(labels).map((id) => result.value?.checks.find((row) => row.id === id) ??
    { id, state: "unknown" as const, reason: "not-observed" }));
</script>

<template>
    <section class="ssh-readiness" data-test="ssh-process-readiness">
        <h3>{{ t("mcserver.readiness.title", "Remote process readiness") }}</h3>
        <VAlert type="info" variant="tonal">
            {{ t("mcserver.readiness.scope", "Inspect the selected host without creating folders, changing host settings or installing a server. Remote process installation is not available yet.") }}
        </VAlert>
        <VTextField :model-value="parentDirectory" readonly :label="t('mcserver.readiness.parent', 'Saved host parent folder')" />
        <VTextField v-model="javaPath" data-test="ssh-java-path" :label="t('mcserver.readiness.javaPath', 'Remote Java executable')" />
        <VSlider v-model="memoryMb" :min="128" :max="16384" :step="128" thumb-label
            :label="t('mcserver.readiness.memory', 'Server memory (MiB)')" />
        <div class="ssh-readiness__numbers">
            <VTextField v-model.number="memoryMb" type="number" min="128" max="1048576" step="128"
                data-test="ssh-memory" :label="t('mcserver.readiness.memory', 'Server memory (MiB)')" />
            <VTextField v-model.number="port" type="number" min="1" max="65535" data-test="ssh-port"
                :label="t('mcserver.readiness.port', 'Server TCP port')" />
        </div>
        <VBtn data-test="ssh-readiness-check" :loading="busy" :disabled="busy || !valid || !store.hasSshReadiness" @click="check">
            {{ t("mcserver.readiness.check", "Check host readiness") }}
        </VBtn>
        <p v-if="!store.hasSshReadiness">{{ t("mcserver.readiness.unavailable", "This build cannot inspect remote process readiness.") }}</p>
        <p v-else-if="!valid">{{ t("mcserver.readiness.invalid", "Select a saved host with an absolute parent folder, an absolute Java path, valid memory and a TCP port from 1 to 65535.") }}</p>
        <VAlert v-if="failed" type="warning" variant="tonal" role="status">
            {{ t("mcserver.readiness.failed", "The selected host could not be inspected. Check the saved profile, trusted host identity and connection, then retry.") }}
        </VAlert>
        <div aria-live="polite" aria-atomic="false" class="ssh-readiness__results">
            <p v-if="result">{{ t("mcserver.readiness.javaRequirement", "Recorded Java feature") }}: {{ result.requiredJavaFeature ?? t("mcserver.readiness.unknown", "Unknown") }}</p>
            <dl>
                <div v-for="row in rows" :key="row.id" class="ssh-readiness__row" :data-check="row.id">
                    <dt>{{ t(`mcserver.readiness.label.${row.id}`, labels[row.id]!) }}</dt>
                    <dd>
                        <VChip size="small" :color="row.state === 'ready' ? 'success' : row.state === 'blocked' ? 'warning' : undefined">
                            {{ t(`mcserver.readiness.${row.state}`, row.state === 'ready' ? 'Observed ready' : row.state === 'blocked' ? 'Needs attention' : 'Unknown') }}
                        </VChip>
                        <span v-if="'observed' in row">{{ row.observed }}</span>
                        <p>{{ t(`mcserver.readiness.reason.${row.reason}`, reasons[row.reason] ?? reasons['not-observed']!) }}</p>
                    </dd>
                </div>
            </dl>
        </div>
    </section>
</template>

<style scoped>
.ssh-readiness { display: grid; gap: 16px; min-width: 0; }
.ssh-readiness__numbers { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 16px; }
.ssh-readiness__row { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(0, 2fr); gap: 16px; padding-block: 12px; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .16); }
.ssh-readiness dt { font-weight: 500; }
.ssh-readiness dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.ssh-readiness dd > span { margin-inline-end: 8px; }
.ssh-readiness dd p { margin-block: 8px 0; }
@media (max-width: 600px) { .ssh-readiness__row { grid-template-columns: minmax(0, 1fr); gap: 8px; } }
</style>
