let allProjects = [];
let currentUser = null;
let activeStatus = "All";
let refreshTimer = null;
let editingProjectId = null;

document.addEventListener("DOMContentLoaded", () => {
  init();

  const searchInput = document.getElementById("project-search");
  if (searchInput) searchInput.addEventListener("input", renderProjects);

  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeStatus = chip.dataset.status;
      renderProjects();
    });
  });
});

async function init() {
  try {
    const res = await fetch(API_BASE + "/api/session", { credentials: "include" });
    const data = await res.json();
    currentUser = data.user;
  } catch (err) { currentUser = null; }

  setTopbar();

  if (currentUser && currentUser.role === "admin") {
    const formCard = document.getElementById("admin-project-form-card");
    if (formCard) formCard.style.display = "block";
    const form = document.getElementById("admin-add-project-form");
    if (form) form.addEventListener("submit", handleAddProject);
  }

  loadProjects();
}

function setTopbar() {
  const el = document.getElementById("topbar-actions");
  if (!el) return;
  if (!currentUser) {
    el.innerHTML = "<a href=\"login.html\" class=\"btn btn-ghost\">Log In</a><a href=\"register.html\" class=\"btn btn-primary\">Create Account</a>";
  } else {
    el.innerHTML = "<span class=\"role-badge\">" + escapeHtml(currentUser.role) + "</span><a href=\"index.html\" class=\"btn btn-ghost\">Dashboard</a>";
  }
}

async function loadProjects() {
  try {
    const res = await fetch(API_BASE + "/api/projects");
    if (!res.ok) throw new Error("Request failed: " + res.status);
    allProjects = await res.json();
  } catch (err) {
    console.warn("Projects unavailable:", err.message);
    allProjects = [];
  }
  renderProjects();
}

function statusLabel(status) {
  const labels = { completed: "Completed", testing: "Testing", in_progress: "In Progress", planning: "Planning" };
  return labels[status] || status;
}

function renderProjects() {
  const grid = document.getElementById("project-grid");
  const searchInput = document.getElementById("project-search");
  const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

  let filtered = allProjects.filter(p => {
    const matchesStatus = activeStatus === "All" || p.status === activeStatus;
    const haystack = (p.title + " " + (p.summary || "") + " " + (p.client_name || "") + " " + (p.tags || "")).toLowerCase();
    const matchesSearch = haystack.includes(query);
    return matchesStatus && matchesSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = "<div class=\"empty-state\">No projects match right now. Try a different search or filter.</div>";
    return;
  }

  grid.innerHTML = filtered.map(projectCardHtml).join("");

  grid.querySelectorAll(".project-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => handleDeleteProject(btn));
  });
  grid.querySelectorAll(".project-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(Number(btn.dataset.projectId)));
  });
}

function projectCardHtml(p) {
  const imageHtml = p.image_filename
    ? "<div class=\"project-card__image-wrap\"><img class=\"project-card__image\" src=\"" + escapeHtml(p.image_filename) + "\" alt=\"" + escapeHtml(p.title) + "\"></div>"
    : "<div class=\"project-card__image-placeholder\">Spark Technologies</div>";

  const tagsHtml = p.tags
    ? "<div class=\"project-tags\">" + p.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => "<span class=\"project-tag\">" + escapeHtml(t) + "</span>").join("") + "</div>"
    : "";

  const dateLabel = p.completed_on
    ? new Date(p.completed_on).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : new Date(p.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  const isAdmin = currentUser && currentUser.role === "admin";
  const adminButtons = isAdmin
    ? "<div class=\"project-admin-actions\">" +
        "<button class=\"btn btn-ghost project-edit-btn\" data-project-id=\"" + p.id + "\">Edit</button>" +
        "<button class=\"btn btn-ghost project-delete-btn\" data-project-id=\"" + p.id + "\" data-project-title=\"" + escapeHtml(p.title) + "\">Delete</button>" +
      "</div>"
    : "";

  return (
    "<div class=\"project-card\">" +
      imageHtml +
      "<div class=\"project-card__body\">" +
        "<div class=\"project-card__top\">" +
          "<h3>" + escapeHtml(p.title) + "</h3>" +
          "<span class=\"project-status-badge " + p.status + "\">" + statusLabel(p.status) + "</span>" +
        "</div>" +
        (p.client_name ? "<div class=\"project-card__client\">Client: " + escapeHtml(p.client_name) + "</div>" : "") +
        "<p class=\"project-summary\">" + escapeHtml(p.summary || "") + "</p>" +
        tagsHtml +
        "<div class=\"project-card__footer\">" +
          "<span>" + dateLabel + "</span>" +
          adminButtons +
        "</div>" +
      "</div>" +
    "</div>"
  );
}

/* ---------- Edit modal: calm, unhurried editing, isolated from live refresh ---------- */
function openEditModal(projectId) {
  const p = allProjects.find(pr => pr.id === projectId);
  if (!p) return;
  editingProjectId = projectId;

  const statusOptions = ["planning", "in_progress", "testing", "completed"].map(s =>
    "<option value=\"" + s + "\"" + (s === p.status ? " selected" : "") + ">" + statusLabel(s) + "</option>"
  ).join("");

  const overlay = document.createElement("div");
  overlay.className = "project-modal-overlay";
  overlay.id = "project-edit-overlay";
  overlay.innerHTML =
    "<div class=\"project-modal\">" +
      "<div class=\"project-modal__head\">" +
        "<h3>Edit project</h3>" +
        "<button type=\"button\" class=\"project-modal-close\" aria-label=\"Close\">&times;</button>" +
      "</div>" +
      "<form class=\"project-edit-form\" id=\"project-edit-form\">" +
        "<label>Title<input type=\"text\" class=\"project-title-input\" value=\"" + escapeHtml(p.title) + "\" required></label>" +
        "<label>Client name (optional)<input type=\"text\" class=\"project-client-input\" value=\"" + escapeHtml(p.client_name || "") + "\"></label>" +
        "<div class=\"project-modal-row\">" +
          "<label>Status<select class=\"project-status-select\" required>" + statusOptions + "</select></label>" +
          "<label>Completion date<input type=\"date\" class=\"project-date-input\" value=\"" + (p.completed_on ? p.completed_on.substring(0, 10) : "") + "\"></label>" +
        "</div>" +
        "<label>Tags, comma separated<input type=\"text\" class=\"project-tags-input\" value=\"" + escapeHtml(p.tags || "") + "\"></label>" +
        "<label>Summary<textarea class=\"project-summary-input\" rows=\"5\">" + escapeHtml(p.summary || "") + "</textarea></label>" +
        (p.image_filename ? "<div class=\"project-modal-current-image\"><img src=\"" + escapeHtml(p.image_filename) + "\" alt=\"\"><label class=\"project-remove-image-label\"><input type=\"checkbox\" class=\"project-remove-image-checkbox\"> Remove this image</label></div>" : "") +
        "<label>" + (p.image_filename ? "Replace image (optional)" : "Add an image (optional)") + "<input type=\"file\" class=\"project-image-input\" accept=\"image/*\"></label>" +
        "<div class=\"project-modal-actions\">" +
          "<button type=\"button\" class=\"btn btn-ghost\" id=\"project-edit-cancel\">Cancel</button>" +
          "<button type=\"submit\" class=\"btn btn-primary\">Save changes</button>" +
        "</div>" +
      "</form>" +
    "</div>";

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const closeModal = () => {
    overlay.remove();
    document.body.style.overflow = "";
    editingProjectId = null;
  };

  overlay.querySelector(".project-modal-close").addEventListener("click", closeModal);
  overlay.querySelector("#project-edit-cancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  const escHandler = (e) => {
    if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", escHandler); }
  };
  document.addEventListener("keydown", escHandler);

  overlay.querySelector("#project-edit-form").addEventListener("submit", (e) => handleEditProject(e, projectId, closeModal));
}

async function handleEditProject(e, projectId, closeModal) {
  e.preventDefault();
  const form = e.target;
  const title = form.querySelector(".project-title-input").value.trim();
  const client_name = form.querySelector(".project-client-input").value.trim();
  const status = form.querySelector(".project-status-select").value;
  const completed_on = form.querySelector(".project-date-input").value;
  const tags = form.querySelector(".project-tags-input").value.trim();
  const summary = form.querySelector(".project-summary-input").value.trim();
  const fileInput = form.querySelector(".project-image-input");
  const removeCheckbox = form.querySelector(".project-remove-image-checkbox");
  const btn = form.querySelector("button[type=submit]");
  if (!title) return;

  const formData = new FormData();
  formData.append("title", title);
  formData.append("client_name", client_name);
  formData.append("status", status);
  formData.append("completed_on", completed_on);
  formData.append("tags", tags);
  formData.append("summary", summary);
  if (fileInput.files[0]) formData.append("image", fileInput.files[0]);
  if (removeCheckbox && removeCheckbox.checked) formData.append("remove_image", "true");

  btn.disabled = true; btn.textContent = "Saving...";
  try {
    const res = await fetch(API_BASE + "/api/admin/projects/" + projectId + "/edit", { method: "POST", credentials: "include", body: formData });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not save changes."); btn.disabled = false; btn.textContent = "Save changes"; return; }
    closeModal();
    loadProjects();
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Save changes"; }
}

async function handleAddProject(e) {
  e.preventDefault();
  const form = e.target;
  const title = form.querySelector(".project-title-input").value.trim();
  const client_name = form.querySelector(".project-client-input").value.trim();
  const status = form.querySelector(".project-status-select").value;
  const completed_on = form.querySelector(".project-date-input").value;
  const tags = form.querySelector(".project-tags-input").value.trim();
  const summary = form.querySelector(".project-summary-input").value.trim();
  const fileInput = form.querySelector(".project-image-input");
  const btn = form.querySelector("button");

  if (!title) return;

  const formData = new FormData();
  formData.append("title", title);
  formData.append("client_name", client_name);
  formData.append("status", status);
  formData.append("completed_on", completed_on);
  formData.append("tags", tags);
  formData.append("summary", summary);
  if (fileInput.files[0]) formData.append("image", fileInput.files[0]);

  btn.disabled = true; btn.textContent = "Posting...";
  try {
    const res = await fetch(API_BASE + "/api/admin/projects/create", { method: "POST", credentials: "include", body: formData });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not post the project."); btn.disabled = false; btn.textContent = "Post project"; return; }
    form.reset();
    btn.disabled = false; btn.textContent = "Post project";
    loadProjects();
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Post project"; }
}

async function handleDeleteProject(btn) {
  if (!confirm("Delete \"" + btn.dataset.projectTitle + "\"? This cannot be undone.")) return;
  btn.disabled = true; btn.textContent = "Deleting...";
  try {
    const res = await fetch(API_BASE + "/api/admin/projects/" + btn.dataset.projectId, { method: "DELETE", credentials: "include" });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not delete the project."); btn.disabled = false; btn.textContent = "Delete"; return; }
    loadProjects();
  } catch (err) { alert("Could not reach the server."); btn.disabled = false; btn.textContent = "Delete"; }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}





