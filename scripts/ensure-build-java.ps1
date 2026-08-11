[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$feature = 25
$toolchainRoot = Join-Path $env:LOCALAPPDATA "worldlens-toolchain\java"
$installRoot = Join-Path $toolchainRoot "temurin-$feature"
$java = Join-Path $installRoot "bin\java.exe"

function Test-Java25([string]$Executable) {
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
    $priorPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { $banner = (& $Executable -version 2>&1 | Out-String) }
    finally { $ErrorActionPreference = $priorPreference }
    return $LASTEXITCODE -eq 0 -and $banner -match 'version\s+"(?<major>\d+)' -and [int]$Matches.major -ge $feature
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
    $uri = "https://api.adoptium.net/v3/assets/latest/$feature/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse"
    Write-Output "Resolving Eclipse Temurin $feature from Adoptium"
    $assets = Invoke-RestMethod -Uri $uri -Headers @{ Accept = "application/json" }
    $package = @($assets)[0].binary.package
    if (-not $package.link -or $package.checksum -notmatch '^[0-9a-fA-F]{64}$') {
        throw "Adoptium did not return a download URL and SHA-256 for Temurin $feature."
    }

    Write-Output "Downloading $($package.name) to the user-scoped Worldlens toolchain"
    Invoke-WebRequest -Uri $package.link -OutFile $archive
    $stream = [IO.File]::OpenRead($archive)
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $hashBytes = $sha.ComputeHash($stream) } finally { $sha.Dispose() }
    }
    finally { $stream.Dispose() }
    $actual = ([BitConverter]::ToString($hashBytes) -replace '-', '').ToLowerInvariant()
    $expected = ([string]$package.checksum).ToLowerInvariant()
    if ($actual -ne $expected) { throw "Temurin SHA-256 mismatch: expected $expected, received $actual." }

    New-Item -ItemType Directory -Path $staging | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $staging
    $candidate = Get-ChildItem -LiteralPath $staging -Filter java.exe -Recurse -File |
        Where-Object { $_.FullName -match '[\\/]bin[\\/]java\.exe$' } |
        Select-Object -First 1
    if ($null -eq $candidate) { throw "The verified Temurin archive contains no bin\java.exe." }
    $candidateRoot = Split-Path -Parent (Split-Path -Parent $candidate.FullName)
    if (-not (Test-Java25 $candidate.FullName)) { throw "The extracted Java executable is not Java $feature or newer." }

    if (Test-Path -LiteralPath $installRoot) { Remove-Item -LiteralPath $installRoot -Recurse -Force }
    Move-Item -LiteralPath $candidateRoot -Destination $installRoot
    if (-not (Test-Java25 $java)) { throw "Temurin verification failed after installation." }
    Write-Output "Installed and verified Temurin $feature at $installRoot"
}
finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
