import { open } from "node:fs/promises";
import { join } from "node:path";

export interface OutcomeSound {
    readonly available: boolean;
    readonly dataUrl?: string;
}

/** Reads only fixed system cues. Renderer input can never select a filesystem path.
 * Playback and its volume remain renderer-owned; this never changes host audio settings. */
export async function readVocabularyOutcomeSound(
    cue: unknown,
    options: { platform?: string; windowsRoot?: string } = {},
): Promise<OutcomeSound> {
    if (cue !== "success" && cue !== "invalid") return { available: false };
    if ((options.platform ?? process.platform) !== "win32") return { available: false };
    const root = options.windowsRoot ?? process.env["SystemRoot"];
    if (!root) return { available: false };
    const name = cue === "success" ? "tada.wav" : "Windows Background.wav";
    let handle;
    try {
        handle = await open(join(root, "Media", name), "r");
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size < 12 || stat.size > 1_048_576) return { available: false };
        const bytes = Buffer.alloc(stat.size);
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        if (bytesRead !== bytes.length || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE")
            return { available: false };
        return { available: true, dataUrl: `data:audio/wav;base64,${bytes.toString("base64")}` };
    } catch {
        return { available: false };
    } finally {
        await handle?.close().catch(() => undefined);
    }
}
