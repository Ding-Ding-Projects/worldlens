import { gunzipSync } from "node:zlib";
import { promises as fs } from "node:fs";
import { basename, join } from "node:path";
import { NBTReader, TagType } from "@worldlens/nbt";
import * as net from "node:net";

export interface LocalPlayer {
    readonly uuid: string;
    readonly name: string;
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly rotation: { readonly yaw: number; readonly pitch: number };
    readonly dimension: string;
    readonly source: "playerdata" | "rcon";
    readonly observedAt: number;
}
export interface PlayerDataOptions {
    readonly now?: () => number;
    readonly maxFiles?: number;
    readonly maxBytesPerFile?: number;
}

export interface RconEndpoint {
    readonly host: string;
    readonly port: number;
    /** Called only while polling; the returned secret is never copied into provider state. */
    readonly credentialProvider: () => Promise<string> | string;
    readonly timeoutMs?: number;
}

export interface LocalLiveProviderOptions extends PlayerDataOptions {
    readonly playerdataRoot?: string;
    readonly rcon?: RconEndpoint;
    readonly staleAfterMs?: number;
    readonly pollIntervalMs?: number;
}

export interface LivePlayersDocument {
    readonly players: readonly (LocalPlayer & { readonly foreign?: boolean })[];
    readonly generatedAt: string;
    readonly sources: readonly ("playerdata" | "rcon")[];
}

const DEFAULT_MAX_FILES = 2_048;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_STALE_MS = 15_000;

function finite(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

interface NbtCompound { [key: string]: NbtValue }
type NbtValue = string | number | NbtValue[] | NbtCompound;

function readValue(reader: NBTReader): NbtValue {
    const type = reader.peek();
    if (type === TagType.COMPOUND) {
        const result: Record<string, NbtValue> = {};
        reader.beginCompound();
        while (reader.hasNext()) {
            const name = reader.name();
            result[name] = readValue(reader);
        }
        reader.endCompound();
        return result;
    }
    if (type === TagType.LIST) {
        const result: NbtValue[] = [];
        const length = reader.beginList();
        for (let i = 0; i < length; i++) result.push(readValue(reader));
        reader.endList();
        return result;
    }
    switch (type) {
        case TagType.BYTE: return reader.nextByte();
        case TagType.SHORT: return reader.nextShort();
        case TagType.INT: return reader.nextInt();
        case TagType.LONG: return Number(reader.nextLong());
        case TagType.FLOAT: return reader.nextFloat();
        case TagType.DOUBLE: return reader.nextDouble();
        case TagType.STRING: return reader.nextString();
        case TagType.BYTE_ARRAY: return Array.from(reader.nextByteArray());
        case TagType.INT_ARRAY: return Array.from(reader.nextIntArray());
        case TagType.LONG_ARRAY: return Array.from(reader.nextLongArray(), Number);
        default: throw new Error(`Unsupported NBT tag ${String(type)}`);
    }
}

function readRoot(data: Uint8Array): Record<string, NbtValue> {
    const reader = new NBTReader(data);
    if (reader.peek() !== TagType.COMPOUND) throw new Error("playerdata root is not a compound");
    const value = readValue(reader);
    return value as Record<string, NbtValue>;
}

function uuidFrom(value: unknown): string | null {
    if (typeof value === "string") return value;
    if (!Array.isArray(value) || value.length < 4) return null;
    const parts = value.slice(0, 4).map((part) => Math.trunc(finite(part)) >>> 0);
    return `${parts[0]!.toString(16).padStart(8, "0")}-${parts[1]!.toString(16).padStart(8, "0")}-${parts[2]!.toString(16).padStart(8, "0")}-${parts[3]!.toString(16).padStart(8, "0")}`;
}

function parsePlayer(data: Uint8Array, source: LocalPlayer["source"], now: number): LocalPlayer | null {
    const root = readRoot(data);
    const uuid = uuidFrom(root["UUID"]);
    const name = text(root["LastKnownName"]) ?? text(root["Name"]);
    const pos = Array.isArray(root["Pos"]) ? root["Pos"] : [];
    if (!uuid || !name || pos.length < 3) return null;
    const dimension = text(root["Dimension"]) ?? "minecraft:overworld";
    const rotation = Array.isArray(root["Rotation"]) ? root["Rotation"] : [];
    return {
        uuid,
        name,
        position: { x: finite(pos[0]), y: finite(pos[1]), z: finite(pos[2]) },
        rotation: { yaw: finite(rotation[0]), pitch: finite(rotation[1]) },
        dimension,
        source,
        observedAt: now,
    };
}

export async function readPlayerdata(root: string, options: PlayerDataOptions = {}): Promise<LocalPlayer[]> {
    const now = options.now ?? Date.now;
    const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    const maxBytes = options.maxBytesPerFile ?? DEFAULT_MAX_BYTES;
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".dat")).slice(0, maxFiles);
    const players: LocalPlayer[] = [];
    for (const entry of files) {
        try {
            const path = join(root, basename(entry.name));
            const stat = await fs.stat(path);
            if (stat.size <= 0 || stat.size > maxBytes) continue;
            const compressed = await fs.readFile(path);
            const payload = gunzipSync(compressed, { maxOutputLength: maxBytes });
            const player = parsePlayer(payload, "playerdata", now());
            if (player) players.push(player);
        } catch {
            // A locked, truncated, or malformed player file is one bad sample, not a dead world.
        }
    }
    return players;
}

export function mergePlayers(samples: readonly LocalPlayer[], now = Date.now(), staleAfterMs = DEFAULT_STALE_MS): LocalPlayer[] {
    const byUuid = new Map<string, LocalPlayer>();
    for (const sample of samples) {
        if (now - sample.observedAt > staleAfterMs) continue;
        const previous = byUuid.get(sample.uuid);
        if (!previous || (sample.source === "rcon" && previous.source !== "rcon") || sample.observedAt >= previous.observedAt) {
            byUuid.set(sample.uuid, sample);
        }
    }
    return [...byUuid.values()].sort((a, b) => a.name.localeCompare(b.name));
}

interface RconPacket { readonly id: number; readonly type: number; readonly body: string }

function packet(id: number, type: number, body: string): Buffer {
    const bodyBuffer = Buffer.from(body, "utf8");
    const result = Buffer.allocUnsafe(14 + bodyBuffer.length);
    result.writeInt32LE(bodyBuffer.length + 10, 0);
    result.writeInt32LE(id, 4);
    result.writeInt32LE(type, 8);
    bodyBuffer.copy(result, 12);
    result.writeInt16LE(0, 12 + bodyBuffer.length);
    return result;
}

async function rconRequest(endpoint: RconEndpoint, command: string): Promise<string> {
    const secret = await endpoint.credentialProvider();
    if (typeof secret !== "string" || secret.length === 0) throw new Error("RCON credential unavailable");
    const timeout = endpoint.timeoutMs ?? 3_000;
    return await new Promise<string>((resolve, reject) => {
        const socket = net.createConnection({ host: endpoint.host, port: endpoint.port });
        let buffer = Buffer.alloc(0);
        let stage: "auth" | "command" = "auth";
        const timer = setTimeout(() => { socket.destroy(); reject(new Error("RCON request timed out")); }, timeout);
        const finish = (error?: Error, value?: string) => { clearTimeout(timer); socket.destroy(); error ? reject(error) : resolve(value ?? ""); };
        const take = (): RconPacket | null => {
            if (buffer.length < 4) return null;
            const length = buffer.readInt32LE(0);
            if (length < 10 || length > 1_048_576 || buffer.length < length + 4) return null;
            const body = buffer.subarray(4, length + 4);
            buffer = buffer.subarray(length + 4);
            const end = body.indexOf(0, 8);
            return { id: body.readInt32LE(0), type: body.readInt32LE(4), body: body.subarray(8, end < 0 ? body.length : end).toString("utf8") };
        };
        socket.on("error", (error) => finish(error));
        socket.on("data", (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            const response = take();
            if (!response) return;
            if (stage === "auth") {
                if (response.id < 0) return finish(new Error("RCON authentication refused"));
                stage = "command";
                socket.write(packet(2, 2, command));
            } else finish(undefined, response.body);
        });
        socket.on("connect", () => socket.write(packet(1, 3, secret)));
    });
}

function playersFromRcon(body: string, now: number): LocalPlayer[] {
    const result: LocalPlayer[] = [];
    // The command is intentionally a documented, bounded text contract. Servers that do not
    // expose position data simply contribute no samples; playerdata remains authoritative.
    for (const line of body.split(/\r?\n/).slice(0, 1_024)) {
        const match = /^([^|]{1,64})\|(-?\d+(?:\.\d+)?)\|(-?\d+(?:\.\d+)?)\|(-?\d+(?:\.\d+)?)\|([^|\s]{1,80})$/.exec(line.trim());
        if (!match) continue;
        result.push({ uuid: match[1]!, name: match[1]!, position: { x: Number(match[2]), y: Number(match[3]), z: Number(match[4]) }, rotation: { yaw: 0, pitch: 0 }, dimension: match[5]!, source: "rcon", observedAt: now });
    }
    return result;
}

export class LocalLiveProvider {
    private current: LocalPlayer[] = [];
    private timer: ReturnType<typeof setInterval> | null = null;
    private polling: Promise<void> | null = null;
    private readonly options: LocalLiveProviderOptions;

    constructor(options: LocalLiveProviderOptions = {}) { this.options = options; }

    start(): void {
        if (this.timer) return;
        void this.refresh();
        this.timer = setInterval(() => void this.refresh(), this.options.pollIntervalMs ?? 1_000);
        this.timer.unref?.();
    }

    stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

    async refresh(): Promise<void> {
        if (this.polling) return this.polling;
        this.polling = (async () => {
            const now = this.options.now ?? Date.now;
            const samples: LocalPlayer[] = [];
            if (this.options.playerdataRoot) {
                try { samples.push(...await readPlayerdata(this.options.playerdataRoot, this.options)); } catch { /* unavailable world */ }
            }
            if (this.options.rcon) {
                try {
                    const body = await rconRequest(this.options.rcon, "worldlens players");
                    samples.push(...playersFromRcon(body, now()));
                } catch { /* server offline or refused: retain local samples */ }
            }
            this.current = mergePlayers([...this.current, ...samples], now(), this.options.staleAfterMs ?? DEFAULT_STALE_MS);
        })().finally(() => { this.polling = null; });
        return this.polling;
    }

    snapshot(): LivePlayersDocument {
        const now = (this.options.now ?? Date.now)();
        const players = mergePlayers(this.current, now, this.options.staleAfterMs ?? DEFAULT_STALE_MS);
        return { players, generatedAt: new Date(now).toISOString(), sources: [...new Set(players.map((player) => player.source))] };
    }

    asJson(): string { return JSON.stringify(this.snapshot()); }
}
