$fpath = "frontend\contact.html"
$content = Get-Content $fpath -Raw

$oldStr = @"
            <div class="info-card__body">
              <span class="info-card__label">EMAIL</span>
              <h3>sparktech511@gmail.com</h3>
              <p>The fastest way to reach the team directly for anything urgent.</p>
            </div>
          </div>

          <div class="info-card">
            <div class="info-card__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            </div>
"@

$newStr = @"
            <div class="info-card__body">
              <span class="info-card__label">EMAIL</span>
              <h3>sparktech511@gmail.com</h3>
              <p>The fastest way to reach the team directly for anything urgent.</p>
            </div>
          </div>

          <div class="info-card">
            <div class="info-card__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
            </div>
            <div class="info-card__body">
              <span class="info-card__label">WHATSAPP</span>
              <h3><a href="https://wa.me/254789977932" target="_blank" rel="noopener">0789 977 932</a></h3>
              <p>Message us directly on WhatsApp for a quick reply.</p>
            </div>
          </div>

          <div class="info-card">
            <div class="info-card__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            </div>
"@

if ($content.Contains($oldStr)) {
  $content = $content.Replace($oldStr, $newStr)
  Set-Content -Path $fpath -Value $content -NoNewline
  Write-Host "Patched: WhatsApp card inserted"
} else {
  Write-Host "SKIPPED (not found) - text didn't match exactly"
}
