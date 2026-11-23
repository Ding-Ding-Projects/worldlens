# Appliance: a Linux that boots straight into a finished map

An appliance is a small Linux disk image that boots, finds your rendered map, and serves it. Everything it needs ships inside Worldlens: nothing is downloaded when you click Build.

You can run it four ways:

| Target | What happens | Needs |
| --- | --- | --- |
| VMware Workstation | Creates the virtual machine, starts it, finds its address, checks the link from this PC | `vmrun` (found under Program Files) |
| VirtualBox | Same, through `VBoxManage` | VirtualBox 6 or 7 |
| Bootable USB | Writes the image to a USB drive; plug it into any PC and boot | Windows, one administrator approval |
| Export image | Saves `.img`, `.vmdk`, `.vhdx` or `.ova` plus `SHA256SUMS` and `INSTALL.txt` for manual installation | nothing |

## How the disk is made

The base image is built once in CI (`appliance/build-base.sh`, workflow `.github/workflows/appliance.yml`): Alpine Linux, Docker, avahi (mDNS), the Worldlens map-server container image, and a boot script. It is raw, MBR, one bootable ext4 partition.

When you click Build, Worldlens does not need any Linux tools on your PC. In plain JavaScript it:

1. verifies the bundled base image against its recorded SHA-256,
2. writes a small `worldlens-map.json` (host name, port, a salted access-code verifier, display labels) and a tar of the map after the base image, aligned to 1 MiB,
3. adds that region to the partition table as partition 2 (type `0xDA`, "non-filesystem data", so no operating system offers to format it).

On boot the appliance finds the partition whose first sector is a tar header whose first member is `worldlens-map.json`, extracts it, loads the bundled map-server image, runs it with `--restart always`, prints its address large on the console and announces `<host name>.local` over mDNS. Only a salted scrypt verifier of the access code is stored in the image, never the code.

### Contract with the map-server image

The appliance expects the image `worldlens-map-server:bundled` (a `docker save` tar at `resources/mapserver/worldlens-map-server-<arch>.tar` at build time) to:

- read `/data/worldlens-map.json`,
- serve the map from `/data/map`,
- listen on HTTP port 8080 inside the container and answer `GET /health` with 200.

## Targets in detail

**VMware.** A `.vmx` and a monolithicFlat `.vmdk` descriptor that points at the raw disk are written to a folder under Worldlens's own data directory, then `vmrun -T ws start <vmx> nogui`. The address comes from `vmrun getGuestIPAddress -wait` (the appliance runs open-vm-tools), falling back to resolving `<host name>.local`. The link is only reported after `GET /health` answers 200 from this PC.

**VirtualBox.** `createvm`, `modifyvm` (memory, processors, bridged adapter chosen to match the default-route adapter, or NAT with a port forward), `storagectl`, `storageattach`, then `startvm --type headless`. The address comes from the guest property written by the guest additions. A failed create unregisters the half-made machine.

**USB.** Only USB disks that are neither the boot nor the system disk are listed. You must type the drive's name to confirm the erase. The write runs elevated through the standard Windows permission prompt (`Start-Process -Verb RunAs`); the script re-checks the live disk, writes the image, reads the same bytes back and prints their SHA-256, which Worldlens compares with the image. A declined prompt is reported as not done and nothing is written.

**Export.** `.img` is the raw disk. `.vmdk` is a single-file monolithicSparse disk (empty grains skipped). `.vhdx` is a fixed VHDX with a real header, region tables, metadata and allocation table (Generation 1 Hyper-V machine, BIOS boot). `.ova` is a tar of an OVF, a manifest and the VMDK. A file that already exists is never overwritten.

## Your own words

When a personal vocabulary file is loaded, the labels the appliance shows (console title, ready line, page title) go through the same whole-string replacement at build time. The mapping stays local, is never logged and is only written into the image you are building for yourself.

## Instances

VMs created here are recorded in `appliance/instances.json` under the app data folder. The instance manager can start, stop and remove only those, and only ever deletes the folder this tool created.

## Building the base image

```
sudo sh appliance/build-base.sh --mapserver-tar worldlens-map-server-x86_64.tar --out out/
node design/packages/app/scripts/fetch-appliance-base.mjs --from out/worldlens-appliance-base-x86_64.img
```

`fetch-appliance-base.mjs` without `--from` downloads the asset named in `design/packages/app/appliance-base.pin.json` at build time, verifies both the compressed and the expanded checksums, and stages it in `dist/appliance/`. The pin is empty until the workflow has published a first asset. The packaged app needs one `extraResources` entry: `{ from: "dist/appliance", to: "appliance", filter: ["**/*"] }`.

The base image is about 1.4 GiB raw (compresses well). `.github/workflows/appliance.yml` boots it once under QEMU and waits for `/health` before uploading it as a zstd asset with a SHA-256.

## What is not built or not verified

- Raspberry Pi (arm64): not built. The base script only builds x86_64.
- The base image build script and the QEMU boot smoke have not been run yet; they need a Linux runner and the map-server image sources.
- No real VMware or VirtualBox machine has been booted from a composed disk and no USB drive has been written by this code. The disk, VMDK, VHDX and command plans are covered by tests; VirtualBox's own parser has opened the generated VMDK (sparse and flat) and VHDX files.
- The VHDX has not been mounted by Windows or Hyper-V.
