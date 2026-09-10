# Deploy SAM AI / backend fixes from the local template to the live server share.
#
# ponytail: deliberately NOT a full-tree robocopy. As of 2026-07-29 the local
# template and live (\\192.168.1.99\htdocs\SAMELCII_WEB_SYSTEM) have diverged in
# BOTH directions — live's messenger script.js has features local lacks, local's
# backend has features live lacks. A blanket sync would silently delete live-only
# work. Only push files that have been hand-diffed and added to $Files below.
# Ceiling: doesn't scale past a handful of files/session — once the two trees are
# fully reconciled, switch to a real robocopy mirror and delete this comment.
#
# Usage: powershell -File scripts/deploy-live.ps1
#
# KNOWN ISSUE (2026-07-29): the self-check gate above reliably runs and reports
# real pass/fail counts, but the deploy loop below has been unreliable to verify
# from an automated tool-driven PowerShell invocation — output after the gate
# sometimes doesn't appear and the copy doesn't always land, with no error and
# exit code 0. Root cause not yet found (suspect stream-redirection interaction
# with the many `& node ...` child processes in the self-check loop). Verify any
# deploy from this script by grepping the live file for the expected change
# afterward — don't trust a clean run alone. Manual Copy-Item / editor-based
# deploy to the UNC path remains the reliable fallback.

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalRoot = Split-Path -Parent $ScriptDir
$LiveRoot  = "\\192.168.1.99\htdocs\SAMELCII_WEB_SYSTEM"

# Files confirmed safe for a BLIND full-file copy (local has no live-only content
# to lose) as of 2026-07-29. Add a line here ONLY after diffing local vs. live —
# do NOT add samPrompt.js, providers.js, app.js, or script.js: each has live-only
# customizations (warm personality text, a CPU-only model guard, missing auth on
# 3 routes, and a more advanced offline-handling UI) that a blind copy would
# silently delete. Those get surgical Edit-tool merges by hand instead, per file,
# per change — see today's session for the reasoning.
$Files = @(
    "backend\src\services\ai\samOrchestrator.js",
    "backend\src\routes\sam.contract.selfcheck.js"
)

Write-Host "== Running backend self-checks (deploy blocked on any failure) ==" -ForegroundColor Cyan
$backend = Join-Path $LocalRoot "backend"
$selfchecks = Get-ChildItem -Path (Join-Path $backend "src") -Recurse -Filter "*.selfcheck.js"
foreach ($check in $selfchecks) {
    Write-Host "  running $($check.FullName.Substring($backend.Length + 1))..."
    & node $check.FullName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ABORTED — self-check failed: $($check.Name)" -ForegroundColor Red
        exit 1
    }
}
Write-Host "All self-checks passed." -ForegroundColor Green

Write-Host "== Deploying reviewed files to live ==" -ForegroundColor Cyan
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
foreach ($rel in $Files) {
    $src = Join-Path $LocalRoot $rel
    $dst = Join-Path $LiveRoot $rel
    if (-not (Test-Path $src)) {
        Write-Host "SKIP (missing locally): $rel" -ForegroundColor Yellow
        continue
    }
    if (Test-Path $dst) {
        Copy-Item $dst "$dst.bak-$stamp"
    }
    Copy-Item $src $dst -Force
    Write-Host "  deployed: $rel"
}

Write-Host "== Verifying live copies are syntactically valid ==" -ForegroundColor Cyan
foreach ($rel in $Files) {
    if ($rel -notlike "*.js") { continue }
    $dst = Join-Path $LiveRoot $rel
    & node --check $dst
    if ($LASTEXITCODE -ne 0) {
        Write-Host "SYNTAX ERROR after deploy: $rel — restore from the .bak file just written." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Done. Remember: none of this is ACTIVE until the live Node process is (re)started (pm2)." -ForegroundColor Yellow
