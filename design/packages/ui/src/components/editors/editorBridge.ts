/** The external editor bridge as the interface sees it; null outside the desktop app. */
export interface EditorInfo {
    readonly id: string;
    readonly name: string;
    readonly path: string;
    readonly kind: "vscode" | "other";
    readonly source: "detected" | "added";
}

export interface EditorOpenResult {
    readonly ok: boolean;
    readonly message: string;
    readonly editor: string | null;
    readonly downloadUrl?: string;
}

export interface EditorBridge {
    list(): Promise<{ readonly editors: readonly EditorInfo[]; readonly chosen: string | null }>;
    choose(id: string): Promise<boolean>;
    add(): Promise<{ readonly ok: boolean; readonly message: string; readonly id?: string }>;
    remove(id: string): Promise<unknown>;
    open(target: string, id?: string): Promise<EditorOpenResult>;
    openInVsCode(target: string): Promise<EditorOpenResult>;
    openText(name: string, text: string): Promise<EditorOpenResult>;
}

export function editorBridge(): EditorBridge | null {
    return (globalThis.window as unknown as { worldlens?: { editors?: EditorBridge } } | undefined)?.worldlens?.editors ?? null;
}

/** The one action every export uses: open text in VS Code, or say why not and where to get it. */
export async function openTextInVsCode(name: string, text: string): Promise<EditorOpenResult> {
    const bridge = editorBridge();
    if (!bridge) return { ok: false, message: "Opening in Visual Studio Code needs the desktop app.", editor: null };
    try {
        return await bridge.openText(name, text);
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error), editor: null };
    }
}
