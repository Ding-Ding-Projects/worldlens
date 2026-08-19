[CmdletBinding()]
param(
    [string]$LowlevelRoot = "",
    [int]$McpPort = 18765,
    [int]$CdpPort = 19333,
    [string]$OutputDirectory = "",
    [string]$PlanPath = "scripts/worldlens-lowlevel-e2e.json",
    [string]$WorldFolder = ""
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($LowlevelRoot)) {
    $documents = [Environment]::GetFolderPath("MyDocuments")
    $LowlevelRoot = Join-Path $documents "GitHub\lowlevel-computer-use-mcp"
}
$lowlevel = (Resolve-Path -LiteralPath $LowlevelRoot).Path
$pythonw = Join-Path $lowlevel ".venv\Scripts\pythonw.exe"
if (-not (Test-Path -LiteralPath $pythonw -PathType Leaf)) {
    throw "Lowlevel MCP is not installed at $lowlevel. Run uv sync in that checkout first."
}

$runRoot = Join-Path ([IO.Path]::GetTempPath()) ("worldlens-lowlevel-e2e-" + [guid]::NewGuid().ToString("N"))
$profile = Join-Path $runRoot "profile"
$logs = Join-Path $runRoot "logs"
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repo "artifacts\lowlevel-ui-e2e"
}
$outputBase = [IO.Path]::GetFullPath($OutputDirectory)
$output = Join-Path $outputBase ("run-" + (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Force -Path $profile, $logs, $output | Out-Null

$desktop = "WorldlensE2E-" + [guid]::NewGuid().ToString("N").Substring(0, 10)
$endpoint = "http://127.0.0.1:$McpPort/mcp"
$api = "http://127.0.0.1:$McpPort/api/execute"
$server = $null
$windowPid = $null
$hwnd = $null

function Invoke-Lowlevel([string]$Tool, [hashtable]$Arguments) {
    $body = @{ tool = $Tool; arguments = $Arguments } | ConvertTo-Json -Depth 12 -Compress
    $answer = Invoke-RestMethod -Method Post -Uri $api -ContentType "application/json" -Body $body -TimeoutSec 60
    if ($answer.ok -ne $true) {
        throw "Lowlevel $Tool failed: $($answer.error)"
    }
    return $answer
}

try {
    $server = Start-Process -FilePath $pythonw -ArgumentList @(
        "-m", "lowlevel_computer_use_mcp.server", "--http", "--legacy-http",
        "--host", "127.0.0.1", "--port", [string]$McpPort
    ) -WorkingDirectory $lowlevel -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logs "lowlevel.stdout.log") `
        -RedirectStandardError (Join-Path $logs "lowlevel.stderr.log")

    $deadline = (Get-Date).AddSeconds(45)
    do {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$McpPort/health" -TimeoutSec 2
            if ($health) { break }
        } catch {}
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    if (-not $health) { throw "Lowlevel MCP did not become healthy within 45 seconds." }

    $launcher = Join-Path $repo ".claude\skills\run-worldlens\launch-headless.cmd"
    $command = ('"{0}" {1} "{2}" "{3}"' -f $launcher, $CdpPort, $profile, $repo)
    Invoke-Lowlevel "launch_on_headless_desktop" @{ name = $desktop; command = $command } | Out-Null

    $deadline = (Get-Date).AddSeconds(45)
    do {
        $inventory = Invoke-Lowlevel "list_headless_windows" @{ name = $desktop }
        $matches = @($inventory.windows | Where-Object {
            $_.class -eq "Chrome_WidgetWin_1" -and $_.title -eq "Worldlens" -and
            [int]$_.width -gt 0 -and [int]$_.height -gt 0
        })
        if ($matches.Count -eq 1) { break }
        if ($matches.Count -gt 1) { throw "More than one Worldlens application window matched." }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    if ($matches.Count -ne 1) {
        [IO.File]::WriteAllText(
            (Join-Path $output "window-timeout-inventory.json"),
            (($inventory | ConvertTo-Json -Depth 12) + [Environment]::NewLine)
        )
        throw "Worldlens application window did not appear within 45 seconds."
    }
    $hwnd = [int64]$matches[0].handle
    $windowPid = [int]$matches[0].process_id

    $deadline = (Get-Date).AddSeconds(30)
    do {
        try {
            $targets = @(Invoke-RestMethod -Uri "http://127.0.0.1:$CdpPort/json/list" -TimeoutSec 2)
            if ($targets.Count -eq 1 -and $targets[0].type -eq "page") { break }
        } catch {}
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    if ($targets.Count -ne 1 -or $targets[0].type -ne "page") {
        throw "The isolation proof requires exactly one CDP page target."
    }

    $env:LOWLEVEL_MCP_ENDPOINT = $endpoint
    $env:WORLDLENS_DRIVER_HWND = [string]$hwnd
    $env:WORLDLENS_UI_ONLY = "1"
    $env:WORLDLENS_PLAN_EXIT = "1"
    $env:WORLDLENS_DRIVER_DESKTOP = $desktop
    $env:WORLDLENS_DRIVER_OUTPUT = $output
    $env:WORLDLENS_CAPTURE_COMMIT = (git -C $repo rev-parse HEAD).Trim()
    if (-not [string]::IsNullOrWhiteSpace($WorldFolder)) {
        $env:WORLDLENS_CI_WORLD = [IO.Path]::GetFullPath($WorldFolder)
    }
    "plan $PlanPath" |
        node (Join-Path $repo ".claude\skills\run-worldlens\driver.mjs") $CdpPort
    if ($LASTEXITCODE -ne 0) { throw "The Worldlens Lowlevel UI plan failed." }
} finally {
    Remove-Item Env:\LOWLEVEL_MCP_ENDPOINT -ErrorAction SilentlyContinue
    Remove-Item Env:\WORLDLENS_DRIVER_HWND -ErrorAction SilentlyContinue
    Remove-Item Env:\WORLDLENS_UI_ONLY -ErrorAction SilentlyContinue
    Remove-Item Env:\WORLDLENS_PLAN_EXIT -ErrorAction SilentlyContinue
    Remove-Item Env:\WORLDLENS_DRIVER_DESKTOP -ErrorAction SilentlyContinue
    Remove-Item Env:\WORLDLENS_DRIVER_OUTPUT -ErrorAction SilentlyContinue
    Remove-Item Env:\WORLDLENS_CAPTURE_COMMIT -ErrorAction SilentlyContinue
    Remove-Item Env:\WORLDLENS_CI_WORLD -ErrorAction SilentlyContinue
    if ($hwnd) {
        try { Invoke-Lowlevel "win_send_keys" @{ hwnd = $hwnd; keys = @("alt", "f4") } | Out-Null } catch {}
        Start-Sleep -Milliseconds 750
    }
    if ($windowPid -and (Get-Process -Id $windowPid -ErrorAction SilentlyContinue)) {
        try { Invoke-Lowlevel "kill_process" @{ pid = $windowPid; force = $true } | Out-Null } catch {}
    }
    try { Invoke-Lowlevel "close_headless_desktop" @{ name = $desktop } | Out-Null } catch {}
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    if (Test-Path -LiteralPath $logs -PathType Container) {
        Get-ChildItem -LiteralPath $logs -File | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $output $_.Name) -Force
        }
    }
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd("\")
    $resolvedRunRoot = [IO.Path]::GetFullPath($runRoot)
    if ($resolvedRunRoot.StartsWith($tempRoot + "\", [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedRunRoot).StartsWith("worldlens-lowlevel-e2e-")) {
        Remove-Item -LiteralPath $resolvedRunRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Output "Worldlens Lowlevel UI-only evidence: $output"
