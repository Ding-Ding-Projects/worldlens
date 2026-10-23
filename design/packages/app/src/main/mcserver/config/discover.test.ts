import { describe, expect, it, vi } from 'vitest';
import type { ServerTransport } from '../transport/types.js';
import { discoverConfigFiles } from './discover.js';
const file=(name:string,kind:'directory'|'file'|'symlink'='file')=>({name,kind,size:null,modifiedAt:null});
describe('configuration discovery',()=>{
    it('finds nested plugin and mod configs without following links',async()=>{
        const listing:Record<string,ReturnType<typeof file>[]>={'.':[file('server.properties'),file('plugins','directory'),file('outside','symlink')],plugins:[file('Example','directory')],'plugins/Example':[file('nested','directory'),file('config.yml')],'plugins/Example/nested':[file('rules.json')]};
        const transport={fileList:vi.fn(async(path:string)=>({ok:true as const,value:listing[path]??[]}))} as unknown as ServerTransport;
        const result=await discoverConfigFiles(transport);
        expect(result.ok&&result.value.files).toEqual(['plugins/Example/config.yml','plugins/Example/nested/rules.json','server.properties']);
        expect(transport.fileList).not.toHaveBeenCalledWith('outside');
    });
    it('reports truncation and rejects escaped roots',async()=>{
        const transport={fileList:vi.fn(async()=>({ok:true as const,value:[file('nested','directory')]}))} as unknown as ServerTransport;
        const result=await discoverConfigFiles(transport,['.'],{depth:0,entries:2});
        expect(result.ok&&result.value.truncated).toBe(true);
        expect((await discoverConfigFiles(transport,['../outside'])).ok).toBe(false);
    });
});
