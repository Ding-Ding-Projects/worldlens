function Test-CommittedJavaBanner([string]$Banner, [string]$ExpectedVersion) {
    $version = [regex]::Match($Banner, 'version\s+"(?<version>[^"\r\n]+)"')
    $runtime = [regex]::Match($Banner, '\(build\s+(?<build>[^)\r\n]+)\)')
    if (-not $version.Success -or -not $runtime.Success) { return $false }
    $expectedBase = $ExpectedVersion.Split('+')[0]
    $runtimeBuild = $runtime.Groups['build'].Value
    return $version.Groups['version'].Value -eq $expectedBase -and
        ($runtimeBuild -eq $ExpectedVersion -or $runtimeBuild -eq ($ExpectedVersion + '-LTS'))
}
