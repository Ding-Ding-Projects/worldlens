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

`fetch-appliance-base.mjs` without `--from` downloads the asset named in `design/packages/app/appliance-base.pin.json` at build time, verifies both the compressed and the expanded checksums, and stages it in `dist/appliance/`. Both bases are pinned to the `v1.0.2256` release assets (published 2026-11-23); `--check` exits 0 only when every pin is complete. The installer copies `dist/appliance` to `resources/appliance`.

The base image is about 1.4 GiB raw (compresses well). `.github/workflows/appliance.yml` boots it once under QEMU and waits for `/health` before uploading it as a zstd asset with a SHA-256.

## Raspberry Pi

`appliance/build-base-rpi.sh` builds `worldlens-appliance-base-aarch64-rpi.img` for a Raspberry Pi 3, 4 or 5. A Pi's firmware reads partition 1, which must be FAT, so the layout is a 256 MiB FAT boot partition (firmware, `vmlinuz-rpi`, `initramfs-rpi`, device trees for the Pi 3, 4, 400, 5 and 500 families, `config.txt`, `cmdline.txt`) and an ext4 root with Docker, avahi and the same `worldlens-map` service. The kernel and the firmware come from the same Alpine package set, so their versions always match. The desktop app appends the map as partition 3, exactly as it appends partition 2 on the PC image.

In the appliance dialog, **Raspberry Pi** writes this image to an SD card or a USB drive through the same verified disk write as the PC USB stick: removable drives only (USB, SD and MMC buses, never the boot or system disk), the drive name typed to confirm, administrator approval through the Windows prompt, and a SHA-256 read-back before it says done.

## Kernel and drivers

The PC image uses Alpine's `linux-lts` kernel rather than `linux-virt`. The same image boots in VirtualBox, in VMware and from a USB stick on a real PC, so it needs the common physical network drivers (and Realtek's firmware) as well as the virtual ones; `linux-virt` has no Realtek driver at all. `hwdrivers` loads the driver for whatever network card is present, and `/etc/modules` also lists the Intel, VMware and virtio drivers so a virtual machine always gets its network.

## Bundled bases

The installer carries both bases zstd-compressed (about 260 MB and 135 MB rather than 3.2 GB raw). `scripts/fetch-appliance-base.mjs` stages them at build time from `appliance-base.pin.json`, checking both the compressed and the expanded SHA-256. The app expands the base it needs into its own data folder on first use, checks it against the recorded digest again, and reuses it after that. Nothing is downloaded when somebody clicks.

## Verified

- The PC base builds in WSL and in CI, and boots under QEMU to `/health` 200 within about 15 seconds; CI repeats that boot on every change to the appliance.
- **VirtualBox, one click:** on this PC the app's own builder composed a disk, created and started the VM, and got `/health` 200 through a NAT forward in 72 seconds; the VM was then removed.
- **VMware, one click:** the same builder started the VM in VMware Workstation, read its address through the guest tools and got `/health` 200 in 24 seconds; the VM was then removed.
- The Raspberry Pi image builds in WSL with arm64 emulation; its boot partition and root were inspected, and under QEMU's Raspberry Pi 3 model it starts its kernel, loads its initramfs and mounts its root.
- Both live checks are opt-in tests: `WORLDLENS_LIVE_VBOX_BASE=<base.img> [WORLDLENS_LIVE_VM_TARGET=vmware] vitest run packages/app/src/main/appliance/vm.live.test.ts`.

## Found by the first real boots, and fixed

- VirtualBox booted the appliance with no network: the virt kernel had the Intel driver but nothing loaded it.
- VMware refused to power on: the network card was a PCIe device and the VM declared no PCIe root ports. It now uses `vmxnet3` with VMware's standard four root ports.
- A VM whose check failed was never recorded, so it kept running with no way to remove it from the app. It is now recorded on every outcome.
- A NAT forward onto a port already in use started a VM whose link reached something else. The port is now checked first.
- Both build scripts reported success when a step failed; they now keep the real exit code and delete a partial image.

## Not verified yet

- A Raspberry Pi image booted on a real board, and a real SD card or USB drive written by the app (it needs a drive chosen in the dialog and the administrator prompt approved).
- The `.vhdx` mounted by Windows or Hyper-V, and the `.ova` imported into VMware or VirtualBox.

## 廣東話

一撳就整一部開機即用嘅地圖機：VMware、VirtualBox、USB 手指、樹莓派記憶卡，或者匯出映像自己裝。
- 已經喺呢部電腦真係試過：VirtualBox 72 秒、VMware 24 秒就由呢部電腦打得開 `/health`，試完自動刪走部虛擬機。
- 第一次真開機揪出幾隻蟲，全部修好：VirtualBox 冇網卡驅動、VMware 冇 PCIe 位、失敗嘅虛擬機冇記錄、NAT 端口撞車、建置腳本失敗都報成功。
- 樹莓派版本已經砌好，模擬器入面開到核心、掛到根目錄；但仲未喺真嘅樹莓派上面開過，亦未真係寫過記憶卡或者 USB。
- 兩個底層映像壓縮後放入安裝檔，第一次用先喺本機解壓同驗指紋，唔使臨時下載。
