<script setup lang="ts">
import { computed, onMounted, useId } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn } from "vuetify/components";
import PathField from "../../PathField.vue";
import ConsentQuote from "../../setup/ConsentQuote.vue";
import { createConsentSettings, type SetupBridge } from "../../setup/firstRunFlow.js";
import { mapStorageExample } from "../../setup/mapStorage.js";
import { useSetupI18n } from "../../setup/setupI18n.js";
import { consentAccepted } from "../../world/consentState.js";
import { raiseNotice } from "../../../stores/notices.js";
import { createMapStorageSetting, type MapStorageSetting } from "../mapStorageSetting.js";
import { announceQuickAddSave } from "./quickAddEvents.js";
import { quickAddControlFor } from "./quickAddPointers.js";

/**
 * The quick entry that sits beside a message telling the person to add, set or accept
 * something in Settings, so they can do it without leaving what they were doing.
 *
 * It is not a second copy of the setting. Each control is driven by the very controller the
 * Settings row uses (`createMapStorageSetting` for the maps folder, `createConsentSettings`
 * for the Mojang download), so a value saved here is the value Settings shows, and the same
 * validation refuses the same bad input. After a save it announces itself through
 * `quickAddEvents.ts` so the Settings rows reload instead of showing the old answer.
 *
 * Which control appears is decided by the anchor alone (`quickAddPointers.ts`). An anchor
 * with no quick entry renders nothing at all: the pointer's own button still opens Settings.
 */
const props = defineProps<{
        /** The Settings section the surrounding message points at. */
        anchor: string;
        /** Injected in tests. Left out, the controller probes the real bridge. */
        folderSetting?: MapStorageSetting | null;
        /** Injected in tests. `undefined` probes the preload; `null` means there is none. */
        consentBridge?: SetupBridge | null;
    }>();

const emit = defineEmits<{
    /** The value was written. The surrounding message can re-check its own condition. */
    saved: [anchor: string];
}>();

const { t } = useI18n();
const setup = useSetupI18n();

const control = computed(() => quickAddControlFor(props.anchor));

const folder: MapStorageSetting | null =
    control.value === "folder" ? (props.folderSetting ?? createMapStorageSetting()) : null;
const consent = control.value === "consent" ? createConsentSettings(props.consentBridge) : null;

const reasonId = useId();

onMounted(() => {
    void folder?.load();
    void consent?.load();
});

/* ---------------------------------- folder --------------------------------- */

const folderValue = computed<string>({
    get: () => folder?.value.value ?? "",
    set: (next) => {
        if (folder) folder.value.value = next;
    },
});

const fieldName = computed(() =>
    t("settings.storage.field", "Folder for rendered maps").toLowerCase(),
);

const folderError = computed(() => {
    const problem = folder?.problem.value ?? null;
    if (problem === "empty") {
        return t("settings.storage.empty", "Give a folder for the maps to be written into.");
    }
    if (problem === "relative") {
        return t(
            "settings.storage.relative",
            { example: mapStorageExample(folder?.platform ?? "windows") },
            "That is not a full path. Name a folder from the top of a drive, like {example}.",
        );
    }
    return "";
});

/** Why Save is out of reach, in words, beside the button. Empty when Save is available. */
const folderSaveReason = computed(() => {
    if (!folder) return "";
    if (folder.busy.value) return "";
    if (folder.problem.value !== null) return folderError.value;
    if (!folder.dirty.value) {
        return t("settings.quickAdd.folder.unchanged", "Change the folder above to save it.");
    }
    return "";
});

const canSaveFolder = computed(() => folder !== null && folderSaveReason.value === "");

async function saveFolder(): Promise<void> {
    // A keyboard submit walks straight past a disabled button, so refuse here as well.
    if (!folder || !canSaveFolder.value) return;
    const ok = await folder.save();
    if (!ok) return;
    announceQuickAddSave(props.anchor);
    raiseNotice(
        "success",
        t(
            "settings.storage.saved",
            { path: folder.saved.value },
            "Saved. Maps will be written to {path}.",
        ),
    );
    emit("saved", props.anchor);
}

/* --------------------------------- consent --------------------------------- */

const consentAlreadyAccepted = computed(() => consent?.accepted.value === true);

const consentReason = computed(() => {
    if (!consent) return "";
    if (!consent.available) {
        return t(
            "settings.quickAdd.consent.unavailable",
            "This build cannot record the answer. Accept it from the desktop app's Settings.",
        );
    }
    return "";
});

async function acceptConsent(): Promise<void> {
    if (!consent || !consent.available || consent.busy.value) return;
    await consent.accept();
    if (!consent.accepted.value) return;
    // The shared live value every world surface reads, so the warning above this entry
    // clears without waiting for a focus event.
    consentAccepted.value = true;
    announceQuickAddSave(props.anchor);
    raiseNotice(
        "success",
        t(
            "settings.quickAdd.consent.saved",
            "Accepted. The Minecraft client download can go ahead.",
        ),
    );
    emit("saved", props.anchor);
}
</script>

<template>
    <form
        v-if="control === 'folder' && folder"
        class="mb-quick-add"
        data-test="quick-add-folder"
        role="group"
        :aria-label="t('settings.quickAdd.folder.title', 'Set the folder right here')"
        @submit.prevent="saveFolder"
    >
        <p class="mb-quick-add__title">
            {{ t("settings.quickAdd.folder.title", "Set the folder right here") }}
        </p>
        <PathField
            v-model="folderValue"
            :field="fieldName"
            :label="t('settings.storage.field', 'Folder for rendered maps')"
            semantic="folder"
            :disabled="folder.busy.value"
            :error="folderError"
            density="comfortable"
        />
        <div class="mb-quick-add__actions">
            <v-btn
                type="button"
                variant="text"
                class="mb-quick-add__button"
                :disabled="folder.busy.value || folder.isDefault.value"
                data-test="quick-add-default"
                @click="folder.useDefault()"
            >
                {{ t("settings.storage.useDefault", "Use the default") }}
            </v-btn>
            <v-btn
                type="submit"
                variant="tonal"
                class="mb-quick-add__button"
                :disabled="!canSaveFolder"
                :loading="folder.busy.value"
                :aria-describedby="folderSaveReason ? reasonId : undefined"
                data-test="quick-add-save"
            >
                {{ t("settings.storage.save", "Save this folder") }}
            </v-btn>
        </div>
        <p
            v-if="folderSaveReason && folderError === ''"
            :id="reasonId"
            class="mb-quick-add__reason"
            data-test="quick-add-reason"
        >
            {{ folderSaveReason }}
        </p>
        <v-alert
            v-if="folder.failure.value !== null"
            type="error"
            variant="tonal"
            density="comfortable"
            role="alert"
        >
            {{ folder.failure.value }}
        </v-alert>
    </form>

    <div
        v-else-if="control === 'consent' && consent"
        class="mb-quick-add"
        data-test="quick-add-consent"
        role="group"
        :aria-label="t('settings.quickAdd.consent.title', 'Accept the download right here')"
    >
        <p class="mb-quick-add__title">
            {{ t("settings.quickAdd.consent.title", "Accept the download right here") }}
        </p>
        <p v-if="consentAlreadyAccepted" role="status" class="mb-quick-add__reason">
            {{ t("settings.quickAdd.consent.done", "Already accepted. Nothing more to do here.") }}
        </p>
        <template v-else>
            <ConsentQuote />
            <div class="mb-quick-add__actions">
                <v-btn
                    type="button"
                    variant="tonal"
                    class="mb-quick-add__button"
                    :disabled="!consent.available || consent.busy.value"
                    :loading="consent.busy.value"
                    :aria-describedby="consentReason ? reasonId : undefined"
                    data-test="quick-add-accept"
                    @click="acceptConsent"
                >
                    {{ setup.t("action.acceptNow") }}
                </v-btn>
            </div>
            <p
                v-if="consentReason"
                :id="reasonId"
                class="mb-quick-add__reason"
                data-test="quick-add-reason"
            >
                {{ consentReason }}
            </p>
            <v-alert
                v-if="consent.failure.value !== null"
                type="error"
                variant="tonal"
                density="comfortable"
                role="alert"
            >
                {{ consent.failure.value }}
            </v-alert>
        </template>
    </div>
</template>

<style>
.mb-quick-add {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-block-start: 8px;
    padding: 12px;
    border-radius: var(--md-sys-shape-corner-medium, 12px);
    border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
    background: rgb(var(--v-theme-surface));
    min-width: 0;
}

.mb-quick-add__title {
    margin: 0;
    font-weight: 500;
    font-size: var(--md-sys-typescale-title-small-size, 0.875rem);
}

.mb-quick-add__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
}

.mb-quick-add__button {
    min-height: 44px;
}

.mb-quick-add .v-field {
    min-height: 44px;
}

.mb-quick-add__reason {
    margin: 0;
    font-size: var(--md-sys-typescale-body-small-size, 0.75rem);
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}
</style>
