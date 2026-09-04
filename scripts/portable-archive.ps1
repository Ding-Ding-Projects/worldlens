# Uses framework APIs so a minimal PowerShell module path still verifies every byte.
function Get-PortableArchiveSha256([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose(); $stream.Dispose() }
}

function Expand-VerifiedPortableArchive([string]$Path, [string]$Destination, [string]$ExpectedSha256) {
    if ($ExpectedSha256 -notmatch '^[0-9a-f]{64}$') { throw 'Expected archive SHA-256 is invalid.' }
    if ((Get-PortableArchiveSha256 $Path) -ne $ExpectedSha256) { throw 'Portable archive SHA-256 mismatch.' }
    [void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem')
    [IO.Compression.ZipFile]::ExtractToDirectory($Path, $Destination)
}
