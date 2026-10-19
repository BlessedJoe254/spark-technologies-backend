(function () {
  var API = (typeof API_BASE !== "undefined") ? API_BASE : "";
  var host = document.getElementById("testimonials-section");
  if (!host) return;
  var isAdmin = false;
  var rating = 0;

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function ago(d) {
    var t = new Date(d).getTime();
    if (isNaN(t)) return "";
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) { var m = Math.floor(s / 60); return m + " minute" + (m === 1 ? "" : "s") + " ago"; }
    if (s < 86400) { var h = Math.floor(s / 3600); return h + " hour" + (h === 1 ? "" : "s") + " ago"; }
    if (s < 2592000) { var dd = Math.floor(s / 86400); return dd + " day" + (dd === 1 ? "" : "s") + " ago"; }
    var mo = Math.floor(s / 2592000); return mo + " month" + (mo === 1 ? "" : "s") + " ago";
  }
  function stars(n) {
    var out = "";
    for (var i = 1; i <= 5; i++) out += '<span style="color:' + (i <= n ? "var(--spark,#FFC93C)" : "#d5ddd8") + ';">&#9733;</span>';
    return out;
  }

  var css = document.createElement("style");
  css.textContent =
    "#testimonials-section{margin:22px 0;}" +
    ".tm-head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:14px;}" +
    ".tm-head h2{margin:0;font-size:22px;color:var(--ink,#14231C);}" +
    ".tm-head p{margin:2px 0 0;color:var(--muted,#5B6B63);font-size:14px;}" +
    ".tm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;}" +
    ".tm-card{background:#fff;border:1px solid var(--line,#DDEBE3);border-radius:var(--radius,14px);box-shadow:var(--shadow,0 4px 18px rgba(20,35,28,.06));padding:16px;display:flex;flex-direction:column;gap:8px;position:relative;}" +
    ".tm-card:before{content:'\\201C';position:absolute;top:2px;right:14px;font-size:54px;color:var(--green-tint,#EAF6EE);font-family:Georgia,serif;line-height:1;}" +
    ".tm-msg{margin:0;color:var(--ink,#14231C);font-size:14.5px;line-height:1.5;word-break:break-word;}" +
    ".tm-who{display:flex;align-items:center;gap:10px;margin-top:auto;}" +
    ".tm-av{width:36px;height:36px;border-radius:50%;background:var(--green,#1F8A5D);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex:none;}" +
    ".tm-name{font-weight:700;font-size:14px;color:var(--ink,#14231C);}" +
    ".tm-meta{font-size:12px;color:var(--muted,#5B6B63);}" +
    ".tm-del{align-self:flex-start;background:none;border:1px solid #e3b4b4;color:#a33;border-radius:8px;padding:3px 9px;font-size:12px;cursor:pointer;}" +
    ".tm-empty{padding:18px;border:1px dashed var(--line,#DDEBE3);border-radius:var(--radius,14px);color:var(--muted,#5B6B63);text-align:center;}" +
    ".tm-overlay{position:fixed;inset:0;background:rgba(20,35,28,.55);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px;}" +
    ".tm-overlay.open{display:flex;}" +
    ".tm-modal{background:#fff;border-radius:var(--radius,14px);width:100%;max-width:460px;max-height:92vh;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:12px;}" +
    ".tm-modal h3{margin:0;color:var(--ink,#14231C);}" +
    ".tm-modal label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted,#5B6B63);text-transform:uppercase;letter-spacing:.03em;}" +
    ".tm-modal input[type=text],.tm-modal select,.tm-modal textarea{padding:9px 10px;border:1px solid var(--line,#DDEBE3);border-radius:8px;font:inherit;font-size:14px;text-transform:none;letter-spacing:0;color:var(--ink,#14231C);}" +
    ".tm-stars button{background:none;border:0;font-size:30px;cursor:pointer;color:#d5ddd8;padding:0 2px;}" +
    ".tm-stars button.on{color:var(--spark,#FFC93C);}" +
    ".tm-count{font-size:12px;color:var(--muted,#5B6B63);text-align:right;}" +
    ".tm-err{color:#a33;font-size:13px;min-height:16px;}" +
    ".tm-actions{display:flex;gap:8px;justify-content:flex-end;}" +
    ".tm-trap{position:absolute;left:-9999px;opacity:0;height:0;width:0;}";
  document.head.appendChild(css);

  host.innerHTML =
    '<div class="tm-head"><div><h2>What people say about us</h2><p>Real words from our students, parents and visitors.</p></div>' +
    '<button type="button" class="btn btn-primary" id="tm-open">Share your thoughts</button></div>' +
    '<div class="tm-grid" id="tm-grid"><div class="tm-empty">Loading messages...</div></div>' +
    '<div class="tm-overlay" id="tm-overlay"><div class="tm-modal" role="dialog" aria-label="Share your thoughts">' +
      '<h3>Share your thoughts</h3>' +
      '<label>Your name<input type="text" id="tm-name" maxlength="80" placeholder="e.g. Amina W."></label>' +
      '<label>I am a<select id="tm-role"><option>Student</option><option>Parent</option><option>Trainer</option><option selected>Visitor</option></select></label>' +
      '<label>Course you took (optional)<input type="text" id="tm-course" maxlength="120" placeholder="e.g. Web Development"></label>' +
      '<label>Your rating<div class="tm-stars" id="tm-stars"><button type="button" data-v="1">&#9733;</button><button type="button" data-v="2">&#9733;</button><button type="button" data-v="3">&#9733;</button><button type="button" data-v="4">&#9733;</button><button type="button" data-v="5">&#9733;</button></div></label>' +
      '<label>Your message<textarea id="tm-msg" rows="4" maxlength="400" placeholder="What do you like about Spark Technologies?"></textarea></label>' +
      '<div class="tm-count" id="tm-count">0 / 400</div>' +
      '<input type="text" class="tm-trap" id="tm-trap" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div class="tm-err" id="tm-err"></div>' +
      '<div class="tm-actions"><button type="button" class="btn btn-ghost" id="tm-cancel">Cancel</button><button type="button" class="btn btn-primary" id="tm-send">Send message</button></div>' +
    '</div></div>';

  var grid = document.getElementById("tm-grid");
  var overlay = document.getElementById("tm-overlay");

  function card(t) {
    var init = esc((t.name || "?").trim().charAt(0).toUpperCase());
    var meta = esc(t.role) + (t.course ? " &middot; " + esc(t.course) : "") + " &middot; " + esc(ago(t.created_at));
    return '<div class="tm-card" data-id="' + Number(t.id) + '"><div>' + stars(Number(t.rating)) + '</div>' +
      '<p class="tm-msg">' + esc(t.message) + '</p>' +
      '<div class="tm-who"><div class="tm-av">' + init + '</div><div><div class="tm-name">' + esc(t.name) + '</div><div class="tm-meta">' + meta + '</div></div></div>' +
      (isAdmin ? '<button type="button" class="tm-del" data-id="' + Number(t.id) + '">Delete</button>' : "") + '</div>';
  }
  var list = [];
  function render() {
    grid.innerHTML = list.length ? list.map(card).join("") : '<div class="tm-empty">No messages yet. Be the first to share your thoughts!</div>';
  }
  function load() {
    fetch(API + "/api/testimonials", { credentials: "include" })
      .then(function (r) { return r.json(); })
      .then(function (d) { list = Array.isArray(d) ? d : []; render(); })
      .catch(function () { grid.innerHTML = '<div class="tm-empty">Messages could not be loaded right now.</div>'; });
  }
  fetch(API + "/api/testimonials/can-moderate", { credentials: "include" })
    .then(function (r) { if (r.ok) { isAdmin = true; render(); } })
    .catch(function () {});
  load();

  function setStars(n) {
    rating = n;
    Array.prototype.forEach.call(document.querySelectorAll("#tm-stars button"), function (b) {
      b.classList.toggle("on", Number(b.dataset.v) <= n);
    });
  }
  function openForm() { document.getElementById("tm-err").textContent = ""; overlay.classList.add("open"); }
  function closeForm() { overlay.classList.remove("open"); }

  document.getElementById("tm-open").addEventListener("click", openForm);
  document.getElementById("tm-cancel").addEventListener("click", closeForm);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeForm(); });
  document.getElementById("tm-stars").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (b) setStars(Number(b.dataset.v));
  });
  document.getElementById("tm-msg").addEventListener("input", function () {
    document.getElementById("tm-count").textContent = this.value.length + " / 400";
  });

  document.getElementById("tm-send").addEventListener("click", function () {
    var btn = this, err = document.getElementById("tm-err");
    var name = document.getElementById("tm-name").value.trim();
    var msg = document.getElementById("tm-msg").value.trim();
    if (name.length < 2) { err.textContent = "Please enter your name."; return; }
    if (!rating) { err.textContent = "Please choose a star rating."; return; }
    if (msg.length < 10) { err.textContent = "Please write at least 10 characters."; return; }
    err.textContent = "";
    btn.disabled = true; btn.textContent = "Sending...";
    fetch(API + "/api/testimonials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: name, role: document.getElementById("tm-role").value,
        course: document.getElementById("tm-course").value.trim(),
        rating: rating, message: msg, website: document.getElementById("tm-trap").value
      })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        btn.disabled = false; btn.textContent = "Send message";
        if (!r.ok) { err.textContent = r.d.error || "Could not send your message."; return; }
        list.unshift({ id: r.d.id || 0, name: name, role: document.getElementById("tm-role").value, course: document.getElementById("tm-course").value.trim(), rating: rating, message: msg, created_at: new Date().toISOString() });
        render();
        document.getElementById("tm-msg").value = "";
        document.getElementById("tm-count").textContent = "0 / 400";
        setStars(0);
        closeForm();
      })
      .catch(function () { btn.disabled = false; btn.textContent = "Send message"; err.textContent = "Could not reach the server."; });
  });

  grid.addEventListener("click", function (e) {
    var b = e.target.closest(".tm-del");
    if (!b || !confirm("Delete this message for everyone?")) return;
    fetch(API + "/api/admin/testimonials/" + b.dataset.id + "/delete", { method: "POST", credentials: "include" })
      .then(function (r) { if (r.ok) { list = list.filter(function (x) { return String(x.id) !== b.dataset.id; }); render(); } else { alert("Could not delete that message."); } })
      .catch(function () { alert("Could not reach the server."); });
  });

  var adminViews = ["overview", "finance", "courses", "messages", "users", "students", "certificates", "intakes"];
  function sync() { host.style.display = adminViews.indexOf(location.hash.replace("#", "")) > -1 ? "none" : ""; }
  window.addEventListener("hashchange", sync);
  sync();
})();