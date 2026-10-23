/** Generation drafts never transport credential-bearing fields. Existing vault APIs own them. */
export function isProtectedGenerationKey(value:string):boolean {
    let decoded=value;
    for(let count=0;count<2;count++){try{const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}catch{break;}}
    const normalized=decoded.normalize('NFKC').replace(/[^a-z0-9]/gi,'').toLowerCase();
    return /password|passwd|credential|secret|token|apikey|privatekey|accesskey|clientkey|keystorepass/.test(normalized)||normalized==='pwd';
}

/** Rejects nested records, key/value rows and serialized JSON carrying protected names. */
export function containsProtectedGenerationInput(value:unknown):boolean {
    const seen=new Set<object>();
    let nodes=0;
    const walk=(item:unknown,depth:number):boolean=>{
        if(++nodes>20000||depth>32)return true;
        if(typeof item==='string'){
            if(/^[a-z0-9_.:/%\\-]+$/i.test(item)&&isProtectedGenerationKey(item))return true;
            if(/^[\s]*[\[{]/.test(item)){try{return walk(JSON.parse(item),depth+1);}catch{return false;}}
            return false;
        }
        if(item===null||typeof item!=='object')return false;
        if(seen.has(item))return true;
        seen.add(item);
        if(!Array.isArray(item)&&Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null)return true;
        for(const [key,child] of Object.entries(item))if(isProtectedGenerationKey(key)||walk(child,depth+1))return true;
        seen.delete(item);return false;
    };
    return walk(value,0);
}
