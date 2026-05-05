<#
.SYNOPSIS
    Interactive runner for the Playwright e2e suite.

.DESCRIPTION
    Starts backend and frontend if they're not already up, then offers a menu
    (UI / headed / headless / codegen / report). Expects postgres/redis to be
    available locally. Anything the script started, the script stops on exit.

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

$BackendOutLog  = Join-Path $env:TEMP 'sub12-e2e-backend.out.log'
$BackendErrLog  = Join-Path $env:TEMP 'sub12-e2e-backend.err.log'
$FrontendOutLog = Join-Path $env:TEMP 'sub12-e2e-frontend.out.log'
$FrontendErrLog = Join-Path $env:TEMP 'sub12-e2e-frontend.err.log'

$script:BackendProc  = $null
$script:FrontendProc = $null

$PowerShellExe = (Get-Command powershell -ErrorAction Stop).Source

function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        return
    }

    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }

        $idx = $trimmed.IndexOf('=')
        if ($idx -le 0) {
            continue
        }

        $key = $trimmed.Substring(0, $idx).Trim()
        $value = $trimmed.Substring($idx + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
}

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
    Import-DotEnv (Join-Path $RepoRoot '.env')

    # 1. Infra
    Write-Host 'infra startup via docker is skipped; expecting local postgres/redis services'

    # 2. Backend
    if (Test-Url 'http://localhost:8080/healthz') {
        Write-Host 'backend: already running on :8080'
    } else {
        Write-Host "seeding db + starting backend (logs: $BackendOutLog, $BackendErrLog)..."
        $hasMake = $null -ne (Get-Command make -ErrorAction SilentlyContinue)
        $hasPsql = $null -ne (Get-Command psql -ErrorAction SilentlyContinue)

        if ($hasMake) {
            $seedCommand = "Set-Location '$($RepoRoot.Path)\\backend'; make seed"
            $seed = Start-Process -FilePath $PowerShellExe -ArgumentList '-NoProfile', '-Command', $seedCommand `
                -RedirectStandardOutput $BackendOutLog -RedirectStandardError $BackendErrLog `
                -NoNewWindow -PassThru -Wait
            if ($seed.ExitCode -ne 0) { throw "seed failed - see $BackendErrLog" }
        } elseif ($hasPsql) {
            $dbUser = if ($env:DB_USER) { $env:DB_USER } else { 'sub12' }
            $dbPassword = $env:DB_PASSWORD
            if (-not $dbPassword) {
                throw 'DB_PASSWORD is required to run seed without make'
            }
            $dbHost = if ($env:DB_HOST) { $env:DB_HOST } else { 'localhost' }
            $dbPort = if ($env:DB_PORT) { $env:DB_PORT } else { '5432' }
            $dbName = if ($env:DB_NAME) { $env:DB_NAME } else { 'sub12' }
            $dbSSLMode = if ($env:DB_SSLMODE) { $env:DB_SSLMODE } else { 'disable' }
            $seedSqlPath = Join-Path $RepoRoot 'backend\\internal\\db\\seed\\seed.sql'
            $migrateUrl = "postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?sslmode=${dbSSLMode}"
            $seedCommand = "`$env:PGPASSWORD='$dbPassword'; psql '$migrateUrl' -f '$seedSqlPath'"
            $seed = Start-Process -FilePath $PowerShellExe -ArgumentList '-NoProfile', '-Command', $seedCommand `
                -RedirectStandardOutput $BackendOutLog -RedirectStandardError $BackendErrLog `
                -NoNewWindow -PassThru -Wait
            if ($seed.ExitCode -ne 0) { throw "seed failed - see $BackendErrLog" }
        } else {
            Write-Warning 'Skipping seed: neither make nor psql is available in PATH'
        }

        if ($hasMake) {
            $runBackendCommand = "Set-Location '$($RepoRoot.Path)\\backend'; make run"
        } else {
            $runBackendCommand = "Set-Location '$($RepoRoot.Path)\\backend'; go run ./cmd/api"
        }
        $script:BackendProc = Start-Process -FilePath $PowerShellExe -ArgumentList '-NoProfile', '-Command', $runBackendCommand `
            -RedirectStandardOutput $BackendOutLog -RedirectStandardError $BackendErrLog `
            -NoNewWindow -PassThru
        Wait-Url 'http://localhost:8080/healthz' 'backend' 60
    }

    # 3. Frontend
    if (Test-Url 'http://localhost:5173') {
        Write-Host 'frontend: already running on :5173'
    } else {
        Write-Host "starting frontend (logs: $FrontendOutLog, $FrontendErrLog)..."
        $runFrontendCommand = "Set-Location '$($RepoRoot.Path)\\frontend'; npm run dev"
        $script:FrontendProc = Start-Process -FilePath $PowerShellExe -ArgumentList '-NoProfile', '-Command', $runFrontendCommand `
            -RedirectStandardOutput $FrontendOutLog -RedirectStandardError $FrontendErrLog `
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
