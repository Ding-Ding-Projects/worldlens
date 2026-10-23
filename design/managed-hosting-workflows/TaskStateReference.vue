<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { VAlert, VBtn, VCard, VCardActions, VCardText, VCardTitle, VChip, VDataTable, VDivider, VList, VListItem, VProgressLinear, VSelect, VSwitch, VTextField } from 'vuetify/components';
const props = defineProps<{ screen: 'generation' | 'configuration' | 'map' | 'hosting' | 'access' | 'renders' | 'bots'; state: string; language: 'en' | 'yue' | 'bilingual' }>();
const stage = ref(props.state);
const result = ref('');
const seed = ref('9223372036854775807');
const name = ref('Example operator');
const operatorLevel = ref(2);
const bypassLimit = ref(false);
const pointX = ref(12); const pointY = ref(64); const pointZ = ref(-8);
const dimension = ref('minecraft:overworld');
const selectedFile = ref('ops.json');
const target = ref('native');
const command = ref('list');
const attempt = ref('example-attempt-02');
const observedAttempt = ref('example-attempt-02');

const draftRevision = ref(7);
const latestRevision = ref(8);
const vertices = ref<Array<{x:number;y:number;z:number}>>([]);
const cancelled = ref(false);
const sampleName = ref('Example administrator');
const requireSignIn = ref(true);
const botProfile = ref('mineflayer');
const receipts = ref({ built: false, saved: false, signedIn: false, uploaded: false, verified: false });
function loadReceipts(state: string): void {
  receipts.value = { built: ['built','saved','signed-in','upload-review','uploaded','verified'].includes(state), saved: ['saved','signed-in','upload-review','uploaded','verified'].includes(state), signedIn: ['signed-in','upload-review','uploaded','verified'].includes(state), uploaded: ['uploaded','verified'].includes(state), verified: state === 'verified' };
}
loadReceipts(props.state);
function chooseState(state: string): void { stage.value = state; result.value = ''; loadReceipts(state); }
const accessRanks: Record<string, number> = {prepared:1,provisioned:2,verified:3};
const accessRank = computed(() => accessRanks[stage.value] ?? 0);
watch(() => [props.screen, props.state], () => { stage.value = props.state; result.value = ''; cancelled.value = false; vertices.value = []; sampleName.value = 'Example administrator'; requireSignIn.value = true; loadReceipts(props.state); });
function tr(en: string, yue: string): string { return props.language === 'yue' ? yue : props.language === 'bilingual' ? `${en}
${yue}` : en; }
const stages = computed(() => ({
  generation: ['ready','review','pending','reconnecting','late-exit','stdin-fallback','project-persistence-failed','canceled','retained'],
  configuration: ['ready','conflict','compare','pending','offline','error','saved'],
  map: ['ready','partial','blank','drawing','conflict','offline','saved'],
  hosting: ['ready','built','saved','signed-in','upload-review','uploaded','verified','error','canceled'],
  access: ['ready','prepared','provisioned','verified','error','canceled'],
  renders: ['empty','partial','engine-finished','verifying','retained','verification-failed'],
  bots: ['ready','incompatible','deploying','connected','navigating','offline','stopped'],
}[props.screen]));
const stageNames: Record<string,[string,string]> = {
  prepared:['Prepared locally','本機已準備'],provisioned:['Provisioned on destination','目的地已建立'],'engine-finished':['Engine finished','引擎已完成'],verifying:['Verifying output','正在驗證輸出'],'verification-failed':['Verification failed','驗證失敗'],empty:['No render records','沒有渲染記錄'],incompatible:['Version incompatible','版本不相容'],deploying:['Deploying bot','正在部署機械人'],connected:['Bot connected','機械人已連線'],navigating:['Bot navigating','機械人正在導航'],stopped:['Bot stopped','機械人已停止'],ready:['Ready','準備就緒'],review:['Review generation','檢視產生設定'],pending:['Operation in progress','操作進行中'],reconnecting:['Reconnecting observation','正在重新連線'], 'late-exit':['Late exit received','收到較舊啟動的結束事件'], 'stdin-fallback':['Local console available','本機主控台可用'], 'project-persistence-failed':['World saved; project not saved','世界已儲存，專案尚未儲存'],canceled:['Canceled; output preserved','已取消，保留輸出'],retained:['World and project read back','已讀回世界及專案'],conflict:['Newer revision exists','已有較新版本'],compare:['Compare draft and latest','比較草稿及最新版本'],offline:['Observation unavailable','無法觀察狀態'],error:['Operation failed','操作失敗'],saved:['Saved','已儲存'],partial:['Partial live preview','即時部分預覽'],blank:['Terrain unavailable','地形無法顯示'],drawing:['Drawing draft','繪圖草稿'],built:['Image built','映像已建立'],'signed-in':['Registry sign-in completed','已登入映像登錄服務'],'upload-review':['Review upload','檢視上載'],uploaded:['Upload receipt received','已收到上載憑證'],verified:['Deployment checked','已檢查部署'],
};
function stageLabel(id: string): string { if (props.screen === 'access' && id === 'verified') return tr('Sign-in verified','已驗證登入'); if (props.screen === 'renders' && id === 'retained') return tr('Verified retained render','已驗證保留的渲染'); const p = stageNames[id]; return p ? tr(p[0],p[1]) : id; }
function advance(next: string, en: string, yue: string): void { stage.value = next; if (next === 'built') receipts.value.built = true; if (next === 'saved' && props.screen === 'hosting') receipts.value.saved = true; if (next === 'signed-in') receipts.value.signedIn = true; if (next === 'uploaded') receipts.value.uploaded = true; if (next === 'verified' && props.screen === 'hosting') receipts.value.verified = true; result.value = tr(`Example only: ${en}`, `僅限範例：${yue}`); }
function cancel(): void { cancelled.value = true; advance('canceled','Cancellation acknowledged; completed effects remain listed.','已確認取消，已完成的影響仍會列出。'); }
function reset(): void { stage.value = props.state; result.value = ''; vertices.value = []; cancelled.value = false; sampleName.value = 'Example administrator'; requireSignIn.value = true; botProfile.value = 'mineflayer'; loadReceipts(props.state); }
function addVertex(): void { vertices.value.push({x:Number(pointX.value),y:Number(pointY.value),z:Number(pointZ.value)}); }
const recordHeaders = computed(() => [{ title:tr('Name','名稱'),key:'name' },{ title:tr('Operator level','管理權限等級'),key:'level' },{ title:tr('Bypass player limit','略過玩家人數限制'),key:'bypass' }]);
const vertexHeaders = computed(() => [{title:'X',key:'x'},{title:'Y',key:'y'},{title:'Z',key:'z'}]);
const busy = computed(() => stage.value === 'pending');
</script>
<template>
  <VCard variant="outlined">
    <VCardTitle class="wrap">{{ tr('Task state reference','工作狀態參考') }}</VCardTitle>
    <VCardText>
      <VSelect :model-value="stage" :items="stages.map(id=>({value:id,title:stageLabel(id)}))" :label="tr('Choose an example state','選擇範例狀態')" variant="outlined" @update:model-value="chooseState($event)" />
      <VChip class="mb-3" variant="tonal">{{ stageLabel(stage) }}</VChip>
      <VAlert v-if="stage==='error'" type="error" variant="tonal">{{ tr('Example operation failed. The draft and completed effects remain available; review before retry.','範例操作失敗，保留草稿及已完成的影響，請檢視後再重試。') }}</VAlert>
      <VProgressLinear v-if="busy && screen==='configuration'" :model-value="35" :aria-label="tr('Example apply progress','範例套用進度')" />
      <VAlert v-if="!stages.includes(stage)" type="warning" variant="tonal">{{ tr('This state has no detailed fixture. No successful outcome is implied.','此狀態沒有詳細範例，並不表示操作成功。') }}</VAlert>
      <template v-if="screen === 'generation'">
        <template v-if="stage === 'ready' || stage === 'review'">
          <VSelect :model-value="'local'" :items="[{value:'local',title:tr('Local Java vanilla','本機 Java 原版')}]" :label="tr('Execution target','執行目的地')" variant="outlined" />
          <VTextField v-model="seed" :label="tr('Seed, exact integer text','種子，完整整數文字')" clearable variant="outlined" />
          <VSwitch :model-value="false" :label="tr('Pregeneration, off by default','預先產生，預設關閉')" disabled />
          <VAlert v-if="stage==='review'" variant="tonal">{{ tr('Example review: owned destination, vanilla distribution, explicit license consent required. No download has started.','範例檢視：專用目的地及原版發行套件，需要明確同意授權，尚未開始下載。') }}</VAlert>
          <VBtn class="my-2" color="primary" @click="advance(stage==='ready'?'review':'pending','Generation phase selected; no server launched.','已選取產生階段，沒有啟動伺服器。')">{{ stage==='ready'?tr('Review example','檢視範例'):tr('Start example progress','開始範例進度') }}</VBtn>
        </template>
        <template v-else-if="['pending','reconnecting','late-exit','stdin-fallback'].includes(stage)">
          <VList :aria-label="tr('Shared server attempt','共用伺服器啟動記錄')">
            <VListItem :title="tr('Current attempt','目前啟動識別')" :subtitle="attempt" />
            <VListItem :title="tr('Observed event attempt','觀察事件識別')" :subtitle="stage==='late-exit'?'example-attempt-01':observedAttempt" />
            <VListItem :title="tr('Server lifecycle','伺服器生命週期')" :subtitle="tr('Running; observation is a separate state','執行中，觀察狀態獨立記錄')" />
            <VListItem :title="tr('Console transport','主控台連線')" :subtitle="stage==='stdin-fallback'?tr('Owned local stdin; RCON unavailable','專用本機 stdin，RCON 無法使用'):stage==='reconnecting'?tr('Disconnected; reconnect pending','連線中斷，等待重新連線'):tr('Connected to current attempt','已連線至目前啟動')" />
          </VList>
          <VProgressLinear v-if="stage==='pending'" :model-value="45" :aria-label="tr('Example world generation progress','範例世界產生進度')" />
          <VAlert v-if="stage==='late-exit'" variant="tonal">{{ tr('Exit from attempt 01 cannot stop attempt 02. Refresh the current attempt and reconnect its console.','啟動 01 的結束事件不可把啟動 02 標記為已停止。重新讀取目前啟動並連接主控台。') }}</VAlert>
          <VBtn v-if="stage==='reconnecting'||stage==='late-exit'" class="my-2" @click="advance('pending','Current attempt refreshed; console subscription rebound.','已重新讀取目前啟動，主控台已重新訂閱。')">{{ tr('Refresh current attempt and reconnect','重新讀取目前啟動並連線') }}</VBtn>
          <template v-if="stage==='stdin-fallback'">
            <VTextField v-model="command" :label="tr('Example local console command','範例本機主控台指令')" clearable variant="outlined" />
            <VBtn :disabled="!command.trim()" @click="result=tr('Example only: command bound to owned attempt 02. Nothing sent.','僅限範例：指令綁定專用啟動 02，沒有傳送任何內容。')">{{ tr('Preview stdin submission','預覽 stdin 傳送') }}</VBtn>
          </template>
          <VBtn class="ma-2" @click="cancel">{{ tr('Cancel example safely','安全取消範例') }}</VBtn>
        </template>
        <template v-else-if="stage==='project-persistence-failed'">
          <VAlert type="warning" variant="tonal">{{ tr('Example world inspection passed. Durable project write failed. Keep the existing world; retry only project creation.','範例世界檢查通過，專案寫入失敗。保留現有世界，只重試建立專案。') }}</VAlert>
          <VBtn class="my-2" @click="advance('retained','Project created and read back from the preserved world fixture.','已從保留的世界範例建立及讀回專案。')">{{ tr('Retry project creation example','重試建立專案範例') }}</VBtn>
        </template>
        <VAlert v-else-if="stage==='canceled'" variant="tonal">{{ tr('Safe stop requested. Saved output stays available; no rollback is claimed.','已要求安全停止，已儲存的輸出仍然保留，並不表示已復原所有變更。') }}</VAlert>
        <VAlert v-else-if="stage==='retained'" type="success" variant="tonal">{{ tr('Example world and project readback complete. The next destination is the project World workspace.','範例世界及專案讀回完成，下一步是專案的世界工作區。') }}</VAlert>
      </template>
      <template v-else-if="screen==='configuration'">
        <VSelect v-model="selectedFile" :items="['ops.json','whitelist.json','banned-players.json','banned-ips.json','server.properties']" :label="tr('Configuration file','設定檔案')" variant="outlined" />
        <VTextField v-model="name" :label="tr('Example record name','範例記錄名稱')" :disabled="busy" clearable variant="outlined" />
        <VSelect v-model="operatorLevel" :items="[1,2,3,4]" :label="tr('Operator level','管理權限等級')" :disabled="busy" variant="outlined" />
        <VSwitch v-model="bypassLimit" :label="tr('Bypass player limit','略過玩家人數限制')" :disabled="busy" />
        <VAlert v-if="selectedFile!=='ops.json'" variant="tonal">{{ tr('This detailed fixture demonstrates operator records. Other file schemas are specified in DESIGN.md; these operator controls must not serialize into another file.','此詳細範例示範管理員記錄。其他結構於 DESIGN.md 說明，這些管理員控制項不可寫入其他檔案。') }}</VAlert>
        <template v-if="stage==='conflict'||stage==='compare'">
          <VAlert type="warning" variant="tonal">{{ tr('Draft revision','草稿版本') }} {{ draftRevision }} · {{ tr('Latest revision','最新版本') }} {{ latestRevision }}</VAlert>
          <VDataTable v-if="stage==='compare'" :headers="recordHeaders" :items="[{name:tr('Latest saved record','最新已儲存記錄'),level:1,bypass:false},{name,level:operatorLevel,bypass:bypassLimit}]" hide-default-footer />
          <VBtn class="my-2" @click="advance(stage==='conflict'?'compare':'saved',stage==='conflict'?'Comparison opened; no write performed.':'Reviewed draft applied to the latest fixture revision.',stage==='conflict'?'已開啟比較，沒有寫入。':'已把檢視過的草稿套用至最新範例版本。')">{{ stage==='conflict'?tr('Compare versions','比較版本'):tr('Reapply reviewed example','重新套用已檢視的範例') }}</VBtn>
        </template>
        <VAlert v-else-if="stage==='offline'" variant="tonal">{{ tr('Draft remains editable. Applying requires reconnection and a fresh revision check.','草稿仍可編輯，套用前須重新連線及檢查版本。') }}</VAlert>
        <VAlert v-else-if="stage==='saved'" type="success" variant="tonal">{{ tr('Example typed record saved; boolean and number values retained.','範例記錄已儲存，保留布林值及數值類型。') }}</VAlert>
        <VBtn v-else class="my-2" :disabled="busy||selectedFile!=='ops.json'||!name.trim()" @click="advance('saved','Typed operator record validated and saved in the fixture.','已驗證及儲存範例管理員記錄。')">{{ tr('Apply example record','套用範例記錄') }}</VBtn>
      </template>
      <template v-else-if="screen==='map'">
        <VAlert v-if="stage==='blank'" type="warning" variant="tonal">{{ tr('Example diagnostic: map configuration loaded; terrain resource unavailable. Camera fit cannot invent missing tiles.','範例診斷：地圖設定已載入，但地形資源無法使用。調整視角不會產生缺少的地圖區塊。') }}</VAlert>
        <VAlert v-else-if="stage==='partial'" variant="tonal">{{ tr('Partial preview follows example-run-02. Engine running; verification pending; not retained.','部分預覽跟隨 example-run-02，引擎執行中，等待驗證，尚未保留。') }}</VAlert>
        <template v-if="stage==='blank'">
          <VBtn class="ma-1" @click="result=tr('Example retry requested for the missing resource; terrain remains unverified.','已要求重試範例缺少的資源，地形仍未驗證。')">{{ tr('Retry resources','重試資源') }}</VBtn>
          <VBtn class="ma-1" @click="result=tr('Example resource details opened: configuration available, tile request unavailable.','已開啟範例資源資料：設定可用，區塊請求無法使用。')">{{ tr('Show resource details','顯示資源資料') }}</VBtn>
        </template>
        <template v-else>
          <VSelect v-model="dimension" :items="['minecraft:overworld','minecraft:the_nether','minecraft:the_end']" :label="tr('Dimension','維度')" variant="outlined" />
          <VTextField v-model="pointX" type="number" label="X" variant="outlined" /><VTextField v-model="pointY" type="number" label="Y" variant="outlined" /><VTextField v-model="pointZ" type="number" label="Z" variant="outlined" />
          <VBtn class="ma-1" @click="stage='drawing';addVertex()">{{ tr('Add example vertex','新增範例頂點') }}</VBtn>
          <VBtn class="ma-1" :disabled="!vertices.length" @click="vertices.pop()">{{ tr('Undo vertex','復原頂點') }}</VBtn>
          <VDataTable :headers="vertexHeaders" :items="vertices" hide-default-footer :no-data-text="tr('No vertices selected','尚未選取頂點')" />
          <VAlert v-if="stage==='conflict'" type="warning" variant="tonal">{{ tr('Shared annotation revision changed. Your geometry draft is retained; compare before reapply.','共用標記版本已改變，保留你的幾何草稿，請先比較再重新套用。') }}</VAlert>
          <VAlert v-if="stage==='offline'" variant="tonal">{{ tr('Local geometry draft only; no shared save or automatic reconnect upload.','僅限本機幾何草稿，沒有共用儲存或重新連線後自動上載。') }}</VAlert>
          <VBtn class="my-2" :disabled="vertices.length<3||stage==='offline'||stage==='conflict'" @click="advance('saved','Example polygon validated. No hosted annotation was changed.','範例多邊形已驗證，沒有修改託管標記。')">{{ tr('Save example polygon','儲存範例多邊形') }}</VBtn>
        </template>
      </template>
      <template v-else-if="screen==='access'">
        <VTextField v-model="sampleName" :label="tr('Example administrator name','範例管理員名稱')" clearable variant="outlined" />
        <VSwitch v-model="requireSignIn" :label="tr('Require sign-in to view','需要登入才能檢視')" />
        <VAlert variant="tonal">{{ tr('This fixture collects no password. Production uses protected inputs and an opaque local reference.','此範例不會收集密碼，正式流程使用受保護輸入及不透明本機參照。') }}</VAlert>
        <VChip class="ma-1" :variant="accessRank>=1?'tonal':'outlined'">{{ tr('Prepared locally','本機已準備') }}: {{ accessRank>=1?tr('Yes','是'):tr('No','否') }}</VChip>
        <VChip class="ma-1" :variant="accessRank>=2?'tonal':'outlined'">{{ tr('Provisioned on destination','目的地已建立') }}: {{ accessRank>=2?tr('Yes','是'):tr('No','否') }}</VChip>
        <VChip class="ma-1" :variant="accessRank>=3?'tonal':'outlined'">{{ tr('Sign-in verified','已驗證登入') }}: {{ accessRank>=3?tr('Yes','是'):tr('No','否') }}</VChip>
        <VBtn v-if="accessRank===0" class="my-2" :disabled="!sampleName.trim()" @click="advance('prepared','Protected local reference prepared in fixture; no remote account exists.','範例已準備受保護本機參照，沒有遠端帳戶。')">{{ tr('Prepare example access','準備範例存取') }}</VBtn>
        <VBtn v-if="accessRank===1" class="my-2" @click="advance('provisioned','One-time bootstrap fixture completed; sign-in not yet verified.','一次性初始化範例完成，尚未驗證登入。')">{{ tr('Try destination bootstrap','試用目的地初始化') }}</VBtn>
        <VBtn v-if="accessRank===2" class="my-2" @click="advance('verified','Example sign-in verified, separately from preparation.','範例登入已驗證，與準備狀態分開。')">{{ tr('Verify example sign-in','驗證範例登入') }}</VBtn>
      </template>
      <template v-else-if="screen==='renders'">
        <VAlert v-if="stage==='empty'" variant="tonal">{{ tr('No render exists for this example project. Start a render from its World workspace.','此範例專案沒有渲染記錄，請從世界工作區開始渲染。') }}</VAlert>
        <template v-else>
          <VList>
            <VListItem :title="tr('Run identity','執行識別')" subtitle="example-run-02" />
            <VListItem :title="tr('Effective map identity','有效地圖識別')" subtitle="example_world" />
            <VListItem :title="tr('Engine','引擎')" :subtitle="stage==='partial'?tr('Running','執行中'):tr('Finished','已完成')" />
            <VListItem :title="tr('Verification','驗證')" :subtitle="stage==='retained'?tr('Passed','通過'):stage==='verification-failed'?tr('Failed; output retained for diagnosis','失敗，保留輸出供診斷'):stage==='verifying'?tr('In progress','進行中'):tr('Not completed','尚未完成')" />
            <VListItem :title="tr('Catalogue','目錄')" :subtitle="stage==='retained'?tr('Verified retained record','已驗證保留記錄'):tr('No completed record','沒有完成記錄')" />
          </VList>
          <VBtn v-if="stage==='partial'" class="ma-1" @click="result=tr('Example internal partial view selected; no completed output claimed.','已選取範例內部部分預覽，並不表示輸出已完成。')">{{ tr('Open internal live preview','開啟內部即時預覽') }}</VBtn>
          <VBtn v-if="stage==='engine-finished'||stage==='verification-failed'" class="ma-1" @click="advance('verifying','Output verification started in fixture, with strict source binding.','範例開始驗證輸出，保留嚴格來源綁定。')">{{ tr('Verify example output','驗證範例輸出') }}</VBtn>
          <VBtn v-if="stage==='verifying'" class="ma-1" @click="advance('retained','Verification fixture passed; retained record created.','驗證範例通過，已建立保留記錄。')">{{ tr('Complete verification example','完成驗證範例') }}</VBtn>
          <VBtn v-if="stage==='retained'" class="ma-1" @click="result=tr('Example internal completed map focused; external browsing stays secondary.','已聚焦範例內部完成地圖，外部瀏覽仍為次要選項。')">{{ tr('Open internal map','開啟內部地圖') }}</VBtn>
          <VAlert v-if="stage==='verification-failed'" type="warning" variant="tonal">{{ tr('Example source binding mismatch. Export and promotion remain unavailable until verification passes.','範例來源綁定不符，驗證通過前不能匯出或提升為完成記錄。') }}</VAlert>
        </template>
      </template>
      <template v-else-if="screen==='bots'">
        <VSelect v-model="botProfile" :items="[{value:'mineflayer',title:'Mineflayer + pathfinder'},{value:'baritone',title:'Baritone Java client'}]" :label="tr('Independent bot profile','獨立機械人設定檔')" variant="outlined" @update:model-value="stage='ready';result=''" />
        <VAlert v-if="stage==='incompatible'" type="warning" variant="tonal">{{ botProfile==='mineflayer'?tr('Mineflayer 26.3 is unsupported without verified adapter evidence. No deploy action is available.','Mineflayer 26.3 未有已驗證配接器證據，不提供部署操作。'):tr('This Baritone/client version pair has no verified compatibility evidence.','此 Baritone 與用戶端版本組合沒有已驗證相容性證據。') }}</VAlert>
        <VAlert v-else-if="stage==='offline'" variant="tonal">{{ tr('Observation lost. Last observed bot state is retained; stopped is not inferred.','失去觀察連線，保留上次機械人狀態，不會推斷為已停止。') }}</VAlert>
        <VTextField v-if="stage==='connected'||stage==='navigating'" v-model="pointX" type="number" :label="tr('Example map-picked goal X','範例地圖選取目標 X')" variant="outlined" />
        <VBtn v-if="stage==='ready'||stage==='stopped'" class="ma-1" @click="advance('deploying','Selected profile deployment fixture started with its own compatibility result.','已開始所選設定檔部署範例，使用其獨立相容性結果。')">{{ tr('Deploy compatible example','部署相容範例') }}</VBtn>
        <VBtn v-if="stage==='deploying'||stage==='offline'" class="ma-1" @click="advance('connected','Owned bot connection fixture confirmed.','專用機械人連線範例已確認。')">{{ tr('Complete connection example','完成連線範例') }}</VBtn>
        <VBtn v-if="stage==='connected'" class="ma-1" @click="advance('navigating','Map goal applied only to the selected bot fixture.','地圖目標只套用至所選機械人範例。')">{{ tr('Navigate to example goal','前往範例目標') }}</VBtn>
        <VBtn v-if="stage==='navigating'" class="ma-1" @click="advance('connected','Navigation canceled; bot remains connected.','導航已取消，機械人保持連線。')">{{ tr('Cancel navigation example','取消導航範例') }}</VBtn>
        <VBtn v-if="stage==='connected'||stage==='navigating'" class="ma-1" @click="advance('stopped','Only the selected owned bot fixture stopped.','只停止所選專用機械人範例。')">{{ tr('Stop selected bot example','停止所選機械人範例') }}</VBtn>
      </template>
      <template v-else-if="screen==='hosting'">
        <VSelect v-model="target" :items="[{value:'native',title:tr('Native host with WSL route','原生託管及 WSL 路徑')},{value:'container',title:tr('Container host','容器託管')}]" :label="tr('Hosting format','託管格式')" variant="outlined" />
        <VList :aria-label="tr('Separate delivery receipts','獨立交付憑證')">
          <VListItem :title="tr('Build','建立')" :subtitle="receipts.built?tr('Example image available','範例映像可用'):tr('Not built','尚未建立')" />
          <VListItem :title="tr('Save archive','儲存封存檔')" :subtitle="receipts.saved?tr('Example archive receipt retained','範例封存憑證已保留'):tr('No save receipt in this state','此狀態沒有儲存憑證')" />
          <VListItem :title="tr('Registry','映像登錄服務')" subtitle="docker.io" />
          <VListItem :title="tr('Sign-in receipt','登入憑證')" :subtitle="receipts.signedIn?tr('Example signed in','範例已登入'):tr('Not signed in','尚未登入')" />
          <VListItem :title="tr('Upload receipt','上載憑證')" :subtitle="receipts.uploaded?tr('Example uploaded, deployment separate','範例已上載，部署獨立進行'):tr('Nothing uploaded','沒有上載')" />
          <VListItem :title="tr('Destination access','目的地存取')" :subtitle="receipts.verified?tr('Example provisioned and sign-in verified','範例已建立並驗證登入'):tr('Prepared locally; destination not verified','本機已準備，目的地尚未驗證')" />
        </VList>
        <VBtn v-if="stage==='ready'" class="ma-1" @click="advance('built','Image build receipt shown; no save or upload.','顯示映像建立憑證，沒有儲存或上載。')">{{ tr('Build example image','建立範例映像') }}</VBtn>
        <template v-if="receipts.built && !receipts.uploaded">
          <VBtn class="ma-1" @click="advance('saved','Archive saved in fixture; no registry operation.','範例封存檔已儲存，沒有登錄服務操作。')">{{ tr('Save example archive','儲存範例封存檔') }}</VBtn>
          <VBtn class="ma-1" @click="advance('signed-in','Device sign-in completed in fixture; nothing uploaded.','範例裝置登入完成，沒有上載。')">{{ tr('Try sign-in example','試用登入範例') }}</VBtn>
        </template>
        <VBtn v-if="receipts.signedIn && !receipts.uploaded" class="ma-1" @click="advance('upload-review','Review namespace, tag and image identity before explicit upload.','明確上載前，檢視命名空間、標籤及映像識別。')">{{ tr('Review example upload','檢視範例上載') }}</VBtn>
        <VAlert v-if="stage==='upload-review'" variant="tonal">{{ tr('Example destination: docker.io/example/world:review. This example has no publishable image or credential.','範例目的地：docker.io/example/world:review。此範例沒有可發佈映像或登入資料。') }}</VAlert>
        <VBtn v-if="stage==='upload-review'" class="ma-1" @click="advance('uploaded','Fixture upload receipt only. No network request was made.','僅有範例上載憑證，沒有網絡請求。')">{{ tr('Simulate reviewed upload','模擬已檢視上載') }}</VBtn>
        <VAlert v-if="stage==='uploaded'" type="info" variant="tonal">{{ tr('Upload and deployment are separate. A real digest readback and pull/start check remain required.','上載與部署互相獨立，仍須讀回真正摘要及檢查拉取啟動。') }}</VAlert>
        <VAlert v-if="stage==='error'||stage==='canceled'" type="warning" variant="tonal">{{ tr('Keep build/archive receipts. Inspect registry state before retry; cancellation does not prove nothing transferred.','保留建立及封存憑證，重試前檢查登錄服務狀態，取消不代表沒有傳送內容。') }}</VAlert>
        <VBtn v-if="stage==='upload-review'" class="ma-1" @click="cancel">{{ tr('Cancel example upload','取消範例上載') }}</VBtn>
      </template>
      <VAlert v-if="result" class="mt-3" variant="tonal" role="status" aria-live="polite">{{ result }}</VAlert>
    </VCardText>
    <VDivider /><VCardActions><VBtn @click="reset">{{ tr('Reset this example','重設此範例') }}</VBtn></VCardActions>
  </VCard>
</template>
<style scoped>
.wrap{white-space:normal;overflow-wrap:anywhere}
:deep(.v-btn){height:auto;min-height:44px;white-space:normal}
:deep(.v-btn__content){white-space:normal;overflow-wrap:anywhere}
:deep(.v-list-item__subtitle){white-space:normal;-webkit-line-clamp:unset}
:deep(.v-btn__content), :deep(.v-label), :deep(.v-card-title), :deep(.v-chip__content), :deep(.v-list-item-title), :deep(.v-list-item-subtitle), :deep(.v-alert__content), :deep(.v-card-text) { white-space: pre-line; }
</style>



