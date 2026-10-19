(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }

  var isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (isStandalone) return;

  var deferredPrompt = null;
  var wrap = null;

  var st = document.createElement("style");
  st.textContent =
    ".install-wrap{flex:none;padding:0 0 10px 0;}" +
    ".install-wrap.floating{position:fixed;bottom:16px;right:16px;z-index:9999;padding:0;}" +
    ".install-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:10px 12px;border:0;border-radius:10px;background:var(--green,#1f8a5b);color:var(--white,#fff);font:inherit;font-size:14.5px;font-weight:500;cursor:pointer;transition:filter .15s ease;}" +
    ".install-btn:hover{filter:brightness(1.1);}" +
    ".install-wrap.floating .install-btn{width:auto;padding:10px 16px;box-shadow:0 2px 8px rgba(0,0,0,.3);}" +
    ".install-btn svg{width:16px;height:16px;flex:none;}" +
    ".install-hint{margin:8px 4px 0 4px;font-size:12px;line-height:1.4;color:#9DBBAB;}" +
    ".install-wrap.floating .install-hint{background:#fff;color:#222;padding:8px 10px;border-radius:8px;max-width:220px;}";
  document.head.appendChild(st);

  function makeBtn() {
    if (wrap) return wrap;
    wrap = document.createElement("div");
    wrap.className = "install-wrap";
    var b = document.createElement("button");
    b.type = "button";
    b.className = "install-btn";
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg><span>Install app</span>';
    wrap.appendChild(b);
    var footer = document.querySelector(".sidebar__footer");
    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(wrap, footer);
    } else {
      wrap.className += " floating";
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  function removeBtn() {
    if (wrap) { wrap.remove(); wrap = null; }
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var w = makeBtn();
    w.querySelector(".install-btn").onclick = async function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (err) {}
      deferredPrompt = null;
      removeBtn();
    };
  });

  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    removeBtn();
  });

  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS) {
    var showIos = function () {
      var w = makeBtn();
      var hint = null;
      w.querySelector(".install-btn").onclick = function () {
        if (hint) { hint.remove(); hint = null; return; }
        hint = document.createElement("div");
        hint.className = "install-hint";
        hint.textContent = "Tap the Share button, then Add to Home Screen.";
        w.appendChild(hint);
      };
    };
    if (document.readyState === "complete") showIos();
    else window.addEventListener("load", showIos);
  }
})();
