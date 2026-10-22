import { BufferGeometry, Mesh, MeshBasicMaterial } from "three";
import { expect, it, vi } from "vitest";
import { TileManager } from "./TileManager.js";
import { Tile } from "./Tile.js";
import type { TileLoader } from "./TileLoader.js";

vi.mock("../util/Utils", () => ({
    hashTile: (x: number, z: number) => `${x},${z}`,
    dispatchEvent: vi.fn(),
    alert: vi.fn(),
}));

it("retries a missing tile and replaces a saved tile while retaining the same tile coordinates", async () => {
    let saved: Mesh | null = null;
    const load = vi.fn(async () => {
        if (saved === null) throw new Error("not saved yet");
        return saved;
    });
    const loader = { load } as unknown as TileLoader;
    const tile = new Tile(
        1,
        2,
        () => {},
        () => {},
    );
    await tile.load(loader);
    expect(tile.model).toBeNull();
    const manager = Object.assign(Object.create(TileManager.prototype) as TileManager, {
        unloaded: false,
        tileLoader: loader,
        tiles: new Map([["1,2", tile]]),
    });
    saved = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
    saved.userData.tileType = "hires";
    await manager.refreshVisibleTiles();
    expect(tile.model).toBe(saved);
    const previous = saved;
    const dispose = vi.spyOn(previous.geometry, "dispose");
    saved = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
    saved.userData.tileType = "hires";
    await manager.refreshVisibleTiles();
    expect(tile.model).toBe(saved);
    expect(dispose).toHaveBeenCalledOnce();
    expect(load).toHaveBeenLastCalledWith(1, 2, expect.any(Function), true);
    manager.unloaded = true;
    const count = load.mock.calls.length;
    await manager.refreshVisibleTiles();
    expect(load).toHaveBeenCalledTimes(count);
    tile.unload();
});
