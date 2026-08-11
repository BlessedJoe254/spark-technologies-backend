$fpath = "frontend\contact.html"
$content = Get-Content $fpath -Raw

$bodyTag = "</body>"
$count = ([regex]::Matches($content, [regex]::Escape($bodyTag))).Count
Write-Host "Found $count occurrence(s) of </body> in the file"

$idx = $content.LastIndexOf($bodyTag)
if ($idx -lt 0) {
  Write-Host "ABORTED: no </body> tag found"
} else {
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

"@
  $newContent = $content.Substring(0, $idx) + $toastBlock + $content.Substring($idx)
  Set-Content -Path $fpath -Value $newContent -NoNewline
  Write-Host "Patched: toast markup + script inserted once, before the closing </body>"
}
