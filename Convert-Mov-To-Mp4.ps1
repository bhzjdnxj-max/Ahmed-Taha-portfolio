$ErrorActionPreference = "Stop"

$SUPABASE_URL = "https://spamrrcfoablporcvida.supabase.co"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " MOV -> MP4 Browser Compatibility Converter" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$secureKey = Read-Host "Paste your Supabase service_role key" -AsSecureString

$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
    $SUPABASE_SERVICE_ROLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

$headers = @{
    "apikey"        = $SUPABASE_SERVICE_ROLE_KEY
    "Authorization" = "Bearer $SUPABASE_SERVICE_ROLE_KEY"
}

# ============================================
# FFmpeg
# ============================================

$ffmpegPath = "C:\Users\HP\Desktop\Portfolio Ahmed\ffmpeg\ffmpeg.exe"

if (-not (Test-Path $ffmpegPath)) {
    Write-Host ""
    Write-Host "ERROR: FFmpeg was not found at:" -ForegroundColor Red
    Write-Host $ffmpegPath -ForegroundColor Red
    exit 1
}

Write-Host "FFmpeg found: $ffmpegPath" -ForegroundColor Green

# ============================================
# Temporary folder
# ============================================

$workDir = Join-Path $env:TEMP "portfolio-mov-conversion"

if (Test-Path $workDir) {
    Remove-Item $workDir -Recurse -Force
}

New-Item -ItemType Directory -Path $workDir | Out-Null

# ============================================
# Get projects
# ============================================

Write-Host ""
Write-Host "Getting projects from Supabase..." -ForegroundColor Yellow

$projectsUrl = "$SUPABASE_URL/rest/v1/projects?select=id,title,media_url"

try {
    $projects = Invoke-RestMethod `
        -Uri $projectsUrl `
        -Headers $headers `
        -Method Get
}
catch {
    Write-Host ""
    Write-Host "ERROR: Could not read projects from Supabase." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

$movProjects = @(
    $projects | Where-Object {
        $_.media_url -and
        $_.media_url -match '\.mov($|\?)'
    }
)

Write-Host ""
Write-Host "Found $($movProjects.Count) MOV video(s)." -ForegroundColor Cyan

if ($movProjects.Count -eq 0) {
    Write-Host "No MOV videos need conversion." -ForegroundColor Green
    $SUPABASE_SERVICE_ROLE_KEY = $null
    exit 0
}

# ============================================
# Convert videos
# ============================================

$counter = 0

foreach ($project in $movProjects) {

    $counter++

    Write-Host ""
    Write-Host "--------------------------------------------" -ForegroundColor DarkGray
    Write-Host "[$counter/$($movProjects.Count)] $($project.title)" -ForegroundColor Cyan
    Write-Host "--------------------------------------------"

    try {

        $oldUrl = [string]$project.media_url

        $uri = [System.Uri]$oldUrl

        $fileName = [System.IO.Path]::GetFileName($uri.AbsolutePath)

        if ([string]::IsNullOrWhiteSpace($fileName)) {
            throw "Could not determine the original filename."
        }

        $baseName = [System.IO.Path]::GetFileNameWithoutExtension($fileName)

        $newFileName = "${baseName}_browser.mp4"

        $inputFile = Join-Path $workDir $fileName

        $outputFile = Join-Path $workDir $newFileName

        # ====================================
        # Download MOV
        # ====================================

        Write-Host "Downloading MOV..." -ForegroundColor Yellow

        Invoke-WebRequest `
            -Uri $oldUrl `
            -OutFile $inputFile `
            -UseBasicParsing

        if (-not (Test-Path $inputFile)) {
            throw "Download failed."
        }

        # ====================================
        # Convert to H264 / AAC MP4
        # ====================================

        Write-Host "Converting to MP4 H.264/AAC..." -ForegroundColor Yellow

        & $ffmpegPath `
            -y `
            -i $inputFile `
            -c:v libx264 `
            -preset medium `
            -crf 23 `
            -pix_fmt yuv420p `
            -c:a aac `
            -b:a 160k `
            -movflags +faststart `
            $outputFile

        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $outputFile)) {
            throw "FFmpeg conversion failed."
        }

        Write-Host "Conversion successful." -ForegroundColor Green

        # ====================================
        # Upload MP4 to Supabase
        # ====================================

        $newStoragePath = "projects/$newFileName"

        $encodedStoragePath = [System.Uri]::EscapeDataString($newStoragePath)

        $uploadUrl = "$SUPABASE_URL/storage/v1/object/portfolio-media/$encodedStoragePath"

        $uploadHeaders = @{
            "apikey"        = $SUPABASE_SERVICE_ROLE_KEY
            "Authorization" = "Bearer $SUPABASE_SERVICE_ROLE_KEY"
            "Content-Type"  = "video/mp4"
            "x-upsert"      = "true"
        }

        Write-Host "Uploading MP4 to Supabase..." -ForegroundColor Yellow

        $fileBytes = [System.IO.File]::ReadAllBytes($outputFile)

        Invoke-RestMethod `
            -Uri $uploadUrl `
            -Headers $uploadHeaders `
            -Method Post `
            -Body $fileBytes

        Write-Host "Upload successful." -ForegroundColor Green

        # ====================================
        # Update project URL
        # ====================================

        $newPublicUrl = "$SUPABASE_URL/storage/v1/object/public/portfolio-media/$newStoragePath"

        $projectId = [string]$project.id

        $updateUrl = "$SUPABASE_URL/rest/v1/projects?id=eq.$projectId"

        $body = @{
            media_url = $newPublicUrl
        } | ConvertTo-Json -Compress

        $updateHeaders = @{
            "apikey"        = $SUPABASE_SERVICE_ROLE_KEY
            "Authorization" = "Bearer $SUPABASE_SERVICE_ROLE_KEY"
            "Content-Type"  = "application/json"
            "Prefer"        = "return=minimal"
        }

        Write-Host "Updating project URL..." -ForegroundColor Yellow

        Invoke-RestMethod `
            -Uri $updateUrl `
            -Headers $updateHeaders `
            -Method Patch `
            -Body $body

        Write-Host ""
        Write-Host "DONE: $($project.title)" -ForegroundColor Green
        Write-Host "New file: $newFileName" -ForegroundColor Green

    }
    catch {

        Write-Host ""
        Write-Host "ERROR processing: $($project.title)" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
}

# ============================================
# Finish
# ============================================

$SUPABASE_SERVICE_ROLE_KEY = $null

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Conversion process finished." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""