$ErrorActionPreference = 'Stop'

$desktopRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$electronDist = Join-Path $desktopRoot 'node_modules\electron\dist'
$sourceModules = Join-Path $desktopRoot 'node_modules'
$downloadsDir = Join-Path $desktopRoot 'downloads'
$archivePath = Join-Path $downloadsDir 'SAMELCII-Desktop-Windows.zip'
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = Join-Path $tempBase ('samelcii-desktop-' + [guid]::NewGuid().ToString('N'))
$portableRoot = Join-Path $tempRoot 'SAMELCII Desktop'
$appRoot = Join-Path $portableRoot 'resources\app'

if (!(Test-Path -LiteralPath (Join-Path $electronDist 'electron.exe'))) {
    throw 'Electron runtime is missing. Run npm install in the desktop folder first.'
}
if (!(Test-Path -LiteralPath (Join-Path $sourceModules 'sqlite3\package.json'))) {
    throw 'SQLite runtime is missing. Run npm install in the desktop folder first.'
}

New-Item -ItemType Directory -Path $portableRoot -Force | Out-Null
New-Item -ItemType Directory -Path $appRoot -Force | Out-Null
New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null

try {
    Copy-Item -Path (Join-Path $electronDist '*') -Destination $portableRoot -Recurse -Force

    $electronExe = Join-Path $portableRoot 'electron.exe'
    $appExe = Join-Path $portableRoot 'SAMELCII Desktop.exe'
    Move-Item -LiteralPath $electronExe -Destination $appExe -Force

    $rcedit = Join-Path $desktopRoot 'tools\rcedit-x64.exe'
    $iconPath = Join-Path $desktopRoot 'build\icon.ico'
    if ((Test-Path -LiteralPath $rcedit) -and (Test-Path -LiteralPath $iconPath)) {
        & $rcedit $appExe --set-icon $iconPath
        if ($LASTEXITCODE -ne 0) { throw "rcedit failed to set the icon (exit $LASTEXITCODE)." }
    } else {
        Write-Warning 'Skipping icon stamp: tools\rcedit-x64.exe or build\icon.ico not found.'
    }

    $defaultApp = Join-Path $portableRoot 'resources\default_app.asar'
    if (Test-Path -LiteralPath $defaultApp) {
        Remove-Item -LiteralPath $defaultApp -Force
    }

    Copy-Item -LiteralPath (Join-Path $desktopRoot 'main.js') -Destination $appRoot -Force
    Copy-Item -LiteralPath (Join-Path $desktopRoot 'preload.js') -Destination $appRoot -Force
    Copy-Item -LiteralPath (Join-Path $desktopRoot 'popupPolicy.js') -Destination $appRoot -Force
    Copy-Item -LiteralPath (Join-Path $desktopRoot 'package.json') -Destination $appRoot -Force
    Copy-Item -LiteralPath (Join-Path $desktopRoot 'build') -Destination $appRoot -Recurse -Force
    # Keep the server address beside the EXE so another PC can change it without rebuilding.
    Copy-Item -LiteralPath (Join-Path $desktopRoot 'server-url.txt') -Destination $portableRoot -Force

    $packagedModules = Join-Path $appRoot 'node_modules'
    New-Item -ItemType Directory -Path $packagedModules -Force | Out-Null
    Get-ChildItem -LiteralPath $sourceModules -Force |
        Where-Object { $_.Name -notin @('electron', '.bin', '.package-lock.json') } |
        ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $packagedModules -Recurse -Force
        }

    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }
    Compress-Archive -LiteralPath $portableRoot -DestinationPath $archivePath -CompressionLevel Optimal

    $archive = Get-Item -LiteralPath $archivePath
    Write-Host ('Built {0} ({1:N1} MB)' -f $archive.FullName, ($archive.Length / 1MB))
} finally {
    $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
    if ($resolvedTemp.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
