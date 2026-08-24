[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot "scripts\toolchain-manifest.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$javaManifest = $manifest.java
$feature = [int]$javaManifest.feature
$expectedVersion = [string]$javaManifest.version
$expectedRelease = [string]$javaManifest.release
$expectedAsset = [string]$javaManifest.asset
$expectedUrl = [string]$javaManifest.url
$expectedSha = ([string]$javaManifest.sha256).ToLowerInvariant()
if ([string]$javaManifest.architecture -ne "x64") { throw "The committed build Java manifest does not describe Windows x64." }
$architecture = [Environment]::GetEnvironmentVariable("PROCESSOR_ARCHITECTURE")
if ($architecture -notin @("AMD64", "x64")) { throw "The committed build Java archive is Windows x64 only, but this machine reports $architecture." }
$toolchainRoot = Join-Path $env:LOCALAPPDATA "worldlens-toolchain\java"
$installRoot = Join-Path $toolchainRoot "temurin-$feature"
$java = Join-Path $installRoot "bin\java.exe"

function Test-Java25([string]$Executable) {
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
    $priorPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { $banner = (& $Executable -version 2>&1 | Out-String) }
    finally { $ErrorActionPreference = $priorPreference }
    return $LASTEXITCODE -eq 0 -and $banner -match 'version\s+"(?<version>[^"]+)' -and $Matches.version -eq $expectedVersion
}

if (Test-Java25 $java) {
    Write-Output "Temurin $feature already verified at $installRoot"
    exit 0
}

New-Item -ItemType Directory -Force -Path $toolchainRoot | Out-Null
$runId = [Guid]::NewGuid().ToString("N")
$archive = Join-Path $toolchainRoot "temurin-$feature-$runId.zip"
$staging = Join-Path $toolchainRoot ".temurin-$feature-$runId"

try {
    Write-Output "Downloading committed Eclipse Temurin $expectedRelease ($expectedVersion) from $expectedUrl"
    Invoke-WebRequest -Uri $expectedUrl -OutFile $archive
    $stream = [IO.File]::OpenRead($archive)
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $hashBytes = $sha.ComputeHash($stream) } finally { $sha.Dispose() }
    }
    finally { $stream.Dispose() }
    $actual = ([BitConverter]::ToString($hashBytes) -replace '-', '').ToLowerInvariant()
    if ($actual -ne $expectedSha) { throw "Temurin SHA-256 mismatch: expected $expectedSha, received $actual." }

    New-Item -ItemType Directory -Path $staging | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $staging
    $candidate = Get-ChildItem -LiteralPath $staging -Filter java.exe -Recurse -File |
        Where-Object { $_.FullName -match '[\\/]bin[\\/]java\.exe$' } |
        Select-Object -First 1
    if ($null -eq $candidate) { throw "The verified Temurin archive contains no bin\java.exe." }
    $candidateRoot = Split-Path -Parent (Split-Path -Parent $candidate.FullName)
    if (-not (Test-Java25 $candidate.FullName)) { throw "The extracted Java executable is not the committed Temurin $expectedVersion release." }

    if (Test-Path -LiteralPath $installRoot) { Remove-Item -LiteralPath $installRoot -Recurse -Force }
    Move-Item -LiteralPath $candidateRoot -Destination $installRoot
    if (-not (Test-Java25 $java)) { throw "Temurin verification failed after installation." }
    Write-Output "Installed and verified Temurin $expectedRelease ($expectedVersion) at $installRoot"
}
finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
