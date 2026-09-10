# Auto-Sync Script - Mirrors the local project to the live server and keeps watching for changes.

param(
    [switch]$MirrorOnly
)

$ErrorActionPreference = "Stop"

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$workDir = if ($env:SAMELCII_WORKDIR -and (Test-Path -LiteralPath $env:SAMELCII_WORKDIR)) {
    (Resolve-Path -LiteralPath $env:SAMELCII_WORKDIR).Path
} else {
    (Resolve-Path -LiteralPath $scriptRoot).Path
}
$serverDir = if ($env:SAMELCII_SERVER_DIR -and $env:SAMELCII_SERVER_DIR.Trim()) {
    $env:SAMELCII_SERVER_DIR.Trim()
} else {
    "\\192.168.1.99\htdocs\SAMELCII_WEB_SYSTEM"
}
$pollSeconds = 1

Set-Location $workDir

$excludePatterns = @(
    "\.git\\",
    "\\node_modules\\",
    "\\database\\backups\\",
    "\\desktop\\node_modules\\",
    "\\backend\\node_modules\\",
    "auto-sync\.ps1$",
    "START-AUTO-SYNC\.bat$",
    "SYNC-NOW\.bat$"
)

$robocopyExcludeDirs = @(
    ".git",
    "node_modules",
    "database\backups",
    "desktop\node_modules",
    "backend\node_modules"
)

$robocopyExcludeFiles = @(
    "auto-sync.ps1",
    "START-AUTO-SYNC.bat",
    "SYNC-NOW.bat"
)

function Test-ExcludedPath {
    param([string]$Path)
    foreach ($pattern in $excludePatterns) {
        if ($Path -match $pattern) {
            return $true
        }
    }
    return $false
}

function Assert-SafeServerDirectory {
    param([string]$Path)

    $normalized = $Path.TrimEnd('\')
    if ([string]::IsNullOrWhiteSpace($normalized)) {
        throw "Server directory is empty."
    }
    if ($normalized -match '^[A-Za-z]:\\?$') {
        throw "Refusing to sync to a drive root: $normalized"
    }
    if ($normalized -eq '\' -or $normalized -eq '\\') {
        throw "Refusing to sync to a filesystem root."
    }
    if ($normalized -notmatch 'SAMELCII_WEB_SYSTEM$') {
        throw "Refusing to sync to an unexpected target: $normalized"
    }
}

function Get-RelativePath {
    param(
        [string]$BasePath,
        [string]$FullPath
    )

    $base = [System.IO.Path]::GetFullPath($BasePath.TrimEnd('\'))
    $full = [System.IO.Path]::GetFullPath($FullPath)
    if (-not $full.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the workspace: $FullPath"
    }
    return $full.Substring($base.Length).TrimStart('\')
}

function Wait-FileReady {
    param([string]$Path)

    for ($i = 0; $i -lt 20; $i++) {
        try {
            $stream = [System.IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
            $stream.Close()
            return $true
        } catch {
            Start-Sleep -Milliseconds 150
        }
    }

    return $false
}

function Ensure-ServerRoot {
    if (-not (Test-Path -LiteralPath $serverDir)) {
        New-Item -ItemType Directory -Path $serverDir -Force | Out-Null
    }
}

function Invoke-FullMirror {
    Assert-SafeServerDirectory -Path $serverDir
    Ensure-ServerRoot

    $roboArgs = @(
        $workDir,
        $serverDir,
        "/MIR",
        "/R:1",
        "/W:1",
        "/NFL",
        "/NDL",
        "/NP",
        "/NJH",
        "/NJS"
    )

    if ($robocopyExcludeDirs.Count -gt 0) {
        $roboArgs += "/XD"
        $roboArgs += $robocopyExcludeDirs
    }
    if ($robocopyExcludeFiles.Count -gt 0) {
        $roboArgs += "/XF"
        $roboArgs += $robocopyExcludeFiles
    }

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Running full mirror..." -ForegroundColor Cyan
    & robocopy @roboArgs | Out-Null
    $exitCode = $LASTEXITCODE
    if ($exitCode -ge 8) {
        throw "Robocopy failed with exit code $exitCode."
    }
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Full mirror complete." -ForegroundColor Green
}

function Copy-FileToServer {
    param([string]$SourcePath)

    if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
        return
    }
    if (Test-ExcludedPath -Path $SourcePath) {
        return
    }
    if (-not (Wait-FileReady -Path $SourcePath)) {
        Write-Host "  Skipped locked file: $SourcePath" -ForegroundColor DarkYellow
        return
    }

    $relative = Get-RelativePath -BasePath $workDir -FullPath $SourcePath
    $destinationPath = Join-Path $serverDir $relative
    $destinationDir = Split-Path -Parent $destinationPath

    if (-not (Test-Path -LiteralPath $destinationDir)) {
        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    }

    Copy-Item -LiteralPath $SourcePath -Destination $destinationPath -Force
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Synced: $relative" -ForegroundColor Green
}

function Remove-FileFromServer {
    param([string]$SourcePath)

    if (Test-ExcludedPath -Path $SourcePath) {
        return
    }

    $relative = Get-RelativePath -BasePath $workDir -FullPath $SourcePath
    $destinationPath = Join-Path $serverDir $relative
    $resolvedServerPath = [System.IO.Path]::GetFullPath($destinationPath)
    $serverRoot = [System.IO.Path]::GetFullPath($serverDir.TrimEnd('\') + '\')
    if (-not $resolvedServerPath.StartsWith($serverRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to delete outside the server root: $resolvedServerPath"
    }

    if (Test-Path -LiteralPath $destinationPath -PathType Leaf) {
        Remove-Item -LiteralPath $destinationPath -Force
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Removed: $relative" -ForegroundColor Yellow
    }
}

function Get-WatchedFiles {
    Get-ChildItem -LiteralPath $workDir -Recurse -File -Force |
        Where-Object {
            -not (Test-ExcludedPath -Path $_.FullName)
        } |
        Select-Object FullName, LastWriteTimeUtc
}

Assert-SafeServerDirectory -Path $serverDir

Write-Host "========================================" -ForegroundColor Green
Write-Host "  AUTO-SYNC ENABLED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Source: $workDir" -ForegroundColor DarkGray
Write-Host "Target: $serverDir" -ForegroundColor DarkGray
Write-Host ""

Invoke-FullMirror

if ($MirrorOnly) {
    Write-Host "Mirror-only mode complete." -ForegroundColor Green
    exit 0
}

Write-Host "Watching for file changes..." -ForegroundColor Cyan
Write-Host "Polling every $pollSeconds second(s)..." -ForegroundColor DarkGray
Write-Host "Press CTRL+C to stop watching..." -ForegroundColor Magenta
Write-Host ""

$snapshot = @{}
foreach ($file in Get-WatchedFiles) {
    $snapshot[$file.FullName] = $file.LastWriteTimeUtc
}

while ($true) {
    Start-Sleep -Seconds $pollSeconds

    $current = @{}
    foreach ($file in Get-WatchedFiles) {
        $current[$file.FullName] = $file.LastWriteTimeUtc

        if (-not $snapshot.ContainsKey($file.FullName) -or $snapshot[$file.FullName] -ne $file.LastWriteTimeUtc) {
            try {
                Copy-FileToServer -SourcePath $file.FullName
            } catch {
                Write-Host "  Error syncing $($file.FullName): $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }

    foreach ($oldPath in $snapshot.Keys) {
        if (-not $current.ContainsKey($oldPath)) {
            try {
                Remove-FileFromServer -SourcePath $oldPath
            } catch {
                Write-Host "  Error removing ${oldPath}: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }

    $snapshot = $current
}
