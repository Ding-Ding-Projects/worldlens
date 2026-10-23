<script setup lang="ts">
import { computed, ref } from 'vue';
import TaskStateReference from './TaskStateReference.vue';
import { VAlert, VBtn, VCard, VCardActions, VCardText, VCardTitle, VChip, VCol, VContainer, VDialog, VDivider, VList, VListItem, VProgressLinear, VRow, VSelect, VSwitch, VTextField, VToolbar, VToolbarTitle } from 'vuetify/components';
import { mdiInformationOutline } from '@mdi/js';
import ConfigSearchField from '../packages/ui/src/components/config/ConfigSearchField.vue';
import { createSettingMatcher } from '../packages/ui/src/components/config/regexEngine.js';

type Screen = 'projects' | 'generation' | 'configuration' | 'access' | 'renders' | 'map' | 'hosting' | 'bots';
const props = withDefaults(defineProps<{ screen?: Screen; state?: string; language?: 'en' | 'yue' | 'bilingual' }>(), { screen: 'projects', state: 'ready', language: 'en' });
const messages = {
  projects: ['Projects', '專案'], generation: ['Generate a world', '產生世界'], configuration: ['Server configuration', '伺服器設定'], access: ['Access', '存取權限'], renders: ['Which render', '選擇渲染結果'], map: ['Map workspace', '地圖工作區'], hosting: ['Hosting', '託管'], bots: ['Bots', '機械人'],
  generate: ['Generate and start project', '產生世界並啟動專案'], open: ['Open existing world', '開啟現有世界'], sample: ['Interactive design example. No real operation is performed.', '互動設計範例，並不會執行實際操作。'],
  review: ['Review', '檢視'], cancel: ['Cancel', '取消'], retry: ['Retry', '重試'], search: ['Search this list', '搜尋此清單'], noResults: ['No matching records', '沒有相符記錄'], help: ['Explain this workflow', '說明此流程'], close: ['Close', '關閉'], reset: ['Reset example', '重設範例'],
  draft: ['Draft retained', '已保留草稿'], simulate: ['Try sample action', '試用範例操作'], result: ['Sample validated. No account, world or upload was created.', '範例已通過驗證。沒有建立帳戶、世界或上載內容。'],
  offline: ['Connection unavailable. Local drafts remain available.', '連線暫時無法使用，本機草稿仍然保留。'], conflict: ['A newer revision exists. Compare before applying your draft.', '已有較新版本，請先比較，再套用草稿。'], empty: ['No records yet. Start from the project actions.', '暫時沒有記錄，請由專案操作開始。'], error: ['Operation needs attention. Review its details before retrying.', '操作需要處理，請先檢視詳細資料再重試。'], pending: ['Operation in progress', '操作進行中'],
  prepared: ['Prepared on this device', '已在此裝置準備'], provisioned: ['Provisioned on destination', '已在目的地建立'], verified: ['Sign-in verified', '已驗證登入'],
  username: ['Administrator username', '管理員名稱'], password: ['Password is collected only in the protected production flow.', '密碼只會在受保護的正式流程中收集。'], signedIn: ['Require sign-in to view', '需要登入才能檢視'],
  mapNotice: ['The real viewer canvas mounts here in production. This reference does not simulate terrain.', '正式版本會在此載入真正地圖。本範例不會模擬地形。'],
} as const;
function tx(key: keyof typeof messages): string { const m = messages[key]; return props.language === 'yue' ? m[1] : props.language === 'bilingual' ? `${m[0]}
${m[1]}` : m[0]; }
function pair(en: string, yue: string): string { return props.language === 'yue' ? yue : props.language === 'bilingual' ? `${en}
${yue}` : en; }
const query = ref(''); const regex = ref(false); const flags = ref('i'); const notice = ref(''); const helpOpen = ref(false); const chosen = ref(''); const sampleName = ref('Example administrator'); const requireSignIn = ref(true);
const rows = computed(() => {
  const data: Record<Screen, Array<[string, string, string]>> = {
    projects: [['example', 'Example project', '範例專案']],
    generation: [['destination', 'Destination and owned storage', '目的地及專用儲存空間'], ['distribution', 'Edition, version and distribution', '版本及發行套件'], ['world', 'Seed, terrain, dimensions and structures', '種子、地形、維度及建築'], ['extensions', 'Compatible extensions and pregeneration', '相容擴充功能及預先產生'], ['consent', 'Review downloads, license and effects', '檢視下載、授權及影響']],
    configuration: [['server.properties', 'Server properties', '伺服器屬性'], ['ops.json', 'Operators', '管理員'], ['whitelist.json', 'Allowlist', '允許名單'], ['banned-players.json', 'Banned players', '封鎖玩家'], ['banned-ips.json', 'Banned addresses', '封鎖位址']],
    access: [['prepared', 'Prepared on this device', '已在此裝置準備'], ['provisioned', 'Provisioned on destination', '已在目的地建立'], ['verified', 'Sign-in verified', '已驗證登入']],
    renders: [['run-a', 'Example world: retained and verified', '範例世界：已保留及驗證'], ['run-b', 'Example world: partial live preview', '範例世界：即時部分預覽'], ['run-c', 'Example world: verification failed', '範例世界：驗證失敗']],
    map: [['markers', 'Markers', '標記'], ['area', 'Draw area', '繪製區域'], ['commands', 'Commands', '指令'], ['bots', 'Bots', '機械人']],
    hosting: [['native', 'Native host, including WSL', '原生託管，包括 WSL'], ['container', 'Container host', '容器託管'], ['build', 'Build image', '建立映像'], ['save', 'Save image archive', '儲存映像封存檔'], ['upload', 'Review image upload', '檢視映像上載']],
    bots: [['mineflayer', 'Mineflayer with optional pathfinder', 'Mineflayer，可選路徑搜尋'], ['baritone', 'Baritone Java client', 'Baritone Java 用戶端']],
  };
  return data[props.screen].map(([id, en, yue]) => ({ id, title: pair(en, yue) }));
});
const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));
const visibleRows = computed(() => matcher.value.error ? [] : rows.value.filter(row => matcher.value.test(row.title)));
const statusText = computed(() => ['offline', 'conflict', 'empty', 'error', 'pending'].includes(props.state) ? tx(props.state as 'offline' | 'conflict' | 'empty' | 'error' | 'pending') : tx('draft'));
function sampleAction(): void { notice.value = tx('result'); }
function reset(): void { notice.value = ''; chosen.value = ''; query.value = ''; regex.value = false; flags.value = 'i'; sampleName.value = 'Example administrator'; requireSignIn.value = true; }
</script>

<template>
  <VContainer fluid class="workflow-reference">
    <VToolbar color="surface" class="reference-toolbar">
      <VToolbarTitle>{{ tx(screen) }}</VToolbarTitle>
      <VChip variant="tonal">{{ pair('Design reference', '設計參考') }}</VChip>
    </VToolbar>
    <VAlert type="info" variant="tonal" class="my-3">{{ tx('sample') }}</VAlert>
    <VAlert v-if="state !== 'ready' && !['generation', 'configuration', 'map', 'hosting', 'access', 'renders', 'bots'].includes(screen)" :type="state === 'error' ? 'error' : 'info'" variant="tonal" class="my-3">{{ statusText }}</VAlert>
    <VProgressLinear v-if="state === 'pending' && !['generation', 'configuration', 'map', 'hosting', 'access', 'renders', 'bots'].includes(screen)" :model-value="40" :aria-label="tx('pending')" />
    <TaskStateReference v-if="screen === 'generation' || screen === 'configuration' || screen === 'map' || screen === 'hosting' || screen === 'access' || screen === 'renders' || screen === 'bots'" :screen="screen" :state="state" :language="language" />
    <VRow v-else>
      <VCol cols="12" :md="screen === 'map' ? 4 : 8">
        <VCard variant="outlined">
          <VCardTitle class="reference-title">{{ tx(screen) }}</VCardTitle>
          <VCardText>
            <VBtn :icon="mdiInformationOutline" variant="text" :aria-label="tx('help')" :aria-expanded="helpOpen" @click="helpOpen = true" />
            <template v-if="screen === 'projects'">
              <VCardActions class="reference-actions">
                <VBtn color="primary" variant="flat" @click="sampleAction">{{ tx('generate') }}</VBtn>
                <VBtn variant="outlined" @click="sampleAction">{{ tx('open') }}</VBtn>
              </VCardActions>
            </template>
            <template v-else-if="screen === 'access'">
              <VTextField v-model="sampleName" :label="tx('username')" clearable variant="outlined" />
              <VAlert variant="tonal">{{ tx('password') }}</VAlert>
              <VSwitch v-model="requireSignIn" :label="tx('signedIn')" color="primary" />
              <VChip class="ma-1" variant="tonal">{{ tx('prepared') }}</VChip>
              <VChip class="ma-1" variant="outlined">{{ tx('provisioned') }}</VChip>
              <VChip class="ma-1" variant="outlined">{{ tx('verified') }}</VChip>
            </template>
            <template v-else>
              <ConfigSearchField v-model="query" v-model:regex="regex" v-model:flags="flags" :label="tx('search')" :sample="rows.map(row => row.title).join('\n')" />
              <VAlert v-if="!visibleRows.length" variant="tonal">{{ tx('noResults') }}</VAlert>
              <VList v-else :aria-label="tx(screen)">
                <VListItem v-for="row in visibleRows" :key="row.id" :title="row.title" :active="chosen === row.id" @click="chosen = row.id" />
              </VList>
              <VSelect v-if="screen === 'generation'" :items="[pair('Local Java vanilla', '本機 Java 原版')]" :label="pair('Example distribution', '範例發行套件')" variant="outlined" />
              <VAlert v-if="screen === 'bots'" type="info" variant="tonal">{{ pair('Mineflayer 26.3 is unavailable without verified adapter support. Baritone compatibility is checked independently.', 'Mineflayer 26.3 需要已驗證的配接器支援。Baritone 相容性須獨立檢查。') }}</VAlert>
            </template>
          </VCardText>
          <VDivider />
          <VCardActions class="reference-actions">
            <VBtn color="primary" variant="flat" @click="sampleAction">{{ tx('simulate') }}</VBtn>
            <VBtn variant="text" @click="reset">{{ tx('reset') }}</VBtn>
          </VCardActions>
        </VCard>
      </VCol>
      <VCol cols="12" :md="screen === 'map' ? 8 : 4">
        <VCard variant="tonal">
          <VCardTitle class="reference-title">{{ screen === 'map' ? tx('map') : tx('review') }}</VCardTitle>
          <VCardText>{{ screen === 'map' ? tx('mapNotice') : statusText }}</VCardText>
          <VCardText v-if="chosen">{{ rows.find(row => row.id === chosen)?.title }}</VCardText>
          <VCardText v-if="notice" role="status" aria-live="polite">{{ notice }}</VCardText>
        </VCard>
      </VCol>
    </VRow>
    <VDialog v-model="helpOpen" max-width="560">
      <VCard>
        <VCardTitle class="reference-title">{{ tx('help') }}</VCardTitle>
        <VCardText>{{ tx('sample') }}</VCardText>
        <VCardText>{{ pair('Choose a sample record, try the sample action and inspect the result. Reset restores this example without touching a project.', '選擇範例記錄，試用範例操作，再檢視結果。重設只會還原範例，不會修改專案。') }}</VCardText>
        <VCardActions class="reference-actions"><VBtn @click="helpOpen = false">{{ tx('close') }}</VBtn></VCardActions>
      </VCard>
    </VDialog>
  </VContainer>
</template>

<style scoped>
.workflow-reference { max-width: 1600px; }
.reference-title { white-space: normal; overflow-wrap: anywhere; }
.reference-actions { flex-wrap: wrap; gap: 8px; }
.reference-actions :deep(.v-btn) { height: auto; min-height: 44px; white-space: normal; }
.reference-actions :deep(.v-btn__content) { white-space: normal; overflow-wrap: anywhere; }
.reference-toolbar :deep(.v-toolbar-title) { min-width: 0; }
@media (prefers-reduced-motion: reduce) { .workflow-reference :deep(*) { animation: none !important; transition: none !important; } }
:deep(.v-btn__content), :deep(.v-label), :deep(.v-card-title), :deep(.v-toolbar-title__placeholder), :deep(.v-chip__content), :deep(.v-list-item-title), :deep(.v-list-item-subtitle), :deep(.v-alert__content), :deep(.v-card-text) { white-space: pre-line; }
</style>


