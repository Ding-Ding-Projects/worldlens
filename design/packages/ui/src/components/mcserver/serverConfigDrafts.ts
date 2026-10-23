/** In-memory drafts deliberately never enter disk history, exports or synchronization. */
const drafts = new Map<string, unknown>();
export const serverConfigDraftKey = (serverId: string, path: string): string =>
    JSON.stringify([serverId, path]);
export function storeServerConfigDraft(key: string, draft: unknown): void {
    drafts.set(key, JSON.parse(JSON.stringify(draft)) as unknown);
}
export function readServerConfigDraft<T>(key: string): T | null {
    const draft = drafts.get(key);
    return draft === undefined ? null : (JSON.parse(JSON.stringify(draft)) as T);
}
export function discardServerConfigDraft(key: string): void {
    drafts.delete(key);
}
export function clearServerConfigDrafts(): void {
    drafts.clear();
}
