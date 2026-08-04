let currentUser = null;
let teamMembers = [];

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

  if (currentUser && currentUser.role === "admin") {
    const formCard = document.getElementById("team-admin-form-card");
    if (formCard) formCard.style.display = "block";
    const form = document.getElementById("admin-add-team-form");
    if (form) form.addEventListener("submit", handleAddTeamMember);
  }

  loadTeam();
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

const ICON_EDIT = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z\"/></svg>";
const ICON_DELETE = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 6h18\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/><path d=\"M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6\"/></svg>";

async function loadTeam() {
  const grid = document.getElementById("team-grid");
  const countEl = document.getElementById("team-count");
  if (!grid) return;
  try {
    const res = await fetch(API_BASE + "/api/team");
    if (!res.ok) throw new Error("Request failed: " + res.status);
    teamMembers = await res.json();
  } catch (err) {
    console.warn("Team unavailable:", err.message);
    teamMembers = [];
  }
  renderTeam();
  if (countEl) countEl.textContent = teamMembers.length + " member" + (teamMembers.length === 1 ? "" : "s");
}

function renderTeam() {
  const grid = document.getElementById("team-grid");
  if (!grid) return;

  if (teamMembers.length === 0) {
    grid.innerHTML = "<div class=\"empty-state\">Team members will appear here soon.</div>";
    return;
  }

  grid.innerHTML = teamMembers.map(teamCardHtml).join("");

  grid.querySelectorAll(".team-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => handleDeleteTeamMember(btn));
  });
  grid.querySelectorAll(".team-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditTeamModal(Number(btn.dataset.memberId)));
  });
}

function teamCardHtml(m) {
  const imageHtml = m.image_filename
    ? "<img class=\"team-card__image\" src=\"/team-images/" + encodeURIComponent(m.image_filename) + "\" alt=\"" + escapeHtml(m.full_name) + "\">"
    : "<div class=\"team-card__image-placeholder\">Spark Technologies</div>";

  const roleHtml = m.role_title ? escapeHtml(m.role_title).replace(/\n/g, "<br>") : "";

  const adminOverlay = (currentUser && currentUser.role === "admin")
    ? "<div class=\"team-card-admin-overlay\">" +
        "<button type=\"button\" class=\"team-icon-btn edit team-edit-btn\" data-member-id=\"" + m.id + "\" aria-label=\"Edit\" title=\"Edit\">" + ICON_EDIT + "</button>" +
        "<button type=\"button\" class=\"team-icon-btn delete team-delete-btn\" data-member-id=\"" + m.id + "\" data-member-name=\"" + escapeHtml(m.full_name) + "\" aria-label=\"Remove\" title=\"Remove\">" + ICON_DELETE + "</button>" +
      "</div>"
    : "";

  return (
    "<div class=\"team-card\">" +
      "<div class=\"team-card__image-wrap\">" + imageHtml + adminOverlay + "</div>" +
      "<div class=\"team-card__accent\"></div>" +
      "<div class=\"team-card__body\">" +
        "<div class=\"team-card__name\">" + escapeHtml(m.full_name) + "</div>" +
        (roleHtml ? "<div class=\"team-card__role\">" + roleHtml + "</div>" : "") +
      "</div>" +
    "</div>"
  );
}

/* ---------- Edit modal ---------- */
function openEditTeamModal(memberId) {
  const m = teamMembers.find(t => t.id === memberId);
  if (!m) return;

  const overlay = document.createElement("div");
  overlay.className = "team-modal-overlay";
  overlay.innerHTML =
    "<div class=\"team-modal\">" +
      "<div class=\"team-modal__head\">" +
        "<div class=\"team-modal__head-text\">" +
          "<div class=\"module-tag\"><span class=\"pad\"></span> EDIT ENTRY</div>" +
          "<h3>" + escapeHtml(m.full_name) + "</h3>" +
        "</div>" +
        "<button type=\"button\" class=\"team-modal-close\" aria-label=\"Close\">&times;</button>" +
      "</div>" +
      "<form class=\"team-add-form\" id=\"team-edit-form\">" +
        "<label>Full name<input type=\"text\" class=\"team-name-input\" value=\"" + escapeHtml(m.full_name) + "\" required></label>" +
        "<label>Role<textarea class=\"team-role-input\" rows=\"2\">" + escapeHtml(m.role_title || "") + "</textarea></label>" +
        (m.image_filename ? "<div class=\"team-modal-current-image\"><img src=\"/team-images/" + encodeURIComponent(m.image_filename) + "\" alt=\"\"><label class=\"project-remove-image-label\"><input type=\"checkbox\" class=\"team-remove-image-checkbox\"> Remove this photo</label></div>" : "") +
        "<label class=\"team-file-label\">" + (m.image_filename ? "Replace photo (optional)" : "Add a photo (optional)") + "<input type=\"file\" class=\"team-image-input\" accept=\"image/*\"></label>" +
        "<div class=\"team-modal-actions\">" +
          "<button type=\"button\" class=\"btn btn-ghost\" id=\"team-edit-cancel\">Cancel</button>" +
          "<button type=\"submit\" class=\"btn btn-primary\">Save changes</button>" +
        "</div>" +
      "</form>" +
    "</div>";

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const closeModal = () => { overlay.remove(); document.body.style.overflow = ""; };

  overlay.querySelector(".team-modal-close").addEventListener("click", closeModal);
  overlay.querySelector("#team-edit-cancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  const escHandler = (e) => { if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", escHandler); } };
  document.addEventListener("keydown", escHandler);

  overlay.querySelector("#team-edit-form").addEventListener("submit", (e) => handleEditTeamMember(e, memberId, closeModal));
}

async function handleEditTeamMember(e, memberId, closeModal) {
  e.preventDefault();
  const form = e.target;
  const name = form.querySelector(".team-name-input").value.trim();
  const role = form.querySelector(".team-role-input").value.trim();
  const fileInput = form.querySelector(".team-image-input");
  const removeCheckbox = form.querySelector(".team-remove-image-checkbox");
  const btn = form.querySelector("button[type=submit]");
  if (!name) return;

  const formData = new FormData();
  formData.append("full_name", name);
  formData.append("role_title", role);
  if (fileInput.files[0]) formData.append("image", fileInput.files[0]);
  if (removeCheckbox && removeCheckbox.checked) formData.append("remove_image", "true");

  btn.disabled = true; btn.textContent = "Saving...";
  try {
    const res = await fetch(API_BASE + "/api/admin/team/" + memberId + "/edit", { method: "POST", credentials: "include", body: formData });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not save changes."); btn.disabled = false; btn.textContent = "Save changes"; return; }
    closeModal();
    loadTeam();
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Save changes"; }
}

async function handleAddTeamMember(e) {
  e.preventDefault();
  const form = e.target;
  const name = form.querySelector(".team-name-input").value.trim();
  const role = form.querySelector(".team-role-input").value.trim();
  const fileInput = form.querySelector(".team-image-input");
  const btn = form.querySelector("button");
  if (!name) return;

  const formData = new FormData();
  formData.append("full_name", name);
  formData.append("role_title", role);
  if (fileInput.files[0]) formData.append("image", fileInput.files[0]);

  btn.disabled = true; btn.textContent = "Adding...";
  try {
    const res = await fetch(API_BASE + "/api/admin/team/create", { method: "POST", credentials: "include", body: formData });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not add this team member."); btn.disabled = false; btn.textContent = "Add team member"; return; }
    form.reset();
    btn.disabled = false; btn.textContent = "Add team member";
    loadTeam();
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Add team member"; }
}

async function handleDeleteTeamMember(btn) {
  if (!confirm("Remove \"" + btn.dataset.memberName + "\" from the team page? This cannot be undone.")) return;
  btn.disabled = true;
  try {
    const res = await fetch(API_BASE + "/api/admin/team/" + btn.dataset.memberId, { method: "DELETE", credentials: "include" });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not remove this team member."); btn.disabled = false; return; }
    loadTeam();
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}
