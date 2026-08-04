let currentUser = null;
let adminMessages = [];

document.addEventListener("DOMContentLoaded", () => { init(); });

async function init() {
  try {
    const res = await fetch(API_BASE + "/api/session", { credentials: "include" });
    const data = await res.json();
    currentUser = data.user;
  } catch (err) {
    currentUser = null;
  }

  setTopbar(currentUser);

  const form = document.getElementById("contact-form");
  if (form) form.addEventListener("submit", handleContactSubmit);

  if (currentUser && currentUser.role === "admin") {
    const panel = document.getElementById("admin-messages-panel");
    if (panel) panel.style.display = "block";
    loadAdminMessages();
  }
}

function setTopbar(user) {
  const el = document.getElementById("topbar-actions");
  if (!el) return;
  if (!user) {
    el.innerHTML = "<a href=\"login.html\" class=\"btn btn-ghost\">Log In</a><a href=\"register.html\" class=\"btn btn-primary\">Create Account</a>";
    return;
  }
  el.innerHTML = "<span class=\"role-badge\">" + escapeHtml(user.role) + "</span><a href=\"index.html\" class=\"btn btn-ghost\">Dashboard</a>";
}

async function handleContactSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const name = form.querySelector(".contact-name-input").value.trim();
  const email = form.querySelector(".contact-email-input").value.trim();
  const subject = form.querySelector(".contact-subject-input").value.trim();
  const message = form.querySelector(".contact-message-input").value.trim();
  const btn = form.querySelector("button[type=submit]");
  const statusEl = document.getElementById("contact-form-status");

  statusEl.textContent = "";
  statusEl.className = "contact-form-status";

  if (!name || !email || !message) return;

  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    const res = await fetch(API_BASE + "/api/contact", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, subject, message })
    });
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = data.error || "Could not send your message.";
      statusEl.className = "contact-form-status error";
      btn.disabled = false;
      btn.textContent = "Send message";
      return;
    }
    statusEl.textContent = "Message sent - we will get back to you soon.";
    statusEl.className = "contact-form-status success";
    form.reset();
    btn.disabled = false;
    btn.textContent = "Send message";
    if (currentUser && currentUser.role === "admin") loadAdminMessages();
  } catch (err) {
    statusEl.textContent = "Could not reach the server.";
    statusEl.className = "contact-form-status error";
    btn.disabled = false;
    btn.textContent = "Send message";
  }
}

async function loadAdminMessages() {
  const listEl = document.getElementById("admin-messages-list");
  const countEl = document.getElementById("messages-count");
  if (!listEl) return;
  try {
    const res = await fetch(API_BASE + "/api/admin/messages", { credentials: "include" });
    if (!res.ok) throw new Error("Request failed: " + res.status);
    adminMessages = await res.json();
  } catch (err) {
    console.warn("Messages unavailable:", err.message);
    adminMessages = [];
  }
  renderAdminMessages();
  const unreadCount = adminMessages.filter(m => !m.is_read).length;
  if (countEl) countEl.textContent = adminMessages.length + " message" + (adminMessages.length === 1 ? "" : "s") + (unreadCount > 0 ? " (" + unreadCount + " unread)" : "");
}

function renderAdminMessages() {
  const listEl = document.getElementById("admin-messages-list");
  if (!listEl) return;

  if (adminMessages.length === 0) {
    listEl.innerHTML = "<div class=\"empty-state\">No messages yet.</div>";
    return;
  }

  listEl.innerHTML = adminMessages.map(messageRowHtml).join("");

  listEl.querySelectorAll(".message-toggle-read-btn").forEach(btn => {
    btn.addEventListener("click", () => handleToggleRead(btn));
  });
  listEl.querySelectorAll(".message-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => handleDeleteMessage(btn));
  });
  listEl.querySelectorAll(".message-reply-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const box = document.getElementById("reply-box-" + btn.dataset.messageId);
      if (box) box.style.display = box.style.display === "none" ? "block" : "none";
    });
  });
  listEl.querySelectorAll(".message-reply-cancel").forEach(btn => {
    btn.addEventListener("click", () => {
      const box = document.getElementById("reply-box-" + btn.dataset.messageId);
      if (box) box.style.display = "none";
    });
  });
  listEl.querySelectorAll(".message-reply-send").forEach(btn => {
    btn.addEventListener("click", () => handleSendReply(btn));
  });
}

async function handleSendReply(btn) {
  const messageId = btn.dataset.messageId;
  const box = document.getElementById("reply-box-" + messageId);
  const textarea = box.querySelector(".message-reply-input");
  const statusEl = document.getElementById("reply-status-" + messageId);
  const replyBody = textarea.value.trim();

  if (!replyBody) return;

  btn.disabled = true;
  btn.textContent = "Sending...";
  statusEl.textContent = "";
  statusEl.className = "message-reply-status";

  try {
    const res = await fetch(API_BASE + "/api/admin/messages/" + messageId + "/reply", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply_body: replyBody })
    });
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = data.error || "Could not send the reply.";
      statusEl.className = "message-reply-status error";
      btn.disabled = false;
      btn.textContent = "Send reply";
      return;
    }
    statusEl.textContent = "Reply sent.";
    statusEl.className = "message-reply-status success";
    setTimeout(() => loadAdminMessages(), 900);
  } catch (err) {
    statusEl.textContent = "Could not reach the server.";
    statusEl.className = "message-reply-status error";
    btn.disabled = false;
    btn.textContent = "Send reply";
  }
}

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function messageRowHtml(m) {
  const dateStr = new Date(m.created_at).toLocaleString();
  const subjectHtml = m.subject ? "<div class=\"message-row__subject\">" + escapeHtml(m.subject) + "</div>" : "";

  return (
    "<div class=\"message-row" + (m.is_read ? "" : " unread") + "\">" +
      "<div class=\"message-row__avatar\">" + escapeHtml(initials(m.name)) + "</div>" +
      "<div class=\"message-row__main\">" +
        "<div class=\"message-row__top\">" +
          (m.is_read ? "" : "<span class=\"unread-dot\"></span>") +
          "<span class=\"message-row__name\">" + escapeHtml(m.name) + "</span>" +
          "<span class=\"message-row__email\">" + escapeHtml(m.email) + "</span>" +
        "</div>" +
        subjectHtml +
        "<div class=\"message-row__body\">" + escapeHtml(m.message) + "</div>" +
        "<div class=\"message-row__date\">" + dateStr + "</div>" +
      "</div>" +
      "<div class=\"message-row__actions\">" +
        "<button type=\"button\" class=\"btn btn-ghost message-reply-btn\" data-message-id=\"" + m.id + "\">Reply</button>" +
        "<button type=\"button\" class=\"btn btn-ghost message-toggle-read-btn\" data-message-id=\"" + m.id + "\" data-is-read=\"" + (m.is_read ? "1" : "0") + "\">" + (m.is_read ? "Mark unread" : "Mark read") + "</button>" +
        "<button type=\"button\" class=\"btn btn-ghost message-delete-btn\" data-message-id=\"" + m.id + "\">Delete</button>" +
      "</div>" +
    "</div>" +
    "<div class=\"message-reply-box\" id=\"reply-box-" + m.id + "\" style=\"display:none;\">" +
      "<textarea class=\"message-reply-input\" rows=\"3\" placeholder=\"Type your reply...\"></textarea>" +
      "<div class=\"message-reply-actions\">" +
        "<button type=\"button\" class=\"btn btn-ghost message-reply-cancel\" data-message-id=\"" + m.id + "\">Cancel</button>" +
        "<button type=\"button\" class=\"btn btn-primary message-reply-send\" data-message-id=\"" + m.id + "\">Send reply</button>" +
      "</div>" +
      "<div class=\"message-reply-status\" id=\"reply-status-" + m.id + "\"></div>" +
    "</div>"
  );
}

async function handleToggleRead(btn) {
  const isRead = btn.dataset.isRead === "1";
  btn.disabled = true;
  try {
    const res = await fetch(API_BASE + "/api/admin/messages/" + btn.dataset.messageId + "/read", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_read: !isRead })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not update this message."); btn.disabled = false; return; }
    loadAdminMessages();
  } catch (err) {
    alert("Could not reach the server.");
    btn.disabled = false;
  }
}

async function handleDeleteMessage(btn) {
  if (!confirm("Delete this message? This cannot be undone.")) return;
  btn.disabled = true;
  try {
    const res = await fetch(API_BASE + "/api/admin/messages/" + btn.dataset.messageId, { method: "DELETE", credentials: "include" });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not delete this message."); btn.disabled = false; return; }
    loadAdminMessages();
  } catch (err) {
    alert("Could not reach the server.");
    btn.disabled = false;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}


