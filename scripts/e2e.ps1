<#
.SYNOPSIS
    Interactive runner for the Playwright e2e suite.

.DESCRIPTION
    Starts postgres + redis via docker compose (if not already running), then
    starts backend and frontend if needed, seeds the DB, and offers a menu
    (UI / headed / headless / codegen / report).
    Anything the script started, the script stops on exit.

.PARAMETER Mode
    Skip the interactive menu. One of: ui, headed, headless, codegen, report.

.PARAMETER ForcePort
    Kill any process already listening on :8080 or :5173 before starting services.

.EXAMPLE
    .\scripts\e2e.ps1
    .\scripts\e2e.ps1 -Mode headless
    .\scripts\e2e.ps1 -ForcePort
#>
[CmdletBinding()]
param(
    [ValidateSet('ui', 'headed', 'headless', 'codegen', 'report')]
    [string]$Mode,
    [switch]$ForcePort
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
$BashExe = (Get-Command bash -ErrorAction SilentlyContinue).Source
$WslExe = (Get-Command wsl -ErrorAction SilentlyContinue).Source

$script:UseWslDocker = $false

function Convert-ToBashPath {
    param([string]$Path)

    $normalized = $Path -replace '\\', '/'
    if ($normalized -match '^([A-Za-z]):/(.*)$') {
        $drive = $Matches[1].ToLowerInvariant()
        $rest = $Matches[2]
        return "/$drive/$rest"
    }
    return $normalized
}

function Convert-ToWslPath {
    param([string]$Path)

    $normalized = $Path -replace '\\', '/'
    if ($normalized -match '^([A-Za-z]):/(.*)$') {
        $drive = $Matches[1].ToLowerInvariant()
        $rest = $Matches[2]
        return "/mnt/$drive/$rest"
    }
    return $normalized
}

function Test-BashCommand {
    param([string]$Command)

    if ([string]::IsNullOrEmpty($BashExe)) {
        return $false
    }

    & $BashExe -lc $Command *> $null
    return $LASTEXITCODE -eq 0
}

function Test-WslDocker {
    if ([string]::IsNullOrEmpty($WslExe)) {
        return $false
    }

    & $WslExe -e sh -lc 'docker info >/dev/null 2>&1'
    return $LASTEXITCODE -eq 0
}

function Invoke-Compose {
    param([string]$ComposeArgs)

    if ($script:UseWslDocker) {
        $repoWsl = Convert-ToWslPath $RepoRoot.Path
        $cmd = "cd '$repoWsl' && docker compose $ComposeArgs"
        & $WslExe -e sh -lc $cmd
    } else {
        $parts = $ComposeArgs -split ' '
        & docker compose @parts
    }
}

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
    param(
        [string]$Url,
        [string]$Name,
        [int]$TimeoutSec = 60,
        [System.Diagnostics.Process]$Process = $null,
        [string]$LogPath = $null
    )

    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        if (Test-Url $Url) {
            Write-Host "$Name ready at $Url"
            return
        }

        if ($null -ne $Process -and $Process.HasExited) {
            $logHint = if ($LogPath) { " - see $LogPath" } else { '' }
            throw "$Name process exited before becoming ready$logHint"
        }

        Start-Sleep -Seconds 1
    }
    throw "timeout waiting for $Name at $Url"
}

function Test-TcpPort {
    param(
        [string]$TargetHost,
        [int]$Port,
        [int]$TimeoutMs = 800
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect($TargetHost, $Port, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
            return $false
        }
        $client.EndConnect($iar)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Wait-TcpPort {
    param(
        [string]$TargetHost,
        [int]$Port,
        [string]$Name,
        [int]$TimeoutSec = 40
    )

    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        if (Test-TcpPort -TargetHost $TargetHost -Port $Port) {
            Write-Host "$Name ready at ${TargetHost}:$Port"
            return
        }
        Start-Sleep -Seconds 1
    }

    throw "timeout waiting for $Name at ${TargetHost}:$Port"
}

function Get-WslIPv4 {
    if ([string]::IsNullOrEmpty($WslExe)) {
        return $null
    }

    $ipRaw = & $WslExe -e sh -lc "hostname -I 2>/dev/null | awk '{print `$1}'"
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    $ip = ($ipRaw | Select-Object -First 1).ToString().Trim()
    if ($ip -match '^\d{1,3}(\.\d{1,3}){3}$') {
        return $ip
    }

    return $null
}

function Set-WslInfraHostEnv {
    if (-not $script:UseWslDocker) {
        return
    }

    # If localhost already works from Windows, keep existing env values.
    if ((Test-TcpPort -TargetHost 'localhost' -Port 5432) -and (Test-TcpPort -TargetHost 'localhost' -Port 6379)) {
        return
    }

    $wslIp = Get-WslIPv4
    if ([string]::IsNullOrEmpty($wslIp)) {
        return
    }

    if (-not (Test-TcpPort -TargetHost $wslIp -Port 5432 -TimeoutMs 1200)) {
        return
    }

    # Update both process env block and PowerShell's env provider view.
    [Environment]::SetEnvironmentVariable('DB_HOST', $wslIp, 'Process')
    $env:DB_HOST = $wslIp

    $currentRedis = if ($env:REDIS_URL) { $env:REDIS_URL.Trim() } else { '' }
    $redisMapped = $false

    if ([string]::IsNullOrEmpty($currentRedis)) {
        $currentRedis = "redis://$wslIp:6379"
        $redisMapped = $true
    } else {
        try {
            $uri = [Uri]$currentRedis
            if (($uri.Scheme -eq 'redis') -and ($uri.Host -match '^(localhost|127\.0\.0\.1|::1)$')) {
                $port = if ($uri.IsDefaultPort) { 6379 } else { $uri.Port }
                $tail = $uri.PathAndQuery
                if ([string]::IsNullOrEmpty($tail)) { $tail = '' }
                $currentRedis = "redis://${wslIp}:$port$tail"
                $redisMapped = $true
            }
        } catch {
            if ($currentRedis -match '^redis://(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?(/.*)?$') {
                $port = if ($Matches[2]) { $Matches[2] } else { ':6379' }
                $tail = if ($Matches[3]) { $Matches[3] } else { '' }
                $currentRedis = "redis://$wslIp$port$tail"
                $redisMapped = $true
            }
        }
    }

    if ($redisMapped) {
        [Environment]::SetEnvironmentVariable('REDIS_URL', $currentRedis, 'Process')
        $env:REDIS_URL = $currentRedis
    }

    Write-Host "infra host mapped to WSL IP $wslIp for DB/Redis connectivity"
    Write-Host "effective DB_HOST=$env:DB_HOST"
    Write-Host "effective REDIS_URL=$env:REDIS_URL"
}

function Get-ListeningProcess {
    param([int]$Port)

    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($null -eq $conn) {
            return $null
        }

        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($null -eq $proc) {
            return "PID $($conn.OwningProcess)"
        }
        return "PID $($conn.OwningProcess) ($($proc.ProcessName))"
    } catch {
        return $null
    }
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

    # 1. Infra (postgres + redis via docker compose)
    $dockerOk = $false
    try {
        $null = & docker info 2>&1
        $dockerOk = ($LASTEXITCODE -eq 0)
    } catch {}

    if ($dockerOk) {
        $script:UseWslDocker = $false
    } elseif (Test-WslDocker) {
        $dockerOk = $true
        $script:UseWslDocker = $true
        Write-Host 'docker: using WSL2 docker context'
    }

    if (-not $dockerOk) {
        $ans = Read-Host 'Docker daemon is not running in PowerShell or WSL2. Start Docker now, then press Enter to retry, or type S to skip infra startup'
        if ($ans -notmatch '^[Ss]') {
            $dockerOk = $false
            $script:UseWslDocker = $false
            try {
                $null = & docker info 2>&1
                $dockerOk = ($LASTEXITCODE -eq 0)
            } catch {}
            if (-not $dockerOk -and (Test-WslDocker)) {
                $dockerOk = $true
                $script:UseWslDocker = $true
                Write-Host 'docker: using WSL2 docker context'
            }
            if (-not $dockerOk) { throw 'Docker daemon is still not available in PowerShell or WSL2. Start Docker and re-run the script.' }
        }
    }

    if ($dockerOk) {
        $running = Invoke-Compose '-f docker-compose.dev.yml ps --status running'
        if ($running) {
            Write-Host 'postgres + redis: already running'
        } else {
            Write-Host 'starting postgres + redis...'
            Invoke-Compose '-f docker-compose.dev.yml up -d'
            if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }
            # Give postgres a moment to accept connections
            Start-Sleep -Seconds 3
        }
    } else {
        Write-Warning 'Skipping infra startup: Docker not available. Ensure postgres and redis are running manually.'
    }

    Set-WslInfraHostEnv

    $dbHostForSeed = if ($env:DB_HOST) { $env:DB_HOST } else { 'localhost' }
    $dbPortForSeed = if ($env:DB_PORT) { [int]$env:DB_PORT } else { 5432 }
    Wait-TcpPort -TargetHost $dbHostForSeed -Port $dbPortForSeed -Name 'postgres' -TimeoutSec 50

    # 2. Seed (always, so test users exist even if backend was already up)
    Write-Host 'seeding test users...'
    $hasGo   = $null -ne (Get-Command go   -ErrorAction SilentlyContinue)
    $hasMake = $null -ne (Get-Command make -ErrorAction SilentlyContinue)
    $hasBash = -not [string]::IsNullOrEmpty($BashExe)
    $hasPsql = $null -ne (Get-Command psql -ErrorAction SilentlyContinue)
    $hasBashPsql = Test-BashCommand 'command -v psql >/dev/null 2>&1'
    $backendDir = Join-Path $RepoRoot 'backend'
    $backendBashDir = Convert-ToBashPath $backendDir
    $backendWslDir  = Convert-ToWslPath $backendDir

    $SeedOutLog = Join-Path $env:TEMP 'sub12-e2e-seed.out.log'
    $SeedErrLog = Join-Path $env:TEMP 'sub12-e2e-seed.err.log'

    if ($hasGo) {
        $seedCommand = "Set-Location '$($RepoRoot.Path)\\backend'; go run ./cmd/seed"
        $seed = Start-Process -FilePath $PowerShellExe -ArgumentList '-NoProfile', '-Command', $seedCommand `
            -RedirectStandardOutput $SeedOutLog -RedirectStandardError $SeedErrLog `
            -NoNewWindow -PassThru -Wait
        if ($seed.ExitCode -ne 0) { throw "seed failed - see $SeedErrLog" }
    } elseif ($hasMake -and $hasPsql) {
        $seedCommand = "Set-Location '$($RepoRoot.Path)\\backend'; make seed"
        $seed = Start-Process -FilePath $PowerShellExe -ArgumentList '-NoProfile', '-Command', $seedCommand `
            -RedirectStandardOutput $SeedOutLog -RedirectStandardError $SeedErrLog `
            -NoNewWindow -PassThru -Wait
        if ($seed.ExitCode -ne 0) { throw "seed failed - see $SeedErrLog" }
    } elseif ($hasBash -and $hasBashPsql) {
        $seedCommand = "(cd '$backendBashDir' 2>/dev/null || cd '$backendWslDir') && make seed"
        $seed = Start-Process -FilePath $BashExe -ArgumentList '-lc', $seedCommand `
            -RedirectStandardOutput $SeedOutLog -RedirectStandardError $SeedErrLog `
            -NoNewWindow -PassThru -Wait
        if ($seed.ExitCode -ne 0) { throw "seed failed - see $SeedErrLog" }
    } elseif ($hasPsql) {
        $dbUser     = if ($env:DB_USER)     { $env:DB_USER }     else { 'sub12' }
        $dbPassword = $env:DB_PASSWORD
        if (-not $dbPassword) { throw 'DB_PASSWORD is required to run seed without go/make' }
        $dbHost    = if ($env:DB_HOST)    { $env:DB_HOST }    else { 'localhost' }
        $dbPort    = if ($env:DB_PORT)    { $env:DB_PORT }    else { '5432' }
        $dbName    = if ($env:DB_NAME)    { $env:DB_NAME }    else { 'sub12' }
        $dbSSLMode = if ($env:DB_SSLMODE) { $env:DB_SSLMODE } else { 'disable' }
        $seedSqlPath = Join-Path $RepoRoot 'backend\internal\db\seed\seed.sql'
        $migrateUrl  = "postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?sslmode=${dbSSLMode}"
        $seedCommand = "`$env:PGPASSWORD='$dbPassword'; psql '$migrateUrl' -f '$seedSqlPath'"
        $seed = Start-Process -FilePath $PowerShellExe -ArgumentList '-NoProfile', '-Command', $seedCommand `
            -RedirectStandardOutput $SeedOutLog -RedirectStandardError $SeedErrLog `
            -NoNewWindow -PassThru -Wait
        if ($seed.ExitCode -ne 0) { throw "seed failed - see $SeedErrLog" }
    } else {
        Write-Warning 'Skipping seed: go, make+psql, and psql are all unavailable (tests that require seeded users may fail)'
    }
    Write-Host 'seed: done'

    # 3. Backend
    if (Test-Url 'http://localhost:8080/readyz') {
        Write-Host 'backend: already running on :8080'
    } else {
        $backendPortOwner = Get-ListeningProcess -Port 8080
        if ($backendPortOwner) {
            $conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($ForcePort) {
                Write-Host "killing process on :8080 ($backendPortOwner)..."
                if ($null -ne $conn) {
                    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 1
                }
            } else {
                $answer = Read-Host "Port 8080 is in use by $backendPortOwner. Kill it? [Y/n]"
                if ($answer -eq '' -or $answer -match '^[Yy]') {
                    if ($null -ne $conn) {
                        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
                        Start-Sleep -Seconds 1
                    }
                } else {
                    throw "cannot start backend: port 8080 is in use by $backendPortOwner"
                }
            }
        }

        Write-Host "starting backend (logs: $BackendOutLog, $BackendErrLog)..."

        $runBackendCommand = "Set-Location '$($RepoRoot.Path)\\backend'; go run ./cmd/api"
        $script:BackendProc = Start-Process -FilePath $PowerShellExe -ArgumentList '-NoProfile', '-Command', $runBackendCommand `
            -RedirectStandardOutput $BackendOutLog -RedirectStandardError $BackendErrLog `
            -NoNewWindow -PassThru
        Wait-Url 'http://localhost:8080/readyz' 'backend' 90 $script:BackendProc $BackendErrLog
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
        Wait-Url 'http://localhost:5173' 'frontend' 60 $script:FrontendProc $FrontendErrLog
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
