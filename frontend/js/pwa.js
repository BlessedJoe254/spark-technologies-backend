(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }

  var deferredPrompt = null;
  var isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (isStandalone) return;

  function makeBtn(text) {
    var b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:9999;padding:10px 16px;border:0;border-radius:8px;background:#0d6efd;color:#fff;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)";
    document.body.appendChild(b);
    return b;
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var btn = makeBtn("Install app");
    btn.onclick = async function () {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.remove();
    };
  });

  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS) {
    window.addEventListener("load", function () {
      var btn = makeBtn("Install app");
      btn.onclick = function () {
        alert("To install: tap the Share button, then 'Add to Home Screen'.");
      };
    });
  }
})();