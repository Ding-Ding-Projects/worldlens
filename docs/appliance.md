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

`fetch-appliance-base.mjs` without `--from` downloads the asset named in `design/packages/app/appliance-base.pin.json` at build time, verifies both the compressed and the expanded checksums, and stages it in `dist/appliance/`. Both bases are pinned to the `v1.0.2300` release assets (built 2026-11-23 by Appliance run 45274195226, from the boot script that runs both workloads); `--check` exits 0 only when every pin is complete. The installer copies `dist/appliance` to `resources/appliance`.

The base image is about 1.4 GiB raw (compresses well). `.github/workflows/appliance.yml` boots it once under QEMU and waits for `/health` before uploading it as a zstd asset with a SHA-256.

## Raspberry Pi

`appliance/build-base-rpi.sh` builds `worldlens-appliance-base-aarch64-rpi.img` for a Raspberry Pi 3, 4 or 5. A Pi's firmware reads partition 1, which must be FAT, so the layout is a 256 MiB FAT boot partition (firmware, `vmlinuz-rpi`, `initramfs-rpi`, device trees for the Pi 3, 4, 400, 5 and 500 families, `config.txt`, `cmdline.txt`) and an ext4 root with Docker, avahi and the same `worldlens-map` service. The kernel and the firmware come from the same Alpine package set, so their versions always match. The desktop app appends the map as partition 3, exactly as it appends partition 2 on the PC image.

In the appliance dialog, **Raspberry Pi** writes this image to an SD card or a USB drive through the same verified disk write as the PC USB stick: removable drives only (USB, SD and MMC buses, never the boot or system disk), the drive name typed to confirm, administrator approval through the Windows prompt, and a SHA-256 read-back before it says done.

## The whole WorldLens app as an appliance

**Run the whole WorldLens app, not only the map** in the appliance dialog makes the same disk run the WorldLens application (the hosted image, `docs/hosted-mode.md`) instead of the map server. Paste the `worldlens-hosted` image pinned by digest and set a password (at least 8 characters). The builder writes a `workload` entry (`kind: "app"`, the image, and only the password's SHA-256) into `worldlens-map.json`; on boot the script checks both again, pulls the image by digest (so the first start needs internet, and keeps retrying with a message on the console until it has it), and runs it with the copied map offered read-only as "Maps" and its own state in a named volume. The link is checked from this PC by its sign-in page rather than `/health`, with a 10 minute window for the first download.

Only a base built from the current appliance scripts can do this. `appliance-base.pin.json` entries may list `"workloads": ["map", "app"]`; an entry that lists none is treated as map only, and the builder then refuses an app build with that reason instead of producing a disk that quietly runs the map. The `v1.0.2300` bases are pinned with `"workloads": ["map", "app"]`. The app workload has not yet been booted in a real virtual machine.

## A Minecraft server appliance

**Run a Minecraft server with its management site** in the appliance dialog makes the disk run two containers instead of the map: the Minecraft server image you choose (pinned by digest; players join on 25565/TCP and 19132/UDP, with the memory slider's value) and the WorldLens server site (`worldlens-server-site`, published by the CI `server-site-image` job from the `server-site` target of `Dockerfile.hosted`). The site is the web console with owner-first accounts (`docs/mcserver-web-console.md`): the first person to open the web port becomes the owner, and sign-in can need a password, a passkey or an authenticator code in any combination. It manages the server through the Docker socket and the shared server volume. The Minecraft EULA must be accepted in the dialog; the boot script checks every value again and pulls both images on first start. It serves plain HTTP on the local network, so passkeys need an HTTPS tunnel or proxy in front (see `docs/player-relay.md` for letting players in from outside).

Like the app workload, this needs a base pinned with `"minecraft"` in its workloads; the `v1.0.2300` bases predate it, so the builder refuses with that reason until a newer base is built and pinned. Not yet booted in a real virtual machine.

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

### 成個 WorldLens 做 appliance

對話框入面剔 **Run the whole WorldLens app, not only the map**，同一隻碟就會行 WorldLens 應用程式（hosted image）而唔係淨係地圖伺服器。貼上用 digest 鎖定嘅 `worldlens-hosted` 映像，再設一個最少 8 個字嘅密碼。Builder 會將 `workload`（映像同密碼嘅 SHA-256，冇原文）寫入 `worldlens-map.json`；開機腳本再檢查一次，用 digest 拉映像（所以第一次開機要上網，未拉到會喺螢幕講住並且一直重試），之後將複製入去嘅地圖以唯讀「Maps」畀個 app 用，狀態放喺 named volume。由呢部電腦檢查登入頁，第一次下載有 10 分鐘。只有用而家嘅 appliance 腳本 build 出嚟嘅 base 先做到：pin 要寫 `"workloads": ["map", "app"]`，冇寫就當淨係地圖，builder 會講明原因拒絕，唔會整出一隻靜靜雞照行地圖嘅碟。而家 pin 住嘅 `v1.0.2300` base 已經寫明 `"workloads": ["map", "app"]`，不過 app 模式未喺真虛擬機開過機。

### Minecraft 伺服器 appliance

對話框剔 **Run a Minecraft server with its management site**，隻碟就會行兩個容器：你揀嘅 Minecraft 伺服器映像（用 digest 鎖定，玩家用 25565/TCP 同 19132/UDP 入，記憶體跟滑桿）同 WorldLens 管理網站（`worldlens-server-site`，CI 嘅 `server-site-image` job 發佈）。網站即係有「第一個入嚟做老細」帳戶嘅網頁主控台，登入可以要密碼、passkey、驗證碼任何組合，經 Docker socket 同共用 volume 管伺服器。一定要喺對話框接受 Minecraft EULA；開機腳本會再檢查所有值，第一次開機拉兩個映像。佢喺本地網絡用 HTTP，passkey 要前面有 HTTPS 隧道或者 proxy。同 app 模式一樣，要 pin 一個寫咗 `"minecraft"` 嘅 base；而家嘅 `v1.0.2300` 未有，builder 會講明原因拒絕。未喺真虛擬機開過。
