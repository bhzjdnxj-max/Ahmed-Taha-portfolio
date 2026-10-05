$filePath = 'c:\Users\HP\Desktop\Portfolio Ahmed\Video-Compatibility-System.ps1'
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$lines = [System.IO.File]::ReadAllLines($filePath)

$found = $false
for ($i = 0; $i -lt $bytes.Length; $i++) {
    if ($bytes[$i] -gt 127) {
        if (-not $found) {
            Write-Host "Non-ASCII bytes found:" -ForegroundColor Yellow
            $found = $true
        }
        # Find the line number
        $textUpToOffset = [System.Text.Encoding]::UTF8.GetString($bytes, 0, $i)
        $lineNum = ($textUpToOffset -split "`n").Count
        $hexVal = '0x{0:X2}' -f $bytes[$i]
        Write-Host "  Offset=$i, Byte=$($bytes[$i]) ($hexVal), approx line $lineNum"
    }
}

if (-not $found) {
    Write-Host "All bytes are pure ASCII - no encoding issues." -ForegroundColor Green
}
