#!/bin/sh
# Builds worldlens-appliance-base-x86_64.img: a small Alpine Linux BIOS-boot disk with Docker,
# the Worldlens map-server image (loaded on first boot from a bundled tar), avahi and the boot
# script that finds the map data partition the desktop app appends later.
#
# Needs root on Linux with losetup, sfdisk, mkfs.ext4, tar, curl, chroot. Run it in CI or in WSL:
#   sudo sh appliance/build-base.sh --mapserver-tar path/to/worldlens-map-server-x86_64.tar --out out/
#
# The output is raw, MBR, one bootable ext4 partition. The desktop app adds partition 2 (type 0xDA).
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck disable=SC1091
. "$HERE/alpine.pins"
ARCH=x86_64
SIZE_MB=${BASE_SIZE_MB:-1400}
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
[ -n "$MAPSERVER_TAR" ] && [ -f "$MAPSERVER_TAR" ] || { echo "--mapserver-tar must name the docker save tar of worldlens-map-server:bundled" >&2; exit 1; }

WORK=$(mktemp -d)
IMG="$OUT/worldlens-appliance-base-$ARCH.img"
mkdir -p "$OUT"
LOOP=
cleanup() {
    set +e
    for m in dev/pts dev proc sys; do umount "$WORK/root/$m" 2>/dev/null; done
    umount "$WORK/root" 2>/dev/null
    [ -n "$LOOP" ] && losetup -d "$LOOP" 2>/dev/null
    rm -rf "$WORK"
}
trap cleanup EXIT

echo "== fetch and verify the Alpine mini root filesystem"
curl -fsSL -o "$WORK/rootfs.tar.gz" "$ALPINE_ROOTFS_URL"
echo "$ALPINE_ROOTFS_SHA256  $WORK/rootfs.tar.gz" | sha256sum -c -

echo "== partition ${SIZE_MB} MiB"
rm -f "$IMG"
truncate -s "${SIZE_MB}M" "$IMG"
printf 'label: dos\nstart=2048, type=83, bootable\n' | sfdisk "$IMG" >/dev/null
LOOP=$(losetup --find --show --partscan "$IMG")
mkfs.ext4 -q -L worldlens-root -O ^64bit,^metadata_csum "${LOOP}p1"
mkdir -p "$WORK/root"
mount "${LOOP}p1" "$WORK/root"

echo "== unpack the root filesystem and install packages"
tar -xzf "$WORK/rootfs.tar.gz" -C "$WORK/root"
cp /etc/resolv.conf "$WORK/root/etc/resolv.conf"
mount -t proc proc "$WORK/root/proc"
mount -t sysfs sys "$WORK/root/sys"
mount --bind /dev "$WORK/root/dev"
mount -t devpts devpts "$WORK/root/dev/pts"
printf '%s\n%s\n' "$ALPINE_REPO/main" "$ALPINE_REPO/community" > "$WORK/root/etc/apk/repositories"
chroot "$WORK/root" /bin/sh -eu <<'CHROOT'
apk update
# linux-lts rather than linux-virt: the same image boots in VirtualBox, VMware and on a real PC from
# a USB stick, so it needs the common physical network drivers (and Realtek's firmware) as well as
# the virtual ones. linux-virt has no Realtek driver at all.
apk add --no-cache alpine-base openrc linux-lts linux-firmware-rtl_nic mkinitfs syslinux e2fsprogs \
    docker avahi dbus jq curl iproute2 util-linux open-vm-tools virtualbox-guest-additions
# Initramfs must carry every storage driver a VM, a USB stick or a Raspberry-class board can present.
mkdir -p /etc/mkinitfs
printf 'features="ata base ext4 scsi virtio usb nvme mmc"\n' > /etc/mkinitfs/mkinitfs.conf
KVER=$(ls /lib/modules | head -n1)
mkinitfs -o /boot/initramfs-lts "$KVER"
# hwdrivers loads the driver for whatever network card is present; mdev's scan alone left the
# VirtualBox Intel card without a driver, so the appliance booted with no eth0.
rc-update add devfs sysinit; rc-update add dmesg sysinit; rc-update add mdev sysinit; rc-update add hwdrivers sysinit
# Belt and braces for the virtual machines the app creates: Intel (VirtualBox), VMware, virtio.
printf 'af_packet\nipv6\ne1000\ne1000e\nvmxnet3\nvirtio_net\n' > /etc/modules
rc-update add hwclock boot; rc-update add modules boot; rc-update add hostname boot; rc-update add bootmisc boot; rc-update add networking boot
rc-update add dbus default; rc-update add avahi-daemon default; rc-update add docker default
rc-update add open-vm-tools default; rc-update add virtualbox-guest-additions default
printf 'auto lo\niface lo inet loopback\n\nauto eth0\niface eth0 inet dhcp\n' > /etc/network/interfaces
echo "worldlens-map" > /etc/hostname
# Console login is disabled on purpose: the appliance is not a general-purpose server.
sed -i 's/^tty1::.*$/tty1::respawn:\/bin\/sleep 3600/' /etc/inittab || true
CHROOT

echo "== install the worldlens files and the map-server image tar"
cp -a "$HERE/overlay/." "$WORK/root/"
chmod 0755 "$WORK/root/etc/init.d/worldlens-map" "$WORK/root/usr/local/sbin/worldlens-map-boot"
chroot "$WORK/root" rc-update add worldlens-map default
mkdir -p "$WORK/root/var/lib/worldlens"
cp "$MAPSERVER_TAR" "$WORK/root/var/lib/worldlens/mapserver.tar"
sha256sum "$MAPSERVER_TAR" | cut -d' ' -f1 > "$WORK/root/var/lib/worldlens/mapserver.tar.sha256"

echo "== boot loader (extlinux, BIOS)"
KVER=$(ls "$WORK/root/lib/modules" | head -n1)
mkdir -p "$WORK/root/boot/extlinux"
cat > "$WORK/root/boot/extlinux/extlinux.conf" <<EOF
DEFAULT worldlens
TIMEOUT 1
PROMPT 0
LABEL worldlens
    LINUX /boot/vmlinuz-lts
    INITRD /boot/initramfs-lts
    APPEND root=LABEL=worldlens-root rootfstype=ext4 modules=ext4 console=tty1 console=ttyS0 quiet
EOF
extlinux --install "$WORK/root/boot/extlinux" >/dev/null
dd if="$WORK/root/usr/share/syslinux/mbr.bin" of="$LOOP" bs=440 count=1 conv=notrunc 2>/dev/null || \
    dd if=/usr/lib/syslinux/mbr/mbr.bin of="$LOOP" bs=440 count=1 conv=notrunc
echo "kernel: $KVER"

echo "== finish"
sync
cleanup
trap - EXIT
(cd "$OUT" && sha256sum "$(basename "$IMG")" > "$(basename "$IMG").sha256")
echo "wrote $IMG"
