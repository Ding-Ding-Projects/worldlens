[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("node", "git", "gh")]
    [string]$Tool
)

$ErrorActionPreference = "Stop"
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

try {
    New-Item -ItemType Directory -Force -Path $toolchain | Out-Null
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    Write-Output "Downloading pinned $Tool $version from $url"
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "$Tool SHA-256 mismatch: expected $expected, received $actual." }
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $staging -Force

    if ($Tool -eq "node") {
        $root = Get-ChildItem -LiteralPath $staging -Directory | Where-Object { Test-Path (Join-Path $_.FullName "node.exe") } | Select-Object -First 1
    } elseif ($Tool -eq "git") {
        $root = Get-ChildItem -LiteralPath $staging -Directory | Where-Object { Test-Path (Join-Path $_.FullName "cmd\git.exe") } | Select-Object -First 1
    } else {
        $root = Get-ChildItem -LiteralPath $staging -Directory | Where-Object { Test-Path (Join-Path $_.FullName "bin\gh.exe") } | Select-Object -First 1
    }
    if ($null -eq $root) { throw "$Tool archive did not contain its expected executable layout." }
    if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Recurse -Force }
    Move-Item -LiteralPath $root.FullName -Destination $destination
    Write-Output "Installed pinned $Tool $version at $destination"
}
finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue }
}
