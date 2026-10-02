import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCheapClient, nativeClientPoint } from '../.claude/skills/run-worldlens/cheap-client.mjs';

test('native clicks use physical client coordinates at every supported display scale', () => {
  const box={x:0,y:100,width:80,height:60};
  for (const ratio of [1,1.25,1.5,2]) assert.deepEqual(nativeClientPoint(box,ratio),{x:Math.round(40*ratio),y:Math.round(130*ratio)});
  assert.throws(()=>nativeClientPoint(box,NaN));
  assert.throws(()=>nativeClientPoint({...box,width:0},1));
});

test('cheap driver sends structured arguments without a shell and hides the process', async () => {
  let request;
  const call=createCheapClient('owned-tool.exe',async (...args)=>{request=args;return {stdout:'{"ok":true,"value":42}'};});
  const params={hwnd:12,text:'C:/Temp/name & value'};
  assert.equal((await call('type_text',params)).value,42);
  assert.deepEqual(request[1],['type_text','--json',JSON.stringify(params)]);
  assert.equal(request[2].windowsHide,true);
  assert.equal(request[2].shell,undefined);
  assert.equal(request[2].timeout,60000);
});
test('driver refuses visible-screen fallback and general command execution before launch', async () => {
  let launched=false;
  const call=createCheapClient('owned-tool.exe',async()=>{launched=true;return {stdout:'{}'};});
  await assert.rejects(call('screenshot',{monitor:1}),/window handle/);
  await assert.rejects(call('run_command',{command:'anything'}),/scope/);
  await assert.rejects(call('list_headless_windows',{}),/named hidden desktop/);
  assert.equal(launched,false);
});
test('non-JSON and false tool verdicts cannot become successful UI evidence', async () => {
  for(const stdout of ['not JSON','{"ok":false}','{}']) {
    await assert.rejects(createCheapClient('owned-tool.exe',async()=>({stdout}))('screenshot',{hwnd:1}));
  }
});
