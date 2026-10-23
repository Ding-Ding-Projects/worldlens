import { describe, expect, it } from 'vitest';
import { parseJson, setJsonValue } from './parseJson.js';
describe('strict JSON configuration', () => {
    it('rejects YAML, comments, trailing commas and scalar roots', () => {
        for (const source of ['key: true', '{"key":true,}', '{/* x */}', 'null', '"text"', '{"x":1e400}', '{"x":9223372036854775807}']) expect(parseJson(source).ok).toBe(false);
    });
    it('describes root arrays without flattening records', () => {
        const parsed = parseJson('[{"name":"Alex","extra":{"enabled":true}}]');
        expect(parsed.ok && parsed.value.nodes[0]).toMatchObject({ path: [], value: [{ name:'Alex', extra:{ enabled:true } }] });
    });
    it('preserves unknown nested values and CRLF', () => {
        const parsed = parseJson('{"nested":{"value":1},"unknown":[null,{"x":true}]}\r\n');
        if (!parsed.ok) throw new Error('fixture');
        const edited = setJsonValue(parsed.value,['nested','value'],2,parsed.value.hash);
        if (!edited.ok) throw new Error('edit');
        expect(JSON.parse(edited.value.sourceText)).toEqual({nested:{value:2},unknown:[null,{x:true}]});
        expect(edited.value.sourceText.endsWith('\r\n')).toBe(true);
    });
    it('rejects stale and lossy edits', () => {
        const parsed = parseJson('{"x":1}');
        if (!parsed.ok) throw new Error('fixture');
        expect(setJsonValue(parsed.value,['x'],2,'stale').ok).toBe(false);
        for (const value of [undefined,NaN,Infinity,{ key:undefined },BigInt(1)]) expect(setJsonValue(parsed.value,['x'],value,parsed.value.hash).ok).toBe(false);
    });
    it('preserves prototype-named properties safely', () => {
        const parsed = parseJson('{"__proto__":{"x":1},"constructor":2}');
        if (!parsed.ok) throw new Error('fixture');
        const edited = setJsonValue(parsed.value,['__proto__','x'],3,parsed.value.hash);
        expect(edited.ok && JSON.parse(edited.value.sourceText)['__proto__'].x).toBe(3);
        expect(({} as Record<string,unknown>)['x']).toBeUndefined();
    });
});
