<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { VAlert, VBtn, VCard, VCardText, VCheckbox, VTextField } from "vuetify/components";
import { useI18n } from "vue-i18n";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { acquireSpatialPicker, mapCommandPlayer } from "../../stores/bluemap.js";
import { activeProfile } from "../../stores/profiles.js";
import CommandBuilderOperand from "./CommandBuilderOperand.vue";
import { initialOperand, typedOperandControls, type RegistryData, type TypedOperand } from "./commandBuilderOperands.js";

interface Point { kind: "point"; dimension: string; x: number; y: number; z: number }
interface Node { id: number; kind: "root" | "literal" | "argument"; name: string; executable: boolean; children: number[]; redirect: number | null; parser: { parser: string; control: string; properties: { min?: number; max?: number } | null; dimensions?: number; reason?: string } | null }
interface Graph { target: { serverId: string; version: string; executionDimension?: string | null }; revision: string; root: number; nodes: Node[]; completeness: string; registries?: RegistryData }
interface Step { node: number; value?: string | number | boolean | Point | TypedOperand }
interface Preview { previewId: string; command: string; graphRevision: string; dimension: string | null; expiresAt: string }
type Answer<T> = T | { ok: boolean; value?: T; failure?: { message: string } };
interface Api { discover(request: { serverId: string }): Promise<Answer<Graph>>; preview(request: { serverId: string; steps: Step[]; dimension: string | null }): Promise<Answer<Preview>>; execute(request: { previewId: string }): Promise<Answer<{ executed: true }>> }
const props = defineProps<{ serverId: string; cancelPick?: number }>();
const emit = defineEmits<{ picking: [active: boolean] }>();
const { locale } = useI18n();
const text = (en: string, yue: string) => locale.value.startsWith("zh") || locale.value.startsWith("yue") ? yue : locale.value === "bilingual" ? `${en} / ${yue}` : en;
const api = (globalThis as unknown as { worldlens?: { mcserver?: { commands?: Api } } }).worldlens?.mcserver?.commands;
const graph = ref<Graph | null>(null), steps = ref<Step[]>([]), preview = ref<Preview | null>(null);
const busy = ref(false), failure = ref(""), query = ref("");
const regex = ref(false), flags = ref("i");
const dimension = ref("");
let generation = 0, release = () => {};
function stopPicking() { release(); emit("picking", false); }
function answer<T>(value: Answer<T>): T {
    if (value && typeof value === "object" && "ok" in value) {
        if (!value.ok || value.value === undefined) throw new Error(value.failure?.message ?? "Command operation is unavailable.");
        return value.value;
    }
    return value as T;
}
const current = computed(() => graph.value?.nodes.find(node => node.id === (steps.value.at(-1)?.node ?? graph.value?.root)));
const choices = computed(() => {
    const source = current.value?.redirect !== null && current.value?.redirect !== undefined
        ? graph.value?.nodes.find(node => node.id === current.value?.redirect) : current.value;
    return (source?.children ?? []).map(id => graph.value?.nodes.find(node => node.id === id)).filter((node): node is Node => !!node);
});
const filtered = computed(() => {
    const matcher = createSettingMatcher(query.value, regex.value, flags.value);
    return choices.value.filter(node => matcher.test(node.name));
});
const selectedNodes = computed(() => steps.value.map(step => graph.value?.nodes.find(node => node.id === step.node)));
const supported = new Set(["boolean", "point", "number", "integer", "text", "dimension", ...typedOperandControls]);
const unsupported = computed(() => selectedNodes.value.some(node => node?.parser && !supported.has(node.parser.control)));
async function discover() {
    const attempt = ++generation; stopPicking(); graph.value = null; steps.value = []; preview.value = null; failure.value = "";
    if (!api) { failure.value = "Command discovery is unavailable in this host."; return; }
    busy.value = true;
    try {
        const result = answer(await api.discover({ serverId: props.serverId }));
        if (attempt !== generation) return;
        if (result.target.serverId !== props.serverId) throw new Error("The command graph belongs to another server.");
        graph.value = result; dimension.value = mapCommandPlayer.value?.dimension ?? result.target.executionDimension ?? "";
    } catch (error) { if (attempt === generation) failure.value = String(error); }
    finally { if (attempt === generation) busy.value = false; }
}
function choose(node: Node) {
    stopPicking(); preview.value = null; query.value = "";
    const control = node.parser?.control;
    const value = control === "entity" && mapCommandPlayer.value ? { kind: "entity", uuid: mapCommandPlayer.value.uuid }
        : typedOperandControls.has(control ?? "") ? initialOperand(control!, mapCommandPlayer.value?.name)
        : control === "boolean" ? false : control === "point" ? { kind: "point" as const, dimension: dimension.value, x: 0, y: 64, z: 0 }
        : control === "number" || (control === "integer" && node.parser?.parser !== "brigadier:long") ? 0 : "";
    steps.value.push(node.kind === "literal" ? { node: node.id } : { node: node.id, value });
}
function point(index: number): Point { return steps.value[index]!.value as Point; }
function pick(index: number) {
    const profile = activeProfile() as (ReturnType<typeof activeProfile> & { serverId?: string; dimension?: string }) | null;
    if (profile?.serverId !== props.serverId || profile.dimension !== dimension.value) {
        failure.value = "Open the matching server and dimension map before picking a command destination."; return;
    }
    release();
    emit("picking", true);
    release = acquireSpatialPicker(value => {
        const live = activeProfile() as typeof profile;
        if (live?.id !== profile.id || live?.serverId !== props.serverId || live?.dimension !== dimension.value) { stopPicking(); return; }
        const integer = ["minecraft:block_pos", "minecraft:column_pos"].includes(selectedNodes.value[index]?.parser?.parser ?? "");
        steps.value[index]!.value = { kind: "point", dimension: dimension.value, x: integer ? Math.floor(value.x) : value.x, y: integer ? Math.floor(value.y) : value.y, z: integer ? Math.floor(value.z) : value.z };
        stopPicking();
    });
}
async function prepare() {
    if (!api || unsupported.value) return;
    const attempt = generation, input = JSON.stringify([steps.value, dimension.value]); busy.value = true; failure.value = "";
    try { const result = answer(await api.preview({ serverId: props.serverId, steps: JSON.parse(JSON.stringify(steps.value)) as Step[], dimension: dimension.value || null })); if (attempt === generation && input === JSON.stringify([steps.value, dimension.value])) preview.value = result; }
    catch (error) { failure.value = String(error); } finally { busy.value = false; }
}
async function execute() {
    if (!api || !preview.value) return;
    const reviewed = preview.value; preview.value = null; busy.value = true;
    try { answer(await api.execute({ previewId: reviewed.previewId })); failure.value = text("Command executed after server revalidation.", "伺服器重新驗證後已執行指令。"); }
    catch (error) { failure.value = String(error); } finally { busy.value = false; }
}
watch([steps, dimension], () => { preview.value = null; }, { deep: true, flush: "sync" });
watch(() => props.serverId, discover, { immediate: true });
watch(() => props.cancelPick, stopPicking);
onBeforeUnmount(() => { generation++; stopPicking(); });
</script>

<template>
    <VCard variant="tonal" data-test="discovered-command-builder">
        <VCardText>
            <div class="d-flex align-center flex-wrap ga-2"><h3>{{ text('Discovered server commands', '伺服器指令目錄') }}</h3><VBtn :loading="busy" variant="text" @click="discover">{{ text('Refresh graph', '重新讀取') }}</VBtn></div>
            <VAlert v-if="failure" type="info" variant="tonal" role="status" class="my-2">{{ failure }}</VAlert>
            <template v-if="graph">
                <p>{{ graph.target.version }} · {{ graph.completeness }}</p>
                <VAlert v-if="mapCommandPlayer" type="info" variant="tonal">{{ text('Selected player', '已選玩家') }}: {{ mapCommandPlayer.name }} · {{ mapCommandPlayer.uuid }}. {{ text('Choose teleport, then select its destination on the map before reviewing.', '選擇傳送指令，再於地圖選取目的地及檢視。') }}</VAlert>
                <VTextField v-model="dimension" :label="text('Execution dimension', '執行維度')" density="compact" />
                <div v-for="(step, index) in steps" :key="`${index}:${step.node}`" class="mb-2">
                    <strong>{{ selectedNodes[index]?.name }}</strong>
                    <CommandBuilderOperand v-if="selectedNodes[index]?.parser && typedOperandControls.has(selectedNodes[index]!.parser!.control)" :model-value="step.value" :parser="selectedNodes[index]!.parser!" v-bind="graph.registries ? {registries:graph.registries} : {}" :player="mapCommandPlayer?.name ?? ''" @update:model-value="step.value = $event" />
                    <VCheckbox v-else-if="selectedNodes[index]?.parser?.control === 'boolean'" v-model="step.value" :label="selectedNodes[index]?.name" />
                    <template v-else-if="selectedNodes[index]?.parser?.control === 'point'">
                        <div class="d-flex flex-wrap ga-2"><VTextField v-for="axis in (['x', 'y', 'z'] as const)" :key="axis" v-model.number="point(index)[axis]" :label="axis.toUpperCase()" type="number" density="compact" style="min-width:80px; flex:1" /><VBtn @click="pick(index)">{{ text('Pick destination', '選取目的地') }}</VBtn></div>
                    </template>
                    <VAlert v-else-if="selectedNodes[index]?.parser && !supported.has(selectedNodes[index]!.parser!.control)" type="warning" variant="tonal">{{ selectedNodes[index]?.parser?.parser }}: {{ selectedNodes[index]?.parser?.reason ?? text('A verified typed editor is not available for this parser.', '此參數暫未提供已驗證的專用編輯器。') }}</VAlert>
                    <VTextField v-else-if="selectedNodes[index]?.kind === 'argument'" v-model="step.value" :label="selectedNodes[index]?.name" :type="['number', 'integer'].includes(selectedNodes[index]?.parser?.control ?? '') && selectedNodes[index]?.parser?.parser !== 'brigadier:long' ? 'number' : 'text'" @update:model-value="value => { if (['number', 'integer'].includes(selectedNodes[index]?.parser?.control ?? '') && selectedNodes[index]?.parser?.parser !== 'brigadier:long') step.value = Number(value); }" />
                </div>
                <ConfigSearchField v-model="query" v-model:regex="regex" v-model:flags="flags" :sample="choices.map(node => node.name).join('\n')" :label="text('Find next command or argument', '搜尋下一項指令或參數')" density="compact" />
                <div class="d-flex flex-wrap ga-2"><VBtn v-for="node in filtered" :key="node.id" variant="tonal" @click="choose(node)">{{ node.name }}{{ node.parser?.control === 'unavailable' ? ' ⚠' : '' }}</VBtn></div>
                <VBtn class="mt-2" :disabled="!steps.length || busy" variant="text" @click="release(); steps.pop()">{{ text('Back one argument', '返回上一參數') }}</VBtn>
                <VBtn class="mt-2" color="primary" :disabled="!current?.executable || unsupported || busy" @click="prepare">{{ text('Review exact command', '檢視完整指令') }}</VBtn>
                <VAlert v-if="preview" type="warning" variant="tonal" class="mt-3"><pre style="white-space:pre-wrap; overflow-wrap:anywhere">{{ preview.command }}</pre><p>{{ props.serverId }} · {{ preview.dimension }} · {{ preview.expiresAt }}</p><VBtn :disabled="busy" color="warning" @click="execute">{{ text('Execute reviewed command', '執行已檢視指令') }}</VBtn></VAlert>
            </template>
        </VCardText>
    </VCard>
</template>
