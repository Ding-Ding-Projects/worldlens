<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiChevronDown, mdiPlay } from "@mdi/js";
import { VBtn, VBtnGroup, VCard, VCardSubtitle, VCardTitle, VIcon, VMenu } from "vuetify/components";
import MenuSearchList, { type MenuSearchItem } from "../menuSearch/MenuSearchList.vue";
import type { RunLocation } from "../remote/runtimeChoice.js";

export type RenderDestinationId =
    | RunLocation
    | "github-actions"
    | "import-project"
    | "publish-existing";

const props = withDefaults(
    defineProps<{
        location?: RunLocation;
        canRenderLocally?: boolean;
        canRenderInDocker?: boolean;
        canRenderRemotely?: boolean;
        hasRemoteTarget?: boolean;
        remotePreflightPassed?: boolean;
        canOpenCi?: boolean;
        canImportProject?: boolean;
        canPublishExisting?: boolean;
        importReason?: string;
        publishReason?: string;
        rendering?: boolean;
        /** Disables only the primary render action. The chooser remains usable. */
        mainDisabled?: boolean;
        /** Disables the chooser itself, reserved for an active render. */
        disabled?: boolean;
        label?: string;
    }>(),
    {
        location: "local",
        canRenderLocally: false,
        canRenderInDocker: false,
        canRenderRemotely: false,
        hasRemoteTarget: false,
        remotePreflightPassed: false,
        canOpenCi: false,
        canImportProject: false,
        canPublishExisting: false,
        importReason: "Importing a project needs a desktop file picker and a verified project host.",
        publishReason: "No verified finished render is available to publish yet.",
        rendering: false,
        mainDisabled: false,
        disabled: false,
        label: "Render",
    },
);

const emit = defineEmits<{
    render: [];
    choose: [destination: RenderDestinationId];
}>();

const { t } = useI18n();
const open = ref(false);
const arrowButton = ref<HTMLElement | null>(null);
const menuSearch = ref<InstanceType<typeof MenuSearchList> | null>(null);
const isDisabled = computed(() => props.disabled === true || props.rendering === true);
const isMainDisabled = computed(() => props.mainDisabled === true || props.rendering === true);
const isRendering = computed(() => props.rendering === true);

const items = computed<readonly MenuSearchItem[]>(() => [
    {
        id: "local",
        label: t("project.destination.local", "This computer"),
        disabled: !props.canRenderLocally,
        reason: props.canRenderLocally
            ? undefined
            : t("project.destination.localReason", "The desktop render bridge is not available."),
    },
    {
        id: "docker",
        label: t("project.destination.docker", "Local Docker"),
        disabled: !props.canRenderInDocker,
        reason: props.canRenderInDocker
            ? undefined
            : t(
                  "project.destination.dockerReason",
                  "Docker is not a render channel in this build or has not passed its runtime check. It will not fall back to this computer.",
              ),
    },
    {
        id: "remote",
        label: t("project.destination.remote", "SSH remote machine"),
        disabled: !props.canRenderRemotely,
        reason:
            !props.canRenderRemotely
                ? t("project.destination.remoteBridge", "The SSH render bridge is not available.")
            : !props.hasRemoteTarget
                  ? t("project.destination.remoteTarget", "Add and select a remote machine first.")
                  : !props.remotePreflightPassed
                    ? t(
                          "project.destination.remotePreflight",
                          "Run the SSH, host-key, Docker and disk checks before sending a world.",
                      )
                    : undefined,
    },
    {
        id: "github-actions",
        label: t("project.destination.github", "GitHub Actions"),
        disabled: !props.canOpenCi,
        reason: props.canOpenCi
            ? undefined
            : t("project.destination.githubReason", "The full GitHub Actions render wizard is not available here."),
    },
    {
        id: "import-project",
        label: t("project.destination.import", "Import rendering project"),
        disabled: !props.canImportProject,
        reason: props.canImportProject
            ? undefined
            : props.importReason,
    },
    {
        id: "publish-existing",
        label: t("project.destination.publish", "Publish existing render"),
        disabled: !props.canPublishExisting,
        reason: props.canPublishExisting
            ? undefined
            : props.publishReason,
    },
]);

const currentLabel = computed(() => {
    if (props.location === "docker") return t("project.destination.renderDocker", "Render in local Docker");
    if (props.location === "remote") return t("project.destination.renderRemote", "Render on the SSH machine");
    return t("project.destination.renderLocal", "Render on this computer");
});

function choose(id: string): void {
    const destination = items.value.find((item) => item.id === id);
    if (destination === undefined || destination.disabled === true) return;
    open.value = false;
    emit("choose", id as RenderDestinationId);
}

watch(open, async (value) => {
    await nextTick();
    if (value) {
        const input = (menuSearch.value?.$el as HTMLElement | undefined)?.querySelector<HTMLInputElement>("input");
        input?.focus();
    } else {
        arrowButton.value?.focus();
    }
});

defineExpose({ open, items, choose });
</script>

<template>
    <div class="mb-render-destination" data-render-destination>
        <v-btn-group divided :disabled="isDisabled" color="primary" variant="tonal">
            <v-btn
                :prepend-icon="mdiPlay"
                :disabled="isMainDisabled"
                :loading="isRendering"
                class="mb-render-destination__main"
                data-render-destination-main
                @click="emit('render')"
            >
                {{ label }}
            </v-btn>
            <v-menu
                v-model="open"
                location="bottom end"
                :close-on-content-click="false"
                eager
                scrim
                data-render-destination-menu
            >
                <template #activator="{ props: activatorProps }">
                    <v-btn
                        v-bind="activatorProps"
                        ref="arrowButton"
                        :disabled="isDisabled"
                        :aria-label="t('project.destination.choose', 'Choose where to render')"
                        :title="currentLabel"
                        class="mb-render-destination__arrow"
                        data-render-destination-arrow
                    >
                        <v-icon :icon="mdiChevronDown" aria-hidden="true" />
                    </v-btn>
                </template>
                <v-card
                    class="mb-render-destination__surface"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="render-destination-title"
                >
                    <v-card-title id="render-destination-title">{{ t("project.destination.title", "Choose where to render") }}</v-card-title>
                    <v-card-subtitle>{{ currentLabel }}</v-card-subtitle>
                    <MenuSearchList
                        ref="menuSearch"
                        :items="items"
                        :label="t('project.destination.menuLabel', 'Render destinations')"
                        @choose="choose"
                    />
                </v-card>
            </v-menu>
        </v-btn-group>
    </div>
</template>

<style>
.mb-render-destination {
    display: inline-flex;
    max-inline-size: 100%;
}

.mb-render-destination__main {
    max-inline-size: min(34rem, calc(100vw - 7rem));
}

.mb-render-destination__main .v-btn__content {
    white-space: normal;
    overflow-wrap: anywhere;
}

.mb-render-destination__arrow {
    min-inline-size: 44px;
}

.mb-render-destination__surface {
    min-inline-size: min(320px, calc(100vw - 32px));
    max-inline-size: min(420px, calc(100vw - 32px));
    max-block-size: min(70vh, 560px);
    overflow: auto;
}
</style>
