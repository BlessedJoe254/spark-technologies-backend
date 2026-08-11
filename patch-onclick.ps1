$fpath = "frontend\contact.html"
$content = Get-Content $fpath -Raw
$normalized = $content -replace "`r`n", "`n"

$oldEmailA = 'href="mailto:sparktech511@gmail.com?subject=Inquiry%20from%20the%20Spark%20Technologies%20website&body=Hi%2C%20I%20found%20you%20through%20the%20Spark%20Technologies%20website%20and%20I%27d%20like%20to%20ask%20about..."'
$newEmailA = 'href="mailto:sparktech511@gmail.com?subject=Inquiry%20from%20the%20Spark%20Technologies%20website&body=Hi%2C%20I%20found%20you%20through%20the%20Spark%20Technologies%20website%20and%20I%27d%20like%20to%20ask%20about..." onclick="showContactToast()"'

$oldWaA = 'href="https://wa.me/254789977932?text=Hi%2C%20I%20found%20you%20through%20the%20Spark%20Technologies%20website%20and%20I%27d%20like%20to%20ask%20about..."'
$newWaA = 'href="https://wa.me/254789977932?text=Hi%2C%20I%20found%20you%20through%20the%20Spark%20Technologies%20website%20and%20I%27d%20like%20to%20ask%20about..." onclick="showContactToast()"'

$changes = 0
if ($normalized.Contains($oldEmailA)) { $normalized = $normalized.Replace($oldEmailA, $newEmailA); $changes++; Write-Host "Patched: Email onclick" } else { Write-Host "SKIPPED: Email href not found" }
if ($normalized.Contains($oldWaA)) { $normalized = $normalized.Replace($oldWaA, $newWaA); $changes++; Write-Host "Patched: WhatsApp onclick" } else { Write-Host "SKIPPED: WhatsApp href not found" }

$final = $normalized -replace "`n", "`r`n"
Set-Content -Path $fpath -Value $final -NoNewline
Write-Host "`nDone. $changes of 2 patches applied."
