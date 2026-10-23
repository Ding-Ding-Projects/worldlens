<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VProgressLinear, VSlider, VTextField } from "vuetify/components";
import type { SshProcessPreflightReport } from "@worldlens/shared";
import { useServerStore } from "./useServers.js";

const props = defineProps<{ hostId: string; minecraftVersion: string }>();

/*
 * The copy keys the report's codes map to, written out so each key has a visible call site:
 * the copy catalogue guard (appCopy.test.ts) reads literal keys, and a key built only inside a
 * template literal looks to it like a translation nobody uses. The fallback template literal
 * below each lookup keeps an unexpected code readable rather than blank.
 */
const STAGE_KEYS: Readonly<Record<string, string>> = {
    ssh: "mcserver.sshReadiness.stage.ssh",
    platform: "mcserver.sshReadiness.stage.platform",
    supervisor: "mcserver.sshReadiness.stage.supervisor",
    directory: "mcserver.sshReadiness.stage.directory",
    java: "mcserver.sshReadiness.stage.java",
    memory: "mcserver.sshReadiness.stage.memory",
    disk: "mcserver.sshReadiness.stage.disk",
    port: "mcserver.sshReadiness.stage.port",
};
const STATE_KEYS: Readonly<Record<string, string>> = {
    passed: "mcserver.sshReadiness.state.passed",
    blocked: "mcserver.sshReadiness.state.blocked",
    unknown: "mcserver.sshReadiness.state.unknown",
};
const REASON_KEYS: Readonly<Record<string, string>> = {
    ready: "mcserver.sshReadiness.reason.ready",
    "ssh-missing": "mcserver.sshReadiness.reason.sshMissing",
    "host-key-changed": "mcserver.sshReadiness.reason.hostKeyChanged",
    "host-key-unknown": "mcserver.sshReadiness.reason.hostKeyUnknown",
    "auth-refused": "mcserver.sshReadiness.reason.authRefused",
    unreachable: "mcserver.sshReadiness.reason.unreachable",
    "remote-failed": "mcserver.sshReadiness.reason.remoteFailed",
    "invalid-response": "mcserver.sshReadiness.reason.invalidResponse",
    "linux-required": "mcserver.sshReadiness.reason.linuxRequired",
    "systemd-254-required": "mcserver.sshReadiness.reason.systemd254Required",
    "user-manager-unavailable": "mcserver.sshReadiness.reason.userManagerUnavailable",
    "lingering-required": "mcserver.sshReadiness.reason.lingeringRequired",
    "home-unavailable": "mcserver.sshReadiness.reason.homeUnavailable",
    "unsafe-directory": "mcserver.sshReadiness.reason.unsafeDirectory",
    "existing-canonical-directory-required":
        "mcserver.sshReadiness.reason.existingCanonicalDirectoryRequired",
    "writable-directory-required": "mcserver.sshReadiness.reason.writableDirectoryRequired",
    "java-unavailable": "mcserver.sshReadiness.reason.javaUnavailable",
    "java-unrecognized": "mcserver.sshReadiness.reason.javaUnrecognized",
    "java-too-old": "mcserver.sshReadiness.reason.javaTooOld",
    "memory-unavailable": "mcserver.sshReadiness.reason.memoryUnavailable",
    "insufficient-memory": "mcserver.sshReadiness.reason.insufficientMemory",
    "disk-unavailable": "mcserver.sshReadiness.reason.diskUnavailable",
    "insufficient-disk": "mcserver.sshReadiness.reason.insufficientDisk",
    "port-unavailable": "mcserver.sshReadiness.reason.portUnavailable",
    "port-occupied": "mcserver.sshReadiness.reason.portOccupied",
    cancelled: "mcserver.sshReadiness.reason.cancelled",
    timeout: "mcserver.sshReadiness.reason.timeout",
    "observation-failed": "mcserver.sshReadiness.reason.observationFailed",
};
const { t } = useI18n();
const store = useServerStore();
const memoryMb = ref(2048);
const port = ref(25565);
const busy = ref(false);
const report = ref<SshProcessPreflightReport | null>(null);
const failed = ref(false);
let generation = 0;
const valid = computed(
    () =>
        props.hostId !== "" &&
        props.minecraftVersion !== "" &&
        Number.isSafeInteger(Number(memoryMb.value)) &&
        Number(memoryMb.value) >= 512 &&
        Number(memoryMb.value) <= 1_048_576 &&
        Number.isSafeInteger(Number(port.value)) &&
        Number(port.value) >= 1024 &&
        Number(port.value) <= 65535,
);
watch(
    () => [props.hostId, props.minecraftVersion, memoryMb.value, port.value],
    () => {
        generation++;
        report.value = null;
        failed.value = false;
    },
);
onUnmounted(() => {
    generation++;
});

async function check(): Promise<void> {
    if (busy.value || !valid.value || !store.hasSshProcessPreflight) return;
    const ownGeneration = ++generation;
    busy.value = true;
    failed.value = false;
    report.value = null;
    try {
        const answer = await store.sshProcessPreflight({
            hostId: props.hostId,
            minecraftVersion: props.minecraftVersion,
            memoryMb: Number(memoryMb.value),
            port: Number(port.value),
        });
        if (generation !== ownGeneration) return;
        if (answer.ok && answer.value !== undefined) report.value = answer.value;
        else failed.value = true;
    } catch {
        if (generation === ownGeneration) failed.value = true;
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <section
        class="wl-ssh-readiness"
        :aria-label="t('mcserver.sshReadiness.title')"
        data-test="ssh-process-readiness"
    >
        <h3>{{ t("mcserver.sshReadiness.title") }}</h3>
        <p>{{ t("mcserver.sshReadiness.explanation") }}</p>
        <VAlert type="info" variant="tonal" data-test="ssh-process-install-unavailable">
            {{ t("mcserver.sshReadiness.installUnavailable") }}
        </VAlert>
        <VSlider
            v-model="memoryMb"
            :min="512"
            :max="16384"
            :step="512"
            :disabled="busy"
            :label="t('mcserver.sshReadiness.memory')"
            thumb-label
        />
        <VTextField
            v-model="memoryMb"
            type="number"
            :min="512"
            :max="1048576"
            :step="512"
            :disabled="busy"
            :label="t('mcserver.sshReadiness.memory')"
            suffix="MB"
            data-test="ssh-readiness-memory"
        />
        <VTextField
            v-model="port"
            type="number"
            :min="1024"
            :max="65535"
            :step="1"
            :disabled="busy"
            :label="t('mcserver.sshReadiness.port')"
            data-test="ssh-readiness-port"
        />
        <p v-if="!valid">{{ t("mcserver.sshReadiness.chooseInputs") }}</p>
        <p v-if="!store.hasSshProcessPreflight">{{ t("mcserver.sshReadiness.unavailable") }}</p>
        <VBtn
            :disabled="busy || !valid || !store.hasSshProcessPreflight"
            :loading="busy"
            data-test="ssh-readiness-check"
            @click="check"
            >{{ t("mcserver.sshReadiness.check") }}</VBtn
        >
        <div role="status" aria-live="polite" :aria-busy="busy">
            <VProgressLinear
                v-if="busy"
                indeterminate
                :aria-label="t('mcserver.sshReadiness.checking')"
            />
            <p v-if="busy">{{ t("mcserver.sshReadiness.checking") }}</p>
            <VAlert v-if="failed" type="warning" variant="tonal" data-test="ssh-readiness-failed">
                {{ t("mcserver.sshReadiness.failed") }}
            </VAlert>
            <div v-if="report" data-test="ssh-readiness-report">
                <p>
                    {{
                        t(
                            report.ready
                                ? "mcserver.sshReadiness.observedReady"
                                : "mcserver.sshReadiness.notReady",
                        )
                    }}
                </p>
                <p>{{ t("mcserver.sshReadiness.observedAt", { at: report.checkedAt }, "Observed at {at}") }}</p>
                <ol>
                    <li v-for="item in report.checks" :key="item.stage">
                        <strong>{{
                            t(STAGE_KEYS[item.stage] ?? `mcserver.sshReadiness.stage.${item.stage}`)
                        }}</strong
                        >: {{ t(STATE_KEYS[item.state] ?? `mcserver.sshReadiness.state.${item.state}`) }}.
                        {{ t(REASON_KEYS[item.code] ?? `mcserver.sshReadiness.reason.${item.code}`) }}
                    </li>
                </ol>
                <dl>
                    <template v-if="report.serverParent !== null"
                        ><dt>{{ t("mcserver.sshReadiness.directory") }}</dt>
                        <dd>{{ report.serverParent }}</dd></template
                    >
                    <template v-if="report.javaFeature !== null"
                        ><dt>Java</dt>
                        <dd>{{ report.javaFeature }}</dd></template
                    >
                    <template v-if="report.availableMemoryMb !== null"
                        ><dt>{{ t("mcserver.sshReadiness.availableMemory") }}</dt>
                        <dd>{{ report.availableMemoryMb }} MB</dd></template
                    >
                    <template v-if="report.freeBytes !== null"
                        ><dt>{{ t("mcserver.sshReadiness.freeBytes") }}</dt>
                        <dd>{{ report.freeBytes }}</dd></template
                    >
                </dl>
                <p>{{ t("mcserver.sshReadiness.observationOnly") }}</p>
            </div>
        </div>
    </section>
</template>

<style scoped>
.wl-ssh-readiness {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
}
.wl-ssh-readiness dd {
    margin-inline-start: 1rem;
    overflow-wrap: anywhere;
}
.wl-ssh-readiness li {
    margin-block: 0.5rem;
    overflow-wrap: anywhere;
}
</style>
