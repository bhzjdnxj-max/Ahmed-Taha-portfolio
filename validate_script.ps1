$errors = $null
$tokens = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    'c:\Users\HP\Desktop\Portfolio Ahmed\Video-Compatibility-System.ps1',
    [ref]$tokens,
    [ref]$errors
)

if ($errors.Count -eq 0) {
    Write-Host "NO SYNTAX ERRORS FOUND" -ForegroundColor Green
} else {
    Write-Host "FOUND $($errors.Count) SYNTAX ERROR(S):" -ForegroundColor Red
    foreach ($e in $errors) {
        Write-Host "  Line $($e.Extent.StartLineNumber): $($e.Message)" -ForegroundColor Red
    }
}
