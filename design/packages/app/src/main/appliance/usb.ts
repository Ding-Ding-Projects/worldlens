import type { DiskScriptRunner } from "../vdisk/runner.js";
import type { UsbDisk } from "./types.js";

const psQuote = (value: string): string => `'${value.replace(/'/gu, "''")}'`;

/** Read-only: USB disks that are neither the boot nor the system disk. Needs no elevation. */
export const LIST_USB_SCRIPT =
    "Get-Disk | Where-Object { $_.BusType -eq 'USB' -and -not $_.IsBoot -and -not $_.IsSystem } | Select-Object Number,FriendlyName,Size | ConvertTo-Json -Compress";

export function parseUsbDisks(json: string): UsbDisk[] {
    const text = json.trim();
    if (!text) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return [];
    }
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const out: UsbDisk[] = [];
    for (const row of rows) {
        if (row === null || typeof row !== "object") continue;
        const r = row as { Number?: unknown; FriendlyName?: unknown; Size?: unknown };
        if (typeof r.Number === "number" && Number.isInteger(r.Number) && r.Number >= 0 && typeof r.FriendlyName === "string" && typeof r.Size === "number" && r.Size > 0) {
            out.push({ number: r.Number, name: r.FriendlyName.trim(), sizeBytes: r.Size });
        }
    }
    return out.sort((a, b) => a.number - b.number);
}

export async function listUsbDisks(runner: DiskScriptRunner | null): Promise<UsbDisk[]> {
    if (!runner) return [];
    try {
        return parseUsbDisks(await runner.query(LIST_USB_SCRIPT));
    } catch {
        return [];
    }
}

export type UsbRefusal = "unknown-disk" | "name-mismatch" | "too-small";

/** The checks done in this process before anything is asked of the permission prompt. */
export function checkUsbChoice(disks: readonly UsbDisk[], number: number, typedName: string, imageBytes: number): { ok: true; disk: UsbDisk } | { ok: false; reason: UsbRefusal; message: string } {
    const disk = disks.find((d) => d.number === number);
    if (!disk) return { ok: false, reason: "unknown-disk", message: "That drive is not in the list of removable USB drives. It may have been unplugged. Refresh the list." };
    if (typedName.trim().toLowerCase() !== disk.name.toLowerCase() || typedName.trim() === "") return { ok: false, reason: "name-mismatch", message: `The name you typed does not match the drive (${disk.name}). Nothing was written.` };
    if (disk.sizeBytes < imageBytes) return { ok: false, reason: "too-small", message: `The drive holds ${(disk.sizeBytes / 1e9).toFixed(1)} GB but the image needs ${(imageBytes / 1e9).toFixed(1)} GB.` };
    return { ok: true, disk };
}

/**
 * The script that runs elevated. It repeats the safety checks against the live disk because the
 * list may be minutes old, writes the raw image sector-aligned, then reads the same number of bytes
 * back from the device and prints their SHA-256 for the caller to compare.
 */
export function usbWriteScript(input: { diskNumber: number; diskName: string; imagePath: string; imageBytes: number }): string {
    const n = String(Math.trunc(input.diskNumber));
    return [
        "$ErrorActionPreference = 'Stop'",
        `$n = ${n}`,
        "$d = Get-Disk -Number $n",
        `if ($d.BusType -ne 'USB' -or $d.IsBoot -or $d.IsSystem -or $d.FriendlyName.Trim() -ne ${psQuote(input.diskName)} -or $d.Size -lt ${input.imageBytes}) { Write-Output 'REFUSED'; exit 3 }`,
        "Clear-Disk -Number $n -RemoveData -RemoveOEM -Confirm:$false",
        "$dev = New-Object System.IO.FileStream(('\\\\.\\PhysicalDrive' + $n), [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::ReadWrite)",
        `$src = [System.IO.File]::OpenRead(${psQuote(input.imagePath)})`,
        "$buf = New-Object byte[] (4MB)",
        "try { while (($r = $src.Read($buf, 0, $buf.Length)) -gt 0) { $dev.Write($buf, 0, $r) }; $dev.Flush() } finally { $src.Close() }",
        "$dev.Position = 0",
        "$sha = [System.Security.Cryptography.SHA256]::Create()",
        `$left = ${input.imageBytes}`,
        "while ($left -gt 0) { $take = [Math]::Min($buf.Length, $left); $got = $dev.Read($buf, 0, $take); if ($got -le 0) { break }; [void]$sha.TransformBlock($buf, 0, $got, $null, 0); $left -= $got }",
        "[void]$sha.TransformFinalBlock($buf, 0, 0)",
        "$dev.Close()",
        "Update-Disk -Number $n -ErrorAction SilentlyContinue",
        "Write-Output ('READBACK:' + ([BitConverter]::ToString($sha.Hash).Replace('-', '').ToLower()))",
        "if ($left -ne 0) { Write-Output 'SHORT'; exit 4 }",
    ].join("\n");
}

export type UsbWriteOutcome = { ok: true; readbackSha256: string } | { ok: false; cancelled: boolean; message: string };

export async function runUsbWrite(runner: DiskScriptRunner, script: string, expectedSha256: string): Promise<UsbWriteOutcome> {
    const outcome = await runner.elevatedPowerShell(script);
    if (outcome.cancelled) return { ok: false, cancelled: true, message: "The Windows permission prompt was declined. Nothing was written to the drive." };
    if (/REFUSED/u.test(outcome.output)) return { ok: false, cancelled: false, message: "The drive no longer matched the chosen USB drive, so nothing was written." };
    const readback = /READBACK:([0-9a-f]{64})/u.exec(outcome.output)?.[1];
    if (!outcome.ok || !readback) return { ok: false, cancelled: false, message: `Writing the drive failed (exit ${outcome.exitCode ?? "unknown"}). ${outcome.output.slice(-400)}`.trim() };
    if (readback !== expectedSha256) return { ok: false, cancelled: false, message: "The drive was written, but reading it back did not match the image. Do not boot from it; write it again." };
    return { ok: true, readbackSha256: readback };
}
