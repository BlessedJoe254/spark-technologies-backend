$fpath = "frontend\contact.html"
$content = Get-Content $fpath -Raw

$oldStr = '<a href="https://wa.me/254789977932?text=Hi%2C%20I%20found%20you%20through%20the%20Spark%20Technologies%20website%20and%20I%27d%20like%20to%20ask%20about..." target="_blank" rel="noopener">0789 977 932</a>'
$newStr = '<a href="https://wa.me/254789977932?text=Hi%2C%20I%20found%20you%20through%20the%20Spark%20Technologies%20website%20and%20I%27d%20like%20to%20ask%20about..." target="_blank" rel="noopener">Click to chat</a>'

if ($content.Contains($oldStr)) {
  $content = $content.Replace($oldStr, $newStr)
  Set-Content -Path $fpath -Value $content -NoNewline
  Write-Host "Patched: WhatsApp link text -> Click to chat"
} else {
  Write-Host "SKIPPED (not found)"
}
