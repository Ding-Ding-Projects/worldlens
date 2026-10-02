/** Validate real terrain structures before adopting a converted directory. */
import {lstat,open,opendir,readFile} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {gunzipSync,inflateSync} from 'node:zlib';
const tableMagic=Buffer.from('57fb808b247547db','hex');
async function terrainRegion(path:string):Promise<boolean>{
    const file=await open(path,'r');try{
        const size=(await file.stat()).size;if(size<12288||size%4096!==0)return false;
        const header=Buffer.alloc(4096);await file.read(header,0,4096,0);
        let found=false;
        for(let index=0;index<1024;index++){
            const position=header.readUInt32BE(index*4);if(!position)continue;
            const sector=position>>>8,count=position&255;
            if(sector<2||!count||(sector+count)*4096>size)return false;
            const prefix=Buffer.alloc(5);await file.read(prefix,0,5,sector*4096);
            const length=prefix.readUInt32BE(0);if(length<2||length>count*4096-4)return false;
            const content=Buffer.alloc(length-1);await file.read(content,0,content.length,sector*4096+5);
            let nbt:Buffer;try{nbt=prefix[4]===1?gunzipSync(content,{maxOutputLength:16*1024*1024}):prefix[4]===2?inflateSync(content,{maxOutputLength:16*1024*1024}):prefix[4]===3?content:Buffer.alloc(0);}catch{return false;}
            if(nbt.length<4||nbt[0]!==10)return false;found=true;
        }return found;
    }finally{await file.close();}
}
async function readableDatabase(directory:string):Promise<boolean>{
    const current=(await readFile(join(directory,'CURRENT'),'utf8')).trim();
    if(!/^MANIFEST-[0-9]+$/.test(current)||(await lstat(join(directory,current))).size===0)return false;
    const entries=await opendir(directory);
    for await(const entry of entries){
        if(!entry.isFile()||! /^[0-9]+\.(ldb|sst|log)$/.test(entry.name))continue;
        const file=await open(join(directory,entry.name),'r');try{
            const size=(await file.stat()).size;
            if(entry.name.endsWith('.log')){
                if(size<8)continue;const header=Buffer.alloc(7);await file.read(header,0,7,0);
                if((header[6]??0)>=1&&(header[6]??0)<=4&&header.readUInt16LE(4)>0&&header.readUInt16LE(4)<=size-7)return true;
            }else if(size>=48){const footer=Buffer.alloc(8);await file.read(footer,0,8,size-8);if(footer.equals(tableMagic))return true;}
        }finally{await file.close();}
    }return false;
}
export async function validateConvertedPayload(directory:string,format:string):Promise<void>{
    const level=await lstat(join(directory,'level.dat'));if(!level.isFile()||level.size===0)throw Error('The converted world has no non-empty level.dat.');
    if(format.startsWith('BEDROCK_')){
        try{if(await readableDatabase(join(directory,'db')))return;}catch{/* Fail closed with one payload-free diagnostic. */}
        throw Error('The converted Bedrock world has no readable LevelDB manifest and terrain data.');
    }
    if(!format.startsWith('JAVA_'))throw Error('The converted output format is unsupported.');
    let valid=0;let examined=0;
    async function walk(path:string,depth:number):Promise<void>{
        if(depth>8)throw Error('The converted dimension path exceeds the supported depth.');
        const entries=await opendir(path);
        for await(const entry of entries){
            if(++examined>1_000_000)throw Error('The converted output exceeds the bounded validation inventory.');
            if(entry.isDirectory())await walk(join(path,entry.name),depth+1);
            else if(entry.isFile()&&basename(path)==='region'&&/^r\.-?[0-9]+\.-?[0-9]+\.mca$/.test(entry.name)){
                if(!await terrainRegion(join(path,entry.name)))throw Error('A converted Anvil region has no valid terrain chunk or has invalid structure.');valid++;
            }
        }
    }
    await walk(directory,0);if(!valid)throw Error('The converted Java world has no readable Anvil terrain regions.');
}
