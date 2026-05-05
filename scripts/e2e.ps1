<#
.SYNOPSIS
    Interactive runner for the Playwright e2e suite.

.DESCRIPTION
    Auto-starts infra (postgres + redis), backend, and frontend if they're not
    already up, then offers a menu (UI / headed / headless / codegen / report).
    Anything the script started, the script stops on exit.

.PARAMETER Mode
    Skip the interactive menu. One of: ui, headed, headless, codegen, report.

.EXAMPLE
    .\scripts\e2e.ps1
    .\scripts\e2e.ps1 -Mode headless
#>
[CmdletBinding()]
param(
    [ValidateSet('ui', 'headed', 'headless', 'codegen', 'report')]
    [string]$Mode
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

$BackendLog  = Join-Path $env:TEMP 'sub12-e2e-backend.log'
$FrontendLog = Join-Path $env:TEMP 'sub12-e2e-frontend.log'

$script:BackendProc  = $null
$script:FrontendProc = $null

function Test-Url {
    param([string]$Url)
    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Wait-Url {
    param([string]$Url, [string]$Name, [int]$TimeoutSec = 60)
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        if (Test-Url $Url) {
            Write-Host "$Name ready at $Url"
            return
        }
        Start-Sleep -Seconds 1
    }
    throw "timeout waiting for $Name at $Url"
}

function Stop-Started {
    foreach ($p in @($script:BackendProc, $script:FrontendProc)) {
        if ($null -ne $p -and -not $p.HasExited) {
            Write-Host "stopping $($p.ProcessName) (pid $($p.Id))"
            try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch {}
        }
    }
}

try {
    # 1. Infra
    $running = & docker compose -f docker-compose.dev.yml ps --status running 2>$null
    if (-not $running) {
        Write-Host 'starting postgres + redis (make dev)...'
        & make dev
        if ($LASTEXITCODE -ne 0) { throw 'make dev failed' }
    } else {
        Write-Host 'postgres + redis: already running'
    }

    # 2. Backend
    if (Test-Url 'http://localhost:8080/healthz') {
        Write-Host 'backend: already running on :8080'
    } else {
        Write-Host "seeding db + starting backend (logs: $BackendLog)..."
        $seed = Start-Process -FilePath 'make' -ArgumentList 'seed' `
            -WorkingDirectory (Join-Path $RepoRoot 'backend') `
            -RedirectStandardOutput $BackendLog -RedirectStandardError $BackendLog `
            -NoNewWindow -PassThru -Wait
        if ($seed.ExitCode -ne 0) { throw "seed failed - see $BackendLog" }

        $script:BackendProc = Start-Process -FilePath 'make' -ArgumentList 'run' `
            -WorkingDirectory (Join-Path $RepoRoot 'backend') `
            -RedirectStandardOutput $BackendLog -RedirectStandardError $BackendLog `
            -NoNewWindow -PassThru
        Wait-Url 'http://localhost:8080/healthz' 'backend' 60
    }

    # 3. Frontend
    if (Test-Url 'http://localhost:5173') {
        Write-Host 'frontend: already running on :5173'
    } else {
        Write-Host "starting frontend (logs: $FrontendLog)..."
        $script:FrontendProc = Start-Process -FilePath 'npm' -ArgumentList 'run', 'dev' `
            -WorkingDirectory (Join-Path $RepoRoot 'frontend') `
            -RedirectStandardOutput $FrontendLog -RedirectStandardError $FrontendLog `
            -NoNewWindow -PassThru
        Wait-Url 'http://localhost:5173' 'frontend' 60
    }

    # 4. e2e deps
    $E2E = Join-Path $RepoRoot 'e2e'
    Set-Location $E2E
    if (-not (Test-Path (Join-Path $E2E 'node_modules'))) {
        Write-Host 'installing e2e deps...'
        & npm install
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    }
    $browserCache = Join-Path $env:LOCALAPPDATA 'ms-playwright'
    if (-not (Test-Path $browserCache)) {
        Write-Host 'installing chromium for playwright...'
        & npx playwright install --with-deps chromium
    }
    $envFile = Join-Path $E2E '.env'
    $envExample = Join-Path $E2E '.env.example'
    if ((-not (Test-Path $envFile)) -and (Test-Path $envExample)) {
        Write-Host 'creating e2e/.env from .env.example'
        Copy-Item $envExample $envFile
    }

    # 5. Mode (menu or flag)
    function Invoke-Mode {
        param([string]$M)
        switch ($M) {
            'ui'       { & npm run test:ui }
            'headed'   { & npm run test:headed }
            'headless' { & npm test }
            'codegen'  { & npm run codegen }
            'report'   { & npm run report }
            default    { throw "unknown mode: $M" }
        }
    }

    if ($Mode) {
        Invoke-Mode $Mode
    } else {
        Write-Host ''
        Write-Host 'What do you want to run?'
        Write-Host '  1) UI mode (recommended)'
        Write-Host '  2) Headed'
        Write-Host '  3) Headless (full suite)'
        Write-Host '  4) Codegen'
        Write-Host '  5) Show last report'
        Write-Host '  6) Quit'
        $choice = Read-Host '>'
        switch ($choice) {
            '1' { Invoke-Mode 'ui' }
            '2' { Invoke-Mode 'headed' }
            '3' { Invoke-Mode 'headless' }
            '4' { Invoke-Mode 'codegen' }
            '5' { Invoke-Mode 'report' }
            { $_ -in @('6', 'q', '') } { Write-Host 'bye' }
            default { throw "unknown choice: $choice" }
        }
    }
} finally {
    Stop-Started
}
