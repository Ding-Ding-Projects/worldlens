import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sha256File } from "./compose.js";
import { writeTarTo, type TarSource } from "./tar.js";
import { writeFixedVhdx } from "./vhdx.js";
import { writeSparseVmdk } from "./vmdk.js";
import type { ExportFormat } from "./types.js";

export const EXPORT_EXTENSION: Record<ExportFormat, string> = { img: "img", vmdk: "vmdk", vhdx: "vhdx", ova: "ova" };

const xmlEscape = (value: string): string => value.replace(/[<>&"']/gu, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c);

/** A minimal OVF 1.0 descriptor: one SATA disk, one NIC, the stated memory and processors. */
export function ovfText(input: { name: string; vmdkFile: string; vmdkBytes: number; capacityBytes: number; memoryMb: number; cpus: number }): string {
    const name = xmlEscape(input.name);
    return `<?xml version="1.0" encoding="UTF-8"?>
<Envelope ovf:version="1.0" xml:lang="en-US" xmlns="http://schemas.dmtf.org/ovf/envelope/1" xmlns:ovf="http://schemas.dmtf.org/ovf/envelope/1" xmlns:rasd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ResourceAllocationSettingData" xmlns:vssd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_VirtualSystemSettingData">
  <References>
    <File ovf:id="file1" ovf:href="${xmlEscape(input.vmdkFile)}" ovf:size="${input.vmdkBytes}"/>
  </References>
  <DiskSection>
    <Info>Virtual disk information</Info>
    <Disk ovf:diskId="vmdisk1" ovf:capacity="${input.capacityBytes}" ovf:fileRef="file1" ovf:format="http://www.vmware.com/interfaces/specifications/vmdk.html#sparse"/>
  </DiskSection>
  <NetworkSection>
    <Info>The list of logical networks</Info>
    <Network ovf:name="bridged"><Description>The network the appliance joins</Description></Network>
  </NetworkSection>
  <VirtualSystem ovf:id="${name}">
    <Info>Worldlens map appliance</Info>
    <Name>${name}</Name>
    <OperatingSystemSection ovf:id="101"><Info>Linux 64-bit</Info></OperatingSystemSection>
    <VirtualHardwareSection>
      <Info>Virtual hardware requirements</Info>
      <System><vssd:ElementName>Virtual Hardware Family</vssd:ElementName><vssd:InstanceID>0</vssd:InstanceID><vssd:VirtualSystemType>vmx-13</vssd:VirtualSystemType></System>
      <Item><rasd:Caption>${input.cpus} virtual CPU</rasd:Caption><rasd:ElementName>${input.cpus} virtual CPU</rasd:ElementName><rasd:InstanceID>1</rasd:InstanceID><rasd:ResourceType>3</rasd:ResourceType><rasd:VirtualQuantity>${input.cpus}</rasd:VirtualQuantity></Item>
      <Item><rasd:AllocationUnits>byte * 2^20</rasd:AllocationUnits><rasd:Caption>${input.memoryMb} MB of memory</rasd:Caption><rasd:ElementName>${input.memoryMb} MB of memory</rasd:ElementName><rasd:InstanceID>2</rasd:InstanceID><rasd:ResourceType>4</rasd:ResourceType><rasd:VirtualQuantity>${input.memoryMb}</rasd:VirtualQuantity></Item>
      <Item><rasd:Address>0</rasd:Address><rasd:Caption>SATA controller</rasd:Caption><rasd:ElementName>SATA controller</rasd:ElementName><rasd:InstanceID>3</rasd:InstanceID><rasd:ResourceSubType>AHCI</rasd:ResourceSubType><rasd:ResourceType>20</rasd:ResourceType></Item>
      <Item><rasd:AddressOnParent>0</rasd:AddressOnParent><rasd:Caption>Hard disk</rasd:Caption><rasd:ElementName>Hard disk</rasd:ElementName><rasd:HostResource>ovf:/disk/vmdisk1</rasd:HostResource><rasd:InstanceID>4</rasd:InstanceID><rasd:Parent>3</rasd:Parent><rasd:ResourceType>17</rasd:ResourceType></Item>
      <Item><rasd:AutomaticAllocation>true</rasd:AutomaticAllocation><rasd:Caption>Ethernet adapter</rasd:Caption><rasd:Connection>bridged</rasd:Connection><rasd:ElementName>Ethernet adapter</rasd:ElementName><rasd:InstanceID>5</rasd:InstanceID><rasd:ResourceSubType>E1000</rasd:ResourceSubType><rasd:ResourceType>10</rasd:ResourceType></Item>
    </VirtualHardwareSection>
  </VirtualSystem>
</Envelope>
`;
}

export function installNote(input: { format: ExportFormat; fileName: string; hostName: string; port: number; hasAccessCode: boolean }): string {
    const how: Record<ExportFormat, string> = {
        img: `Write ${input.fileName} to a USB drive or disk with a raw writer (for example balenaEtcher or dd), or attach it to a virtual machine as a raw disk.`,
        vmdk: `Create a new virtual machine in VMware or VirtualBox (Linux, 64-bit, BIOS firmware, SATA disk) and use ${input.fileName} as its existing disk.`,
        vhdx: `In Hyper-V Manager create a Generation 1 virtual machine (not Generation 2: the appliance boots with BIOS) and attach ${input.fileName} as its existing disk. Use an external virtual switch so it joins your network.`,
        ova: `Import ${input.fileName} with File > Open (VMware Workstation) or File > Import Appliance (VirtualBox). Choose a bridged network adapter.`,
    };
    return [
        "Worldlens map appliance",
        "=======================",
        "",
        how[input.format],
        "",
        "Memory: 512 MB or more is enough. One processor is enough.",
        `When it has booted, the console prints the address. The map also answers at http://${input.hostName}.local:${input.port}/ on most networks.`,
        input.hasAccessCode ? "The map asks for the access code you set when you built the appliance." : "No access code was set. Anyone on the network can open the map.",
        "",
        "Check the download first: compare the sha256 of the image with the line in SHA256SUMS.",
        "",
    ].join("\n");
}

export interface ExportResult {
    readonly files: readonly { readonly name: string; readonly sha256: string; readonly bytes: number }[];
    readonly primary: string;
}

/** Writes the chosen format, SHA256SUMS and INSTALL.txt beside it. `raw` is left untouched. */
export async function writeExport(input: {
    raw: string;
    directory: string;
    baseName: string;
    format: ExportFormat;
    hostName: string;
    port: number;
    hasAccessCode: boolean;
    memoryMb?: number;
    cpus?: number;
    onProgress?: (fraction: number) => void;
}): Promise<ExportResult> {
    await fs.mkdir(input.directory, { recursive: true });
    const fileName = `${input.baseName}.${EXPORT_EXTENSION[input.format]}`;
    const target = path.join(input.directory, fileName);
    if (await fs.stat(target).then(() => true, () => false)) throw new Error(`${fileName} already exists in the chosen folder. Choose another folder or name; nothing was overwritten.`);
    const rawBytes = (await fs.stat(input.raw)).size;
    if (input.format === "img") await fs.copyFile(input.raw, target, 1);
    else if (input.format === "vmdk") await writeSparseVmdk(input.raw, target, input.onProgress);
    else if (input.format === "vhdx") await writeFixedVhdx(input.raw, target, input.onProgress);
    else {
        const temp = path.join(input.directory, `${input.baseName}.ova-part.vmdk`);
        try {
            const vmdk = await writeSparseVmdk(input.raw, temp, input.onProgress);
            const ovfName = `${input.baseName}.ovf`;
            const ovf = Buffer.from(ovfText({ name: input.baseName, vmdkFile: `${input.baseName}.vmdk`, vmdkBytes: vmdk.bytes, capacityBytes: rawBytes, memoryMb: input.memoryMb ?? 1024, cpus: input.cpus ?? 2 }), "utf8");
            const vmdkSha = await sha256File(temp);
            const manifest = Buffer.from(`SHA256(${ovfName})= ${(await sha(ovf))}\nSHA256(${input.baseName}.vmdk)= ${vmdkSha}\n`, "utf8");
            const members: TarSource[] = [
                { name: ovfName, data: ovf },
                { name: `${input.baseName}.mf`, data: manifest },
                { name: `${input.baseName}.vmdk`, path: temp, size: vmdk.bytes },
            ];
            const handle = await fs.open(target, "w");
            try {
                await writeTarTo(handle, 0, members);
            } finally {
                await handle.close();
            }
        } finally {
            await fs.rm(temp, { force: true });
        }
    }
    const files: { name: string; sha256: string; bytes: number }[] = [];
    const main = { name: fileName, sha256: await sha256File(target), bytes: (await fs.stat(target)).size };
    files.push(main);
    const sumsPath = path.join(input.directory, "SHA256SUMS");
    const existing = await fs.readFile(sumsPath, "utf8").catch(() => "");
    const kept = existing.split("\n").filter((line) => line.trim() !== "" && !line.endsWith(`  ${fileName}`));
    await fs.writeFile(sumsPath, [...kept, `${main.sha256}  ${fileName}`].join("\n") + "\n", "utf8");
    await fs.writeFile(path.join(input.directory, "INSTALL.txt"), installNote({ format: input.format, fileName, hostName: input.hostName, port: input.port, hasAccessCode: input.hasAccessCode }), "utf8");
    return { files, primary: target };
}

async function sha(buffer: Buffer): Promise<string> {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(buffer).digest("hex");
}
