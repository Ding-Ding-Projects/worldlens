<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VSelect,
    VTextField,
    VCheckbox,
    VChip,
    VExpansionPanels,
    VExpansionPanel,
    VExpansionPanelTitle,
    VExpansionPanelText,
} from "vuetify/components";
import HostingProfilePanel from "./HostingProfilePanel.vue";
import type { HostingProfile } from "./managedHostingBridge.js";
import PathField from "../PathField.vue";
import { hostingBridge, preparedAccess } from "./managedHostingBridge.js";
import { workflowText as text } from "../mcserver/workflowText.js";
const props = defineProps<{ renderId: string }>();
const bridge = hostingBridge();
const target = ref("native-windows");
watch(target, (value) => {
    if (profile.value && profile.value.target !== value) profile.value = null;
});
const destination = ref("");
const localTag = ref("worldlens-map:local");
const archivePath = ref("");
const namespace = ref("");
const repository = ref("worldlens-map");
const tag = ref("latest");
const confirmed = ref(false);
const profile = ref<HostingProfile | null>(null);
function selectProfile(value: HostingProfile | null): void {
    profile.value = value;
    if (value) target.value = value.target;
}
const context = ref<{ path: string; fingerprint: string; renderId: string } | null>(null);
const image = ref<{ imageId: string; contextFingerprint: string } | null>(null);
const archive = ref<{ path: string; sha256: string; bytes: number } | null>(null);
const upload = ref<{ reference: string; digest: string } | null>(null);
const deployment = ref<{
    operationId: string;
    state: string;
    url?: string;
    health?: string;
} | null>(null);
const signIn = ref<{ state: string; verificationUrl?: string; userCode?: string } | null>(null);
const busy = ref("");
const failure = ref("");
const targets = computed(() => [
    { title: text("Native Windows host", "Windows 原生主機"), value: "native-windows" },
    { title: text("WSL host", "WSL 主機"), value: "native-wsl" },
    { title: text("Docker container", "Docker 容器"), value: "container" },
]);
const validContext = computed(() => context.value?.renderId === props.renderId);
interface UploadReview {
    imageId: string;
    registry: string;
    namespace: string;
    repository: string;
    tag: string;
}
const reviewedUpload = ref<UploadReview | null>(null);
const uploadTuple = computed<UploadReview>(() => ({
    imageId: image.value?.imageId ?? "",
    registry: "docker.io",
    namespace: namespace.value,
    repository: repository.value,
    tag: tag.value,
}));
watch(
    confirmed,
    (checked) => {
        reviewedUpload.value = checked ? Object.freeze({ ...uploadTuple.value }) : null;
    },
    { flush: "sync" },
);
watch(
    () => JSON.stringify(uploadTuple.value),
    () => {
        confirmed.value = false;
        reviewedUpload.value = null;
    },
    { flush: "sync" },
);
watch(
    () => [context.value?.fingerprint, props.renderId],
    () => {
        confirmed.value = false;
        reviewedUpload.value = null;
    },
    { flush: "sync" },
);
async function action(
    name: string,
    call: () => Promise<{ ok: boolean; value?: unknown; failure?: { message: string } }>,
    accept: (value: never) => void,
): Promise<void> {
    if (busy.value) return;
    busy.value = name;
    failure.value = "";
    try {
        const result = await call();
        if (result.ok && result.value) accept(result.value as never);
        else
            failure.value =
                result.failure?.message ?? text("Operation did not complete.", "操作未完成。");
    } catch {
        failure.value = text(
            "Operation could not be observed. Its outcome is unknown.",
            "無法觀察操作結果，狀態未知。",
        );
    } finally {
        busy.value = "";
    }
}
function exportMap(): void {
    confirmed.value = false;
    reviewedUpload.value = null;
    const renderId = props.renderId;
    const path = destination.value;
    if (!bridge?.exportContext) return;
    void action(
        "export",
        () => bridge.exportContext!({ renderId, destination: path, target: target.value }),
        (value: { context?: string; contextFingerprint: string }) => {
            context.value = {
                path: value.context ?? path,
                fingerprint: value.contextFingerprint,
                renderId,
            };
            image.value = null;
            archive.value = null;
            upload.value = null;
            deployment.value = null;
        },
    );
}
function build(): void {
    confirmed.value = false;
    reviewedUpload.value = null;
    if (!context.value || !bridge?.build) return;
    void action(
        "build",
        () => bridge.build!({ context: context.value!.path, localTag: localTag.value }),
        (value: { imageId: string; contextFingerprint: string }) => {
            image.value = value;
            archive.value = null;
            upload.value = null;
        },
    );
}
function save(): void {
    if (!context.value || !image.value || !bridge?.save) return;
    void action(
        "save",
        () =>
            bridge.save!({
                context: context.value!.path,
                imageId: image.value!.imageId,
                path: archivePath.value,
            }),
        (value: { path: string; sha256: string; bytes: number }) => (archive.value = value),
    );
}
function login(): void {
    if (!bridge?.signIn) return;
    signIn.value = null;
    void action(
        "sign-in",
        () => bridge.signIn!(),
        (value: { state: string; verificationUrl?: string; userCode?: string }) =>
            (signIn.value = value),
    );
}
function cancelSignIn(): void {
    if (!bridge?.signInCancel) return;
    void action(
        "cancel-sign-in",
        () => bridge.signInCancel!(),
        (value: { state: string }) => (signIn.value = value),
    );
}
function stopHost(): void {
    if (!deployment.value || !bridge?.stop) return;
    void action(
        "stop",
        () => bridge.stop!(deployment.value!.operationId),
        (value: { operationId: string; state: string; url?: string; health?: string }) =>
            (deployment.value = value),
    );
}
function loginStatus(): void {
    if (!bridge?.signInStatus) return;
    void action(
        "sign-in-status",
        () => bridge.signInStatus!(),
        (value: { state: string; verificationUrl?: string; userCode?: string }) => {
            signIn.value =
                value.state === "complete" ||
                value.state === "failed" ||
                value.state === "cancelled"
                    ? { state: value.state }
                    : value;
        },
    );
}
function uploadImage(): void {
    const review = reviewedUpload.value;
    if (
        !review ||
        !image.value ||
        !confirmed.value ||
        !bridge?.upload ||
        JSON.stringify(review) !== JSON.stringify(uploadTuple.value)
    )
        return;
    const { imageId, ...destination } = review;
    void action(
        "upload",
        () => bridge.upload!({ imageId, destination, confirmed: true }),
        (value: { reference: string; digest: string }) => {
            upload.value = value;
            confirmed.value = false;
        },
    );
}
function deploy(): void {
    if (!context.value || !preparedAccess.value || !bridge?.deploy || !profile.value) return;
    void action(
        "deploy",
        () =>
            bridge.deploy!({
                context: context.value!.path,
                target: target.value,
                accessReference: preparedAccess.value!.reference,
                port: profile.value!.port,
                profileId: profile.value!.id,
            }),
        (value: { operationId: string; state: string; url?: string; health?: string }) =>
            (deployment.value = value),
    );
}
function refresh(): void {
    if (!deployment.value || !bridge?.status) return;
    void action(
        "status",
        () => bridge.status!(deployment.value!.operationId),
        (value: { operationId: string; state: string; url?: string; health?: string }) =>
            (deployment.value = value),
    );
}
function safeUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        return new URL(url).protocol === "https:" ? url : undefined;
    } catch {
        return undefined;
    }
}
</script>
<template>
    <VCard variant="outlined" class="hosting-panel"
        ><VCardText
            ><h3>{{ text("Export and host verified map", "匯出及託管已驗證地圖") }}</h3>
            <p>
                {{
                    text(
                        "Each action has its own receipt. Export requires completed output verification. Building or saving never signs in or uploads. Shared hosting requires protected administrator access.",
                        "每個操作都有獨立記錄。匯出須先驗證完成的輸出。建立或儲存映像不會自動登入或上傳。共享託管需要受保護的管理員存取。",
                    )
                }}
            </p>
            <VAlert v-if="failure" type="error" role="status">{{ failure }}</VAlert>
            <div class="hosting-grid">
                <VSelect
                    v-model="target"
                    :items="targets"
                    :label="text('Hosting format', '託管格式')"
                /><PathField
                    v-model="destination"
                    field="export folder"
                    semantic="folder"
                    :label="text('New export folder', '新匯出資料夾')"
                />
            </div>
            <VBtn
                :disabled="!!busy || !props.renderId || !destination || !bridge?.exportContext"
                @click="exportMap"
                >{{ text("Export verified context", "匯出已驗證內容") }}</VBtn
            >
            <p v-if="context" role="status">
                {{ text("Exported", "已匯出") }}: {{ context.path }} · {{ context.fingerprint }}
            </p>
            <VExpansionPanels multiple
                ><VExpansionPanel
                    ><VExpansionPanelTitle>{{
                        text("Build and save image", "建立及儲存映像")
                    }}</VExpansionPanelTitle
                    ><VExpansionPanelText
                        ><VTextField
                            v-model="localTag"
                            :label="text('Local image tag', '本機映像標籤')"
                        /><VBtn
                            :disabled="!!busy || !validContext || !bridge?.build"
                            @click="build"
                            >{{ text("Build image", "建立映像") }}</VBtn
                        >
                        <p v-if="image">{{ image.imageId }}</p>
                        <PathField
                            v-model="archivePath"
                            field="image archive file"
                            semantic="file"
                            :label="text('New image archive path', '新映像封存檔路徑')"
                        /><VBtn
                            :disabled="
                                !!busy || !validContext || !image || !archivePath || !bridge?.save
                            "
                            @click="save"
                            >{{ text("Save image archive", "儲存映像封存檔") }}</VBtn
                        >
                        <p v-if="archive">
                            {{ archive.path }} · {{ archive.bytes }} bytes · SHA-256
                            {{ archive.sha256 }}
                        </p></VExpansionPanelText
                    ></VExpansionPanel
                >
                <VExpansionPanel
                    ><VExpansionPanelTitle>{{
                        text("Registry sign-in and reviewed upload", "登入登錄庫及確認上傳")
                    }}</VExpansionPanelTitle
                    ><VExpansionPanelText
                        ><VChip>docker.io</VChip>
                        <div class="hosting-actions">
                            <VBtn :disabled="!!busy || !bridge?.signIn" @click="login">{{
                                text("Start device sign-in", "開始裝置登入")
                            }}</VBtn
                            ><VBtn
                                :disabled="!!busy || !bridge?.signInStatus"
                                @click="loginStatus"
                                >{{ text("Refresh sign-in", "更新登入狀態") }}</VBtn
                            >
                        </div>
                        <VBtn
                            :disabled="
                                !!busy || signIn?.state !== 'pending' || !bridge?.signInCancel
                            "
                            @click="cancelSignIn"
                            >{{ text("Cancel sign-in", "取消登入") }}</VBtn
                        >
                        <div v-if="signIn" aria-live="polite">
                            <p>{{ signIn.state }}</p>
                            <a
                                v-if="
                                    signIn.verificationUrl === 'https://login.docker.com/activate'
                                "
                                :href="signIn.verificationUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                                >{{ text("Open Docker sign-in", "開啟 Docker 登入") }}</a
                            >
                            <p v-if="signIn.userCode" class="device-code">{{ signIn.userCode }}</p>
                        </div>
                        <div class="hosting-grid">
                            <VTextField
                                v-model="namespace"
                                :label="text('Namespace', '命名空間')"
                            /><VTextField
                                v-model="repository"
                                :label="text('Repository', '儲存庫')"
                            /><VTextField v-model="tag" :label="text('Tag', '標籤')" />
                        </div>
                        <p>docker.io/{{ namespace }}/{{ repository }}:{{ tag }}</p>
                        <VCheckbox
                            v-model="confirmed"
                            :label="
                                text(
                                    'Upload this exact image to the reviewed destination',
                                    '將此指定映像上傳至已確認的位置',
                                )
                            "
                        /><VBtn
                            :disabled="
                                !!busy ||
                                !validContext ||
                                !image ||
                                !confirmed ||
                                !namespace ||
                                !bridge?.upload
                            "
                            @click="uploadImage"
                            >{{ text("Upload image", "上傳映像") }}</VBtn
                        >
                        <p v-if="upload">
                            {{ upload.reference }} · {{ upload.digest }}
                        </p></VExpansionPanelText
                    ></VExpansionPanel
                >
                <VExpansionPanel
                    ><VExpansionPanelTitle>{{
                        text("Deploy and verify", "部署及驗證")
                    }}</VExpansionPanelTitle
                    ><VExpansionPanelText>
                        <HostingProfilePanel
                            :context="validContext ? (context?.path ?? '') : ''"
                            :disabled="!!busy"
                            @selected="selectProfile"
                        />
                        <div class="hosting-actions">
                            <VBtn
                                :disabled="
                                    !!busy ||
                                    !validContext ||
                                    !preparedAccess ||
                                    !profile ||
                                    !bridge?.deploy
                                "
                                @click="deploy"
                                >{{ text("Deploy authenticated host", "部署需要登入的主機") }}</VBtn
                            ><VBtn
                                :disabled="!!busy || !deployment || !bridge?.status"
                                @click="refresh"
                                >{{ text("Verify host status", "驗證主機狀態") }}</VBtn
                            >
                        </div>
                        <VBtn
                            :disabled="
                                !!busy ||
                                !deployment ||
                                deployment.state === 'exited' ||
                                !bridge?.stop
                            "
                            @click="stopHost"
                            >{{ text("Stop this host", "停止此主機") }}</VBtn
                        >
                        <p v-if="deployment" role="status">
                            {{ deployment.state }} ·
                            {{ deployment.health ?? text("Health unknown", "健康狀態未知") }}
                        </p>
                        <a
                            v-if="safeUrl(deployment?.url)"
                            :href="safeUrl(deployment?.url)"
                            target="_blank"
                            rel="noopener noreferrer"
                            >{{ deployment?.url }}</a
                        ></VExpansionPanelText
                    ></VExpansionPanel
                ></VExpansionPanels
            >
            <p v-if="busy" role="status">
                {{ text("Operation in progress", "操作進行中") }}: {{ busy }}
            </p>
        </VCardText></VCard
    >
</template>
<style scoped>
.hosting-panel {
    white-space: pre-line;
    min-width: 0;
}
.hosting-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr));
    gap: 12px;
    margin-block: 12px;
}
.hosting-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block: 12px;
}
.hosting-panel p {
    overflow-wrap: anywhere;
}
.hosting-panel :deep(.v-btn__content) {
    white-space: pre-line;
}
.device-code {
    font-family: monospace;
    font-size: 1.4rem;
}
</style>
