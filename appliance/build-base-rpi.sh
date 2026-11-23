#!/bin/sh
# Builds worldlens-appliance-base-aarch64-rpi.img: the same appliance as build-base.sh, for a
# Raspberry Pi 3, 4 or 5 booting from an SD card or a USB drive.
#
# A Pi does not boot like a PC. Its firmware reads partition 1, which must be FAT, and loads the
# kernel named in config.txt from there. So the layout is:
#   partition 1  FAT32 "WLBOOT"          firmware, kernel, initramfs, device trees, config.txt
#   partition 2  ext4  "worldlens-root"  Alpine with Docker, avahi and the worldlens boot service
# and the desktop app appends partition 3 (type 0xDA) with the map, exactly as on x86.
#
# Needs root on Linux with losetup, sfdisk, mkfs.vfat, mkfs.ext4, curl, chroot, and arm64 binfmt
# emulation (qemu-user-static) so the aarch64 package manager can run in the chroot:
#   sudo sh appliance/build-base-rpi.sh --mapserver-tar worldlens-map-server-arm64.tar --out out/
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck disable=SC1091
. "$HERE/alpine.pins"
SIZE_MB=${BASE_SIZE_MB:-1800}
BOOT_MB=256
OUT=out
MAPSERVER_TAR=

while [ $# -gt 0 ]; do
    case $1 in
        --mapserver-tar) MAPSERVER_TAR=$2; shift 2 ;;
        --out) OUT=$2; shift 2 ;;
        --size-mb) SIZE_MB=$2; shift 2 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done

[ "$(id -u)" = 0 ] || { echo "run as root (losetup and chroot need it)" >&2; exit 1; }
[ -n "$MAPSERVER_TAR" ] && [ -f "$MAPSERVER_TAR" ] || { echo "--mapserver-tar must name the arm64 docker save tar of worldlens-map-server:bundled" >&2; exit 1; }
[ -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ] || [ -e /proc/sys/fs/binfmt_misc/aarch64 ] || { echo "arm64 emulation (qemu-user-static with binfmt) is required to run the aarch64 chroot" >&2; exit 1; }

WORK=$(mktemp -d)
IMG="$OUT/worldlens-appliance-base-aarch64-rpi.img"
mkdir -p "$OUT"
LOOP=
cleanup() {
    set +e
    for m in boot dev/pts dev proc sys; do umount "$WORK/root/$m" 2>/dev/null; done
    umount "$WORK/root" 2>/dev/null
    [ -n "$LOOP" ] && losetup -d "$LOOP" 2>/dev/null
    rm -rf "$WORK"
}
# Keep the failing exit code: without this, the last command in cleanup (a successful rm)
# became the exit status and a failed build reported success. A failed build also removes its
# partial image, so nothing half-written can be mistaken for a base.
trap 'rc=$?; cleanup; if [ "$rc" -ne 0 ]; then rm -f "$IMG"; echo "build failed (exit $rc)" >&2; fi; exit $rc' EXIT

echo "== fetch and verify the Alpine aarch64 mini root filesystem"
curl -fsSL -o "$WORK/rootfs.tar.gz" "$ALPINE_ROOTFS_URL_AARCH64"
echo "$ALPINE_ROOTFS_SHA256_AARCH64  $WORK/rootfs.tar.gz" | sha256sum -c -

echo "== partition ${SIZE_MB} MiB: ${BOOT_MB} MiB FAT boot, the rest ext4 root"
rm -f "$IMG"
truncate -s "${SIZE_MB}M" "$IMG"
BOOT_SECTORS=$((BOOT_MB * 2048))
printf 'label: dos\nstart=2048, size=%s, type=c, bootable\nstart=%s, type=83\n' "$BOOT_SECTORS" "$((2048 + BOOT_SECTORS))" | sfdisk "$IMG" >/dev/null
LOOP=$(losetup --find --show --partscan "$IMG")
mkfs.vfat -F 32 -n WLBOOT "${LOOP}p1" >/dev/null
mkfs.ext4 -q -L worldlens-root -O ^64bit,^metadata_csum "${LOOP}p2"
mkdir -p "$WORK/root"
mount "${LOOP}p2" "$WORK/root"

echo "== unpack the root filesystem and install packages (arm64, emulated)"
tar -xzf "$WORK/rootfs.tar.gz" -C "$WORK/root"
mkdir -p "$WORK/root/boot"
mount "${LOOP}p1" "$WORK/root/boot"
cp /etc/resolv.conf "$WORK/root/etc/resolv.conf"
mount -t proc proc "$WORK/root/proc"
mount -t sysfs sys "$WORK/root/sys"
mount --bind /dev "$WORK/root/dev"
mount -t devpts devpts "$WORK/root/dev/pts"
printf '%s\n%s\n' "$ALPINE_REPO/main" "$ALPINE_REPO/community" > "$WORK/root/etc/apk/repositories"
chroot "$WORK/root" /bin/sh -eu <<'CHROOT'
apk update
# The kernel and the Pi firmware come from the same package set, so their versions always match.
# linux-firmware-brcm carries the onboard Wi-Fi/Bluetooth firmware; the wired port needs none.
apk add --no-cache alpine-base openrc linux-rpi raspberrypi-bootloader linux-firmware-brcm mkinitfs e2fsprogs \
    docker avahi dbus jq curl iproute2 util-linux
mkdir -p /etc/mkinitfs
printf 'features="base ext4 mmc usb scsi"\n' > /etc/mkinitfs/mkinitfs.conf
KVER=$(ls /lib/modules | head -n1)
mkinitfs -o /boot/initramfs-rpi "$KVER"
rc-update add devfs sysinit; rc-update add dmesg sysinit; rc-update add mdev sysinit; rc-update add hwdrivers sysinit
rc-update add hwclock boot; rc-update add modules boot; rc-update add hostname boot; rc-update add bootmisc boot; rc-update add networking boot
rc-update add dbus default; rc-update add avahi-daemon default; rc-update add docker default
printf 'auto lo\niface lo inet loopback\n\nauto eth0\niface eth0 inet dhcp\n' > /etc/network/interfaces
echo "worldlens-map" > /etc/hostname
printf 'LABEL=worldlens-root / ext4 defaults,noatime 0 1\nLABEL=WLBOOT /boot vfat defaults 0 2\n' > /etc/fstab
sed -i 's/^tty1::.*$/tty1::respawn:\/bin\/sleep 3600/' /etc/inittab || true
CHROOT

echo "== install the worldlens files and the arm64 map-server image tar"
cp -a "$HERE/overlay/." "$WORK/root/"
chmod 0755 "$WORK/root/etc/init.d/worldlens-map" "$WORK/root/usr/local/sbin/worldlens-map-boot"
chroot "$WORK/root" rc-update add worldlens-map default
mkdir -p "$WORK/root/var/lib/worldlens"
cp "$MAPSERVER_TAR" "$WORK/root/var/lib/worldlens/mapserver.tar"
sha256sum "$MAPSERVER_TAR" | cut -d' ' -f1 > "$WORK/root/var/lib/worldlens/mapserver.tar.sha256"

echo "== Pi boot files"
B="$WORK/root/boot"
# Some Alpine releases keep the device trees in a subfolder; the Pi firmware looks at the root.
if [ -d "$B/dtbs-rpi" ]; then cp -a "$B/dtbs-rpi/." "$B/"; fi
for f in bootcode.bin start4.elf fixup4.dat vmlinuz-rpi initramfs-rpi; do
    [ -e "$B/$f" ] || { echo "missing $f on the boot partition" >&2; exit 1; }
done
ls "$B"/bcm27*.dtb >/dev/null 2>&1 || { echo "no Raspberry Pi device trees on the boot partition" >&2; exit 1; }
tee "$B/config.txt" >/dev/null <<EOF
# Worldlens appliance for Raspberry Pi 3, 4 and 5.
arm_64bit=1
kernel=vmlinuz-rpi
initramfs initramfs-rpi followkernel
disable_overscan=1
[pi4]
enable_gic=1
[all]
EOF
printf 'root=LABEL=worldlens-root rootfstype=ext4 modules=ext4 rootwait console=tty1 quiet\n' > "$B/cmdline.txt"
KVER=$(ls "$WORK/root/lib/modules" | head -n1)
echo "kernel: $KVER"

echo "== finish"
sync
cleanup
trap - EXIT
(cd "$OUT" && sha256sum "$(basename "$IMG")" > "$(basename "$IMG").sha256")
echo "wrote $IMG"
