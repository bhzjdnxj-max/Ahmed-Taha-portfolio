# =============================================================================
# Video-Compatibility-System.ps1
# Scans Supabase projects, inspects every video with ffprobe, identifies truly
# incompatible videos, converts them to browser-compatible H.264 MP4, uploads
# to Supabase, and updates the database.
#
# KEY RULES:
#   - HEVC (H.265) in an MP4 container is treated as COMPATIBLE.
#     (confirmed: HEVC with hvc1 codec ID plays correctly on the website)
#   - Only videos with genuinely incompatible codecs/containers are converted.
#   - Original files are NEVER deleted or overwritten.
#   - The database schema and RLS policies are NEVER modified.
#   - In Dry Run mode, nothing is uploaded, converted, or modified.
# =============================================================================

# --- CONFIGURATION -----------------------------------------------------------
# Set $DryRun = $false to perform actual conversion + upload + DB update.
$DryRun = $false

$SupabaseUrl = "https://spamrrcfoablporcvida.supabase.co"

# [تعديل هنا] - استخدم ال Service Role Key عشان السكربت يتخطى ال RLS ويقدر يرفع ويحدث البيانات براحته
$ServiceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwYW1ycmNmb2FibHBvcmN2aWRhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDA3ODIzMiwiZXhwIjoyMTA1NjU0MjMyfQ.r2g1-7292QWHSGiwUaXld01yb2gV9l5wXgHPUIMgFv0" 

$Bucket = "portfolio-media"

# FFmpeg quality: CRF 18 = high quality for a professional portfolio.
# Range: 0-51. Lower = better quality, larger file.
$FFmpegCrf = 18

# --- Browser-compatible codec / container lists ------------------------------
# These codecs can be played natively by all major modern browsers.
$CompatibleVideoCodecs = @("h264", "vp8", "vp9", "av1")

# HEVC (H.265) is compatible in MP4 container on Safari, Edge, and most
# Chromium browsers (hardware-accelerated). We treat it as compatible
# when the container is MP4.
# IMPORTANT: This was confirmed by comparing two HEVC videos -- one that
# works and one that does not. The working video uses HEVC/hvc1 in MP4.
# Therefore HEVC alone is NOT a reason to convert.
$HevcCompatibleInMp4 = $true

# Containers that browsers handle natively.
$CompatibleContainers = @("mp4", "webm", "ogg")

# Audio codecs that browsers handle natively.
$CompatibleAudioCodecs = @("aac", "opus", "vorbis", "mp3", "flac")

# -----------------------------------------------------------------------------
# Helper: Normalize a media_url to a full public download URL
# -----------------------------------------------------------------------------
function Get-NormalizedUrl {
    param([string]$rawUrl)
    if ([string]::IsNullOrWhiteSpace($rawUrl)) { return $null }
    if ($rawUrl -match '^https?://') { return $rawUrl }
    # Relative path stored in DB -- construct Supabase public URL
    return "$SupabaseUrl/storage/v1/object/public/$Bucket/$rawUrl"
}

# -----------------------------------------------------------------------------
# Helper: Determine the simple container name from ffprobe format_name
# -----------------------------------------------------------------------------
function Get-SimpleContainer {
    param([string]$formatName)
    if ([string]::IsNullOrWhiteSpace($formatName)) { return "unknown" }
    # ffprobe returns comma-separated possible formats, e.g. "mov,mp4,m4a,3gp,3g2,mj2"
    $parts = $formatName -split ','
    foreach ($part in $parts) {
        $trimmed = $part.Trim().ToLower()
        if ($trimmed -eq 'mp4') { return 'mp4' }
        if ($trimmed -eq 'webm') { return 'webm' }
        if ($trimmed -eq 'ogg') { return 'ogg' }
    }
    # Return the first listed format as-is
    return $parts[0].Trim().ToLower()
}

# -----------------------------------------------------------------------------
# Helper: Evaluate FPS strings to a decimal number
# e.g. "30/1" -> 30.0, "30000/1001" -> 29.97, "0/0" -> 0
# -----------------------------------------------------------------------------
function ConvertTo-FpsDecimal {
    param([string]$fpsString)
    if ([string]::IsNullOrWhiteSpace($fpsString) -or $fpsString -eq '?') { return 0 }
    if ($fpsString -match '^(\d+)/(\d+)$') {
        $num = [double]$Matches[1]
        $den = [double]$Matches[2]
        if ($den -eq 0) { return 0 }
        return [math]::Round($num / $den, 3)
    }
    # If it is already a plain number
    $val = 0.0
    if ([double]::TryParse($fpsString, [ref]$val)) { return $val }
    return 0
}

# -----------------------------------------------------------------------------
# 1. Locate or download FFmpeg / FFprobe
# -----------------------------------------------------------------------------
$ffmpegDir = "$PSScriptRoot\ffmpeg"
$ffmpegExe = "$ffmpegDir\ffmpeg.exe"
$ffprobeExe = "$ffmpegDir\ffprobe.exe"

if (-not (Test-Path $ffmpegExe) -or -not (Test-Path $ffprobeExe)) {

    # Check if there is a local ffmpeg.zip we can extract first
    $localZip = "$PSScriptRoot\ffmpeg.zip"
    if (Test-Path $localZip) {
        Write-Host ""
        Write-Host "Found local ffmpeg.zip. Extracting..." -ForegroundColor Cyan
        $ffmpegExtracted = "$PSScriptRoot\ffmpeg_extracted"
        try {
            Expand-Archive -Path $localZip -DestinationPath $ffmpegExtracted -Force
            New-Item -ItemType Directory -Force -Path $ffmpegDir | Out-Null

            # The zip may have a nested folder structure; find ffmpeg.exe inside
            $foundFfmpeg = Get-ChildItem -Path $ffmpegExtracted -Recurse -Filter "ffmpeg.exe"  | Select-Object -First 1
            $foundFfprobe = Get-ChildItem -Path $ffmpegExtracted -Recurse -Filter "ffprobe.exe" | Select-Object -First 1

            if ($foundFfmpeg) { Copy-Item $foundFfmpeg.FullName  -Destination $ffmpegExe  -Force }
            if ($foundFfprobe) { Copy-Item $foundFfprobe.FullName -Destination $ffprobeExe -Force }

            Remove-Item $ffmpegExtracted -Recurse -Force
            Write-Host "FFmpeg extracted from local zip and ready." -ForegroundColor Green
        }
        catch {
            Write-Host "ERROR: Could not extract local ffmpeg.zip: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    # If still not found, download from the internet
    if (-not (Test-Path $ffmpegExe) -or -not (Test-Path $ffprobeExe)) {
        Write-Host ""
        Write-Host "FFmpeg not found. Downloading (this may take a minute)..." -ForegroundColor Cyan
        $ffmpegZip = "$PSScriptRoot\ffmpeg_download.zip"
        $ffmpegExtracted = "$PSScriptRoot\ffmpeg_extracted"
        $ffmpegReleaseUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"

        try {
            Invoke-WebRequest -Uri $ffmpegReleaseUrl -OutFile $ffmpegZip
            Expand-Archive -Path $ffmpegZip -DestinationPath $ffmpegExtracted -Force
            New-Item -ItemType Directory -Force -Path $ffmpegDir | Out-Null
            Get-ChildItem "$ffmpegExtracted\*\bin\ffmpeg.exe"  | Copy-Item -Destination $ffmpegExe
            Get-ChildItem "$ffmpegExtracted\*\bin\ffprobe.exe" | Copy-Item -Destination $ffprobeExe
            Remove-Item $ffmpegZip       -Force
            Remove-Item $ffmpegExtracted -Recurse -Force
            Write-Host "FFmpeg downloaded and ready." -ForegroundColor Green
        }
        catch {
            Write-Host "FATAL: Could not download FFmpeg. Error: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    }
}

if (-not (Test-Path $ffprobeExe)) {
    Write-Host "FATAL: ffprobe.exe not found at '$ffprobeExe'. Cannot inspect codecs." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Using ffprobe: $ffprobeExe" -ForegroundColor DarkGray
Write-Host "Using ffmpeg:  $ffmpegExe"  -ForegroundColor DarkGray

# -----------------------------------------------------------------------------
# 2. Fetch all projects from Supabase
# -----------------------------------------------------------------------------
$headers = @{
    "apikey"        = $ServiceRoleKey
    "Authorization" = "Bearer $ServiceRoleKey"
    "Content-Type"  = "application/json"
    "Prefer"        = "return=representation"
}

Write-Host ""
Write-Host "Fetching projects from Supabase..." -ForegroundColor Green
try {
    $allProjects = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/projects?select=*" -Headers $headers
}
catch {
    Write-Host "FATAL: Failed to fetch projects from Supabase." -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Check your Supabase URL, ServiceRoleKey, and network connection." -ForegroundColor Yellow
    exit 1
}

$videoProjects = $allProjects | Where-Object { $_.type -eq 'video' -and $_.media_url }
Write-Host "Found $($videoProjects.Count) video project(s) to inspect." -ForegroundColor Green

if ($DryRun) {
    Write-Host ""
    Write-Host "=====================================================" -ForegroundColor Yellow
    Write-Host "  DRY RUN MODE -- No files will be uploaded or changed" -ForegroundColor Yellow
    Write-Host "  No conversions, no uploads, no DB modifications."     -ForegroundColor Yellow
    Write-Host "=====================================================" -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
# 3. Inspect each video with ffprobe
# -----------------------------------------------------------------------------
$needsConversionList = @()
$compatibleCount = 0
$errorCount = 0
$videoIndex = 0

foreach ($p in $videoProjects) {

    $videoIndex++

    # Skip videos already converted by this script
    if ($p.media_url -match '_compatible\.mp4(\?.*)?$') {
        Write-Host ""
        Write-Host "[$videoIndex/$($videoProjects.Count)] SKIP: '$($p.title)' -- already a compatible version." -ForegroundColor DarkGray
        $compatibleCount++
        continue
    }

    Write-Host ""
    Write-Host "====================================================="
    Write-Host "[$videoIndex/$($videoProjects.Count)] Inspecting: $($p.title)" -ForegroundColor Yellow
    Write-Host "====================================================="
    Write-Host "  Project Title     : $($p.title)"
    Write-Host "  Original media_url: $($p.media_url)"

    $normalizedUrl = Get-NormalizedUrl $p.media_url
    Write-Host "  Normalized URL    : $normalizedUrl"

    # ----- Probe video stream ------------------------------------------------
    $videoCodec = ""
    $videoCodecTag = ""
    $width = ""
    $height = ""
    $rFrameRate = ""
    $avgFrameRate = ""
    $bitDepth = ""

    # ----- Probe audio stream ------------------------------------------------
    $audioCodec = ""

    # ----- Probe container ---------------------------------------------------
    $formatName = ""

    try {
        # Video stream info (codec, resolution, frame rate, bit depth, codec tag)
        $probeVideoArgs = @(
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,codec_tag_string,width,height,r_frame_rate,avg_frame_rate,bits_per_raw_sample",
            "-of", "json",
            $normalizedUrl
        )
        $probeVideoRaw = & $ffprobeExe @probeVideoArgs 2>&1
        $probeVideoText = ($probeVideoRaw | Out-String).Trim()

        # Remove any non-JSON lines (warnings/errors from stderr mixed in)
        $jsonStart = $probeVideoText.IndexOf('{')
        if ($jsonStart -gt 0) {
            $probeVideoText = $probeVideoText.Substring($jsonStart)
        }

        $probeVideo = $probeVideoText | ConvertFrom-Json

        if ($probeVideo.streams -and $probeVideo.streams.Count -gt 0) {
            $vs = $probeVideo.streams[0]
            $videoCodec = if ($vs.codec_name) { $vs.codec_name.ToString().Trim().ToLower() } else { "" }
            $videoCodecTag = if ($vs.codec_tag_string) { $vs.codec_tag_string.ToString().Trim().ToLower() } else { "" }
            $width = if ($vs.width) { $vs.width.ToString().Trim() } else { "?" }
            $height = if ($vs.height) { $vs.height.ToString().Trim() } else { "?" }
            $rFrameRate = if ($vs.r_frame_rate) { $vs.r_frame_rate.ToString().Trim() } else { "?" }
            $avgFrameRate = if ($vs.avg_frame_rate) { $vs.avg_frame_rate.ToString().Trim() } else { "?" }
            $bitDepth = if ($vs.bits_per_raw_sample) { $vs.bits_per_raw_sample.ToString().Trim() } else { "8" }
        }

        # Audio stream info
        $probeAudioArgs = @(
            "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=codec_name",
            "-of", "json",
            $normalizedUrl
        )
        $probeAudioRaw = & $ffprobeExe @probeAudioArgs 2>&1
        $probeAudioText = ($probeAudioRaw | Out-String).Trim()

        $jsonStart = $probeAudioText.IndexOf('{')
        if ($jsonStart -gt 0) {
            $probeAudioText = $probeAudioText.Substring($jsonStart)
        }

        $probeAudio = $probeAudioText | ConvertFrom-Json

        if ($probeAudio.streams -and $probeAudio.streams.Count -gt 0) {
            $audioCodec = if ($probeAudio.streams[0].codec_name) {
                $probeAudio.streams[0].codec_name.ToString().Trim().ToLower()
            }
            else { "" }
        }

        # Container / format info
        $probeFormatArgs = @(
            "-v", "error",
            "-show_entries", "format=format_name",
            "-of", "json",
            $normalizedUrl
        )
        $probeFormatRaw = & $ffprobeExe @probeFormatArgs 2>&1
        $probeFormatText = ($probeFormatRaw | Out-String).Trim()

        $jsonStart = $probeFormatText.IndexOf('{')
        if ($jsonStart -gt 0) {
            $probeFormatText = $probeFormatText.Substring($jsonStart)
        }

        $probeFormat = $probeFormatText | ConvertFrom-Json

        if ($probeFormat.format) {
            $formatName = if ($probeFormat.format.format_name) {
                $probeFormat.format.format_name.ToString().Trim().ToLower()
            }
            else { "" }
        }
    }
    catch {
        Write-Host "  ERROR: ffprobe failed for '$($p.title)'. Skipping." -ForegroundColor Red
        Write-Host "         $($_.Exception.Message)" -ForegroundColor Red
        $errorCount++
        continue
    }

    if ([string]::IsNullOrWhiteSpace($videoCodec)) {
        Write-Host "  ERROR: Could not detect video codec (empty ffprobe output). Skipping." -ForegroundColor Red
        $errorCount++
        continue
    }

    # ----- Determine VFR vs CFR ----------------------------------------------
    $isVFR = $false
    $rFpsDecimal = ConvertTo-FpsDecimal $rFrameRate
    $avgFpsDecimal = ConvertTo-FpsDecimal $avgFrameRate

    # If both are valid and differ by more than 0.5 fps, consider it VFR
    if ($rFpsDecimal -gt 0 -and $avgFpsDecimal -gt 0) {
        $fpsDiff = [math]::Abs($rFpsDecimal - $avgFpsDecimal)
        if ($fpsDiff -gt 0.5) {
            $isVFR = $true
        }
    }

    $fpsDisplay = "r_frame_rate=$rFrameRate"
    if ($rFpsDecimal -gt 0) { $fpsDisplay += " (~$rFpsDecimal fps)" }
    $fpsDisplay += ", avg_frame_rate=$avgFrameRate"
    if ($avgFpsDecimal -gt 0) { $fpsDisplay += " (~$avgFpsDecimal fps)" }
    if ($isVFR) { $fpsDisplay += " [VFR - Variable Frame Rate]" } else { $fpsDisplay += " [CFR - Constant Frame Rate]" }

    $simpleContainer = Get-SimpleContainer $formatName

    # ----- Print full diagnostic info ----------------------------------------
    Write-Host "  Container/Format  : $formatName (simplified: $simpleContainer)"
    Write-Host "  Video Codec       : $videoCodec (tag: $videoCodecTag)"
    Write-Host "  Audio Codec       : $(if ($audioCodec) { $audioCodec } else { 'none / not detected' })"
    Write-Host "  Resolution        : ${width}x${height}"
    Write-Host "  Bit Depth         : $bitDepth"
    Write-Host "  FPS               : $fpsDisplay"

    # =========================================================================
    # Compatibility Decision Logic
    # =========================================================================
    $needsConversion = $false
    $conversionReasons = @()

    # --- Check 1: Container compatibility ------------------------------------
    $containerOk = $false
    foreach ($cc in $CompatibleContainers) {
        if ($simpleContainer -eq $cc) { $containerOk = $true; break }
    }

    # Also accept if ffprobe format contains 'mp4' (e.g. "mov,mp4,m4a,3gp,3g2,mj2")
    if (-not $containerOk -and $formatName -match 'mp4') {
        $containerOk = $true
    }

    # MOV container: if the URL explicitly ends in .mov, it may not play everywhere
    if ($p.media_url -match '\.mov(\?.*)?$' -and $simpleContainer -ne 'mp4') {
        $containerOk = $false
    }

    if (-not $containerOk) {
        $needsConversion = $true
        $conversionReasons += "Incompatible container: $simpleContainer (raw format: $formatName)"
    }

    # --- Check 2: Video codec compatibility ----------------------------------
    $videoCodecOk = $false

    # Direct match against universally compatible codecs
    foreach ($vc in $CompatibleVideoCodecs) {
        if ($videoCodec -eq $vc) { $videoCodecOk = $true; break }
    }

    # HEVC special handling:
    # HEVC in an MP4 container is treated as COMPATIBLE.
    # This was confirmed by the user: an HEVC video with hvc1 codec ID
    # plays correctly on the website. HEVC alone is NOT a reason to convert.
    if (-not $videoCodecOk -and ($videoCodec -eq 'hevc' -or $videoCodec -eq 'h265')) {
        if ($HevcCompatibleInMp4 -and $containerOk) {
            # HEVC in MP4 -- treat as compatible regardless of tag
            $videoCodecOk = $true
            Write-Host "  HEVC Note         : HEVC in MP4 container (tag: $videoCodecTag) -- COMPATIBLE" -ForegroundColor Cyan
        }
        elseif (-not $containerOk) {
            # HEVC in a non-MP4 container (e.g. MKV, AVI) -- uncertain browser support
            $needsConversion = $true
            $conversionReasons += "HEVC codec in non-MP4 container ($simpleContainer) -- uncertain browser support"
        }
    }

    # Non-HEVC, non-standard codec
    if (-not $videoCodecOk -and $videoCodec -ne 'hevc' -and $videoCodec -ne 'h265') {
        $needsConversion = $true
        $conversionReasons += "Incompatible video codec: $videoCodec"
    }

    # --- Check 3: Audio codec compatibility ----------------------------------
    if (-not [string]::IsNullOrWhiteSpace($audioCodec)) {
        $audioCodecOk = $false
        foreach ($ac in $CompatibleAudioCodecs) {
            if ($audioCodec -eq $ac) { $audioCodecOk = $true; break }
        }
        if (-not $audioCodecOk) {
            $needsConversion = $true
            $conversionReasons += "Incompatible audio codec: $audioCodec"
        }
    }

    # --- Check 4: Bit depth > 10 (HDR/high-bit-depth may not play) ----------
    if ($bitDepth -match '^\d+$' -and [int]$bitDepth -gt 10) {
        $needsConversion = $true
        $conversionReasons += "High bit depth: ${bitDepth}-bit (may cause playback issues in browsers)"
    }

    # --- Final Decision ------------------------------------------------------
    Write-Host ""
    if ($needsConversion) {
        $reasonString = $conversionReasons -join "; "
        Write-Host "  >> DECISION: CONVERSION REQUIRED" -ForegroundColor Red
        Write-Host "  >> Reason(s): $reasonString" -ForegroundColor Red
        $needsConversionList += [PSCustomObject]@{
            Project       = $p
            NormalizedUrl = $normalizedUrl
            VideoCodec    = $videoCodec
            VideoCodecTag = $videoCodecTag
            AudioCodec    = $audioCodec
            Container     = $simpleContainer
            FormatName    = $formatName
            Resolution    = "${width}x${height}"
            FPS           = $fpsDisplay
            IsVFR         = $isVFR
            BitDepth      = $bitDepth
            Reason        = $reasonString
        }
    }
    else {
        Write-Host "  >> DECISION: COMPATIBLE -- no conversion needed" -ForegroundColor Green
        $compatibleCount++
    }
}

# -----------------------------------------------------------------------------
# 4. Summary report
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  SCAN COMPLETE" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Total video projects inspected : $($videoProjects.Count)"
Write-Host "  Already compatible             : $compatibleCount"
Write-Host "  Needing conversion             : $($needsConversionList.Count)"
Write-Host "  Errors / skipped               : $errorCount"
Write-Host ""

if ($needsConversionList.Count -gt 0) {
    Write-Host "  Videos that need conversion:" -ForegroundColor Red
    foreach ($item in $needsConversionList) {
        Write-Host "    - '$($item.Project.title)'" -ForegroundColor Red -NoNewline
        Write-Host "  [Codec: $($item.VideoCodec), Container: $($item.Container), Res: $($item.Resolution)]" -NoNewline
        Write-Host ""
        Write-Host "      Reason: $($item.Reason)" -ForegroundColor DarkYellow
    }
}
else {
    Write-Host "  All videos are already browser-compatible. Nothing to do." -ForegroundColor Green
}

if ($DryRun) {
    Write-Host ""
    Write-Host "=====================================================" -ForegroundColor Yellow
    Write-Host "  DRY RUN complete." -ForegroundColor Yellow
    Write-Host "  No files were converted, uploaded, or modified." -ForegroundColor Yellow
    Write-Host "  No database records were changed." -ForegroundColor Yellow
    Write-Host '  Set $DryRun = $false and re-run to perform conversions.' -ForegroundColor Yellow
    Write-Host "=====================================================" -ForegroundColor Yellow
    exit 0
}

# -----------------------------------------------------------------------------
# 5. Perform actual conversions (only when $DryRun = $false)
# -----------------------------------------------------------------------------
$convertedCount = 0
$failedCount = 0

foreach ($item in $needsConversionList) {
    $p = $item.Project
    $downloadUrl = $item.NormalizedUrl

    Write-Host ""
    Write-Host "-----------------------------------------------------"
    Write-Host "Converting: '$($p.title)'" -ForegroundColor Cyan
    Write-Host "  Reason: $($item.Reason)"

    $guid1 = [guid]::NewGuid().ToString('N')
    $guid2 = [guid]::NewGuid().ToString('N')
    $tempInput = "$PSScriptRoot\temp_input_$guid1.mp4"
    $tempOutput = "$PSScriptRoot\temp_output_$guid2.mp4"

    try {
        # --- Download original video ---
        Write-Host "  Downloading original..." -ForegroundColor DarkGray
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempInput

        if (-not (Test-Path $tempInput)) {
            Write-Host "  ERROR: Download failed -- file not found after download." -ForegroundColor Red
            $failedCount++
            continue
        }

        # --- Build FFmpeg arguments ---
        Write-Host "  Converting (H.264/AAC, CRF $FFmpegCrf, faststart)..." -ForegroundColor DarkGray

        $ffArgs = @(
            "-y", "-i", $tempInput,
            "-c:v", "libx264", "-preset", "fast", "-crf", "$FFmpegCrf",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart"
        )

        # If the source is VFR, force constant frame rate
        if ($item.IsVFR) {
            $ffArgs += @("-vsync", "cfr")
            Write-Host "  Note: Source is VFR, forcing CFR output." -ForegroundColor DarkGray
        }

        $ffArgs += $tempOutput

        $proc = Start-Process -FilePath $ffmpegExe -ArgumentList $ffArgs -NoNewWindow -Wait -PassThru

        if ($proc.ExitCode -ne 0 -or -not (Test-Path $tempOutput)) {
            Write-Host "  ERROR: FFmpeg conversion failed (exit code $($proc.ExitCode)). Skipping." -ForegroundColor Red
            $failedCount++
            continue
        }
        Write-Host "  Conversion succeeded." -ForegroundColor Green

        # --- Build new Supabase storage path ---
        $originalFilename = [guid]::NewGuid().ToString('N')
        if ($p.media_url -match '([^/?#]+)(\?.*)?$') {
            $originalFilename = $Matches[1] -replace '\.[^.]+$', ''
        }
        $newStoragePath = "projects/${originalFilename}_compatible.mp4"
        $uploadUrl = "$SupabaseUrl/storage/v1/object/$Bucket/$newStoragePath"

        # --- Upload converted file ---
        Write-Host "  Uploading to Supabase Storage..." -ForegroundColor DarkGray
        $fileBytes = [System.IO.File]::ReadAllBytes($tempOutput)
        try {
            Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $headers -Body $fileBytes -ContentType "video/mp4" | Out-Null
        }
        catch {
            $statusCode = $null
            if ($_.Exception.Response) {
                $statusCode = $_.Exception.Response.StatusCode.value__
            }
            Write-Host "  ERROR: Upload failed (HTTP $statusCode)." -ForegroundColor Red
            if ($statusCode -eq 400 -or $statusCode -eq 403) {
                Write-Host "  PERMISSION ISSUE: The Service Role key may not have INSERT access to Storage bucket '$Bucket' or is incorrect." -ForegroundColor Yellow
            }
            $failedCount++
            continue
        }

        $newPublicUrl = "$SupabaseUrl/storage/v1/object/public/$Bucket/$newStoragePath"
        Write-Host "  Uploaded: $newPublicUrl" -ForegroundColor Green

        # --- Update database record (only after upload succeeds) ---
        Write-Host "  Updating database record..." -ForegroundColor DarkGray
        $updateBody = @{ media_url = $newPublicUrl } | ConvertTo-Json
        try {
            Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/projects?id=eq.$($p.id)" -Method Patch -Headers $headers -Body $updateBody | Out-Null
            Write-Host "  Database updated. Original file is preserved on Supabase." -ForegroundColor Green
            $convertedCount++
        }
        catch {
            $statusCode = $null
            if ($_.Exception.Response) {
                $statusCode = $_.Exception.Response.StatusCode.value__
            }
            Write-Host "  ERROR: DB update failed (HTTP $statusCode). Uploaded file exists but DB was NOT changed." -ForegroundColor Red
            $failedCount++
        }

    }
    catch {
        Write-Host "  UNEXPECTED ERROR: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Skipping this video. No changes were made." -ForegroundColor Yellow
        $failedCount++
    }
    finally {
        # Always clean up temp files
        if (Test-Path $tempInput) { Remove-Item $tempInput  -Force }
        if (Test-Path $tempOutput) { Remove-Item $tempOutput -Force }
    }
}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  ALL CONVERSIONS COMPLETE" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Successfully converted : $convertedCount"
Write-Host "  Failed                 : $failedCount"
Write-Host ""
Write-Host "Press any key to exit..."
$host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null