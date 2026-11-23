import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const applianceImage: Article = {
    id: "appliance-image",
    title: "Build a bootable map appliance",
    summary:
        "Build an appliance: a small Linux that boots straight into your map. Start it in VMware or VirtualBox in one click, write it to a USB stick, or export an image to install yourself.",
    category: "delivery",
    status: "ported-unverified",
    statusNote:
        "On the default branch. On 2026-11-23 the app's own builder booted a composed disk in VirtualBox (link healthy in 72 seconds) and in VMware Workstation (24 seconds), and CI boots the base under QEMU on every change. A Raspberry Pi image is built; it has not booted on a real board, and no USB stick or SD card has been written yet.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                { kind: "list", items: [
                        "Four targets: VMware Workstation, VirtualBox, a bootable USB drive, and Export image. Each shows whether its tool was found and which version.",
                        "The appliance is an Alpine Linux base with Docker and the map server already inside. Worldlens adds your map as a second partition, so building needs no Linux tools on Windows.",
                        "For VMware and VirtualBox it creates and starts the virtual machine with the memory, processors and network you chose, waits for it to report its address, checks the link from this PC, then shows it with Open and Copy.",
                        "Export writes .img, .vmdk, .vhdx or .ova with SHA256SUMS and INSTALL.txt beside it.",
                    ] },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                { kind: "paragraph", content: "Virtual machine name, network (bridged or NAT with a port forward), memory and processors are sliders and selects. Host name, web port and the access code switch apply to every target. The base image is fetched at build time by its pinned checksum and shipped inside the application, never at click time." },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                { kind: "list", items: [
                        "A missing VMware or VirtualBox is shown on its card before you start.",
                        "A virtual machine that does not report an address, or whose link does not answer, is reported as such rather than as ready.",
                        "Declining the administrator prompt for a USB write leaves the drive untouched and the result says it was not done.",
                    ] },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                { kind: "paragraph", content: "Only removable USB disks are listed, never the system or boot disk, and writing needs the drive name typed to confirm. The write is read back and compared by SHA-256 before it reports done. Windows asks for administrator approval for the write and Worldlens never bypasses that prompt. Only virtual machines this application created are started, stopped or removed." },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                { kind: "paragraph", content: "Unit tests cover the tar and partition writers, the VMDK, VHDX and OVA formats, the VMware and VirtualBox command plans, the USB and SD safety checks, the bundled base expansion and the dialog. Verified on 2026-11-23: one-click VirtualBox and VMware boots to a healthy link, removed afterwards; the PC base booting under QEMU in CI; the Raspberry Pi image mounting its root under QEMU's Pi 3 model. The first real boots found five defects (missing network driver, no PCIe root ports for VMware, unrecorded failed VMs, NAT port collisions, build scripts reporting success on failure), all fixed. Not verified: a real Raspberry Pi board, writing a real USB stick or SD card, Hyper-V mounting the VHDX, and importing the OVA." },
            ],
        },
    ],
    suggested: [
        { articleId: "share-host", reason: "Host the same map as a container on this PC or an SSH host." },
        { articleId: "live-viewer", reason: "A live 3D view of the server instead of the rendered map." },
    ],
    sources: [{ label: "docs/appliance.md", href: repoFile("docs/appliance.md") }],
};
