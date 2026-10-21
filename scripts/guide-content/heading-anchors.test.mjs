import test from 'node:test';
import assert from 'node:assert/strict';
import {headingSlug,headingText,uniqueHeadingId,headingAliases} from './heading-anchors.mjs';
test('preserves each ASCII space around removed punctuation',()=>{
 assert.equal(headingSlug('selftest.mjs \u2014 proving the check can fail'),'selftestmjs--proving-the-check-can-fail');
 assert.equal(headingSlug('  Two   spaces  '),'two---spaces');
 assert.equal(headingSlug('A\tB'),'ab');
});
test('retains Unicode letters, combining marks and literal code underscores',()=>{
 assert.equal(headingSlug('中文 Café Cafe\u0301 Θ'),'中文-café-cafe\u0301-θ');
 const plain=headingText([{type:'codespan',text:'my_file.mjs'},{type:'text',text:' and '},{type:'em',tokens:[{type:'text',text:'words'}]}]);
 assert.equal(plain,'my_file.mjs and words');assert.equal(headingSlug(plain),'my_filemjs-and-words');
});
test('allocates unique punctuation and suffix collisions without shadowing real IDs',()=>{
 const used=new Set();assert.deepEqual(['A','A','A-1','A!'].map(text=>uniqueHeadingId(headingSlug(text),used)),['a','a-1','a-1-1','a-2']);
 assert.deepEqual(headingAliases([{id:'a--b',legacyId:'a-b'},{id:'a-b',legacyId:'a-b-1'}],['a--b','a-b']),{'a-b-1':'a-b'});
});
