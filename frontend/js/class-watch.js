(function () {
  var m = /[?&]id=(\d+)/.exec(location.search);
  if (!m) return;
  var id = m[1], stopped = false, timer = null;
  function leave(next) {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    try { if (window.api && typeof window.api.executeCommand === "function") window.api.executeCommand("hangup"); } catch (e) {}
    document.body.innerHTML = '<div style="font-family:system-ui,sans-serif;max-width:420px;margin:18vh auto;padding:24px;text-align:center;"><h2 style="margin:0 0 8px;">Class ended</h2><p style="color:#555;">The class has ended. Taking you back...</p></div>';
    setTimeout(function () { location.replace(next || "classes.html"); }, 1800);
  }
  function ping() {
    fetch("/api/classes/" + id + "/attend", { method: "POST", credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && (d.status === "ended" || d.status === "cancelled")) leave(d.next); })
      .catch(function () {});
  }
  ping();
  timer = setInterval(ping, 10000);
})();
