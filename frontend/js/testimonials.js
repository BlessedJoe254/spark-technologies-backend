/* tm-v2 */
(function () {
  var API = (typeof API_BASE !== "undefined") ? API_BASE : "";
  var host = document.getElementById("testimonials-section");
  if (!host) return;
  var isAdmin = false;
  var rating = 0;
  var list = [];

  var PALETTE = [
    ["#1F8A5D", "#146B42"], ["#2563EB", "#1E40AF"], ["#D97706", "#B45309"],
    ["#7C3AED", "#5B21B6"], ["#DB2777", "#9D174D"], ["#0891B2", "#155E75"]
  ];
  var ROLE = {
    Student: ["#EAF6EE", "#146B42"], Parent: ["#FEF3C7", "#92400E"],
    Trainer: ["#E0E7FF", "#3730A3"], Visitor: ["#F1F5F9", "#475569"]
  };

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
    for (var i = 1; i <= 5; i++) out += '<span style="color:' + (i <= n ? "#F5B301" : "#D9E2DC") + ';">&#9733;</span>';
    return out;
  }
  function pick(name) {
    var h = 0, s = String(name || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  var css = document.createElement("style");
  css.textContent =
    "#testimonials-section{margin:22px 0;}" +
    ".tm-head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:16px;}" +
    ".tm-head h2{margin:0;font-size:24px;color:var(--ink,#14231C);}" +
    ".tm-head p{margin:3px 0 0;color:var(--muted,#5B6B63);font-size:14px;}" +
    ".tm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;}" +
    ".tm-card{position:relative;overflow:hidden;background:#fff;border:1px solid var(--line,#DDEBE3);border-radius:16px;box-shadow:0 4px 18px rgba(20,35,28,.06);padding:20px 18px 16px;display:flex;flex-direction:column;gap:12px;transition:transform .15s ease,box-shadow .15s ease;}" +
    ".tm-card:hover{transform:translateY(-3px);box-shadow:0 10px 26px rgba(20,35,28,.12);}" +
    ".tm-card:before{content:'';position:absolute;left:0;top:0;right:0;height:4px;background:linear-gradient(90deg,var(--green,#1F8A5D),var(--spark,#FFC93C));}" +
    ".tm-quote{position:absolute;top:10px;right:16px;font-size:64px;line-height:1;color:var(--green-tint,#EAF6EE);font-family:Georgia,serif;pointer-events:none;}" +
    ".tm-top{display:flex;align-items:center;gap:8px;font-size:18px;letter-spacing:1px;position:relative;}" +
    ".tm-score{font-size:13px;font-weight:700;color:var(--muted,#5B6B63);letter-spacing:0;}" +
    ".tm-msg{margin:0;color:var(--ink,#14231C);font-size:15px;line-height:1.6;word-break:break-word;position:relative;}" +
    ".tm-chip{align-self:flex-start;background:var(--green-tint,#EAF6EE);color:var(--green-dark,#146B42);border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;}" +
    ".tm-foot{display:flex;align-items:center;gap:10px;margin-top:auto;padding-top:12px;border-top:1px solid var(--line,#DDEBE3);}" +
    ".tm-av{width:40px;height:40px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex:none;}" +
    ".tm-info{flex:1;min-width:0;}" +
    ".tm-name{font-weight:700;font-size:14px;color:var(--ink,#14231C);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    ".tm-sub{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:2px;font-size:12px;color:var(--muted,#5B6B63);}" +
    ".tm-role{border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700;}" +
    ".tm-del{background:none;border:1px solid #e3b4b4;color:#a33;border-radius:8px;padding:3px 9px;font-size:12px;cursor:pointer;flex:none;}" +
    ".tm-del:hover{background:#fdf0f0;}" +
    ".tm-empty{padding:22px;border:1px dashed var(--line,#DDEBE3);border-radius:16px;color:var(--muted,#5B6B63);text-align:center;grid-column:1/-1;}" +
    ".tm-overlay{position:fixed;inset:0;background:rgba(20,35,28,.55);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px;}" +
    ".tm-overlay.open{display:flex;}" +
    ".tm-modal{background:#fff;border-radius:16px;width:100%;max-width:460px;max-height:92vh;overflow:auto;padding:22px;display:flex;flex-direction:column;gap:12px;}" +
    ".tm-modal h3{margin:0;color:var(--ink,#14231C);}" +
    ".tm-modal label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted,#5B6B63);text-transform:uppercase;letter-spacing:.03em;}" +
    ".tm-modal input[type=text],.tm-modal select,.tm-modal textarea{padding:9px 10px;border:1px solid var(--line,#DDEBE3);border-radius:8px;font:inherit;font-size:14px;text-transform:none;letter-spacing:0;color:var(--ink,#14231C);background:#fff;}" +
    ".tm-stars button{background:none;border:0;font-size:32px;cursor:pointer;color:#D9E2DC;padding:0 2px;}" +
    ".tm-stars button.on{color:#F5B301;}" +
    ".tm-count{font-size:12px;color:var(--muted,#5B6B63);text-align:right;}" +
    ".tm-err{color:#a33;font-size:13px;min-height:16px;}" +
    ".tm-actions{display:flex;gap:8px;justify-content:flex-end;}" +
    ".tm-trap{position:absolute;left:-9999px;opacity:0;height:0;width:0;}";
  document.head.appendChild(css);

  host.innerHTML =
    '<div class="tm-head"><div><h2>What people say about us</h2><p id="tm-summary">Real words from our students, parents and visitors.</p></div>' +
    '<button type="button" class="btn btn-primary" id="tm-open">Share your thoughts</button></div>' +
    '<div class="tm-grid" id="tm-grid"><div class="tm-empty">Loading messages...</div></div>' +
    '<div class="tm-overlay" id="tm-overlay"><div class="tm-modal" role="dialog" aria-label="Share your thoughts">' +
      '<h3>Share your thoughts</h3>' +
      '<label>Your name<input type="text" id="tm-name" maxlength="80" placeholder="e.g. Amina W."></label>' +
      '<label>I am a<select id="tm-role"><option>Student</option><option>Parent</option><option>Trainer</option><option selected>Visitor</option></select></label>' +
      '<label>Course (optional)<select id="tm-course"><option value="">General / not listed</option></select></label>' +
      '<label>Your rating<div class="tm-stars" id="tm-stars"><button type="button" data-v="1">&#9733;</button><button type="button" data-v="2">&#9733;</button><button type="button" data-v="3">&#9733;</button><button type="button" data-v="4">&#9733;</button><button type="button" data-v="5">&#9733;</button></div></label>' +
      '<label>Your message<textarea id="tm-msg" rows="4" maxlength="400" placeholder="What do you like about Spark Technologies?"></textarea></label>' +
      '<div class="tm-count" id="tm-count">0 / 400</div>' +
      '<input type="text" class="tm-trap" id="tm-trap" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div class="tm-err" id="tm-err"></div>' +
      '<div class="tm-actions"><button type="button" class="btn btn-ghost" id="tm-cancel">Cancel</button><button type="button" class="btn btn-primary" id="tm-send">Send message</button></div>' +
    '</div></div>';

  var grid = document.getElementById("tm-grid");
  var overlay = document.getElementById("tm-overlay");
  var courseSel = document.getElementById("tm-course");

  function card(t) {
    var col = pick(t.name);
    var rc = ROLE[t.role] || ROLE.Visitor;
    var init = esc((t.name || "?").trim().charAt(0).toUpperCase());
    var r = Number(t.rating) || 0;
    return '<div class="tm-card" data-id="' + Number(t.id) + '"><span class="tm-quote">&ldquo;</span>' +
      '<div class="tm-top">' + stars(r) + '<span class="tm-score">' + r.toFixed(1) + '</span></div>' +
      '<p class="tm-msg">' + esc(t.message) + '</p>' +
      (t.course ? '<span class="tm-chip">' + esc(t.course) + '</span>' : "") +
      '<div class="tm-foot">' +
        '<div class="tm-av" style="background:linear-gradient(135deg,' + col[0] + ',' + col[1] + ');">' + init + '</div>' +
        '<div class="tm-info"><div class="tm-name">' + esc(t.name) + '</div>' +
          '<div class="tm-sub"><span class="tm-role" style="background:' + rc[0] + ';color:' + rc[1] + ';">' + esc(t.role) + '</span><span>' + esc(ago(t.created_at)) + '</span></div></div>' +
        (isAdmin ? '<button type="button" class="tm-del" data-id="' + Number(t.id) + '">Delete</button>' : "") +
      '</div></div>';
  }
  function summary() {
    var el = document.getElementById("tm-summary");
    if (!list.length) { el.textContent = "Real words from our students, parents and visitors."; return; }
    var sum = 0;
    list.forEach(function (t) { sum += Number(t.rating) || 0; });
    el.innerHTML = '<span style="color:#F5B301;">&#9733;</span> <strong>' + (sum / list.length).toFixed(1) + '</strong> average from ' + list.length + ' review' + (list.length === 1 ? "" : "s");
  }
  function render() {
    grid.innerHTML = list.length ? list.map(card).join("") : '<div class="tm-empty">No messages yet. Be the first to share your thoughts!</div>';
    summary();
  }
  function load() {
    fetch(API + "/api/testimonials", { credentials: "include" })
      .then(function (r) { return r.json(); })
      .then(function (d) { list = Array.isArray(d) ? d : []; render(); })
      .catch(function () { grid.innerHTML = '<div class="tm-empty">Messages could not be loaded right now.</div>'; });
  }
  function loadCourses() {
    fetch(API + "/api/courses", { credentials: "include" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var arr = Array.isArray(d) ? d : (d && Array.isArray(d.courses) ? d.courses : []);
        var seen = {}, opts = '<option value="">General / not listed</option>';
        arr.forEach(function (c) {
          var t = String((c && c.title) || "").trim();
          if (t && !seen[t]) { seen[t] = 1; opts += '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }
        });
        courseSel.innerHTML = opts;
      })
      .catch(function () {});
  }
  fetch(API + "/api/testimonials/can-moderate", { credentials: "include" })
    .then(function (r) { if (r.ok) { isAdmin = true; render(); } })
    .catch(function () {});
  load();
  loadCourses();

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
    var role = document.getElementById("tm-role").value;
    var course = courseSel.value;
    if (name.length < 2) { err.textContent = "Please enter your name."; return; }
    if (!rating) { err.textContent = "Please choose a star rating."; return; }
    if (msg.length < 10) { err.textContent = "Please write at least 10 characters."; return; }
    err.textContent = "";
    btn.disabled = true; btn.textContent = "Sending...";
    fetch(API + "/api/testimonials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: name, role: role, course: course, rating: rating, message: msg, website: document.getElementById("tm-trap").value })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        btn.disabled = false; btn.textContent = "Send message";
        if (!r.ok) { err.textContent = r.d.error || "Could not send your message."; return; }
        list.unshift({ id: r.d.id || 0, name: name, role: role, course: course, rating: rating, message: msg, created_at: new Date().toISOString() });
        render();
        document.getElementById("tm-msg").value = "";
        document.getElementById("tm-count").textContent = "0 / 400";
        courseSel.value = "";
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