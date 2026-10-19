let currentUserRole = null;

document.addEventListener("DOMContentLoaded", () => { init(); });

async function init() {
  const session = await loadSession();
  setGreeting(session.user);
  setTopbar(session.user);
  loadDashboardStats();
  loadRecentActivity();

  if (session.user) {
    currentUserRole = session.user.role;

    const ql = document.getElementById("ql-register");
    if (ql) ql.style.display = "none";

    loadNotificationBell();
    setInterval(loadNotificationBell, 20000);

    if (session.user.role === "student") {
      showPanel("student-panel");
      loadStudentCourses();
      loadStudentInbox();
      setInterval(loadStudentInbox, 20000);
    } else if (session.user.role === "trainer") {
      showPanel("trainer-panel");
      loadTrainerEarnings();
      loadTrainerStudents();
      loadTrainerInbox();
      loadTrainerSentMessages();
      const trainerForm = document.getElementById("trainer-compose-form");
      if (trainerForm) trainerForm.addEventListener("submit", handleSendTrainerMessage);
      setInterval(loadTrainerInbox, 20000);
    } else if (session.user.role === "admin") {
      showPanel("admin-panel");
      loadAdminEarnings();
      loadAdminOverview();
      loadPendingPayments();
      loadAdminComposeOptions();
      loadAdminSentMessages();
      loadAdminUsers();
      setupAdminTabs();
      setupUserRoleToggle();
      setupCertTab();
      const addCourseForm = document.getElementById("admin-add-course-form");
      if (addCourseForm) addCourseForm.addEventListener("submit", handleAddCourse);
      const adminForm = document.getElementById("admin-compose-form");
      if (adminForm) adminForm.addEventListener("submit", handleSendAdminMessage);

      const statMessagesCard = document.getElementById("stat-messages-card");
      if (statMessagesCard) {
        statMessagesCard.style.cursor = "pointer";
        statMessagesCard.title = "View and reply to messages";
        statMessagesCard.addEventListener("click", () => { window.location.href = "contact.html"; });
      }
    }
  }

  setInterval(loadRecentActivity, 20000);
}

function showPanel(id) { const el = document.getElementById(id); if (el) el.style.display = "block"; }

async function loadSession() {
  try {
    const res = await fetch(API_BASE + "/api/session", { credentials: "include" });
    if (!res.ok) throw new Error("Session check failed");
    return await res.json();
  } catch (err) { return { user: null }; }
}

function setGreeting(user) {
  const hour = new Date().getHours();
  let greeting = "Good evening";
  if (hour < 12) greeting = "Good morning"; else if (hour < 18) greeting = "Good afternoon";
  const name = user ? user.full_name.split(" ")[0] : "builder";
  const greetEl = document.getElementById("hero-greeting");
  if (greetEl) greetEl.textContent = greeting + ", " + name + ".";
  const subEl = document.getElementById("hero-sub");
  if (subEl && user) {
    if (user.role === "student") subEl.textContent = "Here are the courses you are enrolled in.";
    else if (user.role === "trainer") subEl.textContent = "Here is an overview of your students and earnings.";
    else if (user.role === "admin") subEl.textContent = "Here is everything happening across trainers, students and payments.";
  }
  const dateEl = document.getElementById("hero-date");
  if (dateEl) { const opts = { weekday: "long", month: "short", day: "numeric" }; dateEl.textContent = new Date().toLocaleDateString("en-US", opts).toUpperCase(); }
}

function setTopbar(user) {
  const el = document.getElementById("topbar-actions");
  if (!el) return;
  if (!user) {
    el.innerHTML = "<a href=\"login.html\" class=\"btn btn-ghost\">Log In</a><a href=\"register.html\" class=\"btn btn-primary\">Create Account</a>";
    return;
  }
  el.innerHTML =
    "<div class=\"notif-wrap\" id=\"notif-wrap\">" +
      "<button class=\"notif-bell\" id=\"notif-bell-btn\" aria-label=\"Notifications\">" +
        "<svg viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9\"></path><path d=\"M13.73 21a2 2 0 0 1-3.46 0\"></path></svg>" +
        "<span class=\"notif-badge\" id=\"notif-badge\" style=\"display:none;\">0</span>" +
      "</button>" +
      "<div class=\"notif-dropdown\" id=\"notif-dropdown\" style=\"display:none;\"></div>" +
    "</div>" +
    "<span class=\"role-badge\">" + escapeHtml(user.role) + "</span><button class=\"btn btn-ghost\" id=\"logout-btn\">Log out</button>";
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", async () => { await fetch(API_BASE + "/api/logout", { method: "POST", credentials: "include" }); window.location.href = "login.html"; });

  const bellBtn = document.getElementById("notif-bell-btn");
  if (bellBtn) {
    bellBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById("notif-dropdown");
      if (dropdown) dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
    });
    document.addEventListener("click", (e) => {
      const wrap = document.getElementById("notif-wrap");
      const dropdown = document.getElementById("notif-dropdown");
      if (wrap && dropdown && !wrap.contains(e.target)) dropdown.style.display = "none";
    });
  }
}

async function getAdminUnreadContactMessages() {
  try {
    const res = await fetch(API_BASE + "/api/admin/messages", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const rows = await res.json();
    return rows.filter(m => !m.is_read);
  } catch (err) {
    return [];
  }
}

function contactNotifItemHtml(m) {
  return (
    "<a class=\"message-item contact-notif-item\" href=\"contact.html\">" +
      "<div class=\"message-item__head\">" +
        "<span class=\"message-item__from\">" + escapeHtml(m.name) + "</span>" +
        "<span class=\"message-item__time\">" + timeAgo(m.created_at) + "</span>" +
      "</div>" +
      "<div class=\"message-item__subject\">" + escapeHtml(m.subject || "No subject") + " <span class=\"unread-dot\"></span></div>" +
    "</a>"
  );
}

async function loadNotificationBell() {
  const badge = document.getElementById("notif-badge");
  const dropdown = document.getElementById("notif-dropdown");
  const statMessages = document.getElementById("stat-messages");
  try {
    const res = await fetch(API_BASE + "/api/messages/inbox", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const msgs = await res.json();
    const unread = msgs.filter(m => !m.is_read).length;
    const contactMsgs = currentUserRole === "admin" ? await getAdminUnreadContactMessages() : [];
    const contactUnread = contactMsgs.length;
    const totalUnread = unread + contactUnread;

    if (statMessages) animateValue(statMessages, totalUnread);

    if (badge) {
      if (totalUnread > 0) { badge.style.display = "flex"; badge.textContent = totalUnread > 9 ? "9+" : totalUnread; } else { badge.style.display = "none"; }
    }
    if (dropdown) {
      if (msgs.length === 0 && contactMsgs.length === 0) {
        dropdown.innerHTML = "<div class=\"notif-empty\">No messages yet.</div>";
      } else {
        const contactSectionHtml = contactMsgs.length > 0
          ? "<div class=\"notif-dropdown-head\">Contact form</div>" + contactMsgs.slice(0, 4).map(contactNotifItemHtml).join("")
          : "";
        const directSectionHtml = msgs.length > 0
          ? "<div class=\"notif-dropdown-head\">Messages</div>" + msgs.slice(0, 6).map(messageItemHtml).join("")
          : "";
        dropdown.innerHTML = contactSectionHtml + directSectionHtml;
        wireMessageOpenEvents(dropdown, () => {
          const stillUnread = dropdown.querySelectorAll(".message-item.is-unread").length;
          const newTotal = stillUnread + contactUnread;
          if (badge) { if (newTotal > 0) { badge.style.display = "flex"; badge.textContent = newTotal > 9 ? "9+" : newTotal; } else { badge.style.display = "none"; } }
          if (statMessages) animateValue(statMessages, newTotal);
        });
      }
    }
  } catch (err) {
    if (dropdown) dropdown.innerHTML = "<div class=\"notif-empty\">Could not load messages right now.</div>";
  }
}

async function loadDashboardStats() {
  const els = { courses: document.getElementById("stat-courses"), projects: document.getElementById("stat-projects"), students: document.getElementById("stat-students"), messages: document.getElementById("stat-messages") };
  try {
    const res = await fetch(API_BASE + "/api/dashboard/stats");
    if (!res.ok) throw new Error("Request failed: " + res.status);
    const data = await res.json();
    animateValue(els.courses, Number(data.courses));
    animateValue(els.projects, Number(data.projects));
    animateValue(els.students, Number(data.students));
    animateValue(els.messages, Number(data.messages));
  } catch (err) { console.warn("Dashboard stats unavailable:", err.message); }
}

function animateValue(el, end) {
  if (!el || isNaN(end)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = end; return; }
  const duration = 700, startTime = performance.now();
  function tick(now) { const progress = Math.min((now - startTime) / duration, 1); el.textContent = Math.round(end * progress); if (progress < 1) requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
}

/* ---------- Shared helpers ---------- */
function escapeHtml(str) { const div = document.createElement("div"); div.textContent = str == null ? "" : str; return div.innerHTML; }

function formatKes(n) {
  const num = Number(n) || 0;
  return "KES " + num.toLocaleString("en-KE", { maximumFractionDigits: 2 });
}

function timeAgo(dateStr) {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  const diffSec = Math.max(1, Math.round((now - then) / 1000));
  if (diffSec < 60) return diffSec + "s ago";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return diffMin + " min" + (diffMin === 1 ? "" : "s") + " ago";
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return diffHr + " hour" + (diffHr === 1 ? "" : "s") + " ago";
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return diffDay + " day" + (diffDay === 1 ? "" : "s") + " ago";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusBadge(has_paid, fee_kes) {
  if (fee_kes === null || fee_kes === undefined) return "<span class=\"status-badge paid\">Free</span>";
  return has_paid ? "<span class=\"status-badge paid\">Paid</span>" : "<span class=\"status-badge unpaid\">Unpaid</span>";
}

function attendanceBarHtml(attended, total) {
  const pct = Math.round((attended / total) * 100);
  return (
    "<div class=\"attendance-bar\">" +
      "<div class=\"attendance-bar__track\"><div class=\"attendance-bar__fill\" style=\"width:" + pct + "%\"></div></div>" +
      "<span class=\"attendance-bar__label\">" + attended + "/" + total + "</span>" +
    "</div>"
  );
}

function attendanceGraphHtml(sessions) {
  if (!sessions || sessions.length === 0) return "<div class=\"empty-state\">No classes recorded yet.</div>";
  return (
    "<div class=\"attendance-graph\">" +
      sessions.map(s => (
        "<div class=\"attendance-graph__col\">" +
          "<div class=\"attendance-graph__bar " + (s.present ? "is-present" : "is-absent") + "\"></div>" +
          "<span class=\"attendance-graph__label\">" + s.session_number + "</span>" +
        "</div>"
      )).join("") +
    "</div>"
  );
}

function scoresHtml(scores) {
  const row = (label, s) => "<div class=\"score-chip\"><span>" + label + "</span><strong>" + (s ? (s.score + "/" + s.max_score) : "—") + "</strong></div>";
  return "<div class=\"scores-row\">" + row("CAT 1", scores.cat1) + row("CAT 2", scores.cat2) + row("Final", scores.final) + "</div>";
}

function classLinksHtml(links) {
  if (!links || links.length === 0) return "<div class=\"empty-state\">No active class links. Links disappear 24 hours after they are posted.</div>";
  return (
    "<table class=\"simple-table\"><thead><tr><th>Title</th><th></th></tr></thead><tbody>" +
      links.map(l => (
        "<tr><td>" + escapeHtml(l.title) + "</td><td><a href=\"" + escapeHtml(l.url) + "\" target=\"_blank\" rel=\"noopener\" class=\"btn btn-ghost\" style=\"padding:4px 10px;font-size:12px;\">Open</a></td></tr>"
      )).join("") +
    "</tbody></table>"
  );
}

function notesTableHtml(notes) {
  if (!notes || notes.length === 0) return "<div class=\"empty-state\">No notes uploaded yet.</div>";
  return (
    "<table class=\"simple-table\"><thead><tr><th>Title</th><th></th></tr></thead><tbody>" +
      notes.map(n => (
        "<tr><td>" + escapeHtml(n.title) + "</td><td><a href=\"/api/notes/" + n.id + "/download\" class=\"btn btn-ghost\" style=\"padding:4px 10px;font-size:12px;\">Download</a></td></tr>"
      )).join("") +
    "</tbody></table>"
  );
}

function earningsCard(label, value, extraClass) {
  return "<div class=\"earnings-card " + (extraClass || "") + "\"><div class=\"earnings-card__label\">" + label + "</div><div class=\"earnings-card__value\">" + value + "</div></div>";
}

/* ---------- Recent activity ---------- */
async function loadRecentActivity() {
  const container = document.getElementById("recent-activity-list");
  if (!container) return;
  try {
    const res = await fetch(API_BASE + "/api/activity/recent");
    if (!res.ok) throw new Error("Request failed");
    const rows = await res.json();
    if (rows.length === 0) { container.innerHTML = "<div class=\"empty-state\">No activity yet.</div>"; return; }
    container.innerHTML = rows.map((r, i) => (
      "<div class=\"timeline-item" + (i === 0 ? " is-highlight" : "") + "\">" +
        "<div class=\"node\"></div>" +
        "<div class=\"a-title\">" + escapeHtml(r.description) + "</div>" +
        "<div class=\"a-time\">" + timeAgo(r.created_at) + "</div>" +
      "</div>"
    )).join("");
  } catch (err) { container.innerHTML = "<div class=\"empty-state\">Could not load recent activity right now.</div>"; }
}

/* ---------- Messages: shared rendering ---------- */
function messageItemHtml(m) {
  return (
    "<div class=\"message-item" + (m.is_read ? "" : " is-unread") + "\" data-message-id=\"" + m.id + "\">" +
      "<div class=\"message-item__head\">" +
        "<span class=\"message-item__from\">" + escapeHtml(m.sender_name) + "</span>" +
        "<span class=\"message-item__time\">" + timeAgo(m.created_at) + "</span>" +
      "</div>" +
      "<div class=\"message-item__subject\">" + escapeHtml(m.subject) + (m.is_read ? "" : " <span class=\"unread-dot\"></span>") + "</div>" +
      "<div class=\"message-item__body\" style=\"display:none;\">" + escapeHtml(m.body).replace(/\n/g, "<br>") + "</div>" +
    "</div>"
  );
}

function wireMessageOpenEvents(container, onReadCallback) {
  container.querySelectorAll(".message-item").forEach(item => {
    item.addEventListener("click", async () => {
      const body = item.querySelector(".message-item__body");
      const isOpen = body.style.display !== "none";
      container.querySelectorAll(".message-item__body").forEach(b => { b.style.display = "none"; });
      if (!isOpen) {
        body.style.display = "block";
        if (item.classList.contains("is-unread")) {
          item.classList.remove("is-unread");
          const dot = item.querySelector(".unread-dot");
          if (dot) dot.remove();
          try {
            await fetch(API_BASE + "/api/messages/" + item.dataset.messageId + "/read", { method: "POST", credentials: "include" });
            if (onReadCallback) onReadCallback();
          } catch (err) {}
        }
      }
    });
  });
}

function sentMessageItemHtml(m) {
  return (
    "<div class=\"sent-message-item\"><span class=\"sm-to\">To " + escapeHtml(m.recipient_name) + ":</span> " + escapeHtml(m.subject) +
    " <span class=\"sm-time\">" + timeAgo(m.created_at) + "</span></div>"
  );
}

/* ---------- Student ---------- */
async function loadStudentCourses() {
  const container = document.getElementById("student-course-list");
  if (!container) return;
  try {
    const res = await fetch(API_BASE + "/api/my-courses", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const courses = await res.json();
    if (courses.length === 0) { container.innerHTML = "<div class=\"empty-state\">You have not enrolled in any courses yet. <a href=\"courses.html\">Browse courses</a>.</div>"; return; }
    container.innerHTML = courses.map(studentCourseBlockHtml).join("");
    container.querySelectorAll(".payment-form").forEach(form => form.addEventListener("submit", handlePaymentSubmit));
    container.querySelectorAll(".cat-upload-form").forEach(form => form.addEventListener("submit", handleCatUpload));
    loadStudentCatStatus();
  } catch (err) { container.innerHTML = "<div class=\"empty-state\">Could not load your courses right now.</div>"; }
}

function studentCourseBlockHtml(c) {
  const durationLabel = courseDurationText(c);
  let bodyHtml;
  if (c.unlocked) {
    bodyHtml =
      "<div class=\"unlocked-content\">" +
        "<div><div class=\"section-subhead\">Class links</div>" + classLinksHtml(c.class_links) + "</div>" +
        "<div><div class=\"section-subhead\">Attendance</div>" + attendanceBarHtml(c.attendance.attended, c.attendance.total) + attendanceGraphHtml(c.attendance.sessions) + "</div>" +
        "<div><div class=\"section-subhead\">Assessments</div>" + scoresHtml(c.scores) + "</div>" +
        "<div><div class=\"section-subhead\">CAT Submissions</div>" + catUploadHtml(c) + "</div>" +
        "<div><div class=\"section-subhead\">Notes</div>" + notesTableHtml(c.notes) + "</div>" +
      "</div>";
  } else if (c.payment_code) {
    bodyHtml = "<div class=\"payment-pending\"><span class=\"status-badge unpaid\">Awaiting confirmation</span><p class=\"cli-sub\">You submitted code <strong>" + escapeHtml(c.payment_code) + "</strong>. An admin will confirm it shortly.</p></div>";
  } else {
    bodyHtml =
      "<div class=\"payment-panel\">" +
        "<img src=\"assets/payment-instructions.png\" alt=\"Payment instructions\" class=\"payment-image\">" +
        "<form class=\"payment-form\" data-course-id=\"" + c.id + "\">" +
          "<label>M-Pesa confirmation code</label>" +
          "<input type=\"text\" class=\"payment-code-input\" placeholder=\"e.g. QJ7XXXXX\" required>" +
          "<button type=\"submit\" class=\"btn btn-primary\" style=\"padding:8px 14px;font-size:13px;\">Submit payment</button>" +
        "</form>" +
      "</div>";
  }
  return (
    "<div class=\"course-list-item course-list-item--block\">" +
      "<div class=\"course-list-item__top\"><div><div class=\"cli-title\">" + escapeHtml(c.title) + "</div><div class=\"cli-sub\">" + escapeHtml(c.level) + " . " + durationLabel + "</div></div>" + statusBadge(c.has_paid, c.fee_kes) + "</div>" +
      bodyHtml +
    "</div>"
  );
}

async function handlePaymentSubmit(e) {
  e.preventDefault();
  const form = e.target, courseId = Number(form.dataset.courseId), input = form.querySelector(".payment-code-input"), btn = form.querySelector("button"), code = input.value.trim();
  if (!code) return;
  btn.disabled = true; btn.textContent = "Submitting...";
  try {
    const res = await fetch(API_BASE + "/api/submit-payment", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ course_id: courseId, payment_code: code }) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not submit your code."); btn.disabled = false; btn.textContent = "Submit payment"; return; }
    loadStudentCourses();
  } catch (err) { alert("Could not reach the server. Please try again."); btn.disabled = false; btn.textContent = "Submit payment"; }
}

async function loadStudentInbox() {
  const container = document.getElementById("student-inbox-list");
  const countEl = document.getElementById("student-inbox-count");
  if (!container) return;
  try {
    const res = await fetch(API_BASE + "/api/messages/inbox", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const msgs = await res.json();
    const unread = msgs.filter(m => !m.is_read).length;
    if (countEl) countEl.textContent = unread + " unread";
    if (msgs.length === 0) { container.innerHTML = "<div class=\"empty-state\">No messages yet.</div>"; return; }
    container.innerHTML = msgs.map(messageItemHtml).join("");
    wireMessageOpenEvents(container, () => {
      if (countEl) countEl.textContent = container.querySelectorAll(".message-item.is-unread").length + " unread";
    });
  } catch (err) { container.innerHTML = "<div class=\"empty-state\">Could not load messages right now.</div>"; }
}

/* ---------- Trainer ---------- */
async function loadTrainerEarnings() {
  const container = document.getElementById("trainer-earnings");
  if (!container) return;
  try {
    const res = await fetch(API_BASE + "/api/trainer/earnings?month=" + encodeURIComponent(window.trainerEarningsMonth || currentMonthKey()), { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const d = await res.json();
    container.innerHTML = trainerMonthPickerHtml() +
      "<div class=\"earnings-cards\">" +
        earningsCard("Paid students", d.total_paid_students, "") +
        earningsCard("Total collected", formatKes(d.total_collected), "") +
        earningsCard("Your commission (" + d.trainer_share_pct + "%)", formatKes(d.your_commission), "is-highlight") +
        earningsCard("Company share (" + d.company_share_pct + "%)", formatKes(d.company_share), "") +
        earningsCard("Tax (" + d.tax_share_pct + "%)", formatKes(d.tax_share), "") +
      "</div>" +
      (d.courses.length === 0 ? "<div class=\"empty-state\">No paid students yet.</div>" :
        "<table class=\"simple-table\"><thead><tr><th>Course</th><th>Paid students</th><th>Fee</th><th>Collected</th><th>Your share</th></tr></thead><tbody>" +
        d.courses.map(c => (
          "<tr><td>" + escapeHtml(c.course_title) + "</td><td>" + c.paid_count + "</td><td>" + formatKes(c.fee_kes) + "</td><td>" + formatKes(c.collected) + "</td><td>" + formatKes(c.trainer_share) + "</td></tr>"
        )).join("") + "</tbody></table>");
  } catch (err) { container.innerHTML = "<div class=\"empty-state\">Could not load earnings right now.</div>"; }
}

async function loadTrainerStudents() {
  const container = document.getElementById("trainer-course-groups");
  const countEl = document.getElementById("trainer-student-count");
  if (!container) return;
  try {
    const res = await fetch(API_BASE + "/api/trainer/students", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const groups = await res.json();
    const total = groups.reduce((sum, g) => sum + g.students.length, 0);
    if (countEl) countEl.textContent = total + " student" + (total === 1 ? "" : "s");
    if (groups.length === 0) { container.innerHTML = "<div class=\"empty-state\">You do not have any assigned courses yet.</div>"; populateTrainerRecipientSelect([]); return; }
    container.innerHTML = groups.map(trainerGroupHtml).join("");
    wireTrainerGroupEvents(container);
    loadTrainerCatFiles(groups);
    populateTrainerRecipientSelect(groups);
  } catch (err) { container.innerHTML = "<div class=\"empty-state\">Could not load your students right now.</div>"; }
}

function populateTrainerRecipientSelect(groups) {
  const select = document.querySelector("#trainer-compose-form .msg-recipient-select");
  if (!select) return;
  let html = "<option value=\"\">Select a student or course...</option>";
  groups.forEach(g => {
    html += "<option value=\"course:" + g.course_id + "\">All students — " + escapeHtml(g.course_title) + "</option>";
    g.students.forEach(s => {
      html += "<option value=\"student:" + s.id + "\">" + escapeHtml(s.full_name) + " (" + escapeHtml(g.course_title) + ")</option>";
    });
  });
  select.innerHTML = html;
}

function trainerGroupHtml(g) {
  return (
    "<div class=\"trainer-group\" data-course-id=\"" + g.course_id + "\">" +
      "<div class=\"trainer-group-head\">" + escapeHtml(g.course_title) + " <span class=\"stat-trend\">" + g.students.length + " student" + (g.students.length === 1 ? "" : "s") + " . " + g.sessions_count + "/10 classes recorded</span></div>" +

      "<div class=\"section-subhead\">Class links</div>" +
      classLinksHtml(g.class_links) +
      "<form class=\"add-link-form\" data-course-id=\"" + g.course_id + "\" style=\"margin:8px 0 14px;display:flex;gap:8px;flex-wrap:wrap;\">" +
        "<input type=\"text\" class=\"link-title-input\" placeholder=\"Link title (e.g. Week 3 recording)\" required style=\"flex:1;min-width:160px;\">" +
        "<input type=\"url\" class=\"link-url-input\" placeholder=\"https://...\" required style=\"flex:1;min-width:160px;\">" +
        "<button type=\"submit\" class=\"btn btn-ghost\" style=\"padding:8px 14px;font-size:13px;\">Add link</button>" +
      "</form>" +

      "<div class=\"section-subhead\">Attendance</div>" +
      "<button class=\"btn btn-ghost record-class-btn\" data-course-id=\"" + g.course_id + "\" style=\"padding:8px 14px;font-size:13px;margin-bottom:10px;\"" + (g.sessions_count >= 10 ? " disabled" : "") + ">" +
        (g.sessions_count >= 10 ? "Maximum of 10 classes reached" : "Record today's class") +
      "</button>" +
      "<div class=\"attendance-checklist\" data-course-id=\"" + g.course_id + "\" style=\"display:none;\"></div>" +

      "<div class=\"section-subhead\">Notes</div>" +
      "<form class=\"notes-upload-form\" data-course-id=\"" + g.course_id + "\" style=\"margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;\">" +
        "<input type=\"text\" class=\"note-title-input\" placeholder=\"Note title\" required style=\"flex:1;min-width:140px;\">" +
        "<input type=\"file\" class=\"note-file-input\" accept=\".pdf,.doc,.docx\" required>" +
        "<button type=\"submit\" class=\"btn btn-ghost\" style=\"padding:8px 14px;font-size:13px;\">Upload note</button>" +
      "</form>" +
      notesTableHtml(g.notes) +

      "<div class=\"section-subhead\" style=\"margin-top:14px;\">Students</div>" +
      (g.students.length === 0 ? "<div class=\"empty-state\">No students enrolled yet.</div>" :
        "<table class=\"simple-table\"><thead><tr><th>Name</th><th>Phone</th><th>Intake</th><th>Payment</th><th>Attendance</th><th>CAT 1</th><th>CAT 2</th><th>Final</th><th>Files</th><th>Completion</th><th></th></tr></thead><tbody>" +
        g.students.map(s => (
          "<tr data-student-id=\"" + s.id + "\">" +
            "<td>" + escapeHtml(s.full_name) + "</td>" +
            "<td>" + escapeHtml(s.phone || "-") + "</td>" +
            "<td>" + escapeHtml(s.intake_name || "-") + "</td>" +
            "<td>" + statusBadge(s.has_paid, 0) + "</td>" +
            "<td style=\"min-width:110px;\">" + attendanceBarHtml(s.attended, 10) + "</td>" +
            "<td><input type=\"number\" min=\"0\" max=\"100\" class=\"score-input\" data-type=\"cat1\" value=\"" + (s.scores.cat1 ? s.scores.cat1.score : "") + "\" style=\"width:55px;\"></td>" +
            "<td><input type=\"number\" min=\"0\" max=\"100\" class=\"score-input\" data-type=\"cat2\" value=\"" + (s.scores.cat2 ? s.scores.cat2.score : "") + "\" style=\"width:55px;\"></td>" +
            "<td><input type=\"number\" min=\"0\" max=\"100\" class=\"score-input\" data-type=\"final\" value=\"" + (s.scores.final ? s.scores.final.score : "") + "\" style=\"width:55px;\"></td>" +
            "<td class=\"cat-files-cell\" data-student-id=\"" + s.id + "\">—</td>" +
            "<td>" + completeCellHtml(g.course_id, s.id, s.completed) + "</td>" +
            "<td><button class=\"btn btn-ghost save-scores-btn\" style=\"padding:5px 10px;font-size:12px;\">Save</button></td>" +
          "</tr>"
        )).join("") +
        "</tbody></table>") +
    "</div>"
  );
}

function wireTrainerGroupEvents(container) {
  container.querySelectorAll(".add-link-form").forEach(form => form.addEventListener("submit", handleAddClassLink));
  container.querySelectorAll(".record-class-btn").forEach(btn => btn.addEventListener("click", handleRecordClass));
  container.querySelectorAll(".notes-upload-form").forEach(form => form.addEventListener("submit", handleNotesUpload));
  container.querySelectorAll(".save-scores-btn").forEach(btn => btn.addEventListener("click", handleSaveScores));
}

async function handleAddClassLink(e) {
  e.preventDefault();
  const form = e.target, courseId = Number(form.dataset.courseId), title = form.querySelector(".link-title-input").value.trim(), url = form.querySelector(".link-url-input").value.trim(), btn = form.querySelector("button");
  btn.disabled = true; btn.textContent = "Adding...";
  try {
    const res = await fetch(API_BASE + "/api/trainer/class-links", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ course_id: courseId, title, url }) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not add the link."); btn.disabled = false; btn.textContent = "Add link"; return; }
    loadTrainerStudents();
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Add link"; }
}

async function handleRecordClass(e) {
  const btn = e.target, courseId = Number(btn.dataset.courseId);
  const group = btn.closest(".trainer-group");
  const checklist = group.querySelector(".attendance-checklist");
  btn.disabled = true; btn.textContent = "Creating...";
  try {
    const res = await fetch(API_BASE + "/api/trainer/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ course_id: courseId }) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not create the class session."); btn.disabled = false; btn.textContent = "Record today's class"; return; }

    const rows = group.querySelectorAll("tbody tr[data-student-id]");
    const students = Array.from(rows).map(r => ({ id: Number(r.dataset.studentId), name: r.children[0].textContent }));

    checklist.style.display = "block";
    checklist.innerHTML =
      "<div class=\"section-subhead\">Mark attendance — Class " + data.session.session_number + " of 10</div>" +
      (students.length === 0 ? "<div class=\"empty-state\">No students enrolled to mark.</div>" :
        "<div class=\"attendance-mark-list\">" +
          students.map(s => "<label class=\"attendance-mark-item\"><input type=\"checkbox\" class=\"present-checkbox\" data-student-id=\"" + s.id + "\"> " + escapeHtml(s.name) + "</label>").join("") +
        "</div><button class=\"btn btn-primary save-attendance-btn\" style=\"padding:8px 14px;font-size:13px;margin-top:10px;\">Save attendance</button>");

    const saveBtn = checklist.querySelector(".save-attendance-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        saveBtn.disabled = true; saveBtn.textContent = "Saving...";
        const records = Array.from(checklist.querySelectorAll(".present-checkbox")).map(cb => ({ student_id: Number(cb.dataset.studentId), present: cb.checked }));
        try {
          const res2 = await fetch(API_BASE + "/api/trainer/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ session_id: data.session.id, records }) });
          if (!res2.ok) throw new Error("Save failed");
          loadTrainerStudents();
        } catch (err) { saveBtn.textContent = "Error — try again"; saveBtn.disabled = false; }
      });
    }

    btn.textContent = "Record today's class"; btn.disabled = false;
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Record today's class"; }
}

async function handleSaveScores(e) {
  const btn = e.target, row = btn.closest("tr"), studentId = Number(row.dataset.studentId);
  const courseId = Number(btn.closest(".trainer-group").dataset.courseId);
  const inputs = row.querySelectorAll(".score-input");
  btn.disabled = true; btn.textContent = "...";
  try {
    for (const input of inputs) {
      if (input.value === "") continue;
      const res = await fetch(API_BASE + "/api/trainer/scores", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ course_id: courseId, student_id: studentId, assessment_type: input.dataset.type, score: Number(input.value) }) });
      if (!res.ok) throw new Error("Save failed");
    }
    btn.textContent = "Saved";
    setTimeout(() => { btn.textContent = "Save"; btn.disabled = false; }, 1000);
  } catch (err) { btn.textContent = "Error"; btn.disabled = false; }
}

async function handleNotesUpload(e) {
  e.preventDefault();
  const form = e.target, courseId = form.dataset.courseId, titleInput = form.querySelector(".note-title-input"), fileInput = form.querySelector(".note-file-input"), btn = form.querySelector("button");
  if (!fileInput.files[0]) return;
  const formData = new FormData();
  formData.append("course_id", courseId); formData.append("title", titleInput.value.trim()); formData.append("file", fileInput.files[0]);
  btn.disabled = true; btn.textContent = "Uploading...";
  try {
    const res = await fetch(API_BASE + "/api/trainer/notes", { method: "POST", credentials: "include", body: formData });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not upload note."); btn.disabled = false; btn.textContent = "Upload note"; return; }
    loadTrainerStudents();
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Upload note"; }
}

async function loadTrainerInbox() {
  const container = document.getElementById("trainer-inbox-list");
  const countEl = document.getElementById("trainer-inbox-count");
  if (!container) return;
  try {
    const res = await fetch(API_BASE + "/api/messages/inbox", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const msgs = await res.json();
    const unread = msgs.filter(m => !m.is_read).length;
    if (countEl) countEl.textContent = unread + " unread";
    if (msgs.length === 0) { container.innerHTML = "<div class=\"empty-state\">No messages from admin yet.</div>"; return; }
    container.innerHTML = msgs.map(messageItemHtml).join("");
    wireMessageOpenEvents(container, () => {
      if (countEl) countEl.textContent = container.querySelectorAll(".message-item.is-unread").length + " unread";
    });
  } catch (err) { container.innerHTML = "<div class=\"empty-state\">Could not load messages right now.</div>"; }
}

async function loadTrainerSentMessages() {
  const container = document.getElementById("trainer-sent-list");
  if (!container) return;
  try {
    const res = await fetch(API_BASE + "/api/messages/sent", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const rows = await res.json();
    container.innerHTML = rows.length === 0 ? "<div class=\"empty-state\">No messages sent yet.</div>" :
      "<div class=\"section-subhead\">Recently sent</div>" + rows.map(sentMessageItemHtml).join("");
  } catch (err) { container.innerHTML = ""; }
}

async function handleSendTrainerMessage(e) {
  e.preventDefault();
  const form = e.target;
  const select = form.querySelector(".msg-recipient-select");
  const subject = form.querySelector(".msg-subject-input").value.trim();
  const body = form.querySelector(".msg-body-input").value.trim();
  const btn = form.querySelector("button");
  const [kind, id] = select.value.split(":");
  if (!kind || !id || !subject || !body) return;
  btn.disabled = true; btn.textContent = "Sending...";
  try {
    const payload = kind === "course"
      ? { recipient_type: "course", course_id: Number(id), subject, body }
      : { recipient_type: "student", recipient_id: Number(id), subject, body };
    const res = await fetch(API_BASE + "/api/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not send message."); btn.disabled = false; btn.textContent = "Send message"; return; }
    form.reset();
    btn.disabled = false; btn.textContent = "Send message";
    loadTrainerSentMessages();
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Send message"; }
}

/* ---------- Admin ---------- */
function setupAdminTabs() {
  const tabs = document.querySelectorAll(".admin-tab");
  if (tabs.length === 0) return;
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".admin-tab-panel").forEach(panel => {
        panel.style.display = panel.dataset.tabPanel === tab.dataset.tab ? "block" : "none";
      });
    });
  });
}

let currentUsersRole = "student";

async function loadAdminUsers() {
  const container = document.getElementById("admin-users-table");
  if (!container) return;
  try {
    const res = await fetch(API_BASE + "/api/admin/users", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const allRows = await res.json();
    const studentCountEl = document.getElementById("role-count-student");
    const trainerCountEl = document.getElementById("role-count-trainer");
    const studentTotal = allRows.filter(u => u.role === "student").length;
    const trainerTotal = allRows.filter(u => u.role === "trainer").length;
    if (studentCountEl) studentCountEl.textContent = studentTotal + " enrolled";
    if (trainerCountEl) trainerCountEl.textContent = trainerTotal + " assigned";
    const rows = allRows.filter(u => u.role === currentUsersRole);
    if (rows.length === 0) { container.innerHTML = "<div class=\"empty-state\">No " + currentUsersRole + " accounts yet.</div>"; return; }
    container.innerHTML =
      "<table class=\"simple-table\"><thead><tr><th>Name</th><th>Role</th><th>Contact</th><th>Enrolled / Assigned</th><th>Status</th><th></th></tr></thead><tbody>" +
      rows.map(u => {
        const count = u.role === "trainer" ? u.trainer_count + " course" + (u.trainer_count === 1 ? "" : "s") + " assigned" : u.student_count + " course" + (u.student_count === 1 ? "" : "s") + " enrolled";
        const statusHtml = u.is_active ? "<span class=\"status-badge paid\">Active</span>" : "<span class=\"status-badge unpaid\">Deactivated</span>";
        const actionLabel = u.is_active ? "Deactivate" : "Reactivate";
        const actionClass = u.is_active ? "btn-ghost deactivate-user-btn" : "btn-primary reactivate-user-btn";
        return (
          "<tr><td>" + escapeHtml(u.full_name) + "</td><td><span class=\"role-pill " + escapeHtml(u.role) + "\">" + escapeHtml(u.role) + "</span></td><td>" + escapeHtml(u.phone || "-") + "</td><td>" + count + "</td><td>" + statusHtml + "</td>" +
          "<td style=\"display:flex;gap:6px;\">" +
            "<button class=\"btn " + actionClass + "\" data-user-id=\"" + u.id + "\" data-next=\"" + (u.is_active ? "0" : "1") + "\" style=\"padding:6px 12px;font-size:12.5px;\">" + actionLabel + "</button>" +
            "<button class=\"btn btn-ghost delete-user-btn\" data-user-id=\"" + u.id + "\" data-user-name=\"" + escapeHtml(u.full_name) + "\" data-user-role=\"" + escapeHtml(u.role) + "\" style=\"padding:6px 12px;font-size:12.5px;color:#A3342F;\">Delete</button>" +
          "</td></tr>"
        );
      }).join("") + "</tbody></table>";
    container.querySelectorAll(".deactivate-user-btn, .reactivate-user-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const confirmMsg = btn.dataset.next === "0" ? "Deactivate this account? They will no longer be able to log in." : "Reactivate this account?";
        if (!confirm(confirmMsg)) return;
        btn.disabled = true; btn.textContent = "Saving...";
        try {
          const res = await fetch(API_BASE + "/api/admin/users/" + btn.dataset.userId + "/status", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ is_active: btn.dataset.next === "1" }) });
          const data = await res.json();
          if (!res.ok) { alert(data.error || "Could not update this account."); btn.disabled = false; btn.textContent = btn.dataset.next === "0" ? "Deactivate" : "Reactivate"; return; }
          loadAdminUsers();
      setupAdminTabs();
      const addCourseForm = document.getElementById("admin-add-course-form");
      if (addCourseForm) addCourseForm.addEventListener("submit", handleAddCourse);
        } catch (err) { alert("Could not reach the server."); btn.disabled = false; }
      });
    });
    container.querySelectorAll(".delete-user-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const name = btn.dataset.userName, role = btn.dataset.userRole;
        if (!confirm("Permanently delete " + name + "'s " + role + " account? This removes their enrollments, scores, attendance and messages. This cannot be undone.")) return;
        btn.disabled = true; btn.textContent = "Deleting...";
        try {
          const res = await fetch(API_BASE + "/api/admin/users/" + btn.dataset.userId, { method: "DELETE", credentials: "include" });
          const data = await res.json();
          if (!res.ok) { alert(data.error || "Could not delete this account."); btn.disabled = false; btn.textContent = "Delete"; return; }
          loadAdminUsers();
          loadAdminOverview();
          loadAdminEarnings();
        } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Delete"; }
      });
    });
  } catch (err) { container.innerHTML = "<div class=\"empty-state\">Could not load users right now.</div>"; }
}

function setupUserRoleToggle() {
  const toggleWrap = document.getElementById("user-role-toggle");
  const toggleBtns = document.querySelectorAll(".role-toggle-btn");
  if (toggleBtns.length === 0) return;
  toggleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.role === currentUsersRole) return;
      toggleBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentUsersRole = btn.dataset.role;
      if (toggleWrap) toggleWrap.classList.toggle("role-trainer", currentUsersRole === "trainer");
      loadAdminUsers();
    });
  });
}

async function loadAdminEarnings() {
  const container = document.getElementById("admin-earnings");
  if (!container) return;
  try {
    const res = await fetch(API_BASE + "/api/admin/earnings?month=" + encodeURIComponent(window.adminEarningsMonth || currentMonthKey()), { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const d = await res.json();
    container.innerHTML = adminMonthPickerHtml() +
      "<div class=\"earnings-cards\">" +
        earningsCard("Total collected", formatKes(d.total_collected), "") +
        earningsCard("Owed to trainers (" + d.trainer_share_pct + "%)", formatKes(d.total_owed_to_trainers), "is-highlight") +
        earningsCard("Company revenue (" + d.company_share_pct + "%)", formatKes(d.total_company_share), "") +
        earningsCard("Tax (" + d.tax_share_pct + "%)", formatKes(d.total_tax), "") +
      "</div>" +
      (d.trainers.length === 0 ? "<div class=\"empty-state\">No payments collected for this period.</div>" :
        "<table class=\"simple-table\"><thead><tr><th>Trainer</th><th>Paid students</th><th>Total collected</th><th>You owe them</th><th>Company share</th><th>Tax</th></tr></thead><tbody>" +
        d.trainers.map(t => (
          "<tr><td>" + escapeHtml(t.trainer_name) + "</td><td>" + t.paid_students + "</td><td>" + formatKes(t.total_collected) + "</td><td>" + formatKes(t.owed_to_trainer) + "</td><td>" + formatKes(t.company_share) + "</td><td>" + formatKes(t.tax_share) + "</td></tr>"
        )).join("") + "</tbody></table>");
  } catch (err) { container.innerHTML = "<div class=\"empty-state\">Could not load earnings right now.</div>"; }
}

async function loadPendingPayments() {
  const container = document.getElementById("admin-pending-payments");
  const countEl = document.getElementById("admin-pending-count");
  if (!container) return;
  try {
    const res = await fetch(API_BASE + "/api/admin/pending-payments", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const rows = await res.json();
    if (countEl) countEl.textContent = rows.length + " pending";
    if (rows.length === 0) { container.innerHTML = "<div class=\"empty-state\">No payments waiting for confirmation.</div>"; return; }
    container.innerHTML =
      "<table class=\"simple-table\"><thead><tr><th>Student</th><th>Phone</th><th>Course</th><th>Code</th><th></th></tr></thead><tbody>" +
      rows.map(r => (
        "<tr><td>" + escapeHtml(r.full_name) + "</td><td>" + escapeHtml(r.phone || "-") + "</td><td>" + escapeHtml(r.course_title) + "</td><td>" + escapeHtml(r.payment_code) + "</td>" +
        "<td><button class=\"btn btn-primary mark-paid-btn\" data-enrollment-id=\"" + r.enrollment_id + "\" style=\"padding:6px 12px;font-size:12.5px;\">Mark paid</button></td></tr>"
      )).join("") + "</tbody></table>";
    container.querySelectorAll(".mark-paid-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true; btn.textContent = "Saving...";
        try {
          const res = await fetch(API_BASE + "/api/admin/mark-paid", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ enrollment_id: Number(btn.dataset.enrollmentId) }) });
          if (!res.ok) throw new Error("Save failed");
          loadPendingPayments(); loadAdminOverview(); loadAdminEarnings();
        } catch (err) { btn.textContent = "Error"; btn.disabled = false; }
      });
    });
  } catch (err) { container.innerHTML = "<div class=\"empty-state\">Could not load pending payments right now.</div>"; }
}

async function loadAdminOverview() {
  const container = document.getElementById("admin-trainer-groups");
  const countEl = document.getElementById("admin-trainer-count");
  if (!container) return;
  loadAdminCatSubmissions();
  try {
    const res = await fetch(API_BASE + "/api/admin/overview", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const trainers = await res.json();
    if (countEl) countEl.textContent = trainers.length + " trainer" + (trainers.length === 1 ? "" : "s");
    if (trainers.length === 0) {
      container.innerHTML = "<div class=\"empty-state\">No trainers have registered yet.</div>";
    } else {
      container.innerHTML = trainers.map(t => {
        const totalStudents = t.courses.reduce((sum, c) => sum + c.students.length, 0);
        return (
          "<div class=\"trainer-group\">" +
            "<div class=\"trainer-group-head\">" + escapeHtml(t.full_name) + " <span class=\"stat-trend\">" + totalStudents + " student" + (totalStudents === 1 ? "" : "s") + "</span></div>" +
            "<div class=\"cli-sub\" style=\"margin-bottom:10px;\">" + escapeHtml(t.phone || "No phone on file") + "</div>" +
            (t.courses.length === 0 ? "<div class=\"empty-state\">No courses assigned yet.</div>" :
              t.courses.map(c => (
                "<div style=\"margin-bottom:18px;\">" +
                  "<div class=\"cli-title\" style=\"margin-bottom:6px;\">" + escapeHtml(c.course_title) + "</div>" +
                  "<div class=\"section-subhead\">Class links</div>" + classLinksHtml(c.class_links) +
                  (c.students.length === 0 ? "<div class=\"empty-state\">No students enrolled yet.</div>" :
                    "<table class=\"simple-table\"><thead><tr><th>Name</th><th>Phone</th><th>Payment</th><th>Attendance</th><th>CAT 1</th><th>CAT 2</th><th>Final</th></tr></thead><tbody>" +
                    c.students.map(s => (
                      "<tr><td>" + escapeHtml(s.full_name) + "</td><td>" + escapeHtml(s.phone || "-") + "</td><td>" + statusBadge(s.has_paid, 0) + "</td>" +
                      "<td style=\"min-width:110px;\">" + attendanceBarHtml(s.attended, 10) + "</td>" +
                      "<td>" + (s.scores.cat1 ? s.scores.cat1.score : "—") + "</td>" +
                      "<td>" + (s.scores.cat2 ? s.scores.cat2.score : "—") + "</td>" +
                      "<td>" + (s.scores.final ? s.scores.final.score : "—") + "</td></tr>"
                    )).join("") + "</tbody></table>") +
                "</div>"
              )).join("")) +
          "</div>"
        );
      }).join("");
    }
    loadAssignTable();
  } catch (err) { container.innerHTML = "<div class=\"empty-state\">Could not load trainer overview right now.</div>"; }
}

async function handleAddCourse(e) {
  e.preventDefault();
  const form = e.target;
  const title = form.querySelector(".course-title-input").value.trim();
  const level = form.querySelector(".course-level-select").value;
  const fee = form.querySelector(".course-fee-input").value;
  const duration = form.querySelector(".course-duration-input").value;
  const description = form.querySelector(".course-description-input").value.trim();
  const btn = form.querySelector("button");
  if (!title || !level) return;
  btn.disabled = true; btn.textContent = "Adding...";
  try {
    const res = await fetch(API_BASE + "/api/admin/courses/create", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ title, level, fee_kes: fee, duration_value: duration, duration_unit: ((form.querySelector(".course-duration-unit") || {}).value || "weeks"), description }) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not add the course."); btn.disabled = false; btn.textContent = "Add course"; return; }
    form.reset();
    form.querySelector(".course-duration-input").value = 4;
    btn.disabled = false; btn.textContent = "Add course";
    loadAssignTable(); loadAdminOverview();
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Add course"; }
}

async function loadAssignTable() {
  const container = document.getElementById("admin-assign-table");
  if (!container) return;
  try {
    const [coursesRes, trainersRes] = await Promise.all([fetch(API_BASE + "/api/admin/courses", { credentials: "include" }), fetch(API_BASE + "/api/admin/trainers", { credentials: "include" })]);
    const courses = await coursesRes.json(); const trainers = await trainersRes.json();
    container.innerHTML =
      "<table class=\"simple-table\"><thead><tr><th>Course</th><th>Level</th><th>Fee (KES)</th><th>Trainer</th><th></th></tr></thead><tbody>" +
      courses.map(c => (
        "<tr data-course-row=\"" + c.id + "\"><td>" + escapeHtml(c.title) + "</td>" +
        "<td>" + escapeHtml(c.level) + "</td>" +
        "<td><input type=\"number\" class=\"fee-edit-input\" min=\"0\" placeholder=\"Free\" value=\"" + (c.fee_kes === null ? "" : c.fee_kes) + "\" style=\"width:90px;\"></td>" +
        "<td><select class=\"assign-select\" data-course-id=\"" + c.id + "\"><option value=\"\">Unassigned</option>" +
        trainers.map(t => "<option value=\"" + t.id + "\"" + (t.id === c.trainer_id ? " selected" : "") + ">" + escapeHtml(t.full_name) + "</option>").join("") +
        "</select></td>" +
        "<td style=\"display:flex;gap:6px;\">" +
          "<button class=\"btn btn-ghost assign-save\" data-course-id=\"" + c.id + "\" style=\"padding:6px 12px;font-size:12.5px;\">Save</button>" +
          "<button class=\"btn btn-ghost edit-course-btn\" data-course-id=\"" + c.id + "\" style=\"padding:6px 12px;font-size:12.5px;\">Edit</button>" +
          "<button class=\"btn btn-ghost delete-course-btn\" data-course-id=\"" + c.id + "\" data-course-title=\"" + escapeHtml(c.title) + "\" style=\"padding:6px 12px;font-size:12.5px;color:#A3342F;\">Delete</button>" +
        "</td></tr>"
      )).join("") + "</tbody></table>";

    container.querySelectorAll(".assign-save").forEach(btn => {
      btn.addEventListener("click", async () => {
        const courseId = btn.dataset.courseId;
        const row = container.querySelector("tr[data-course-row=\"" + courseId + "\"]");
        const select = row.querySelector(".assign-select");
        const feeInput = row.querySelector(".fee-edit-input");
        const trainerId = select.value || null;
        const feeValue = feeInput.value;
        btn.disabled = true; btn.textContent = "Saving...";
        try {
          const res1 = await fetch(API_BASE + "/api/admin/assign-trainer", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ course_id: Number(courseId), trainer_id: trainerId ? Number(trainerId) : null }) });
          const res2 = await fetch(API_BASE + "/api/admin/courses/" + courseId + "/fee", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ fee_kes: feeValue }) });
          if (!res1.ok || !res2.ok) throw new Error("Save failed");
          btn.textContent = "Saved"; loadAdminOverview(); loadAdminEarnings();
          setTimeout(() => { btn.textContent = "Save"; btn.disabled = false; }, 1000);
        } catch (err) { btn.textContent = "Error"; btn.disabled = false; }
      });
    });

    container.querySelectorAll(".delete-course-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete \"" + btn.dataset.courseTitle + "\"? This removes all enrollments, class links, attendance and notes for this course. This cannot be undone.")) return;
        btn.disabled = true; btn.textContent = "Deleting...";
        try {
          const res = await fetch(API_BASE + "/api/admin/courses/" + btn.dataset.courseId, { method: "DELETE", credentials: "include" });
          const data = await res.json();
          if (!res.ok) { alert(data.error || "Could not delete the course."); btn.disabled = false; btn.textContent = "Delete"; return; }
          loadAssignTable(); loadAdminOverview(); loadAdminEarnings();
        } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Delete"; }
      });
    });
  } catch (err) { container.innerHTML = "<div class=\"empty-state\">Could not load course management right now.</div>"; }
}

async function loadAdminComposeOptions() {
  const select = document.querySelector("#admin-compose-form .msg-recipient-select");
  if (!select) return;
  try {
    const res = await fetch(API_BASE + "/api/admin/trainers", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const trainers = await res.json();
    let html = "<option value=\"\">Select a trainer...</option><option value=\"all_trainers:all\">All trainers</option>";
    trainers.forEach(t => { html += "<option value=\"trainer:" + t.id + "\">" + escapeHtml(t.full_name) + "</option>"; });
    select.innerHTML = html;
  } catch (err) { /* keep default option */ }
}

async function loadAdminSentMessages() {
  const container = document.getElementById("admin-sent-list");
  if (!container) return;
  try {
    const res = await fetch(API_BASE + "/api/messages/sent", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const rows = await res.json();
    container.innerHTML = rows.length === 0 ? "<div class=\"empty-state\">No messages sent yet.</div>" :
      "<div class=\"section-subhead\">Recently sent</div>" + rows.map(sentMessageItemHtml).join("");
  } catch (err) { container.innerHTML = ""; }
}

async function handleSendAdminMessage(e) {
  e.preventDefault();
  const form = e.target;
  const select = form.querySelector(".msg-recipient-select");
  const subject = form.querySelector(".msg-subject-input").value.trim();
  const body = form.querySelector(".msg-body-input").value.trim();
  const btn = form.querySelector("button");
  const [kind, id] = select.value.split(":");
  if (!kind || !subject || !body) return;
  btn.disabled = true; btn.textContent = "Sending...";
  try {
    const payload = kind === "all_trainers"
      ? { recipient_type: "all_trainers", subject, body }
      : { recipient_type: "trainer", recipient_id: Number(id), subject, body };
    const res = await fetch(API_BASE + "/api/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not send message."); btn.disabled = false; btn.textContent = "Send message"; return; }
    form.reset();
    btn.disabled = false; btn.textContent = "Send message";
    loadAdminSentMessages();
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Send message"; }
}

















let certStudents = [];
let certCourses = [];
let certSelectedStudentId = null;

async function loadCertStudents() {
  const select = document.getElementById("cert-student-select");
  if (!select) return;
  try {
    const res = await fetch(API_BASE + "/api/admin/users", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const rows = await res.json();
    certStudents = rows.filter(u => u.role === "student" && u.is_active);
    select.innerHTML = "<option value=\"\">Select a student...</option>" +
      certStudents.map(s => "<option value=\"" + s.id + "\">" + escapeHtml(s.full_name) + "</option>").join("");
  } catch (err) {
    select.innerHTML = "<option value=\"\">Could not load students</option>";
  }
}

async function loadCertCourses(studentId) {
  const list = document.getElementById("cert-courses-list");
  if (!list) return;
  list.innerHTML = "<div class=\"empty-state\">Loading courses...</div>";
  try {
    const res = await fetch(API_BASE + "/api/admin/certificates/" + studentId + "/courses", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    certCourses = await res.json();
    if (certCourses.length === 0) { list.innerHTML = "<div class=\"empty-state\">This student is not enrolled in any courses.</div>"; updateCertGenerateButton(); return; }
    list.innerHTML = certCourses.map(c =>
      "<label class=\"cert-course-item\"><input type=\"checkbox\" class=\"cert-course-checkbox\" data-course-id=\"" + c.course_id + "\"" + (c.completed ? " checked" : "") + "> " + escapeHtml(c.title) + "</label>"
    ).join("");
    list.querySelectorAll(".cert-course-checkbox").forEach(cb => {
      cb.addEventListener("change", async () => {
        const courseId = Number(cb.dataset.courseId);
        try {
          await fetch(API_BASE + "/api/admin/certificates/toggle-complete", {
            method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
            body: JSON.stringify({ user_id: certSelectedStudentId, course_id: courseId, completed: cb.checked })
          });
          const c = certCourses.find(x => x.course_id === courseId);
          if (c) c.completed = cb.checked;
        } catch (err) { cb.checked = !cb.checked; }
        updateCertGenerateButton();
      });
    });
    updateCertGenerateButton();
  } catch (err) {
    list.innerHTML = "<div class=\"empty-state\">Could not load courses right now.</div>";
  }
}

function updateCertGenerateButton() {
  const genBtn = document.getElementById("cert-generate-btn");
  if (!genBtn) return;
  genBtn.disabled = !certCourses.some(c => c.completed);
}

function ordinalSuffix(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

async function generateCertificate() {
  const student = certStudents.find(s => s.id === certSelectedStudentId);
  if (!student) return;
  const completedTitles = certCourses.filter(c => c.completed).map(c => c.title);
  if (completedTitles.length === 0) return;

  const now = new Date();
  const nameEl = document.getElementById("cert-name");
  const dateEl = document.getElementById("cert-date");
  const coursesEl = document.getElementById("cert-courses-text");
  if (nameEl) nameEl.textContent = student.full_name;
  if (dateEl) dateEl.textContent = "AWARDED ON THIS " + ordinalSuffix(now.getDate()) + " DAY OF " + now.toLocaleString("en-US", { month: "long" }).toUpperCase() + " " + now.getFullYear();
  if (coursesEl) coursesEl.textContent = completedTitles.join("   |   "); if (typeof fitCertText === "function") fitCertText();

  const genBtn = document.getElementById("cert-generate-btn");
  if (genBtn) { genBtn.disabled = true; genBtn.textContent = "Generating..."; }
  try {
    const canvas = await html2canvas(document.getElementById("cert-template"), { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(student.full_name.replace(/\s+/g, "_") + "_Certificate.pdf");
  } catch (err) {
    alert("Could not generate the certificate PDF.");
  } finally {
    if (genBtn) { genBtn.textContent = "Generate Certificate"; updateCertGenerateButton(); }
  }
}

function setupCertTab() {
  const select = document.getElementById("cert-student-select");
  const genBtn = document.getElementById("cert-generate-btn");
  if (select) {
    select.addEventListener("change", () => {
      certSelectedStudentId = select.value ? Number(select.value) : null;
      const list = document.getElementById("cert-courses-list");
      if (!certSelectedStudentId) { if (list) list.innerHTML = ""; certCourses = []; updateCertGenerateButton(); return; }
      loadCertCourses(certSelectedStudentId);
    });
  }
  if (genBtn) genBtn.addEventListener("click", generateCertificate);
  loadCertStudents();
}

/* ---------- CAT submissions ---------- */
function catUploadHtml(c) {
  if (!c.unlocked) return "";
  const types = [["cat1", "CAT 1"], ["cat2", "CAT 2"], ["final", "Final Exam"]];
  return (
    "<div class=\"cat-upload-block\" data-course-id=\"" + c.id + "\">" +
      types.map(function(t) {
        return (
          "<div class=\"cat-type-row\" style=\"display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;\">" +
            "<span style=\"min-width:90px;font-size:13px;font-weight:600;\">" + t[1] + "</span>" +
            "<span class=\"cat-status\" data-course-id=\"" + c.id + "\" data-type=\"" + t[0] + "\" style=\"font-size:12px;color:var(--muted);\">Loading...</span>" +
            "<form class=\"cat-upload-form\" data-course-id=\"" + c.id + "\" data-type=\"" + t[0] + "\" style=\"display:flex;gap:6px;align-items:center;\">" +
              "<input type=\"file\" class=\"cat-file-input\" accept=\"application/pdf\" required style=\"font-size:12px;max-width:170px;\">" +
              "<button type=\"submit\" class=\"btn btn-ghost\" style=\"padding:4px 10px;font-size:12px;\">Upload</button>" +
            "</form>" +
          "</div>"
        );
      }).join("") +
    "</div>"
  );
}

async function handleCatUpload(e) {
  e.preventDefault();
  const form = e.target, courseId = form.dataset.courseId, type = form.dataset.type;
  const fileInput = form.querySelector(".cat-file-input"), btn = form.querySelector("button");
  if (!fileInput.files[0]) return;
  const formData = new FormData();
  formData.append("course_id", courseId);
  formData.append("assessment_type", type);
  formData.append("pdf", fileInput.files[0]);
  btn.disabled = true; btn.textContent = "Uploading...";
  try {
    const res = await fetch(API_BASE + "/api/student/cats/upload", { method: "POST", credentials: "include", body: formData });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not upload the file."); btn.disabled = false; btn.textContent = "Upload"; return; }
    btn.textContent = "Uploaded";
    loadStudentCatStatus();
    setTimeout(function() { btn.disabled = false; btn.textContent = "Upload"; }, 1500);
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Upload"; }
}

async function loadStudentCatStatus() {
  try {
    const res = await fetch(API_BASE + "/api/student/cats", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    const subMap = {};
    (data.submissions || []).forEach(function(s) { subMap[s.course_id + "-" + s.assessment_type] = s; });
    const scoreMap = {};
    (data.scores || []).forEach(function(s) { scoreMap[s.course_id + "-" + s.assessment_type] = s; });
    document.querySelectorAll(".cat-status").forEach(function(el) {
      const key = el.dataset.courseId + "-" + el.dataset.type;
      const sub = subMap[key], score = scoreMap[key];
      if (!sub) { el.textContent = "Not submitted"; return; }
      el.innerHTML = "<a href=\"" + sub.pdf_url + "\" target=\"_blank\" rel=\"noopener\">View PDF</a> . " + (score ? score.score + "/" + score.max_score : "Awaiting grading");
    });
  } catch (err) {}
}

async function loadTrainerCatFiles(groups) {
  for (const g of groups) {
    try {
      const res = await fetch(API_BASE + "/api/trainer/cats?course_id=" + g.course_id, { credentials: "include" });
      if (!res.ok) continue;
      const rows = await res.json();
      const byStudent = {};
      rows.forEach(function(r) { if (!byStudent[r.student_id]) byStudent[r.student_id] = []; byStudent[r.student_id].push(r); });
      const groupEl = document.querySelector(".trainer-group[data-course-id=\"" + g.course_id + "\"]");
      if (!groupEl) continue;
      Object.keys(byStudent).forEach(function(studentId) {
        const cell = groupEl.querySelector(".cat-files-cell[data-student-id=\"" + studentId + "\"]");
        if (!cell) return;
        cell.innerHTML = byStudent[studentId].map(function(r) {
          return "<a href=\"" + r.pdf_url + "\" target=\"_blank\" rel=\"noopener\" title=\"" + r.assessment_type + "\" style=\"margin-right:6px;\">" + r.assessment_type.toUpperCase() + "</a>";
        }).join("");
      });
    } catch (err) {}
  }
}

async function loadAdminCatSubmissions() {
  const container = document.getElementById("admin-cat-submissions");
  if (!container) return;
  try {
    const res = await fetch(API_BASE + "/api/admin/cats", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const rows = await res.json();
    if (rows.length === 0) { container.innerHTML = "<div class=\"empty-state\">No CAT submissions yet.</div>"; return; }
    container.innerHTML =
      "<table class=\"simple-table\"><thead><tr><th>Course</th><th>Student</th><th>Trainer</th><th>Type</th><th>File</th><th>Score</th></tr></thead><tbody>" +
      rows.map(function(r) {
        return (
          "<tr><td>" + escapeHtml(r.course_title) + "</td><td>" + escapeHtml(r.student_name) + "</td><td>" + escapeHtml(r.trainer_name || "-") + "</td><td>" + r.assessment_type.toUpperCase() + "</td>" +
          "<td><a href=\"" + r.pdf_url + "\" target=\"_blank\" rel=\"noopener\">View PDF</a></td>" +
          "<td>" + (r.score !== null && r.score !== undefined ? r.score + "/" + r.max_score : "Not graded") + "</td></tr>"
        );
      }).join("") +
      "</tbody></table>";
  } catch (err) { container.innerHTML = "<div class=\"empty-state\">Could not load CAT submissions right now.</div>"; }
}

/* ---------- Admin: Intakes ---------- */
(function () {
  function esc(v) {
    v = v == null ? "" : String(v);
    if (typeof escapeHtml === "function") return escapeHtml(v);
    return v.replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; });
  }
  function day(d) { return d ? String(d).slice(0, 10) : "-"; }

  async function call(method, path, body) {
    const opts = { method: method, credentials: "include", headers: {} };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    const res = await fetch(API_BASE + path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || "Request failed");
    return data;
  }

  function showMsg(text, isError) {
    const el = document.getElementById("intake-msg");
    if (!el) return;
    el.textContent = text || "";
    el.style.color = isError ? "#c0392b" : "#1e8449";
  }

  async function loadIntakes() {
    const listEl = document.getElementById("intake-list");
    const assignEl = document.getElementById("intake-assign-area");
    if (!listEl || !assignEl) return;
    try {
      const results = await Promise.all([
        call("GET", "/api/admin/intakes"),
        call("GET", "/api/admin/intakes/enrollments")
      ]);
      const intakes = results[0] || [];
      const enrollments = results[1] || [];

      listEl.innerHTML = intakes.length === 0
        ? "<div class=\"empty-state\">No intakes yet. Create one above.</div>"
        : "<table class=\"simple-table\"><thead><tr><th>Intake</th><th>Start date</th><th>Students</th><th></th></tr></thead><tbody>" +
          intakes.map(function (i) {
            return "<tr><td>" + esc(i.name) + "</td><td>" + esc(day(i.start_date)) + "</td><td>" + esc(i.student_count) + "</td>" +
              "<td><button type=\"button\" class=\"btn btn-ghost\" data-intake-del=\"" + esc(i.id) + "\" style=\"padding:5px 10px;font-size:12px;\">Delete</button></td></tr>";
          }).join("") + "</tbody></table>";

      const options = "<option value=\"\">No intake (clear)</option>" +
        intakes.map(function (i) { return "<option value=\"" + esc(i.id) + "\">" + esc(i.name) + "</option>"; }).join("");

      assignEl.innerHTML = enrollments.length === 0
        ? "<div class=\"empty-state\">No enrolled students yet.</div>"
        : "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;\">" +
            "<select id=\"intake-target\">" + options + "</select>" +
            "<button type=\"button\" class=\"btn btn-ghost\" id=\"intake-assign-btn\" style=\"padding:8px 14px;font-size:13px;\">Assign selected</button>" +
          "</div>" +
          "<table class=\"simple-table\"><thead><tr><th><input type=\"checkbox\" id=\"intake-check-all\"></th><th>Student</th><th>Phone</th><th>Course</th><th>Intake</th></tr></thead><tbody>" +
          enrollments.map(function (e) {
            return "<tr><td><input type=\"checkbox\" class=\"intake-check\" data-enrollment-id=\"" + esc(e.enrollment_id) + "\"></td>" +
              "<td>" + esc(e.full_name) + "</td><td>" + esc(e.phone || "-") + "</td><td>" + esc(e.course_title) + "</td><td>" + esc(e.intake_name || "-") + "</td></tr>";
          }).join("") + "</tbody></table>";
    } catch (err) {
      showMsg("Could not load intakes: " + err.message, true);
    }
  }

  document.addEventListener("click", async function (ev) {
    const tab = ev.target.closest(".admin-tab");
    if (tab && tab.dataset.tab === "intakes") { loadIntakes(); return; }

    const del = ev.target.closest("[data-intake-del]");
    if (del) {
      if (!confirm("Delete this intake?")) return;
      try {
        await call("DELETE", "/api/admin/intakes/" + del.getAttribute("data-intake-del"));
        showMsg("Intake deleted.", false);
      } catch (err) { showMsg(err.message, true); }
      loadIntakes();
      return;
    }

    if (ev.target.id === "intake-assign-btn") {
      const ids = Array.prototype.map.call(
        document.querySelectorAll(".intake-check:checked"),
        function (c) { return Number(c.getAttribute("data-enrollment-id")); }
      );
      const target = document.getElementById("intake-target").value;
      try {
        const out = await call("POST", "/api/admin/intakes/assign", { enrollment_ids: ids, intake_id: target ? Number(target) : null });
        showMsg("Updated " + out.updated + " student(s).", false);
      } catch (err) { showMsg(err.message, true); }
      loadIntakes();
    }
  });

  document.addEventListener("change", function (ev) {
    if (ev.target.id === "intake-check-all") {
      document.querySelectorAll(".intake-check").forEach(function (c) { c.checked = ev.target.checked; });
    }
  });

  document.addEventListener("submit", async function (ev) {
    if (ev.target.id !== "intake-create-form") return;
    ev.preventDefault();
    const nameEl = document.getElementById("intake-name");
    const startEl = document.getElementById("intake-start");
    try {
      await call("POST", "/api/admin/intakes/create", { name: nameEl.value, start_date: startEl.value });
      nameEl.value = "";
      startEl.value = "";
      showMsg("Intake created.", false);
    } catch (err) { showMsg(err.message, true); }
    loadIntakes();
  });
})();

/* ---------- Admin: sidebar views ---------- */
(function () {
  var VIEWS = ["overview", "finance", "courses", "messages", "users", "students", "certificates", "intakes"];
  var applied = null;

  function panel() { return document.getElementById("admin-panel"); }
  function adminVisible() {
    var p = panel();
    return !!p && window.getComputedStyle(p).display !== "none";
  }
  function currentView() {
    var h = (window.location.hash || "").replace("#", "");
    return VIEWS.indexOf(h) >= 0 ? h : "";
  }
  function setSiblings(view) {
    var p = panel();
    if (!p || !p.parentElement) return;
    Array.prototype.forEach.call(p.parentElement.children, function (c) {
      if (c === p || c.classList.contains("topbar")) return;
      if (view) {
        if (c.dataset.pd === undefined) c.dataset.pd = c.style.display;
        c.style.display = "none";
      } else if (c.dataset.pd !== undefined) {
        c.style.display = c.dataset.pd;
        delete c.dataset.pd;
      }
    });
  }
  function markActive(view) {
    document.querySelectorAll(".sidebar .nav-link").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-admin-view") === view);
    });
  }
  function openTab(view) {
    var tab = document.querySelector('.admin-tab[data-tab="' + view + '"]');
    if (!tab) return false;
    tab.click();
    var target = document.querySelector('.admin-tab-panel[data-tab-panel="' + view + '"]');
    return !!target && target.style.display !== "none";
  }
  function sync() {
    var show = adminVisible();
    document.querySelectorAll(".admin-nav").forEach(function (a) { a.style.display = show ? "" : "none"; });
    var label = document.getElementById("nav-admin-label");
    if (label) label.style.display = show ? "" : "none";
    var tabs = document.getElementById("admin-tabs");
    if (tabs) tabs.style.display = "none";

    var view = show ? currentView() : "";
    setSiblings(view);
    if (view) {
      if (applied !== view && openTab(view)) {
        applied = view;
        markActive(view);
        window.scrollTo(0, 0);
      }
    } else if (applied) {
      openTab("overview");
      applied = null;
    }
  }
  window.addEventListener("hashchange", sync);
  setInterval(sync, 700);
  sync();
})();

/* ---------- Trainer earnings: monthly view ---------- */
function currentMonthKey() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function trainerMonthPickerHtml() {
  var sel = window.trainerEarningsMonth || currentMonthKey();
  var now = new Date();
  var opts = '<option value="all"' + (sel === "all" ? " selected" : "") + '>All time</option>';
  for (var i = 0; i < 12; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    var label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    opts += '<option value="' + key + '"' + (sel === key ? " selected" : "") + '>' + label + '</option>';
  }
  return '<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-bottom:10px;">' +
    '<label for="trainer-earnings-month" style="font-size:13px;">Month</label>' +
    '<select id="trainer-earnings-month">' + opts + '</select></div>';
}
document.addEventListener("change", function (ev) {
  if (ev.target && ev.target.id === "trainer-earnings-month") {
    window.trainerEarningsMonth = ev.target.value;
    loadTrainerEarnings();
  }
});

/* ---------- Admin earnings: monthly view ---------- */
function adminMonthPickerHtml() {
  var sel = window.adminEarningsMonth || currentMonthKey();
  var now = new Date();
  var opts = '<option value="all"' + (sel === "all" ? " selected" : "") + '>All time</option>';
  for (var i = 0; i < 12; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    var label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    opts += '<option value="' + key + '"' + (sel === key ? " selected" : "") + '>' + label + '</option>';
  }
  return '<div style="display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">' +
    '<label for="admin-earnings-month" style="font-size:13px;">Month</label>' +
    '<select id="admin-earnings-month">' + opts + '</select>' +
    '<select id="admin-earnings-range" style="font-size:13px;"><option value="month">Report: selected month</option><option value="3">Last 3 months</option><option value="6">Last 6 months</option><option value="9">Last 9 months</option><option value="12">Last 12 months</option></select><span id="admin-earnings-hint" style="font-size:12px;color:#1e8449;"></span>' +
    '<button type="button" class="btn btn-ghost" id="admin-earnings-pdf" style="padding:6px 12px;font-size:13px;">Download PDF</button>' +
    '<button type="button" class="btn btn-ghost" id="admin-earnings-print" style="padding:6px 12px;font-size:13px;">Print</button></div>';
}
document.addEventListener("change", function (ev) {
  if (ev.target && ev.target.id === "admin-earnings-month") {
    window.adminEarningsMonth = ev.target.value;
    loadAdminEarnings();
  }
});

/* ---------- Admin earnings: print / PDF report ---------- */
(function () {
  function esc(v) {
    v = v == null ? "" : String(v);
    if (typeof escapeHtml === "function") return escapeHtml(v);
    return v.replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; });
  }
  function monthLabel(key) {
    if (key === "all") return "All time";
    var p = key.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  }
  function buildReport(d, key) {
    var label = d.report_label || monthLabel(key);
    var logo = new URL("assets/logo-sidebar.png", window.location.href).href;
    var trainers = d.trainers || [];
    var paidTotal = trainers.reduce(function (s, t) { return s + Number(t.paid_students || 0); }, 0);
    var rows = trainers.map(function (t) {
      return "<tr><td>" + esc(t.trainer_name) + "</td><td class=\"n\">" + esc(t.paid_students) + "</td><td class=\"n\">" +
        formatKes(t.total_collected) + "</td><td class=\"n b\">" + formatKes(t.owed_to_trainer) + "</td><td class=\"n\">" +
        formatKes(t.company_share) + "</td><td class=\"n\">" + formatKes(t.tax_share) + "</td></tr>";
    }).join("");
    var table = trainers.length === 0
      ? "<p class=\"empty\">No payments collected for this period.</p>"
      : "<table><thead><tr><th>Trainer</th><th class=\"n\">Paid students</th><th class=\"n\">Total collected</th><th class=\"n\">Pay trainer</th><th class=\"n\">Company share</th><th class=\"n\">Tax</th></tr></thead><tbody>" +
        rows +
        "<tr class=\"tot\"><td>Total</td><td class=\"n\">" + paidTotal + "</td><td class=\"n\">" + formatKes(d.total_collected) +
        "</td><td class=\"n\">" + formatKes(d.total_owed_to_trainers) + "</td><td class=\"n\">" + formatKes(d.total_company_share) +
        "</td><td class=\"n\">" + formatKes(d.total_tax) + "</td></tr></tbody></table>";
    var summary = "<table class=\"sum\"><tr>" +
      "<td><div class=\"l\">Total collected</div><div class=\"v\">" + formatKes(d.total_collected) + "</div></td>" +
      "<td><div class=\"l\">Owed to trainers (" + esc(d.trainer_share_pct) + "%)</div><div class=\"v\">" + formatKes(d.total_owed_to_trainers) + "</div></td>" +
      "<td><div class=\"l\">Company revenue (" + esc(d.company_share_pct) + "%)</div><div class=\"v\">" + formatKes(d.total_company_share) + "</div></td>" +
      "<td><div class=\"l\">Tax (" + esc(d.tax_share_pct) + "%)</div><div class=\"v\">" + formatKes(d.total_tax) + "</div></td>" +
      "</tr></table>";
    var css = [
      "@page{size:A4;margin:16mm}",
      "*{box-sizing:border-box}",
      "body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#14231a;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
      "#wm{position:fixed;top:50%;left:50%;width:150mm;transform:translate(-50%,-50%);opacity:.08;z-index:0}",
      ".page{position:relative;z-index:1}",
      "h1{margin:0 0 2px;font-size:20px}",
      ".sub{color:#4b5d52;margin:0 0 14px}",
      "table{width:100%;border-collapse:collapse;margin-bottom:16px}",
      "th,td{padding:7px 8px;border-bottom:1px solid #cfdcd3;text-align:left}",
      "th{background:rgba(30,132,73,.14);font-size:11px;text-transform:uppercase;letter-spacing:.03em}",
      ".n{text-align:right}",
      ".b{font-weight:bold}",
      "tr{page-break-inside:avoid}",
      ".tot td{font-weight:bold;border-top:2px solid #1e8449}",
      ".sum td{border:1px solid #cfdcd3;padding:10px;vertical-align:top}",
      ".sum .l{font-size:10px;color:#4b5d52;text-transform:uppercase}",
      ".sum .v{font-size:16px;font-weight:bold;margin-top:3px}",
      ".note{color:#4b5d52;font-size:11px;margin-top:10px}",
      ".empty{padding:14px 0}"
    ].join("");
    return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + esc("Spark Finance - " + label) + "</title><style>" + css + "</style></head><body>" +
      "<img id=\"wm\" src=\"" + esc(logo) + "\" alt=\"\">" +
      "<div class=\"page\">" +
      "<h1>Spark Technologies - Finance report</h1>" +
      "<p class=\"sub\">Period: <b>" + esc(label) + "</b> &nbsp; | &nbsp; Generated " + esc(new Date().toLocaleString("en-GB")) + "</p>" +
      summary +
      "<h3 style=\"margin:0 0 6px;\">Trainer payments</h3>" +
      table +
      "<p class=\"note\">Payments are counted in the month they were marked as paid. Payments recorded before monthly tracking began are counted in the month the student enrolled.</p>" +
      "</div></body></html>";
  }
  function printHtml(html, fileTitle) {
    var old = document.getElementById("admin-report-frame");
    if (old) old.remove();
    var f = document.createElement("iframe");
    f.id = "admin-report-frame";
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(f);
    var w = f.contentWindow;
    var doc = w.document;
    doc.open();
    doc.write(html);
    doc.close();
    var prevTitle = document.title;
    document.title = fileTitle;
    var done = false;
    function go() {
      if (done) return;
      done = true;
      w.focus();
      w.print();
      document.title = prevTitle;
    }
    var img = doc.getElementById("wm");
    if (img && !img.complete) {
      img.onload = go;
      img.onerror = go;
      setTimeout(go, 3000);
    } else {
      setTimeout(go, 150);
    }
  }
  window.adminReportHelpers = { buildReport: buildReport, printHtml: printHtml }; function runReport(isPdf) {
    var key = window.adminEarningsMonth || currentMonthKey();
    if (isPdf) {
      var hint = document.getElementById("admin-earnings-hint");
      if (hint) {
        hint.textContent = "In the print window, set Destination to Save as PDF.";
        setTimeout(function () {
          var h = document.getElementById("admin-earnings-hint");
          if (h) h.textContent = "";
        }, 9000);
      }
    }
    fetch(API_BASE + "/api/admin/earnings?month=" + encodeURIComponent(key), { credentials: "include" })
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed");
        return res.json();
      })
      .then(function (d) {
        printHtml(buildReport(d, key), "Spark-Finance-" + (key === "all" ? "All-time" : key));
      })
      .catch(function () { alert("Could not load the report data right now."); });
  }
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest("#admin-earnings-print, #admin-earnings-pdf");
    if (!btn) return;
    if (window.adminReportRange && window.adminReportRange(btn.id === "admin-earnings-pdf")) return; runReport(btn.id === "admin-earnings-pdf");
  });
})();

/* ---------- Admin earnings: multi-month report ---------- */
window.adminReportRange = function (isPdf) {
  var sel = document.getElementById("admin-earnings-range");
  var n = sel ? parseInt(sel.value, 10) : 0;
  if (!n) return false;
  var helpers = window.adminReportHelpers;
  if (!helpers) return false;
  var hint = document.getElementById("admin-earnings-hint");
  if (isPdf && hint) {
    hint.textContent = "In the print window, set Destination to Save as PDF.";
    setTimeout(function () {
      var h = document.getElementById("admin-earnings-hint");
      if (h) h.textContent = "";
    }, 9000);
  }
  var now = new Date();
  var keys = [];
  for (var i = 0; i < n; i++) {
    var d0 = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(d0.getFullYear() + "-" + String(d0.getMonth() + 1).padStart(2, "0"));
  }
  function short(key) {
    var p = key.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
  }
  Promise.all(keys.map(function (k) {
    return fetch(API_BASE + "/api/admin/earnings?month=" + encodeURIComponent(k), { credentials: "include" })
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed");
        return res.json();
      });
  })).then(function (list) {
    var sums = ["paid_students", "total_collected", "owed_to_trainer", "company_share", "tax_share"];
    var map = {};
    var order = [];
    list.forEach(function (d) {
      (d.trainers || []).forEach(function (t) {
        var id = Object.keys(t).filter(function (k) { return sums.indexOf(k) < 0; }).sort()
          .map(function (k) { return k + "=" + t[k]; }).join("|");
        if (!map[id]) {
          map[id] = Object.assign({}, t);
          sums.forEach(function (k) { map[id][k] = 0; });
          order.push(id);
        }
        sums.forEach(function (k) { map[id][k] += Number(t[k] || 0); });
      });
    });
    var trainers = order.map(function (id) { return map[id]; });
    trainers.sort(function (a, b) { return String(a.trainer_name).localeCompare(String(b.trainer_name)); });
    function total(field) {
      return list.reduce(function (s, d) { return s + Number(d[field] || 0); }, 0);
    }
    var first = list[0] || {};
    var agg = {
      trainers: trainers,
      total_collected: total("total_collected"),
      total_owed_to_trainers: total("total_owed_to_trainers"),
      total_company_share: total("total_company_share"),
      total_tax: total("total_tax"),
      trainer_share_pct: first.trainer_share_pct,
      company_share_pct: first.company_share_pct,
      tax_share_pct: first.tax_share_pct,
      report_label: "Last " + n + " months (" + short(keys[n - 1]) + " - " + short(keys[0]) + ")"
    };
    helpers.printHtml(helpers.buildReport(agg, "all"), "Spark-Finance-Last-" + n + "-months");
  }).catch(function () { alert("Could not load the report data right now."); });
  return true;
};

/* ---------- Trainer: mark student completed ---------- */
function completeCellHtml(courseId, studentId, completed) {
  var attrs = ' data-course-id="' + courseId + '" data-student-id="' + studentId + '"';
  if (completed) {
    return '<span style="color:#1e8449;font-weight:bold;font-size:12px;">Completed</span> ' +
      '<button type="button" class="btn btn-ghost complete-student-btn" data-completed="0"' + attrs + ' style="padding:3px 8px;font-size:11px;">Undo</button>';
  }
  return '<button type="button" class="btn btn-ghost complete-student-btn" data-completed="1"' + attrs + ' style="padding:5px 10px;font-size:12px;">Mark completed</button>';
}
document.addEventListener("click", function (ev) {
  var btn = ev.target.closest(".complete-student-btn");
  if (!btn) return;
  var done = btn.dataset.completed === "1";
  var msg = done
    ? "Mark this student as completed? Only do this after you have taught all the lessons."
    : "Remove the completed mark for this student?";
  if (!confirm(msg)) return;
  var courseId = Number(btn.dataset.courseId);
  var studentId = Number(btn.dataset.studentId);
  var cell = btn.closest("td");
  btn.disabled = true;
  fetch(API_BASE + "/api/trainer/complete-student", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ course_id: courseId, student_id: studentId, completed: done })
  })
    .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
    .then(function (r) {
      if (!r.ok) { alert(r.d.error || "Could not update the student."); btn.disabled = false; return; }
      if (cell) cell.innerHTML = completeCellHtml(courseId, studentId, done);
    })
    .catch(function () { alert("Could not reach the server."); btn.disabled = false; });
});

/* ---------- Admin: Students overview page ---------- */
(function () {
  var STATE = { all: [], loaded: false, loading: false, last: 0 };
  var STATUS = {
    active: { label: "Active", bg: "#e3f4ea", fg: "#1e8449" },
    completed: { label: "Completed", bg: "#e1ecfb", fg: "#1f5fae" },
    pending: { label: "Pending", bg: "#fdf0d5", fg: "#9a6700" },
    inactive: { label: "Inactive", bg: "#ececec", fg: "#5f6b64" }
  };

  function esc(v) {
    v = v == null ? "" : String(v);
    if (typeof escapeHtml === "function") return escapeHtml(v);
    return v.replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; });
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ""; }
  function selText(id) {
    var e = document.getElementById(id);
    return e && e.selectedIndex >= 0 ? e.options[e.selectedIndex].text : "";
  }
  function toDate(v) {
    if (!v) return null;
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(v) {
    var d = toDate(v);
    return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
  }
  function statusOf(courses) {
    if (!courses.length) return "inactive";
    var access = courses.filter(function (c) { return c.paid || c.free || c.completed; });
    if (!access.length) return "pending";
    return access.every(function (c) { return c.completed; }) ? "completed" : "active";
  }
  function chipState(c) {
    if (c.completed) return "Completed";
    if (c.paid) return "Paid";
    if (c.free) return "Free";
    return "Unpaid";
  }
  function badgeHtml(status) {
    var s = STATUS[status];
    return '<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:bold;background:' + s.bg + ';color:' + s.fg + ';">' + s.label + '</span>';
  }
  function chipHtml(c) {
    var st = chipState(c);
    var col = { Completed: ["#e1ecfb", "#1f5fae"], Paid: ["#e3f4ea", "#1e8449"], Free: ["#e3f4ea", "#1e8449"], Unpaid: ["#fdf0d5", "#9a6700"] }[st];
    var tip = "Enrolled " + (fmtDate(c.enrolled_at) || "date unknown") + (c.intake_name ? " | Intake: " + c.intake_name : "");
    return '<span title="' + esc(tip) + '" style="display:inline-block;margin:2px 6px 2px 0;padding:3px 10px;border-radius:999px;font-size:12px;background:' + col[0] + ';color:' + col[1] + ';">' + esc(c.title) + ' <b>' + st + '</b></span>';
  }

  function field(label, inner) {
    return '<label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#4b5d52;text-transform:uppercase;letter-spacing:.03em;">' + label + inner + '</label>';
  }
  function opts(list) {
    return list.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join("");
  }
  function buildShell() {
    var r = document.getElementById("students-root");
    if (!r) return false;
    if (r.getAttribute("data-built")) return true;
    r.setAttribute("data-built", "1");
    var ctl = 'style="font-size:13px;padding:7px 8px;"';
    r.innerHTML =
      '<div class="section-title"><h2>Students</h2><span class="stat-trend" id="stu-count">0 members</span></div>' +
      '<div id="stu-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px;"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:12px;">' +
        field("Search", '<input type="search" id="stu-search" placeholder="Name, phone or email" ' + ctl + '>') +
        field("Status", '<select id="stu-status" ' + ctl + '>' + opts([["all", "All statuses"], ["active", "Active"], ["completed", "Completed"], ["pending", "Pending"], ["inactive", "Inactive"]]) + '</select>') +
        field("Course", '<select id="stu-course" ' + ctl + '><option value="all">All courses</option></select>') +
        field("Date based on", '<select id="stu-basis" ' + ctl + '>' + opts([["account", "Account created"], ["course", "Joined a course"]]) + '</select>') +
        field("Period", '<select id="stu-period" ' + ctl + '>' + opts([["all", "All time"], ["3", "Last 3 months"], ["6", "Last 6 months"], ["9", "Last 9 months"], ["12", "Last 12 months"]]) + '</select>') +
        field("Sort by", '<select id="stu-sort" ' + ctl + '>' + opts([["name", "Name (A-Z)"], ["joined_new", "Date joined (newest)"], ["joined_old", "Date joined (oldest)"], ["course", "Course (A-Z)"]]) + '</select>') +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;">' +
        '<button type="button" class="btn btn-ghost" id="stu-reset" style="padding:6px 12px;font-size:13px;">Reset filters</button>' +
        '<span style="flex:1"></span>' +
        '<span id="stu-hint" style="font-size:12px;color:#1e8449;"></span>' +
        '<button type="button" class="btn btn-ghost" id="stu-pdf" style="padding:6px 12px;font-size:13px;">Download PDF</button>' +
        '<button type="button" class="btn btn-ghost" id="stu-print" style="padding:6px 12px;font-size:13px;">Print</button>' +
      '</div>' +
      '<div id="stu-list"></div>';
    return true;
  }
  function fillCourses() {
    var sel = document.getElementById("stu-course");
    if (!sel) return;
    var keep = sel.value || "all";
    var seen = {}, list = [];
    STATE.all.forEach(function (s) {
      (s.courses || []).forEach(function (c) {
        if (!seen[c.course_id]) { seen[c.course_id] = 1; list.push(c); }
      });
    });
    list.sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); });
    sel.innerHTML = '<option value="all">All courses</option>' + list.map(function (c) {
      return '<option value="' + esc(c.course_id) + '">' + esc(c.title) + '</option>';
    }).join("");
    sel.value = seen[keep] ? keep : "all";
  }

  function state() {
    return {
      q: (val("stu-search") || "").trim().toLowerCase(),
      status: val("stu-status") || "all",
      course: val("stu-course") || "all",
      basis: val("stu-basis") || "account",
      period: val("stu-period") || "all",
      sort: val("stu-sort") || "name"
    };
  }
  function sorter(mode) {
    function byName(a, b) { return String(a.s.full_name).localeCompare(String(b.s.full_name)); }
    function firstTitle(r) {
      var t = r.courses.map(function (c) { return String(c.title); }).sort();
      return t.length ? t[0] : null;
    }
    return function (a, b) {
      if (mode === "joined_new" || mode === "joined_old") {
        var ta = a.when ? a.when.getTime() : null, tb = b.when ? b.when.getTime() : null;
        if (ta === null && tb === null) return byName(a, b);
        if (ta === null) return 1;
        if (tb === null) return -1;
        if (ta !== tb) return mode === "joined_new" ? tb - ta : ta - tb;
        return byName(a, b);
      }
      if (mode === "course") {
        var ca = firstTitle(a), cb = firstTitle(b);
        if (ca === null && cb === null) return byName(a, b);
        if (ca === null) return 1;
        if (cb === null) return -1;
        var c = ca.localeCompare(cb);
        return c !== 0 ? c : byName(a, b);
      }
      return byName(a, b);
    };
  }
  function build(ignoreStatus) {
    var f = state();
    var cutoff = null;
    if (f.period !== "all") {
      var n = parseInt(f.period, 10), now = new Date();
      cutoff = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
    }
    var rows = [];
    STATE.all.forEach(function (s) {
      var courses = s.courses || [];
      if (f.course !== "all") {
        courses = courses.filter(function (c) { return String(c.course_id) === f.course; });
        if (courses.length === 0) return;
      }
      if (f.q) {
        var hay = ((s.full_name || "") + " " + (s.phone || "") + " " + (s.email || "")).toLowerCase();
        if (hay.indexOf(f.q) < 0) return;
      }
      var when = null;
      if (f.basis === "course") {
        courses.forEach(function (c) {
          var t = toDate(c.enrolled_at);
          if (t && (!when || t > when)) when = t;
        });
      } else {
        when = toDate(s.joined_at);
      }
      if (cutoff && (!when || when < cutoff)) return;
      var status = statusOf(courses);
      if (!ignoreStatus && f.status !== "all" && status !== f.status) return;
      rows.push({ s: s, courses: courses, status: status, when: when });
    });
    rows.sort(sorter(f.sort));
    return { rows: rows, f: f, cutoff: cutoff };
  }

  function cardHtml(key, label, n, color, selected) {
    return '<div class="stu-card" data-status="' + key + '" style="cursor:pointer;padding:10px 12px;border:1px solid ' + (selected ? color : "#d6e0d9") +
      ';border-left:4px solid ' + color + ';border-radius:10px;' + (selected ? "background:rgba(30,132,73,.08);" : "") +
      '"><div style="font-size:11px;text-transform:uppercase;color:#4b5d52;">' + label + '</div><div style="font-size:20px;font-weight:bold;">' + n + '</div></div>';
  }
  function rowHtml(r) {
    var s = r.s;
    var contact = [s.phone, s.email].filter(Boolean).map(function (x) { return esc(x); }).join(" . ");
    return '<tr><td><div style="font-weight:600;">' + esc(s.full_name) + '</div>' +
      (contact ? '<div style="font-size:12px;color:#5f6b64;">' + contact + '</div>' : '') +
      (s.account_active ? '' : '<div style="font-size:11px;color:#b03a2e;">Account disabled</div>') +
      '</td><td>' + badgeHtml(r.status) + '</td><td>' +
      (r.courses.length ? r.courses.map(chipHtml).join("") : '<span style="font-size:12px;color:#7a867e;">No course yet</span>') +
      '</td><td style="white-space:nowrap;">' + (fmtDate(r.when) || '<span style="color:#7a867e;">Unknown</span>') + '</td></tr>';
  }
  function render() {
    var list = document.getElementById("stu-list");
    if (!list) return;
    var f = state();
    var base = build(true).rows;
    var counts = { active: 0, completed: 0, pending: 0, inactive: 0 };
    base.forEach(function (r) { counts[r.status]++; });
    var cards = document.getElementById("stu-cards");
    if (cards) {
      cards.innerHTML =
        cardHtml("all", "All", base.length, "#4b5d52", f.status === "all") +
        cardHtml("active", "Active", counts.active, STATUS.active.fg, f.status === "active") +
        cardHtml("completed", "Completed", counts.completed, STATUS.completed.fg, f.status === "completed") +
        cardHtml("pending", "Pending", counts.pending, STATUS.pending.fg, f.status === "pending") +
        cardHtml("inactive", "Inactive", counts.inactive, "#8a948d", f.status === "inactive");
    }
    var rows = f.status === "all" ? base : base.filter(function (r) { return r.status === f.status; });
    var countEl = document.getElementById("stu-count");
    if (countEl) countEl.textContent = rows.length + " of " + STATE.all.length + " members";
    if (rows.length === 0) {
      list.innerHTML = '<div class="empty-state">No students match these filters.</div>';
      return;
    }
    list.innerHTML = '<div style="overflow-x:auto;"><table class="simple-table"><thead><tr><th>Student</th><th>Status</th><th>Courses</th><th>' +
      (f.basis === "course" ? "Joined course" : "Joined") + '</th></tr></thead><tbody>' + rows.map(rowHtml).join("") + '</tbody></table></div>';
  }
  function reset() {
    var d = { "stu-search": "", "stu-status": "all", "stu-course": "all", "stu-basis": "account", "stu-period": "all", "stu-sort": "name" };
    Object.keys(d).forEach(function (id) { var e = document.getElementById(id); if (e) e.value = d[id]; });
    render();
  }

  function load() {
    if (!buildShell()) return;
    var now = Date.now();
    if (STATE.loading || now - STATE.last < 3000) return;
    STATE.loading = true;
    STATE.last = now;
    var list = document.getElementById("stu-list");
    if (list && !STATE.all.length) list.innerHTML = '<div class="empty-state">Loading students...</div>';
    fetch(API_BASE + "/api/admin/students-overview", { credentials: "include" })
      .then(function (res) { if (!res.ok) throw new Error("Request failed"); return res.json(); })
      .then(function (data) {
        STATE.all = Array.isArray(data) ? data : [];
        STATE.loaded = true;
        STATE.loading = false;
        fillCourses();
        render();
      })
      .catch(function () {
        STATE.loaded = true;
        STATE.loading = false;
        var l = document.getElementById("stu-list");
        if (l) l.innerHTML = '<div class="empty-state">Could not load students right now.</div>';
      });
  }

  function printHtml(html, title) {
    var old = document.getElementById("students-report-frame");
    if (old) old.remove();
    var f = document.createElement("iframe");
    f.id = "students-report-frame";
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(f);
    var w = f.contentWindow;
    var doc = w.document;
    doc.open();
    doc.write(html);
    doc.close();
    var prev = document.title;
    document.title = title;
    var done = false;
    function go() {
      if (done) return;
      done = true;
      w.focus();
      w.print();
      document.title = prev;
    }
    var img = doc.getElementById("wm");
    if (img && !img.complete) {
      img.onload = go;
      img.onerror = go;
      setTimeout(go, 3000);
    } else {
      setTimeout(go, 150);
    }
  }
  function report(isPdf) {
    if (!STATE.loaded) { alert("The student list is still loading."); return; }
    var res = build(false);
    var rows = res.rows, f = res.f;
    if (rows.length === 0) { alert("There are no students to print with these filters."); return; }
    if (isPdf) {
      var hint = document.getElementById("stu-hint");
      if (hint) {
        hint.textContent = "In the print window, set Destination to Save as PDF.";
        setTimeout(function () { var h = document.getElementById("stu-hint"); if (h) h.textContent = ""; }, 9000);
      }
    }
    var counts = { active: 0, completed: 0, pending: 0, inactive: 0 };
    rows.forEach(function (r) { counts[r.status]++; });
    var parts = [];
    if (f.q) parts.push('Search: "' + f.q + '"');
    parts.push("Status: " + selText("stu-status"));
    parts.push("Course: " + selText("stu-course"));
    var dateLine = "Date: " + (f.basis === "course" ? "joined a course" : "account created") + ", " + selText("stu-period");
    if (res.cutoff) dateLine += " (since " + fmtDate(res.cutoff) + ")";
    parts.push(dateLine);
    parts.push("Sorted by: " + selText("stu-sort"));
    var logo = new URL("assets/logo-sidebar.png", window.location.href).href;
    var body = rows.map(function (r, i) {
      var s = r.s;
      var courseLines = r.courses.length ? r.courses.map(function (c) {
        return esc(c.title) + " - " + chipState(c) + (c.enrolled_at ? " (joined " + esc(fmtDate(c.enrolled_at)) + ")" : "");
      }).join("<br>") : "No course yet";
      return "<tr><td>" + (i + 1) + "</td><td><b>" + esc(s.full_name) + "</b></td><td>" + esc(s.phone || "-") + "<br>" + esc(s.email || "") +
        "</td><td class=\"st-" + r.status + "\">" + STATUS[r.status].label + "</td><td>" + courseLines + "</td><td>" + (esc(fmtDate(r.when)) || "Unknown") + "</td></tr>";
    }).join("");
    var css = [
      "@page{size:A4 landscape;margin:14mm}",
      "*{box-sizing:border-box}",
      "body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#14231a;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
      "#wm{position:fixed;top:50%;left:50%;width:150mm;transform:translate(-50%,-50%);opacity:.08;z-index:0}",
      ".page{position:relative;z-index:1}",
      "h1{margin:0 0 2px;font-size:19px}",
      ".sub{color:#4b5d52;margin:0 0 4px}",
      ".sum{margin:8px 0 12px;font-size:12px}",
      "table{width:100%;border-collapse:collapse}",
      "thead{display:table-header-group}",
      "th,td{padding:6px 7px;border-bottom:1px solid #cfdcd3;text-align:left;vertical-align:top}",
      "th{background:rgba(30,132,73,.14);font-size:10px;text-transform:uppercase;letter-spacing:.03em}",
      "tr{page-break-inside:avoid}",
      ".st-active{color:#1e8449;font-weight:bold}",
      ".st-completed{color:#1f5fae;font-weight:bold}",
      ".st-pending{color:#9a6700;font-weight:bold}",
      ".st-inactive{color:#5f6b64;font-weight:bold}"
    ].join("");
    var html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Spark Students</title><style>" + css + "</style></head><body>" +
      "<img id=\"wm\" src=\"" + esc(logo) + "\" alt=\"\">" +
      "<div class=\"page\">" +
      "<h1>Spark Technologies - Students report</h1>" +
      "<p class=\"sub\">Generated " + esc(new Date().toLocaleString("en-GB")) + " &nbsp; | &nbsp; Showing " + rows.length + " of " + STATE.all.length + " members</p>" +
      "<p class=\"sub\">" + esc(parts.join("  |  ")) + "</p>" +
      "<p class=\"sum\"><b>Active:</b> " + counts.active + " &nbsp; <b>Completed:</b> " + counts.completed + " &nbsp; <b>Pending:</b> " + counts.pending + " &nbsp; <b>Inactive:</b> " + counts.inactive + "</p>" +
      "<table><thead><tr><th>#</th><th>Student</th><th>Contact</th><th>Status</th><th>Courses</th><th>" + (f.basis === "course" ? "Joined course" : "Joined") + "</th></tr></thead><tbody>" + body + "</tbody></table>" +
      "</div></body></html>";
    var stamp = new Date().toISOString().slice(0, 10);
    printHtml(html, "Spark-Students-" + stamp);
  }

  document.addEventListener("input", function (ev) {
    if (ev.target && ev.target.id === "stu-search") render();
  });
  document.addEventListener("change", function (ev) {
    if (ev.target && ev.target.id && ev.target.id.indexOf("stu-") === 0) render();
  });
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest('.admin-tab[data-tab="students"]')) { load(); return; }
    var card = t.closest(".stu-card");
    if (card) {
      var sel = document.getElementById("stu-status");
      if (sel) { sel.value = card.getAttribute("data-status"); render(); }
      return;
    }
    if (t.closest("#stu-reset")) { reset(); return; }
    var b = t.closest("#stu-pdf, #stu-print");
    if (b) report(b.id === "stu-pdf");
  });
  setInterval(function () {
    var r = document.getElementById("students-root");
    if (!r || STATE.loaded || STATE.loading) return;
    var p = r.closest(".admin-tab-panel");
    if (p && p.style.display !== "none" && r.offsetParent !== null) load();
  }, 1000);
})();

/* ---------- Courses: duration text + edit form ---------- */
function courseDurationText(c) {
  var n = Number(c && c.duration_value), u = c && c.duration_unit;
  if (n >= 1 && (u === "weeks" || u === "months")) {
    return n + " " + (u === "months" ? "month" : "week") + (n === 1 ? "" : "s");
  }
  var m = Math.round(Number(c && c.duration_weeks) / 4);
  if (isNaN(m)) return "";
  return m + " month" + (m === 1 ? "" : "s");
}
(function () {
  function refresh() {
    if (typeof loadAssignTable === "function") loadAssignTable();
    if (typeof loadAdminOverview === "function") loadAdminOverview();
    if (typeof loadAdminEarnings === "function") loadAdminEarnings();
  }
  function lbl(text, inner) {
    return '<label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#4b5d52;text-transform:uppercase;letter-spacing:.03em;">' + text + inner + '</label>';
  }
  function formHtml(c) {
    var unit = c.duration_unit === "months" ? "months" : "weeks";
    var val = Number(c.duration_value) >= 1 ? Number(c.duration_value) : (Number(c.duration_weeks) >= 1 ? Number(c.duration_weeks) : 4);
    var fee = (c.fee_kes === null || c.fee_kes === undefined) ? "" : String(c.fee_kes);
    var levels = ["Beginner", "Intermediate", "Advanced"].map(function (l) {
      return '<option value="' + l + '"' + (c.level === l ? " selected" : "") + '>' + l + '</option>';
    }).join("");
    return '<td colspan="5"><div class="course-edit-box" data-course-id="' + c.id + '" data-orig-fee="' + escapeHtml(fee) + '" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;padding:12px;border:1px solid #cfdcd3;border-radius:10px;background:rgba(30,132,73,.05);">' +
      lbl("Title", '<input type="text" class="ce-title" value="' + escapeHtml(c.title) + '">') +
      lbl("Level", '<select class="ce-level">' + levels + '</select>') +
      lbl("Duration", '<div style="display:flex;gap:6px;"><input type="number" class="ce-duration" min="1" value="' + val + '" style="flex:1;min-width:70px;"><select class="ce-unit"><option value="weeks"' + (unit === "weeks" ? " selected" : "") + '>Weeks</option><option value="months"' + (unit === "months" ? " selected" : "") + '>Months</option></select></div>') +
      lbl("Fee (KES, blank = free)", '<input type="number" class="ce-fee" min="0" value="' + escapeHtml(fee) + '">') +
      '<label style="grid-column:1/-1;display:flex;flex-direction:column;gap:3px;font-size:11px;color:#4b5d52;text-transform:uppercase;letter-spacing:.03em;">Description<textarea class="ce-desc" rows="3">' + escapeHtml(c.description || "") + '</textarea></label>' +
      '<div style="grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
        '<button type="button" class="btn btn-primary ce-save" style="padding:7px 14px;font-size:13px;">Save changes</button>' +
        '<button type="button" class="btn btn-ghost ce-cancel" style="padding:7px 14px;font-size:13px;">Cancel</button>' +
        '<span style="font-size:12px;color:#4b5d52;">The trainer and enrolled students are not affected. Changing the fee also changes how this course is counted in Finance.</span>' +
      '</div></div></td>';
  }
  function openEdit(btn) {
    var id = Number(btn.dataset.courseId);
    var row = btn.closest("tr");
    if (!row) return;
    var next = row.nextElementSibling;
    if (next && next.classList.contains("course-edit-row")) { next.remove(); return; }
    btn.disabled = true;
    fetch(API_BASE + "/api/admin/courses", { credentials: "include" })
      .then(function (res) { return res.json(); })
      .then(function (list) {
        btn.disabled = false;
        var c = (Array.isArray(list) ? list : []).filter(function (x) { return Number(x.id) === id; })[0];
        if (!c) { alert("Could not load this course right now."); return; }
        var tr = document.createElement("tr");
        tr.className = "course-edit-row";
        tr.innerHTML = formHtml(c);
        row.parentNode.insertBefore(tr, row.nextSibling);
      })
      .catch(function () { btn.disabled = false; alert("Could not reach the server."); });
  }
  function saveEdit(btn) {
    var box = btn.closest(".course-edit-box");
    if (!box) return;
    var id = Number(box.dataset.courseId);
    var title = box.querySelector(".ce-title").value.trim();
    var level = box.querySelector(".ce-level").value;
    var dur = parseInt(box.querySelector(".ce-duration").value, 10);
    var unit = box.querySelector(".ce-unit").value;
    var fee = box.querySelector(".ce-fee").value.trim();
    var desc = box.querySelector(".ce-desc").value;
    if (!title) { alert("Enter a course title."); return; }
    if (!(dur >= 1)) { alert("Enter a duration of 1 or more."); return; }
    if (fee !== "" && !(Number(fee) >= 0)) { alert("Enter a valid fee, or leave it blank for a free course."); return; }
    if (fee !== (box.dataset.origFee || "") && !confirm("Finance totals use each course's current fee, so changing it also changes this course's past months in Finance. Save the new fee?")) return;
    btn.disabled = true;
    btn.textContent = "Saving...";
    fetch(API_BASE + "/api/admin/courses/" + id + "/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title: title, level: level, description: desc, duration_value: dur, duration_unit: unit, fee_kes: fee })
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) { alert(r.d.error || "Could not save the course."); btn.disabled = false; btn.textContent = "Save changes"; return; }
        refresh();
      })
      .catch(function () { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Save changes"; });
  }
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var edit = t.closest(".edit-course-btn");
    if (edit) { openEdit(edit); return; }
    var cancel = t.closest(".ce-cancel");
    if (cancel) { var r = cancel.closest("tr"); if (r) r.remove(); return; }
    var save = t.closest(".ce-save");
    if (save) saveEdit(save);
  });
})();

/* ---------- Certificate text fitting ---------- */
function fitCertText() {
  var n = document.getElementById("cert-name");
  if (n) { var s = 78; n.style.fontSize = s + "px"; while (n.scrollWidth > n.clientWidth && s > 30) { s -= 2; n.style.fontSize = s + "px"; } }
  var c = document.getElementById("cert-courses-text");
  if (c) {
    var parts = (c.textContent || "").split("|").map(function (t) { return t.trim(); }).filter(Boolean);
    c.innerHTML = parts.map(function (t, i) {
      return '<span class="cv-c">' + escapeHtml(t) + (i < parts.length - 1 ? '<span class="cv-sep"> |</span>' : "") + "</span>";
    }).join(" ");
    var f = 24; c.style.fontSize = f + "px";
    while (c.scrollHeight > c.clientHeight && f > 12) { f -= 1; c.style.fontSize = f + "px"; }
    var items = c.querySelectorAll(".cv-c");
    for (var i = 0; i < items.length - 1; i++) {
      if (items[i + 1].offsetTop > items[i].offsetTop + 2) { var sp = items[i].querySelector(".cv-sep"); if (sp) sp.style.visibility = "hidden"; }
    }
  }
}
