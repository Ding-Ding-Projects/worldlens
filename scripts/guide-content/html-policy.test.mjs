import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlState, inspectHtml } from './html-policy.mjs';

test('balances inline fragments across one article and extracts explicit ids', () => {
    const state=htmlState();
    assert.deepEqual(inspectHtml('<details open id="section"><summary><b>Title</b></summary>',state),{ok:true,links:[],anchors:['section']});
    assert.equal(inspectHtml('<kbd>',state).ok,true);
    assert.equal(inspectHtml('</kbd></details>',state).ok,true);
    assert.equal(state.stack.length,0);
});
for(const [name,source] of [
    ['duplicate id','<p id="same"></p><span id="same"></span>'],
    ['duplicate attribute','<p title="one" title="two"></p>'],
    ['mismatched container','<details><summary>Title</details></summary>'],
    ['excessive nesting','<b>'.repeat(65)],
    ['oversized tag','<p title="'+'x'.repeat(4096)+'"></p>'],
    ['missing image alternative','<img src="image.png">'],
]) test('rejects '+name,()=>assert.equal(inspectHtml(source,htmlState()).ok,false));
