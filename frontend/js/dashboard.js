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
  if (!links || links.length === 0) return "<div class=\"empty-state\">No class links posted yet.</div>";
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
  const durationLabel = Math.round(c.duration_weeks / 4) + " month" + (Math.round(c.duration_weeks / 4) === 1 ? "" : "s");
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
    const res = await fetch(API_BASE + "/api/trainer/earnings", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const d = await res.json();
    container.innerHTML =
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
        "<table class=\"simple-table\"><thead><tr><th>Name</th><th>Phone</th><th>Payment</th><th>Attendance</th><th>CAT 1</th><th>CAT 2</th><th>Final</th><th>Files</th><th></th></tr></thead><tbody>" +
        g.students.map(s => (
          "<tr data-student-id=\"" + s.id + "\">" +
            "<td>" + escapeHtml(s.full_name) + "</td>" +
            "<td>" + escapeHtml(s.phone || "-") + "</td>" +
            "<td>" + statusBadge(s.has_paid, 0) + "</td>" +
            "<td style=\"min-width:110px;\">" + attendanceBarHtml(s.attended, 10) + "</td>" +
            "<td><input type=\"number\" min=\"0\" max=\"100\" class=\"score-input\" data-type=\"cat1\" value=\"" + (s.scores.cat1 ? s.scores.cat1.score : "") + "\" style=\"width:55px;\"></td>" +
            "<td><input type=\"number\" min=\"0\" max=\"100\" class=\"score-input\" data-type=\"cat2\" value=\"" + (s.scores.cat2 ? s.scores.cat2.score : "") + "\" style=\"width:55px;\"></td>" +
            "<td><input type=\"number\" min=\"0\" max=\"100\" class=\"score-input\" data-type=\"final\" value=\"" + (s.scores.final ? s.scores.final.score : "") + "\" style=\"width:55px;\"></td>" +
            "<td class=\"cat-files-cell\" data-student-id=\"" + s.id + "\">—</td>" +
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
    const res = await fetch(API_BASE + "/api/admin/earnings", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed");
    const d = await res.json();
    container.innerHTML =
      "<div class=\"earnings-cards\">" +
        earningsCard("Total collected", formatKes(d.total_collected), "") +
        earningsCard("Owed to trainers (" + d.trainer_share_pct + "%)", formatKes(d.total_owed_to_trainers), "is-highlight") +
        earningsCard("Company revenue (" + d.company_share_pct + "%)", formatKes(d.total_company_share), "") +
        earningsCard("Tax (" + d.tax_share_pct + "%)", formatKes(d.total_tax), "") +
      "</div>" +
      (d.trainers.length === 0 ? "<div class=\"empty-state\">No payments collected yet.</div>" :
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
    const res = await fetch(API_BASE + "/api/admin/courses/create", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ title, level, fee_kes: fee, duration_weeks: duration, description }) });
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
  if (coursesEl) coursesEl.textContent = completedTitles.join("   |   ");

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

