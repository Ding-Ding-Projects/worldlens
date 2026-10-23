/** Runtime-derived shape metadata. Unknown values never acquire invented defaults. */
export type ConfigValueShape =
    | { readonly kind: 'string' | 'number' | 'boolean' | 'null' }
    | { readonly kind: 'array'; readonly items: readonly ConfigValueShape[] }
    | { readonly kind: 'object'; readonly fields: Readonly<Record<string, ConfigValueShape>> };
export function describeValueShape(value: unknown): ConfigValueShape {
    if (value === null) return { kind:'null' };
    if (Array.isArray(value)) return { kind:'array', items:value.map(describeValueShape) };
    if (typeof value === 'object') return { kind:'object', fields:Object.fromEntries(Object.entries(value).map(([key,child]) => [key,describeValueShape(child)])) };
    if (typeof value === 'string') return { kind:'string' };
    if (typeof value === 'number') return { kind:'number' };
    if (typeof value === 'boolean') return { kind:'boolean' };
    throw new Error('Unsupported configuration value.');
}

