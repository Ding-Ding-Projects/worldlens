/**
 * Isolated source-CSS regression fixture, NOT a packaged application capture.
 * Uses the real rail CSS, sizing function and overflow function with small explicit DOM
 * fixtures. Vue/Vuetify integration and Windows scaling still require the packaged app.
 *
 * Node >=22.13, plus Chrome/Chromium selected with CHROMIUM_PATH:
 * node --experimental-strip-types scripts/rail-layout-proof.mjs --report rail-proof.json
 * --source-root <checkout> can test an earlier checkout with this same fixture.
 * No network pages, user profiles, production servers or screenshot inventory are touched.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const argument = (name) => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} needs a value`);
    return args[index + 1];
};
const root = resolve(argument("--source-root") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const reportPath = argument("--report");
const sourcePath = "design/packages/ui/src/components/shell/AppRail.vue";
const overflowPath = "design/packages/ui/src/components/shell/railOverflow.ts";
const focusPath = "design/packages/ui/src/components/shell/railMenuFocus.ts";
const source = readFileSync(join(root, sourcePath), "utf8");
const overflow = await import(pathToFileURL(join(root, overflowPath)).href);
const focus = existsSync(join(root, focusPath)) ? await import(pathToFileURL(join(root, focusPath)).href) : null;
const css = source.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1]
    .replace(/:global\((.*)\)/g, "$1").replace(/:deep\(([^)]*)\)/g, "$1");
assert.ok(css, "rail scoped styles are required");
const measureStart = source.indexOf("function measureRail(): void {");
const measureEnd = source.indexOf("\nonMounted(", measureStart);
assert.ok(measureStart >= 0 && measureEnd > measureStart, "the real measurement function must be found");
const measureCode = stripTypeScriptTypes(source.slice(measureStart, measureEnd), { mode: "strip" });
const listAttributes = [...source.matchAll(/<ul((?:[^">]|"[^"]*")*)>/g)]
    .map((match) => match[1]).find((value) => value.includes("wl-rail__shortcuts"));
const listCondition = listAttributes?.match(/v-if="([^"]+)"/)?.[1];
assert.ok(listCondition, "the real template condition must be found");
const blobHash = (path) => {
    const bytes = readFileSync(join(root, path));
    return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
};
const executable = process.env.CHROMIUM_PATH ?? process.env.CHROME_PATH ??
    ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
if (!executable) throw new Error("Set CHROMIUM_PATH to an installed Chrome or Chromium executable.");
const profile = mkdtempSync(join(tmpdir(), "worldlens-rail-proof-"));
const browser = spawn(executable, ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let launchError;
browser.on("error", (error) => { launchError = error; });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
let sequence = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
}
const report = { evidenceClass: "isolated-source-css-fixture", packagedApplicationVerified: false,
    sourceBlobs: { [sourcePath]: blobHash(sourcePath), [overflowPath]: blobHash(overflowPath) },
    cases: [], focus: [] };
if (focus) report.sourceBlobs[focusPath] = blobHash(focusPath);
try {
    const portFile = join(profile, "DevToolsActivePort");
    for (let attempt = 0; !existsSync(portFile) && attempt < 100; attempt++) {
        if (launchError) throw launchError;
        if (browser.exitCode !== null) throw new Error(`Chromium exited ${browser.exitCode} before startup`);
        await sleep(50);
    }
    if (!existsSync(portFile)) throw new Error("Chromium did not expose its task-owned debugging endpoint");
    const [port, endpoint] = readFileSync(portFile, "utf8").trim().split(/\r?\n/);
    socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
    });
    socket.addEventListener("message", (event) => {
        const response = JSON.parse(String(event.data));
        const request = pending.get(response.id);
        if (!request) return;
        pending.delete(response.id); clearTimeout(request.timer);
        if (response.error) request.reject(new Error(JSON.stringify(response.error)));
        else request.resolve(response.result);
    });
    report.browser = (await send("Browser.getVersion")).product;
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Network.enable", {}, sessionId);
    await send("Network.setBlockedURLs", { urls: ["http://*", "https://*", "file://*", "ws://*", "wss://*"] }, sessionId);
    const evaluate = async (expression) => {
        const value = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
        return value.result.value;
    };
    const labels = {
        english: ["Home", "Map", "Host Server", "Work"],
        cantonese: ["首頁", "地圖", "伺服器", "工作"],
        bilingual: ["Home 首頁", "Map 地圖", "Host Server 伺服器", "Work 工作"],
        extended: ["My personal home", "Maps and worlds", "Server administration", "Running work"],
    };
    for (const [width, height] of [[1280, 800], [1280, 600], [800, 480], [800, 320], [640, 240], [400, 320]]) {
        for (const mode of Object.keys(labels)) {
            for (const scale of [1, 2]) {
                for (const direction of ["ltr", "rtl"]) {
                    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false }, sessionId);
                    const html = `<!doctype html><html dir="${direction}"><head><meta charset="utf-8"><style>
                        *{box-sizing:border-box}html,body{margin:0;height:100%;font:16px Arial,sans-serif}
                        body{display:flex;flex-direction:column;overflow:hidden;--v-theme-surface:255,255,255;
                        --v-theme-on-surface:20,20,20;--v-theme-on-surface-variant:45,45,45;--v-theme-outline-variant:120,120,120}
                        header,.fixture-status{height:32px;flex:0 0 32px}.mb-shell-body{display:flex;flex:1;min-height:0}
                        main{min-width:0;flex:1}.v-icon{display:inline-flex;align-items:center;justify-content:center;flex:none}
                        .mb-world-host--beside-rail{position:fixed;inset-inline-start:80px;pointer-events:none}
                        .fixture-search{width:100%;min-width:0;min-height:44px;flex:0 0 44px}
                        ${css}</style></head><body><header>Isolated rail CSS fixture, not the application</header>
                        <div class="mb-shell-body"></div><div class="fixture-status"></div>
                        <div class="mb-world-host--beside-rail"></div></body></html>`;
                    await evaluate(`document.open();document.write(${JSON.stringify(html)});document.close();`);
                    const data = { labels: labels[mode], longShortcuts: mode === "extended", more: mode === "english" || mode === "extended" ? "More" : "More 更多" };
                    const result = await evaluate(`(() => {
                        const data=${JSON.stringify(data)};
                        const jobs=Array.from({length:7},(_,i)=>({id:'job-'+i,shortLabel:['Actions','Docker','SSH','Convert','Backups','Servers','Download'][i]}));
                        if(data.longShortcuts)jobs[0].shortLabel='Locally configured rendering and validation tasks';
                        const props={jobShortcuts:jobs};
                        const ref=value=>({value});
                        const railEl=ref(null),destinationsEl=ref(null),footerEl=ref(null),shortcutsEl=ref(null),moreButtonRef=ref(null);
                        const measuredAvailable=ref(null),measuredDestinations=ref(null),measuredFooter=ref(null);
                        const RAIL_SHORTCUT_ITEM_PX=${overflow.RAIL_SHORTCUT_ITEM_PX};
                        const RAIL_MORE_BUTTON_PX=${overflow.RAIL_MORE_BUTTON_PX};
                        const RAIL_SHORTCUTS_DIVIDER_PX=${overflow.RAIL_SHORTCUTS_DIVIDER_PX};
                        const measuredShortcutItem=ref(RAIL_SHORTCUT_ITEM_PX),measuredMoreButton=ref(RAIL_MORE_BUTTON_PX);
                        const computeRailShortcutSplit=${overflow.computeRailShortcutSplit.toString()};
                        const RAIL_COMPACT_MAX_BLOCK_SIZE=${overflow.RAIL_COMPACT_MAX_BLOCK_SIZE ?? 0};
                        const isCompactRail=${overflow.isCompactRail?.toString() ?? "()=>false"};
                        const showList=(visibleShortcuts,shortcutSplit)=>(${listCondition});
                        ${measureCode}
                        const icon=size=>'<span class="v-icon" style="width:'+size+'px;height:'+size+'px" aria-hidden="true">◇</span>';
                        let split={visibleCount:7,overflowCount:0,showMore:false},compact=false;
                        function render(){
                            const visible=jobs.slice(0,split.visibleCount);
                            document.querySelector('.mb-shell-body').innerHTML='<nav class="wl-rail'+(compact?' wl-rail--short':'')+'">'+
                                '<ul class="wl-rail__items wl-rail__destinations">'+data.labels.map((label,i)=>'<li><button type="button" data-destination="'+i+'" class="wl-rail-item'+(i===0?' wl-rail-item--active':'')+'"><span class="wl-rail-pill">'+icon(22)+'</span><span class="wl-rail-label">'+label+'</span></button></li>').join('')+'</ul>'+
                                (showList(visible,split)?'<ul class="wl-rail__items wl-rail__shortcuts">'+visible.map(job=>'<li><button class="wl-rail-item wl-rail-item--compact" data-job-shortcut="'+job.id+'"><span class="wl-rail-pill">'+icon(18)+'</span><span class="wl-rail-label wl-rail-label--compact">'+job.shortLabel+'</span></button></li>').join('')+
                                (split.showMore?'<li><button id="more" data-rail-more class="wl-rail-item wl-rail-item--compact"><span class="wl-rail-pill">'+icon(18)+'</span><span class="wl-rail-label wl-rail-label--compact">'+data.more+'</span></button></li>':'')+'</ul>':'')+
                                '<div class="wl-rail__footer">'+['Search','Notifications','Settings'].map(label=>'<button class="wl-rail-action" aria-label="'+label+'">'+icon(22)+'</button>').join('')+'</div></nav><main><input id="outside" aria-label="Outside input"></main>';
                            railEl.value=document.querySelector('.wl-rail');destinationsEl.value=document.querySelector('.wl-rail__destinations');
                            footerEl.value=document.querySelector('.wl-rail__footer');shortcutsEl.value=document.querySelector('.wl-rail__shortcuts');moreButtonRef.value=document.querySelector('[data-rail-more]');
                        }
                        for(let i=0;i<10;i++){
                            render();measureRail();
                            compact=isCompactRail(measuredAvailable.value);
                            const next=compact?{visibleCount:0,overflowCount:jobs.length,showMore:true}:computeRailShortcutSplit({availableBlockSize:measuredAvailable.value,destinationsBlockSize:measuredDestinations.value,footerBlockSize:measuredFooter.value,shortcutItemBlockSize:measuredShortcutItem.value,moreButtonBlockSize:measuredMoreButton.value,shortcutCount:jobs.length});
                            if(JSON.stringify(next)===JSON.stringify(split)&&railEl.value.classList.contains('wl-rail--short')===compact)break;
                            split=next;
                        }
                        render();
                        const failures=[];const rail=railEl.value;
                        const within=(child,parent)=>{const a=child.getBoundingClientRect(),b=parent.getBoundingClientRect();return a.top>=b.top-1&&a.bottom<=b.bottom+1&&a.left>=b.left-1&&a.right<=b.right+1;};
                        if(split.showMore&&!moreButtonRef.value)failures.push('More absent with overflow');
                        const utilities=[...footerEl.value.children,...(moreButtonRef.value?[moreButtonRef.value]:[])];
                        for(const node of utilities){if(!within(node,rail))failures.push('utility outside rail');const r=node.getBoundingClientRect();if(r.width<43.9||r.height<43.9)failures.push('utility target below 44px');}
                        for(const node of destinationsEl.value.querySelectorAll('button')){
                            node.scrollIntoView({block:'nearest',inline:'nearest'});
                            if(!within(node,destinationsEl.value)||!within(node,rail))failures.push('destination cannot be revealed');
                            for(const utility of utilities)if(!within(utility,rail))failures.push('revealing destination hides utility');
                        }
                        for(const label of rail.querySelectorAll('.wl-rail-label'))if(label.scrollHeight>label.clientHeight+1||label.scrollWidth>label.clientWidth+1)failures.push('label content truncated');
                        const inset=parseFloat(getComputedStyle(document.querySelector('.mb-world-host--beside-rail')).insetInlineStart);
                        if(Math.abs(inset-rail.getBoundingClientRect().width)>1)failures.push('detached overlay inset mismatch');
                        const menu=document.createElement('div');menu.className='wl-rail-more-menu';menu.style.cssText='position:fixed;top:8px;left:8px';
                        menu.innerHTML='<input class="fixture-search" aria-label="Filter"><ul class="wl-rail-more-menu__list">'+Array.from({length:8},(_,i)=>'<li><button class="wl-rail-more-menu__item">'+icon(20)+'<span>'+('UnbrokenLocalizedShortcut'+i).repeat(8)+'</span></button></li>').join('')+'</ul>';
                        document.body.append(menu);const rect=menu.getBoundingClientRect();
                        if(rect.right>innerWidth||rect.bottom>innerHeight||menu.scrollWidth>menu.clientWidth+1)failures.push('menu exceeds viewport or clips long text horizontally');
                        const list=menu.querySelector('ul');list.scrollTop=list.scrollHeight;
                        if(list.scrollTop===0&&list.scrollHeight>list.clientHeight+1)failures.push('menu list cannot scroll');
                        menu.remove();return {compact,railHeight:rail.clientHeight,visibleCount:split.visibleCount,failures:[...new Set(failures)]};
                    })()`);
                    report.cases.push({ width, height, deviceScaleFactor: scale, direction, mode, ...result });
                }
            }
        }
    }
    if (focus) {
        report.focus = await evaluate(`(() => {
            const restore=${focus.restoreRailMenuFocus.toString()};const results=[];
            for(const scenario of ['menu-removed','outside-before','outside-after','target-removed','menu-still-mounted']){
                document.body.innerHTML='<button id="target">More</button><input id="outside"><div id="menu"><input id="inside"></div>';
                const target=document.getElementById('target'),outside=document.getElementById('outside'),menu=document.getElementById('menu'),inside=document.getElementById('inside');
                inside.focus();if(scenario==='outside-before')outside.focus();const active=document.activeElement;
                if(scenario!=='menu-still-mounted')menu.remove();
                if(scenario==='outside-after')outside.focus();if(scenario==='target-removed')target.remove();
                restore(menu,target,active);const expected=scenario.startsWith('outside')?'outside':scenario==='target-removed'?'':'target';
                results.push({scenario,passed:document.activeElement.id===expected});
            }return results;
        })()`);
    }
    const failed = report.cases.filter((value) => value.failures.length > 0);
    const failedFocus = report.focus.filter((value) => !value.passed);
    report.summary = { geometryCases: report.cases.length, passedGeometryCases: report.cases.length - failed.length,
        focusCases: report.focus.length, passedFocusCases: report.focus.length - failedFocus.length };
    if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report.summary));
    for (const failure of failed.slice(0, 8)) console.error(JSON.stringify(failure));
    for (const failure of failedFocus) console.error(JSON.stringify(failure));
    if (failed.length || failedFocus.length) process.exitCode = 1;
} finally {
    if (socket?.readyState === WebSocket.OPEN) await send("Browser.close").catch(() => {});
    socket?.close();
    for (const request of pending.values()) clearTimeout(request.timer);
    if (browser.exitCode === null) browser.kill();
    for (let attempt = 0; browser.exitCode === null && attempt < 40; attempt++) await sleep(50);
    if (browser.exitCode === null) browser.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
}
