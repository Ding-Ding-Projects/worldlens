<script setup lang="ts">
/**
 * One-click "Deploy WorldLens as a container": the whole application, in a container on this
 * computer's Docker, opened in a browser. Builds one Docker hosting request from typed controls
 * (folders with browse buttons, a port stepper, a reachability switch, a password) and starts it.
 *
 * Design: `design/design-sources/deploy-anywhere/Container.dc.html`.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VSelect,
    VSwitch,
    VTextField,
} from "vuetify/components";
import PathField from "../PathField.vue";
import type { DockerHostingBridge, DockerHostingSnapshot } from "./dockerHostingBridge.js";
import {
    HOSTED_IMAGE_NAME,
    defaultForm,
    deployRequest,
    formProblems,
    instanceId,
    isHostedImage,
    sha256Hex,
    type DeployForm,
} from "./deployWorldLensModel.js";

const props = defineProps<{
    bridge: DockerHostingBridge;
    snapshot: DockerHostingSnapshot | null;
}>();
const emit = defineEmits<{ deployed: [] }>();
const { t } = useI18n();

const form = ref<DeployForm>(defaultForm());
const password = ref("");
const confirm = ref("");
const manualImage = ref(false);
const busy = ref(false);
const outcome = ref<{ ok: boolean; text: string } | null>(null);

const hostedImages = computed(() => (props.snapshot?.images ?? []).filter(isHostedImage));
if (hostedImages.value[0] !== undefined) form.value.image = hostedImages.value[0];

const passwordProblem = computed(() =>
    password.value !== "" && password.value !== confirm.value
        ? t("deploy.wl.mismatch", "The two passwords are different.")
        : null,
);
const problems = computed(() => {
    const list = formProblems({
        ...form.value,
        passwordHash: password.value === "" ? "" : "0".repeat(64),
    });
    if (passwordProblem.value) list.push(passwordProblem.value);
    if (props.snapshot?.daemon !== "ready")
        list.push(t("deploy.wl.noDocker", "Docker is not ready on this computer."));
    return list;
});
const address = computed(
    () => `http://${form.value.reachable ? "this-computer" : "localhost"}:${form.value.port}`,
);
const restartItems = computed(() => [
    { value: "unless-stopped", title: t("deploy.wl.restart.unless", "Restart unless I stop it") },
    { value: "always", title: t("deploy.wl.restart.always", "Always restart") },
    { value: "on-failure", title: t("deploy.wl.restart.failure", "Restart only after a crash") },
    { value: "no", title: t("deploy.wl.restart.no", "Never restart") },
]);

function addFolder(): void {
    form.value.folders.push({ path: "", label: "", readOnly: true });
}

async function deploy(): Promise<void> {
    if (busy.value || problems.value.length > 0) return;
    busy.value = true;
    outcome.value = null;
    try {
        const passwordHash = await sha256Hex(password.value);
        const request = deployRequest({ ...form.value, passwordHash });
        const created = await props.bridge.create(request);
        if (!created.ok) {
            outcome.value = { ok: false, text: created.failure.message };
            return;
        }
        const containerId = created.value.containerId;
        if (containerId !== null) {
            const started = await props.bridge.mutate({ operation: "start", containerId });
            if (!started.ok) {
                outcome.value = {
                    ok: false,
                    text: t(
                        "deploy.wl.notStarted",
                        { reason: started.failure.message },
                        "Created, but it did not start: {reason}",
                    ),
                };
                return;
            }
        }
        password.value = "";
        confirm.value = "";
        outcome.value = {
            ok: true,
            text: t(
                "deploy.wl.done",
                { address: address.value, id: request.id },
                "Running as {id}. Open {address} and sign in with the password you chose.",
            ),
        };
        emit("deployed");
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <v-card variant="outlined" class="wl-deploy" data-test="deploy-worldlens">
        <v-card-title>{{ t("deploy.wl.title", "Deploy WorldLens as a container") }}</v-card-title>
        <v-card-text class="wl-deploy__body">
            <p class="wl-deploy__note">
                {{
                    t(
                        "deploy.wl.help",
                        "Runs the whole WorldLens app in Docker on this computer, opened in a browser. Choose which folders it may open; everything else stays out of reach.",
                    )
                }}
            </p>
            <div class="wl-deploy__row">
                <v-text-field
                    v-model="form.name"
                    :label="t('deploy.wl.name', 'Name')"
                    :hint="t('deploy.wl.id', { id: instanceId(form.name) }, 'Container: {id}')"
                    persistent-hint
                    variant="outlined"
                    density="comfortable"
                />
                <v-select
                    v-if="!manualImage"
                    v-model="form.image"
                    :items="hostedImages"
                    :label="t('deploy.wl.image', 'WorldLens image')"
                    :no-data-text="
                        t(
                            'deploy.wl.noImage',
                            { name: HOSTED_IMAGE_NAME },
                            'No {name} image on this computer yet.',
                        )
                    "
                    variant="outlined"
                    density="comfortable"
                />
                <v-text-field
                    v-else
                    v-model="form.image"
                    :label="t('deploy.wl.imageRef', 'Image pinned by digest')"
                    placeholder="ghcr.io/ding-ding-projects/worldlens-hosted@sha256:…"
                    variant="outlined"
                    density="comfortable"
                    autocomplete="off"
                />
            </div>
            <v-switch
                v-model="manualImage"
                color="primary"
                hide-details
                density="compact"
                :label="
                    t(
                        'deploy.wl.manual',
                        'Enter the image digest myself (from a release or the CI summary)',
                    )
                "
            />

            <h3 class="wl-deploy__h">{{ t("deploy.wl.folders", "Folders it may open") }}</h3>
            <p v-if="form.folders.length === 0" class="wl-deploy__note">
                {{ t("deploy.wl.noFolders", "None yet. Add the folder that holds your worlds.") }}
            </p>
            <div v-for="(f, i) in form.folders" :key="i" class="wl-deploy__row wl-deploy__folder">
                <PathField
                    v-model="f.path"
                    :field="t('deploy.wl.folderField', 'folder to share')"
                    semantic="folder"
                    class="wl-deploy__grow"
                />
                <v-text-field
                    v-model="f.label"
                    :label="t('deploy.wl.label', 'Name shown inside')"
                    variant="outlined"
                    density="comfortable"
                    hide-details
                />
                <v-switch
                    v-model="f.readOnly"
                    color="primary"
                    hide-details
                    density="compact"
                    :label="t('deploy.wl.readOnly', 'Read only')"
                />
                <v-btn
                    variant="text"
                    :aria-label="t('deploy.wl.removeFolder', { n: i + 1 }, 'Remove folder {n}')"
                    @click="form.folders.splice(i, 1)"
                    >{{ t("deploy.wl.remove", "Remove") }}</v-btn
                >
            </div>
            <v-btn variant="tonal" rounded="pill" class="wl-deploy__add" @click="addFolder">{{
                t("deploy.wl.addFolder", "Add a folder")
            }}</v-btn>

            <h3 class="wl-deploy__h">{{ t("deploy.wl.access", "Access") }}</h3>
            <div class="wl-deploy__row">
                <v-text-field
                    v-model.number="form.port"
                    type="number"
                    min="1"
                    max="65535"
                    step="1"
                    :label="t('deploy.wl.port', 'Port')"
                    variant="outlined"
                    density="comfortable"
                    class="wl-deploy__port"
                />
                <v-switch
                    v-model="form.reachable"
                    color="primary"
                    hide-details
                    :label="t('deploy.wl.reachable', 'Other machines on my network can open it')"
                />
                <v-select
                    v-model="form.restart"
                    :items="restartItems"
                    :label="t('deploy.wl.restart', 'After a reboot')"
                    variant="outlined"
                    density="comfortable"
                />
            </div>
            <div class="wl-deploy__row">
                <v-text-field
                    v-model="password"
                    type="password"
                    autocomplete="new-password"
                    :label="t('deploy.wl.password', 'Password for signing in')"
                    variant="outlined"
                    density="comfortable"
                />
                <v-text-field
                    v-model="confirm"
                    type="password"
                    autocomplete="new-password"
                    :label="t('deploy.wl.confirm', 'Same password again')"
                    :error-messages="passwordProblem ?? []"
                    variant="outlined"
                    density="comfortable"
                />
            </div>
            <p class="wl-deploy__note">
                {{
                    t(
                        "deploy.wl.passwordNote",
                        "Only a SHA-256 of the password goes to the container.",
                    )
                }}
            </p>

            <ul
                v-if="problems.length"
                class="wl-deploy__problems"
                :aria-label="t('deploy.wl.why', 'Why Deploy is not available yet')"
            >
                <li v-for="p in problems" :key="p">{{ p }}</li>
            </ul>
            <div class="wl-deploy__row">
                <v-btn
                    color="primary"
                    rounded="pill"
                    :loading="busy"
                    :disabled="problems.length > 0 || busy"
                    @click="deploy"
                    >{{ t("deploy.wl.deploy", "Deploy") }}</v-btn
                >
                <span class="wl-deploy__note">{{
                    t("deploy.wl.opens", { address }, "Opens at {address}")
                }}</span>
            </div>
            <v-alert
                v-if="outcome"
                :type="outcome.ok ? 'success' : 'error'"
                variant="tonal"
                role="status"
                >{{ outcome.text }}</v-alert
            >
        </v-card-text>
    </v-card>
</template>

<style scoped>
.wl-deploy__body {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.wl-deploy__row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
}
.wl-deploy__row > * {
    flex: 1 1 200px;
    min-width: 0;
}
.wl-deploy__row > .v-switch,
.wl-deploy__row > .v-btn {
    flex: 0 0 auto;
}
.wl-deploy__grow {
    flex: 2 1 280px !important;
}
.wl-deploy__port {
    flex: 0 0 140px !important;
}
.wl-deploy__add {
    align-self: flex-start;
}
.wl-deploy__h {
    margin: 8px 0 0;
    font:
        500 14px/20px Roboto,
        sans-serif;
}
.wl-deploy__note {
    margin: 0;
    font:
        400 13px/18px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-deploy__problems {
    margin: 0;
    padding-left: 18px;
    font:
        400 13px/20px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-error));
}
.wl-deploy__folder {
    padding-top: 6px;
    border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}
</style>
