import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {deflateSync} from 'node:zlib';
import {describe,it,expect} from 'vitest';import {validateConvertedPayload} from './outputValidation.js';
describe('converted payload adoption',()=>{
    it.each(['JAVA_1_21_4','BEDROCK_1_21_40'])('rejects a level.dat-only %s directory',async format=>{
        const dir=await mkdtemp(join(tmpdir(),'chunker-output-'));try{await writeFile(join(dir,'level.dat'),'metadata');await expect(validateConvertedPayload(dir,format)).rejects.toThrow(/terrain|LevelDB/);}finally{await rm(dir,{recursive:true,force:true});}
    });
    it('accepts an Anvil location table pointing to a bounded compressed NBT chunk',async()=>{
        const dir=await mkdtemp(join(tmpdir(),'chunker-output-'));try{
            await mkdir(join(dir,'region'));await writeFile(join(dir,'level.dat'),'metadata');
            const data=deflateSync(Buffer.from([10,0,0,0])),region=Buffer.alloc(12288);region.writeUInt32BE(513,0);region.writeUInt32BE(data.length+1,8192);region[8196]=2;data.copy(region,8197);await writeFile(join(dir,'region','r.0.0.mca'),region);
            await expect(validateConvertedPayload(dir,'JAVA_1_21_4')).resolves.toBeUndefined();
            region.writeUInt32BE(0xffffff01,0);await writeFile(join(dir,'region','r.0.0.mca'),region);await expect(validateConvertedPayload(dir,'JAVA_1_21_4')).rejects.toThrow(/invalid structure/);
        }finally{await rm(dir,{recursive:true,force:true});}
    });
    it('requires CURRENT, its manifest and a readable LevelDB data structure',async()=>{
        const dir=await mkdtemp(join(tmpdir(),'chunker-output-'));try{
            await mkdir(join(dir,'db'));await writeFile(join(dir,'level.dat'),'metadata');await writeFile(join(dir,'db','CURRENT'),'MANIFEST-000001\n');await writeFile(join(dir,'db','MANIFEST-000001'),Buffer.from([1]));
            await writeFile(join(dir,'db','000002.ldb'),Buffer.alloc(48));await expect(validateConvertedPayload(dir,'BEDROCK_1_21_40')).rejects.toThrow(/LevelDB/);
            const table=Buffer.alloc(48);Buffer.from('57fb808b247547db','hex').copy(table,40);await writeFile(join(dir,'db','000002.ldb'),table);await expect(validateConvertedPayload(dir,'BEDROCK_1_21_40')).resolves.toBeUndefined();
        }finally{await rm(dir,{recursive:true,force:true});}
    });
});
