import assert from "node:assert/strict";
import { test } from "node:test";
import { archiveFromRegistry, layersFromArchive, readTar, sha256Hex, writeTar } from "./mapserver-image-lib.mjs";

const digestOf = (buffer) => `sha256:${sha256Hex(buffer)}`;

/** A one-layer image served as an index with one entry per architecture, over a fake http. */
function fakeRegistry({ tamper = false } = {}) {
    const config = Buffer.from(JSON.stringify({ architecture: "amd64", os: "linux", rootfs: { type: "layers", diff_ids: ["sha256:" + "a".repeat(64)] } }));
    const layer = Buffer.from("layer bytes");
    const manifest = Buffer.from(JSON.stringify({
        schemaVersion: 2, mediaType: "application/vnd.oci.image.manifest.v1+json",
        config: { mediaType: "application/vnd.oci.image.config.v1+json", digest: digestOf(config), size: config.length },
        layers: [{ mediaType: "application/vnd.oci.image.layer.v1.tar", digest: digestOf(layer), size: layer.length }],
    }));
    const index = Buffer.from(JSON.stringify({
        schemaVersion: 2, mediaType: "application/vnd.oci.image.index.v1+json",
        manifests: [
            { digest: digestOf(manifest), platform: { os: "linux", architecture: "amd64" } },
            { digest: "sha256:" + "e".repeat(64), platform: { os: "unknown", architecture: "unknown" } },
        ],
    }));
    const bodies = new Map([[digestOf(index), index], [digestOf(manifest), manifest], [digestOf(config), config], [digestOf(layer), tamper ? Buffer.from("evil") : layer]]);
    const urls = [];
    const http = async (url) => {
        urls.push(url);
        if (url.includes("/token")) return Buffer.from(JSON.stringify({ token: "anon" }));
        const body = bodies.get(url.slice(url.lastIndexOf("/") + 1));
        if (body === undefined) throw new Error(`not found: ${url}`);
        return body;
    };
    return { http, urls, indexDigest: digestOf(index), configBytes: config, layer };
}

test("tar writing and reading agree", () => {
    const tar = writeTar([{ name: "blobs/sha256/x", body: Buffer.from("hello") }, { name: "manifest.json", body: Buffer.alloc(600, 1) }]);
    const entries = readTar(tar);
    assert.equal(entries.get("blobs/sha256/x").toString(), "hello");
    assert.equal(entries.get("manifest.json").length, 600);
    assert.equal(tar.length % 512, 0);
});

test("an archive assembled from the registry lists its layers and carries every blob", async () => {
    const registry = fakeRegistry();
    const tar = await archiveFromRegistry({ digest: registry.indexDigest, arch: "amd64", tag: "bundled", http: registry.http });
    assert.deepEqual(layersFromArchive(tar), ["sha256:" + "a".repeat(64)]);
    const entries = readTar(tar);
    const manifest = JSON.parse(entries.get("manifest.json").toString());
    assert.deepEqual(manifest[0].RepoTags, ["worldlens-map-server:bundled"]);
    assert.equal(entries.get(manifest[0].Layers[0]).toString(), "layer bytes");
    assert.ok(entries.has("index.json") && entries.has("oci-layout"));
});

test("a blob that does not match its digest is refused", async () => {
    const registry = fakeRegistry({ tamper: true });
    await assert.rejects(() => archiveFromRegistry({ digest: registry.indexDigest, arch: "amd64", tag: "1", http: registry.http }), /does not match its digest/);
});

test("an architecture the image was not built for is refused", async () => {
    const registry = fakeRegistry();
    await assert.rejects(() => archiveFromRegistry({ digest: registry.indexDigest, arch: "arm64", tag: "1", http: registry.http }), /no linux\/arm64 build/);
});

test("without a pinned digest nothing is fetched and the reason is clear", async () => {
    const registry = fakeRegistry();
    await assert.rejects(() => archiveFromRegistry({ digest: null, arch: "amd64", tag: "1", http: registry.http }), /No pinned digest/);
    assert.equal(registry.urls.length, 0);
});
