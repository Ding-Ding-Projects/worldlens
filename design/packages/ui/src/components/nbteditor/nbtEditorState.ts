import { computed, reactive, ref, shallowRef } from "vue";
import {
    PAGE_SIZE,
    emptyCache,
    flattenRows,
    isArray,
    isContainer,
    type Row,
    type TreeCache,
} from "./nbtEditorModel.js";
import type {
    Answer,
    DiffOutcome,
    DocumentInfo,
    DocumentState,
    EditOperation,
    EditOutcome,
    HistoryEntry,
    NbtChange,
    NbtEditorBridge,
    NodeView,
    BedrockRecord,
    ProjectListing,
    RegionChunk,
    SearchOutcome,
} from "./nbtEditorBridge.js";

export interface Notice {
    readonly kind: "info" | "error" | "success";
    readonly text: string;
}

const EMPTY_STATE: DocumentState = { dirty: false, canUndo: false, canRedo: false, changeCount: 0 };

/**
 * The editor's state and actions, apart from any markup so it can be driven by a test with a
 * fake bridge. Every call into the main process goes through {@link NbtEditorState.ask}, which
 * turns a refusal into a notice instead of letting it escape.
 */
export function createNbtEditorState(bridge: NbtEditorBridge) {
    const doc = shallowRef<DocumentInfo | null>(null);
    const cache = reactive<TreeCache>(emptyCache()) as TreeCache;
    const state = ref<DocumentState>(EMPTY_STATE);
    const selectedId = ref<number | null>(null);
    const notice = ref<Notice | null>(null);
    const busy = ref(false);

    const projectDir = ref<string | null>(null);
    const listing = shallowRef<ProjectListing | null>(null);
    const chunks = shallowRef<{ path: string; chunks: readonly RegionChunk[] } | null>(null);
    const world = ref<{ writable: boolean; reason: string | null }>({ writable: true, reason: null });
    const backupBeforeSave = ref(true);

    const query = reactive<{ query: string; regex: boolean; flags: string; names: boolean; values: boolean; open: boolean }>({ query: "", regex: false, flags: "i", names: true, values: true, open: false });
    const searchResult = shallowRef<SearchOutcome | null>(null);

    const history = shallowRef<readonly HistoryEntry[]>([]);
    const historyScope = ref<"file" | "project">("file");
    const diff = shallowRef<(DiffOutcome & { sha: string; against: "parent" | "current" }) | null>(null);
    const pending = shallowRef<{ changes: readonly NbtChange[]; truncated: boolean } | null>(null);

    const rows = computed<Row[]>(() => (doc.value === null ? [] : flattenRows(doc.value.root.id, cache)));

    function say(kind: Notice["kind"], text: string): void {
        notice.value = { kind, text };
    }

    /** Runs a bridge call and unwraps it; a refusal becomes a notice and returns null. */
    async function ask<T>(call: Promise<Answer<T>>, quiet = false): Promise<T | null> {
        let answer: Answer<T>;
        try {
            answer = await call;
        } catch (error) {
            say("error", error instanceof Error ? error.message : String(error));
            return null;
        }
        if (!answer.ok) {
            if (!quiet) say("error", answer.message);
            return null;
        }
        return answer.value;
    }

    function remember(node: NodeView, parentId: number | null): void {
        cache.nodes.set(node.id, node);
        cache.parent.set(node.id, parentId);
    }

    function resetTree(info: DocumentInfo | null): void {
        cache.nodes.clear();
        cache.children.clear();
        cache.parent.clear();
        cache.expanded.clear();
        diff.value = null;
        pending.value = null;
        searchResult.value = null;
        if (info !== null) {
            remember(info.root, null);
            cache.expanded.add(info.root.id);
        }
    }

    async function loadChildren(id: number, offset = 0): Promise<boolean> {
        if (doc.value === null) return false;
        const page = await ask(bridge.children(doc.value.docId, id, offset, PAGE_SIZE));
        if (page === null) return false;
        const existing = offset === 0 ? [] : [...(cache.children.get(id) ?? [])];
        for (const node of page.nodes) {
            remember(node, id);
            existing.push(node.id);
        }
        cache.children.set(id, existing);
        return true;
    }

    /* ------------------------------------------------------------------ opening */

    async function adopt(info: DocumentInfo | null): Promise<void> {
        const previous = doc.value;
        doc.value = info;
        state.value = info?.state ?? EMPTY_STATE;
        selectedId.value = info?.root.id ?? null;
        resetTree(info);
        if (info !== null) {
            await loadChildren(info.root.id);
            await refreshWorld(info.projectDir);
            await refreshHistory();
        }
        if (previous !== null && previous.docId !== info?.docId) void bridge.close(previous.docId);
    }

    async function refreshWorld(dir: string): Promise<void> {
        const status = await ask(bridge.worldStatus(dir), true);
        if (status !== null) world.value = status;
    }

    /** A Bedrock world's records (LevelDB), listed when the chosen folder has a `db` folder. */
    const bedrock = ref<{ records: readonly BedrockRecord[]; problems: readonly string[] } | null>(null);

    async function openProject(dir: string): Promise<void> {
        const result = await ask(bridge.listProject(dir));
        if (result === null) return;
        projectDir.value = result.projectDir;
        listing.value = result;
        chunks.value = null;
        bedrock.value = null;
        await refreshWorld(result.projectDir);
        // A Bedrock world keeps its chunks and players in LevelDB; list them when there is one.
        // A Java world simply has no db folder, which is not worth a notice.
        if (bridge.listBedrock !== undefined) {
            const answer = await bridge.listBedrock(result.projectDir).catch(() => null);
            if (answer?.ok === true && answer.value.records.length > 0) bedrock.value = answer.value;
        }
    }

    async function openFile(relativeOrAbsolute: string, absolute = false): Promise<void> {
        const dir = projectDir.value;
        const path = absolute || dir === null ? relativeOrAbsolute : joinPath(dir, relativeOrAbsolute);
        busy.value = true;
        try {
            const info = await ask(bridge.openFile(path, dir === null ? {} : { projectDir: dir }));
            if (info === null) return;
            if (projectDir.value === null || absolute) {
                projectDir.value = info.projectDir;
                const result = await ask(bridge.listProject(info.projectDir), true);
                if (result !== null) listing.value = result;
            }
            chunks.value = null;
            await adopt(info);
        } finally {
            busy.value = false;
        }
    }

    async function pickAndOpen(): Promise<void> {
        const file = await ask(bridge.pickFile());
        if (file === null || file === undefined) return;
        await openFile(file, true);
    }

    async function showChunks(relativePath: string): Promise<void> {
        const dir = projectDir.value;
        if (dir === null) return;
        const result = await ask(bridge.listChunks(joinPath(dir, relativePath)));
        if (result !== null) chunks.value = { path: relativePath, chunks: result.chunks };
    }

    async function openChunk(relativePath: string, index: number): Promise<void> {
        const dir = projectDir.value;
        if (dir === null) return;
        busy.value = true;
        try {
            const info = await ask(bridge.openChunk(joinPath(dir, relativePath), index, { projectDir: dir }));
            if (info !== null) await adopt(info);
        } finally {
            busy.value = false;
        }
    }


    async function showBedrock(): Promise<void> {
        const dir = projectDir.value;
        if (dir === null || bridge.listBedrock === undefined) return;
        const result = await ask(bridge.listBedrock(dir));
        if (result !== null) bedrock.value = result;
    }

    async function openBedrockRecord(key: string): Promise<void> {
        const dir = projectDir.value;
        if (dir === null || bridge.openBedrockRecord === undefined) return;
        busy.value = true;
        try {
            const info = await ask(bridge.openBedrockRecord(dir, key));
            if (info !== null) await adopt(info);
        } finally {
            busy.value = false;
        }
    }

    async function closeDocument(): Promise<void> {
        const current = doc.value;
        await adopt(null);
        if (current !== null) await ask(bridge.close(current.docId), true);
        history.value = [];
    }

    /* ------------------------------------------------------------------ tree */

    async function expand(id: number): Promise<void> {
        const node = cache.nodes.get(id);
        if (node === undefined || node.childCount === 0) return;
        if (!cache.children.has(id)) await loadChildren(id);
        cache.expanded.add(id);
    }

    function collapse(id: number): void {
        cache.expanded.delete(id);
    }

    async function toggle(id: number): Promise<void> {
        if (cache.expanded.has(id)) collapse(id);
        else await expand(id);
    }

    async function showMore(parentId: number): Promise<void> {
        await loadChildren(parentId, cache.children.get(parentId)?.length ?? 0);
    }

    /** Re-reads the given tags, and reloads the members of those that are open. */
    async function refresh(ids: readonly number[]): Promise<void> {
        const d = doc.value;
        if (d === null) return;
        for (const id of ids) {
            const node = await ask(bridge.node(d.docId, id), true);
            if (node === null) continue;
            remember(node, cache.parent.get(id) ?? null);
            if (isContainer(node.kind) && (cache.children.has(id) || cache.expanded.has(id))) {
                const loaded = Math.max(PAGE_SIZE, cache.children.get(id)?.length ?? 0);
                const removed = cache.children.get(id) ?? [];
                const page = await ask(bridge.children(d.docId, id, 0, loaded), true);
                if (page === null) continue;
                for (const gone of removed) if (!page.nodes.some((n) => n.id === gone)) dropSubtree(gone);
                cache.children.set(
                    id,
                    page.nodes.map((n) => {
                        remember(n, id);
                        return n.id;
                    }),
                );
            }
        }
    }

    function dropSubtree(id: number): void {
        for (const child of cache.children.get(id) ?? []) dropSubtree(child);
        cache.children.delete(id);
        cache.nodes.delete(id);
        cache.parent.delete(id);
        cache.expanded.delete(id);
    }

    async function reloadAll(): Promise<void> {
        const d = doc.value;
        if (d === null) return;
        const fresh = await ask(bridge.describe(d.docId));
        if (fresh === null) return;
        const open = [...cache.expanded];
        doc.value = fresh;
        cache.nodes.clear();
        cache.children.clear();
        cache.parent.clear();
        cache.expanded.clear();
        remember(fresh.root, null);
        await loadChildren(fresh.root.id);
        cache.expanded.add(fresh.root.id);
        for (const id of open) if (id !== fresh.root.id) await reopen(id);
        if (selectedId.value !== null && !cache.nodes.has(selectedId.value)) selectedId.value = fresh.root.id;
    }

    /** Reopens a branch after a reload when its tag still exists and its parent is loaded. */
    async function reopen(id: number): Promise<void> {
        const d = doc.value;
        if (d === null) return;
        const node = await ask(bridge.node(d.docId, id), true);
        if (node === null || node.childCount === 0) return;
        const parent = await ask(bridge.ancestors(d.docId, id), true);
        if (parent === null) return;
        for (const ancestor of parent) {
            if (!cache.nodes.has(ancestor)) return;
            if (!cache.children.has(ancestor)) await loadChildren(ancestor);
        }
        const parentId = parent[parent.length - 1] ?? null;
        if (parentId !== null && !(cache.children.get(parentId) ?? []).includes(id)) return;
        remember(node, parentId);
        await loadChildren(id);
        cache.expanded.add(id);
    }

    /* ------------------------------------------------------------------ editing */

    async function applyEdit(operation: EditOperation): Promise<EditOutcome | null> {
        const d = doc.value;
        if (d === null) return null;
        const outcome = await ask(bridge.edit(d.docId, operation));
        if (outcome === null) return null;
        state.value = outcome.state;
        if (outcome.refreshAll) await reloadAll();
        else await refresh(outcome.changed);
        if (outcome.select !== null && cache.nodes.has(outcome.select)) selectedId.value = outcome.select;
        else if (selectedId.value !== null && !cache.nodes.has(selectedId.value)) selectedId.value = d.root.id;
        pending.value = null;
        notice.value = null;
        return outcome;
    }

    async function undo(): Promise<void> {
        const d = doc.value;
        if (d === null) return;
        const outcome = await ask(bridge.undo(d.docId));
        if (outcome === null) return;
        state.value = outcome.state;
        await reloadAll();
    }

    async function redo(): Promise<void> {
        const d = doc.value;
        if (d === null) return;
        const outcome = await ask(bridge.redo(d.docId));
        if (outcome === null) return;
        state.value = outcome.state;
        await reloadAll();
    }

    /** Copies a tag as SNBT so it can be pasted into this file or another. */
    async function copyTag(id: number): Promise<void> {
        const d = doc.value;
        if (d === null) return;
        const result = await ask(bridge.snbt(d.docId, id, false));
        if (result === null) return;
        const node = cache.nodes.get(id);
        const text = node?.name !== null && node?.name !== undefined ? `${JSON.stringify(node.name)}=${result.text}` : result.text;
        try {
            await navigator.clipboard.writeText(text);
            say("success", result.truncated ? "Copied, but the tag was too large to copy completely." : "Copied the tag as SNBT.");
        } catch {
            say("error", "The clipboard is not available here.");
        }
    }

    /** Pastes SNBT from the clipboard into a container (or beside a scalar). */
    async function pasteTag(targetId: number): Promise<void> {
        let text: string;
        try {
            text = await navigator.clipboard.readText();
        } catch {
            say("error", "The clipboard is not available here.");
            return;
        }
        const target = cache.nodes.get(targetId);
        if (target === undefined) return;
        const parentId = isContainer(target.kind) ? targetId : (cache.parent.get(targetId) ?? null);
        if (parentId === null) return;
        const named = /^"((?:[^"\\]|\\.)*)"=(.*)$/su.exec(text);
        let name = "pasted";
        let body = text;
        if (named !== null) {
            try {
                name = JSON.parse(`"${named[1]}"`) as string;
            } catch {
                name = "pasted";
            }
            body = named[2] ?? text;
        }
        const outcome = await applyEdit({ op: "addSnbt", parentId, name, text: body });
        if (outcome !== null) {
            await expand(parentId);
            say("success", "Pasted.");
        }
    }

    /* ------------------------------------------------------------------ search */

    async function runSearch(): Promise<void> {
        const d = doc.value;
        if (d === null || query.query === "") {
            searchResult.value = null;
            return;
        }
        const result = await ask(bridge.search(d.docId, { query: query.query, regex: query.regex, flags: query.flags, names: query.names, values: query.values }), true);
        searchResult.value = result;
    }

    /** Expands every ancestor of a tag (loading further pages as needed) and selects it. */
    async function reveal(id: number): Promise<void> {
        const d = doc.value;
        if (d === null) return;
        const ancestors = await ask(bridge.ancestors(d.docId, id));
        if (ancestors === null) return;
        for (const ancestor of ancestors) {
            if (!cache.children.has(ancestor)) await loadChildren(ancestor);
            cache.expanded.add(ancestor);
        }
        const parentId = ancestors[ancestors.length - 1];
        if (parentId !== undefined) {
            let guard = 0;
            while (!(cache.children.get(parentId) ?? []).includes(id) && (cache.children.get(parentId)?.length ?? 0) < (cache.nodes.get(parentId)?.childCount ?? 0) && guard++ < 200) {
                await showMore(parentId);
            }
        }
        selectedId.value = id;
    }

    /* ------------------------------------------------------------------ saving and history */

    async function loadPending(): Promise<void> {
        const d = doc.value;
        if (d === null) return;
        pending.value = await ask(bridge.pendingChanges(d.docId), true);
    }

    async function suggestedMessage(): Promise<string> {
        const d = doc.value;
        if (d === null) return "";
        return (await ask(bridge.defaultMessage(d.docId), true)) ?? "";
    }

    async function save(message: string): Promise<boolean> {
        const d = doc.value;
        if (d === null) return false;
        busy.value = true;
        try {
            const outcome = await ask(bridge.save(d.docId, { message, backup: backupBeforeSave.value }));
            if (outcome === null) return false;
            state.value = outcome.state;
            say("success", outcome.message);
            pending.value = null;
            await refreshHistory();
            await refreshWorld(d.projectDir);
            return true;
        } finally {
            busy.value = false;
        }
    }

    async function refreshHistory(): Promise<void> {
        const d = doc.value;
        const dir = d?.projectDir ?? projectDir.value;
        if (dir === null) return;
        const entries = await ask(bridge.history(dir, historyScope.value === "file" && d !== null ? d.historyPath : null), true);
        history.value = entries ?? [];
    }

    async function setHistoryScope(scope: "file" | "project"): Promise<void> {
        historyScope.value = scope;
        await refreshHistory();
    }

    async function showCommitDiff(entry: HistoryEntry, against: "parent" | "current"): Promise<void> {
        const d = doc.value;
        if (d === null) return;
        const file = entry.files[0] ?? d.historyPath;
        const outcome =
            against === "current" ? await ask(bridge.diffCurrent(d.docId, entry.sha)) : await ask(bridge.diffCommit(d.projectDir, historyScope.value === "file" ? d.historyPath : file, entry.sha));
        diff.value = outcome === null ? null : { ...outcome, sha: entry.sha, against };
    }

    async function restore(entry: HistoryEntry): Promise<boolean> {
        const d = doc.value;
        if (d === null) return false;
        busy.value = true;
        try {
            const info = await ask(bridge.restore(d.docId, entry.sha, backupBeforeSave.value));
            if (info === null) return false;
            doc.value = info;
            state.value = info.state;
            await reloadAll();
            await refreshHistory();
            say("success", `Restored ${info.title} to ${entry.shortSha}. The restore is a new entry in the history.`);
            return true;
        } finally {
            busy.value = false;
        }
    }

    return {
        doc,
        cache,
        state,
        rows,
        selectedId,
        notice,
        busy,
        projectDir,
        listing,
        chunks,
        bedrock,
        showBedrock,
        openBedrockRecord,
        world,
        backupBeforeSave,
        query,
        searchResult,
        history,
        historyScope,
        diff,
        pending,
        say,
        ask,
        openProject,
        openFile,
        pickAndOpen,
        showChunks,
        openChunk,
        closeDocument,
        expand,
        collapse,
        toggle,
        showMore,
        refresh,
        reloadAll,
        applyEdit,
        undo,
        redo,
        copyTag,
        pasteTag,
        runSearch,
        reveal,
        loadPending,
        suggestedMessage,
        save,
        refreshHistory,
        setHistoryScope,
        showCommitDiff,
        restore,
        isArrayKind: isArray,
    };
}

export type NbtEditorState = ReturnType<typeof createNbtEditorState>;

function joinPath(dir: string, relative: string): string {
    const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
    return `${dir.replace(/[\\/]+$/u, "")}${sep}${relative.split("/").join(sep)}`;
}
