<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VSelect } from "vuetify/components";
import type { RuntimeBridge, WslReport } from "./remoteBridge.js";
const props = defineProps<{ runtime: RuntimeBridge | null }>();
const emit = defineEmits<{ report: [value: WslReport]; selected: [value: string | null] }>();
const { t } = useI18n();
const report = ref<WslReport | null>(null);
const selected = ref<string | null>(null);
const checking = ref(false);
const error = ref("");
let generation = 0;
const key = "worldlens.render.wslDistribution";
async function check(): Promise<void> {
    const current = ++generation;
    checking.value = true;
    error.value = "";
    try {
        if (!props.runtime?.wslRuntime)
            throw new Error(t("remote.wsl.unsupported", "This build cannot check WSL."));
        const answer = await props.runtime.wslRuntime(selected.value ?? undefined);
        if (current !== generation) return;
        report.value = answer;
        if (selected.value === null) selected.value = answer.selected;
        emit("selected", selected.value);
        emit("report", answer);
    } catch (cause) {
        if (current === generation)
            error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
        if (current === generation) checking.value = false;
    }
}
function choose(value: unknown): void {
    if (typeof value !== "string") return;
    selected.value = value;
    report.value = null;
    emit("selected", value);
    try {
        localStorage.setItem(key, value);
    } catch {
        /* Storage is optional. */
    }
    void check();
}
onMounted(() => {
    try {
        selected.value = localStorage.getItem(key);
    } catch {
        /* Read-only browser storage. */
    }
    emit("selected", selected.value);
    void check();
});
</script>
<template>
    <section
        class="mb-run-location__section"
        :aria-label="t('remote.wsl.title', 'In WSL on this computer')"
    >
        <v-select
            :model-value="selected"
            :items="report?.distributions ?? []"
            :label="t('remote.wsl.distribution', 'Linux distribution')"
            :disabled="checking"
            hide-details="auto"
            @update:model-value="choose"
        />
        <v-btn variant="text" :loading="checking" @click="check">{{
            t("remote.wsl.check", "Check WSL and Java")
        }}</v-btn>
        <p role="status">{{ report?.message }}</p>
        <v-alert v-if="error" type="error" variant="tonal">{{ error }}</v-alert>
        <p>
            {{
                t(
                    "remote.wsl.requirement",
                    "Uses an existing distribution. A missing Java 25 runtime is downloaded, verified and installed only in the Worldlens user directory when rendering starts. No system Java, PATH or distribution settings are changed.",
                )
            }}
        </p>
    </section>
</template>
