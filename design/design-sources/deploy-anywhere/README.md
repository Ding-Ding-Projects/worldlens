# Deploy WorldLens anywhere

Design boards for deploying the whole WorldLens application, not only a rendered map, in one click from the desktop app. Made on 2026-11-23.

| Board | What it shows |
| --- | --- |
| `Container.dc.html` | Deploy as a container: pick a Docker host (this PC, an SSH host, or add one), port, image (latest release or this build), which folders it may open and how, passkey sign-in where the first visitor becomes the owner, restart policy. One Deploy button and its steps, ending in the address. |
| `Appliance.dc.html` | Deploy as a virtual appliance, the whole application on its own small Linux machine: Hyper-V, VirtualBox, VMware Workstation, QEMU, a bootable USB, or an exported image (.img, .vmdk, .vhdx, .qcow2, .ova). Memory, processors and disk as steppers, network name, copy maps in, automatic updates with rollback. |
| `McServer.dc.html` | Deploy a Minecraft server as a virtual appliance: server software (Vanilla, Paper, Fabric, Forge, NeoForge, Purpur), version, world (from this PC, new, or downloaded), players, port, memory, target, live BlueMap and nightly backups, and the management site's sign-in: password, passkey, authenticator code, or any combination. The first person to open the site becomes the owner with full administrator rights, and open sign-up closes. |
| `Admin.dc.html` | The management site inside that appliance: status, start/stop/restart, live console with a command field, players with message, teleport and kick, settings, worlds, plugins and mods, backups, live map, bans, schedules, updates, and the people who can manage it with their roles and sign-in methods. |
| `Running.dc.html` | Every copy this app deployed, health-checked from this PC, with Open, Update, Stop and Remove (Remove behind the two-key confirmation), and a QR code to open one on a phone. |

## Builds on what exists

- The container is the existing hosted image (`docs/hosted-mode.md`), deployed through the existing Docker hosting manager (`docs/docker-hosting-manager.md`) and SSH host profiles.
- The appliance reuses the map appliance's base image and boot path (`docs/appliance.md`), running the hosted image instead of the map server.
- Health checks reuse the bounded check behind Hosted instances, which only reaches private, loopback and `.local` addresses.
