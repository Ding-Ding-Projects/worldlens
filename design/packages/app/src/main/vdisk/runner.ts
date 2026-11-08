import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** The result of one script run. `cancelled` means the Windows permission prompt was declined. */
export interface ScriptOutcome {
    readonly ok: boolean;
    readonly cancelled: boolean;
    readonly output: string;
    readonly exitCode: number | null;
}

/**
 * Runs disk scripts. Injected so the IPC layer and Quick pack are testable on any platform and so
 * nothing in a test can ever touch a real disk.
 */
export interface DiskScriptRunner {
    /** A read-only PowerShell query that needs no elevation; returns stdout. */
    query(script: string): Promise<string>;
    /** A DiskPart script run with administrator rights through the Windows permission prompt. */
    diskpart(script: string): Promise<ScriptOutcome>;
    /** A PowerShell script run with administrator rights through the Windows permission prompt. */
    elevatedPowerShell(script: string): Promise<ScriptOutcome>;
}

const powershell = (): string => path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

const psQuote = (value: string): string => `'${value.replace(/'/gu, "''")}'`;

/**
 * The Windows runner. Elevated work goes through `Start-Process -Verb RunAs`, which shows the
 * standard permission prompt; output is written to a log file in a private temp folder because an
 * elevated process cannot share the caller's pipes. A declined prompt surfaces as PowerShell's
 * "canceled by the user" error and is reported as `cancelled`, never as success.
 */
export function createWindowsRunner(workDir: string): DiskScriptRunner {
    const run = async (body: string, kind: "diskpart" | "powershell"): Promise<ScriptOutcome> => {
        const dir = path.join(workDir, "vdisk-runs", randomUUID());
        await fs.mkdir(dir, { recursive: true });
        const script = path.join(dir, kind === "diskpart" ? "script.txt" : "script.ps1");
        const log = path.join(dir, "output.log");
        await fs.writeFile(script, body, "utf8");
        const inner =
            kind === "diskpart"
                ? `diskpart.exe /s "${script}" > "${log}" 2>&1`
                : `"${powershell()}" -NoProfile -ExecutionPolicy Bypass -File "${script}" > "${log}" 2>&1`;
        const launcher = [
            "$ErrorActionPreference = 'Stop'",
            "try {",
            // `/s` plus one outer pair of quotes: cmd strips exactly that pair and keeps the
            // quotes around the PowerShell path, the script and the log intact. Without it, a
            // command line that starts with a quote loses its first and last quote.
            `  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/s','/c',${psQuote(`"${inner}"`)}) -Verb RunAs -WindowStyle Hidden -Wait -PassThru`,
            "  Write-Output ('EXIT:' + $p.ExitCode)",
            "} catch {",
            "  if ($_.Exception.Message -match 'cancel') { Write-Output 'CANCELLED' } else { Write-Output ('ERROR:' + $_.Exception.Message) }",
            "}",
        ].join("\n");
        try {
            const { stdout } = await execFileAsync(powershell(), ["-NoProfile", "-NonInteractive", "-Command", launcher], { windowsHide: true, timeout: 30 * 60_000, maxBuffer: 4 * 1024 * 1024 });
            const output = await fs.readFile(log, "utf8").catch(() => "");
            if (stdout.includes("CANCELLED")) return { ok: false, cancelled: true, output: "The Windows permission prompt was declined. Nothing was changed.", exitCode: null };
            const exit = /EXIT:(-?\d+)/u.exec(stdout);
            const code = exit ? Number(exit[1]) : null;
            const error = /ERROR:(.*)/u.exec(stdout)?.[1];
            return { ok: code === 0, cancelled: false, output: error ?? output, exitCode: code };
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    };
    return {
        query: async (script) => {
            // Long scripts (the VirtDisk shim is several kilobytes) go through a file, which
            // keeps them clear of the command-line length limit and of argument quoting.
            const dir = path.join(workDir, "vdisk-queries", randomUUID());
            await fs.mkdir(dir, { recursive: true });
            const file = path.join(dir, "query.ps1");
            await fs.writeFile(file, script, "utf8");
            try {
                const { stdout } = await execFileAsync(powershell(), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { windowsHide: true, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
                return stdout;
            } finally {
                await fs.rm(dir, { recursive: true, force: true });
            }
        },
        diskpart: (script) => run(script, "diskpart"),
        elevatedPowerShell: (script) => run(script, "powershell"),
    };
}
