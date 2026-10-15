<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VProgressLinear, VSlider, VTextField } from "vuetify/components";
import type { SshProcessPreflightReport } from "@worldlens/shared";
import { useServerStore } from "./useServers.js";

const props = defineProps<{ hostId: string; minecraftVersion: string }>();
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
                <p>{{ t("mcserver.sshReadiness.observedAt", { at: report.checkedAt }) }}</p>
                <ol>
                    <li v-for="item in report.checks" :key="item.stage">
                        <strong>{{ t(`mcserver.sshReadiness.stage.${item.stage}`) }}</strong
                        >: {{ t(`mcserver.sshReadiness.state.${item.state}`) }}.
                        {{ t(`mcserver.sshReadiness.reason.${item.code}`) }}
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
