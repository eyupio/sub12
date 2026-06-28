# Build Android APK and iOS archive from the Capacitor project.
#
# Usage:
#   .\scripts\build-mobile.ps1 [options]
#
# Options:
#   -AndroidOnly   Skip iOS build
#   -IosOnly       Skip Android build
#   -Debug         Build debug variants instead of release
#   -SkipWeb       Skip the tsc + vite build + cap sync step (use existing dist/)
#
# Output:
#   Android release: frontend\android\app\build\outputs\apk\release\app-release-unsigned.apk
#   Android debug:   frontend\android\app\build\outputs\apk\debug\app-debug.apk
#   iOS:             frontend\ios\App\App.xcarchive  (macOS only)

param(
    [switch]$AndroidOnly,
    [switch]$IosOnly,
    [switch]$Debug,
    [switch]$SkipWeb
)

$ErrorActionPreference = 'Stop'

$RepoRoot  = Split-Path $PSScriptRoot -Parent
$Frontend  = Join-Path $RepoRoot 'frontend'
$Android   = Join-Path $Frontend 'android'
$IosApp    = Join-Path $Frontend 'ios\App'

$BuildAndroid = -not $IosOnly
$BuildIos     = -not $AndroidOnly
$BuildType    = if ($Debug) { 'debug' } else { 'release' }

# ── Web bundle ───────────────────────────────────────────────────────────────
if (-not $SkipWeb) {
    Write-Host ""
    Write-Host "==> Building web bundle and syncing Capacitor..." -ForegroundColor Cyan
    Set-Location $Frontend
    npm run build
    if (-not $?) { exit 1 }
    npx cap sync
    if (-not $?) { exit 1 }
}

# ── Android ──────────────────────────────────────────────────────────────────
if ($BuildAndroid) {
    Write-Host ""
    Write-Host "==> Building Android ($BuildType)..." -ForegroundColor Cyan
    Set-Location $Android

    if ($Debug) {
        & .\gradlew.bat assembleDebug
        if (-not $?) { exit 1 }
        $Apk = Join-Path $Android 'app\build\outputs\apk\debug\app-debug.apk'
    } else {
        & .\gradlew.bat assembleRelease
        if (-not $?) { exit 1 }
        $Unsigned = Join-Path $Android 'app\build\outputs\apk\release\app-release-unsigned.apk'
        $Signed   = Join-Path $Android 'app\build\outputs\apk\release\app-release.apk'
        $Apk      = if (Test-Path $Unsigned) { $Unsigned } else { $Signed }
    }

    Write-Host ""
    Write-Host "Android build complete." -ForegroundColor Green
    Write-Host "  APK: $Apk"
}

# ── iOS (macOS only) ─────────────────────────────────────────────────────────
if ($BuildIos) {
    if ($IsMacOS) {
        Write-Host ""
        Write-Host "==> Building iOS ($BuildType)..." -ForegroundColor Cyan
        Set-Location $IosApp

        $XcConfig = if ($Debug) { 'Debug' } else { 'Release' }
        $Archive  = Join-Path $IosApp 'App.xcarchive'

        xcodebuild `
            -workspace App.xcworkspace `
            -scheme App `
            -configuration $XcConfig `
            -destination 'generic/platform=iOS' `
            -archivePath $Archive `
            archive

        if (-not $?) { exit 1 }

        Write-Host ""
        Write-Host "iOS build complete." -ForegroundColor Green
        Write-Host "  Archive: $Archive"
        Write-Host "  To export an .ipa: open the archive in Xcode Organizer (Product -> Archives)"
        Write-Host "  or run: xcodebuild -exportArchive -archivePath `"$Archive`" -exportPath <dir> -exportOptionsPlist <plist>"
    } else {
        Write-Host ""
        Write-Host "==> Skipping iOS (requires macOS -- run this script on a Mac)." -ForegroundColor Yellow
    }
}

Set-Location $RepoRoot
