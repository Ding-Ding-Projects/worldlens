/** Heading fragment semantics for the offline manifest, independent of DOM rendering. */
// GitHub documents one hyphen per ASCII space, not whitespace-run collapsing:
// https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#section-links
export function headingText(tokens) {
    return tokens.map(token => {
        if (token.type === 'html') return token.text.replace(/<[^>]*>/g,'');
        if (token.tokens) return headingText(token.tokens);
        return token.text ?? '';
    }).join('');
}
export const headingSlug = text => text.toLowerCase().trim()
    .replace(/[^\p{L}\p{N}\p{M}_ -]/gu,'').replace(/ /g,'-') || 'section';
export const legacyHeadingSlug = text => text.toLowerCase().trim()
    .replace(/[^\p{L}\p{N}\s-]/gu,'').replace(/\s+/g,'-').replace(/^-+|-+$/g,'') || 'section';
export function uniqueHeadingId(base, used) {
    let id=base,suffix=0;
    while(used.has(id)) id=base+'-'+(++suffix);
    used.add(id);return id;
}
/** Never let a compatibility name shadow a genuine heading or explicit HTML ID. */
export function headingAliases(headings, anchors) {
    const occupied=new Set(anchors),aliases={};
    for(const {id,legacyId} of headings) {
        if(id!==legacyId && !occupied.has(legacyId)) {
            Object.defineProperty(aliases,legacyId,{value:id,enumerable:true});occupied.add(legacyId);
        }
    }
    return aliases;
}
export function ambiguousHeadingAliases(headings, anchors) {
    const primary = new Set(anchors);
    return headings.filter(({id,legacyId})=>id!==legacyId && primary.has(legacyId)).map(({legacyId})=>legacyId);
}
