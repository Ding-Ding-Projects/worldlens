[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [int]$McpPort = 18767,
    [int]$CdpPort = 19441,
    [string]$LowlevelRoot = ""
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($LowlevelRoot)) {
    $LowlevelRoot = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "GitHub\lowlevel-computer-use-mcp"
}
$lowlevel = (Resolve-Path -LiteralPath $LowlevelRoot).Path
$pythonw = Join-Path $lowlevel ".venv\Scripts\pythonw.exe"
$edgeCandidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $edge) { throw "Microsoft Edge was not found in a supported installed location." }
if (-not (Test-Path -LiteralPath $pythonw -PathType Leaf)) { throw "Lowlevel MCP is not installed." }

$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $output | Out-Null
$profile = Join-Path ([IO.Path]::GetTempPath()) ("worldlens-pages-edge-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $profile | Out-Null
$desktop = "WorldlensPages-" + [guid]::NewGuid().ToString("N").Substring(0, 10)
$api = "http://127.0.0.1:$McpPort/api/execute"
$server = $null
$edgePid = $null
$hwnd = $null

function Invoke-Lowlevel([string]$Tool, [hashtable]$Arguments) {
    $body = @{ tool = $Tool; arguments = $Arguments } | ConvertTo-Json -Depth 12 -Compress
    $answer = Invoke-RestMethod -Method Post -Uri $api -ContentType "application/json" -Body $body -TimeoutSec 60
    if ($answer.ok -ne $true) { throw "Lowlevel $Tool failed: $($answer.error)" }
    return $answer
}

function Get-ExactPhaseUrl([string]$RequestedUrl) {
    $targets = @(Invoke-RestMethod -Uri "http://127.0.0.1:$CdpPort/json/list" -TimeoutSec 5)
    if ($targets.Count -ne 1 -or $targets[0].type -ne "page") {
        throw "The isolation proof requires exactly one page target before each capture phase."
    }
    $requested = [Uri]$RequestedUrl
    $actual = [Uri]([string]$targets[0].url)
    if ($actual.GetLeftPart([UriPartial]::Path) -ne $requested.GetLeftPart([UriPartial]::Path) -or
        $actual.Query -ne $requested.Query) {
        throw "The page target changed origin, path, or query before capture."
    }
    return $actual.AbsoluteUri
}

try {
    $server = Start-Process -FilePath $pythonw -ArgumentList @(
        "-m", "lowlevel_computer_use_mcp.server", "--http", "--legacy-http",
        "--host", "127.0.0.1", "--port", [string]$McpPort
    ) -WorkingDirectory $lowlevel -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(45)
    do {
        try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$McpPort/health" -TimeoutSec 2 } catch {}
        if ($health) { break }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    if (-not $health) { throw "Lowlevel MCP did not become healthy." }

    $arguments = @(
        "--app=$Url",
        "--user-data-dir=$profile",
        "--remote-debugging-port=$CdpPort",
        "--guest", "--disable-sync", "--disable-extensions",
        "--disable-component-extensions-with-background-pages", "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=msEdgeFirstRunExperience,msEdgeSignin,msEdgeSync",
        "--window-size=1280,800"
    ) | ForEach-Object { '"' + $_ + '"' }
    $command = '"' + $edge + '" ' + ($arguments -join ' ')
    $launch = Invoke-Lowlevel "launch_on_headless_desktop" @{ name = $desktop; command = $command }
    $edgePid = [int]$launch.pid

    $deadline = (Get-Date).AddSeconds(45)
    do {
        $inventory = Invoke-Lowlevel "list_headless_windows" @{ name = $desktop }
        $matches = @($inventory.windows | Where-Object {
            $_.class -eq "Chrome_WidgetWin_1" -and [int]$_.width -gt 0 -and [int]$_.height -gt 0
        })
        if ($matches.Count -eq 1) { break }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    if ($matches.Count -ne 1) { throw "Expected exactly one Edge application window." }
    $hwnd = [int64]$matches[0].handle

    $edgeHash = (Get-FileHash -LiteralPath $edge -Algorithm SHA256).Hash.ToLowerInvariant()
    $edgeVersion = (Get-Item -LiteralPath $edge).VersionInfo.FileVersion
    $verifier = "C:\Users\cntow\.agents\skills\verify-headless-site\scripts\verify-edge-target.mjs"
    foreach ($phase in @("preflight", "capture")) {
        $phaseUrl = if ($phase -eq "preflight") { $Url } else { Get-ExactPhaseUrl $Url }
        node $verifier --endpoint "http://127.0.0.1:$CdpPort/json/list" --expected-url $phaseUrl `
            --run-root $output --edge-executable $edge --edge-sha256 $edgeHash `
            --edge-version $edgeVersion --launch-pid ([string]$edgePid) --phase $phase `
            --output (Join-Path $output "target-$phase.json")
        if ($LASTEXITCODE -ne 0) { throw "Edge target $phase proof failed." }
    }
    $shot = Invoke-Lowlevel "screenshot" @{ hwnd = $hwnd }
    Copy-Item -LiteralPath $shot.path -Destination (Join-Path $output "pages-live.png") -Force
    $finalUrl = Get-ExactPhaseUrl $Url
    node $verifier --endpoint "http://127.0.0.1:$CdpPort/json/list" --expected-url $finalUrl `
        --run-root $output --edge-executable $edge --edge-sha256 $edgeHash `
        --edge-version $edgeVersion --launch-pid ([string]$edgePid) --phase final `
        --output (Join-Path $output "target-final.json")
    if ($LASTEXITCODE -ne 0) { throw "Edge target final proof failed." }
} finally {
    if ($edgePid -and (Get-Process -Id $edgePid -ErrorAction SilentlyContinue)) {
        try { Invoke-Lowlevel "kill_process" @{ pid = $edgePid; force = $true } | Out-Null } catch {}
    }
    try { Invoke-Lowlevel "close_headless_desktop" @{ name = $desktop } | Out-Null } catch {}
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd("\")
    $profilePath = [IO.Path]::GetFullPath($profile)
    if ($profilePath.StartsWith($tempRoot + "\", [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $profilePath).StartsWith("worldlens-pages-edge-")) {
        Remove-Item -LiteralPath $profilePath -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Output "Live Pages Lowlevel evidence: $output"
