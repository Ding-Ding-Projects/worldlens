[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("node", "git", "gh")]
    [string]$Tool,
    [switch]$DryRun,
    [switch]$TestFixture,
    [switch]$TestFailAfterBackup
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot 'portable-archive.ps1')
$repoRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "scripts\toolchain-manifest.json") | ConvertFrom-Json
$architecture = if ([Environment]::GetEnvironmentVariable("PROCESSOR_ARCHITECTURE") -eq "ARM64") { "arm64" } else { "x64" }
$entry = $manifest.portable.$Tool
$asset = if ($architecture -eq "arm64") { $entry.assetArm64 } else { $entry.assetX64 }
$expected = ([string]$entry.sha256.$architecture).ToLowerInvariant()
$version = [string]$entry.version
$base = if ($Tool -eq "node") { "https://nodejs.org/dist/v$version" } elseif ($Tool -eq "git") { "https://github.com/git-for-windows/git/releases/download/v$version.windows.3" } else { "https://github.com/cli/cli/releases/download/v$version" }
$url = "$base/$asset"
$toolchain = Join-Path $env:LOCALAPPDATA "worldlens-toolchain"
$archive = Join-Path $env:TEMP "worldlens-$Tool-$PID.zip"
$staging = Join-Path $toolchain ".$Tool-extract-$PID"
$destination = Join-Path $toolchain $Tool
$rollback = Join-Path $toolchain ".$Tool-rollback-$PID"

if ($DryRun) {
    $destinationState = if (Test-Path -LiteralPath $destination) { "warm" } else { "cold" }
    Write-Output "DRY RUN: $Tool uses the $destinationState user-scoped destination and a verified staging swap."
    exit 0
}

if (-not (Test-Path -LiteralPath $destination)) {
    $recovery = Get-ChildItem -LiteralPath $toolchain -Directory -Filter ".$Tool-rollback-*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $recovery) { Move-Item -LiteralPath $recovery.FullName -Destination $destination }
}

try {
    New-Item -ItemType Directory -Force -Path $toolchain | Out-Null
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    if ($TestFixture) {
        $root = New-Item -ItemType Directory -Force -Path (Join-Path $staging "fixture")
        if ($Tool -eq "node") { New-Item -ItemType File -Force -Path (Join-Path $root.FullName "node.exe") | Out-Null }
        elseif ($Tool -eq "git") { New-Item -ItemType Directory -Force -Path (Join-Path $root.FullName "cmd") | Out-Null; New-Item -ItemType File -Force -Path (Join-Path $root.FullName "cmd\git.exe") | Out-Null }
        else { New-Item -ItemType Directory -Force -Path (Join-Path $root.FullName "bin") | Out-Null; New-Item -ItemType File -Force -Path (Join-Path $root.FullName "bin\gh.exe") | Out-Null }
    } else {
        Write-Output "Downloading pinned $Tool $version from $url"
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing -TimeoutSec 120
        $actual = Get-PortableArchiveSha256 $archive
        if ($actual -ne $expected) { throw "$Tool SHA-256 mismatch: expected $expected, received $actual." }
        Expand-VerifiedPortableArchive $archive $staging $expected
        if ($Tool -eq "node") {
            $root = Get-ChildItem -LiteralPath $staging -Directory | Where-Object { Test-Path (Join-Path $_.FullName "node.exe") } | Select-Object -First 1
        } elseif ($Tool -eq "git") {
            $root = Get-ChildItem -LiteralPath $staging -Directory | Where-Object { Test-Path (Join-Path $_.FullName "cmd\git.exe") } | Select-Object -First 1
        } else {
            $root = Get-ChildItem -LiteralPath $staging -Directory | Where-Object { Test-Path (Join-Path $_.FullName "bin\gh.exe") } | Select-Object -First 1
        }
    }
    if ($null -eq $root) { throw "$Tool archive did not contain its expected executable layout." }
    if (Test-Path -LiteralPath $rollback) { Remove-Item -LiteralPath $rollback -Recurse -Force }
    $hadDestination = Test-Path -LiteralPath $destination
    if ($hadDestination) { Move-Item -LiteralPath $destination -Destination $rollback }
    try {
        if ($TestFailAfterBackup) { throw "fixture replacement failure after backup" }
        Move-Item -LiteralPath $root.FullName -Destination $destination
    }
    catch {
        if ($hadDestination -and (Test-Path -LiteralPath $rollback) -and -not (Test-Path -LiteralPath $destination)) {
            Move-Item -LiteralPath $rollback -Destination $destination
        }
        throw
    }
    if (Test-Path -LiteralPath $rollback) { Remove-Item -LiteralPath $rollback -Recurse -Force }
    Write-Output "Installed pinned $Tool $version at $destination"
}
finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue }
}
