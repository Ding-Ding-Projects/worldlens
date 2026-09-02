<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArchiveOutline, mdiFolderOpenOutline, mdiFileDocumentOutline } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardActions, VCardText, VCardTitle, VDialog, VDivider, VProgressLinear, VSpacer } from "vuetify/components";
import type { ConfigHost } from "../config/configHost.js";
import type { ProjectHost } from "./projectHost.js";
import type { RemoteBridge } from "../remote/remoteBridge.js";
import SshWorldSourcePanel from "../world/SshWorldSourcePanel.vue";

const props = defineProps<{
    configHost: ConfigHost | null;
    projectHost: ProjectHost | null;
    remoteBridge: RemoteBridge | null;
}>();

const emit = defineEmits<{
    close: [];
    imported: [world: string];
}>();

const { t } = useI18n();
const busy = ref(false);
const failure = ref<string | null>(null);
const selectedPath = ref<string | null>(null);
const opener = ref<HTMLElement | null>(null);
const errorAlert = ref<HTMLElement | null>(null);
const sshPanel = ref<InstanceType<typeof SshWorldSourcePanel> | null>(null);
const activeTransfer = computed(() => sshPanel.value?.fetching === true);

onMounted(() => {
    opener.value = document.activeElement instanceof HTMLElement ? document.activeElement : null;
});

async function restoreFocus(): Promise<void> {
    await nextTick();
    opener.value?.focus();
}

watch(failure, async (value) => {
    if (value !== null) {
        await nextTick();
        errorAlert.value?.focus();
    }
});

function folderFromFile(file: string): string | null {
    const slash = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
    return slash <= 0 ? null : file.slice(0, slash);
}

async function validateAndUse(world: string | null): Promise<void> {
    if (world === null || world.trim() === "" || props.projectHost === null || busy.value) return;
    busy.value = true;
    failure.value = null;
    selectedPath.value = world;
    try {
        const answer = await props.projectHost.readProject(world);
        if (!answer.ok) {
            failure.value = t(
                "project.import.invalid",
                { kind: answer.failure.kind },
                "The selected folder does not contain a readable worldlens.project.json ({kind}).",
            );
            return;
        }
        await restoreFocus();
        emit("imported", world);
    } catch (error) {
        failure.value = error instanceof Error ? error.message : String(error);
    } finally {
        busy.value = false;
    }
}

async function pickFolder(): Promise<void> {
    if (props.configHost === null) return;
    const folder = await props.configHost.pickDirectory({
        title: t("project.import.pickFolder", "Choose a world folder containing worldlens.project.json"),
    });
    await validateAndUse(folder);
}

async function pickProjectFile(): Promise<void> {
    if (props.configHost === null) return;
    const file = await props.configHost.pickFile({
        title: t("project.import.pickFile", "Choose worldlens.project.json"),
        extensions: ["json"],
    });
    await validateAndUse(file === null ? null : folderFromFile(file));
}

function importedFromSsh(world: string): void {
    void validateAndUse(world);
}

function requestClose(): void {
    if (activeTransfer.value) return;
    void restoreFocus();
    emit("close");
}

async function cancelTransferAndClose(): Promise<void> {
    if (!activeTransfer.value) {
        void restoreFocus();
        emit("close");
        return;
    }
    try {
        const confirmed = (await sshPanel.value?.cancelFetch()) === true;
        if (confirmed && !activeTransfer.value) {
            await restoreFocus();
            emit("close");
        }
    } catch (error) {
        failure.value = error instanceof Error ? error.message : String(error);
    }
}

defineExpose({ pickFolder, pickProjectFile, validateAndUse, cancelTransferAndClose, busy, failure, activeTransfer });
</script>

<template>
    <v-dialog :model-value="true" :persistent="activeTransfer" max-width="760" scrollable @update:model-value="requestClose">
        <v-card class="mb-project-import" data-project-import>
            <v-card-title>{{ t("project.import.title", "Import a rendering project") }}</v-card-title>
            <v-card-text>
                <p class="mb-project-import__lede">
                    {{ t("project.import.lede", "Choose a local project, fetch a verified project from an SSH machine, or review the archive route. The source is read-only; the imported local folder is inspected by the same project schema and history path as every other project.") }}
                </p>
                <v-alert v-if="failure" ref="errorAlert" tabindex="-1" type="error" variant="tonal" density="compact" role="alert">
                    {{ failure }}
                </v-alert>
                <v-progress-linear v-if="busy" indeterminate color="primary" class="my-3" />

                <section class="mb-project-import__section" aria-labelledby="project-import-local">
                    <h3 id="project-import-local">{{ t("project.import.localTitle", "Local world or project file") }}</h3>
                    <p>{{ t("project.import.localHint", "Browse for a world folder or the exact worldlens.project.json file. The file is parsed and validated before it opens.") }}</p>
                    <div class="mb-project-import__actions">
                        <v-btn :prepend-icon="mdiFolderOpenOutline" :disabled="busy || configHost === null" variant="tonal" data-test="import-folder" @click="pickFolder">
                            {{ t("project.import.folder", "Browse world folder") }}
                        </v-btn>
                        <v-btn :prepend-icon="mdiFileDocumentOutline" :disabled="busy || configHost === null" variant="tonal" data-test="import-file" @click="pickProjectFile">
                            {{ t("project.import.file", "Browse project file") }}
                        </v-btn>
                    </div>
                    <p v-if="configHost === null || projectHost === null" class="mb-project-import__reason">
                        {{ t("project.import.localUnavailable", "Local import needs the desktop file picker and the verified project host.") }}
                    </p>
                </section>

                <section class="mb-project-import__section" aria-labelledby="project-import-ssh">
                    <h3 id="project-import-ssh">{{ t("project.import.sshTitle", "SSH remote machine") }}</h3>
                    <SshWorldSourcePanel ref="sshPanel" :remote-bridge="remoteBridge" @use="importedFromSsh" />
                </section>

                <section class="mb-project-import__section" aria-labelledby="project-import-archive">
                    <h3 id="project-import-archive">{{ t("project.import.archiveTitle", "Archive or manifest") }}</h3>
                    <v-btn :prepend-icon="mdiArchiveOutline" disabled variant="outlined" data-test="import-archive">
                        {{ t("project.import.archive", "Import archive or manifest") }}
                    </v-btn>
                    <p class="mb-project-import__reason">
                        {{ t("project.import.archiveUnavailable", "Safe archive extraction and manifest verification are not exposed by this build yet. Use a world folder, a project file, or the SSH fetch above; those routes validate before import.") }}
                    </p>
                </section>
            </v-card-text>
            <v-divider />
            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" :disabled="busy && !activeTransfer" @click="cancelTransferAndClose">
                    {{ activeTransfer ? t("project.import.cancelTransfer", "Cancel transfer and close") : t("project.import.cancel", "Cancel") }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style>
.mb-project-import__lede,
.mb-project-import__section p {
    line-height: 1.5;
    text-wrap: pretty;
}

.mb-project-import__section {
    margin-block-start: 20px;
}

.mb-project-import__section h3 {
    margin-block-end: 6px;
    font-size: 1rem;
}

.mb-project-import__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mb-project-import__reason {
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: 0.8125rem;
}
</style>
