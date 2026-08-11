$fpath = "frontend\contact.html"
$content = Get-Content $fpath -Raw
$normalized = $content -replace "`r`n", "`n"

# 1. Add onclick handlers to the two tiles
$oldEmailA = 'href="mailto:sparktech511@gmail.com?subject=Inquiry%20from%20the%20Spark%20Technologies%20website&body=Hi%2C%20I%20found%20you%20through%20the%20Spark%20Technologies%20website%20and%20I%27d%20like%20to%20ask%20about..."'
$newEmailA = 'href="mailto:sparktech511@gmail.com?subject=Inquiry%20from%20the%20Spark%20Technologies%20website&body=Hi%2C%20I%20found%20you%20through%20the%20Spark%20Technologies%20website%20and%20I%27d%20like%20to%20ask%20about..." onclick="showContactToast()"'

$oldWaA = 'href="https://wa.me/254789977932?text=Hi%2C%20I%20found%20you%20through%20the%20Spark%20Technologies%20website%20and%20I%27d%20like%20to%20ask%20about..."'
$newWaA = 'href="https://wa.me/254789977932?text=Hi%2C%20I%20found%20you%20through%20the%20Spark%20Technologies%20website%20and%20I%27d%20like%20to%20ask%20about..." onclick="showContactToast()"'

$changes = 0
if ($normalized.Contains($oldEmailA)) { $normalized = $normalized.Replace($oldEmailA, $newEmailA); $changes++; Write-Host "Patched: Email onclick" } else { Write-Host "SKIPPED: Email href not found" }
if ($normalized.Contains($oldWaA)) { $normalized = $normalized.Replace($oldWaA, $newWaA); $changes++; Write-Host "Patched: WhatsApp onclick" } else { Write-Host "SKIPPED: WhatsApp href not found" }

# 2. Add toast HTML + script before </body>
$toastBlock = @"
  <div id="contact-toast" class="contact-toast">Thanks for reaching out! We'll get back to you soon</div>
  <script>
    function showContactToast() {
      var t = document.getElementById('contact-toast');
      if (!t) return;
      t.classList.add('contact-toast--visible');
      clearTimeout(window._contactToastTimer);
      window._contactToastTimer = setTimeout(function () {
        t.classList.remove('contact-toast--visible');
      }, 4000);
    }
  </script>
</body>
"@

if ($normalized -match "</body>") {
  $normalized = $normalized -replace "</body>", [System.Text.RegularExpressions.Regex]::Escape("PLACEHOLDER") 
  $normalized = $normalized -replace "PLACEHOLDER", ($toastBlock -replace "`r`n","`n")
  $changes++
  Write-Host "Patched: toast markup + script inserted before </body>"
} else {
  Write-Host "SKIPPED: </body> not found"
}

$final = $normalized -replace "`n", "`r`n"
Set-Content -Path $fpath -Value $final -NoNewline
Write-Host "`nDone. $changes of 3 patches applied."
